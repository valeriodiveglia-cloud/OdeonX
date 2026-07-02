-- Migration to create hr_staff_assets table
CREATE TABLE IF NOT EXISTS public.hr_staff_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    asset_name text NOT NULL,
    category text, -- es: 'Uniform', 'Device', 'Tool', etc.
    serial_number text,
    assigned_date date DEFAULT current_date NOT NULL,
    return_date date,
    status text DEFAULT 'assigned' NOT NULL, -- 'assigned', 'returned', 'damaged', 'lost'
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hr_staff_assets_pkey PRIMARY KEY (id),
    CONSTRAINT hr_staff_assets_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.hr_staff(id) ON DELETE CASCADE,
    CONSTRAINT hr_staff_assets_status_check CHECK (status = ANY (ARRAY['assigned'::text, 'returned'::text, 'damaged'::text, 'lost'::text]))
);

ALTER TABLE public.hr_staff_assets OWNER TO postgres;

CREATE POLICY "Allow authenticated users full access to hr_staff_assets" ON public.hr_staff_assets TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.hr_staff_assets ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE public.hr_staff_assets TO authenticated;
