-- Migration: Create Storehouse Module Tables and RLS policies
-- Date: 2026-07-15

-- 0. Helper function to check role of currently authenticated user
CREATE OR REPLACE FUNCTION public.storehouse_user_role()
RETURNS text AS $$
  SELECT role FROM public.app_accounts WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. Create storehouse_locations
CREATE TABLE public.storehouse_locations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    code text UNIQUE NOT NULL,
    type text NOT NULL CHECK (type IN ('branch', 'warehouse', 'kitchen', 'external', 'other')),
    branch_id text REFERENCES public.provider_branches(id) ON DELETE SET NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Create storehouse_inventory_setup
CREATE TABLE public.storehouse_inventory_setup (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    location_id uuid REFERENCES public.storehouse_locations(id) ON DELETE CASCADE NOT NULL,
    item_type text NOT NULL CHECK (item_type IN ('material', 'prep')),
    item_id uuid NOT NULL,
    track_inventory boolean DEFAULT false NOT NULL,
    min_stock numeric DEFAULT 0 NOT NULL,
    par_level numeric DEFAULT 0 NOT NULL,
    reorder_point numeric DEFAULT 0 NOT NULL,
    count_frequency text DEFAULT 'none' NOT NULL CHECK (count_frequency IN ('daily', 'weekly', 'monthly', 'custom', 'none')),
    default_input_method text DEFAULT 'uom' NOT NULL CHECK (default_input_method IN ('uom', 'package', 'batch')),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (location_id, item_type, item_id)
);

-- 3. Create storehouse_movements
CREATE TABLE public.storehouse_movements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    location_id uuid REFERENCES public.storehouse_locations(id) ON DELETE RESTRICT NOT NULL,
    item_type text NOT NULL CHECK (item_type IN ('material', 'prep')),
    item_id uuid NOT NULL,
    movement_type text NOT NULL CHECK (movement_type IN (
        'opening_balance', 'manual_receipt', 'positive_adjustment', 
        'negative_adjustment', 'production_consumption', 'production_output', 
        'stock_count_adjustment'
    )),
    qty_entered numeric NOT NULL,
    unit_entered text NOT NULL,
    qty_base numeric NOT NULL,
    uom_base text NOT NULL,
    unit_cost numeric NOT NULL,
    total_value numeric NOT NULL,
    reason text,
    notes text,
    created_by uuid REFERENCES auth.users(id),
    approved_by uuid REFERENCES auth.users(id),
    reference_type text,
    reference_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. Create storehouse_kitchen_productions
CREATE TABLE public.storehouse_kitchen_productions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    location_id uuid REFERENCES public.storehouse_locations(id) ON DELETE RESTRICT NOT NULL,
    prep_id uuid NOT NULL, -- Logical link to public.prep_recipes(id)
    qty_planned numeric NOT NULL,
    qty_produced numeric NOT NULL,
    batches_count numeric,
    expected_yield numeric NOT NULL,
    actual_yield numeric NOT NULL,
    yield_variance numeric NOT NULL,
    status text DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'confirmed', 'cancelled')),
    notes text,
    ingredients_log jsonb NOT NULL,
    created_by uuid REFERENCES auth.users(id),
    approved_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 5. Create storehouse_stock_counts
CREATE TABLE public.storehouse_stock_counts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    location_id uuid REFERENCES public.storehouse_locations(id) ON DELETE RESTRICT NOT NULL,
    scope text NOT NULL CHECK (scope IN ('full', 'materials_only', 'prep_only', 'categories', 'items')),
    scope_metadata jsonb,
    status text DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'in_progress', 'submitted', 'approved', 'cancelled')),
    notes text,
    created_by uuid REFERENCES auth.users(id),
    approved_by uuid REFERENCES auth.users(id),
    submitted_at timestamp with time zone,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. Create storehouse_stock_count_items
CREATE TABLE public.storehouse_stock_count_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_count_id uuid REFERENCES public.storehouse_stock_counts(id) ON DELETE CASCADE NOT NULL,
    item_type text NOT NULL CHECK (item_type IN ('material', 'prep')),
    item_id uuid NOT NULL,
    qty_theoretical numeric NOT NULL,
    qty_counted numeric,
    variance_qty numeric,
    variance_pct numeric,
    unit_cost numeric NOT NULL,
    variance_value numeric,
    reason text,
    notes text,
    input_details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (stock_count_id, item_type, item_id)
);

-- Enable RLS
ALTER TABLE public.storehouse_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storehouse_inventory_setup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storehouse_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storehouse_kitchen_productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storehouse_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storehouse_stock_count_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE OR REPLACE FUNCTION public.storehouse_has_access()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_accounts 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin', 'manager', 'staff', 'accountant')
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.storehouse_is_manager()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_accounts 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin', 'manager', 'accountant')
  );
$$ LANGUAGE sql SECURITY DEFINER;

DROP POLICY IF EXISTS "Select Locations" ON public.storehouse_locations;
CREATE POLICY "Select Locations" ON public.storehouse_locations
    FOR SELECT TO authenticated USING (public.storehouse_has_access());

DROP POLICY IF EXISTS "Modify Locations" ON public.storehouse_locations;
CREATE POLICY "Modify Locations" ON public.storehouse_locations
    FOR ALL TO authenticated USING (public.storehouse_is_manager()) WITH CHECK (public.storehouse_is_manager());

DROP POLICY IF EXISTS "Select Inventory Setup" ON public.storehouse_inventory_setup;
CREATE POLICY "Select Inventory Setup" ON public.storehouse_inventory_setup
    FOR SELECT TO authenticated USING (public.storehouse_has_access());

DROP POLICY IF EXISTS "Modify Inventory Setup" ON public.storehouse_inventory_setup;
CREATE POLICY "Modify Inventory Setup" ON public.storehouse_inventory_setup
    FOR ALL TO authenticated USING (public.storehouse_is_manager()) WITH CHECK (public.storehouse_is_manager());

DROP POLICY IF EXISTS "Select Movements" ON public.storehouse_movements;
CREATE POLICY "Select Movements" ON public.storehouse_movements
    FOR SELECT TO authenticated USING (public.storehouse_has_access());

DROP POLICY IF EXISTS "Insert Movements" ON public.storehouse_movements;
CREATE POLICY "Insert Movements" ON public.storehouse_movements
    FOR INSERT TO authenticated WITH CHECK (public.storehouse_has_access());

DROP POLICY IF EXISTS "Select Kitchen Productions" ON public.storehouse_kitchen_productions;
CREATE POLICY "Select Kitchen Productions" ON public.storehouse_kitchen_productions
    FOR SELECT TO authenticated USING (public.storehouse_has_access());

DROP POLICY IF EXISTS "Insert Kitchen Productions" ON public.storehouse_kitchen_productions;
CREATE POLICY "Insert Kitchen Productions" ON public.storehouse_kitchen_productions
    FOR INSERT TO authenticated WITH CHECK (public.storehouse_has_access());

DROP POLICY IF EXISTS "Update Kitchen Productions" ON public.storehouse_kitchen_productions;
CREATE POLICY "Update Kitchen Productions" ON public.storehouse_kitchen_productions
    FOR UPDATE TO authenticated USING (public.storehouse_has_access()) WITH CHECK (public.storehouse_has_access());

DROP POLICY IF EXISTS "Select Stock Counts" ON public.storehouse_stock_counts;
CREATE POLICY "Select Stock Counts" ON public.storehouse_stock_counts
    FOR SELECT TO authenticated USING (public.storehouse_has_access());

DROP POLICY IF EXISTS "Insert Stock Counts" ON public.storehouse_stock_counts;
CREATE POLICY "Insert Stock Counts" ON public.storehouse_stock_counts
    FOR INSERT TO authenticated WITH CHECK (public.storehouse_has_access());

DROP POLICY IF EXISTS "Update Stock Counts" ON public.storehouse_stock_counts;
CREATE POLICY "Update Stock Counts" ON public.storehouse_stock_counts
    FOR UPDATE TO authenticated USING (public.storehouse_has_access()) WITH CHECK (public.storehouse_has_access());

DROP POLICY IF EXISTS "Delete Stock Counts" ON public.storehouse_stock_counts;
CREATE POLICY "Delete Stock Counts" ON public.storehouse_stock_counts
    FOR DELETE TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.app_accounts
        WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
      )
    );

DROP POLICY IF EXISTS "Select Stock Count Items" ON public.storehouse_stock_count_items;
CREATE POLICY "Select Stock Count Items" ON public.storehouse_stock_count_items
    FOR SELECT TO authenticated USING (public.storehouse_has_access());

DROP POLICY IF EXISTS "Modify Stock Count Items" ON public.storehouse_stock_count_items;
CREATE POLICY "Modify Stock Count Items" ON public.storehouse_stock_count_items
    FOR ALL TO authenticated USING (public.storehouse_has_access()) WITH CHECK (public.storehouse_has_access());

NOTIFY pgrst, 'reload schema';
