-- Migration: Add Tanca.io sync fields to public.hr_staff
-- Created at: 2026-07-07

ALTER TABLE public.hr_staff 
  ADD COLUMN IF NOT EXISTS staff_code text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS bank_branch text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS document_issue_date date,
  ADD COLUMN IF NOT EXISTS document_issue_place text;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
