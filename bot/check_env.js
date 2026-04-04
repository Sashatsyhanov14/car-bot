const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function check() {
    console.log('--- BOT ENVIRONMENT CHECK ---');
    console.log('Location:', __dirname);

    const token = process.env.BOT_TOKEN;
    const sUrl = process.env.SUPABASE_URL;
    const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (!token) {
        console.error('❌ BOT_TOKEN is missing in .env');
    } else {
        console.log('✅ BOT_TOKEN found:', token.substring(0, 10) + '...');
        const bot = new Telegraf(token);
        try {
            const me = await bot.telegram.getMe();
            console.log('✅ Telegram Connection: OK');
            console.log('   Bot Name:', me.first_name);
            console.log('   Bot Username: @' + me.username);
            console.log('   Bot ID:', me.id);
        } catch (e) {
            console.error('❌ Telegram Error:', e.message);
            if (e.message.includes('401')) console.log('   (Tip: Token is invalid)');
            if (e.message.includes('409')) console.log('   (Tip: Token is already used by another process!)');
        }
    }

    if (!sUrl || !sKey) {
        console.error('❌ Supabase credentials missing in .env');
    } else {
        console.log('✅ Supabase credentials found');
        const supabase = createClient(sUrl, sKey);
        try {
            const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
            if (error) throw error;
            console.log('✅ Supabase Connection: OK');
        } catch (e) {
            console.error('❌ Supabase Error:', e.message);
        }
    }

    console.log('--- CHECK COMPLETE ---');
}

check();
