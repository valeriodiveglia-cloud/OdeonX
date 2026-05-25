-- Add SELECT (read) access for the accountant role to CRM tables
DROP POLICY IF EXISTS "Accountant read access" ON public.crm_partners;
CREATE POLICY "Accountant read access" ON public.crm_partners FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.crm_agreements;
CREATE POLICY "Accountant read access" ON public.crm_agreements FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.crm_referrals;
CREATE POLICY "Accountant read access" ON public.crm_referrals FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.crm_interactions;
CREATE POLICY "Accountant read access" ON public.crm_interactions FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.crm_payouts;
CREATE POLICY "Accountant read access" ON public.crm_payouts FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.crm_tasks;
CREATE POLICY "Accountant read access" ON public.crm_tasks FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
