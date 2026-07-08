-- Migration to add screened_by and interviewed_by columns to candidates table

ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS screened_by UUID REFERENCES public.app_accounts(user_id) ON DELETE SET NULL;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS interviewed_by UUID REFERENCES public.app_accounts(user_id) ON DELETE SET NULL;
