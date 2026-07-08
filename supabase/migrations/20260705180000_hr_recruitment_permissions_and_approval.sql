-- Migration: HR Recruitment Permissions and Offer Approval Workflow
-- Description: Add offer approval status columns to candidates and define RLS policies for branch scoping.

-- 1. Add offer approval columns to candidates table
ALTER TABLE public.candidates 
ADD COLUMN IF NOT EXISTS offer_approval_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS offer_approval_notes TEXT,
ADD COLUMN IF NOT EXISTS offer_approval_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS offer_approval_at TIMESTAMPTZ;

-- 2. Drop existing wide-open policies on hiring_requests and candidates
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.hiring_requests;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.candidates;

-- 3. Create RLS policies for hiring_requests
-- Admin & Owner: Full Access
CREATE POLICY "hiring_requests_admin_all" ON public.hiring_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_accounts 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_accounts 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );

-- Manager: Branch-Scoped Select
CREATE POLICY "hiring_requests_manager_select" ON public.hiring_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_accounts a
      WHERE a.user_id = auth.uid() 
      AND a.role = 'manager'
      AND a.branches && branch_ids
    )
  );

-- Manager: Branch-Scoped Insert
CREATE POLICY "hiring_requests_manager_insert" ON public.hiring_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_accounts a
      WHERE a.user_id = auth.uid() 
      AND a.role = 'manager'
      AND a.branches && branch_ids
    )
  );

-- Manager: Branch-Scoped Update (Cannot delete, only update within branch)
CREATE POLICY "hiring_requests_manager_update" ON public.hiring_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_accounts a
      WHERE a.user_id = auth.uid() 
      AND a.role = 'manager'
      AND a.branches && branch_ids
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_accounts a
      WHERE a.user_id = auth.uid() 
      AND a.role = 'manager'
      AND a.branches && branch_ids
    )
  );


-- 4. Create RLS policies for candidates
-- Admin & Owner: Full Access
CREATE POLICY "candidates_admin_all" ON public.candidates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_accounts 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_accounts 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );

-- Manager: Branch-Scoped Select (Can only see candidates connected to their visible branch requests)
CREATE POLICY "candidates_manager_select" ON public.candidates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hiring_requests r
      JOIN public.app_accounts a ON a.user_id = auth.uid()
      WHERE r.id = candidates.hiring_request_id
      AND a.role = 'manager'
      AND a.branches && r.branch_ids
    )
  );

-- Manager: Branch-Scoped Insert
CREATE POLICY "candidates_manager_insert" ON public.candidates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hiring_requests r
      JOIN public.app_accounts a ON a.user_id = auth.uid()
      WHERE r.id = hiring_request_id
      AND a.role = 'manager'
      AND a.branches && r.branch_ids
    )
  );

-- Manager: Branch-Scoped Update (Managers can update candidates within their branches)
CREATE POLICY "candidates_manager_update" ON public.candidates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hiring_requests r
      JOIN public.app_accounts a ON a.user_id = auth.uid()
      WHERE r.id = candidates.hiring_request_id
      AND a.role = 'manager'
      AND a.branches && r.branch_ids
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hiring_requests r
      JOIN public.app_accounts a ON a.user_id = auth.uid()
      WHERE r.id = hiring_request_id
      AND a.role = 'manager'
      AND a.branches && r.branch_ids
    )
  );

-- 5. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
