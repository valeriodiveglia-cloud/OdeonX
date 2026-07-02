-- Migration to extend hr_staff_assets table and add status history log with Postgres triggers

-- 1. Add quantity column if it does not exist
ALTER TABLE public.hr_staff_assets ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1 NOT NULL;

-- 2. Create status history log table
CREATE TABLE IF NOT EXISTS public.hr_staff_asset_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    status text NOT NULL, -- 'assigned', 'returned', 'damaged', 'lost'
    changed_at date DEFAULT current_date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hr_staff_asset_history_pkey PRIMARY KEY (id),
    CONSTRAINT hr_staff_asset_history_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.hr_staff_assets(id) ON DELETE CASCADE,
    CONSTRAINT hr_staff_asset_history_status_check CHECK (status = ANY (ARRAY['assigned'::text, 'returned'::text, 'damaged'::text, 'lost'::text]))
);

ALTER TABLE public.hr_staff_asset_history OWNER TO postgres;

-- Enable RLS and set full authenticated access policies
ALTER TABLE public.hr_staff_asset_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access to hr_staff_asset_history" ON public.hr_staff_asset_history;
CREATE POLICY "Allow authenticated users full access to hr_staff_asset_history" ON public.hr_staff_asset_history TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE public.hr_staff_asset_history TO authenticated;

-- 3. Create the Postgres Trigger to automatically log status changes
CREATE OR REPLACE FUNCTION public.log_hr_staff_asset_status_change()
RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) OR (NEW.notes IS DISTINCT FROM OLD.notes) THEN
        INSERT INTO public.hr_staff_asset_history (asset_id, status, changed_at, notes)
        VALUES (
            NEW.id,
            NEW.status,
            COALESCE(NEW.return_date, NEW.assigned_date, CURRENT_DATE),
            NEW.notes
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_hr_staff_asset_status_change ON public.hr_staff_assets;
CREATE TRIGGER trg_log_hr_staff_asset_status_change
AFTER INSERT OR UPDATE ON public.hr_staff_assets
FOR EACH ROW
EXECUTE FUNCTION public.log_hr_staff_asset_status_change();
