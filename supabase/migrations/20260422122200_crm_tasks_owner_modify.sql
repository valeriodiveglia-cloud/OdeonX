-- Migration to allow owner to modify CRM Tasks

DROP POLICY IF EXISTS "CRM Tasks - Creator Modify" ON crm_tasks;

CREATE POLICY "CRM Tasks - Modify" ON crm_tasks FOR ALL
  USING (
    created_by = auth.uid() 
    OR EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'owner')
  )
  WITH CHECK (
    created_by = auth.uid() 
    OR EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'owner')
  );
