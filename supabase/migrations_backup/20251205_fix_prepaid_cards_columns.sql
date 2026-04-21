-- Add missing columns to prepaid_cards table
ALTER TABLE prepaid_cards 
ADD COLUMN IF NOT EXISTS phone_number text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'expired')),
ADD COLUMN IF NOT EXISTS issued_on timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS expires_on timestamptz,
ADD COLUMN IF NOT EXISTS total_purchased integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS bonus_amount integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_by text;

-- Ensure balance defaults to 0 if not set (it might already be numeric, that's okay)
ALTER TABLE prepaid_cards ALTER COLUMN balance SET DEFAULT 0;
