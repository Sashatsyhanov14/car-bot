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

async function scheduleFollowup(userId, lang) {
    const delayTextRu = `Спасибо за бронирование! Желаю Вам отличного путешествия! ✈️\n\nРекомендуем установить приложение eMedeo — цифровую платформу с прозрачными ценами, отзывами и поддержкой 24/7. Получайте трансфер, аренду авто/жилья, экскурсии, покупки и юридические консультации напрямую, без посредников.\n\nМы рядом, если что-то пойдёт не так: чат поддержки 24/7\n\nНаше приложение:\nAndroid: https://play.google.com/store/apps/details?id=com.emedeo.codeware\nIOS: https://apps.apple.com/app/emedeo/id6738978452`;
    setTimeout(async () => {
        const delayText = await getLocalizedText(lang, delayTextRu);
        try {
            const photoUrl = 'https://drive.google.com/uc?export=view&id=1zxDZ_QkKYu6VKFlS7nNlRktlLKLxSx47';
            await bot.telegram.sendPhoto(userId, photoUrl, { caption: delayText });
        } catch (err) {
            try { await bot.telegram.sendMessage(userId, delayText, { disable_web_page_preview: true }); } catch (e) { }
        }
    }, 2 * 60 * 1000);
}

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

        // --- НАЧИСЛЕНИЕ РЕФЕРАЛУ (15%) ---
        try {
            const { data: buyer } = await supabase.from('users').select('referrer_id').eq('telegram_id', request.user_id).single();
            if (buyer && buyer.referrer_id && request.price_rub) {
                const reward = Math.round((parseFloat(request.price_rub) * 0.15) * 100) / 100;
                const { data: refUser } = await supabase.from('users').select('balance').eq('telegram_id', buyer.referrer_id).single();
                const newBalance = Math.round(((refUser?.balance || 0) + reward) * 100) / 100;
                await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', buyer.referrer_id);
                try {
                    const refLang = userLangCache[buyer.referrer_id] || 'ru';
                    const refRu = `💰 Вам начислено ${reward}₽ (15% от заявки)! Ваш новый баланс: ${newBalance}₽`;
                    const refMsg = await getLocalizedText(refLang, refRu);
                    await bot.telegram.sendMessage(buyer.referrer_id, refMsg);
                } catch (e) { }
            }
        } catch (e) { console.error('Referral payout error:', e.message); }

        // Расписание отправки Промо Приложения (через 2 мин)
        await scheduleFollowup(request.user_id, lang);

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

bot.on('message', async (ctx, next) => {
    if (ctx.message?.web_app_data) {
        const data = ctx.message.web_app_data.data;
        if (data === '/ref') {
            const telegramId = ctx.from.id;
            const lang = userLangCache[telegramId] || 'ru';
            const refLink = `https://t.me/${ctx.botInfo.username}?start=${telegramId}`;
            const texts = {
                ru: `🎁 Ваша реферальная ссылка:\n\n${refLink}\n\nТвой промокод (для ввода вручную): \`${telegramId}\``,
                tr: `🎁 Davet linkiniz:\n\n${refLink}\n\nPromosyon kodu: \`${telegramId}\``,
                en: `🎁 Your referral link:\n\n${refLink}\n\nPromo code (manual entry): \`${telegramId}\``
            };
            const text = texts[lang] || texts.en;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(refLink)}&margin=10`;
            try { await ctx.replyWithPhoto(qrUrl, { caption: text, parse_mode: 'Markdown' }); } 
            catch (err) { await ctx.reply(text, { parse_mode: 'Markdown' }); }
        }
        return;
    }
    return next();
});

bot.on('text', async (ctx) => {
    const telegramId = ctx.from.id;
    const userText = ctx.message.text.trim();
    const langInfo = userLangCache[telegramId] || 'ru';
    
    // --- PROMO CODE LOGIC ---
    let { data: currUser } = await getUser(telegramId);
    if (currUser && !currUser.referrer_id && /^\d{6,15}$/.test(userText)) {
        const promoId = parseInt(userText);
        if (promoId !== telegramId) {
            const { data: promoUser } = await getUser(promoId);
            if (promoUser) {
                await supabase.from('users').update({ referrer_id: promoId }).eq('telegram_id', telegramId);
                const successRu = '✅ Промокод успешно применен! Спасибо.\n\nА теперь подскажите, маршрут поездки или аренду? 🗺️';
                const successText = await getLocalizedText(langInfo, successRu);
                return ctx.reply(successText);
            }
        }
        const failRu = '❌ Неверный или недействительный промокод.';
        const failText = await getLocalizedText(langInfo, failRu);
        return ctx.reply(failText);
    }

    // --- AI ЧАТ ---
    const { data: history } = await getHistory(telegramId);
    const { data: faqRows } = await getFaq();
    const faqText = faqRows ? faqRows.map(f => `- ${f.topic}: ${f.content_ru}`).join('\n') : '';

    await saveMessage(telegramId, 'user', userText);
    try { await ctx.sendChatAction('typing'); } catch (e) { }

    const aiResponse = await getChatResponse(faqText, history, userText);

    const langMatch = aiResponse.match(/\[LANG:\s*(ru|tr|en)\]/i);
    if (langMatch) userLangCache[telegramId] = langMatch[1].toLowerCase();

    // Парсинг Base64 данных собранных нейросетью
    const bookMatch = aiResponse.match(/\[BOOK_REQUEST:(car|transfer):([a-zA-Z0-9_-]+):([a-zA-Z0-9+/=]+)\]/i);
    let finalResponse = aiResponse.replace(/\[BOOK_REQUEST:.*?\]/gi, '').replace(/\[LANG:.*?\]/gi, '').trim();

    if (bookMatch) {
        const serviceType = bookMatch[1];
        const itemId = bookMatch[2];
        const collectedData = JSON.parse(Buffer.from(bookMatch[3], 'base64').toString('utf-8'));

        let selectedItem;
        if (serviceType === 'car') {
            const { data: cars } = await supabase.from('cars').select('*');
            selectedItem = cars?.find(c => c.id === itemId);
        } else if (serviceType === 'transfer') {
            const { data: transfers } = await supabase.from('transfers').select('*');
            selectedItem = transfers?.find(t => t.id === itemId);
        }

        const { data: order } = await createRequest(
            telegramId,
            null, 
            selectedItem ? (selectedItem.title || selectedItem.car_info) : 'Услуга',
            collectedData.fullName || '—',
            collectedData.tourDate || '—',
            collectedData.pickupLocation || '—',
            selectedItem ? (selectedItem.price_rub || selectedItem.price || selectedItem.price_per_day) : 0,
            {
                service_type: serviceType,
                car_id: serviceType === 'car' ? itemId : null,
                transfer_id: serviceType === 'transfer' ? itemId : null,
                pickup_location: collectedData.pickupLocation || '—',
                destination: collectedData.destination || '—',
                passengers_count: collectedData.passengersCount ? parseInt(collectedData.passengersCount) : null
            }
        );

        const aiReport = await getManagerReport(currUser || {telegram_id: telegramId}, history, selectedItem, collectedData);

        const thanksMsg = await getLocalizedText(langInfo, `✅ Отличный выбор! Ваша заявка отправлена. Скоро мы свяжемся с вами для подтверждения. 🙌`);
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
                    try {
                        await bot.telegram.sendMessage(m.telegram_id, aiReport.replace(/[\*_`\[\]()]/g, ''), {
                            ...Markup.inlineKeyboard([[
                                Markup.button.callback('✅ Принять', `accept_req_${order.id}`),
                                Markup.button.callback('❌ Отклонить', `cancel_req_${order.id}`)
                            ]])
                        });
                    } catch (e2) {}
                }
            }
        }
        
        await saveMessage(telegramId, 'assistant', finalResponse);
        return;
    }

    await saveMessage(telegramId, 'assistant', finalResponse);
    await ctx.reply(finalResponse, { parse_mode: 'Markdown' });
});


// Запуск (всегда Long Polling на VPS)
if (!process.env.VERCEL) {
    bot.launch().then(() => console.log('Car & Transfer Bot is running...'));
}

module.exports = bot;
