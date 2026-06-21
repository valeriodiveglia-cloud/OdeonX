-- Migration: fix_fin_update_account_balance_security
-- Description: Cambia la funzione fin_update_account_balance in SECURITY DEFINER per consentirne l'esecuzione con permessi elevati.

CREATE OR REPLACE FUNCTION public.fin_update_account_balance(p_account_id UUID)
RETURNS VOID AS $$
DECLARE
  v_opening_balance NUMERIC;
  v_inflow_sum NUMERIC;
  v_outflow_sum NUMERIC;
BEGIN
  -- Recupera l'opening balance del conto
  SELECT COALESCE(opening_balance, 0) INTO v_opening_balance 
  FROM public.fin_bank_accounts 
  WHERE id = p_account_id;
  
  -- Somma le entrate (Inflow)
  SELECT COALESCE(SUM(amount), 0) INTO v_inflow_sum 
  FROM public.fin_bank_transactions 
  WHERE account_id = p_account_id AND type = 'Inflow';

  -- Somma le uscite (Outflow)
  SELECT COALESCE(SUM(amount), 0) INTO v_outflow_sum 
  FROM public.fin_bank_transactions 
  WHERE account_id = p_account_id AND type = 'Outflow';

  -- Aggiorna il bilancio corrente
  UPDATE public.fin_bank_accounts 
  SET current_balance = v_opening_balance + v_inflow_sum - v_outflow_sum 
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
