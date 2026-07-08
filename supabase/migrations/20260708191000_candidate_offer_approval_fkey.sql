-- Migration to link candidates.offer_approval_by to app_accounts(user_id) for join relationship in PostgREST

ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_offer_approval_by_fkey;

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_offer_approval_by_fkey
  FOREIGN KEY (offer_approval_by)
  REFERENCES public.app_accounts(user_id)
  ON DELETE SET NULL;
