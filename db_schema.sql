-- DB Schema for Car Rental & Transfer Bot
-- Place this into the Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: users (Client/Manager/Founder profiles)
CREATE TABLE IF NOT EXISTS public.users (
    telegram_id bigint PRIMARY KEY,
    username text,
    first_name text,
    role text DEFAULT 'user'::text, -- 'user', 'manager', 'founder'
    balance numeric DEFAULT 0,
    referrer_id bigint REFERENCES public.users(telegram_id),
    created_at timestamptz DEFAULT now()
);

-- Table: cars (Vehicle Inventory)
CREATE TABLE IF NOT EXISTS public.cars (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand text NOT NULL,
    model text NOT NULL,
    city text NOT NULL,
    price_per_day numeric NOT NULL,
    body_style text, -- Sedan, SUV, etc.
    transmission text DEFAULT 'Automatic'::text,
    fuel_type text DEFAULT 'Petrol'::text,
    description text,
    image_url text, -- Main photo
    image_urls text[] DEFAULT '{}'::text[], -- Extra photos
    sort_number integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Table: transfers (Route-based transfers)
CREATE TABLE IF NOT EXISTS public.transfers (
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

-- Table: requests (Bookings/Inquiries)
CREATE TABLE IF NOT EXISTS public.requests (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id bigint REFERENCES public.users(telegram_id),
    service_type text, -- 'car' or 'transfer'
    excursion_title text, -- Used to store the Car Name or Route Name
    full_name text,
    tour_date text, -- Date(s) of rental/transfer
    hotel_name text, -- Pickup location or Destination
    price_rub numeric, -- Final price
    status text DEFAULT 'new'::text, -- 'new', 'contacted', 'completed', 'cancelled'
    meta_data jsonb DEFAULT '{}'::jsonb, -- dynamic fields like passengers, return date, etc.
    assigned_manager bigint REFERENCES public.users(telegram_id),
    created_at timestamptz DEFAULT now()
);

-- Table: chat_history (AI Conversation logs)
CREATE TABLE IF NOT EXISTS public.chat_history (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id bigint REFERENCES public.users(telegram_id),
    role text NOT NULL, -- 'user' or 'assistant'
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Table: faq (Knowledge Base)
CREATE TABLE IF NOT EXISTS public.faq (
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

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_requests_user_id ON public.requests(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON public.chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_users_referrer_id ON public.users(referrer_id);
CREATE INDEX IF NOT EXISTS idx_cars_city ON public.cars(city);
CREATE INDEX IF NOT EXISTS idx_transfers_locations ON public.transfers(from_location, to_location);
