-- Add SELECT (read-only) access for the accountant role to Costing & Operations tables
DROP POLICY IF EXISTS "Accountant read access" ON public.materials;
CREATE POLICY "Accountant read access" ON public.materials FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.prep_recipes;
CREATE POLICY "Accountant read access" ON public.prep_recipes FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.prep_recipe_items;
CREATE POLICY "Accountant read access" ON public.prep_recipe_items FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.prep_recipe_tags;
CREATE POLICY "Accountant read access" ON public.prep_recipe_tags FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.suppliers;
CREATE POLICY "Accountant read access" ON public.suppliers FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.final_recipes;
CREATE POLICY "Accountant read access" ON public.final_recipes FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.final_recipe_items;
CREATE POLICY "Accountant read access" ON public.final_recipe_items FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));

DROP POLICY IF EXISTS "Accountant read access" ON public.final_recipe_tags;
CREATE POLICY "Accountant read access" ON public.final_recipe_tags FOR SELECT TO authenticated USING (public.app_has_role(ARRAY['accountant']));
