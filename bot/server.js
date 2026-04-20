const express = require('express');
const cors = require('cors');
const path = require('path');
const bot = require('./index');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the React app
const webappDistPath = path.join(__dirname, '../webapp/dist');
app.use(express.static(webappDistPath));

// Webhook endpoint (if using webhooks)
app.post('/api/webhook', async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).send('Error');
    }
});

// API endpoint to send QR code via bot
app.post('/api/send-qr', async (req, res) => {
    try {
        const { telegram_id } = req.body;
        if (!telegram_id) return res.status(400).json({ error: 'Missing telegram_id' });

        const refLink = `https://t.me/emedeorentacat_bot?start=${telegram_id}`;

        const caption = `Link: ${refLink}\nPromo: ${telegram_id}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(refLink)}`;
        await bot.telegram.sendPhoto(telegram_id, qrUrl, { caption });

        res.json({ success: true });
    } catch (err) {
        console.error('API Send QR Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API endpoint for Web App Bookings
app.post('/api/book', async (req, res) => {
    try {
        const { telegramId, userName, lang, data } = req.body;
        if (!telegramId || !data) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        // Cache lang to keep bot translations consistent
        if (lang) bot.setUserLangCache(telegramId, lang);

        const result = await bot.processBooking(telegramId, userName, lang, data);
        
        if (result.success && !result.error) {
            // Also notify the user of success via bot
            const { getLocalizedText } = require('./src/openai');
            const successMsg = await getLocalizedText(lang, 'Заявка отправлена. Менеджер свяжется с вами в ближайшее время.');
            bot.telegram.sendMessage(telegramId, successMsg).catch(console.error);
            return res.json({ success: true });
        } else {
            return res.status(500).json({ success: false, error: result.error || 'Failed to process' });
        }
    } catch (err) {
        console.error('API Book Error:', err);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// AI Translation for Admin Panel
app.post('/api/translate-admin', async (req, res) => {
    try {
        const { type, data } = req.body;
        const { getMultilingualItem } = require('./src/openai');
        const translated = await getMultilingualItem(type, data);
        res.json(translated);
    } catch (err) {
        console.error('API Translate error:', err);
        res.status(500).json({ error: 'Translation failed' });
    }
});

// Any other request serves the React app
app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(webappDistPath, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    // Check if we should use Long Polling or Webhook
    const WEBHOOK_URL = process.env.WEBHOOK_URL;
    if (WEBHOOK_URL) {
        bot.telegram.setWebhook(`${WEBHOOK_URL}/api/webhook`)
            .then(() => console.log(`Webhook set to: ${WEBHOOK_URL}/api/webhook`))
            .catch(err => console.error('Error setting webhook:', err));
    } else {
        // Clear any persistent webhooks and drop pending updates to avoid 409 Conflict
        bot.telegram.deleteWebhook({ drop_pending_updates: true })
            .then(() => {
                console.log('Webhook deleted, starting Long Polling...');
                return bot.launch();
            })
            .then(() => console.log('Bot started with Long Polling'))
            .catch(err => console.error('Error launching bot:', err));
    }
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
