const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
}

console.log(`Supabase connecting to: ${supabaseUrl} (Key length: ${supabaseKey.length})`);
const supabase = createClient(supabaseUrl, supabaseKey);
const crypto = require('crypto');

module.exports = {
  supabase,

  async getUser(telegramId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    return { data, error };
  },

  async createUser(user) {
    user.created_at = new Date().toISOString();
    if (user.balance === undefined) user.balance = 0;

    const { data, error } = await supabase
      .from('users')
      .insert([user])
      .select()
      .single();

    if (error) console.error('Supabase createUser error:', error.message);
    return { data, error };
  },

  async getCars() {
    // Temporarily removing is_active filter to debug the "0 cars" issue
    const { data, error } = await supabase
      .from('cars')
      .select('*');
    if (data) console.log(`[DB_CHECK] Total Cars found: ${data.length}`);
    return { data, error };
  },

  async getTransfers() {
    const { data, error } = await supabase
      .from('transfers')
      .select('*');
    if (data) console.log(`[DB_CHECK] Total Transfers found: ${data.length}`);
    return { data, error };
  },

  async saveMessage(userId, role, content) {
    const { error } = await supabase
      .from('chat_history')
      .insert([{ id: crypto.randomUUID(), user_id: userId, role, content, created_at: new Date().toISOString() }]);
    if (error) console.error('Supabase saveMessage error:', error.message);
    return { error };
  },

  async clearHistory(userId) {
    const { error } = await supabase
      .from('chat_history')
      .delete()
      .eq('user_id', userId);
    return { error };
  },

  async getHistory(userId, limit = 10) {
    const { data, error } = await supabase
      .from('chat_history')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return { data: (data || []).reverse(), error };
  },

  async getFaq() {
    const { data, error } = await supabase.from('faq').select('*');
    return { data, error };
  },

  async createRequest(userId, serviceTitle, fullName, tourDate, pickupLocation, priceRub, meta) {
    const reqId = crypto.randomUUID();
    const { data, error } = await supabase
      .from('requests')
      .insert([{
        id: reqId,
        user_id: userId,
        excursion_title: serviceTitle, // Using existing column for title
        full_name: fullName,
        tour_date: tourDate,
        hotel_name: pickupLocation, // Using existing column for pickup
        price_rub: priceRub,
        meta_data: meta || {},
        status: 'new',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) console.error('Supabase createRequest error:', error.message);
    return { data, error };
  }
};
