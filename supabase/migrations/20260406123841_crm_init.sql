-- TABLE: crm_partners
CREATE TABLE IF NOT EXISTS crm_partners (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    name TEXT NOT NULL,
    type TEXT,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    status TEXT DEFAULT 'Lead',
    priority TEXT DEFAULT 'Medium',
    pipeline_stage TEXT DEFAULT 'New Leads',
    owner_id UUID REFERENCES auth.users(id),
    notes TEXT
);

-- TABLE: crm_agreements
CREATE TABLE IF NOT EXISTS crm_agreements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    partner_id UUID REFERENCES crm_partners(id) ON DELETE CASCADE,
    commission_type TEXT DEFAULT 'Percentage',
    commission_value NUMERIC DEFAULT 0,
    details TEXT,
    status TEXT DEFAULT 'Draft',
    valid_until DATE
);

-- TABLE: crm_referrals
CREATE TABLE IF NOT EXISTS crm_referrals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    partner_id UUID REFERENCES crm_partners(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    guest_contact TEXT,
    arrival_date DATE,
    party_size INT DEFAULT 1,
    status TEXT DEFAULT 'Pending',
    revenue_generated NUMERIC DEFAULT 0,
    commission_value NUMERIC DEFAULT 0,
    validation_notes TEXT
);

-- TABLE: crm_interactions
CREATE TABLE IF NOT EXISTS crm_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    partner_id UUID REFERENCES crm_partners(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    type TEXT DEFAULT 'Note',
    date TIMESTAMPTZ DEFAULT now(),
    notes TEXT NOT NULL
);

-- TABLE: crm_payouts
CREATE TABLE IF NOT EXISTS crm_payouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    partner_id UUID REFERENCES crm_partners(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Pending',
    payment_date DATE,
    reference_number TEXT,
    notes TEXT
);

-- Enable RLS
ALTER TABLE crm_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_payouts ENABLE ROW LEVEL SECURITY;

-- POLICIES: Only allow users with role 'manager' or 'owner' in app_accounts
CREATE POLICY "CRM Partners Manager Access" ON crm_partners FOR ALL USING (
    EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('manager', 'owner'))
);

CREATE POLICY "CRM Agreements Manager Access" ON crm_agreements FOR ALL USING (
    EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('manager', 'owner'))
);

CREATE POLICY "CRM Referrals Manager Access" ON crm_referrals FOR ALL USING (
    EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('manager', 'owner'))
);

CREATE POLICY "CRM Interactions Manager Access" ON crm_interactions FOR ALL USING (
    EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('manager', 'owner'))
);

CREATE POLICY "CRM Payouts Manager Access" ON crm_payouts FOR ALL USING (
    EXISTS (SELECT 1 FROM app_accounts WHERE user_id = auth.uid() AND role IN ('manager', 'owner'))
);
