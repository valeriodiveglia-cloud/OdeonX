CREATE TABLE IF NOT EXISTS crm_advisor_agreements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    partner_id UUID REFERENCES crm_partners(id) ON DELETE CASCADE,
    commission_type TEXT DEFAULT 'Acquisition + Maintenance',
    commission_rules JSONB DEFAULT '{"acquisition_pct": 10, "maintenance_pct": 4}',
    status TEXT DEFAULT 'Active',
    valid_until DATE,
    notes TEXT
);

ALTER TABLE crm_advisor_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM Advisor Agreements Manager Access" ON crm_advisor_agreements FOR ALL USING (
    EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('manager', 'owner'))
);
