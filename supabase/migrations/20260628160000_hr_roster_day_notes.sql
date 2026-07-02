-- Creazione tabella per le note giornaliere del roster
CREATE TABLE IF NOT EXISTS public.hr_roster_day_notes (
    branch_id TEXT NOT NULL,
    date DATE NOT NULL,
    notes TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (branch_id, date)
);

-- Abilitazione della sicurezza Row Level Security (RLS)
ALTER TABLE public.hr_roster_day_notes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid duplicates
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.hr_roster_day_notes;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.hr_roster_day_notes;

-- Policy di lettura per utenti autenticati
CREATE POLICY "Enable read access for authenticated users"
ON public.hr_roster_day_notes
FOR SELECT
TO authenticated
USING (true);

-- Policy di scrittura/modifica per utenti autenticati
CREATE POLICY "Enable all access for authenticated users"
ON public.hr_roster_day_notes
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
