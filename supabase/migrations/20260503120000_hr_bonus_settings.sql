ALTER TABLE app_settings
ADD COLUMN hr_bonus_14th_base_years INTEGER DEFAULT 3,
ADD COLUMN hr_bonus_14th_steps JSONB DEFAULT '[60, 70, 80, 90, 100]'::jsonb;
