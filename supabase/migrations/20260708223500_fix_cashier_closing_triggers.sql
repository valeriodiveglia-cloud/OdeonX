-- Migration: Fix Cashier Closing Triggers
-- Description:
-- 1. Fix fn_trigger_daily_reports_notifications() to cast NEW.branch_id to text to avoid type mismatch text = uuid.
-- 2. Define sync_cashier_closing_finance() with SECURITY DEFINER and public. schema prefix.

-- 1. Aggiornamento fn_trigger_daily_reports_notifications
CREATE OR REPLACE FUNCTION public.fn_trigger_daily_reports_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_name text;
    v_branch_id text;
BEGIN
    -- Chiusura cassa inviata
    IF TG_TABLE_NAME = 'cashier_closings' AND TG_OP = 'INSERT' THEN
        SELECT name INTO v_branch_name 
        FROM public.provider_branches 
        WHERE id = NEW.branch_id::text;
        
        IF v_branch_name IS NULL THEN
            v_branch_name := NEW.branch_id::text;
        END IF;

        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
        VALUES (
            'daily_reports',
            'Cashier Closing Submitted',
            'Đóng ca bán hàng đã nộp',
            'Cashier closing submitted for branch: ' || coalesce(v_branch_name, ''),
            'Báo cáo đóng ca đã được nộp cho chi nhánh: ' || coalesce(v_branch_name, ''),
            ARRAY['owner', 'admin', 'accountant'],
            NEW.branch_id::text
        );
    END IF;

    -- Nuovo deposito registrato
    IF TG_TABLE_NAME = 'deposits' AND TG_OP = 'INSERT' THEN
        -- Cerca l'ID del branch in base al nome (se NEW.branch contiene il nome)
        SELECT id::text INTO v_branch_id
        FROM public.provider_branches
        WHERE name = NEW.branch OR id::text = NEW.branch
        LIMIT 1;

        IF v_branch_id IS NULL THEN
            v_branch_id := NEW.branch;
        END IF;

        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
        VALUES (
            'daily_reports',
            'New Deposit Registered',
            'Khoản nộp tiền mới',
            'New cash deposit of ' || coalesce(NEW.amount_vnd::text, '0') || ' VND registered.',
            'Khoản nộp tiền mặt mới trị giá ' || coalesce(NEW.amount_vnd::text, '0') || ' VND đã ghi nhận.',
            ARRAY['owner', 'admin', 'accountant'],
            v_branch_id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Aggiornamento sync_cashier_closing_finance
CREATE OR REPLACE FUNCTION public.sync_cashier_closing_finance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_branch_id TEXT;
  v_cash_account_id UUID;
  v_checking_account_id UUID;
  
  -- MPOS Mapping
  v_mpos_wallet_id UUID;
  v_mpos_comm NUMERIC;
  v_mpos_delay INT;
  v_mpos_skip BOOLEAN;
  v_mpos_settle_date DATE;
  v_mpos_net NUMERIC;
  v_mpos_fee NUMERIC;
  
  -- TP Mapping
  v_tp_wallet_id UUID;
  v_tp_comm NUMERIC;
  v_tp_delay INT;
  v_tp_skip BOOLEAN;
  v_tp_settle_date DATE;
  v_tp_net NUMERIC;
  v_tp_fee NUMERIC;
  
  v_c_cash BIGINT;
  v_p_total BIGINT;
  v_cash_to_take BIGINT;
  v_tp_elem JSONB;
  v_tp_label TEXT;
  v_tp_amount NUMERIC;
  v_affected_accounts UUID[] := '{}';
  v_acc_id UUID;
BEGIN
  -- 1. Se UPDATE o DELETE, raccogliamo gli account_id attualmente associati per ricalcolarli dopo la cancellazione
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT COALESCE(ARRAY_AGG(DISTINCT account_id), '{}') INTO v_affected_accounts
    FROM public.fin_bank_transactions
    WHERE reference_id = OLD.id;
    
    DELETE FROM public.fin_bank_transactions WHERE reference_id = OLD.id;
  END IF;

  -- 2. Se INSERT o UPDATE, inseriamo le nuove transazioni
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    -- Trova il branch_id dal nome del branch in provider_branches
    SELECT id INTO v_branch_id
    FROM public.provider_branches
    WHERE name = NEW.branch_name
    LIMIT 1;

    -- Trova il conto Checking (banca) del branch
    SELECT id INTO v_checking_account_id
    FROM public.fin_bank_accounts
    WHERE branch_id = v_branch_id AND account_type = 'Checking' AND is_active = true
    LIMIT 1;

    -- A. Cash on Hand (Inflow)
    v_c_cash := public.calc_cash_from_json(NEW.cash_json);
    v_p_total := public.calc_cash_from_json(NEW.float_plan_json);
    
    IF v_p_total > 0 THEN
      v_cash_to_take := v_p_total;
    ELSE
      v_cash_to_take := GREATEST(0, v_c_cash - COALESCE(NEW.opening_float_vnd, 0));
    END IF;

    IF v_cash_to_take > 0 THEN
      -- Trova conto Cash per questo branch
      SELECT id INTO v_cash_account_id
      FROM public.fin_bank_accounts
      WHERE branch_id = v_branch_id AND account_type = 'Cash' AND is_active = true
      LIMIT 1;

      IF v_cash_account_id IS NOT NULL THEN
        INSERT INTO public.fin_bank_transactions (
          account_id, transaction_date, type, category, description, amount, reference_id, reference_type, branch_id, created_at
        ) VALUES (
          v_cash_account_id, NEW.report_date, 'Inflow', 'Cash Revenue',
          'Cash Revenue - ' || NEW.branch_name || ' - ' || NEW.shift || ' - ' || to_char(NEW.report_date, 'YYYY-MM-DD'),
          v_cash_to_take, NEW.id, 'cashier_closing_cash', v_branch_id, NOW()
        );
        
        IF NOT (v_cash_account_id = ANY(v_affected_accounts)) THEN
          v_affected_accounts := ARRAY_APPEND(v_affected_accounts, v_cash_account_id);
        END IF;
      END IF;
    END IF;

    -- B. MPOS Wallet (Inflow + Settlement)
    IF COALESCE(NEW.mpos_vnd, 0) > 0 THEN
      -- Trova mapping MPOS
      SELECT wallet_account_id, COALESCE(commission_pct, 0), COALESCE(settlement_delay_days, 0), COALESCE(settlement_skip_weekends, false)
      INTO v_mpos_wallet_id, v_mpos_comm, v_mpos_delay, v_mpos_skip
      FROM public.fin_revenue_channel_mapping
      WHERE channel_type = 'mpos' AND is_active = true
      LIMIT 1;

      IF v_mpos_wallet_id IS NOT NULL THEN
        -- B1. Wallet Inflow (al lordo)
        INSERT INTO public.fin_bank_transactions (
          account_id, transaction_date, type, category, description, amount, reference_id, reference_type, branch_id, created_at
        ) VALUES (
          v_mpos_wallet_id, NEW.report_date, 'Inflow', 'Card/POS Revenue',
          'MPOS Revenue - ' || NEW.branch_name || ' - ' || NEW.shift || ' - ' || to_char(NEW.report_date, 'YYYY-MM-DD'),
          NEW.mpos_vnd, NEW.id, 'cashier_closing_mpos', v_branch_id, NOW()
        );

        IF NOT (v_mpos_wallet_id = ANY(v_affected_accounts)) THEN
          v_affected_accounts := ARRAY_APPEND(v_affected_accounts, v_mpos_wallet_id);
        END IF;

        -- B2. Genera i movimenti di Settlement (se abbiamo un conto banca Checking di destinazione)
        IF v_checking_account_id IS NOT NULL THEN
          v_mpos_settle_date := public.calc_settlement_date(NEW.report_date, v_mpos_delay, v_mpos_skip);
          v_mpos_fee := ROUND(NEW.mpos_vnd * (v_mpos_comm / 100.0));
          v_mpos_net := NEW.mpos_vnd - v_mpos_fee;

          -- B2.a Outflow di trasferimento dal Wallet al conto Checking (al netto delle commissioni)
          INSERT INTO public.fin_bank_transactions (
            account_id, transaction_date, type, category, description, amount, reference_id, reference_type, counterpart_account_id, branch_id, created_at
          ) VALUES (
            v_mpos_wallet_id, v_mpos_settle_date, 'Outflow', 'Bank Transfer',
            'MPOS Settlement Transfer to checking - ' || NEW.branch_name || ' - ' || to_char(NEW.report_date, 'YYYY-MM-DD'),
            v_mpos_net, NEW.id, 'cashier_closing_mpos_settle', v_checking_account_id, v_branch_id, NOW()
          );

          -- B2.b Inflow di ricezione sul conto Checking
          INSERT INTO public.fin_bank_transactions (
            account_id, transaction_date, type, category, description, amount, reference_id, reference_type, counterpart_account_id, branch_id, created_at
          ) VALUES (
            v_checking_account_id, v_mpos_settle_date, 'Inflow', 'Bank Transfer',
            'MPOS Settlement Inflow - ' || NEW.branch_name || ' - ' || to_char(NEW.report_date, 'YYYY-MM-DD'),
            v_mpos_net, NEW.id, 'cashier_closing_mpos_settle', v_mpos_wallet_id, v_branch_id, NOW()
          );

          -- B2.c Outflow commissioni bancarie dal Wallet
          IF v_mpos_fee > 0 THEN
            INSERT INTO public.fin_bank_transactions (
              account_id, transaction_date, type, category, description, amount, reference_id, reference_type, branch_id, created_at
            ) VALUES (
              v_mpos_wallet_id, v_mpos_settle_date, 'Outflow', 'Bank Fees',
              'MPOS Settlement Fee (' || v_mpos_comm || '%) - ' || NEW.branch_name || ' - ' || to_char(NEW.report_date, 'YYYY-MM-DD'),
              v_mpos_fee, NEW.id, 'cashier_closing_mpos_fee', v_branch_id, NOW()
            );
          END IF;

          -- Raccogliamo il conto Checking per aggiornare il saldo
          IF NOT (v_checking_account_id = ANY(v_affected_accounts)) THEN
            v_affected_accounts := ARRAY_APPEND(v_affected_accounts, v_checking_account_id);
          END IF;
        END IF;
      END IF;
    END IF;

    -- C. Third Party Wallets (Inflow + Settlement)
    IF NEW.third_party_amounts_json IS NOT NULL AND jsonb_array_length(NEW.third_party_amounts_json) > 0 THEN
      FOR v_tp_elem IN SELECT * FROM jsonb_array_elements(NEW.third_party_amounts_json) LOOP
        v_tp_label := v_tp_elem->>'label';
        v_tp_amount := COALESCE((v_tp_elem->>'amount')::NUMERIC, 0);

        IF v_tp_amount > 0 AND v_tp_label IS NOT NULL THEN
          -- Trova mapping per questo canale di terze parti
          SELECT wallet_account_id, COALESCE(commission_pct, 0), COALESCE(settlement_delay_days, 0), COALESCE(settlement_skip_weekends, false)
          INTO v_tp_wallet_id, v_tp_comm, v_tp_delay, v_tp_skip
          FROM public.fin_revenue_channel_mapping
          WHERE channel_type = 'third_party' AND channel_label = v_tp_label AND is_active = true
          LIMIT 1;

          IF v_tp_wallet_id IS NOT NULL THEN
            -- C1. Wallet Inflow (al lordo)
            INSERT INTO public.fin_bank_transactions (
              account_id, transaction_date, type, category, description, amount, reference_id, reference_type, branch_id, created_at
            ) VALUES (
              v_tp_wallet_id, NEW.report_date, 'Inflow', 'Third Party Revenue',
              v_tp_label || ' Revenue - ' || NEW.branch_name || ' - ' || NEW.shift || ' - ' || to_char(NEW.report_date, 'YYYY-MM-DD'),
              v_tp_amount, NEW.id, 'cashier_closing_tp', v_branch_id, NOW()
            );

            IF NOT (v_tp_wallet_id = ANY(v_affected_accounts)) THEN
              v_affected_accounts := ARRAY_APPEND(v_affected_accounts, v_tp_wallet_id);
            END IF;

            -- C2. Genera i movimenti di Settlement (se abbiamo un conto banca Checking di destinazione)
            IF v_checking_account_id IS NOT NULL THEN
              v_tp_settle_date := public.calc_settlement_date(NEW.report_date, v_tp_delay, v_tp_skip);
              v_tp_fee := ROUND(v_tp_amount * (v_tp_comm / 100.0));
              v_tp_net := v_tp_amount - v_tp_fee;

              -- C2.a Outflow di trasferimento dal Wallet al conto Checking (al netto delle commissioni)
              INSERT INTO public.fin_bank_transactions (
                account_id, transaction_date, type, category, description, amount, reference_id, reference_type, counterpart_account_id, branch_id, created_at
              ) VALUES (
                v_tp_wallet_id, v_tp_settle_date, 'Outflow', 'Bank Transfer',
                v_tp_label || ' Settlement Transfer to checking - ' || NEW.branch_name || ' - ' || to_char(NEW.report_date, 'YYYY-MM-DD'),
                v_tp_net, NEW.id, 'cashier_closing_tp_settle', v_checking_account_id, v_branch_id, NOW()
              );

              -- C2.b Inflow di ricezione sul conto Checking
              INSERT INTO public.fin_bank_transactions (
                account_id, transaction_date, type, category, description, amount, reference_id, reference_type, counterpart_account_id, branch_id, created_at
              ) VALUES (
                v_checking_account_id, v_tp_settle_date, 'Inflow', 'Bank Transfer',
                v_tp_label || ' Settlement Inflow - ' || NEW.branch_name || ' - ' || to_char(NEW.report_date, 'YYYY-MM-DD'),
                v_tp_net, NEW.id, 'cashier_closing_tp_settle', v_tp_wallet_id, v_branch_id, NOW()
              );

              -- C2.c Outflow commissioni bancarie dal Wallet
              IF v_tp_fee > 0 THEN
                INSERT INTO public.fin_bank_transactions (
                  account_id, transaction_date, type, category, description, amount, reference_id, reference_type, branch_id, created_at
                ) VALUES (
                  v_tp_wallet_id, v_tp_settle_date, 'Outflow', 'Bank Fees',
                  v_tp_label || ' Settlement Fee (' || v_tp_comm || '%) - ' || NEW.branch_name || ' - ' || to_char(NEW.report_date, 'YYYY-MM-DD'),
                  v_tp_fee, NEW.id, 'cashier_closing_tp_fee', v_branch_id, NOW()
                );
              END IF;

              -- Raccogliamo il conto Checking per aggiornare il saldo
              IF NOT (v_checking_account_id = ANY(v_affected_accounts)) THEN
                v_affected_accounts := ARRAY_APPEND(v_affected_accounts, v_checking_account_id);
              END IF;
            END IF;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- 3. Ricalcola saldi di tutti i conti modificati
  IF v_affected_accounts IS NOT NULL AND array_length(v_affected_accounts, 1) > 0 THEN
    FOREACH v_acc_id IN ARRAY v_affected_accounts LOOP
      PERFORM public.fin_update_account_balance(v_acc_id);
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;
