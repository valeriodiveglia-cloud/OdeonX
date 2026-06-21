-- Migration: Sync Cash Ledger Deposit
-- Description: Move sync of cash ledger deposits from client-side to DB trigger. Add account_id to track checking accounts.

-- 1. Add account_id column if not exists
ALTER TABLE public.cash_ledger_deposits
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.fin_bank_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cash_ledger_deposits.account_id IS 'Target checking bank account where the cash is deposited';

-- 2. Create or replace trigger function
CREATE OR REPLACE FUNCTION public.sync_cash_ledger_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_branch_id TEXT;
  v_checking_account_id UUID;
  v_cash_account_id UUID;
  
  v_finance_start_date DATE;
  v_ref_id UUID;
  v_ref_type TEXT;
  v_ref_type_outflow TEXT;
  v_desc TEXT;
  v_affected_accounts UUID[] := '{}';
  v_acc_id UUID;
  v_batch_has_other_rows BOOLEAN;
  
  -- variables for existing transactions
  v_existing_inflow_id UUID;
  v_existing_outflow_id UUID;
  v_existing_outflow_amount NUMERIC;
BEGIN
  -- We identify reference_id and reference_type
  v_ref_id := COALESCE(NEW.batch_id, OLD.batch_id, NEW.id, OLD.id);
  
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    v_ref_type := CASE WHEN NEW.batch_id IS NOT NULL THEN 'cash_ledger_batch' ELSE 'cash_ledger_deposit' END;
    v_ref_type_outflow := CASE WHEN NEW.batch_id IS NOT NULL THEN 'cash_ledger_batch_outflow' ELSE 'cash_ledger_deposit_outflow' END;
  ELSE
    v_ref_type := CASE WHEN OLD.batch_id IS NOT NULL THEN 'cash_ledger_batch' ELSE 'cash_ledger_deposit' END;
    v_ref_type_outflow := CASE WHEN OLD.batch_id IS NOT NULL THEN 'cash_ledger_batch_outflow' ELSE 'cash_ledger_deposit_outflow' END;
  END IF;

  -- --------------------------------------------------
  -- DELETE case
  -- --------------------------------------------------
  IF TG_OP = 'DELETE' THEN
    -- Resolve branch_id to track affected accounts
    SELECT id INTO v_branch_id FROM public.provider_branches WHERE name = OLD.branch LIMIT 1;
    
    -- Cash on Hand account (Outflow account)
    SELECT id INTO v_cash_account_id
    FROM public.fin_bank_accounts
    WHERE branch_id = v_branch_id AND account_type = 'Cash' AND is_active = true
    LIMIT 1;

    -- Checking account (Inflow account)
    SELECT account_id INTO v_checking_account_id
    FROM public.fin_bank_transactions
    WHERE reference_id = v_ref_id AND reference_type = v_ref_type
    LIMIT 1;

    IF v_checking_account_id IS NULL THEN
      -- Fallback to OLD.account_id or branch Checking account
      v_checking_account_id := OLD.account_id;
      IF v_checking_account_id IS NULL THEN
        SELECT id INTO v_checking_account_id
        FROM public.fin_bank_accounts
        WHERE branch_id = v_branch_id AND account_type = 'Checking' AND is_active = true
        LIMIT 1;
      END IF;
    END IF;

    -- Collect affected accounts
    IF v_checking_account_id IS NOT NULL THEN
      v_affected_accounts := ARRAY_APPEND(v_affected_accounts, v_checking_account_id);
    END IF;
    IF v_cash_account_id IS NOT NULL THEN
      v_affected_accounts := ARRAY_APPEND(v_affected_accounts, v_cash_account_id);
    END IF;

    -- Check if there are other rows in this batch
    IF OLD.batch_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM public.cash_ledger_deposits
        WHERE batch_id = OLD.batch_id AND id <> OLD.id
      ) INTO v_batch_has_other_rows;
    ELSE
      v_batch_has_other_rows := false;
    END IF;

    IF v_batch_has_other_rows THEN
      -- Subtract OLD.amount from both transactions
      UPDATE public.fin_bank_transactions
      SET amount = amount - OLD.amount
      WHERE reference_id = v_ref_id AND reference_type = v_ref_type;

      UPDATE public.fin_bank_transactions
      SET amount = amount - OLD.amount
      WHERE reference_id = v_ref_id AND reference_type = v_ref_type_outflow;
    ELSE
      -- No other rows, delete both transactions
      DELETE FROM public.fin_bank_transactions WHERE reference_id = v_ref_id AND reference_type IN (v_ref_type, v_ref_type_outflow);
    END IF;

  -- --------------------------------------------------
  -- INSERT case
  -- --------------------------------------------------
  ELSIF TG_OP = 'INSERT' THEN
    -- Resolve branch_id
    SELECT id INTO v_branch_id FROM public.provider_branches WHERE name = NEW.branch LIMIT 1;
    
    -- Resolve checking account
    v_checking_account_id := NEW.account_id;
    IF v_checking_account_id IS NULL THEN
      SELECT id INTO v_checking_account_id
      FROM public.fin_bank_accounts
      WHERE branch_id = v_branch_id AND account_type = 'Checking' AND is_active = true
      LIMIT 1;
    END IF;

    -- Resolve cash account
    SELECT id INTO v_cash_account_id
    FROM public.fin_bank_accounts
    WHERE branch_id = v_branch_id AND account_type = 'Cash' AND is_active = true
    LIMIT 1;

    -- Collect affected accounts
    IF v_checking_account_id IS NOT NULL THEN
      v_affected_accounts := ARRAY_APPEND(v_affected_accounts, v_checking_account_id);
    END IF;
    IF v_cash_account_id IS NOT NULL THEN
      v_affected_accounts := ARRAY_APPEND(v_affected_accounts, v_cash_account_id);
    END IF;

    -- Get finance go-live date
    SELECT finance_start_date INTO v_finance_start_date FROM public.app_settings LIMIT 1;

    -- Inflow: Check if batch transaction already exists
    SELECT id INTO v_existing_inflow_id
    FROM public.fin_bank_transactions
    WHERE reference_id = v_ref_id AND reference_type = v_ref_type
    LIMIT 1;

    v_desc := 'Cash Revenue - ' || NEW.branch || ' - ' || to_char(NEW.date, 'YYYY-MM-DD');

    IF v_existing_inflow_id IS NOT NULL THEN
      -- Update existing batch transaction
      UPDATE public.fin_bank_transactions
      SET amount = amount + NEW.amount
      WHERE id = v_existing_inflow_id;
    ELSE
      -- Insert new inflow transaction
      IF v_checking_account_id IS NOT NULL THEN
        INSERT INTO public.fin_bank_transactions (
          account_id, transaction_date, type, category, description, amount, reference_id, reference_type, branch_id, created_at
        ) VALUES (
          v_checking_account_id, NEW.deposit_date, 'Inflow', 'Cash Deposit',
          CASE WHEN NEW.batch_id IS NOT NULL THEN 'Bulk cash deposit from Ledger' ELSE v_desc END,
          NEW.amount, v_ref_id, v_ref_type, v_branch_id, NOW()
        );
      END IF;
    END IF;

    -- Outflow from Cash on Hand (only if deposit_date >= finance_start_date)
    IF v_cash_account_id IS NOT NULL AND (v_finance_start_date IS NULL OR NEW.deposit_date >= v_finance_start_date) THEN
      SELECT id INTO v_existing_outflow_id
      FROM public.fin_bank_transactions
      WHERE reference_id = v_ref_id AND reference_type = v_ref_type_outflow
      LIMIT 1;

      IF v_existing_outflow_id IS NOT NULL THEN
        UPDATE public.fin_bank_transactions
        SET amount = amount + NEW.amount
        WHERE id = v_existing_outflow_id;
      ELSE
        INSERT INTO public.fin_bank_transactions (
          account_id, transaction_date, type, category, description, amount, reference_id, reference_type, branch_id, created_at
        ) VALUES (
          v_cash_account_id, NEW.deposit_date, 'Outflow', 'Cash Deposit',
          CASE WHEN NEW.batch_id IS NOT NULL THEN 'Bank Deposit: Bulk cash deposit from Ledger' ELSE 'Bank Deposit: ' || v_desc END,
          NEW.amount, v_ref_id, v_ref_type_outflow, v_branch_id, NOW()
        );
      END IF;
    END IF;

  -- --------------------------------------------------
  -- UPDATE case
  -- --------------------------------------------------
  ELSIF TG_OP = 'UPDATE' THEN
    -- Resolve branch_id
    SELECT id INTO v_branch_id FROM public.provider_branches WHERE name = NEW.branch LIMIT 1;
    
    -- Cash account
    SELECT id INTO v_cash_account_id
    FROM public.fin_bank_accounts
    WHERE branch_id = v_branch_id AND account_type = 'Cash' AND is_active = true
    LIMIT 1;

    -- Collect affected accounts (both old and new to be safe)
    IF OLD.account_id IS NOT NULL THEN
      v_affected_accounts := ARRAY_APPEND(v_affected_accounts, OLD.account_id);
    END IF;
    IF NEW.account_id IS NOT NULL AND NEW.account_id <> COALESCE(OLD.account_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      v_affected_accounts := ARRAY_APPEND(v_affected_accounts, NEW.account_id);
    END IF;
    IF v_cash_account_id IS NOT NULL THEN
      v_affected_accounts := ARRAY_APPEND(v_affected_accounts, v_cash_account_id);
    END IF;

    -- 1. If amount changed, adjust transaction amounts
    IF NEW.amount <> OLD.amount THEN
      UPDATE public.fin_bank_transactions
      SET amount = amount - OLD.amount + NEW.amount
      WHERE reference_id = v_ref_id AND reference_type = v_ref_type;

      UPDATE public.fin_bank_transactions
      SET amount = amount - OLD.amount + NEW.amount
      WHERE reference_id = v_ref_id AND reference_type = v_ref_type_outflow;
    END IF;

    -- 2. If deposit_date changed, update transaction dates
    IF NEW.deposit_date <> OLD.deposit_date THEN
      UPDATE public.fin_bank_transactions
      SET transaction_date = NEW.deposit_date
      WHERE reference_id = v_ref_id AND reference_type IN (v_ref_type, v_ref_type_outflow);
    END IF;

    -- 3. If account_id changed, update the Checking account used in the inflow transaction
    IF NEW.account_id IS DISTINCT FROM OLD.account_id AND NEW.account_id IS NOT NULL THEN
      UPDATE public.fin_bank_transactions
      SET account_id = NEW.account_id
      WHERE reference_id = v_ref_id AND reference_type = v_ref_type;
    END IF;

    -- 4. Manage Cash on Hand Outflow based on finance_start_date go-live criteria
    SELECT finance_start_date INTO v_finance_start_date FROM public.app_settings LIMIT 1;
    
    IF v_cash_account_id IS NOT NULL THEN
      IF (v_finance_start_date IS NULL OR NEW.deposit_date >= v_finance_start_date) THEN
        -- Outflow should exist, check if it does
        SELECT id INTO v_existing_outflow_id
        FROM public.fin_bank_transactions
        WHERE reference_id = v_ref_id AND reference_type = v_ref_type_outflow
        LIMIT 1;

        IF v_existing_outflow_id IS NULL THEN
          -- Outflow doesn't exist but should (e.g. date was moved past go-live)
          SELECT COALESCE(SUM(amount), 0) INTO v_existing_outflow_amount
          FROM public.cash_ledger_deposits
          WHERE COALESCE(batch_id, id) = v_ref_id;

          INSERT INTO public.fin_bank_transactions (
            account_id, transaction_date, type, category, description, amount, reference_id, reference_type, branch_id, created_at
          ) VALUES (
            v_cash_account_id, NEW.deposit_date, 'Outflow', 'Cash Deposit',
            CASE WHEN NEW.batch_id IS NOT NULL THEN 'Bank Deposit: Bulk cash deposit from Ledger' ELSE 'Bank Deposit: Cash Revenue - ' || NEW.branch || ' - ' || to_char(NEW.date, 'YYYY-MM-DD') END,
            v_existing_outflow_amount, v_ref_id, v_ref_type_outflow, v_branch_id, NOW()
          );
        END IF;
      ELSE
        -- Outflow should NOT exist because date is before go-live, delete if exists
        DELETE FROM public.fin_bank_transactions
        WHERE reference_id = v_ref_id AND reference_type = v_ref_type_outflow;
      END IF;
    END IF;
  END IF;

  -- --------------------------------------------------
  -- Recalculate balances
  -- --------------------------------------------------
  IF v_affected_accounts IS NOT NULL AND array_length(v_affected_accounts, 1) > 0 THEN
    FOREACH v_acc_id IN ARRAY v_affected_accounts LOOP
      IF v_acc_id IS NOT NULL THEN
        PERFORM public.fin_update_account_balance(v_acc_id);
      END IF;
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 3. Create Trigger
DROP TRIGGER IF EXISTS trg_sync_cash_ledger_deposit ON public.cash_ledger_deposits;
CREATE TRIGGER trg_sync_cash_ledger_deposit
AFTER INSERT OR UPDATE OR DELETE
ON public.cash_ledger_deposits
FOR EACH ROW
EXECUTE FUNCTION public.sync_cash_ledger_deposit();

-- 4. Backfill existing data
-- 4.a Backfill from existing transactions
UPDATE public.cash_ledger_deposits d
SET account_id = t.account_id
FROM public.fin_bank_transactions t
WHERE d.batch_id = t.reference_id AND t.reference_type = 'cash_ledger_batch'
  AND d.account_id IS NULL;

-- 4.b Backfill from branch defaults for the rest
UPDATE public.cash_ledger_deposits d
SET account_id = a.id
FROM public.provider_branches b
JOIN public.fin_bank_accounts a ON a.branch_id = b.id AND a.account_type = 'Checking' AND a.is_active = true
WHERE d.branch = b.name
  AND d.account_id IS NULL;

-- 5. Add RLS policy for accountant read-only access
DROP POLICY IF EXISTS "Accountant read-only access" ON public.cash_ledger_deposits;
CREATE POLICY "Accountant read-only access"
ON public.cash_ledger_deposits
FOR SELECT
TO authenticated
USING (public.app_has_role(ARRAY['accountant']));
