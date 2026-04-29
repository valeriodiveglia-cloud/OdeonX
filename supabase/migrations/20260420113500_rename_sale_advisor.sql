-- Drop the old constraint first so we can update the data
ALTER TABLE app_accounts DROP CONSTRAINT IF EXISTS app_accounts_role_check;

-- Rename 'sale_advisor' to 'sale advisor' in app_accounts
UPDATE app_accounts SET role = 'sale advisor' WHERE role = 'sale_advisor';

-- Create a new constraint allowing 'sale advisor'
ALTER TABLE app_accounts ADD CONSTRAINT app_accounts_role_check CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'sale advisor'));

-- Drop old policies
DROP POLICY IF EXISTS "CRM Partners Sale Advisor Select" ON crm_partners;
DROP POLICY IF EXISTS "CRM Partners Sale Advisor Insert" ON crm_partners;
DROP POLICY IF EXISTS "CRM Partners Sale Advisor Update" ON crm_partners;
DROP POLICY IF EXISTS "CRM Agreements Sale Advisor Select" ON crm_agreements;
DROP POLICY IF EXISTS "CRM Agreements Sale Advisor Insert" ON crm_agreements;
DROP POLICY IF EXISTS "CRM Agreements Sale Advisor Update" ON crm_agreements;
DROP POLICY IF EXISTS "CRM Interactions Sale Advisor Select" ON crm_interactions;
DROP POLICY IF EXISTS "CRM Interactions Sale Advisor Insert" ON crm_interactions;
DROP POLICY IF EXISTS "CRM Interactions Sale Advisor Update" ON crm_interactions;
DROP POLICY IF EXISTS "App users full access" ON crm_tasks;

-- Recreate policies with 'sale advisor'

-- Update CRM Tasks to include sale advisor
CREATE POLICY "App users full access" ON crm_tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('admin','staff','manager','owner','sale advisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('admin','staff','manager','owner','sale advisor')));

-- Add sale advisor policies for crm_partners
CREATE POLICY "CRM Partners Sale Advisor Select" ON crm_partners FOR SELECT
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale advisor'));

CREATE POLICY "CRM Partners Sale Advisor Insert" ON crm_partners FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale advisor') AND owner_id = auth.uid());

CREATE POLICY "CRM Partners Sale Advisor Update" ON crm_partners FOR UPDATE
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale advisor') AND owner_id = auth.uid());

-- Add sale advisor policies for crm_agreements
CREATE POLICY "CRM Agreements Sale Advisor Select" ON crm_agreements FOR SELECT
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale advisor'));

CREATE POLICY "CRM Agreements Sale Advisor Insert" ON crm_agreements FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale advisor') AND EXISTS (SELECT 1 FROM crm_partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()));

CREATE POLICY "CRM Agreements Sale Advisor Update" ON crm_agreements FOR UPDATE
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale advisor') AND EXISTS (SELECT 1 FROM crm_partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()));

-- Add sale advisor policies for crm_interactions
CREATE POLICY "CRM Interactions Sale Advisor Select" ON crm_interactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale advisor'));

CREATE POLICY "CRM Interactions Sale Advisor Insert" ON crm_interactions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale advisor') AND EXISTS (SELECT 1 FROM crm_partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()));

CREATE POLICY "CRM Interactions Sale Advisor Update" ON crm_interactions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'sale advisor') AND EXISTS (SELECT 1 FROM crm_partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()));
