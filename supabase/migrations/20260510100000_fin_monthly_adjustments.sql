CREATE TABLE IF NOT EXISTS public.fin_monthly_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month_key TEXT NOT NULL, -- e.g., '2026-05'
    branch_id TEXT NOT NULL, -- UUID or 'All' if applicable. Wait, provider_branches uses UUID. But they might do it per branch.
    discounts_vnd BIGINT DEFAULT 0,
    catering_revenue_vnd BIGINT DEFAULT 0,
    ending_inventory_vnd BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(month_key, branch_id)
);

ALTER TABLE public.fin_monthly_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON public.fin_monthly_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);
