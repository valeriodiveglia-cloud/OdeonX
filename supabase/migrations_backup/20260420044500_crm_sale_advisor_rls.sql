-- Fix missing admin privileges on some tables
CREATE POLICY "CRM Admin Access" ON crm_partners FOR ALL USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "CRM Admin Access Agreements" ON crm_agreements FOR ALL USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "CRM Admin Access Interactions" ON crm_interactions FOR ALL USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'admin'));

-- Update CRM Tasks to include sale_advisor
DROP POLICY IF EXISTS "App users full access" ON crm_tasks;
CREATE POLICY "App users full access" ON crm_tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('admin','staff','manager','owner','sale_advisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('admin','staff','manager','owner','sale_advisor')));

-- Add sale_advisor policies for crm_partners
CREATE POLICY "CRM Partners Sale Advisor Select" ON crm_partners FOR SELECT
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale_advisor'));

CREATE POLICY "CRM Partners Sale Advisor Insert" ON crm_partners FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale_advisor') AND owner_id = auth.uid());

CREATE POLICY "CRM Partners Sale Advisor Update" ON crm_partners FOR UPDATE
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale_advisor') AND owner_id = auth.uid());

-- Add sale_advisor policies for crm_agreements
CREATE POLICY "CRM Agreements Sale Advisor Select" ON crm_agreements FOR SELECT
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale_advisor'));

CREATE POLICY "CRM Agreements Sale Advisor Insert" ON crm_agreements FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale_advisor') AND EXISTS (SELECT 1 FROM crm_partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()));

CREATE POLICY "CRM Agreements Sale Advisor Update" ON crm_agreements FOR UPDATE
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale_advisor') AND EXISTS (SELECT 1 FROM crm_partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()));

-- Add sale_advisor policies for crm_interactions
CREATE POLICY "CRM Interactions Sale Advisor Select" ON crm_interactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale_advisor'));

CREATE POLICY "CRM Interactions Sale Advisor Insert" ON crm_interactions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale_advisor') AND EXISTS (SELECT 1 FROM crm_partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()));

CREATE POLICY "CRM Interactions Sale Advisor Update" ON crm_interactions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale_advisor') AND EXISTS (SELECT 1 FROM crm_partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()));
