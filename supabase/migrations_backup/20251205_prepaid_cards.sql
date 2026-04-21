-- Prepaid Cards Tables Migration
-- Run this SQL in your Supabase SQL Editor

-- Create prepaid_cards table
CREATE TABLE IF NOT EXISTS prepaid_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number text UNIQUE NOT NULL,
  customer_name text,
  phone_number text,
  email text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'expired')),
  issued_on timestamptz DEFAULT now(),
  expires_on timestamptz,
  total_purchased integer DEFAULT 0,
  bonus_amount integer DEFAULT 0,
  balance integer DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now()
);

-- Create prepaid_card_transactions table
CREATE TABLE IF NOT EXISTS prepaid_card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid REFERENCES prepaid_cards(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('topup', 'usage', 'adjustment')),
  purchase_amount integer DEFAULT 0,
  bonus_amount integer DEFAULT 0,
  total_amount integer NOT NULL,
  balance_after integer NOT NULL,
  description text,
  operator text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE prepaid_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepaid_card_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Allow all for authenticated" ON prepaid_cards FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON prepaid_card_transactions FOR ALL TO authenticated USING (true);

-- Add prepaid_bonus_percentage column to loyalty_settings if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'loyalty_settings' AND column_name = 'prepaid_bonus_percentage'
  ) THEN
    ALTER TABLE loyalty_settings ADD COLUMN prepaid_bonus_percentage integer DEFAULT 0;
  END IF;
END $$;
