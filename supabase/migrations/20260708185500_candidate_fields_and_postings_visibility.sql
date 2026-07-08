-- Migration to add gender, address, city, date_of_birth to candidates, and link recruitment_postings.posted_by to app_accounts

-- 1. Add fields to public.candidates table if they don't exist
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- 2. Ensure unique constraint on app_accounts(user_id) if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_accounts_user_id_key') THEN
    ALTER TABLE public.app_accounts ADD CONSTRAINT app_accounts_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 3. Update recruitment_postings posted_by foreign key and set default auth.uid()
ALTER TABLE public.recruitment_postings 
  DROP CONSTRAINT IF EXISTS recruitment_postings_posted_by_fkey;

ALTER TABLE public.recruitment_postings
  ADD CONSTRAINT recruitment_postings_posted_by_fkey 
  FOREIGN KEY (posted_by) 
  REFERENCES public.app_accounts(user_id) 
  ON DELETE SET NULL;

ALTER TABLE public.recruitment_postings 
  ALTER COLUMN posted_by SET DEFAULT auth.uid();
