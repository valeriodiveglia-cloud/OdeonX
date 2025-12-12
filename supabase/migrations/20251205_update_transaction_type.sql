-- Update prepaid_card_transactions type check constraint to include 'log'
ALTER TABLE prepaid_card_transactions DROP CONSTRAINT prepaid_card_transactions_type_check;
ALTER TABLE prepaid_card_transactions ADD CONSTRAINT prepaid_card_transactions_type_check CHECK (type IN ('topup', 'usage', 'adjustment', 'log'));
