-- Migration: add is_sale_advisor to app_accounts
ALTER TABLE app_accounts ADD COLUMN IF NOT EXISTS is_sale_advisor BOOLEAN DEFAULT false;

-- Update RLS policies to allow is_sale_advisor where appropriate
-- Wait, we already looked at RLS policies and many of them check role = 'sale advisor'
-- If we want to allow 'is_sale_advisor' = true to do the same, we need to update them.
-- Let's do that for the CRM tables.

DROP POLICY IF EXISTS "CRM Admin Access" ON crm_partners;
CREATE POLICY "CRM Admin Access" ON crm_partners FOR ALL USING (EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role = 'admin'));

-- We will just update policies that have 'sale advisor' to include 'is_sale_advisor = true'
-- Actually, wait. It's better to create a function or just replace the specific policies if needed.
-- Let's just add the column first. The user asked "in modo da poterli dare un referral code", they are already owners or admins, so they already bypass most RLS because RLS allows 'owner' and 'admin' on CRM tables (as seen in `crm_sale_advisor_rls.sql`: `role IN ('admin','staff','manager','owner','sale_advisor')`).
-- So we ONLY need the column for filtering in the UI! No need to modify RLS if they already have access!
