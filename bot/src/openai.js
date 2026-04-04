const OpenAI = require('openai');
const dotenv = require('dotenv');
const { ANALYZER_PROMPT, WRITER_PROMPT, LOCALIZER_PROMPT, MANAGER_ALERTER_PROMPT } = require('./prompts');
const { getCars, getTransfers } = require('./supabase');

const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: (process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '').trim(),
    defaultHeaders: {
        'HTTP-Referer': 'https://car-rental-bot.com',
        'X-Title': 'Car Rental & Transfer Bot',
    }
});

module.exports = {
    async getChatResponse(cars, transfers, faqText, history, userMessage) {
        try {
            // === АГЕНТ 1: АНАЛИТИК (Analyzer) — GPT-4o ===
            const analyzerResponse = await openai.chat.completions.create({
                model: 'openai/gpt-4o', // Upgraded to 4o per user request
                messages: [
                    { role: 'system', content: ANALYZER_PROMPT },
                    ...history,
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            });

            const analysis = JSON.parse(analyzerResponse.choices[0].message.content);

            // === АГЕНТ 2: ПОИСКОВИК (Searcher) — GPT-4o-mini ===
            const searcherResponse = await openai.chat.completions.create({
                model: 'openai/gpt-4o-mini',
                messages: [
                    { role: 'system', content: SEARCHER_PROMPT(cars || [], transfers || [], faqText) },
                    { role: 'user', content: `Analyzer Search Query: ${analysis.search_query}\nIntent: ${analysis.intent}` }
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            });

            const searchResults = JSON.parse(searcherResponse.choices[0].message.content);

            // === АГЕНТ 3: ПИСАТЕЛЬ (Writer) — GPT-4o-mini — Всегда на RU ===
            const writerResponseRaw = await openai.chat.completions.create({
                model: 'openai/gpt-4o-mini',
                messages: [
                    { role: 'system', content: WRITER_PROMPT },
                    {
                        role: 'user',
                        content: `Intent: ${analysis.intent}\nSearch Results: ${searchResults.results_summary}`
                    }
                ],
                temperature: 0.7,
            });

            const russianMessage = writerResponseRaw.choices[0].message.content;

            // === АГЕНТ 4: ПЕРЕВОДЧИК (Translator) — GPT-4o-mini ===
            let finalMessage = russianMessage;
            if (analysis.lang_code && analysis.lang_code !== 'ru') {
                const translatorResponse = await openai.chat.completions.create({
                    model: 'openai/gpt-4o-mini',
                    messages: [
                        { role: 'system', content: LOCALIZER_PROMPT },
                        { role: 'user', content: `Target Language: ${analysis.lang_code}\nText:\n${russianMessage}` }
                    ],
                    temperature: 0.2
                });
                finalMessage = translatorResponse.choices[0].message.content.trim();
            }

            // Прикрепляем теги для парсера в index.js
            let embeddedTags = `[LANG:${analysis.lang_code || 'ru'}]`;
            if (searchResults.match_id) {
                embeddedTags += `\n[BOOK_REQUEST: ${searchResults.match_type || 'car'}:${searchResults.match_id}]`;
            }

            return finalMessage + '\n' + embeddedTags;

        } catch (error) {
            console.error('[OpenAI Fatal Error]:', error.message);
            if (error.response) {
                console.error('[OpenAI Status]:', error.response.status);
                console.error('[OpenAI Data]:', error.response.data);
            }
            return 'Извините, произошла ошибка. Пожалуйста, попробуйте чуть позже.';
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
