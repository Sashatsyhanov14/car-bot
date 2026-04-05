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
    const { data: cars, error: carErr } = await supabase.from('cars').select('*');
    if (carErr) console.error('Cars Error:', carErr.message);
    else {
        console.log(`Total Cars in DB: ${cars.length}`);
        const activeCount = cars.filter(c => c.is_active === true).length;
        console.log(`Active Cars (is_active=true): ${activeCount}`);
        if (cars.length > 0) console.log('First Car:', cars[0].brand, cars[0].model, 'Active:', cars[0].is_active);
    }

    // Check Transfers
    const { data: transfers, error: transErr } = await supabase.from('transfers').select('*');
    if (transErr) console.error('Transfers Error:', transErr.message);
    else {
        console.log(`Total Transfers in DB: ${transfers.length}`);
        const activeCount = transfers.filter(t => t.is_active === true).length;
        console.log(`Active Transfers: ${activeCount}`);
    }

    // Check FAQ
    const { data: faq, error: faqErr } = await supabase.from('faq').select('*');
    if (faqErr) console.error('FAQ Error:', faqErr.message);
    else console.log(`Total FAQ rows: ${faq.length}`);

    console.log('--- INSPECTION COMPLETE ---');
}

checkDatabase();
