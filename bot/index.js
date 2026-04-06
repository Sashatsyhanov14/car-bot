const { Telegraf, session, Markup } = require('telegraf');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const { supabase, getUser, createUser, getCars, getTransfers, saveMessage, getHistory, createRequest, getFaq, clearHistory } = require('./src/supabase');
const { getChatResponse, getLocalizedText } = require('./src/openai');

dotenv.config({ path: path.resolve(__dirname, './.env') });

const bot = new Telegraf(process.env.BOT_TOKEN);
const MANAGER_ID = parseInt(process.env.MANAGER_ID);

// Cache systems
const userLangCache = {};
const userQrBtnCache = {}; 
const lastShownItem = {}; 
const userStates = new Map(); // Legacy, kept for compatibility if needed elsewhere

// QR keywords for detection
const QR_KEYWORDS = ['qr', 'промокод', 'promo', 'refer', 'реферал', 'benim qr', 'qrcode'];

// Helper to escape special characters for Telegram Markdown
const esc = (str) => {
    if (!str) return '—';
    return String(str).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
};

bot.use(session());

// Debug logging
bot.use(async (ctx, next) => {
    if (ctx.message) {
        const type = ctx.message.web_app_data ? 'WEB_APP_DATA' : (ctx.message.text ? 'TEXT' : 'OTHER');
        console.log(`[DEBUG_TOP] Message from ${ctx.from?.id}: ${type}`);
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
            ctx.callbackQuery.message.text + `\n\n✅ ПРИНЯТО: @${ctx.from.username || managerId}`,
            Markup.inlineKeyboard([])
        );

        const lang = userLangCache[request.user_id] || 'ru';
        const msgRu = `Ваша заявка на «${request.excursion_title}» принята в работу. Оператор свяжется с вами в ближайшее время.`;
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
            ctx.callbackQuery.message.text + `\n\n❌ ОТКЛОНЕНО: @${ctx.from.username || managerId}`,
            Markup.inlineKeyboard([])
        );
    } catch (e) { }

    await ctx.answerCbQuery('Заявка отклонена.');
});

// --- CLIENT ACTIONS ---
bot.action(/^start_chat_book_(.+)$/, async (ctx) => {
    const telegramId = ctx.from.id;
    const itemId = ctx.match[1];
    
    const { data: cars } = await getCars();
    const { data: transfers } = await getTransfers();
    const items = [...(cars || []), ...(transfers || [])];
    const selected = items.find(i => i.id === itemId);
    
    if (!selected) return ctx.answerCbQuery('Услуга не найдена.', { show_alert: true });

    const lang = userLangCache[telegramId] || 'ru';
    const msgRu = `Отличный выбор! Я помогу с бронированием. Пожалуйста, напишите ваше Имя, желаемую Дату и Телефон прямо здесь в чате.`;
    const msg = await getLocalizedText(lang, msgRu);
    
    await ctx.answerCbQuery();
    return ctx.reply(msg);
});

bot.action('cancel_stepper', async (ctx) => {
    userStates.delete(ctx.from.id);
    const lang = userLangCache[ctx.from.id] || 'ru';
    const msg = await getLocalizedText(lang, 'Бронирование отменено.');
    await ctx.answerCbQuery();
    return ctx.editMessageText(msg);
});

// --- CORE LOGIC ---
bot.start(async (ctx) => {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const startPayload = ctx.payload;

    try {
        console.log(`[START] Triggered for ${username} (${telegramId})`);

        if (startPayload && startPayload.startsWith('getqr_')) {
            const lang = userLangCache[telegramId] || ctx.from.language_code || 'ru';
            const botUsername = ctx.botInfo?.username || 'emedeorentacat_bot';
            const refLink = `https://t.me/${botUsername}?start=${telegramId}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(refLink)}&margin=15&bgcolor=ffffff`;
            const captionRu = `Link: \`${refLink}\` \nPromo: \`${telegramId}\` \n\nПоделитесь QR или промокодом — получайте бонусы за каждого друга.`;
            const caption = await getLocalizedText(lang, captionRu);
            try { await ctx.replyWithPhoto(qrUrl, { caption, parse_mode: 'Markdown' }); } catch { await ctx.reply(caption, { parse_mode: 'Markdown' }); }
            return;
        }

        userStates.delete(telegramId);
        await clearHistory(telegramId);

        let { data: user } = await getUser(telegramId);
        if (!user) {
            const rId = startPayload && !isNaN(startPayload) ? parseInt(startPayload) : null;
            const { data: newUser } = await createUser({
                telegram_id: telegramId,
                username: username,
                role: 'user',
                referrer_id: (rId && rId !== telegramId) ? rId : null,
                balance: 0,
                language_code: ctx.from.language_code || 'ru'
            });
            user = newUser;
        }

        const lang = userLangCache[telegramId] || ctx.from.language_code || 'ru';
        userLangCache[telegramId] = lang;

        const welcomeRu = `Привет, ${username}. Я твой персональный помощник. Помогу выбрать лучший автомобиль для аренды или организовать комфортный трансфер. В какую сторону смотрим?`;
        const welcomeText = await getLocalizedText(lang, welcomeRu);
        const webappBtn = await getLocalizedText(lang, 'Открыть Каталог');

        await ctx.reply(welcomeText,
            Markup.keyboard([[Markup.button.webApp(webappBtn, `${process.env.WEBAPP_URL || ''}?uid=${telegramId}`)]]).resize()
        );
    } catch (err) { console.error('[START] Error:', err.message); }
});

bot.on('message', async (ctx, next) => {
    if (ctx.message?.web_app_data) {
        await handleWebAppData(ctx, ctx.message.web_app_data.data);
        return;
    }
    return next();
});

async function handleWebAppData(ctx, dataStr) {
    const telegramId = ctx.from?.id;
    const lang = userLangCache[telegramId] || 'ru';
    try {
        const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
        if (data.type === 'quick_book') {
            const { itemTitle, fullName, phone, date, from, price } = data;
            const orderId = crypto.randomUUID();
            const { data: order } = await supabase.from('requests').insert([{
                id: orderId, user_id: telegramId, excursion_title: itemTitle, full_name: fullName, 
                tour_date: date, hotel_name: from || '—', price_usd: price || 0, status: 'new'
            }]).select().single();

            if (order) {
                const reportRu = `НОВАЯ ЗАЯВКА (КАТАЛОГ)\n\nМашина: ${esc(itemTitle)}\nКлиент: ${esc(fullName)}\nТелефон: ${esc(phone)}\nДата: ${esc(date)}\nМесто: ${esc(from)}`;
                const report = await getLocalizedText('ru', reportRu);
                const { data: managers } = await supabase.from('users').select('telegram_id').in('role', ['founder', 'manager']);
                if (managers) {
                    for (const m of managers) {
                        try { 
                            await bot.telegram.sendMessage(m.telegram_id, report, {
                                ...Markup.inlineKeyboard([[Markup.button.callback('Принять', `accept_req_${orderId}`), Markup.button.callback('Отклонить', `cancel_req_${orderId}`)]])
                            }); 
                        } catch (e) {}
                    }
                }
            }
            const successMsg = await getLocalizedText(lang, 'Заявка отправлена. Менеджер свяжется с вами в ближайшее время.');
            return ctx.reply(successMsg);
        }
    } catch (e) { console.error('[WEBAPP_DATA] Error:', e.message); }
}

bot.on('text', async (ctx) => {
    const telegramId = ctx.from.id;
    const userText = ctx.message.text.trim();

    // QR Keywords
    if (QR_KEYWORDS.some(kw => userText.toLowerCase().includes(kw))) {
        const lang = userLangCache[telegramId] || 'ru';
        const botUsername = ctx.botInfo?.username || 'emedeorentacat_bot';
        const refLink = `https://t.me/${botUsername}?start=${telegramId}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(refLink)}&margin=15&bgcolor=ffffff`;
        const caption = await getLocalizedText(lang, `Ваша ссылка: \`${refLink}\` \nВаш промокод: \`${telegramId}\``);
        try { await ctx.replyWithPhoto(qrUrl, { caption, parse_mode: 'Markdown' }); } catch { await ctx.reply(caption, { parse_mode: 'Markdown' }); }
        return;
    }

    // Photo Request
    const PHOTO_KEYWORDS = ['фото', 'photo', 'фотографи', 'покажи', 'картинк', 'picture', 'image', 'resim', 'fotoğraf', 'görsel'];
    if (PHOTO_KEYWORDS.some(kw => userText.toLowerCase().includes(kw))) {
        const lang = userLangCache[telegramId] || 'ru';
        try { await ctx.sendChatAction('upload_photo'); } catch (e) {}
        const { data: cars } = await getCars();
        const { data: transfers } = await getTransfers();
        const items = [...(cars || []), ...(transfers || [])];
        let foundItem = items.find(i => i.id === lastShownItem[telegramId]);
        if (foundItem) {
            await sendItemPhotos(telegramId, foundItem);
            return ctx.reply(await getLocalizedText(lang, `Фотографии по вашему запросу.`));
        }
    }

    // AI Chat
    try {
        let { data: user } = await getUser(telegramId);
        const uiLang = userLangCache[telegramId] || ctx.from.language_code || 'ru';
        userLangCache[telegramId] = uiLang;

        await saveMessage(telegramId, 'user', userText);
        const { data: history } = await getHistory(telegramId, 15);
        const { data: cars } = await getCars();
        const { data: transfers } = await getTransfers();
        const { data: faqRows } = await getFaq();
        const faqText = faqRows ? faqRows.map(f => `- ${f.topic}: ${f.content_ru}`).join('\n') : '';

        try { await ctx.sendChatAction('typing'); } catch (e) {}

        const { finalMessage, analysis } = await getChatResponse(cars, transfers, faqText, history, userText);
        
        const bookMatch = finalMessage.match(/\[BOOK_REQUEST:\s*(car|transfer):([a-zA-Z0-9_-]+)\]/i);
        const langMatch = finalMessage.match(/\[LANG:\s*([a-z]{2})\]/i);
        const orderMatch = finalMessage.match(/\[ORDER_READY:\s*type:(car|trans)\s*\|\s*item:([a-zA-Z0-9_-]+)\s*\|\s*name:(.*?)\s*\|\s*date:(.*?)\s*\|\s*loc:(.*?)\s*\|\s*phone:(.*?)\s*\|\s*price:(.*?)\]/i);
        
        let finalResponse = finalMessage.replace(/\[BOOK_REQUEST:.*?\]/gi, '').replace(/\[LANG:.*?\]/gi, '').replace(/\[ORDER_READY:.*?\]/gi, '').trim();

        if (langMatch) {
            const newLang = langMatch[1].toLowerCase();
            if (userLangCache[telegramId] !== newLang) {
                userLangCache[telegramId] = newLang;
                await supabase.from('users').update({ language_code: newLang }).eq('telegram_id', telegramId).catch(() => {});
            }
        }

        if (bookMatch) {
            const itemId = bookMatch[2].trim();
            const serviceType = bookMatch[1].trim();
            const item = serviceType === 'car' ? (cars || []).find(c => c.id === itemId) : (transfers || []).find(t => t.id === itemId);
            if (item) {
                if (analysis.intent !== 'sale') await sendItemPhotos(telegramId, item);
                lastShownItem[telegramId] = itemId;
            }
        }

        if (orderMatch) {
            const [_, type, itemId, name, date, loc, phone, price] = orderMatch;
            const serviceType = type === 'car' ? 'car' : 'transfer';

            const item = serviceType === 'car' ? (cars || []).find(c => c.id === itemId) : (transfers || []).find(t => t.id === itemId);
            const displayTitle = item ? (item.brand ? `${item.brand} ${item.model}` : `${item.from_location} → ${item.to_location}`) : itemId;

            const { data: order } = await createRequest(
                telegramId, displayTitle,
                name.trim() || 'Чат-клиент', date.trim() || 'Через чат', loc.trim() || 'Через чат', 
                parseFloat(price) || 0, { phone: phone.trim(), serviceType, itemId }
            );

            if (order) {
                const report = `НОВАЯ ЗАЯВКА (ЧАТ)\n\nМашина: ${esc(displayTitle)}\nКлиент: @${esc(ctx.from.username || telegramId)}\nИмя: ${esc(name)}\nТелефон: ${esc(phone)}\nДата: ${esc(date)}\nМесто: ${esc(loc)}`;
                const { data: managers } = await supabase.from('users').select('telegram_id').in('role', ['founder', 'manager']);
                if (managers) {
                    for (const m of managers) {
                        try { await bot.telegram.sendMessage(m.telegram_id, report, {
                            ...Markup.inlineKeyboard([[Markup.button.callback('Принять', `accept_req_${order.id}`), Markup.button.callback('Отклонить', `cancel_req_${order.id}`)]])
                        }); } catch (e) {}
                    }
                }
            }
        }

        await saveMessage(telegramId, 'assistant', finalResponse || 'ОК');
        try { await ctx.reply(finalResponse || 'ОК', { parse_mode: 'Markdown' }); } catch { await ctx.reply(finalResponse || 'ОК'); }

    } catch (error) {
        console.error('[AI CHAT ERROR]:', error.message);
        await ctx.reply('Извините, техническая заминка. Попробуйте еще раз.');
    }
});

async function sendItemPhotos(telegramId, item) {
    const photos = (item.image_urls && Array.isArray(item.image_urls))
        ? item.image_urls.filter(url => url && url.startsWith('http'))
        : (item.image_url ? [item.image_url] : []);
    if (photos.length === 0) return;
    try {
        if (photos.length === 1) await bot.telegram.sendPhoto(telegramId, photos[0]);
        else await bot.telegram.sendMediaGroup(telegramId, photos.slice(0, 10).map(url => ({ type: 'photo', media: url })));
    } catch (e) { console.warn('[P_ERR]:', e.message); }
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
module.exports = bot;
