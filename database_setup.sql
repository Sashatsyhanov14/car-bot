-- Полный SQL-скрипт для установки базы данных "Аренда Авто и Трансферы" (Bots 3, 4 и т.д.)

-- 1. Таблица Пользователей (Clients & Admins)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    first_name TEXT,
    username TEXT,
    role TEXT DEFAULT 'client'::text, -- 'founder' | 'manager' | 'client'
    balance NUMERIC DEFAULT 0,
    referrer_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Таблица Автомобилей (Аренда)
CREATE TABLE IF NOT EXISTS public.cars (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    city TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    price_per_day NUMERIC NOT NULL,
    image_url TEXT,
    sort_number INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Таблица Трансферов
CREATE TABLE IF NOT EXISTS public.transfers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    car_info TEXT NOT NULL,
    price INTEGER NOT NULL,
    sort_number INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Таблица Заявок (Requests)
CREATE TABLE IF NOT EXISTS public.requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id BIGINT REFERENCES public.users(telegram_id) ON DELETE CASCADE,
    excursion_id UUID,          -- оставлено для совместимости старого кода
    excursion_title TEXT,       -- Название услуги (Авто или тип трансфера)
    full_name TEXT NOT NULL,
    tour_date TEXT NOT NULL,    -- Дата аренды / поездки
    hotel_name TEXT,            -- Отель (если не указан откуда)
    pickup_location TEXT,       -- Откуда забирать
    price_rub NUMERIC NOT NULL,
    status TEXT DEFAULT 'new'::text, -- 'new' | 'contacted' | 'done' | 'cancelled'
    assigned_manager BIGINT,
    service_type TEXT,          -- 'car' | 'transfer'
    car_id UUID REFERENCES public.cars(id) ON DELETE SET NULL,
    transfer_id UUID REFERENCES public.transfers(id) ON DELETE SET NULL,
    destination TEXT,           -- Куда (для трансфера)
    passengers_count INTEGER,   -- Количество пассажиров
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. История Чата с AI
CREATE TABLE IF NOT EXISTS public.chat_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id BIGINT REFERENCES public.users(telegram_id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'user' | 'assistant'
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. FAQ (Вопросы и Ответы)
CREATE TABLE IF NOT EXISTS public.faq (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    topic TEXT NOT NULL,
    content_ru TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- --- НАСТРОЙКА БЕЗОПАСНОСТИ ДЛЯ WEBAPP (RLS & POLICIES) ---
-- Отключаем строгую политику RLS, чтобы WebApp с anon-ключом мог читать и писать данные
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cars DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq DISABLE ROW LEVEL SECURITY;

-- Создаем первого основателя (Укажите свой Telegram ID)
-- Раскомментируйте строку ниже и впишите свой ID, чтобы автоматически получить админку:
-- INSERT INTO public.users (telegram_id, first_name, username, role) VALUES (ВАШ_ID, 'Супер', 'Админ', 'founder');
