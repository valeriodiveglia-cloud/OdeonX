-- crm_tasks table

CREATE TABLE IF NOT EXISTS public.crm_tasks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    partner_id uuid REFERENCES public.crm_partners(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    due_date date,
    priority text NOT NULL DEFAULT 'Medium', -- 'Low', 'Medium', 'High'
    status text NOT NULL DEFAULT 'Pending' -- 'Pending', 'In Progress', 'Completed', 'Cancelled'
);

-- Enable RLS
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

-- Optional policies, assuming admin/all access for now based on typical setup
CREATE POLICY "Enable read access for all users" ON public.crm_tasks FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.crm_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.crm_tasks FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.crm_tasks FOR DELETE USING (true);

-- Triggers
CREATE TRIGGER update_crm_tasks_updated_at BEFORE UPDATE ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
