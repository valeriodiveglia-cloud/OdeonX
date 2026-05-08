ALTER TABLE app_settings
ADD COLUMN hr_bonus_pt_max_cap NUMERIC DEFAULT 2000000,
ADD COLUMN hr_bonus_pt_target_hours INTEGER DEFAULT 500,
ADD COLUMN hr_bonus_pt_min_hours INTEGER DEFAULT 100;
