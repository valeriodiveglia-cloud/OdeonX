-- Migration to link hr_activity_log and hiring_requests to app_accounts(user_id) for visibility and tracking

-- 1. Ensure unique constraint on app_accounts(user_id) if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_accounts_user_id_key') THEN
    ALTER TABLE public.app_accounts ADD CONSTRAINT app_accounts_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 2. Update hr_activity_log actor_id foreign key and set default auth.uid()
ALTER TABLE public.hr_activity_log 
  DROP CONSTRAINT IF EXISTS hr_activity_log_actor_id_fkey;

ALTER TABLE public.hr_activity_log
  ADD CONSTRAINT hr_activity_log_actor_id_fkey 
  FOREIGN KEY (actor_id) 
  REFERENCES public.app_accounts(user_id) 
  ON DELETE SET NULL;

ALTER TABLE public.hr_activity_log 
  ALTER COLUMN actor_id SET DEFAULT auth.uid();

-- 3. Update hiring_requests created_by foreign key and set default auth.uid()
ALTER TABLE public.hiring_requests 
  DROP CONSTRAINT IF EXISTS hiring_requests_created_by_fkey;

ALTER TABLE public.hiring_requests
  ADD CONSTRAINT hiring_requests_created_by_fkey 
  FOREIGN KEY (created_by) 
  REFERENCES public.app_accounts(user_id) 
  ON DELETE SET NULL;

ALTER TABLE public.hiring_requests 
  ALTER COLUMN created_by SET DEFAULT auth.uid();
