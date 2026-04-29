-- Add owner modify access for CRM tasks
DROP POLICY IF EXISTS "CRM admin/owner access" ON crm_tasks;
CREATE POLICY "CRM admin/owner access" ON crm_tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('admin', 'owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('admin', 'owner')));
