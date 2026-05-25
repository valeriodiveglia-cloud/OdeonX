-- Rilascia le vecchie policy permissive su credit_payments
DROP POLICY IF EXISTS "credit_payments delete authenticated" ON public.credit_payments;
DROP POLICY IF EXISTS "credit_payments insert authenticated" ON public.credit_payments;
DROP POLICY IF EXISTS "credit_payments select authenticated" ON public.credit_payments;
DROP POLICY IF EXISTS "credit_payments update authenticated" ON public.credit_payments;
DROP POLICY IF EXISTS "credit_payments_select_all" ON public.credit_payments;

-- Rilascia le vecchie policy permissive su daily_report_settings
DROP POLICY IF EXISTS "daily_report_settings_insert_auth" ON public.daily_report_settings;
DROP POLICY IF EXISTS "daily_report_settings_select_auth" ON public.daily_report_settings;
DROP POLICY IF EXISTS "daily_report_settings_update_auth" ON public.daily_report_settings;

-- Assicura RLS attiva su entrambe le tabelle
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_report_settings ENABLE ROW LEVEL SECURITY;

-- Crea le nuove policy restrittive per credit_payments
CREATE POLICY "App users full access" ON public.credit_payments
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE app_accounts.user_id = auth.uid() AND app_accounts.role = ANY (ARRAY['admin'::text, 'staff'::text, 'manager'::text, 'owner'::text])))
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE app_accounts.user_id = auth.uid() AND app_accounts.role = ANY (ARRAY['admin'::text, 'staff'::text, 'manager'::text, 'owner'::text])));

CREATE POLICY "Accountant read access" ON public.credit_payments
  FOR SELECT TO authenticated
  USING (public.app_has_role(ARRAY['accountant']));

-- Crea le nuove policy restrittive per daily_report_settings
CREATE POLICY "App users full access" ON public.daily_report_settings
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE app_accounts.user_id = auth.uid() AND app_accounts.role = ANY (ARRAY['admin'::text, 'staff'::text, 'manager'::text, 'owner'::text])))
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE app_accounts.user_id = auth.uid() AND app_accounts.role = ANY (ARRAY['admin'::text, 'staff'::text, 'manager'::text, 'owner'::text])));

CREATE POLICY "Accountant read access" ON public.daily_report_settings
  FOR SELECT TO authenticated
  USING (public.app_has_role(ARRAY['accountant']));
