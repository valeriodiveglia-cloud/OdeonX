-- Add interview_answers JSONB to candidates table
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS interview_answers JSONB DEFAULT NULL;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
