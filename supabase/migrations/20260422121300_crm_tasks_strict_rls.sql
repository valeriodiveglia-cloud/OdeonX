-- Migration for Strict CRM Tasks Permissions and Creator Visibility

-- Add unique constraint to app_accounts if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_accounts_user_id_key') THEN
    ALTER TABLE app_accounts ADD CONSTRAINT app_accounts_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 1. Add Foreign Key for created_by to point to app_accounts(user_id)
-- This allows us to join app_accounts to fetch the creator's name.
ALTER TABLE crm_tasks 
  DROP CONSTRAINT IF EXISTS crm_tasks_created_by_fkey;

ALTER TABLE crm_tasks
  ADD CONSTRAINT crm_tasks_created_by_fkey 
  FOREIGN KEY (created_by) 
  REFERENCES app_accounts(user_id) 
  ON DELETE SET NULL;

-- 2. Drop existing policies on crm_tasks
DROP POLICY IF EXISTS "App users full access" ON crm_tasks;
DROP POLICY IF EXISTS "App users modify access" ON crm_tasks;
DROP POLICY IF EXISTS "App users read access" ON crm_tasks;
DROP POLICY IF EXISTS "CRM Tasks Sale Advisor Access" ON crm_tasks;
DROP POLICY IF EXISTS "CRM admin/owner access" ON crm_tasks;

-- 3. Create Strict RLS Policies

-- Owner can see ALL tasks (SELECT only)
CREATE POLICY "CRM Tasks - Owner Read All" ON crm_tasks FOR SELECT
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'owner'));

-- Sale Advisor can see tasks they created OR tasks attached to partners they manage (SELECT only)
CREATE POLICY "CRM Tasks - Sale Advisor Read" ON crm_tasks FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale advisor')
    AND (
      created_by = auth.uid() 
      OR EXISTS (SELECT 1 FROM crm_partners p WHERE p.id = crm_tasks.partner_id AND p.owner_id = auth.uid())
    )
  );

-- ONLY the Creator of a task can modify or delete it (ALL access for the creator)
-- Note: This handles INSERT, UPDATE, DELETE for anyone as long as they are the creator.
CREATE POLICY "CRM Tasks - Creator Modify" ON crm_tasks FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
