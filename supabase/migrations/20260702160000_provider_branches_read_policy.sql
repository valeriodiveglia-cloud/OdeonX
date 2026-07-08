-- Consente a tutti gli utenti autenticati (inclusi accountant e sale advisor) di leggere i branch
DROP POLICY IF EXISTS "provider_branches_select_authenticated" ON public.provider_branches;
CREATE POLICY "provider_branches_select_authenticated" ON public.provider_branches 
  FOR SELECT TO authenticated USING (true);
