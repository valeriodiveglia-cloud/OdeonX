-- Grant table privileges on candidates and hr_activity_log to anon and authenticated roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_activity_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_activity_log TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
