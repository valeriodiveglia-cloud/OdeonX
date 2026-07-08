-- Migrazione per mettere in sicurezza la tabella public.hr_realtime_pings abilitando RLS
-- e consentendo esclusivamente la lettura (SELECT) lato client per il funzionamento del realtime anonimo.

-- 1. Abilitiamo le RLS
ALTER TABLE public.hr_realtime_pings ENABLE ROW LEVEL SECURITY;

-- 2. Rimuoviamo eventuali policy esistenti per evitare conflitti
DROP POLICY IF EXISTS select_pings ON public.hr_realtime_pings;
DROP POLICY IF EXISTS select_own_pings ON public.hr_realtime_pings;

-- 3. Creiamo la policy di lettura (SELECT) per consentire l'ascolto realtime (anonimo e autenticato)
-- Nota: non definiamo policy per INSERT, UPDATE o DELETE. In questo modo le scritture lato client
-- sono bloccate al 100%. Solo i trigger e le funzioni del database (che girano come sistema)
-- potranno scrivere ed eliminare i ping.
CREATE POLICY select_pings ON public.hr_realtime_pings
    FOR SELECT
    USING (true);
