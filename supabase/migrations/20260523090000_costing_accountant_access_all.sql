-- 1. Allineamento policy SELECT (lettura) su tutte le tabelle di Costing, Ricette, Fornitori e Attrezzature

-- public.materials
DROP POLICY IF EXISTS "Accountant read access" ON public.materials;
DROP POLICY IF EXISTS "materials_select_authenticated" ON public.materials;
DROP POLICY IF EXISTS "materials_sel_active" ON public.materials;
DROP POLICY IF EXISTS "materials_sel_authenticated" ON public.materials;
CREATE POLICY "materials_select_authenticated" ON public.materials FOR SELECT TO authenticated USING (true);

-- public.prep_recipes
DROP POLICY IF EXISTS "Accountant read access" ON public.prep_recipes;
DROP POLICY IF EXISTS "prep_recipes_select_authenticated" ON public.prep_recipes;
DROP POLICY IF EXISTS "prep_recipes_sel_active" ON public.prep_recipes;
DROP POLICY IF EXISTS "prep_recipes_sel_authenticated" ON public.prep_recipes;
CREATE POLICY "prep_recipes_select_authenticated" ON public.prep_recipes FOR SELECT TO authenticated USING (true);

-- public.prep_recipe_items
DROP POLICY IF EXISTS "Accountant read access" ON public.prep_recipe_items;
DROP POLICY IF EXISTS "prep_recipe_items_select_authenticated" ON public.prep_recipe_items;
DROP POLICY IF EXISTS "prep_recipe_items_sel_active" ON public.prep_recipe_items;
DROP POLICY IF EXISTS "prep_recipe_items_sel_authenticated" ON public.prep_recipe_items;
CREATE POLICY "prep_recipe_items_select_authenticated" ON public.prep_recipe_items FOR SELECT TO authenticated USING (true);

-- public.prep_recipe_tags
DROP POLICY IF EXISTS "Accountant read access" ON public.prep_recipe_tags;
DROP POLICY IF EXISTS "prep_recipe_tags_select_authenticated" ON public.prep_recipe_tags;
DROP POLICY IF EXISTS "prep_recipe_tags_sel_active" ON public.prep_recipe_tags;
DROP POLICY IF EXISTS "prep_recipe_tags_sel_authenticated" ON public.prep_recipe_tags;
CREATE POLICY "prep_recipe_tags_select_authenticated" ON public.prep_recipe_tags FOR SELECT TO authenticated USING (true);

-- public.final_recipes
DROP POLICY IF EXISTS "Accountant read access" ON public.final_recipes;
DROP POLICY IF EXISTS "final_recipes_select_authenticated" ON public.final_recipes;
DROP POLICY IF EXISTS "final_recipes_sel_active" ON public.final_recipes;
DROP POLICY IF EXISTS "final_recipes_sel_authenticated" ON public.final_recipes;
CREATE POLICY "final_recipes_select_authenticated" ON public.final_recipes FOR SELECT TO authenticated USING (true);

-- public.final_recipe_items
DROP POLICY IF EXISTS "Accountant read access" ON public.final_recipe_items;
DROP POLICY IF EXISTS "final_recipe_items_select_authenticated" ON public.final_recipe_items;
DROP POLICY IF EXISTS "final_recipe_items_sel_active" ON public.final_recipe_items;
DROP POLICY IF EXISTS "final_recipe_items_sel_authenticated" ON public.final_recipe_items;
CREATE POLICY "final_recipe_items_select_authenticated" ON public.final_recipe_items FOR SELECT TO authenticated USING (true);

-- public.final_recipe_tags
DROP POLICY IF EXISTS "Accountant read access" ON public.final_recipe_tags;
DROP POLICY IF EXISTS "final_recipe_tags_select_authenticated" ON public.final_recipe_tags;
DROP POLICY IF EXISTS "final_recipe_tags_sel_active" ON public.final_recipe_tags;
DROP POLICY IF EXISTS "final_recipe_tags_sel_authenticated" ON public.final_recipe_tags;
CREATE POLICY "final_recipe_tags_select_authenticated" ON public.final_recipe_tags FOR SELECT TO authenticated USING (true);

-- public.suppliers
DROP POLICY IF EXISTS "Accountant read access" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_select_authenticated" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_sel_active" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_sel_authenticated" ON public.suppliers;
DROP POLICY IF EXISTS "sel_authenticated" ON public.suppliers;
CREATE POLICY "suppliers_select_authenticated" ON public.suppliers FOR SELECT TO authenticated USING (true);

-- public.rental_equipment
DROP POLICY IF EXISTS "Accountant read access" ON public.rental_equipment;
DROP POLICY IF EXISTS "rental_equipment_select_authenticated" ON public.rental_equipment;
DROP POLICY IF EXISTS "rental_equipment_sel_active" ON public.rental_equipment;
DROP POLICY IF EXISTS "rental_equipment_sel_authenticated" ON public.rental_equipment;
CREATE POLICY "rental_equipment_select_authenticated" ON public.rental_equipment FOR SELECT TO authenticated USING (true);

-- public.equipment_price_history
DROP POLICY IF EXISTS "eph_select_all" ON public.equipment_price_history;
DROP POLICY IF EXISTS "equipment_price_history_sel_authenticated" ON public.equipment_price_history;
CREATE POLICY "equipment_price_history_select_authenticated" ON public.equipment_price_history FOR SELECT TO authenticated USING (true);

-- public.material_price_history
DROP POLICY IF EXISTS "material_price_history_sel_authenticated" ON public.material_price_history;
DROP POLICY IF EXISTS "mph_select_authenticated" ON public.material_price_history;
CREATE POLICY "material_price_history_select_authenticated" ON public.material_price_history FOR SELECT TO authenticated USING (true);

-- public.recipe_categories
DROP POLICY IF EXISTS "recipe_categories_select_authenticated" ON public.recipe_categories;
DROP POLICY IF EXISTS "recipe_categories_sel_authenticated" ON public.recipe_categories;
CREATE POLICY "recipe_categories_select_authenticated" ON public.recipe_categories FOR SELECT TO authenticated USING (true);

-- public.dish_categories
DROP POLICY IF EXISTS "dish_categories_select_authenticated" ON public.dish_categories;
DROP POLICY IF EXISTS "dish_categories_sel_authenticated" ON public.dish_categories;
CREATE POLICY "dish_categories_select_authenticated" ON public.dish_categories FOR SELECT TO authenticated USING (true);

-- public.equipment_categories
DROP POLICY IF EXISTS "equipment_categories_select_authenticated" ON public.equipment_categories;
DROP POLICY IF EXISTS "equipment_categories_sel_authenticated" ON public.equipment_categories;
CREATE POLICY "equipment_categories_select_authenticated" ON public.equipment_categories FOR SELECT TO authenticated USING (true);

-- public.categories
DROP POLICY IF EXISTS "categories_select_authenticated" ON public.categories;
DROP POLICY IF EXISTS "categories_sel_contrib" ON public.categories;
CREATE POLICY "categories_select_authenticated" ON public.categories FOR SELECT TO authenticated USING (true);

-- public.uom
DROP POLICY IF EXISTS "uom_select_authenticated" ON public.uom;
DROP POLICY IF EXISTS "uom_sel_authenticated" ON public.uom;
CREATE POLICY "uom_select_authenticated" ON public.uom FOR SELECT TO authenticated USING (true);

-- public.tags
DROP POLICY IF EXISTS "tags_select_authenticated" ON public.tags;
DROP POLICY IF EXISTS "tags_sel_authenticated" ON public.tags;
DROP POLICY IF EXISTS "tags_select_auth" ON public.tags;
CREATE POLICY "tags_select_authenticated" ON public.tags FOR SELECT TO authenticated USING (true);


-- 2. Permessi di Scrittura (ALL) su public.suppliers per l'accountant e altri ruoli abilitati
DROP POLICY IF EXISTS "suppliers_mod_active" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_write_policy" ON public.suppliers;
CREATE POLICY "suppliers_write_policy" ON public.suppliers 
  FOR ALL TO authenticated 
  USING (public.app_has_role(ARRAY['staff'::text, 'admin'::text, 'owner'::text, 'accountant'::text]))
  WITH CHECK (public.app_has_role(ARRAY['staff'::text, 'admin'::text, 'owner'::text, 'accountant'::text]));
