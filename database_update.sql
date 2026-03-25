-- =============================================
-- Car Rental & Transfer Bot — Database Update
-- =============================================

-- 1. Cars table
CREATE TABLE IF NOT EXISTS cars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sort_number INTEGER DEFAULT 0,
    city TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    price_per_day DECIMAL(10, 2) NOT NULL,
    conditions TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Transfers table
CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sort_number INTEGER DEFAULT 0,
    car_info TEXT NOT NULL, -- "Sedan", "Minivan", etc.
    price DECIMAL(10, 2) NOT NULL,
    conditions TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Update Requests table
-- We add fields for car rental and transfer details
ALTER TABLE requests 
ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'excursion' CHECK (service_type IN ('excursion', 'car_rental', 'transfer')),
ADD COLUMN IF NOT EXISTS car_id UUID REFERENCES cars(id),
ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES transfers(id),
ADD COLUMN IF NOT EXISTS pickup_location TEXT,
ADD COLUMN IF NOT EXISTS destination TEXT,
ADD COLUMN IF NOT EXISTS passengers_count INTEGER;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cars_city ON cars(city);
CREATE INDEX IF NOT EXISTS idx_requests_service_type ON requests(service_type);
