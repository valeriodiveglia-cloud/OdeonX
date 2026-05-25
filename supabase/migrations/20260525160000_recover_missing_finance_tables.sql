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

