-- Add voucher_terms column to loyalty_settings table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'loyalty_settings' AND column_name = 'voucher_terms'
  ) THEN
    ALTER TABLE loyalty_settings ADD COLUMN voucher_terms text DEFAULT 'This voucher can be redeemed at the counter.\nTerms and conditions apply.';
  END IF;
END $$;
