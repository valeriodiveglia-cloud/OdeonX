-- Recovery of missing finance tables that were missing from local migrations

-- 1. fin_monthly_balances
CREATE TABLE IF NOT EXISTS "public"."fin_monthly_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "month_key" character varying(7) NOT NULL,
    "bank_account_id" "uuid" NOT NULL,
    "opening_balance" numeric DEFAULT 0 NOT NULL,
    "closing_balance" numeric DEFAULT 0 NOT NULL,
    "is_reconciled" boolean DEFAULT false NOT NULL,
    "reconciled_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."fin_monthly_balances" ADD CONSTRAINT "fin_monthly_balances_month_key_bank_account_id_key" UNIQUE ("month_key", "bank_account_id");
ALTER TABLE ONLY "public"."fin_monthly_balances" ADD CONSTRAINT "fin_monthly_balances_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."fin_monthly_balances" ADD CONSTRAINT "fin_monthly_balances_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "public"."fin_bank_accounts"("id") ON DELETE CASCADE;


-- 2. fin_revenue_channel_mapping
CREATE TABLE IF NOT EXISTS "public"."fin_revenue_channel_mapping" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_type" "text" NOT NULL,
    "channel_label" "text",
    "wallet_account_id" "uuid",
    "commission_pct" numeric DEFAULT 0,
    "fee_coa_account_id" "uuid",
    "settlement_delay_days" integer DEFAULT 1,
    "settlement_skip_weekends" boolean DEFAULT false,
    "cashflow_coa_account_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."fin_revenue_channel_mapping" ADD CONSTRAINT "fin_revenue_channel_mapping_channel_type_channel_label_key" UNIQUE ("channel_type", "channel_label");
ALTER TABLE ONLY "public"."fin_revenue_channel_mapping" ADD CONSTRAINT "fin_revenue_channel_mapping_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."fin_revenue_channel_mapping" ADD CONSTRAINT "fin_revenue_channel_mapping_cashflow_coa_account_id_fkey" FOREIGN KEY ("cashflow_coa_account_id") REFERENCES "public"."fin_chart_of_accounts"("id");
ALTER TABLE ONLY "public"."fin_revenue_channel_mapping" ADD CONSTRAINT "fin_revenue_channel_mapping_fee_coa_account_id_fkey" FOREIGN KEY ("fee_coa_account_id") REFERENCES "public"."fin_chart_of_accounts"("id");
ALTER TABLE ONLY "public"."fin_revenue_channel_mapping" ADD CONSTRAINT "fin_revenue_channel_mapping_wallet_account_id_fkey" FOREIGN KEY ("wallet_account_id") REFERENCES "public"."fin_bank_accounts"("id");


-- 3. fin_inventory_category_mapping
CREATE TABLE IF NOT EXISTS "public"."fin_inventory_category_mapping" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" integer,
    "recipe_type" character varying,
    "account_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "category_or_type_check" CHECK (((("category_id" IS NOT NULL) AND ("recipe_type" IS NULL)) OR (("category_id" IS NULL) AND ("recipe_type" IS NOT NULL))))
);

ALTER TABLE ONLY "public"."fin_inventory_category_mapping" ADD CONSTRAINT "fin_inventory_category_mapping_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."fin_inventory_category_mapping" ADD CONSTRAINT "fin_inventory_category_mapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."fin_chart_of_accounts"("id") ON DELETE CASCADE;
-- NOTE: category_id fk refers to categories(id)
ALTER TABLE ONLY "public"."fin_inventory_category_mapping" ADD CONSTRAINT "fin_inventory_category_mapping_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;

-- 4. fin_tax_settings
CREATE TABLE IF NOT EXISTS "public"."fin_tax_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "account_id" "uuid",
    "percentage" numeric NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."fin_tax_settings" ADD CONSTRAINT "fin_tax_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."fin_tax_settings" ADD CONSTRAINT "fin_tax_settings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."fin_chart_of_accounts"("id");
-- Recovery script for missing columns identified in Prod vs Dev comparison

-- 1. app_settings
ALTER TABLE "public"."app_settings" ADD COLUMN IF NOT EXISTS "finance_start_date" text;

-- 2. cashout
ALTER TABLE "public"."cashout" ADD COLUMN IF NOT EXISTS "invoice_id" uuid;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cashout_invoice_id_fkey') THEN
        ALTER TABLE ONLY "public"."cashout" ADD CONSTRAINT "cashout_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."fin_invoices"("id") ON DELETE SET NULL;
    END IF;
END $$;

-- 3. fin_bank_accounts
ALTER TABLE "public"."fin_bank_accounts" ADD COLUMN IF NOT EXISTS "is_corporate_card" boolean DEFAULT false;
ALTER TABLE "public"."fin_bank_accounts" ADD COLUMN IF NOT EXISTS "is_default_corporate_card" boolean DEFAULT false;

-- 4. fin_corporate_card_expenses
ALTER TABLE "public"."fin_corporate_card_expenses" ADD COLUMN IF NOT EXISTS "vat_invoice_status" text DEFAULT 'None'::text;

-- 5. fin_invoices
ALTER TABLE "public"."fin_invoices" ADD COLUMN IF NOT EXISTS "custom_supplier_name" text;
ALTER TABLE "public"."fin_invoices" ADD COLUMN IF NOT EXISTS "is_personal_deduction" boolean DEFAULT false NOT NULL;

-- 6. fin_payment_order_items
ALTER TABLE "public"."fin_payment_order_items" ADD COLUMN IF NOT EXISTS "supplier_id" uuid;
ALTER TABLE "public"."fin_payment_order_items" ADD COLUMN IF NOT EXISTS "requires_invoice" boolean DEFAULT false NOT NULL;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_payment_order_items_supplier_id_fkey') THEN
        ALTER TABLE ONLY "public"."fin_payment_order_items" ADD CONSTRAINT "fin_payment_order_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;
    END IF;
END $$;

-- 7. fin_payment_orders
ALTER TABLE "public"."fin_payment_orders" ADD COLUMN IF NOT EXISTS "vat_invoice_status" text DEFAULT 'None'::text;

-- 8. fin_pnl_allocation_settings
ALTER TABLE "public"."fin_pnl_allocation_settings" ADD COLUMN IF NOT EXISTS "gross_up_accounts" jsonb DEFAULT '[]'::jsonb;
-- Parte 1: Aggiornamento dei vincoli sui Ruoli
-- Rimuove e ricrea il vincolo includendo 'accountant'
ALTER TABLE public.app_accounts DROP CONSTRAINT IF EXISTS app_accounts_role_check;
ALTER TABLE public.app_accounts ADD CONSTRAINT app_accounts_role_check 
  CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'sale advisor', 'accountant'));

-- Parte 2: Configurazione RLS per le Tabelle Finance
-- Rimuove dinamicamente tutte le policy esistenti sulle tabelle fin_
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename LIKE 'fin_%'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- Abilita RLS su tutte le 18 tabelle del modulo Finance
ALTER TABLE public.fin_chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_payment_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_corporate_card_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_cashout_category_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_monthly_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_pnl_allocation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_inventory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_cashflow_category_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_monthly_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_inventory_category_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_revenue_channel_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_calendar_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_reminder_dismissals ENABLE ROW LEVEL SECURITY;

-- Crea la nuova policy restrittiva (solo owner e accountant) per ogni tabella Finance
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_chart_of_accounts FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_bank_accounts FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_invoices FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_payment_orders FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_payment_order_items FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_bank_transactions FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_corporate_card_expenses FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_cashout_category_mapping FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_monthly_adjustments FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_pnl_allocation_settings FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_inventory_records FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_cashflow_category_mapping FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_monthly_balances FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_inventory_category_mapping FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_tax_settings FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_revenue_channel_mapping FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_calendar_reminders FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));
CREATE POLICY "Finance full access for owner and accountant" ON public.fin_reminder_dismissals FOR ALL TO authenticated USING (public.app_has_role(ARRAY['owner', 'accountant'])) WITH CHECK (public.app_has_role(ARRAY['owner', 'accountant']));


-- Parte 3: Integrazione Ruolo Accountant sui Daily Reports
-- Rimuove eventuali policy esistenti per l'accountant sui Daily Reports per evitare duplicati
DROP POLICY IF EXISTS "Accountant read access" ON public.cashier_closings;
DROP POLICY IF EXISTS "Accountant read access" ON public.cashout;
DROP POLICY IF EXISTS "Accountant read access" ON public.credits;
DROP POLICY IF EXISTS "Accountant read access" ON public.daily_report_bank_transfers;
DROP POLICY IF EXISTS "Accountant read access" ON public.deposit_payments;
DROP POLICY IF EXISTS "Accountant read access" ON public.deposits;
DROP POLICY IF EXISTS "Accountant read access" ON public.wastage_entries;

-- Crea le policy di lettura per l'accountant
CREATE POLICY "Accountant read access" ON public.cashier_closings FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.cashout FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.credits FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.daily_report_bank_transfers FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.deposit_payments FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.deposits FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
CREATE POLICY "Accountant read access" ON public.wastage_entries FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

-- Aggiunge la policy di UPDATE limitata per l'accountant sulla tabella cashout
DROP POLICY IF EXISTS "Accountant update access" ON public.cashout;
CREATE POLICY "Accountant update access" ON public.cashout FOR UPDATE TO authenticated USING (public.app_has_role(ARRAY['accountant'])) WITH CHECK (public.app_has_role(ARRAY['accountant']));

-- Funzione di trigger per verificare che l'accountant modifichi SOLO invoice_id in cashout
CREATE OR REPLACE FUNCTION public.check_cashout_update_restriction()
RETURNS TRIGGER AS $$
BEGIN
  IF public.app_has_role(ARRAY['accountant']) THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.date IS DISTINCT FROM OLD.date OR
       NEW.description IS DISTINCT FROM OLD.description OR
       NEW.category IS DISTINCT FROM OLD.category OR
       NEW.amount IS DISTINCT FROM OLD.amount OR
       NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR
       NEW.supplier_name IS DISTINCT FROM OLD.supplier_name OR
       NEW.invoice IS DISTINCT FROM OLD.invoice OR
       NEW.delivery_note IS DISTINCT FROM OLD.delivery_note OR
       NEW.shift IS DISTINCT FROM OLD.shift OR
       NEW.paid_by IS DISTINCT FROM OLD.paid_by OR
       NEW.created_at IS DISTINCT FROM OLD.created_at OR
       NEW.updated_at IS DISTINCT FROM OLD.updated_at OR
       NEW.input_time IS DISTINCT FROM OLD.input_time OR
       NEW.branch IS DISTINCT FROM OLD.branch
    THEN
      RAISE EXCEPTION 'Gli accountants possono modificare solo il campo invoice_id di un cashout.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Associa il trigger alla tabella cashout
DROP TRIGGER IF EXISTS trg_cashout_accountant_restriction ON public.cashout;
CREATE TRIGGER trg_cashout_accountant_restriction
  BEFORE UPDATE ON public.cashout
  FOR EACH ROW
  EXECUTE FUNCTION public.check_cashout_update_restriction();
