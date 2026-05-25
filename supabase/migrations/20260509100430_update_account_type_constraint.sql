-- Drop the old constraint
ALTER TABLE fin_bank_accounts DROP CONSTRAINT IF EXISTS fin_bank_accounts_account_type_check;

-- Migrate existing data to the new types
UPDATE fin_bank_accounts SET account_type = 'Checking' WHERE account_type = 'Cash';
UPDATE fin_bank_accounts SET account_type = 'Checking' WHERE account_type = 'Credit Card';
UPDATE fin_bank_accounts SET account_type = 'Saving' WHERE account_type = 'Savings';

-- Add the new constraint
ALTER TABLE fin_bank_accounts ADD CONSTRAINT fin_bank_accounts_account_type_check 
CHECK (account_type IN ('Checking', 'Saving', 'Capital'));
