ALTER TABLE fin_bank_accounts
ADD COLUMN IF NOT EXISTS fee_account_id uuid REFERENCES fin_chart_of_accounts(id) ON DELETE SET NULL;