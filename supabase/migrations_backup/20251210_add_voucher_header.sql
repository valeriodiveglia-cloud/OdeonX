DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loyalty_settings' AND column_name = 'voucher_header') THEN 
        ALTER TABLE loyalty_settings ADD COLUMN voucher_header TEXT; 
    END IF; 
END $$;
