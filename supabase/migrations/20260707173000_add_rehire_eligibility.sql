-- Tabella hr_staff
ALTER TABLE public.hr_staff 
ADD COLUMN IF NOT EXISTS rehire_eligible boolean DEFAULT true;

-- Tabella candidates
ALTER TABLE public.candidates 
ADD COLUMN IF NOT EXISTS rehire_eligible boolean DEFAULT true;

-- Reload schema postgrest cache
NOTIFY pgrst, 'reload schema';
