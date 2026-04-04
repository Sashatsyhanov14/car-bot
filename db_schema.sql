-- DB Schema for Car Rental & Transfer Bot
-- Place this into the Supabase SQL Editor

-- 1. Удаляем все существующие таблицы (в правильном порядке для соблюдения связей)
DROP TABLE IF EXISTS public.requests CASCADE;
DROP TABLE IF EXISTS public.chat_history CASCADE;
DROP TABLE IF EXISTS public.faq CASCADE;
DROP TABLE IF EXISTS public.transfers CASCADE;
DROP TABLE IF EXISTS public.cars CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 2. Включаем расширение для UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. Создаем таблицу пользователей
CREATE TABLE public.users (
    telegram_id bigint PRIMARY KEY,
    username text,
    first_name text,
    role text DEFAULT 'user'::text,
    balance numeric DEFAULT 0,
    referrer_id bigint REFERENCES public.users(telegram_id),
    created_at timestamptz DEFAULT now()
);

-- 4. Создаем таблицу машин
CREATE TABLE public.cars (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand text NOT NULL,
    model text NOT NULL,
    city text NOT NULL,
    price_per_day numeric NOT NULL,
    body_style text,
    transmission text DEFAULT 'Automatic'::text,
    fuel_type text DEFAULT 'Petrol'::text,
    description text,
    image_url text,
    image_urls text[] DEFAULT '{}'::text[],
    sort_number integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- 5. Создаем таблицу трансферов
CREATE TABLE public.transfers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_location text NOT NULL,
    to_location text NOT NULL,
    car_type text DEFAULT 'Standard'::text,
    price numeric NOT NULL,
    description text,
    image_url text,
    sort_number integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- 6. Создаем таблицу заявок
CREATE TABLE public.requests (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id bigint REFERENCES public.users(telegram_id),
    service_type text, 
    excursion_title text, 
    full_name text,
    tour_date text,
    hotel_name text,
    price_rub numeric,
    status text DEFAULT 'new'::text,
    meta_data jsonb DEFAULT '{}'::jsonb,
    assigned_manager bigint REFERENCES public.users(telegram_id),
    created_at timestamptz DEFAULT now()
);

-- 7. Создаем таблицу истории чата
CREATE TABLE public.chat_history (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id bigint REFERENCES public.users(telegram_id),
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 8. Создаем таблицу FAQ
CREATE TABLE public.faq (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic text NOT NULL,
    content_ru text,
    content_en text,
    content_tr text,
    content_de text,
    content_pl text,
    content_ar text,
    content_fa text,
    created_at timestamptz DEFAULT now()
);

-- 9. Создаем индексы для скорости
CREATE INDEX idx_requests_user_id ON public.requests(user_id);
CREATE INDEX idx_chat_history_user_id ON public.chat_history(user_id);
CREATE INDEX idx_users_referrer_id ON public.users(referrer_id);
CREATE INDEX idx_cars_city ON public.cars(city);
CREATE INDEX idx_transfers_locations ON public.transfers(from_location, to_location);

-- 10. Настройка Storage (Корзина для фото)
-- Вставьте эти строки, если у вас еще нет корзины car_photos:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('car_photos', 'car_photos', true) ON CONFLICT (id) DO NOTHING;

-- Политики доступа для фото (чтобы все могли видеть, а анонимы загружать в Mini App)
-- CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'car_photos');
-- CREATE POLICY "Anon Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'car_photos');
