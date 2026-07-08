-- Migration: Add document, link and application count tracking columns to candidates and hr_staff
-- Date: 2026-07-07

-- 1. Alter candidates table
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS related_staff_id UUID REFERENCES public.hr_staff(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS document_type TEXT CHECK (document_type IN ('id_card', 'passport')),
ADD COLUMN IF NOT EXISTS document_number TEXT,
ADD COLUMN IF NOT EXISTS application_count INT DEFAULT 1 NOT NULL;

-- 2. Alter hr_staff table
ALTER TABLE public.hr_staff
ADD COLUMN IF NOT EXISTS document_type TEXT CHECK (document_type IN ('id_card', 'passport')),
ADD COLUMN IF NOT EXISTS document_number TEXT,
ADD COLUMN IF NOT EXISTS application_count INT DEFAULT 1 NOT NULL;

-- 3. Notify schema reload
NOTIFY pgrst, 'reload schema';
