-- Add flexible commission structure to app_settings
ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS crm_commission_type TEXT DEFAULT 'Acquisition + Maintenance',
    ADD COLUMN IF NOT EXISTS crm_commission_rules JSONB DEFAULT '{"acquisition_pct": 10, "maintenance_pct": 4}';
