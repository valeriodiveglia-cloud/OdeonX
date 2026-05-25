-- Add batch_id to support bulk cash ledger deposits
ALTER TABLE public.cash_ledger_deposits ADD COLUMN IF NOT EXISTS batch_id UUID;
