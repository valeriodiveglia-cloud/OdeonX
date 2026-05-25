-- Parte 1: Aggiornamento dei vincoli sui Ruoli
-- Rimuove e ricrea il vincolo includendo 'accountant'
ALTER TABLE public.app_accounts DROP CONSTRAINT IF EXISTS app_accounts_role_check;
ALTER TABLE public.app_accounts ADD CONSTRAINT app_accounts_role_check 
  CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'sale advisor', 'accountant'));

-- Parte 2: Configurazione RLS per le Tabelle Finance
-- Rimuove dinamicamente tutte le policy esistenti sulle tabelle fin_
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename LIKE 'fin_%'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- Abilita RLS su tutte le 18 tabelle del modulo Finance
ALTER TABLE public.fin_chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_payment_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_corporate_card_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_cashout_category_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_monthly_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_pnl_allocation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_inventory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_cashflow_category_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_monthly_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_inventory_category_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_revenue_channel_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_calendar_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_reminder_dismissals ENABLE ROW LEVEL SECURITY;

-- Crea la nuova policy restrittiva (solo owner e accountant) per ogni tabella Finance
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_chart_of_accounts FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_bank_accounts FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_invoices FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_payment_orders FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_payment_order_items FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_bank_transactions FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_corporate_card_expenses FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_cashout_category_mapping FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_monthly_adjustments FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_pnl_allocation_settings FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_inventory_records FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_cashflow_category_mapping FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_monthly_balances FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_inventory_category_mapping FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_tax_settings FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_revenue_channel_mapping FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_calendar_reminders FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_reminder_dismissals FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));


-- Parte 3: Integrazione Ruolo Accountant sui Daily Reports
-- Rimuove eventuali policy esistenti per l'accountant sui Daily Reports per evitare duplicati
DROP POLICY IF EXISTS "Accountant read access" ON public.cashier_closings;
DROP POLICY IF EXISTS "Accountant read access" ON public.cashout;
DROP POLICY IF EXISTS "Accountant read access" ON public.credits;
DROP POLICY IF EXISTS "Accountant read access" ON public.daily_report_bank_transfers;
DROP POLICY IF EXISTS "Accountant read access" ON public.deposit_payments;
DROP POLICY IF EXISTS "Accountant read access" ON public.deposits;
DROP POLICY IF EXISTS "Accountant read access" ON public.wastage_entries;

-- Crea le policy di lettura per l'accountant
CREATE POLICY "Accountant read access" ON public.cashier_closings FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.cashout FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.credits FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.daily_report_bank_transfers FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.deposit_payments FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.deposits FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.wastage_entries FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

-- Aggiunge la policy di UPDATE limitata per l'accountant sulla tabella cashout
DROP POLICY IF EXISTS "Accountant update access" ON public.cashout;
CREATE POLICY "Accountant update access" ON public.cashout FOR UPDATE TO authenticated USING (public.app_has_role(ARRAY['accountant'])) WITH CHECK (public.app_has_role(ARRAY['accountant']));

-- Funzione di trigger per verificare che l'accountant modifichi SOLO invoice_id in cashout
CREATE OR REPLACE FUNCTION public.check_cashout_update_restriction()
RETURNS TRIGGER AS $$
BEGIN
  IF public.app_has_role(ARRAY['accountant']) THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.date IS DISTINCT FROM OLD.date OR
       NEW.description IS DISTINCT FROM OLD.description OR
       NEW.category IS DISTINCT FROM OLD.category OR
       NEW.amount IS DISTINCT FROM OLD.amount OR
       NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR
       NEW.supplier_name IS DISTINCT FROM OLD.supplier_name OR
       NEW.invoice IS DISTINCT FROM OLD.invoice OR
       NEW.delivery_note IS DISTINCT FROM OLD.delivery_note OR
       NEW.shift IS DISTINCT FROM OLD.shift OR
       NEW.paid_by IS DISTINCT FROM OLD.paid_by OR
       NEW.created_at IS DISTINCT FROM OLD.created_at OR
       NEW.updated_at IS DISTINCT FROM OLD.updated_at OR
       NEW.input_time IS DISTINCT FROM OLD.input_time OR
       NEW.branch IS DISTINCT FROM OLD.branch
    THEN
      RAISE EXCEPTION 'Gli accountants possono modificare solo il campo invoice_id di un cashout.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Associa il trigger alla tabella cashout
DROP TRIGGER IF EXISTS trg_cashout_accountant_restriction ON public.cashout;
CREATE TRIGGER trg_cashout_accountant_restriction
  BEFORE UPDATE ON public.cashout
  FOR EACH ROW
  EXECUTE FUNCTION public.check_cashout_update_restriction();
