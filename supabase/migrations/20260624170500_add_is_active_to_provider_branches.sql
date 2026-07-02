-- Aggiunta della colonna is_active alla tabella provider_branches
ALTER TABLE public.provider_branches ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
