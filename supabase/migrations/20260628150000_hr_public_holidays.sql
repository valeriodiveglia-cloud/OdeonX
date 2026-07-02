-- Creazione tabella per le festività pubbliche
CREATE TABLE IF NOT EXISTS public.hr_public_holidays (
    date DATE PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Abilitazione della sicurezza Row Level Security (RLS)
ALTER TABLE public.hr_public_holidays ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid duplicates
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.hr_public_holidays;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.hr_public_holidays;

-- Policy di lettura per utenti autenticati
CREATE POLICY "Enable read access for authenticated users"
ON public.hr_public_holidays
FOR SELECT
TO authenticated
USING (true);

-- Policy di scrittura/modifica per utenti autenticati
CREATE POLICY "Enable all access for authenticated users"
ON public.hr_public_holidays
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
