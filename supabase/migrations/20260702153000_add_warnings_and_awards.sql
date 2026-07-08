-- Migration: Add HR Awards and Warnings tables
-- Created at: 2026-07-02

-- 1. Create hr_awards_catalog table
CREATE TABLE IF NOT EXISTS public.hr_awards_catalog (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    award_name text NOT NULL,
    default_amount numeric(15,2) DEFAULT 0 NOT NULL,
    applicability_type text NOT NULL DEFAULT 'global'::text,
    target_id uuid,
    category_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hr_awards_catalog_pkey PRIMARY KEY (id),
    CONSTRAINT hr_awards_catalog_applicability_check CHECK (applicability_type = ANY (ARRAY['global'::text, 'department'::text, 'position'::text])),
    CONSTRAINT hr_awards_catalog_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.hr_disciplinary_categories(id) ON DELETE SET NULL
);

ALTER TABLE public.hr_awards_catalog OWNER TO postgres;
ALTER TABLE public.hr_awards_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to hr_awards_catalog" ON public.hr_awards_catalog 
    TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE public.hr_awards_catalog TO authenticated;


-- 2. Create hr_staff_awards table
CREATE TABLE IF NOT EXISTS public.hr_staff_awards (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    staff_id uuid NOT NULL,
    date date NOT NULL,
    award_name text NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    notified_by text,
    deduction_source text DEFAULT 'salary'::text, -- o credit_source, teniamo coerente
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hr_staff_awards_pkey PRIMARY KEY (id),
    CONSTRAINT hr_staff_awards_status_check CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'waived'::text, 'disputed'::text])),
    CONSTRAINT hr_staff_awards_deduction_source_check CHECK (deduction_source = ANY (ARRAY['salary'::text, 'service_charge'::text, 'cash'::text])),
    CONSTRAINT hr_staff_awards_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.hr_staff(id) ON DELETE CASCADE
);

ALTER TABLE public.hr_staff_awards OWNER TO postgres;
ALTER TABLE public.hr_staff_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users full access to hr_staff_awards" ON public.hr_staff_awards 
    TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE public.hr_staff_awards TO authenticated;


-- 3. Create hr_staff_warnings table
CREATE TABLE IF NOT EXISTS public.hr_staff_warnings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    staff_id uuid NOT NULL,
    date date NOT NULL,
    flag_type text NOT NULL,
    reason text NOT NULL,
    notified_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hr_staff_warnings_pkey PRIMARY KEY (id),
    CONSTRAINT hr_staff_warnings_flag_type_check CHECK (flag_type = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text])),
    CONSTRAINT hr_staff_warnings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.hr_staff(id) ON DELETE CASCADE
);

ALTER TABLE public.hr_staff_warnings OWNER TO postgres;
ALTER TABLE public.hr_staff_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users full access to hr_staff_warnings" ON public.hr_staff_warnings 
    TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE public.hr_staff_warnings TO authenticated;
