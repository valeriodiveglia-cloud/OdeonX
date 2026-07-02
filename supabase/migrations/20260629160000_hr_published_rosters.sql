-- Migrazione per la gestione dei roster pubblicati e congelati

CREATE TABLE IF NOT EXISTS public.hr_published_rosters (
    branch_id text NOT NULL,
    week_start date NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    published_by uuid,
    roster_snapshot jsonb NOT NULL,
    shifts_snapshot jsonb NOT NULL,
    PRIMARY KEY (branch_id, week_start)
);

-- Abilitazione della Row Level Security (RLS)
ALTER TABLE public.hr_published_rosters ENABLE ROW LEVEL SECURITY;

-- Policy di lettura per utenti autenticati
CREATE POLICY "Enable read access for authenticated users" 
ON public.hr_published_rosters 
FOR SELECT 
TO authenticated 
USING (true);

-- Policy di scrittura per utenti autenticati (allineata a hr_roster_assignments)
CREATE POLICY "Enable all access for managers" 
ON public.hr_published_rosters 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
