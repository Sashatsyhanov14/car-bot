const { supabase, getCars, getTransfers } = require('../src/supabase');
const { getMultilingualItem } = require('../src/openai');

async function translateCars() {
    console.log('--- Translating Cars ---');
    const { data: cars, error } = await getCars();
    if (error) {
        console.error('Error fetching cars:', error);
        return;
    }

    for (const car of cars) {
        // Check if translations are missing for key fields
        const needsTranslation = !car.city_en || !car.description_en || !car.body_style_en;
        
        if (needsTranslation) {
            console.log(`Processing car: ${car.brand} ${car.model} (${car.id}) - Translating...`);
            const translations = await getMultilingualItem('car', {
                city: car.city,
                description: car.description,
                body_style: car.body_style,
                transmission: car.transmission,
                fuel_type: car.fuel_type
            });

            if (Object.keys(translations).length > 0) {
                console.log('  Keys to update:', Object.keys(translations).join(', '));
                const { error: updErr } = await supabase.from('cars').update(translations).eq('id', car.id);
                if (updErr) console.error(`  Error updating car ${car.id}:`, updErr.message);
                else console.log(`  Successfully translated car ${car.id}.`);
            }
        } else {
            console.log(`Skipping car ${car.id} - translations already exist.`);
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
        const needsTranslation = !tr.from_location_en || !tr.to_location_en || !tr.description_en;

        if (needsTranslation) {
            console.log(`Processing transfer: ${tr.from_location} -> ${tr.to_location} (${tr.id}) - Translating...`);
            const translations = await getMultilingualItem('transfer', {
                from_location: tr.from_location,
                to_location: tr.to_location,
                description: tr.description,
                car_type: tr.car_type
            });

            if (Object.keys(translations).length > 0) {
                console.log('  Keys to update:', Object.keys(translations).join(', '));
                const { error: updErr } = await supabase.from('transfers').update(translations).eq('id', tr.id);
                if (updErr) console.error(`  Error updating transfer ${tr.id}:`, updErr.message);
                else console.log(`  Successfully translated transfer ${tr.id}.`);
            }
        } else {
            console.log(`Skipping transfer ${tr.id} - translations already exist.`);
        }
    }
}

async function main() {
    try {
        await translateCars();
        await translateTransfers();
        console.log('\nAll database translations completed!');
    } catch (err) {
        console.error('Main translation error:', err);
    }
}

main().catch(console.error);
