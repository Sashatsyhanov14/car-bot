const { getMultilingualItem } = require('./src/openai');

async function test() {
    console.log('Testing Multilingual Translation...');
    const result = await getMultilingualItem('car', {
        city: 'Анталия',
        description: 'Отличная машина для отдыха',
        body_style: 'Седан',
        transmission: 'Автомат',
        fuel_type: 'Бензин'
    });
    console.log('AI Result:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
