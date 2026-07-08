-- Add interview scheduling fields to candidates table
ALTER TABLE public.candidates
ADD COLUMN interview_scheduled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN interview_location TEXT;
