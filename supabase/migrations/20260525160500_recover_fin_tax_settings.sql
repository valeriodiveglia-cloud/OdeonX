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
