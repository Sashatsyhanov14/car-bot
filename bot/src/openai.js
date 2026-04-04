const OpenAI = require('openai');
const dotenv = require('dotenv');
const { ANALYZER_PROMPT, WRITER_PROMPT, LOCALIZER_PROMPT, MANAGER_ALERTER_PROMPT } = require('./prompts');
const { getCars, getTransfers } = require('./supabase');

dotenv.config();

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
    defaultHeaders: {
        'HTTP-Referer': 'https://car-rental-bot.com',
        'X-Title': 'Car Rental & Transfer Bot',
    }
});

module.exports = {
    async getChatResponse(cars, transfers, faqText, history, userMessage) {
        try {
            // We use the data passed from index.js for better performance and consistency

            // === АГЕНТ 1: АНАЛИТИК (Analyzer) ===
            const analyzerMessages = [
                { role: 'system', content: ANALYZER_PROMPT(cars || [], transfers || []) },
                ...history,
                { role: 'user', content: userMessage }
            ];

            const analyzerResponse = await openai.chat.completions.create({
                model: 'openai/gpt-4o-mini',
                messages: analyzerMessages,
                temperature: 0.1
            });

            const rawJsonStr = analyzerResponse.choices[0].message.content;
            let analysis;
            try {
                const cleanJsonStr = rawJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
                analysis = JSON.parse(cleanJsonStr);
            } catch (e) {
                analysis = { lang_code: 'ru', intent: 'consultation', service_type: null, item_id: null, writer_instruction: 'Ответь кратко на запрос.' };
            }

            // === АГЕНТ 2: ПИСАТЕЛЬ (Writer) — Всегда на RU ===
            const writerMessages = [
                { role: 'system', content: WRITER_PROMPT(cars || [], transfers || [], faqText) },
                {
                    role: 'user',
                    content: `Инструкции от Аналитика:\nНамерение клиента: ${analysis.intent}\nЧто сказать клиенту:\n${analysis.writer_instruction}`
                }
            ];

            const writerResponseRaw = await openai.chat.completions.create({
                model: 'openai/gpt-4o-mini',
                messages: writerMessages,
                temperature: 0.7,
            });

            const russianMessage = writerResponseRaw.choices[0].message.content;

            // === АГЕНТ 3: ПЕРЕВОДЧИК (Translator) ===
            let finalMessage = russianMessage;
            if (analysis.lang_code && analysis.lang_code !== 'ru') {
                const translatorResponse = await openai.chat.completions.create({
                    model: 'openai/gpt-4o-mini',
                    messages: [
                        { role: 'system', content: LOCALIZER_PROMPT },
                        { role: 'user', content: `Целевой язык: ${analysis.lang_code}\nТекст:\n${russianMessage}` }
                    ],
                    temperature: 0.2
                });
                finalMessage = translatorResponse.choices[0].message.content.trim();
            }

            // Прикрепляем теги для парсера в index.js
            let embeddedTags = `[LANG:${analysis.lang_code || 'ru'}]`;
            if (analysis.intent === 'sale' && analysis.item_id) {
                embeddedTags += `\n[BOOK_REQUEST: ${analysis.service_type || 'car'}:${analysis.item_id}]`;
            }

            return finalMessage + '\n' + embeddedTags;

        } catch (error) {
            console.error('[OpenAI Error]:', error);
            return 'Извините, произошла ошибка. Пожалуйста, попробуйте позже.';
        }
    },

    // === АГЕНТ 4: МЕНЕДЖЕР-АНАЛИТИК (Manager Alerter) ===
    async getManagerReport(userData, history, item, bookingDetails) {
        try {
            const context = `
Данные клиента: @${userData.username || 'unknown'} (ID: ${userData.telegram_id})
История переписки (последние 5 сообщений):
${history.slice(-5).map(h => `${h.role === 'user' ? 'Клиент' : 'Бот'}: ${h.content}`).join('\n')}

Выбранная услуга: ${item ? item.title || item.brand + ' ' + item.model : 'Не выбрана'}
Собранные данные для брони:
- ФИО: ${bookingDetails.fullName || '—'}
- Дата: ${bookingDetails.tourDate || '—'}
- Место встречи: ${bookingDetails.hotelName || '—'}
- Телефон (WhatsApp): ${bookingDetails.phone || '—'}
`;

            const response = await openai.chat.completions.create({
                model: 'openai/gpt-4o-mini',
                messages: [
                    { role: 'system', content: MANAGER_ALERTER_PROMPT },
                    { role: 'user', content: context }
                ],
                temperature: 0.5
            });

            return response.choices[0].message.content;
        } catch (e) {
            console.error('[Manager Alerter Error]:', e.message);
            // Фолбэк на стандартное сообщение, если AI упал
            return `НОВАЯ ЗАЯВКА!\n\nУслуга: ${item?.title || (item?.brand + ' ' + item?.model)}\nКлиент: @${userData.username}\nФИО: ${bookingDetails.fullName}\nДата: ${bookingDetails.tourDate}\nМесто: ${bookingDetails.hotelName}\nWhatsApp: ${bookingDetails.phone || 'не указан'}`;
        }
    },

    async getLocalizedText(langCode, russianText) {
        if (!langCode || langCode === 'ru') return russianText;
        try {
            const response = await openai.chat.completions.create({
                model: 'openai/gpt-4o-mini',
                messages: [
                    { role: 'system', content: LOCALIZER_PROMPT },
                    { role: 'user', content: `Целевой язык: ${langCode}\nТекст:\n${russianText}` }
                ],
                temperature: 0.2,
            });
            return response.choices[0].message.content.trim();
        } catch (e) {
            return russianText;
        }
    }
};
