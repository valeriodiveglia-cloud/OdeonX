-- Migration for fin_cashout_category_mapping
CREATE TABLE IF NOT EXISTS public.fin_cashout_category_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_name TEXT NOT NULL,
    category_name TEXT NOT NULL,
    account_id UUID REFERENCES public.fin_chart_of_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fin_cashout_category_mapping_branch_category_key UNIQUE (branch_name, category_name)
);

-- Enable RLS
ALTER TABLE public.fin_cashout_category_mapping ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Enable read access for all authenticated users" ON public.fin_cashout_category_mapping
    FOR SELECT TO authenticated USING (true);

-- Allow insert/update access for authenticated users
CREATE POLICY "Enable all actions for authenticated users" ON public.fin_cashout_category_mapping
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
