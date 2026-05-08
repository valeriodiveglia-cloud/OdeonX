ALTER TABLE app_settings
ADD COLUMN hr_bonus_pt_min_rating NUMERIC DEFAULT 2.5,
ADD COLUMN hr_bonus_14th_min_rating NUMERIC DEFAULT 3.0,
ADD COLUMN hr_bonus_13th_guaranteed_pct INTEGER DEFAULT 80,
ADD COLUMN hr_bonus_13th_perf_pct INTEGER DEFAULT 20,
ADD COLUMN hr_bonus_13th_perf_tiers JSONB DEFAULT '[{"min_rating": 3.0, "multiplier_pct": 100}, {"min_rating": 4.8, "multiplier_pct": 150}]'::jsonb;
