-- Add CV screening and interview evaluation columns to candidates table
ALTER TABLE public.candidates
ADD COLUMN english_level TEXT,
ADD COLUMN experience_years TEXT,
ADD COLUMN initial_rating INTEGER,
ADD COLUMN screening_notes TEXT,
ADD COLUMN interview_rating INTEGER,
ADD COLUMN interview_feedback TEXT;
