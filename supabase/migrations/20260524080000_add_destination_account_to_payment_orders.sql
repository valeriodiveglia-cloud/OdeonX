-- Migration: Add destination_account_id to fin_payment_orders and define fin_update_account_balance
ALTER TABLE fin_payment_orders ADD COLUMN destination_account_id UUID REFERENCES fin_bank_accounts(id);

CREATE OR REPLACE FUNCTION fin_update_account_balance(p_account_id UUID)
RETURNS VOID AS $$
DECLARE
  v_opening_balance NUMERIC;
  v_inflow_sum NUMERIC;
  v_outflow_sum NUMERIC;
BEGIN
  SELECT COALESCE(opening_balance, 0) INTO v_opening_balance FROM fin_bank_accounts WHERE id = p_account_id;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_inflow_sum 
  FROM fin_bank_transactions 
  WHERE account_id = p_account_id AND type = 'Inflow';

  SELECT COALESCE(SUM(amount), 0) INTO v_outflow_sum 
  FROM fin_bank_transactions 
  WHERE account_id = p_account_id AND type = 'Outflow';

  UPDATE fin_bank_accounts 
  SET current_balance = v_opening_balance + v_inflow_sum - v_outflow_sum 
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;
