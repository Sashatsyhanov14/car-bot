const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, './.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkManagers() {
  const { data: managers, error } = await supabase.from('users').select('telegram_id, username, role').in('role', ['founder', 'admin', 'manager']);
  if (error) {
    console.error('Error fetching managers:', error.message);
    return;
  }
  console.log('Managers found in DB:', managers);
  
  const { data: allUsers } = await supabase.from('users').select('telegram_id, username, role').limit(5);
  console.log('Sample users:', allUsers);
}

checkManagers();
