const { supabase, getCars } = require('./src/supabase');
const { getMultilingualItem } = require('./src/openai');

async function diagnose() {
    console.log('--- DIAGNOSTIC START ---');
    
    // 1. Fetch one car
    const { data: cars, error: fetchErr } = await getCars();
    if (fetchErr || !cars || cars.length === 0) {
        console.error('FAILED to fetch cars:', fetchErr);
        return;
    }
    const car = cars[0];
    console.log('Target car:', car.brand, car.model, 'ID:', car.id);
    console.log('Current Russian data:', {
        city: car.city,
        description: car.description,
        body_style: car.body_style
    });

    // 2. Transate
    console.log('\nCalling AI for translation...');
    try {
        const translations = await getMultilingualItem('car', {
            city: car.city || 'Неизвестно',
            description: car.description || 'Нет описания',
            body_style: car.body_style || 'Седан'
        });
        
        console.log('AI Response (parsed):', JSON.stringify(translations, null, 2));

        if (Object.keys(translations).length === 0) {
            console.error('AI returned an EMPTY object!');
            return;
        }

        // 3. Update
        console.log('\nUpdating Supabase...');
        const { data: updateData, error: updErr } = await supabase
            .from('cars')
            .update(translations)
            .eq('id', car.id)
            .select();

        if (updErr) {
            console.error('Supabase Update FAILED:', updErr.message);
            console.error('Error details:', updErr);
        } else {
            console.log('Supabase Update SUCCESS!');
            console.log('Updated row data (subset):', {
                city_en: updateData[0].city_en,
                description_en: updateData[0].description_en
            });
        }

    } catch (e) {
        console.error('Crashed during diagnosis:', e);
    }
    console.log('\n--- DIAGNOSTIC END ---');
}

diagnose().catch(console.error);
