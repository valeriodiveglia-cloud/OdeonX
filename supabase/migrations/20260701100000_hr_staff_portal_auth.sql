-- Migration to add authentication columns to hr_staff table for the staff portal
ALTER TABLE public.hr_staff 
ADD COLUMN IF NOT EXISTS portal_password_hash text,
ADD COLUMN IF NOT EXISTS failed_login_attempts integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS locked_until timestamp with time zone;
