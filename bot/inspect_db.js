const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, './.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
  const { data, error } = await supabase.from('requests').select('*').limit(1);
  if (error) {
    console.error('Error selecting from requests:', error.message);
    return;
  }
  if (data && data.length > 0) {
    console.log('Columns found in requests (from first row keys):', Object.keys(data[0]));
  } else {
    console.log('Table "requests" is empty. Cannot determine columns via select.');
    // Try to get schema via RPC or just try known names
    const testUsd = await supabase.from('requests').select('price_usd').limit(1);
    console.log('price_usd test:', testUsd.error ? testUsd.error.message : 'EXISTS');
    const testRub = await supabase.from('requests').select('price_rub').limit(1);
    console.log('price_rub test:', testRub.error ? testRub.error.message : 'EXISTS');
  }
}

inspect();
