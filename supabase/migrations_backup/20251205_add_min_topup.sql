-- Add min_topup_amount column to loyalty_settings table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'loyalty_settings' AND column_name = 'min_topup_amount'
  ) THEN
    ALTER TABLE loyalty_settings ADD COLUMN min_topup_amount integer DEFAULT 0;
  END IF;
END $$;
