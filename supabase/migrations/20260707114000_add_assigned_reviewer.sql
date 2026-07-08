-- Aggiunta della colonna assigned_reviewer_id alla tabella hr_staff_performance
-- per permettere l'assegnazione e la delega delle valutazioni delle performance.

ALTER TABLE public.hr_staff_performance
ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

-- Aggiorna la cache dello schema Supabase
NOTIFY pgrst, 'reload schema';
