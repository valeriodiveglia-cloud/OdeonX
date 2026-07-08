-- Migration to grant SELECT privileges on hr_staff_assets and hr_staff_asset_history to service_role, postgres, and authenticated roles.
-- This ensures that backend API routes using supabaseAdmin can query employee assets for the Staff Portal.

GRANT ALL PRIVILEGES ON TABLE public.hr_staff_assets TO service_role, postgres, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.hr_staff_asset_history TO service_role, postgres, authenticated;
