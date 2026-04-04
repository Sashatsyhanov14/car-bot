const { supabase, getCars, getTransfers } = require('../src/supabase');
const { getLocalizedText } = require('../src/openai');

const TARGET_LANGS = ['en', 'tr', 'de', 'pl', 'ar', 'fa'];

async function translateCars() {
    console.log('--- Translating Cars ---');
    const { data: cars, error } = await getCars();
    if (error) {
        console.error('Error fetching cars:', error);
        return;
    }

    for (const car of cars) {
        console.log(`Processing car: ${car.brand} ${car.model} (${car.id})`);
        const updates = {};
        
        for (const lang of TARGET_LANGS) {
            // Translate body_style
            if (car.body_style && !car[`body_style_${lang}`]) {
                console.log(`  Translating body_style to ${lang}...`);
                updates[`body_style_${lang}`] = await getLocalizedText(lang, car.body_style);
            }
            // Translate transmission
            if (car.transmission && !car[`transmission_${lang}`]) {
                console.log(`  Translating transmission to ${lang}...`);
                updates[`transmission_${lang}`] = await getLocalizedText(lang, car.transmission);
            }
            // Translate fuel_type
            if (car.fuel_type && !car[`fuel_type_${lang}`]) {
                console.log(`  Translating fuel_type to ${lang}...`);
                updates[`fuel_type_${lang}`] = await getLocalizedText(lang, car.fuel_type);
            }
            // Translate description
            if (car.description && !car[`description_${lang}`]) {
                console.log(`  Translating description to ${lang}...`);
                updates[`description_${lang}`] = await getLocalizedText(lang, car.description);
            }
        }

        if (Object.keys(updates).length > 0) {
            const { error: updErr } = await supabase.from('cars').update(updates).eq('id', car.id);
            if (updErr) console.error(`  Error updating car ${car.id}:`, updErr.message);
            else console.log(`  Successfully updated car ${car.id} with ${Object.keys(updates).length} translations.`);
        } else {
            console.log(`  No translations needed for car ${car.id}.`);
        }
    }
}

async function translateTransfers() {
    console.log('\n--- Translating Transfers ---');
    const { data: transfers, error } = await getTransfers();
    if (error) {
        console.error('Error fetching transfers:', error);
        return;
    }

    for (const tr of transfers) {
        console.log(`Processing transfer: ${tr.from_location} -> ${tr.to_location} (${tr.id})`);
        const updates = {};

        for (const lang of TARGET_LANGS) {
            // Translate from_location
            if (tr.from_location && !tr[`from_location_${lang}`]) {
                console.log(`  Translating from_location to ${lang}...`);
                updates[`from_location_${lang}`] = await getLocalizedText(lang, tr.from_location);
            }
            // Translate to_location
            if (tr.to_location && !tr[`to_location_${lang}`]) {
                console.log(`  Translating to_location to ${lang}...`);
                updates[`to_location_${lang}`] = await getLocalizedText(lang, tr.to_location);
            }
            // Translate description
            if (tr.description && !tr[`description_${lang}`]) {
                console.log(`  Translating description to ${lang}...`);
                updates[`description_${lang}`] = await getLocalizedText(lang, tr.description);
            }
        }

        if (Object.keys(updates).length > 0) {
            const { error: updErr } = await supabase.from('transfers').update(updates).eq('id', tr.id);
            if (updErr) console.error(`  Error updating transfer ${tr.id}:`, updErr.message);
            else console.log(`  Successfully updated transfer ${tr.id} with ${Object.keys(updates).length} translations.`);
        } else {
            console.log(`  No translations needed for transfer ${tr.id}.`);
        }
    }
}

async function main() {
    await translateCars();
    await translateTransfers();
    console.log('\nAll translations completed!');
}

main().catch(console.error);
