-- Migration: Add bank details to hr_staff table
ALTER TABLE public.hr_staff 
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS bank_account_number text,
ADD COLUMN IF NOT EXISTS bank_account_name text,
ADD COLUMN IF NOT EXISTS bank_same_as_staff boolean DEFAULT false;
