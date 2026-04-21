-- Add issued_on column to loyalty_cards
ALTER TABLE loyalty_cards ADD COLUMN IF NOT EXISTS issued_on timestamptz DEFAULT now();

-- Backfill existing rows with their created_at date
UPDATE loyalty_cards SET issued_on = created_at WHERE issued_on IS NULL;
