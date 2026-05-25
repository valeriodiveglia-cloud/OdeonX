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
