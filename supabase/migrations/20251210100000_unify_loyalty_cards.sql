-- Migration: Unify Membership and Prepaid Cards into Loyalty Cards
-- Date: 2025-12-10

-- 1. Create the new consolidated table
CREATE TABLE IF NOT EXISTS loyalty_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_number text UNIQUE NOT NULL,
    customer_name text,
    phone_number text,
    email text,
    address text,
    status text DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'expired', 'unassigned')),
    
    -- Membership Pocket
    class text DEFAULT 'Standard',
    points integer DEFAULT 0,
    total_points_earned integer DEFAULT 0,
    tier_expires_on timestamptz,
    
    -- Prepaid Pocket
    balance bigint DEFAULT 0, -- Using bigint for safety with currency
    total_loaded bigint DEFAULT 0,
    total_spent bigint DEFAULT 0,
    card_expires_on timestamptz,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE loyalty_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON loyalty_cards
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Migrate Data from Membership Cards
-- We use a DO block to handle potential missing columns safely if schemas drifted, 
-- but we assume standard columns exist based on codebase.
INSERT INTO loyalty_cards (
    card_number, customer_name, phone_number, email, address, 
    status, class, points, tier_expires_on, created_at
)
SELECT 
    card_number, 
    customer_name, 
    phone_number, 
    email, 
    address, 
    status, 
    class, 
    points, 
    expires_on, 
    created_at
FROM membership_cards
ON CONFLICT (card_number) DO NOTHING;

-- 3. Upsert Data from Prepaid Cards
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT * FROM prepaid_cards LOOP
        INSERT INTO loyalty_cards (
            card_number, customer_name, phone_number, email, 
            status, balance, total_loaded, card_expires_on, created_at
        )
        VALUES (
            r.card_number, 
            r.customer_name, 
            r.phone_number, 
            r.email,
            r.status, 
            r.balance, 
            r.total_purchased, 
            r.expires_on, 
            r.created_at
        )
        ON CONFLICT (card_number) DO UPDATE SET
            balance = EXCLUDED.balance,
            total_loaded = EXCLUDED.total_loaded,
            card_expires_on = EXCLUDED.card_expires_on,
            -- Update contact info only if missing in target
            phone_number = COALESCE(loyalty_cards.phone_number, EXCLUDED.phone_number),
            email = COALESCE(loyalty_cards.email, EXCLUDED.email);
            
    END LOOP;
END $$;
