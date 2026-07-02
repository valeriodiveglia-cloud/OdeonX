ALTER TABLE fin_bank_accounts DROP CONSTRAINT IF EXISTS fin_bank_accounts_account_type_check;
ALTER TABLE fin_bank_accounts ADD CONSTRAINT fin_bank_accounts_account_type_check CHECK (account_type IN ('Checking', 'Saving', 'Capital', 'Cash', 'Wallet'));
