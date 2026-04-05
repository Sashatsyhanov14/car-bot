const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function checkDatabase() {
    const sUrl = process.env.SUPABASE_URL;
    const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (!sUrl || !sKey) {
        console.error('Missing credentials');
        return;
    }

    const supabase = createClient(sUrl, sKey);

    console.log('--- DATABASE INSPECTION ---');
    
    // Check Cars
    console.log('\n--- Checking Cars ---');
    const { data: cars, error: carErr } = await supabase.from('cars').select('*');
    if (carErr) console.log('❌ Таблица cars НЕ доступна (Table API)');
    else console.log(`✅ Таблица cars доступна (Table API). Найдено: ${cars.length}`);

    const { data: carsRpc, error: rpcErr } = await supabase.rpc('get_all_cars');
    if (rpcErr) console.log('❌ Функция get_all_cars НЕ доступна (RPC API)');
    else console.log(`✅ Функция get_all_cars доступна (RPC API). Найдено: ${carsRpc.length}`);

    // Check Transfers
    console.log('\n--- Checking Transfers ---');
    const { data: transfers, error: transErr } = await supabase.from('transfers').select('*');
    if (transErr) console.log('❌ Таблица transfers НЕ доступна (Table API)');
    else console.log(`✅ Таблица transfers доступна (Table API). Найдено: ${transfers.length}`);

    const { data: transRpc, error: rpcTransErr } = await supabase.rpc('get_all_transfers');
    if (rpcTransErr) console.log('❌ Функция get_all_transfers НЕ доступна (RPC API)');
    else console.log(`✅ Функция get_all_transfers доступна (RPC API). Найдено: ${transRpc.length}`);

    // Check FAQ
    const { data: faq, error: faqErr } = await supabase.from('faq').select('*');
    if (faqErr) console.error('FAQ Error:', faqErr.message);
    else console.log(`Total FAQ rows: ${faq.length}`);

    console.log('--- INSPECTION COMPLETE ---');
}

checkDatabase();
