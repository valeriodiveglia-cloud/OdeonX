DROP POLICY IF EXISTS "CRM Admin Access" ON "public"."crm_partners";
CREATE POLICY "CRM Admin Access" ON "public"."crm_partners" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'admin'::"text")))));

DROP POLICY IF EXISTS "CRM Admin Access Agreements" ON "public"."crm_agreements";
CREATE POLICY "CRM Admin Access Agreements" ON "public"."crm_agreements" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'admin'::"text")))));

DROP POLICY IF EXISTS "CRM Admin Access Interactions" ON "public"."crm_interactions";
CREATE POLICY "CRM Admin Access Interactions" ON "public"."crm_interactions" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'admin'::"text")))));

DROP POLICY IF EXISTS "CRM Advisor Agreements Manager Access" ON "public"."crm_advisor_agreements";
CREATE POLICY "CRM Advisor Agreements Manager Access" ON "public"."crm_advisor_agreements" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));

DROP POLICY IF EXISTS "CRM Agreements Manager Access" ON "public"."crm_agreements";
CREATE POLICY "CRM Agreements Manager Access" ON "public"."crm_agreements" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));

DROP POLICY IF EXISTS "CRM Agreements Sale Advisor Insert" ON "public"."crm_agreements";
CREATE POLICY "CRM Agreements Sale Advisor Insert" ON "public"."crm_agreements" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_agreements"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "CRM Agreements Sale Advisor Select" ON "public"."crm_agreements";
CREATE POLICY "CRM Agreements Sale Advisor Select" ON "public"."crm_agreements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))));

DROP POLICY IF EXISTS "CRM Agreements Sale Advisor Update" ON "public"."crm_agreements";
CREATE POLICY "CRM Agreements Sale Advisor Update" ON "public"."crm_agreements" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_agreements"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "CRM Agreements Staff Select" ON "public"."crm_agreements";
CREATE POLICY "CRM Agreements Staff Select" ON "public"."crm_agreements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "CRM Interactions Manager Access" ON "public"."crm_interactions";
CREATE POLICY "CRM Interactions Manager Access" ON "public"."crm_interactions" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));

DROP POLICY IF EXISTS "CRM Interactions Sale Advisor Insert" ON "public"."crm_interactions";
CREATE POLICY "CRM Interactions Sale Advisor Insert" ON "public"."crm_interactions" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_interactions"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "CRM Interactions Sale Advisor Select" ON "public"."crm_interactions";
CREATE POLICY "CRM Interactions Sale Advisor Select" ON "public"."crm_interactions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_interactions"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "CRM Interactions Sale Advisor Update" ON "public"."crm_interactions";
CREATE POLICY "CRM Interactions Sale Advisor Update" ON "public"."crm_interactions" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_interactions"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "CRM Partners Manager Access" ON "public"."crm_partners";
CREATE POLICY "CRM Partners Manager Access" ON "public"."crm_partners" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));

DROP POLICY IF EXISTS "CRM Partners Sale Advisor Insert" ON "public"."crm_partners";
CREATE POLICY "CRM Partners Sale Advisor Insert" ON "public"."crm_partners" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND ("owner_id" = "auth"."uid"())));

DROP POLICY IF EXISTS "CRM Partners Sale Advisor Select" ON "public"."crm_partners";
CREATE POLICY "CRM Partners Sale Advisor Select" ON "public"."crm_partners" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))));

DROP POLICY IF EXISTS "CRM Partners Sale Advisor Update" ON "public"."crm_partners";
CREATE POLICY "CRM Partners Sale Advisor Update" ON "public"."crm_partners" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND ("owner_id" = "auth"."uid"())));

DROP POLICY IF EXISTS "CRM Partners Staff Select" ON "public"."crm_partners";
CREATE POLICY "CRM Partners Staff Select" ON "public"."crm_partners" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "CRM Payouts Manager Access" ON "public"."crm_payouts";
CREATE POLICY "CRM Payouts Manager Access" ON "public"."crm_payouts" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));

DROP POLICY IF EXISTS "CRM Payouts Sale Advisor Access" ON "public"."crm_payouts";
CREATE POLICY "CRM Payouts Sale Advisor Access" ON "public"."crm_payouts" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ("sale_advisor_id" = "auth"."uid"())));

DROP POLICY IF EXISTS "CRM Referrals Manager Access" ON "public"."crm_referrals";
CREATE POLICY "CRM Referrals Manager Access" ON "public"."crm_referrals" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));

DROP POLICY IF EXISTS "CRM Referrals Sale Advisor Access" ON "public"."crm_referrals";
CREATE POLICY "CRM Referrals Sale Advisor Access" ON "public"."crm_referrals" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ("sale_advisor_id" = "auth"."uid"())));

DROP POLICY IF EXISTS "CRM Referrals Staff Admin Access" ON "public"."crm_referrals";
CREATE POLICY "CRM Referrals Staff Admin Access" ON "public"."crm_referrals" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "CRM Tasks Sale Advisor Access" ON "public"."crm_tasks";
CREATE POLICY "CRM Tasks Sale Advisor Access" ON "public"."crm_tasks" USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ((("partner_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_tasks"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))) OR ("created_by" = "auth"."uid"())))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ((("partner_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_tasks"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))) OR ("created_by" = "auth"."uid"()))));