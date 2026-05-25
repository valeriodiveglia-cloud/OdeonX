-- Migration: P&L Allocation Settings
-- Creates a single-row table to store how shared expenses are divided (Equal vs Revenue)

CREATE TABLE IF NOT EXISTS public.fin_pnl_allocation_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    global_strategy VARCHAR(50) NOT NULL DEFAULT 'equal', -- 'equal' or 'revenue'
    exceptions JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { account_id: string, strategy: 'equal' | 'revenue' }
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.fin_pnl_allocation_settings ENABLE ROW LEVEL SECURITY;

-- Policies for anon access (Foodcost typically uses anon key with unrestricted select/update internally for development, let's keep it simple)
CREATE POLICY "Allow select for all" ON public.fin_pnl_allocation_settings FOR SELECT USING (true);
CREATE POLICY "Allow insert for all" ON public.fin_pnl_allocation_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for all" ON public.fin_pnl_allocation_settings FOR UPDATE USING (true);
CREATE POLICY "Allow delete for all" ON public.fin_pnl_allocation_settings FOR DELETE USING (true);

-- Ensure there is always one row
INSERT INTO public.fin_pnl_allocation_settings (global_strategy, exceptions)
SELECT 'equal', '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.fin_pnl_allocation_settings);
