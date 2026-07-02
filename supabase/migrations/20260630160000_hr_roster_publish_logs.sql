-- Migrazione per la gestione dei log delle pubblicazioni e sblocchi del roster

CREATE TABLE IF NOT EXISTS public.hr_roster_publish_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id text NOT NULL,
    week_start date NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    published_by uuid,
    action text NOT NULL, -- 'publish' o 'unlock'
    roster_snapshot jsonb NOT NULL,
    shifts_snapshot jsonb NOT NULL
);

-- Abilitazione della Row Level Security (RLS)
ALTER TABLE public.hr_roster_publish_logs ENABLE ROW LEVEL SECURITY;

-- Policy di lettura per utenti autenticati
CREATE POLICY "Enable read access for authenticated users" 
ON public.hr_roster_publish_logs 
FOR SELECT 
TO authenticated 
USING (true);

-- Policy di scrittura per utenti autenticati (allineata a hr_published_rosters)
CREATE POLICY "Enable insert access for authenticated users" 
ON public.hr_roster_publish_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (true);
