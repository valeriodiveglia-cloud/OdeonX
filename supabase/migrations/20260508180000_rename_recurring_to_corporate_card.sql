-- Rename table
ALTER TABLE fin_recurring_payments RENAME TO fin_corporate_card_expenses;

-- Rename columns
ALTER TABLE fin_corporate_card_expenses RENAME COLUMN next_due_date TO expense_date;

-- Drop is_active column (no longer needed)
ALTER TABLE fin_corporate_card_expenses DROP COLUMN IF EXISTS is_active;

-- Update FK constraint names for clarity
ALTER TABLE fin_corporate_card_expenses RENAME CONSTRAINT fin_recurring_payments_bank_account_id_fkey TO fin_corporate_card_expenses_bank_account_id_fkey;
ALTER TABLE fin_corporate_card_expenses RENAME CONSTRAINT fin_recurring_payments_account_id_fkey TO fin_corporate_card_expenses_account_id_fkey;
