-- Create hr_alert_settings table
CREATE TABLE IF NOT EXISTS public.hr_alert_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label TEXT NOT NULL,
    target_field TEXT NOT NULL,
    deactivate_trigger TEXT,
    condition_type TEXT NOT NULL DEFAULT 'before' CHECK (condition_type IN ('before', 'after')),
    days INTEGER,
    scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'department', 'position')),
    scope_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.hr_alert_settings ENABLE ROW LEVEL SECURITY;

-- Policies (same as other HR tables)
CREATE POLICY "Enable all access for authenticated users on hr_alert_settings"
    ON public.hr_alert_settings
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
