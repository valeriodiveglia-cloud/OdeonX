-- Aggiunta delle nuove colonne per i KPI del POS alla tabella cashier_closings
ALTER TABLE public.cashier_closings
ADD COLUMN IF NOT EXISTS pos_guests integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pos_dining_guests integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pos_dining_revenue_vnd bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS pos_delivery_takeaway_revenue_vnd bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS pos_orders_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pos_takeaway_count integer DEFAULT 0;

-- Ricarica lo schema di PostgREST
NOTIFY pgrst, 'reload schema';
