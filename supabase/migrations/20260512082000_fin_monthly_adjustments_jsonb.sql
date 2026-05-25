-- Add JSONB column for custom adjustments
ALTER TABLE public.fin_monthly_adjustments ADD COLUMN custom_adjustments JSONB DEFAULT '[]'::jsonb;

-- Migrate existing data into the new JSONB format
-- We need to build an array of JSON objects if there are any existing non-zero values
UPDATE public.fin_monthly_adjustments
SET custom_adjustments = (
  SELECT jsonb_agg(adj)
  FROM (
    SELECT jsonb_build_object(
      'id', gen_random_uuid(),
      'name', 'Catering Revenue',
      'amount', catering_revenue_vnd,
      'target_group', '01',
      'method', 'extract'
    ) as adj
    WHERE catering_revenue_vnd != 0
    UNION ALL
    SELECT jsonb_build_object(
      'id', gen_random_uuid(),
      'name', 'Sales discount',
      'amount', discounts_vnd,
      'target_group', '02',
      'method', 'add'
    ) as adj
    WHERE discounts_vnd != 0
    UNION ALL
    SELECT jsonb_build_object(
      'id', gen_random_uuid(),
      'name', 'Ending Inventory',
      'amount', ending_inventory_vnd,
      'target_group', '11',
      'method', 'subtract'
    ) as adj
    WHERE ending_inventory_vnd != 0
  ) sub
);

-- If the array is null (because all values were 0), set it back to empty array
UPDATE public.fin_monthly_adjustments
SET custom_adjustments = '[]'::jsonb
WHERE custom_adjustments IS NULL;

-- Drop old columns
ALTER TABLE public.fin_monthly_adjustments DROP COLUMN discounts_vnd;
ALTER TABLE public.fin_monthly_adjustments DROP COLUMN catering_revenue_vnd;
ALTER TABLE public.fin_monthly_adjustments DROP COLUMN ending_inventory_vnd;
