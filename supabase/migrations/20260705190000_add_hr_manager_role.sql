-- Migration: Add hr manager role and setup RLS policies
-- Description: Drop role check constraint and recreate with 'hr manager', add global RLS policies for HR Recruitment.

-- 1. Aggiornamento vincolo ruoli su app_accounts
ALTER TABLE public.app_accounts DROP CONSTRAINT IF EXISTS app_accounts_role_check;
ALTER TABLE public.app_accounts ADD CONSTRAINT app_accounts_role_check 
  CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'sale advisor', 'accountant', 'hr manager'));

-- 2. Policy RLS per hiring_requests (hr manager ha accesso ALL)
CREATE POLICY "hiring_requests_hr_manager_all" ON public.hiring_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_accounts 
      WHERE user_id = auth.uid() 
      AND role = 'hr manager'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_accounts 
      WHERE user_id = auth.uid() 
      AND role = 'hr manager'
    )
  );

-- 3. Policy RLS per candidates (hr manager ha accesso ALL)
CREATE POLICY "candidates_hr_manager_all" ON public.candidates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_accounts 
      WHERE user_id = auth.uid() 
      AND role = 'hr manager'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_accounts 
      WHERE user_id = auth.uid() 
      AND role = 'hr manager'
    )
  );

-- 4. Ricarica schema cache per PostgREST
NOTIFY pgrst, 'reload schema';
