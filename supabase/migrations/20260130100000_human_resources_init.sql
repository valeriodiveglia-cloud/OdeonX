-- ENUMS
CREATE TYPE hiring_request_status AS ENUM ('draft', 'submitted', 'in_progress', 'waiting_manager', 'on_hold', 'closed');
CREATE TYPE hiring_request_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE candidate_stage AS ENUM ('new', 'screened', 'interview_scheduled', 'interviewed', 'trial_shift', 'offer_sent', 'hired', 'rejected', 'withdrawn');

-- TABLE: hiring_requests
CREATE TABLE IF NOT EXISTS hiring_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    branch_id TEXT NOT NULL, -- Flexible to match provider_branches id type
    position_title TEXT NOT NULL,
    department TEXT NOT NULL,
    status hiring_request_status DEFAULT 'draft',
    priority hiring_request_priority DEFAULT 'medium',
    headcount INT DEFAULT 1,
    salary_min NUMERIC,
    salary_max NUMERIC,
    currency TEXT DEFAULT 'VND',
    description TEXT,
    requirements TEXT,
    benefits TEXT,
    notes TEXT, -- Internal notes
    created_by UUID REFERENCES auth.users(id)
);

-- TABLE: candidates
CREATE TABLE IF NOT EXISTS candidates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    hiring_request_id UUID REFERENCES hiring_requests(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    cv_url TEXT,
    stage candidate_stage DEFAULT 'new',
    source TEXT,
    notes TEXT
);

-- TABLE: hr_activity_log
CREATE TABLE IF NOT EXISTS hr_activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    hiring_request_id UUID REFERENCES hiring_requests(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id),
    action_type TEXT NOT NULL,
    message TEXT,
    payload JSONB
);

-- Enable RLS
ALTER TABLE hiring_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_activity_log ENABLE ROW LEVEL SECURITY;

-- POLICIES
-- Allow authenticated users to view all for now (MVP)
CREATE POLICY "Enable all access for authenticated users" ON hiring_requests FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON candidates FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON hr_activity_log FOR ALL USING (auth.role() = 'authenticated');
