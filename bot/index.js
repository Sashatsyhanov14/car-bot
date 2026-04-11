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
const lastAnalysis = {}; 
const userStates = new Map();

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

    try {
        const { data: manager } = await getUser(managerId);
        if (!manager || (manager.role !== 'founder' && manager.role !== 'manager' && manager.role !== 'admin')) {
            return ctx.answerCbQuery('У вас нет прав.', { show_alert: true });
        }

        const { data: request } = await supabase.from('requests').select('*').eq('id', requestId).single();
        if (!request) return ctx.answerCbQuery('Заявка не найдена.', { show_alert: true });
        if (request.status !== 'new') return ctx.answerCbQuery('Заявка уже обработана.', { show_alert: true });

        await supabase.from('requests').update({ status: 'contacted', assigned_manager: managerId }).eq('id', requestId);

        await ctx.editMessageText(
            ctx.callbackQuery.message.text + `\n\n✅ ПРИНЯТО: @${ctx.from.username || managerId}`,
            Markup.inlineKeyboard([])
        );

        const lang = userLangCache[request.user_id] || 'ru';
        const msgRu = `Ваша заявка на «${request.excursion_title}» принята в работу. Оператор свяжется с вами в ближайшее время.`;
        const msg = await getLocalizedText(lang, msgRu);
        await bot.telegram.sendMessage(request.user_id, msg);

    } catch (e) { 
        console.error('Accept error:', e.message); 
        await ctx.answerCbQuery('Ошибка при обработке.');
    }
});

bot.action(/^cancel_req_(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const managerId = ctx.from.id;

    try {
        const { data: manager } = await getUser(managerId);
        if (!manager || (manager.role !== 'founder' && manager.role !== 'manager' && manager.role !== 'admin')) {
            return ctx.answerCbQuery('У вас нет прав.', { show_alert: true });
        }

        await supabase.from('requests').update({ status: 'cancelled', assigned_manager: managerId }).eq('id', requestId);

        await ctx.editMessageText(
            ctx.callbackQuery.message.text + `\n\n❌ ОТКЛОНЕНО: @${ctx.from.username || managerId}`,
            Markup.inlineKeyboard([])
        );
    } catch (e) { console.error('Cancel error:', e.message); }

    await ctx.answerCbQuery('Заявка отклонена.');
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
            
            const { data: user } = await getUser(telegramId);
            const { data: order, error: insErr } = await createRequest(
                telegramId, itemTitle || 'Заявка', fullName, date, from || '—', price || 0,
                { phone, serviceType: 'car' }, user?.referrer_id || null
            );

            if (order && order.id) {
                const savedOrderId = order.id;
                // Refresh analysis for catalog bookings if possible
                const { data: history } = await getHistory(telegramId, 5);
                const { data: cars } = await getCars();
                const { data: transfers } = await getTransfers();
                const faqRows = await getFaq();
                const faqText = faqRows?.data?.map(f => `- ${f.topic}: ${f.content_ru}`).join('\n') || '';
                
                // Get fresh analysis
                const aiResponse = await getChatResponse(cars, transfers, faqText, history || [], `[CATALOG_BOOKING: ${itemTitle}]`);
                const ai = aiResponse?.analysis?.analysis || lastAnalysis[telegramId] || { temperature: 'Warm', notes: 'Заявка из каталога', tip: 'Свяжитесь для подтверждения' };
                
                const report = `🚀 **NEW BOOKING REQUEST!** [КАТАЛОГ]\n\n🚗 **Авто**: ${esc(itemTitle)}\n💰 **Цена**: $${price}\n👤 **Client**: @${esc(ctx.from.username || '—')} (ID: ${telegramId})\n📝 **Full name**: ${esc(fullName)}\n📅 **Date**: ${esc(date)}\n📍 **Место**: ${esc(from)}\n📞 **WhatsApp**: ${esc(phone)}\n\n🔍 **Profile analysis**:\n- Temperature: ${ai.temperature || 'Warm'}\n- Notes: ${ai.notes || '—'}\n- Manager tip: ${ai.tip || '—'}\n\n⚠️ **Confirm the request in the system!**`;
                
                const { data: managers } = await supabase.from('users').select('telegram_id').in('role', ['founder', 'admin', 'manager']);
                const recipientIds = new Set(managers?.map(m => m.telegram_id).filter(id => !!id) || []);
                if (MANAGER_ID) recipientIds.add(MANAGER_ID);

                for (const mId of recipientIds) {
                    try { 
                        await bot.telegram.sendMessage(mId, report, {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.url('✉️ SEND MESSAGE', `tg://user?id=${telegramId}`)],
                                [Markup.button.callback('✅ Принять', `accept_req_${savedOrderId}`), Markup.button.callback('❌ Отклонить', `cancel_req_${savedOrderId}`)]
                            ]).resize()
                        }); 
                    } catch (e) { console.error(`[MANAGER_NOTIFY_ERROR] to ${mId}:`, e.message); }
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
        const refLink = `https://t.me/${ctx.botInfo?.username}?start=${telegramId}`;
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

    // --- AI ЧАТ ---
    try {
        let { data: user } = await getUser(telegramId);
        if (!user) {
            const { data: newUser } = await createUser({ telegram_id: telegramId, username: ctx.from.username || ctx.from.first_name, role: 'user' });
            user = newUser;
        }

        const uiLang = userLangCache[telegramId] || ctx.from.language_code || 'ru';
        userLangCache[telegramId] = uiLang;

        await saveMessage(telegramId, 'user', userText);
        const { data: history } = await getHistory(telegramId, 15);
        const { data: cars } = await getCars();
        const { data: transfers } = await getTransfers();
        const { data: faqRows } = await getFaq();
        const faqText = faqRows ? faqRows.map(f => `- ${f.topic}: ${f.content_ru}`).join('\n') : '';

        try { await ctx.sendChatAction('typing'); } catch (e) {}

        const response = await getChatResponse(cars, transfers, faqText, history, userText);
        const finalMessage = response?.finalMessage || '';
        const analysis = response?.analysis || { intent: 'consultation' };
        if (analysis?.analysis) lastAnalysis[telegramId] = analysis.analysis;
        
        const bookMatch = finalMessage.match(/\[BOOK_REQUEST:\s*(car|transfer):([a-zA-Z0-9_-]+)\]/i);
        const langMatch = finalMessage.match(/\[LANG:\s*([a-z]{2})\]/i);
        const orderMatch = finalMessage.match(/\[ORDER_READY:\s*type:(car|trans)\s*\|\s*item:([a-zA-Z0-9_-]+)\s*\|\s*name:(.*?)\s*\|\s*date:(.*?)\s*\|\s*phone:(.*?)\s*\|\s*price:(.*?)\]/i);
        
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
                if (analysis?.intent !== 'sale') await sendItemPhotos(telegramId, item);
                lastShownItem[telegramId] = itemId;
            }
        }

        if (orderMatch) {
            const [_, type, itemId, name, date, phone, price] = orderMatch;
            const serviceType = type === 'car' ? 'car' : 'transfer';

            const item = serviceType === 'car' ? (cars || []).find(c => c.id === itemId) : (transfers || []).find(t => t.id === itemId);
            const displayTitle = item ? (item.brand ? `${item.brand} ${item.model}` : `${item.from_location} → ${item.to_location}`) : itemId;

            // Fetch user and referrer for metadata
            const { data: user } = await getUser(telegramId);
            let referrerInfo = 'нет';
            if (user?.referrer_id) {
                const { data: referrer } = await getUser(user.referrer_id);
                referrerInfo = referrer ? `@${referrer.username || '—'} (${referrer.telegram_id})` : `${user.referrer_id}`;
            }

            const { data: order, error: reqErr } = await createRequest(
                telegramId, displayTitle, 
                name.trim() || 'Чат-клиент', date.trim() || 'Через чат', 'В чате', 
                parseFloat(price) || 0, { phone: phone.trim(), serviceType, itemId },
                user?.referrer_id || null
            );

            if (order && order.id) {
                const savedOrderId = order.id;
                const ai = lastAnalysis[telegramId] || { temperature: 'Warm', notes: 'Заявка из чата', tip: 'Уточните детали бронирования' };
                const report = `🚀 **NEW BOOKING REQUEST!** [ЧАТ]\n\n🚗 **Авто**: ${esc(displayTitle)}\n💰 **Цена**: $${price}\n👤 **Client**: @${esc(ctx.from.username || '—')} (ID: ${telegramId})\n📝 **Full name**: ${esc(String(name || '').trim())}\n📅 **Date**: ${esc(String(date || '').trim())}\n📍 **Место**: В чате\n📞 **WhatsApp**: ${esc(String(phone || '').trim())}\n\n🔍 **Profile analysis**:\n- Temperature: ${ai.temperature || 'Warm'}\n- Notes: ${ai.notes || '—'}\n- Manager tip: ${ai.tip || '—'}\n\n⚠️ **Confirm the request in the system!**`;
                
                const { data: managers } = await supabase.from('users').select('telegram_id').in('role', ['founder', 'manager', 'admin']);
                const recipientIds = new Set(managers?.map(m => m.telegram_id).filter(id => !!id) || []);
                if (MANAGER_ID) recipientIds.add(MANAGER_ID);

                for (const mId of recipientIds) {
                    try { 
                        await bot.telegram.sendMessage(mId, report, {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.url('✉️ SEND MESSAGE', `tg://user?id=${telegramId}`)],
                                [Markup.button.callback('✅ Принять', `accept_req_${savedOrderId}`), Markup.button.callback('❌ Отклонить', `cancel_req_${savedOrderId}`)]
                            ])
                        }); 
                    } catch (e) { console.error(`[MANAGER_NOTIFY_CHAT_ERROR] to ${mId}:`, e.message); }
                }
            } else {
                console.error('[ORDER_FAILED] order was null or missing id for', telegramId, 'Error:', reqErr?.message);
            }
        }

        await saveMessage(telegramId, 'assistant', finalResponse || 'ОК');
        try { await ctx.reply(finalResponse || 'ОК', { parse_mode: 'Markdown' }); } catch { await ctx.reply(finalResponse || 'ОК'); }

    } catch (error) {
        console.error('[AI CHAT FATAL ERROR]:', error.message);
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
