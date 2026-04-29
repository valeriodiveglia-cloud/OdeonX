 CREATE POLICY "CRM Admin Access" ON "public"."crm_partners" USING ((EXISTS ( SELECT 1
    FROM "public"."app_accounts"
   WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'admin'::"text")))));
--
+CREATE POLICY "CRM Advisor Agreements Manager Access" ON "public"."crm_advisor_agreements" USING ((EXISTS ( SELECT 1
+   FROM "public"."app_accounts"
+  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));
--
+CREATE POLICY "CRM Agreements Manager Access" ON "public"."crm_agreements" USING ((EXISTS ( SELECT 1
+   FROM "public"."app_accounts"
+  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));
--
 CREATE POLICY "CRM Agreements Sale Advisor Insert" ON "public"."crm_agreements" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
    FROM "public"."app_accounts"
   WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
--
+CREATE POLICY "CRM Agreements Staff Select" ON "public"."crm_agreements" FOR SELECT USING ((EXISTS ( SELECT 1
+   FROM "public"."app_accounts"
+  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))))));
--
+CREATE POLICY "CRM Interactions Manager Access" ON "public"."crm_interactions" USING ((EXISTS ( SELECT 1
+   FROM "public"."app_accounts"
+  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));
--
 CREATE POLICY "CRM Interactions Sale Advisor Insert" ON "public"."crm_interactions" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
    FROM "public"."app_accounts"
   WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
--
-CREATE POLICY "CRM Interactions Sale Advisor Select" ON "public"."crm_interactions" FOR SELECT USING ((EXISTS ( SELECT 1
-   FROM "public"."app_accounts"
-  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))));
+CREATE POLICY "CRM Interactions Sale Advisor Select" ON "public"."crm_interactions" FOR SELECT USING (((EXISTS ( SELECT 1
+   FROM "public"."app_accounts" "a"
+  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
--
+CREATE POLICY "CRM Partners Manager Access" ON "public"."crm_partners" USING ((EXISTS ( SELECT 1
+   FROM "public"."app_accounts"
+  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));
--
 CREATE POLICY "CRM Partners Sale Advisor Insert" ON "public"."crm_partners" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
    FROM "public"."app_accounts"
   WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND ("owner_id" = "auth"."uid"())));
--
-CREATE POLICY "CRM admin/owner access" ON "public"."crm_agreements" USING ((EXISTS ( SELECT 1
+CREATE POLICY "CRM Partners Staff Select" ON "public"."crm_partners" FOR SELECT USING ((EXISTS ( SELECT 1
    FROM "public"."app_accounts"
-  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
--
-CREATE POLICY "CRM admin/owner access" ON "public"."crm_documents" USING ((EXISTS ( SELECT 1
+CREATE POLICY "CRM Payouts Manager Access" ON "public"."crm_payouts" USING ((EXISTS ( SELECT 1
    FROM "public"."app_accounts"
-  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
--
-CREATE POLICY "CRM admin/owner access" ON "public"."crm_interactions" USING ((EXISTS ( SELECT 1
-   FROM "public"."app_accounts"
-  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
--
+CREATE POLICY "CRM Payouts Sale Advisor Access" ON "public"."crm_payouts" FOR SELECT USING (((EXISTS ( SELECT 1
+   FROM "public"."app_accounts" "a"
+  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ("sale_advisor_id" = "auth"."uid"())));
--
-CREATE POLICY "CRM admin/owner access" ON "public"."crm_partners" USING ((EXISTS ( SELECT 1
+CREATE POLICY "CRM Referrals Manager Access" ON "public"."crm_referrals" USING ((EXISTS ( SELECT 1
    FROM "public"."app_accounts"
-  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
--
-CREATE POLICY "CRM admin/owner access" ON "public"."crm_payouts" USING ((EXISTS ( SELECT 1
-   FROM "public"."app_accounts"
-  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
--
+CREATE POLICY "CRM Referrals Sale Advisor Access" ON "public"."crm_referrals" FOR SELECT USING (((EXISTS ( SELECT 1
+   FROM "public"."app_accounts" "a"
+  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ("sale_advisor_id" = "auth"."uid"())));
--
-CREATE POLICY "CRM admin/owner access" ON "public"."crm_referrals" USING ((EXISTS ( SELECT 1
+CREATE POLICY "CRM Referrals Staff Admin Access" ON "public"."crm_referrals" USING ((EXISTS ( SELECT 1
    FROM "public"."app_accounts"
-  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
--
-CREATE POLICY "CRM admin/owner access" ON "public"."crm_tasks" USING ((EXISTS ( SELECT 1
-   FROM "public"."app_accounts"
-  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
--
+CREATE POLICY "CRM Tasks Sale Advisor Access" ON "public"."crm_tasks" USING (((EXISTS ( SELECT 1
+   FROM "public"."app_accounts" "a"
+  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ((("partner_id" IS NOT NULL) AND (EXISTS ( SELECT 1
