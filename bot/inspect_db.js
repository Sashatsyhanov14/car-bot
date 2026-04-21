const { supabase } = require('./src/supabase');

async function inspect() {
    console.log('--- DB INSPECTION START ---');
    
    const { data: cars, error: carErr } = await supabase.from('cars').select('*').limit(1);
    if (carErr) {
        console.error('Error fetching cars:', carErr);
    } else if (cars && cars.length > 0) {
        console.log('Columns in "cars":', Object.keys(cars[0]).join(', '));
        console.log('Data sample (first row):', JSON.stringify(cars[0], null, 2));
    } else {
        console.log('"cars" table is empty or inaccessible.');
    }

    const { data: transfers, error: transErr } = await supabase.from('transfers').select('*').limit(1);
    if (transErr) {
        console.error('Error fetching transfers:', transErr);
    } else if (transfers && transfers.length > 0) {
        console.log('Columns in "transfers":', Object.keys(transfers[0]).join(', '));
        console.log('Data sample (first row):', JSON.stringify(transfers[0], null, 2));
    } else {
        console.log('"transfers" table is empty or inaccessible.');
    }

    console.log('--- DB INSPECTION END ---');
}

inspect().catch(console.error);
