-- Alter candidates table to add relation to recruitment_postings
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS recruitment_posting_id UUID REFERENCES public.recruitment_postings(id) ON DELETE SET NULL;

-- Notify postgrest of schema reload
NOTIFY pgrst, 'reload schema';
