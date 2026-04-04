const { Telegraf, session, Markup } = require('telegraf');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { supabase, getUser, createUser, getCars, getTransfers, saveMessage, getHistory, createRequest, getFaq, clearHistory } = require('./src/supabase');
const { getChatResponse, getLocalizedText } = require('./src/openai');

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const MANAGER_ID = parseInt(process.env.MANAGER_ID);

// Кеш языков и состояний пользователей
const userLangCache = {};
const userQrBtnCache = {}; // cached translated QR button text per user
const lastShownItem = {}; // telegramId → itemId of last shown item
const userStates = new Map(); // { telegramId: { step: 'name'|'date'|'hotel', itemId, serviceType, data: {} } }

// QR button keywords for detection in any language
const QR_KEYWORDS = ['qr', 'промокод', 'promo', 'refer', 'реферал', 'benim qr', 'qrcode'];

bot.use(session());

// --- TOP-LEVEL DEBUG LOGGING ---
bot.use(async (ctx, next) => {
    if (ctx.message) {
        const type = ctx.message.web_app_data ? 'WEB_APP_DATA' : (ctx.message.text ? 'TEXT' : 'OTHER');
        console.log(`[DEBUG_TOP] Message from ${ctx.from?.id}: ${type}`);
        if (ctx.message.web_app_data) {
            console.log(`[DEBUG_TOP] Data: ${ctx.message.web_app_data.data}`);
        }
    }
    return next();
});

// --- MANAGER ACTIONS ---
bot.action(/^accept_req_(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const managerId = ctx.from.id;

    const { data: manager } = await getUser(managerId);
    if (!manager || (manager.role !== 'founder' && manager.role !== 'manager')) {
        return ctx.answerCbQuery('У вас нет прав.', { show_alert: true });
    }

    const { data: request } = await supabase.from('requests').select('*').eq('id', requestId).single();
    if (!request) return ctx.answerCbQuery('Заявка не найдена.', { show_alert: true });
    if (request.status !== 'new') return ctx.answerCbQuery('Заявка уже обработана.', { show_alert: true });

    await supabase.from('requests').update({ status: 'contacted', assigned_manager: managerId }).eq('id', requestId);

    try {
        await ctx.editMessageText(
            ctx.callbackQuery.message.text + `\n\nПРИНЯТО: @${ctx.from.username || managerId}`,
            Markup.inlineKeyboard([])
        );

        const lang = userLangCache[request.user_id] || 'ru';
        const msgRu = `Ваша заявка «${request.excursion_title}» принята в работу. Оператор свяжется с вами в ближайшее время.`;
        const msg = await getLocalizedText(lang, msgRu);
        await bot.telegram.sendMessage(request.user_id, msg);

    } catch (e) { console.error('Accept error:', e.message); }

    await ctx.answerCbQuery('Вы приняли заявку.');
});

bot.action(/^cancel_req_(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const managerId = ctx.from.id;

    const { data: manager } = await getUser(managerId);
    if (!manager || (manager.role !== 'founder' && manager.role !== 'manager')) {
        return ctx.answerCbQuery('У вас нет прав.', { show_alert: true });
    }

    await supabase.from('requests').update({ status: 'cancelled', assigned_manager: managerId }).eq('id', requestId);

    try {
        await ctx.editMessageText(
            ctx.callbackQuery.message.text + `\n\nОТКЛОНЕНО: @${ctx.from.username || managerId}`,
            Markup.inlineKeyboard([])
        );
    } catch (e) { }

    await ctx.answerCbQuery('Заявка отклонена.');
});

// Начисль бонусы рефереру за заявку
bot.action(/^bonus_req_(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const managerId = ctx.from.id;

    const { data: manager } = await getUser(managerId);
    if (!manager || (manager.role !== 'founder' && manager.role !== 'manager')) {
        return ctx.answerCbQuery('Простите, нет прав.', { show_alert: true });
    }

    const { data: request } = await supabase.from('requests').select('*').eq('id', requestId).single();
    if (!request) return ctx.answerCbQuery('Заявка не найдена.', { show_alert: true });

    try {
        // Начисление 1% рефереру покупателя
        const { data: buyer } = await supabase.from('users').select('referrer_id').eq('telegram_id', request.user_id).single();
        if (buyer?.referrer_id && request.price_rub) {
            const reward = Math.round(request.price_rub * 0.01);
            const { data: refUser } = await supabase.from('users').select('balance').eq('telegram_id', buyer.referrer_id).single();
            const newBalance = Math.round(((refUser?.balance || 0) + reward));
            await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', buyer.referrer_id);

            try {
                const refLang = userLangCache[buyer.referrer_id] || 'ru';
                const refRu = `Вам начислено $${reward} (1% от заявки на «${request.excursion_title}»)! Ваш баланс: $${newBalance}`;
                const refMsg = await getLocalizedText(refLang, refRu);
                await bot.telegram.sendMessage(buyer.referrer_id, refMsg);
            } catch (e) { }

            await ctx.editMessageText(
                ctx.callbackQuery.message.text + `\n\nБОНУС $${reward} начислен рефереру (ID: ${buyer.referrer_id})`,
                Markup.inlineKeyboard([])
            );
            await ctx.answerCbQuery(`Бонус $${reward} успешно начислен.`, { show_alert: true });
        } else {
            await ctx.answerCbQuery('У этого клиента нет реферера или не указана стоимость услуги.', { show_alert: true });
        }
    } catch (e) {
        console.error('Bonus action error:', e.message);
        await ctx.answerCbQuery('Ошибка при начислении.', { show_alert: true });
    }
});

bot.action(/^start_chat_book_(.+)$/, async (ctx) => {
    const telegramId = ctx.from.id;
    const itemId = ctx.match[1];
    
    const { data: cars } = await getCars();
    const { data: transfers } = await getTransfers();
    const items = [...(cars || []), ...(transfers || [])];
    const selected = items.find(i => i.id === itemId);
    
    if (!selected) return ctx.answerCbQuery('Услуга не найдена.', { show_alert: true });

    const serviceType = selected.brand ? 'car' : 'transfer';
    userStates.set(telegramId, { step: 'name', itemId, serviceType, data: {} });
    
    const lang = userLangCache[telegramId] || 'ru';
    const namePromptRu = `Оформим бронь! Как к вам можно обращаться? Напишите, пожалуйста, ваше ФИО.`;
    const namePrompt = await getLocalizedText(lang, namePromptRu);
    
    await ctx.answerCbQuery();
    return ctx.reply(namePrompt, Markup.inlineKeyboard([[Markup.button.callback('Отмена', 'cancel_stepper')]]));
});

bot.action('cancel_stepper', async (ctx) => {
    userStates.delete(ctx.from.id);
    const lang = userLangCache[ctx.from.id] || 'ru';
    const msg = await getLocalizedText(lang, 'Бронирование отменено. Если возникнут вопросы — я на связи.');
    await ctx.answerCbQuery('Отменено');
    return ctx.editMessageText(msg, Markup.inlineKeyboard([]));
});

// --- CLIENT FLOW ---
bot.start(async (ctx) => {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const startPayload = ctx.payload;

    try {
        console.log(`[START] Triggered for ${username} (${telegramId}), payload: ${startPayload}`);

        // --- QR DEEP LINK from WebApp button ---
        if (startPayload && startPayload.startsWith('getqr_')) {
            const lang = userLangCache[telegramId] || ctx.from.language_code || 'ru';
            const botUsername = ctx.botInfo?.username || 'Emedeotour_bot';
            const refLink = `https://t.me/${botUsername}?start=${telegramId}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(refLink)}&margin=15&bgcolor=ffffff`;
            const captionRu = `Link: \`${refLink}\` \nPromo: \`${telegramId}\` \n\nПоделитесь QR или промокодом — получайте 1$ за каждого друга.`;
            const caption = await getLocalizedText(lang, captionRu);
            try {
                await ctx.replyWithPhoto(qrUrl, { caption, parse_mode: 'Markdown' });
            } catch {
                await ctx.reply(caption, { parse_mode: 'Markdown' });
            }
            return;
        }

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

        const welcomeRu = `Привет, ${username}. Я твой персональный помощник. Помогу выбрать лучший автомобиль для аренды или организовать комфортный трансфер. В какую сторону смотрим? Напишите город или просто спросите, что у нас есть.`;
        const welcomeText = await getLocalizedText(lang, welcomeRu);

        const webappBtnRu = 'Открыть Каталог';
        const webappBtn = await getLocalizedText(lang, webappBtnRu);

        await ctx.reply(welcomeText,
            Markup.keyboard([
                [Markup.button.webApp(webappBtn, `${process.env.WEBAPP_URL || ''}?uid=${telegramId}`)]
            ]).resize()
        );
    } catch (err) {
        console.error('[START] Error:', err.message);
    }
});

bot.command('ref', async (ctx) => {
    const telegramId = ctx.from.id;
    const lang = userLangCache[telegramId] || 'ru';
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${telegramId}`;

    const textRu = `Ваша реферальная ссылка:\n\n${refLink}\n\nВаш промокод: \`${telegramId}\` \n\nПриглашайте друзей и получайте бонусы.`;
    const text = await getLocalizedText(lang, textRu);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(refLink)}&margin=10`;

    try {
        await ctx.replyWithPhoto(qrUrl, { caption: text, parse_mode: 'Markdown' });
    } catch (err) {
        await ctx.reply(text, { parse_mode: 'Markdown', disable_web_page_preview: true });
    }
});

// --- WEB APP DATA (sendData from mini-app buttons) ---
bot.on('message', async (ctx, next) => {
    const dataStr = ctx.message?.web_app_data?.data;
    if (dataStr) {
        console.log(`[WEB_APP_DATA_RECEIVED] From ${ctx.from?.id}: ${dataStr}`);
        await handleWebAppData(ctx, dataStr);
        return;
    }
    return next();
});

async function handleWebAppData(ctx, dataStr) {
    const telegramId = ctx.from?.id;
    const lang = userLangCache[telegramId] || 'ru';

    try {
        let data;
        try {
            data = JSON.parse(dataStr);
        } catch (jsonErr) {
            console.error(`[handleWebAppData] JSON Parse Error: ${jsonErr.message}`);
            return;
        }

        console.log(`[HANDLE_DATA] Type: ${data.type}`);
        
        // --- Quick Booking from Catalog ---
        if (data.type === 'quick_book') {
            const { serviceType, itemId, itemTitle, fullName, phone, date, price, from, to, passengers } = data;
            
            const orderId = crypto.randomUUID();
            const { error: insErr } = await supabase.from('requests').insert([{
                id: orderId,
                user_id: telegramId,
                excursion_title: itemTitle || (serviceType === 'car' ? 'Аренда авто' : 'Трансфер'),
                full_name: fullName,
                tour_date: date,
                hotel_name: from || '—',
                price_rub: price || 0,
                meta_data: { serviceType, itemId, to, passengers, phone },
                status: 'new',
                created_at: new Date().toISOString()
            }]);

            if (insErr) {
                console.error('[BOOKING_INSERT_ERROR]', insErr);
                return ctx.reply('Ошибка при сохранении заявки.');
            }

            // Notify Managers
            const reportRu = `НОВАЯ ЗАЯВКА\n\nУслуга: ${itemTitle}\nКлиент: ${fullName}\nТелефон: \`${phone}\` \nДата: ${date}${from ? ` \nОткуда: ${from}` : ''}${to ? ` \nКуда: ${to}` : ''}${passengers ? ` \nПассажиров: ${passengers}` : ''}\n\nЗаявка оформлена через Mini App.`;
            const report = await getLocalizedText('ru', reportRu);

            const { data: managers } = await supabase.from('users').select('telegram_id').in('role', ['founder', 'manager']);
            if (managers && managers.length > 0) {
                for (const m of managers) {
                    try { 
                        await bot.telegram.sendMessage(m.telegram_id, report, { 
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [
                                    Markup.button.callback('Принять', `accept_req_${orderId}`),
                                    Markup.button.callback('Отклонить', `cancel_req_${orderId}`)
                                ]
                            ])
                        }); 
                    } catch (e) {
                        try {
                            await bot.telegram.sendMessage(m.telegram_id, report.replace(/[\*_`\[\]()]/g, ''), {
                                ...Markup.inlineKeyboard([
                                    [
                                        Markup.button.callback('Принять', `accept_req_${orderId}`),
                                        Markup.button.callback('Отклонить', `cancel_req_${orderId}`)
                                    ]
                                ])
                            });
                        } catch (e2) { console.error(`[MANAGER_NOTIFY_ERROR] to ${m.telegram_id}: ${e2.message}`); }
                    }
                }
            } else {
                console.warn('[handleWebAppData] No managers found to notify.');
            }

            const successRu = 'Заявка отправлена. Менеджер свяжется с вами в ближайшее время. Спасибо.';
            const successMsg = await getLocalizedText(lang, successRu);
            return ctx.reply(successMsg, { parse_mode: 'Markdown' });
        }

        // --- DEAD CODE REMOVED (Excursion Translation) ---

        // --- Withdraw Request ---
        if (data.type === 'withdraw_request') {
            const { amount, method } = data;
            
            // 1. Get all managers and founders from the DB
            const { data: staff } = await supabase.from('users').select('telegram_id').in('role', ['manager', 'founder']);
            
            // 2. Prepare notification list (always include ADMIN_ID from .env just in case)
            const recipientIds = new Set((staff || []).map(s => s.telegram_id));
            if (process.env.ADMIN_ID) recipientIds.add(process.env.ADMIN_ID);
            if (process.env.MANAGER_ID) recipientIds.add(process.env.MANAGER_ID);

            const adminNotify = `ЗАПРОС НА ВЫВОД БОНУСОВ\n\nКлиент: @${ctx.from.username || 'unknown'} (\`${telegramId}\`)\nСумма: ${amount} $ \nРеквизиты: ${method} \n\nПожалуйста, проведите выплату и свяжитесь с клиентом.`;
            
            // 3. Broadcast to all recipients
            for (const mId of recipientIds) {
                try {
                    await ctx.telegram.sendMessage(mId, adminNotify, { parse_mode: 'Markdown' });
                } catch (e) {
                    console.error(`[WITHDRAW_BROADCAST_ERROR] to ${mId}:`, e.message);
                }
            }
            return;
        }
    } catch (e) {
        console.error(`[HANDLE_DATA_FATAL_ERROR] ${e.message}`, e);
    }
}

// Keep a minimal message event to not block other logic
bot.on('message', async (ctx, next) => {
    if (ctx.message?.web_app_data) return; // already handled
    console.log(`[INCOMING] From ${ctx.from.id}: ${ctx.message.text || 'non-text'}`);
    return next();
});

bot.on('text', async (ctx) => {
    const telegramId = ctx.from.id;
    const userText = ctx.message.text.trim();
    const state = userStates.get(telegramId);

    // --- QR BUTTON HANDLER ---
    const isQrRequest =
        (userQrBtnCache[telegramId] && userText === userQrBtnCache[telegramId]) ||
        QR_KEYWORDS.some(kw => userText.toLowerCase().includes(kw));

    if (isQrRequest) {
        const lang = userLangCache[telegramId] || 'ru';
        const botUsername = ctx.botInfo?.username || '';
        const refLink = `https://t.me/${botUsername}?start=${telegramId}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(refLink)}&margin=15&bgcolor=ffffff`;

        const captionRu = `Link: \`${refLink}\` \nPromo: \`${telegramId}\` \n\nПоделитесь этим QR или промокодом — и получайте бонусы за каждого друга.`;
        const caption = await getLocalizedText(lang, captionRu);

        try {
            await ctx.replyWithPhoto(qrUrl, { caption, parse_mode: 'Markdown' });
        } catch (e) {
            await ctx.reply(caption, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
        return;
    }
    // --- PHOTO REQUEST HANDLER ---
    const PHOTO_KEYWORDS = ['фото', 'photo', 'фотографи', 'покажи', 'картинк', 'picture', 'image', 'resim', 'fotoğraf', 'görsel'];
    const isPhotoRequest = PHOTO_KEYWORDS.some(kw => userText.toLowerCase().includes(kw)) && !state;

    if (isPhotoRequest) {
        const lang = userLangCache[telegramId] || 'ru';
        try { await ctx.sendChatAction('upload_photo'); } catch (e) {}

        // Find last mentioned item from cache or recent history
        const { data: cars } = await getCars();
        const { data: transfers } = await getTransfers();
        const items = [...(cars || []), ...(transfers || [])];
        let foundItem = null;

        // Check cache first (last item shown to this user)
        const cachedId = lastShownItem[telegramId];
        if (cachedId && items.length > 0) {
            foundItem = items.find(i => i.id === cachedId);
        }

        // Fallback: scan last bot messages for names
        if (!foundItem && items.length > 0) {
            const { data: history } = await getHistory(telegramId);
            const botMessages = (history || []).filter(m => m.role === 'assistant').slice(-5);
            for (const item of items) {
                const searchStr = item.brand ? `${item.brand} ${item.model}` : `${item.from_location} ${item.to_location}`;
                if (botMessages.some(m => m.content?.toLowerCase().includes(searchStr.toLowerCase()))) {
                    foundItem = item;
                    break;
                }
            }
        }

        if (foundItem) {
            await sendItemPhotos(telegramId, foundItem);
            const title = foundItem.brand ? `${foundItem.brand} ${foundItem.model}` : `${foundItem.from_location} → ${foundItem.to_location}`;
            const replyRu = `Фотографии по вашему запросу («${title}»).`;
            const reply = await getLocalizedText(lang, replyRu);
            await ctx.reply(reply);
        } else {
            const notFoundRu = `Напишите, что именно вас интересует — и я покажу фото.`;
            await ctx.reply(await getLocalizedText(lang, notFoundRu));
        }
        return;
    }

    // --- STATE MACHINE (Сбор данных заказа) ---
    if (state) {
        const lang = userLangCache[telegramId] || 'ru';
        
        // --- SMART ESCAPE: Если похоже на вопрос или смену темы ---
        const questionWords = ['как', 'где', 'что', 'когда', 'почему', 'сколько', 'цена', 'стоимость', 'далеко', 'какой', 'какие', 'есть', 'можно'];
        const lowerText = userText.toLowerCase();
        const isQuestion = 
            userText.includes('?') || 
            userText.length > 50 || 
            questionWords.some(w => lowerText.includes(w)) ||
            ['нет', 'отмена', 'не надо', 'передумал', 'погоди'].some(w => lowerText.includes(w));

        const cancelBtn = [Markup.button.callback('Отмена', 'cancel_stepper')];

        if (isQuestion) {
            userStates.delete(telegramId);
            // Проваливаемся ниже в AI чат
        } else {
            if (state.step === 'name') {
                state.data.fullName = userText;
                state.step = 'date';
                const msg = await getLocalizedText(lang, 'Отлично. Теперь напишите желаемую дату (например: завтра, 25 мая, или конкретный период):');
                return ctx.reply(msg, Markup.inlineKeyboard([cancelBtn]));
            }

            if (state.step === 'date') {
                state.data.tourDate = userText;
                state.step = 'hotel';
                const msg = await getLocalizedText(lang, 'Понял. Напишите ваш город и место встречи (или адрес, откуда вас забрать):');
                return ctx.reply(msg, Markup.inlineKeyboard([cancelBtn]));
            }

            if (state.step === 'hotel') {
                state.data.hotelName = userText;
                state.step = 'phone';
                const msg = await getLocalizedText(lang, 'Почти готово. Укажите номер WhatsApp для связи с оператором:');
                return ctx.reply(msg, Markup.inlineKeyboard([cancelBtn]));
            }

            if (state.step === 'phone') {
                state.data.phone = userText;
                const { serviceType, itemId } = state;

                let itemTitle = serviceType === 'car' ? 'Аренда авто' : 'Трансфер';
                let priceRub = 0;

                if (serviceType === 'car') {
                    const { data: car } = await supabase.from('cars').select('*').eq('id', itemId).single();
                    if (car) {
                        itemTitle = `${car.brand} ${car.model}`;
                        priceRub = car.price_per_day;
                    }
                } else {
                    const { data: trans } = await supabase.from('transfers').select('*').eq('id', itemId).single();
                    if (trans) {
                        itemTitle = `Трансфер: ${trans.from_location} -> ${trans.to_location}`;
                        priceRub = trans.price;
                    }
                }

                const { data: order } = await createRequest(
                    telegramId,
                    itemTitle,
                    state.data.fullName,
                    state.data.tourDate,
                    state.data.hotelName,
                    priceRub,
                    { phone: state.data.phone, serviceType, itemId }
                );

                userStates.delete(telegramId);

                const thanksRu = `Спасибо. Заявка на ${itemTitle} отправлена. Менеджер свяжется с вами по номеру ${userText} в ближайшее время.`;
                const thanksMsg = await getLocalizedText(lang, thanksRu);
                await ctx.reply(thanksMsg);

                // Notify managers
                const reportRu = `НОВАЯ ЗАЯВКА (ЧАТ)\n\nУслуга: ${itemTitle}\nКлиент: @${ctx.from.username || telegramId}\nФИО: ${state.data.fullName}\nТелефон: \`${state.data.phone}\` \nДата: ${state.data.tourDate}\nМесто: ${state.data.hotelName}`;
                const report = await getLocalizedText('ru', reportRu);

                const { data: managers } = await supabase.from('users').select('telegram_id').in('role', ['founder', 'manager']);
                if (managers) {
                    for (const m of managers) {
                        try {
                            await bot.telegram.sendMessage(m.telegram_id, report, {
                                parse_mode: 'Markdown',
                                ...Markup.inlineKeyboard([[
                                    Markup.button.callback('Принять', `accept_req_${order.id}`),
                                    Markup.button.callback('Отклонить', `cancel_req_${order.id}`)
                                ]])
                            });
                        } catch (e) { }
                    }
                }
                return;
            }
        }
    }

    // --- AI ЧАТ ---
    const username = ctx.from.username || ctx.from.first_name;

    try {
        let { data: user } = await getUser(telegramId);
        if (!user) {
            const { data: newUser } = await createUser({
                telegram_id: telegramId,
                username: ctx.from.username || ctx.from.first_name,
                role: 'user',
                balance: 0
            });
            user = newUser;
        }

        const systemLang = ctx.from.language_code || 'ru';
        if (!userLangCache[telegramId]) {
            userLangCache[telegramId] = systemLang;
        }
        const uiLang = userLangCache[telegramId];
        
        if (!user) {
            console.error('[AI_CHAT] User is null after check/create. Database might be unreachable.');
            const errRu = 'Извините, сейчас возникла проблема с подключением к базе данных. Попробуйте позже.';
            const errText = await getLocalizedText(uiLang, errRu);
            return ctx.reply(errText);
        }

        // --- PROMO CODE LOGIC ---
        if (!user.referrer_id && /^\d{6,15}$/.test(userText)) {
            const promoId = parseInt(userText);
            if (promoId !== telegramId) {
                const { data: promoUser } = await getUser(promoId);
                if (promoUser) {
                    await supabase.from('users').update({ referrer_id: promoId }).eq('telegram_id', telegramId);
                    user.referrer_id = promoId;

                    const successRu = 'Промокод успешно применён. Спасибо. А теперь расскажите, какой автомобиль или трансфер вас интересует?';
                    const successText = await getLocalizedText(uiLang, successRu);
                    return ctx.reply(successText);
                }
            }
            const failRu = 'Неверный или недействительный промокод.';
            const failText = await getLocalizedText(uiLang, failRu);
            return ctx.reply(failText);
        }

        await saveMessage(telegramId, 'user', userText);

        const { data: history } = await getHistory(telegramId);
        const { data: cars } = await getCars();
        const { data: transfers } = await getTransfers();
        const { data: faqRows } = await getFaq();

        const faqText = faqRows ? faqRows.map(f => `- ${f.topic}: ${f.content_ru}`).join('\n') : '';

        try { await ctx.sendChatAction('typing'); } catch (e) { }

        const aiResponse = await getChatResponse(cars, transfers, faqText, history, userText);

        const langMatch = aiResponse.match(/\[LANG:\s*(ru|tr|en)\]/i);
        if (langMatch) userLangCache[telegramId] = langMatch[1].toLowerCase();

        const bookMatch = aiResponse.match(/\[BOOK_REQUEST:\s*(car|transfer):([a-zA-Z0-9_-]+)\]/i);
        let finalResponse = aiResponse.replace(/\[BOOK_REQUEST:.*?\]/gi, '').replace(/\[LANG:.*?\]/gi, '').trim();

        if (bookMatch) {
            const serviceType = bookMatch[1].trim();
            const itemId = bookMatch[2].trim();
            
            // Start the stepper for gathering details
            userStates.set(telegramId, { step: 'name', serviceType, itemId, data: {} });
            
            const promptRu = `Отлично! Я помогу вам забронировать ${serviceType === 'car' ? 'автомобиль' : 'трансфер'}. Как к вам можно обращаться? Напишите ваше ФИО.`;
            const prompt = await getLocalizedText(userLangCache[telegramId] || 'ru', promptRu);
            
            await saveMessage(telegramId, 'assistant', finalResponse);
            try { await ctx.reply(finalResponse, { parse_mode: 'Markdown' }); } catch (e) { await ctx.reply(finalResponse); }
            return ctx.reply(prompt, Markup.inlineKeyboard([[Markup.button.callback('Отмена', 'cancel_stepper')]]));
        }

    if (!finalResponse || finalResponse.trim() === '') {
        finalResponse = 'Извините, я задумался. Повторите, пожалуйста, ваш вопрос.';
    }

    // Mentioned item check (to show photos even if not booking)
    const cleanText = finalResponse.toLowerCase();
    const mentionedCar = (cars || []).find(c => 
        (c.brand && cleanText.includes(c.brand.toLowerCase())) || 
        (c.model && cleanText.includes(c.model.toLowerCase()))
    );
    
    if (mentionedCar) {
        lastShownItem[telegramId] = mentionedCar.id;
        await sendItemPhotos(telegramId, mentionedCar);
    } else {
        const mentionedTrans = (transfers || []).find(t => 
            cleanText.includes(t.from_location.toLowerCase()) && 
            cleanText.includes(t.to_location.toLowerCase())
        );
        if (mentionedTrans) {
            lastShownItem[telegramId] = mentionedTrans.id;
            await sendItemPhotos(telegramId, mentionedTrans);
        }
    }

    await saveMessage(telegramId, 'assistant', finalResponse);
    try {
        await ctx.reply(finalResponse, { parse_mode: 'Markdown' });
    } catch (err) {
        await ctx.reply(finalResponse);
    }

    } catch (err) {
        console.error('CRITICAL AI CHAT ERROR:', err);
        try { await ctx.reply('Извините, произошла ошибка. Попробуйте позже.'); } catch (e) { }
    }
});

// Helper: send all photos of an item as album
async function sendItemPhotos(telegramId, item) {
    const photos = (item.image_urls && Array.isArray(item.image_urls))
        ? item.image_urls.filter(url => url && url.startsWith('http'))
        : (item.image_url ? [item.image_url] : []);

    if (photos.length === 0) return;

    try {
        if (photos.length === 1) {
            await bot.telegram.sendPhoto(telegramId, photos[0]);
        } else {
            const media = photos.slice(0, 10).map(url => ({ type: 'photo', media: url }));
            await bot.telegram.sendMediaGroup(telegramId, media);
        }
    } catch (e) {
        console.warn('[MediaGroup] Error:', e.message);
    }
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;
