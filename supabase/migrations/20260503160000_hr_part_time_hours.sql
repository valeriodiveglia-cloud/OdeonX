CREATE TABLE IF NOT EXISTS public.hr_part_time_hours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES public.hr_staff(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    total_hours NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(staff_id, year)
);

ALTER TABLE public.hr_part_time_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users for hr_part_time_hours"
    ON public.hr_part_time_hours FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert access to authenticated users for hr_part_time_hours"
    ON public.hr_part_time_hours FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update access to authenticated users for hr_part_time_hours"
    ON public.hr_part_time_hours FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow delete access to authenticated users for hr_part_time_hours"
    ON public.hr_part_time_hours FOR DELETE TO authenticated USING (true);
