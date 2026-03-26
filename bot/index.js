const { Telegraf, session, Markup } = require('telegraf');
const dotenv = require('dotenv');
const { supabase, getUser, createUser, getExcursions, saveMessage, getHistory, createRequest, getFaq, clearHistory } = require('./src/supabase');
const { getChatResponse, getLocalizedText, getManagerReport } = require('./src/openai');

const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const bot = new Telegraf(process.env.BOT_TOKEN);

// Кеш языков и состояний пользователей
const userLangCache = {};
const userStates = new Map(); // { telegramId: { step: 'name' | 'date' | 'hotel', excursionId: string, data: {} } }

bot.use(session());

// --- MANAGER ACTIONS ---
bot.action(/^accept_req_(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const managerId = ctx.from.id;

    const { data: manager } = await getUser(managerId);
    if (!manager || (manager.role !== 'founder' && manager.role !== 'manager')) {
        return ctx.answerCbQuery('❌ У вас нет прав.', { show_alert: true });
    }

    const { data: request } = await supabase.from('requests').select('*').eq('id', requestId).single();
    if (!request) return ctx.answerCbQuery('❌ Заявка не найдена.', { show_alert: true });
    if (request.status !== 'new') return ctx.answerCbQuery('⚠️ Заявка уже обработана.', { show_alert: true });

    await supabase.from('requests').update({ status: 'contacted', assigned_manager: managerId }).eq('id', requestId);

    try {
        await ctx.editMessageText(
            ctx.callbackQuery.message.text + `\n\n✅ ПРИНЯТО: @${ctx.from.username || managerId}`,
            Markup.inlineKeyboard([])
        );

        // Уведомление клиенту
        const lang = userLangCache[request.user_id] || 'ru';
        const msgRu = `✅ Ваша заявка «${request.excursion_title}» принята в работу! Оператор свяжется с вами в ближайшее время.`;
        const msg = await getLocalizedText(lang, msgRu);
        await bot.telegram.sendMessage(request.user_id, msg);

    } catch (e) { console.error('Accept error:', e.message); }

    await ctx.answerCbQuery('✅ Вы приняли заявку.');
});

bot.action(/^cancel_req_(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const managerId = ctx.from.id;

    const { data: manager } = await getUser(managerId);
    if (!manager || (manager.role !== 'founder' && manager.role !== 'manager')) {
        return ctx.answerCbQuery('❌ У вас нет прав.', { show_alert: true });
    }

    await supabase.from('requests').update({ status: 'cancelled', assigned_manager: managerId }).eq('id', requestId);

    try {
        await ctx.editMessageText(
            ctx.callbackQuery.message.text + `\n\n❌ ОТКЛОНЕНО: @${ctx.from.username || managerId}`,
            Markup.inlineKeyboard([])
        );
    } catch (e) { }

    await ctx.answerCbQuery('Заявка отклонена.');
});

// --- CLIENT FLOW ---
bot.start(async (ctx) => {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const startPayload = ctx.payload;

    userStates.delete(telegramId);
    await clearHistory(telegramId);

    let { data: user } = await getUser(telegramId);
    if (!user) {
        const referrerId = startPayload && !isNaN(startPayload) ? parseInt(startPayload) : null;
        const { data: newUser } = await createUser({
            telegram_id: telegramId,
            username: username,
            role: 'user',
            referrer_id: (referrerId && referrerId !== telegramId) ? referrerId : null,
            balance: 0
        });
        user = newUser;
    }

    const lang = ctx.from.language_code || 'ru';
    userLangCache[telegramId] = lang;

    const welcomeRu = `Привет, ${username}! 🚗\n\nЯ твой персональный помощник. Помогу выбрать лучший автомобиль для аренды или организовать комфортный трансфер.\n\nВ какую сторону смотрим? Напиши город или просто спроси, что у нас есть. 🗺️`;
    const welcomeText = await getLocalizedText(lang, welcomeRu);

    const webappBtnRu = '🎒 Открыть Каталог';
    const webappBtn = await getLocalizedText(lang, webappBtnRu);

    await ctx.reply(welcomeText,
        Markup.keyboard([
            [Markup.button.webApp(webappBtn, process.env.WEBAPP_URL || '')]
        ]).resize()
    );
});

bot.command('ref', async (ctx) => {
    const telegramId = ctx.from.id;
    const lang = userLangCache[telegramId] || 'ru';
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${telegramId}`;

    const texts = {
        ru: `🎁 Ваша реферальная ссылка:\n\n${refLink}\n\nПриглашайте друзей и получайте бонусы!`,
        tr: `🎁 Davet linkiniz:\n\n${refLink}\n\nArkadaşlarını davet et ve bonus kazan!`,
        en: `🎁 Your referral link:\n\n${refLink}\n\nInvite friends and get bonuses!`
    };
    const text = texts[lang] || texts.en;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(refLink)}&margin=10`;

    try {
        await ctx.replyWithPhoto(qrUrl, { caption: text });
    } catch (err) {
        await ctx.reply(text);
    }
});

bot.on('text', async (ctx) => {
    const telegramId = ctx.from.id;
    const userText = ctx.message.text.trim();
    const state = userStates.get(telegramId);

    // --- STATE MACHINE (Сбор данных заказа) ---
    if (state) {
        const lang = userLangCache[telegramId] || 'ru';

        if (state.step === 'name') {
            state.data.fullName = userText;
            state.step = 'date';
            const msg = await getLocalizedText(lang, '🗓️ Отлично! Теперь напишите желаемую дату (например: завтра, 25 мая, или конкретный период):');
            return ctx.reply(msg);
        }

        if (state.step === 'date') {
            state.data.tourDate = userText;
            if (state.serviceType === 'transfer') {
                state.step = 'pickup';
                const msg = await getLocalizedText(lang, '📍 Откуда вас забрать? (Например: Аэропорт, Отель)');
                return ctx.reply(msg);
            } else if (state.serviceType === 'car') {
                state.step = 'location';
                const msg = await getLocalizedText(lang, '🗺️ В каком городе/месте вам подать автомобиль?');
                return ctx.reply(msg);
            } else {
                state.step = 'hotel';
                const msg = await getLocalizedText(lang, '🏨 Понял. И последний шаг: напишите ваш город и название отеля (или адрес, откуда вас забрать):');
                return ctx.reply(msg);
            }
        }

        if (state.step === 'pickup') {
            state.data.pickupLocation = userText;
            state.step = 'destination';
            const msg = await getLocalizedText(lang, '🏁 Куда вас доставить?');
            return ctx.reply(msg);
        }

        if (state.step === 'destination') {
            state.data.destination = userText;
            state.step = 'passengers';
            const msg = await getLocalizedText(lang, '👥 Сколько будет пассажиров?');
            return ctx.reply(msg);
        }

        if (state.step === 'passengers') {
            state.data.passengersCount = userText;
            return finalizeOrder(ctx, state);
        }

        if (state.step === 'location' || state.step === 'hotel') {
            state.data.pickupLocation = userText;
            return finalizeOrder(ctx, state);
        }

        async function finalizeOrder(ctx, state) {
            const { serviceType, itemId, data } = state;
            let selectedItem;

            if (serviceType === 'car') {
                const { data: cars } = await supabase.from('cars').select('*');
                selectedItem = cars.find(c => c.id === itemId);
            } else if (serviceType === 'transfer') {
                const { data: transfers } = await supabase.from('transfers').select('*');
                selectedItem = transfers.find(t => t.id === itemId);
            }

            const { data: order } = await createRequest(
                telegramId,
                null, // excursion_id 
                selectedItem ? (selectedItem.title || selectedItem.car_info) : 'Услуга',
                state.data.fullName,
                state.data.tourDate,
                state.data.pickupLocation || '',
                selectedItem ? (selectedItem.price_rub || selectedItem.price || selectedItem.price_per_day) : 0,
                {
                    service_type: serviceType,
                    car_id: serviceType === 'car' ? itemId : null,
                    transfer_id: serviceType === 'transfer' ? itemId : null,
                    pickup_location: state.data.pickupLocation,
                    destination: state.data.destination,
                    passengers_count: state.data.passengersCount ? parseInt(state.data.passengersCount) : null
                }
            );

            const { data: user } = await getUser(telegramId);
            const { data: history } = await getHistory(telegramId, 10);
            const aiReport = await getManagerReport(user, history, selectedItem, state.data);

            userStates.delete(telegramId);
            const thanksRu = `✅ Спасибо! Ваша заявка отправлена оператору. Скоро мы свяжемся с вами для подтверждения деталей. 🙌`;
            const thanksMsg = await getLocalizedText(lang, thanksRu);
            await ctx.reply(thanksMsg);

            const { data: managers } = await supabase.from('users').select('telegram_id').in('role', ['founder', 'manager']);
            if (managers) {
                for (const m of managers) {
                    try {
                        await bot.telegram.sendMessage(m.telegram_id, aiReport, {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([[
                                Markup.button.callback('✅ Принять', `accept_req_${order.id}`),
                                Markup.button.callback('❌ Отклонить', `cancel_req_${order.id}`)
                            ]])
                        });
                    } catch (e) {
                        await bot.telegram.sendMessage(m.telegram_id, aiReport.replace(/[\*_`\[\]()]/g, ''), {
                            ...Markup.inlineKeyboard([[
                                Markup.button.callback('✅ Принять', `accept_req_${order.id}`),
                                Markup.button.callback('❌ Отклонить', `cancel_req_${order.id}`)
                            ]])
                        });
                    }
                }
            }
        }
    } else {
        // --- AI ЧАТ ---
        const { data: history } = await getHistory(telegramId);
        const { data: faqRows } = await getFaq();
        const faqText = faqRows ? faqRows.map(f => `- ${f.topic}: ${f.content_ru}`).join('\n') : '';

        await saveMessage(telegramId, 'user', userText);
        try { await ctx.sendChatAction('typing'); } catch (e) { }

        const aiResponse = await getChatResponse(faqText, history, userText);

        const langMatch = aiResponse.match(/\[LANG:\s*(ru|tr|en)\]/i);
        if (langMatch) userLangCache[telegramId] = langMatch[1].toLowerCase();

        const bookMatch = aiResponse.match(/\[BOOK_REQUEST:(car|transfer):([a-zA-Z0-9_-]+)\]/i);
        let finalResponse = aiResponse.replace(/\[BOOK_REQUEST:.*?\]/gi, '').replace(/\[LANG:.*?\]/gi, '').trim();

        if (bookMatch) {
            const serviceType = bookMatch[1];
            const itemId = bookMatch[2];
            userStates.set(telegramId, { step: 'name', serviceType, itemId, data: {} });

            const currentLang = userLangCache[telegramId] || 'ru';
            const namePromptRu = `Прекрасный выбор! 😍 Чтобы оформить заявку, мне нужно уточнить пару деталей.\n\n👤 Как к вам можно обращаться? Напишите, пожалуйста, ваше ФИО.`;
            const namePrompt = await getLocalizedText(currentLang, namePromptRu);

            await saveMessage(telegramId, 'assistant', finalResponse);
            await ctx.reply(finalResponse, { parse_mode: 'Markdown' });
            return ctx.reply(namePrompt);
        }

        await saveMessage(telegramId, 'assistant', finalResponse);
        await ctx.reply(finalResponse, { parse_mode: 'Markdown' });
    }
});


// Запуск
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    bot.launch().then(() => console.log('Car & Transfer Bot is running...'));
}

module.exports = bot;
