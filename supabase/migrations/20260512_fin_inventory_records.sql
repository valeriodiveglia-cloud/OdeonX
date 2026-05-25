CREATE TABLE public.fin_inventory_records (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    month_key text NOT NULL,
    branch_id text REFERENCES public.provider_branches(id) ON DELETE CASCADE,
    item_type text NOT NULL CHECK (item_type IN ('material', 'prep_recipe', 'final_recipe')),
    item_id uuid NOT NULL,
    name text NOT NULL,
    uom text,
    qty numeric NOT NULL DEFAULT 0,
    unit_cost numeric NOT NULL DEFAULT 0,
    total_value numeric NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(month_key, branch_id, item_type, item_id)
);

ALTER TABLE public.fin_inventory_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" 
ON public.fin_inventory_records
FOR ALL USING (auth.role() = 'authenticated');
