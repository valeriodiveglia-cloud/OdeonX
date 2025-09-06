--
-- PostgreSQL database dump
--

\restrict qu8d0C9cgGaTR74DgCZ6dUplsARXYIL7uZNcmAA6ChUzlJSOgdmcDnXU0uFKLFQ

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP POLICY IF EXISTS uom_sel_authenticated ON public.uom;
DROP POLICY IF EXISTS tags_upd_authenticated ON public.tags;
DROP POLICY IF EXISTS tags_sel_authenticated ON public.tags;
DROP POLICY IF EXISTS tags_ins_authenticated ON public.tags;
DROP POLICY IF EXISTS tags_del_authenticated ON public.tags;
DROP POLICY IF EXISTS suppliers_upd_authenticated ON public.suppliers;
DROP POLICY IF EXISTS suppliers_sel_authenticated ON public.suppliers;
DROP POLICY IF EXISTS suppliers_ins_authenticated ON public.suppliers;
DROP POLICY IF EXISTS suppliers_del_authenticated ON public.suppliers;
DROP POLICY IF EXISTS rental_equipment_upd_authenticated ON public.rental_equipment;
DROP POLICY IF EXISTS rental_equipment_sel_authenticated ON public.rental_equipment;
DROP POLICY IF EXISTS rental_equipment_ins_authenticated ON public.rental_equipment;
DROP POLICY IF EXISTS rental_equipment_del_authenticated ON public.rental_equipment;
DROP POLICY IF EXISTS recipe_categories_upd_authenticated ON public.recipe_categories;
DROP POLICY IF EXISTS recipe_categories_sel_authenticated ON public.recipe_categories;
DROP POLICY IF EXISTS recipe_categories_ins_authenticated ON public.recipe_categories;
DROP POLICY IF EXISTS recipe_categories_del_authenticated ON public.recipe_categories;
DROP POLICY IF EXISTS prep_recipes_upd_authenticated ON public.prep_recipes;
DROP POLICY IF EXISTS prep_recipes_sel_authenticated ON public.prep_recipes;
DROP POLICY IF EXISTS prep_recipes_ins_authenticated ON public.prep_recipes;
DROP POLICY IF EXISTS prep_recipes_del_authenticated ON public.prep_recipes;
DROP POLICY IF EXISTS prep_recipe_tags_upd_authenticated ON public.prep_recipe_tags;
DROP POLICY IF EXISTS prep_recipe_tags_sel_authenticated ON public.prep_recipe_tags;
DROP POLICY IF EXISTS prep_recipe_tags_ins_authenticated ON public.prep_recipe_tags;
DROP POLICY IF EXISTS prep_recipe_tags_del_authenticated ON public.prep_recipe_tags;
DROP POLICY IF EXISTS prep_recipe_items_upd_authenticated ON public.prep_recipe_items;
DROP POLICY IF EXISTS prep_recipe_items_sel_authenticated ON public.prep_recipe_items;
DROP POLICY IF EXISTS prep_recipe_items_ins_authenticated ON public.prep_recipe_items;
DROP POLICY IF EXISTS prep_recipe_items_del_authenticated ON public.prep_recipe_items;
DROP POLICY IF EXISTS materials_upd_authenticated ON public.materials;
DROP POLICY IF EXISTS materials_sel_authenticated ON public.materials;
DROP POLICY IF EXISTS materials_ins_authenticated ON public.materials;
DROP POLICY IF EXISTS materials_del_authenticated ON public.materials;
DROP POLICY IF EXISTS material_price_history_sel_authenticated ON public.material_price_history;
DROP POLICY IF EXISTS final_recipes_upd_authenticated ON public.final_recipes;
DROP POLICY IF EXISTS final_recipes_sel_authenticated ON public.final_recipes;
DROP POLICY IF EXISTS final_recipes_ins_authenticated ON public.final_recipes;
DROP POLICY IF EXISTS final_recipes_del_authenticated ON public.final_recipes;
DROP POLICY IF EXISTS final_recipe_tags_upd_authenticated ON public.final_recipe_tags;
DROP POLICY IF EXISTS final_recipe_tags_sel_authenticated ON public.final_recipe_tags;
DROP POLICY IF EXISTS final_recipe_tags_ins_authenticated ON public.final_recipe_tags;
DROP POLICY IF EXISTS final_recipe_tags_del_authenticated ON public.final_recipe_tags;
DROP POLICY IF EXISTS final_recipe_items_upd_authenticated ON public.final_recipe_items;
DROP POLICY IF EXISTS final_recipe_items_sel_authenticated ON public.final_recipe_items;
DROP POLICY IF EXISTS final_recipe_items_ins_authenticated ON public.final_recipe_items;
DROP POLICY IF EXISTS final_recipe_items_del_authenticated ON public.final_recipe_items;
DROP POLICY IF EXISTS equipment_price_history_sel_authenticated ON public.equipment_price_history;
DROP POLICY IF EXISTS equipment_categories_upd_authenticated ON public.equipment_categories;
DROP POLICY IF EXISTS equipment_categories_sel_authenticated ON public.equipment_categories;
DROP POLICY IF EXISTS equipment_categories_ins_authenticated ON public.equipment_categories;
DROP POLICY IF EXISTS equipment_categories_del_authenticated ON public.equipment_categories;
DROP POLICY IF EXISTS dish_categories_upd_authenticated ON public.dish_categories;
DROP POLICY IF EXISTS dish_categories_sel_authenticated ON public.dish_categories;
DROP POLICY IF EXISTS dish_categories_ins_authenticated ON public.dish_categories;
DROP POLICY IF EXISTS dish_categories_del_authenticated ON public.dish_categories;
DROP POLICY IF EXISTS categories_upd_authenticated ON public.categories;
DROP POLICY IF EXISTS categories_sel_authenticated ON public.categories;
DROP POLICY IF EXISTS categories_ins_authenticated ON public.categories;
DROP POLICY IF EXISTS categories_del_authenticated ON public.categories;
DROP POLICY IF EXISTS app_settings_staff_whitelist_upd_admin_owner ON public.app_settings_staff_whitelist;
DROP POLICY IF EXISTS app_settings_staff_whitelist_sel_admin_owner ON public.app_settings_staff_whitelist;
DROP POLICY IF EXISTS app_settings_staff_whitelist_ins_admin_owner ON public.app_settings_staff_whitelist;
DROP POLICY IF EXISTS app_settings_staff_whitelist_del_admin_owner ON public.app_settings_staff_whitelist;
DROP POLICY IF EXISTS app_settings_sel_authenticated ON public.app_settings;
DROP POLICY IF EXISTS app_accounts_upd_owner_admin ON public.app_accounts;
DROP POLICY IF EXISTS app_accounts_sel_authenticated ON public.app_accounts;
DROP POLICY IF EXISTS app_accounts_ins_owner_admin ON public.app_accounts;
DROP POLICY IF EXISTS app_accounts_del_owner_admin ON public.app_accounts;
ALTER TABLE IF EXISTS ONLY public.rental_equipment DROP CONSTRAINT IF EXISTS rental_equipment_supplier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.rental_equipment DROP CONSTRAINT IF EXISTS rental_equipment_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.prep_recipes DROP CONSTRAINT IF EXISTS prep_recipes_yield_uom_id_fkey;
ALTER TABLE IF EXISTS ONLY public.prep_recipes DROP CONSTRAINT IF EXISTS prep_recipes_uom_id_fkey;
ALTER TABLE IF EXISTS ONLY public.prep_recipes DROP CONSTRAINT IF EXISTS prep_recipes_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.prep_recipe_tags DROP CONSTRAINT IF EXISTS prep_recipe_tags_tag_id_fkey;
ALTER TABLE IF EXISTS ONLY public.prep_recipe_tags DROP CONSTRAINT IF EXISTS prep_recipe_tags_recipe_id_fkey;
ALTER TABLE IF EXISTS ONLY public.prep_recipe_items DROP CONSTRAINT IF EXISTS prep_recipe_items_prep_id_fkey;
ALTER TABLE IF EXISTS ONLY public.material_price_history DROP CONSTRAINT IF EXISTS material_price_history_material_id_fkey;
ALTER TABLE IF EXISTS ONLY public.final_recipes DROP CONSTRAINT IF EXISTS final_recipes_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.final_recipes DROP CONSTRAINT IF EXISTS final_recipes_category_fk;
ALTER TABLE IF EXISTS ONLY public.final_recipe_tags DROP CONSTRAINT IF EXISTS final_recipe_tags_tag_id_fkey;
ALTER TABLE IF EXISTS ONLY public.final_recipe_tags DROP CONSTRAINT IF EXISTS final_recipe_tags_final_id_fkey;
ALTER TABLE IF EXISTS ONLY public.final_recipe_items DROP CONSTRAINT IF EXISTS final_recipe_items_final_id_fkey;
ALTER TABLE IF EXISTS ONLY public.equipment_price_history DROP CONSTRAINT IF EXISTS equipment_price_history_equipment_id_fkey;
ALTER TABLE IF EXISTS ONLY public.app_accounts DROP CONSTRAINT IF EXISTS app_accounts_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.app_accounts DROP CONSTRAINT IF EXISTS app_accounts_user_fk;
DROP TRIGGER IF EXISTS trg_updated_at_final ON public.final_recipes;
DROP TRIGGER IF EXISTS trg_tags_normalize ON public.tags;
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
DROP TRIGGER IF EXISTS trg_single_default_per_name ON public.materials;
DROP TRIGGER IF EXISTS trg_rental_equipment_set_price ON public.rental_equipment;
DROP TRIGGER IF EXISTS trg_materials_last_update ON public.materials;
DROP TRIGGER IF EXISTS trg_log_material_price_change ON public.materials;
DROP TRIGGER IF EXISTS trg_log_equipment_cost ON public.rental_equipment;
DROP TRIGGER IF EXISTS app_settings_staff_only_language ON public.app_settings;
DROP TRIGGER IF EXISTS app_accounts_prevent_last_owner_update ON public.app_accounts;
DROP TRIGGER IF EXISTS app_accounts_prevent_last_owner_delete ON public.app_accounts;
DROP INDEX IF EXISTS public.uq_materials_name_supplier_brand;
DROP INDEX IF EXISTS public.tags_name_unique_ci;
DROP INDEX IF EXISTS public.tags_name_lower_uniq;
DROP INDEX IF EXISTS public.suppliers_name_idx;
DROP INDEX IF EXISTS public.prep_recipes_deleted_idx;
DROP INDEX IF EXISTS public.prep_recipes_archived_idx;
DROP INDEX IF EXISTS public.prep_recipe_items_prep_id_idx;
DROP INDEX IF EXISTS public.idx_re_sup;
DROP INDEX IF EXISTS public.idx_re_name;
DROP INDEX IF EXISTS public.idx_re_lastupd;
DROP INDEX IF EXISTS public.idx_re_cat;
DROP INDEX IF EXISTS public.idx_prep_recipe_items_prep_id_created_at;
DROP INDEX IF EXISTS public.idx_prep_recipe_items_prep_id;
DROP INDEX IF EXISTS public.idx_mph_material_id;
DROP INDEX IF EXISTS public.idx_mph_changed_at;
DROP INDEX IF EXISTS public.idx_materials_unit_cost_vat;
DROP INDEX IF EXISTS public.idx_materials_deleted_at;
DROP INDEX IF EXISTS public.idx_final_recipe_tags_tag;
DROP INDEX IF EXISTS public.idx_final_recipe_tags_final;
DROP INDEX IF EXISTS public.idx_eph_eq;
DROP INDEX IF EXISTS public.final_recipes_deleted_idx;
DROP INDEX IF EXISTS public.final_recipes_archived_idx;
DROP INDEX IF EXISTS public.final_recipe_tags_tag_id_idx;
DROP INDEX IF EXISTS public.app_settings_singleton;
DROP INDEX IF EXISTS public.app_accounts_role_idx;
DROP INDEX IF EXISTS public.app_accounts_email_idx;
DROP INDEX IF EXISTS public.app_accounts_active_idx;
ALTER TABLE IF EXISTS ONLY public.rental_equipment DROP CONSTRAINT IF EXISTS uq_equipment_per_supplier;
ALTER TABLE IF EXISTS ONLY public.uom DROP CONSTRAINT IF EXISTS uom_pkey;
ALTER TABLE IF EXISTS ONLY public.materials DROP CONSTRAINT IF EXISTS uniq_material_per_supplier;
ALTER TABLE IF EXISTS ONLY public.tags DROP CONSTRAINT IF EXISTS tags_pkey;
ALTER TABLE IF EXISTS ONLY public.tags DROP CONSTRAINT IF EXISTS tags_name_key;
ALTER TABLE IF EXISTS ONLY public.suppliers DROP CONSTRAINT IF EXISTS suppliers_pkey;
ALTER TABLE IF EXISTS ONLY public.suppliers DROP CONSTRAINT IF EXISTS suppliers_id_key;
ALTER TABLE IF EXISTS ONLY public.rental_equipment DROP CONSTRAINT IF EXISTS rental_equipment_pkey;
ALTER TABLE IF EXISTS ONLY public.recipe_categories DROP CONSTRAINT IF EXISTS recipe_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.recipe_categories DROP CONSTRAINT IF EXISTS recipe_categories_name_key;
ALTER TABLE IF EXISTS ONLY public.prep_recipes DROP CONSTRAINT IF EXISTS prep_recipes_pkey;
ALTER TABLE IF EXISTS ONLY public.prep_recipe_tags DROP CONSTRAINT IF EXISTS prep_recipe_tags_pkey;
ALTER TABLE IF EXISTS ONLY public.prep_recipe_items DROP CONSTRAINT IF EXISTS prep_recipe_items_pkey;
ALTER TABLE IF EXISTS ONLY public.materials DROP CONSTRAINT IF EXISTS materials_pkey;
ALTER TABLE IF EXISTS ONLY public.material_price_history DROP CONSTRAINT IF EXISTS material_price_history_pkey;
ALTER TABLE IF EXISTS ONLY public.final_recipes DROP CONSTRAINT IF EXISTS final_recipes_pkey;
ALTER TABLE IF EXISTS ONLY public.final_recipe_tags DROP CONSTRAINT IF EXISTS final_recipe_tags_pkey;
ALTER TABLE IF EXISTS ONLY public.final_recipe_items DROP CONSTRAINT IF EXISTS final_recipe_items_pkey;
ALTER TABLE IF EXISTS ONLY public.equipment_price_history DROP CONSTRAINT IF EXISTS equipment_price_history_pkey;
ALTER TABLE IF EXISTS ONLY public.equipment_categories DROP CONSTRAINT IF EXISTS equipment_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.equipment_categories DROP CONSTRAINT IF EXISTS equipment_categories_name_key;
ALTER TABLE IF EXISTS ONLY public.dish_categories DROP CONSTRAINT IF EXISTS dish_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.dish_categories DROP CONSTRAINT IF EXISTS dish_categories_name_key;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE IF EXISTS ONLY public.app_settings_staff_whitelist DROP CONSTRAINT IF EXISTS app_settings_staff_whitelist_pkey;
ALTER TABLE IF EXISTS ONLY public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.app_accounts DROP CONSTRAINT IF EXISTS app_accounts_user_id_key;
ALTER TABLE IF EXISTS ONLY public.app_accounts DROP CONSTRAINT IF EXISTS app_accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.app_accounts DROP CONSTRAINT IF EXISTS app_accounts_email_key;
ALTER TABLE IF EXISTS public.uom ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tags ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.recipe_categories ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.equipment_categories ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.dish_categories ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.categories ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.uom_id_seq;
DROP SEQUENCE IF EXISTS public.tags_id_seq;
DROP TABLE IF EXISTS public.suppliers;
DROP TABLE IF EXISTS public.rental_equipment;
DROP SEQUENCE IF EXISTS public.recipe_categories_id_seq;
DROP TABLE IF EXISTS public.prep_recipe_tags;
DROP TABLE IF EXISTS public.prep_recipe_items;
DROP VIEW IF EXISTS public.prep_list_with_uom_vw;
DROP TABLE IF EXISTS public.uom;
DROP VIEW IF EXISTS public.prep_list_vw;
DROP TABLE IF EXISTS public.recipe_categories;
DROP TABLE IF EXISTS public.prep_recipes;
DROP TABLE IF EXISTS public.materials_vat_backup;
DROP TABLE IF EXISTS public.materials;
DROP TABLE IF EXISTS public.material_price_history;
DROP VIEW IF EXISTS public.final_recipe_tags_vw;
DROP TABLE IF EXISTS public.tags;
DROP TABLE IF EXISTS public.final_recipe_tags;
DROP VIEW IF EXISTS public.final_list_vw;
DROP TABLE IF EXISTS public.final_recipes;
DROP TABLE IF EXISTS public.final_recipe_items;
DROP TABLE IF EXISTS public.equipment_price_history;
DROP SEQUENCE IF EXISTS public.equipment_categories_id_seq;
DROP TABLE IF EXISTS public.equipment_categories;
DROP SEQUENCE IF EXISTS public.dish_categories_id_seq;
DROP TABLE IF EXISTS public.dish_categories;
DROP SEQUENCE IF EXISTS public.categories_id_seq;
DROP TABLE IF EXISTS public.categories;
DROP TABLE IF EXISTS public.app_settings_staff_whitelist;
DROP TABLE IF EXISTS public.app_settings;
DROP TABLE IF EXISTS public.app_accounts;
DROP TABLE IF EXISTS public._app_settings_backup;
DROP FUNCTION IF EXISTS public.trg_log_equipment_cost();
DROP FUNCTION IF EXISTS public.tags_normalize_name();
DROP FUNCTION IF EXISTS public.set_vat_and_recalc(p_vat_enabled boolean);
DROP FUNCTION IF EXISTS public.set_updated_at();
DROP FUNCTION IF EXISTS public.set_last_update();
DROP FUNCTION IF EXISTS public.rental_equipment_set_price();
DROP FUNCTION IF EXISTS public.prevent_last_owner_change();
DROP FUNCTION IF EXISTS public.log_material_price_change();
DROP FUNCTION IF EXISTS public.fn_log_material_price_change();
DROP FUNCTION IF EXISTS public.ensure_single_default_per_name();
DROP FUNCTION IF EXISTS public.ensure_policy(p_schema text, p_table text, p_name text, p_cmd text, p_using text, p_check text);
DROP FUNCTION IF EXISTS public.ensure_policy(_schemaname text, _tablename text, _policyname text, _definition text);
DROP FUNCTION IF EXISTS public.debug_current_role();
DROP FUNCTION IF EXISTS public.current_jwt_role();
DROP FUNCTION IF EXISTS public.bootstrap_app_account();
DROP FUNCTION IF EXISTS public.app_uid();
DROP FUNCTION IF EXISTS public.app_settings_staff_only_language_ins();
DROP FUNCTION IF EXISTS public.app_settings_staff_only_language();
DROP FUNCTION IF EXISTS public.app_settings_staff_guard_upd();
DROP FUNCTION IF EXISTS public.app_settings_staff_guard();
DROP FUNCTION IF EXISTS public.app_role();
DROP FUNCTION IF EXISTS public.app_jwt_email();
DROP FUNCTION IF EXISTS public.app_is_staff();
DROP FUNCTION IF EXISTS public.app_is_owner();
DROP FUNCTION IF EXISTS public.app_is_contributor();
DROP FUNCTION IF EXISTS public.app_is_authenticated();
DROP FUNCTION IF EXISTS public.app_is_admin_or_owner();
DROP FUNCTION IF EXISTS public.app_is_admin();
DROP FUNCTION IF EXISTS public.app_has_role(roles text[]);
DROP FUNCTION IF EXISTS public.admin_reset_suppliers();
DROP FUNCTION IF EXISTS public.admin_reset_settings();
DROP FUNCTION IF EXISTS public.admin_reset_data(scope text, caller_user_id uuid);
DROP FUNCTION IF EXISTS public.admin_reset_all();
DROP SCHEMA IF EXISTS public;
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: admin_reset_all(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reset_all() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Ordine sensato: ricette, materiali/equipment/categorie, fornitori, settings
  perform public.admin_reset_data('recipes',  NULL);
  perform public.admin_reset_data('materials', NULL);
  perform public.admin_reset_data('equipment', NULL);
  perform public.admin_reset_data('categories', NULL);

  -- fornitori con la funzione che hai già creato
  perform public.admin_reset_suppliers();

  -- settings ai default con tutti gli switch su ON
  perform public.admin_reset_settings();
end;
$$;


--
-- Name: admin_reset_data(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reset_data(scope text, caller_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  t               text;
  tables          text[];
  cnt             bigint;
  payload         jsonb := '{}'::jsonb;
  caller_role     text;
begin
  scope := lower(scope);

  -- ===== DB AUTHZ =====
  if caller_user_id is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select role into caller_role
  from app_accounts
  where user_id = caller_user_id;

  if caller_role is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if scope = 'all' and caller_role <> 'owner' then
    raise exception 'Only owner can reset all' using errcode = '42501';
  end if;

  if scope <> 'all' and caller_role not in ('owner','admin') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- ===== MAPPATURA SCOPE -> TABELLE (tuo schema) =====
  if scope = 'materials' then
    tables := array['material_price_history','materials'];

  elsif scope = 'suppliers' then
    if to_regclass('public.materials') is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='materials' and column_name='supplier_id'
       ) then
      execute 'update materials set supplier_id = null';
    end if;
    tables := array['suppliers'];

  elsif scope = 'categories' then
    tables := array['recipe_categories','equipment_categories','dish_categories','categories','tags'];

  elsif scope = 'recipes' then
    tables := array[
      'final_recipe_tags','prep_recipe_tags',
      'final_recipe_items','prep_recipe_items',
      'final_recipes','prep_recipes'
    ];

  elsif scope = 'equipment' then
    tables := array['equipment_price_history','rental_equipment'];

  elsif scope = 'all' then
    return jsonb_build_object('all',
      coalesce(admin_reset_data('recipes',    caller_user_id), '{}'::jsonb) ||
      coalesce(admin_reset_data('categories', caller_user_id), '{}'::jsonb) ||
      coalesce(admin_reset_data('materials',  caller_user_id), '{}'::jsonb) ||
      coalesce(admin_reset_data('suppliers',  caller_user_id), '{}'::jsonb) ||
      coalesce(admin_reset_data('equipment',  caller_user_id), '{}'::jsonb)
    );

  else
    raise exception 'Invalid scope %', scope using errcode = '22023';
  end if;

  -- ===== LOOP: TRUNCATE (safeupdate-friendly) =====
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('select count(*) from %I', t) INTO cnt;
      EXECUTE format('truncate table %I restart identity cascade', t);
      payload := payload || jsonb_build_object(t, cnt);
    END IF;
  END LOOP;

  return jsonb_build_object('scope', scope, 'deleted_rows', payload, 'by', caller_role);
end;
$$;


--
-- Name: admin_reset_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reset_settings() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into app_settings(
    id,
    restaurant_name, company_name, address, tax_code,
    phone, email, website,
    logo_mime, logo_data,
    language_code, currency,
    vat_enabled, vat_rate,
    default_markup_equipment_pct, default_markup_recipes_pct,
    materials_review_months, csv_require_confirm_refs, materials_exclusive_default,
    equipment_review_months, equipment_csv_require_confirm_refs,
    recipes_review_months, recipes_split_mode, recipes_tab1_name, recipes_tab2_name,
    updated_at
  )
  values (
    'singleton',
    '', '', '', '',
    '', '', '',
    null, null,
    'en', 'VND',
    true, 10,
    30, 30,
    4, true, true,
    4, true,
    4, 'split', 'Final', 'Prep',
    now()
  )
  on conflict (id) do update set
    restaurant_name = excluded.restaurant_name,
    company_name = excluded.company_name,
    address = excluded.address,
    tax_code = excluded.tax_code,
    phone = excluded.phone,
    email = excluded.email,
    website = excluded.website,
    logo_mime = excluded.logo_mime,
    logo_data = excluded.logo_data,
    language_code = excluded.language_code,
    currency = excluded.currency,
    vat_enabled = excluded.vat_enabled,
    vat_rate = excluded.vat_rate,
    default_markup_equipment_pct = excluded.default_markup_equipment_pct,
    default_markup_recipes_pct = excluded.default_markup_recipes_pct,
    materials_review_months = excluded.materials_review_months,
    csv_require_confirm_refs = excluded.csv_require_confirm_refs,
    materials_exclusive_default = excluded.materials_exclusive_default,
    equipment_review_months = excluded.equipment_review_months,
    equipment_csv_require_confirm_refs = excluded.equipment_csv_require_confirm_refs,
    recipes_review_months = excluded.recipes_review_months,
    recipes_split_mode = excluded.recipes_split_mode,
    recipes_tab1_name = excluded.recipes_tab1_name,
    recipes_tab2_name = excluded.recipes_tab2_name,
    updated_at = now();
end;
$$;


--
-- Name: admin_reset_suppliers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reset_suppliers() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- 1) stacca i materials dai supplier (se esiste la colonna)
  begin
    update materials
       set supplier_id = null
     where supplier_id is not null;
  exception when undefined_column then
    null;
  end;

  -- 2) svuota la tabella pivot se esiste
  begin
    delete from supplier_materials where true;
  exception when undefined_table then
    null;
  end;

  -- 3) cancella tutti i suppliers
  delete from suppliers where true;
end;
$$;


--
-- Name: app_has_role(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_has_role(roles text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from public.app_accounts a
    where a.user_id = auth.uid()
      and a.role = any(roles)
  );
$$;


--
-- Name: app_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from public.app_accounts a
    where (a.user_id = auth.uid() or lower(a.email) = lower(public.app_jwt_email()))
      and lower(a.role) = 'admin'
  );
$$;


--
-- Name: app_is_admin_or_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_admin_or_owner() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ select coalesce(public.app_role(),'') in ('owner','admin') $$;


--
-- Name: app_is_authenticated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_authenticated() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ select auth.uid() is not null $$;


--
-- Name: app_is_contributor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_contributor() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ select coalesce(public.app_role(),'') in ('owner','admin','staff') $$;


--
-- Name: app_is_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_owner() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from public.app_accounts a
    where (a.user_id = auth.uid() or lower(a.email) = lower(public.app_jwt_email()))
      and lower(a.role) = 'owner'
  );
$$;


--
-- Name: app_is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_staff() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ select coalesce(public.app_role(),'') = 'staff' $$;


--
-- Name: app_jwt_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_jwt_email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), '');
$$;


--
-- Name: app_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select role from public.app_accounts where user_id = auth.uid()), 'anonymous');
$$;


--
-- Name: app_settings_staff_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_settings_staff_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
declare
  role_app text;
  merged jsonb;
  col text;
  val jsonb;
begin
  role_app := public.app_role();

  -- Admin e owner liberi
  if role_app not in ('staff') then
    return NEW;
  end if;

  -- Staff non inserisce mai
  if TG_OP = 'INSERT' then
    raise exception 'RLS: solo owner o admin possono inserire app_settings';
  end if;

  -- Parto da OLD
  merged := to_jsonb(OLD);

  -- Per ogni colonna in whitelist, prendo il valore da NEW e lo copio dentro
  for col in
    select col_name from public.app_settings_staff_whitelist
  loop
    -- estraggo il valore da NEW in modo dinamico
    execute format('select to_jsonb(($1).%I)', col) into val using NEW;
    -- se la colonna non esiste davvero nella tabella, salto
    if val is null then
      continue;
    end if;
    merged := jsonb_set(merged, ARRAY[col], val, true);
  end loop;

  -- Rimapporto nel record NEW e ritorno
  NEW := jsonb_populate_record(OLD, merged);
  return NEW;
end;
$_$;


--
-- Name: app_settings_staff_guard_upd(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_settings_staff_guard_upd() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
declare
  role_app text;
  merged jsonb;
  col text;
  val jsonb;
begin
  role_app := public.app_role();
  if role_app <> 'staff' then
    return NEW; -- admin/owner liberi
  end if;

  merged := to_jsonb(OLD);

  for col in select col_name from public.app_settings_staff_whitelist loop
    begin
      execute format('select to_jsonb(($1).%I)', col) into val using NEW;
    exception when undefined_column then
      continue;
    end;
    if val is not null then
      merged := jsonb_set(merged, ARRAY[col], val, true);
    end if;
  end loop;

  NEW := jsonb_populate_record(OLD, merged);
  return NEW;
end;
$_$;


--
-- Name: app_settings_staff_only_language(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_settings_staff_only_language() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  _whitelist text[] := array[
    -- nomi lingua comuni
    'language','lang','ui_language','locale','i18n_locale',
    -- metadati che la UI può aggiornare automaticamente
    'updated_at','updated_on','updated_by','updated_by_id','updated_by_uid',
    'modified_at','modified_on','modified_by','version','rev'
  ];
  col text;
  new_stripped jsonb;
  old_stripped jsonb;
begin
  -- Per chi NON è admin/owner (quindi staff o utenti senza riga/ruolo)
  if not public.app_is_admin_or_owner() then
    new_stripped := to_jsonb(NEW);
    old_stripped := to_jsonb(OLD);

    -- rimuovi le colonne consentite prima del confronto
    foreach col in array _whitelist loop
      new_stripped := new_stripped - col;
      old_stripped := old_stripped - col;
    end loop;

    -- se resta una differenza => tentativo di cambiare altro: blocca
    if new_stripped <> old_stripped then
      raise exception 'RLS: puoi modificare soltanto la lingua';
    end if;
  end if;

  return NEW;
end
$$;


--
-- Name: app_settings_staff_only_language_ins(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_settings_staff_only_language_ins() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  -- Campi consentiti allo staff in INSERT
  _whitelist text[] := array[
    'language','lang','ui_language','locale','i18n_locale',
    -- metadati possibili
    'updated_at','updated_on','updated_by','updated_by_id','updated_by_uid',
    'modified_at','modified_on','modified_by','version','rev',
    'created_at','created_by'
  ];
  col text;
  payload jsonb;
begin
  -- Solo per chi NON è admin/owner
  if not public.app_is_admin_or_owner() then
    -- togli i campi permessi
    payload := to_jsonb(NEW);
    foreach col in array _whitelist loop
      payload := payload - col;
    end loop;

    -- Se rimangono campi valorizzati (non JSON 'null'), blocca
    if exists (
      select 1
      from jsonb_each(payload) as kv(k,v)
      where kv.v is not null and kv.v <> 'null'::jsonb
    ) then
      raise exception 'RLS: lo staff può inserire solo la lingua; gli altri campi devono restare vuoti';
    end if;
  end if;

  return NEW;
end
$$;


--
-- Name: app_uid(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select coalesce(
    nullif(current_setting('app.test_uid', true), '')::uuid,
    auth.uid()
  );
$$;


--
-- Name: bootstrap_app_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bootstrap_app_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  owners_count int;
  default_role text := 'staff';
  _updated int;
begin
  -- Se è il primo owner del sistema, promuovi a owner
  select count(*) into owners_count from public.app_accounts where role = 'owner';
  if owners_count = 0 then
    default_role := 'owner';
  end if;

  -- 1) prova ad AGGANCIARSI ad una riga invito già esistente per email (case-insensitive)
  update public.app_accounts a
     set user_id  = new.id,
         is_active = true
   where a.user_id is null
     and lower(a.email) = lower(coalesce(new.email, ''))
  returning 1 into _updated;

  if coalesce(_updated,0) > 0 then
    return new; -- collegato: stop
  end if;

  -- 2) altrimenti inserisci una nuova riga per questo user_id
  insert into public.app_accounts (user_id, email, role, is_active)
  values (new.id, coalesce(new.email, ''), default_role, true)
  on conflict (user_id) do nothing;

  return new;
end;
$$;


--
-- Name: current_jwt_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_jwt_role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select coalesce(
    nullif((current_setting('request.jwt.claims', true))::jsonb ->> 'role',''),
    'anonymous'
  );
$$;


--
-- Name: debug_current_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.debug_current_role() RETURNS text
    LANGUAGE sql
    AS $$
  select current_user;
$$;


--
-- Name: ensure_policy(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_policy(_schemaname text, _tablename text, _policyname text, _definition text) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = _schemaname
      and tablename  = _tablename
      and policyname = _policyname
  ) then
    execute format('create policy %I on %I.%I %s',
                   _policyname, _schemaname, _tablename, _definition);
  end if;
end
$$;


--
-- Name: ensure_policy(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_policy(p_schema text, p_table text, p_name text, p_cmd text, p_using text, p_check text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  v_has_policy boolean;
  v_cmd text := upper(p_cmd);
  v_using text := null;
  v_check text := null;
  v_for text;
begin
  -- Normalizza le clausole in base al comando
  if v_cmd in ('SELECT','DELETE') then
    v_using := nullif(trim(p_using),'');
    v_check := null; -- non applicabile
  elsif v_cmd = 'INSERT' then
    v_using := null; -- vietato su INSERT
    v_check := nullif(trim(coalesce(p_check,p_using)),''); -- se passano solo p_using, ricicliamolo in check
  elsif v_cmd = 'UPDATE' then
    v_using := nullif(trim(p_using),'');
    v_check := nullif(trim(coalesce(p_check,p_using)),''); -- spesso sono uguali
  else
    raise exception 'Unsupported p_cmd: % (use one of SELECT/INSERT/UPDATE/DELETE)', p_cmd;
  end if;

  v_for := lower(v_cmd);

  -- Esiste già?
  select exists(
    select 1 from pg_policies
    where schemaname = p_schema
      and tablename  = p_table
      and policyname = p_name
  ) into v_has_policy;

  if not v_has_policy then
    -- CREATE POLICY
    execute format(
      'create policy %I on %I.%I as permissive for %s to authenticated %s %s',
      p_name, p_schema, p_table, v_for,
      case when v_using is not null then format('using (%s)', v_using) else '' end,
      case when v_check is not null then format('with check (%s)', v_check) else '' end
    );
  else
    -- ALTER POLICY (solo le clausole ammesse dal comando)
    if v_using is not null and v_cmd in ('SELECT','DELETE','UPDATE') then
      execute format(
        'alter policy %I on %I.%I using (%s)',
        p_name, p_schema, p_table, v_using
      );
    elsif v_cmd in ('SELECT','DELETE') then
      -- assicurati che non resti un USING “sporco”: se serve, reimposta a TRUE
      if v_using is null then
        execute format(
          'alter policy %I on %I.%I using (true)',
          p_name, p_schema, p_table
        );
      end if;
    end if;

    if v_check is not null and v_cmd in ('INSERT','UPDATE') then
      execute format(
        'alter policy %I on %I.%I with check (%s)',
        p_name, p_schema, p_table, v_check
      );
    elsif v_cmd = 'UPDATE' and v_check is null then
      -- per UPDATE senza check, imposta with check (true)
      execute format(
        'alter policy %I on %I.%I with check (true)',
        p_name, p_schema, p_table
      );
    end if;
  end if;
end;
$$;


--
-- Name: FUNCTION ensure_policy(p_schema text, p_table text, p_name text, p_cmd text, p_using text, p_check text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ensure_policy(p_schema text, p_table text, p_name text, p_cmd text, p_using text, p_check text) IS 'Crea/aggiorna policy rispettando le regole Postgres: USING solo per SELECT/UPDATE/DELETE; WITH CHECK solo per INSERT/UPDATE. Idempotente.';


--
-- Name: ensure_single_default_per_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_single_default_per_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  enforce boolean;
BEGIN
  -- Legge il flag dall'impostazione globale
  SELECT materials_exclusive_default
  INTO enforce
  FROM public.app_settings
  WHERE id = 'singleton';

  -- Se l'impostazione è OFF o NEW.is_default non è true -> non fare nulla
  IF NOT enforce OR COALESCE(NEW.is_default, false) = false THEN
    RETURN NEW;
  END IF;

  -- Impostazione ON e stai mettendo default=true:
  -- spegni gli altri con lo stesso nome
  UPDATE public.materials
  SET is_default = false
  WHERE name = NEW.name
    AND id <> NEW.id;

  RETURN NEW;
END;
$$;


--
-- Name: fn_log_material_price_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_log_material_price_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  changed boolean := false;
begin
  if (coalesce(old.package_price, -1) is distinct from coalesce(new.package_price, -1)) then
    changed := true;
  end if;

  if (coalesce(old.packaging_size, -1) is distinct from coalesce(new.packaging_size, -1)) then
    changed := true;
  end if;

  if (coalesce(old.unit_cost, -1) is distinct from coalesce(new.unit_cost, -1)) then
    changed := true;
  end if;

  if changed then
    insert into public.material_price_history(
      material_id,
      changed_at,
      old_package_price, new_package_price,
      old_packaging_size, new_packaging_size,
      old_unit_cost,     new_unit_cost
    ) values (
      old.id,
      now(),
      old.package_price, new.package_price,
      old.packaging_size, new.packaging_size,
      old.unit_cost,      new.unit_cost
    );
  end if;

  return new;
end;
$$;


--
-- Name: log_material_price_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_material_price_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  changed boolean := false;
begin
  if new.unit_cost is distinct from old.unit_cost then
    changed := true;
  end if;

  if new.package_price is distinct from old.package_price then
    changed := true;
  end if;

  if changed then
    insert into public.material_price_history(
      material_id,
      old_unit_cost, new_unit_cost,
      old_package_price, new_package_price,
      changed_by, changed_at
    ) values (
      new.id,
      old.unit_cost, new.unit_cost,
      old.package_price, new.package_price,
      auth.uid(), now()
    );
  end if;

  return new;
end;
$$;


--
-- Name: prevent_last_owner_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_last_owner_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  owners_left integer;
begin
  if TG_OP = 'UPDATE' then
    if OLD.role = 'owner' and NEW.role <> 'owner' then
      select count(*) into owners_left
      from public.app_accounts
      where lower(role) = 'owner' and id <> OLD.id;
      if owners_left = 0 then
        raise exception 'cannot remove the last owner';
      end if;
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    if OLD.role = 'owner' then
      select count(*) into owners_left
      from public.app_accounts
      where lower(role) = 'owner' and id <> OLD.id;
      if owners_left = 0 then
        raise exception 'cannot delete the last owner';
      end if;
    end if;
    return OLD;
  end if;
  return coalesce(NEW, OLD);
end;
$$;


--
-- Name: rental_equipment_set_price(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rental_equipment_set_price() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.cost is not null then
    new.final_price := round(new.cost * 1.5, 2);
  else
    new.final_price := null;
  end if;
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    new.last_update := now();
  end if;
  return new;
end; $$;


--
-- Name: set_last_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_last_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.last_update := now();
  return new;
end $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;


--
-- Name: set_vat_and_recalc(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_vat_and_recalc(p_vat_enabled boolean) RETURNS TABLE(prep_mat_rows_updated integer, final_mat_rows_updated integer, prep_prep_rows_updated integer, prep_headers_updated integer, final_prep_rows_updated integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- 0) salva la setting
  update app_settings
  set vat_enabled = p_vat_enabled
  where id = 'singleton';

  -- 1) Prezzo effettivo per MATERIALI in base allo stato VAT:
  --    VAT ON  -> lordo (netto+aliquota; altrimenti unit_cost_vat; altrimenti netto)
  --    VAT OFF -> netto (se c’è); altrimenti lordo/aliquota inversa; altrimenti lordo
  with mat_price as (
    select
      id,
      case
        when p_vat_enabled then
          case
            when unit_cost is not null and vat_rate_percent is not null
              then round(unit_cost * (1 + vat_rate_percent/100.0))
            when unit_cost_vat is not null
              then round(unit_cost_vat)
            when unit_cost is not null
              then round(unit_cost)
            else null
          end
        else
          case
            when unit_cost is not null
              then round(unit_cost)
            when unit_cost_vat is not null and vat_rate_percent is not null and vat_rate_percent <> 0
              then round(unit_cost_vat / (1 + vat_rate_percent/100.0))
            when unit_cost_vat is not null
              then round(unit_cost_vat)
            else null
          end
      end as eff_unit
    from materials
  ),

  -- 2) PREP items ← MATERIALI
  upd_prep_mat as (
    update prep_recipe_items pri
    set cost = round(pri.qty * mp.eff_unit)
    from mat_price mp
    where lower(coalesce(pri.ref_type,'')) = 'material'
      and pri.ref_id = mp.id
      and pri.qty is not null
      and mp.eff_unit is not null
    returning 1
  ),

  -- 3) FINAL items ← MATERIALI
  upd_final_mat as (
    update final_recipe_items fri
    set cost = round(fri.qty * mp.eff_unit)
    from mat_price mp
    where lower(coalesce(fri.ref_type,'')) = 'material'
      and fri.ref_id = mp.id
      and fri.qty is not null
      and mp.eff_unit is not null
    returning 1
  ),

  -- 4) PREP items ← PREP (useremo poi i nuovi costi unitari)
  upd_prep_prep as (
    update prep_recipe_items pri
    set cost = round(pri.qty * p2.cost_per_unit_vnd)
    from prep_recipes p2
    where lower(coalesce(pri.ref_type,'')) = 'prep'
      and pri.ref_id = p2.id
      and pri.qty is not null
      and p2.cost_per_unit_vnd is not null
    returning 1
  ),

  -- 5) PREP headers: ricalcola cost_per_unit_vnd
  totals as (
    select prep_id, sum(coalesce(cost,0)) as total_cost
    from prep_recipe_items
    group by prep_id
  ),
  upd_prep_headers as (
    update prep_recipes p
    set cost_per_unit_vnd = coalesce(
      round(t.total_cost / nullif( (coalesce(p.yield_qty,0) * (1 - coalesce(p.waste_pct,0)/100.0)) / nullif(coalesce(p.portion_size,1),0), 0 )),
      0
    )
    from totals t
    where p.id = t.prep_id
    returning 1
  ),

  -- 6) FINAL items ← PREP (dopo ricalcolo dei PREP)
  upd_final_prep as (
    update final_recipe_items fri
    set cost = round(fri.qty * p.cost_per_unit_vnd)
    from prep_recipes p
    where lower(coalesce(fri.ref_type,'')) = 'prep'
      and fri.ref_id = p.id
      and fri.qty is not null
      and p.cost_per_unit_vnd is not null
    returning 1
  )

  select
    (select count(*) from upd_prep_mat),
    (select count(*) from upd_final_mat),
    (select count(*) from upd_prep_prep),
    (select count(*) from upd_prep_headers),
    (select count(*) from upd_final_prep)
  into prep_mat_rows_updated, final_mat_rows_updated, prep_prep_rows_updated, prep_headers_updated, final_prep_rows_updated;

  return next;
end;
$$;


--
-- Name: tags_normalize_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tags_normalize_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  return new;
end
$$;


--
-- Name: trg_log_equipment_cost(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_log_equipment_cost() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- calcola sempre final_price da cost
  if new.cost is not null then
    new.final_price := round(new.cost * 1.5, 2);
  else
    new.final_price := null;
  end if;

  -- se il costo è cambiato, scrivi nello storico
  if tg_op = 'UPDATE' and (coalesce(new.cost, -1) is distinct from coalesce(old.cost, -1)) then
    insert into public.equipment_price_history(
      equipment_id, changed_at,
      old_cost, new_cost,
      old_final_price, new_final_price
    ) values (
      old.id, now(),
      old.cost, new.cost,
      old.final_price, new.final_price
    );
  end if;

  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _app_settings_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._app_settings_backup (
    archived_at timestamp with time zone DEFAULT now(),
    row_json jsonb
);


--
-- Name: app_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'staff'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    phone text,
    name text,
    "position" text,
    first_login_at timestamp with time zone,
    CONSTRAINT app_accounts_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])))
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id text DEFAULT 'singleton'::text NOT NULL,
    currency text DEFAULT 'VND'::text NOT NULL,
    vat_rate integer,
    default_markup_pct numeric,
    round_unit_cost_digits integer DEFAULT 0 NOT NULL,
    show_costs_with_decimals boolean DEFAULT false NOT NULL,
    review_stale_months integer DEFAULT 4 NOT NULL,
    csv_require_confirm_refs boolean DEFAULT true NOT NULL,
    trash_retention_days integer DEFAULT 30 NOT NULL,
    recipes_split_mode text DEFAULT 'split'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    language_code text DEFAULT 'en'::text NOT NULL,
    vat_enabled boolean DEFAULT false NOT NULL,
    materials_exclusive_default boolean DEFAULT true NOT NULL,
    default_markup_equipment_pct numeric,
    default_markup_recipes_pct numeric,
    materials_review_months integer DEFAULT 4 NOT NULL,
    equipment_review_months integer DEFAULT 4 NOT NULL,
    equipment_csv_require_confirm_refs boolean DEFAULT true NOT NULL,
    recipes_tab1_name text DEFAULT 'Final'::text NOT NULL,
    recipes_tab2_name text,
    restaurant_name text,
    company_name text,
    address text,
    tax_code text,
    phone text,
    email text,
    website text,
    logo_mime text,
    logo_data text,
    recipes_review_months integer DEFAULT 4 NOT NULL,
    CONSTRAINT app_settings_language_code_check CHECK ((language_code = ANY (ARRAY['en'::text, 'vi'::text])))
);


--
-- Name: app_settings_staff_whitelist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings_staff_whitelist (
    col_name text NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name text NOT NULL
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: dish_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dish_categories (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0
);


--
-- Name: dish_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dish_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dish_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dish_categories_id_seq OWNED BY public.dish_categories.id;


--
-- Name: equipment_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_categories (
    id bigint NOT NULL,
    name text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: equipment_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equipment_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipment_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equipment_categories_id_seq OWNED BY public.equipment_categories.id;


--
-- Name: equipment_price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    equipment_id uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    old_cost numeric(14,2),
    new_cost numeric(14,2),
    old_final_price numeric(14,2),
    new_final_price numeric(14,2)
);


--
-- Name: final_recipe_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.final_recipe_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    final_id uuid NOT NULL,
    ref_type text,
    ref_id uuid,
    name text NOT NULL,
    qty numeric,
    uom text,
    cost numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT final_recipe_items_ref_type_check CHECK ((ref_type = ANY (ARRAY['material'::text, 'prep'::text])))
);


--
-- Name: final_recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.final_recipes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    category_id integer NOT NULL,
    type text NOT NULL,
    cost_per_unit_vnd numeric,
    price_current_vnd numeric,
    markup_factor numeric DEFAULT 4,
    last_update timestamp with time zone DEFAULT now(),
    price_vnd numeric NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT final_recipes_name_not_blank CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT final_recipes_price_positive CHECK ((price_vnd > (0)::numeric)),
    CONSTRAINT final_recipes_type_check CHECK ((type = ANY (ARRAY['food'::text, 'beverage'::text]))),
    CONSTRAINT final_recipes_type_valid CHECK ((type = ANY (ARRAY['food'::text, 'beverage'::text])))
);


--
-- Name: final_list_vw; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.final_list_vw WITH (security_invoker='true') AS
 SELECT f.id,
    f.name,
    dc.name AS category,
    f.type,
    COALESCE(sum(COALESCE(fi.cost, (0)::numeric)), (0)::numeric) AS cost_unit_vnd,
    f.price_vnd,
        CASE
            WHEN (COALESCE(f.price_vnd, (0)::numeric) > (0)::numeric) THEN (COALESCE(sum(COALESCE(fi.cost, (0)::numeric)), (0)::numeric) / f.price_vnd)
            ELSE NULL::numeric
        END AS cost_ratio,
        CASE
            WHEN (COALESCE(sum(COALESCE(fi.cost, (0)::numeric)), (0)::numeric) > (0)::numeric) THEN round((COALESCE(sum(COALESCE(fi.cost, (0)::numeric)), (0)::numeric) / 0.3))
            ELSE (0)::numeric
        END AS suggested_price_vnd,
    GREATEST(COALESCE(f.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(max(fi.created_at), '1970-01-01 00:00:00+00'::timestamp with time zone)) AS last_update
   FROM ((public.final_recipes f
     LEFT JOIN public.dish_categories dc ON ((dc.id = f.category_id)))
     LEFT JOIN public.final_recipe_items fi ON ((fi.final_id = f.id)))
  GROUP BY f.id, f.name, dc.name, f.type, f.price_vnd, f.updated_at;


--
-- Name: final_recipe_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.final_recipe_tags (
    final_id uuid NOT NULL,
    tag_id integer NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id integer NOT NULL,
    name text NOT NULL
);


--
-- Name: final_recipe_tags_vw; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.final_recipe_tags_vw WITH (security_invoker='true') AS
 SELECT fr.id AS final_id,
    COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE (t.id IS NOT NULL)), '{}'::text[]) AS tag_names,
    COALESCE(string_agg(t.name, ' '::text ORDER BY t.name), ''::text) AS tags_text
   FROM ((public.final_recipes fr
     LEFT JOIN public.final_recipe_tags frt ON ((frt.final_id = fr.id)))
     LEFT JOIN public.tags t ON ((t.id = frt.tag_id)))
  GROUP BY fr.id;


--
-- Name: material_price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_price_history (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    material_id uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    old_package_price numeric,
    new_package_price numeric,
    old_packaging_size numeric,
    new_packaging_size numeric,
    old_unit_cost numeric,
    new_unit_cost numeric,
    changed_by uuid DEFAULT auth.uid()
);


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    category_id integer,
    uom_id integer,
    supplier_id uuid,
    packaging_size numeric,
    package_price numeric,
    unit_cost numeric,
    notes text,
    is_food_drink boolean DEFAULT true,
    is_default boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    last_update timestamp with time zone DEFAULT now(),
    brand text,
    brand_key text GENERATED ALWAYS AS (NULLIF(lower(TRIM(BOTH FROM brand)), ''::text)) STORED,
    deleted_at timestamp with time zone,
    unit_cost_vat numeric,
    vat_rate_percent numeric(5,2),
    CONSTRAINT materials_vat_rate_percent_range CHECK (((vat_rate_percent IS NULL) OR ((vat_rate_percent >= (0)::numeric) AND (vat_rate_percent <= (100)::numeric))))
);


--
-- Name: materials_vat_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials_vat_backup (
    id uuid,
    vat_rate numeric,
    vat_rate_percent numeric(5,2),
    backed_up_at timestamp with time zone
);


--
-- Name: prep_recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prep_recipes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    category_id integer,
    type text,
    yield_qty numeric,
    waste_pct numeric DEFAULT 0,
    cost_per_unit_vnd numeric,
    last_update timestamp with time zone DEFAULT now(),
    portion_size numeric,
    uom_id integer,
    yield_uom_id bigint,
    archived_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT prep_recipes_type_check CHECK ((type = ANY (ARRAY['food'::text, 'beverage'::text])))
);


--
-- Name: recipe_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_categories (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0
);


--
-- Name: prep_list_vw; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.prep_list_vw WITH (security_invoker='true') AS
 SELECT p.id,
    p.name,
    c.name AS category,
    p.type,
    p.yield_qty,
    p.waste_pct,
    p.cost_per_unit_vnd AS cost_unit_vnd,
    p.last_update
   FROM (public.prep_recipes p
     LEFT JOIN public.recipe_categories c ON ((c.id = p.category_id)));


--
-- Name: uom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uom (
    id integer NOT NULL,
    name text NOT NULL
);


--
-- Name: prep_list_with_uom_vw; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.prep_list_with_uom_vw WITH (security_invoker='true') AS
 SELECT v.id,
    v.name,
    v.category,
    v.type,
    v.yield_qty,
    u.name AS uom_name,
    v.waste_pct,
    v.cost_unit_vnd,
    v.last_update
   FROM ((public.prep_list_vw v
     LEFT JOIN public.prep_recipes pr ON ((pr.id = v.id)))
     LEFT JOIN public.uom u ON ((u.id = pr.yield_uom_id)));


--
-- Name: prep_recipe_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prep_recipe_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prep_id uuid NOT NULL,
    "position" integer,
    ref_type text,
    ref_id uuid,
    name text,
    qty numeric,
    uom text,
    cost numeric,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT prep_recipe_items_ref_type_check CHECK ((ref_type = ANY (ARRAY['material'::text, 'prep'::text])))
);


--
-- Name: prep_recipe_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prep_recipe_tags (
    recipe_id uuid NOT NULL,
    tag_id integer NOT NULL
);


--
-- Name: recipe_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recipe_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recipe_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recipe_categories_id_seq OWNED BY public.recipe_categories.id;


--
-- Name: rental_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category_id bigint,
    supplier_id uuid,
    cost numeric(14,2),
    final_price numeric(14,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_update timestamp with time zone,
    deleted_at timestamp with time zone,
    vat_rate_percent numeric,
    CONSTRAINT rental_equipment_vat_rate_percent_chk CHECK (((vat_rate_percent IS NULL) OR ((vat_rate_percent >= (0)::numeric) AND (vat_rate_percent <= (100)::numeric))))
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    point_of_contact text,
    phone_number text,
    email text,
    poc text,
    phone text,
    order_method text,
    payment_term text,
    payment_method text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tags_id_seq OWNED BY public.tags.id;


--
-- Name: uom_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uom_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uom_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uom_id_seq OWNED BY public.uom.id;


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: dish_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dish_categories ALTER COLUMN id SET DEFAULT nextval('public.dish_categories_id_seq'::regclass);


--
-- Name: equipment_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_categories ALTER COLUMN id SET DEFAULT nextval('public.equipment_categories_id_seq'::regclass);


--
-- Name: recipe_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_categories ALTER COLUMN id SET DEFAULT nextval('public.recipe_categories_id_seq'::regclass);


--
-- Name: tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags ALTER COLUMN id SET DEFAULT nextval('public.tags_id_seq'::regclass);


--
-- Name: uom id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom ALTER COLUMN id SET DEFAULT nextval('public.uom_id_seq'::regclass);


--
-- Name: app_accounts app_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_accounts
    ADD CONSTRAINT app_accounts_email_key UNIQUE (email);


--
-- Name: app_accounts app_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_accounts
    ADD CONSTRAINT app_accounts_pkey PRIMARY KEY (id);


--
-- Name: app_accounts app_accounts_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_accounts
    ADD CONSTRAINT app_accounts_user_id_key UNIQUE (user_id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: app_settings_staff_whitelist app_settings_staff_whitelist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings_staff_whitelist
    ADD CONSTRAINT app_settings_staff_whitelist_pkey PRIMARY KEY (col_name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: dish_categories dish_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dish_categories
    ADD CONSTRAINT dish_categories_name_key UNIQUE (name);


--
-- Name: dish_categories dish_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dish_categories
    ADD CONSTRAINT dish_categories_pkey PRIMARY KEY (id);


--
-- Name: equipment_categories equipment_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_categories
    ADD CONSTRAINT equipment_categories_name_key UNIQUE (name);


--
-- Name: equipment_categories equipment_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_categories
    ADD CONSTRAINT equipment_categories_pkey PRIMARY KEY (id);


--
-- Name: equipment_price_history equipment_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_price_history
    ADD CONSTRAINT equipment_price_history_pkey PRIMARY KEY (id);


--
-- Name: final_recipe_items final_recipe_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_recipe_items
    ADD CONSTRAINT final_recipe_items_pkey PRIMARY KEY (id);


--
-- Name: final_recipe_tags final_recipe_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_recipe_tags
    ADD CONSTRAINT final_recipe_tags_pkey PRIMARY KEY (final_id, tag_id);


--
-- Name: final_recipes final_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_recipes
    ADD CONSTRAINT final_recipes_pkey PRIMARY KEY (id);


--
-- Name: material_price_history material_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_price_history
    ADD CONSTRAINT material_price_history_pkey PRIMARY KEY (id);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: prep_recipe_items prep_recipe_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep_recipe_items
    ADD CONSTRAINT prep_recipe_items_pkey PRIMARY KEY (id);


--
-- Name: prep_recipe_tags prep_recipe_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep_recipe_tags
    ADD CONSTRAINT prep_recipe_tags_pkey PRIMARY KEY (recipe_id, tag_id);


--
-- Name: prep_recipes prep_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep_recipes
    ADD CONSTRAINT prep_recipes_pkey PRIMARY KEY (id);


--
-- Name: recipe_categories recipe_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_categories
    ADD CONSTRAINT recipe_categories_name_key UNIQUE (name);


--
-- Name: recipe_categories recipe_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_categories
    ADD CONSTRAINT recipe_categories_pkey PRIMARY KEY (id);


--
-- Name: rental_equipment rental_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_equipment
    ADD CONSTRAINT rental_equipment_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_id_key UNIQUE (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id, name);


--
-- Name: tags tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: materials uniq_material_per_supplier; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT uniq_material_per_supplier UNIQUE (name, supplier_id);


--
-- Name: uom uom_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom
    ADD CONSTRAINT uom_pkey PRIMARY KEY (id);


--
-- Name: rental_equipment uq_equipment_per_supplier; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_equipment
    ADD CONSTRAINT uq_equipment_per_supplier UNIQUE (name, supplier_id);


--
-- Name: app_accounts_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_accounts_active_idx ON public.app_accounts USING btree (is_active);


--
-- Name: app_accounts_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_accounts_email_idx ON public.app_accounts USING btree (email);


--
-- Name: app_accounts_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_accounts_role_idx ON public.app_accounts USING btree (role);


--
-- Name: app_settings_singleton; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_settings_singleton ON public.app_settings USING btree ((true));


--
-- Name: final_recipe_tags_tag_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX final_recipe_tags_tag_id_idx ON public.final_recipe_tags USING btree (tag_id);


--
-- Name: final_recipes_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX final_recipes_archived_idx ON public.final_recipes USING btree (archived_at) WHERE (archived_at IS NOT NULL);


--
-- Name: final_recipes_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX final_recipes_deleted_idx ON public.final_recipes USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_eph_eq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eph_eq ON public.equipment_price_history USING btree (equipment_id, changed_at);


--
-- Name: idx_final_recipe_tags_final; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_final_recipe_tags_final ON public.final_recipe_tags USING btree (final_id);


--
-- Name: idx_final_recipe_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_final_recipe_tags_tag ON public.final_recipe_tags USING btree (tag_id);


--
-- Name: idx_materials_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_deleted_at ON public.materials USING btree (deleted_at);


--
-- Name: idx_materials_unit_cost_vat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_unit_cost_vat ON public.materials USING btree (unit_cost_vat);


--
-- Name: idx_mph_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mph_changed_at ON public.material_price_history USING btree (changed_at);


--
-- Name: idx_mph_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mph_material_id ON public.material_price_history USING btree (material_id);


--
-- Name: idx_prep_recipe_items_prep_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prep_recipe_items_prep_id ON public.prep_recipe_items USING btree (prep_id);


--
-- Name: idx_prep_recipe_items_prep_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prep_recipe_items_prep_id_created_at ON public.prep_recipe_items USING btree (prep_id, created_at);


--
-- Name: idx_re_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_re_cat ON public.rental_equipment USING btree (category_id);


--
-- Name: idx_re_lastupd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_re_lastupd ON public.rental_equipment USING btree (last_update DESC);


--
-- Name: idx_re_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_re_name ON public.rental_equipment USING btree (name);


--
-- Name: idx_re_sup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_re_sup ON public.rental_equipment USING btree (supplier_id);


--
-- Name: prep_recipe_items_prep_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prep_recipe_items_prep_id_idx ON public.prep_recipe_items USING btree (prep_id);


--
-- Name: prep_recipes_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prep_recipes_archived_idx ON public.prep_recipes USING btree (archived_at) WHERE (archived_at IS NOT NULL);


--
-- Name: prep_recipes_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prep_recipes_deleted_idx ON public.prep_recipes USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: suppliers_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_name_idx ON public.suppliers USING btree (lower(name));


--
-- Name: tags_name_lower_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_name_lower_uniq ON public.tags USING btree (lower(name));


--
-- Name: tags_name_unique_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_name_unique_ci ON public.tags USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: uq_materials_name_supplier_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_materials_name_supplier_brand ON public.materials USING btree (lower(name), supplier_id, lower(COALESCE(brand, ''::text)));


--
-- Name: app_accounts app_accounts_prevent_last_owner_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_accounts_prevent_last_owner_delete BEFORE DELETE ON public.app_accounts FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_change();


--
-- Name: app_accounts app_accounts_prevent_last_owner_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_accounts_prevent_last_owner_update BEFORE UPDATE OF role ON public.app_accounts FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_change();


--
-- Name: app_settings app_settings_staff_only_language; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_settings_staff_only_language BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.app_settings_staff_guard_upd();


--
-- Name: rental_equipment trg_log_equipment_cost; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_equipment_cost BEFORE INSERT OR UPDATE OF cost ON public.rental_equipment FOR EACH ROW EXECUTE FUNCTION public.trg_log_equipment_cost();


--
-- Name: materials trg_log_material_price_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_material_price_change AFTER UPDATE OF unit_cost, package_price ON public.materials FOR EACH ROW WHEN (((old.unit_cost IS DISTINCT FROM new.unit_cost) OR (old.package_price IS DISTINCT FROM new.package_price))) EXECUTE FUNCTION public.log_material_price_change();


--
-- Name: materials trg_materials_last_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_materials_last_update BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.set_last_update();


--
-- Name: rental_equipment trg_rental_equipment_set_price; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rental_equipment_set_price BEFORE INSERT OR UPDATE OF cost ON public.rental_equipment FOR EACH ROW EXECUTE FUNCTION public.rental_equipment_set_price();


--
-- Name: materials trg_single_default_per_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_single_default_per_name BEFORE INSERT OR UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_per_name();


--
-- Name: suppliers trg_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tags trg_tags_normalize; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tags_normalize BEFORE INSERT OR UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.tags_normalize_name();


--
-- Name: final_recipes trg_updated_at_final; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at_final BEFORE UPDATE ON public.final_recipes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: app_accounts app_accounts_user_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_accounts
    ADD CONSTRAINT app_accounts_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: app_accounts app_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_accounts
    ADD CONSTRAINT app_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: equipment_price_history equipment_price_history_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_price_history
    ADD CONSTRAINT equipment_price_history_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.rental_equipment(id) ON DELETE CASCADE;


--
-- Name: final_recipe_items final_recipe_items_final_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_recipe_items
    ADD CONSTRAINT final_recipe_items_final_id_fkey FOREIGN KEY (final_id) REFERENCES public.final_recipes(id) ON DELETE CASCADE;


--
-- Name: final_recipe_tags final_recipe_tags_final_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_recipe_tags
    ADD CONSTRAINT final_recipe_tags_final_id_fkey FOREIGN KEY (final_id) REFERENCES public.final_recipes(id) ON DELETE CASCADE;


--
-- Name: final_recipe_tags final_recipe_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_recipe_tags
    ADD CONSTRAINT final_recipe_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: final_recipes final_recipes_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_recipes
    ADD CONSTRAINT final_recipes_category_fk FOREIGN KEY (category_id) REFERENCES public.dish_categories(id);


--
-- Name: final_recipes final_recipes_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_recipes
    ADD CONSTRAINT final_recipes_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.dish_categories(id) ON DELETE SET NULL;


--
-- Name: material_price_history material_price_history_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_price_history
    ADD CONSTRAINT material_price_history_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: prep_recipe_items prep_recipe_items_prep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep_recipe_items
    ADD CONSTRAINT prep_recipe_items_prep_id_fkey FOREIGN KEY (prep_id) REFERENCES public.prep_recipes(id) ON DELETE CASCADE;


--
-- Name: prep_recipe_tags prep_recipe_tags_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep_recipe_tags
    ADD CONSTRAINT prep_recipe_tags_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.prep_recipes(id) ON DELETE CASCADE;


--
-- Name: prep_recipe_tags prep_recipe_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep_recipe_tags
    ADD CONSTRAINT prep_recipe_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: prep_recipes prep_recipes_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep_recipes
    ADD CONSTRAINT prep_recipes_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.recipe_categories(id);


--
-- Name: prep_recipes prep_recipes_uom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep_recipes
    ADD CONSTRAINT prep_recipes_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES public.uom(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: prep_recipes prep_recipes_yield_uom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prep_recipes
    ADD CONSTRAINT prep_recipes_yield_uom_id_fkey FOREIGN KEY (yield_uom_id) REFERENCES public.uom(id);


--
-- Name: rental_equipment rental_equipment_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_equipment
    ADD CONSTRAINT rental_equipment_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.equipment_categories(id) ON DELETE SET NULL;


--
-- Name: rental_equipment rental_equipment_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_equipment
    ADD CONSTRAINT rental_equipment_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: _app_settings_backup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._app_settings_backup ENABLE ROW LEVEL SECURITY;

--
-- Name: app_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: app_accounts app_accounts_del_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_accounts_del_owner_admin ON public.app_accounts FOR DELETE TO authenticated USING ((public.app_is_owner() OR (public.app_is_admin() AND (lower(role) = ANY (ARRAY['admin'::text, 'staff'::text])))));


--
-- Name: app_accounts app_accounts_ins_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_accounts_ins_owner_admin ON public.app_accounts FOR INSERT TO authenticated WITH CHECK ((public.app_is_owner() OR (public.app_is_admin() AND (lower(role) = ANY (ARRAY['admin'::text, 'staff'::text])))));


--
-- Name: app_accounts app_accounts_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_accounts_sel_authenticated ON public.app_accounts FOR SELECT TO authenticated USING (true);


--
-- Name: app_accounts app_accounts_upd_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_accounts_upd_owner_admin ON public.app_accounts FOR UPDATE TO authenticated USING ((public.app_is_owner() OR (public.app_is_admin() AND (lower(role) = ANY (ARRAY['admin'::text, 'staff'::text]))))) WITH CHECK ((public.app_is_owner() OR (public.app_is_admin() AND (lower(role) = ANY (ARRAY['admin'::text, 'staff'::text])))));


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings app_settings_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_sel_authenticated ON public.app_settings FOR SELECT TO authenticated USING (true);


--
-- Name: app_settings_staff_whitelist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings_staff_whitelist ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings_staff_whitelist app_settings_staff_whitelist_del_admin_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_staff_whitelist_del_admin_owner ON public.app_settings_staff_whitelist FOR DELETE TO authenticated USING ((public.app_is_owner() OR public.app_is_admin()));


--
-- Name: app_settings_staff_whitelist app_settings_staff_whitelist_ins_admin_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_staff_whitelist_ins_admin_owner ON public.app_settings_staff_whitelist FOR INSERT TO authenticated WITH CHECK ((public.app_is_owner() OR public.app_is_admin()));


--
-- Name: app_settings_staff_whitelist app_settings_staff_whitelist_sel_admin_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_staff_whitelist_sel_admin_owner ON public.app_settings_staff_whitelist FOR SELECT TO authenticated USING ((public.app_is_owner() OR public.app_is_admin()));


--
-- Name: app_settings_staff_whitelist app_settings_staff_whitelist_upd_admin_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_staff_whitelist_upd_admin_owner ON public.app_settings_staff_whitelist FOR UPDATE TO authenticated USING ((public.app_is_owner() OR public.app_is_admin())) WITH CHECK ((public.app_is_owner() OR public.app_is_admin()));


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_del_authenticated ON public.categories FOR DELETE TO authenticated USING (true);


--
-- Name: categories categories_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_ins_authenticated ON public.categories FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: categories categories_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_sel_authenticated ON public.categories FOR SELECT TO authenticated USING (true);


--
-- Name: categories categories_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_upd_authenticated ON public.categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: dish_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dish_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: dish_categories dish_categories_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dish_categories_del_authenticated ON public.dish_categories FOR DELETE TO authenticated USING (true);


--
-- Name: dish_categories dish_categories_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dish_categories_ins_authenticated ON public.dish_categories FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: dish_categories dish_categories_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dish_categories_sel_authenticated ON public.dish_categories FOR SELECT TO authenticated USING (true);


--
-- Name: dish_categories dish_categories_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dish_categories_upd_authenticated ON public.dish_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: equipment_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_categories equipment_categories_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_categories_del_authenticated ON public.equipment_categories FOR DELETE TO authenticated USING (true);


--
-- Name: equipment_categories equipment_categories_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_categories_ins_authenticated ON public.equipment_categories FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: equipment_categories equipment_categories_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_categories_sel_authenticated ON public.equipment_categories FOR SELECT TO authenticated USING (true);


--
-- Name: equipment_categories equipment_categories_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_categories_upd_authenticated ON public.equipment_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: equipment_price_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_price_history ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_price_history equipment_price_history_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_price_history_sel_authenticated ON public.equipment_price_history FOR SELECT TO authenticated USING (true);


--
-- Name: final_recipe_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.final_recipe_items ENABLE ROW LEVEL SECURITY;

--
-- Name: final_recipe_items final_recipe_items_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipe_items_del_authenticated ON public.final_recipe_items FOR DELETE TO authenticated USING (true);


--
-- Name: final_recipe_items final_recipe_items_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipe_items_ins_authenticated ON public.final_recipe_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: final_recipe_items final_recipe_items_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipe_items_sel_authenticated ON public.final_recipe_items FOR SELECT TO authenticated USING (true);


--
-- Name: final_recipe_items final_recipe_items_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipe_items_upd_authenticated ON public.final_recipe_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: final_recipe_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.final_recipe_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: final_recipe_tags final_recipe_tags_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipe_tags_del_authenticated ON public.final_recipe_tags FOR DELETE TO authenticated USING (true);


--
-- Name: final_recipe_tags final_recipe_tags_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipe_tags_ins_authenticated ON public.final_recipe_tags FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: final_recipe_tags final_recipe_tags_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipe_tags_sel_authenticated ON public.final_recipe_tags FOR SELECT TO authenticated USING (true);


--
-- Name: final_recipe_tags final_recipe_tags_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipe_tags_upd_authenticated ON public.final_recipe_tags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: final_recipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.final_recipes ENABLE ROW LEVEL SECURITY;

--
-- Name: final_recipes final_recipes_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipes_del_authenticated ON public.final_recipes FOR DELETE TO authenticated USING (true);


--
-- Name: final_recipes final_recipes_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipes_ins_authenticated ON public.final_recipes FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: final_recipes final_recipes_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipes_sel_authenticated ON public.final_recipes FOR SELECT TO authenticated USING (true);


--
-- Name: final_recipes final_recipes_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY final_recipes_upd_authenticated ON public.final_recipes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: material_price_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_price_history ENABLE ROW LEVEL SECURITY;

--
-- Name: material_price_history material_price_history_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY material_price_history_sel_authenticated ON public.material_price_history FOR SELECT TO authenticated USING (true);


--
-- Name: materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

--
-- Name: materials materials_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_del_authenticated ON public.materials FOR DELETE TO authenticated USING (true);


--
-- Name: materials materials_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_ins_authenticated ON public.materials FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: materials materials_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_sel_authenticated ON public.materials FOR SELECT TO authenticated USING (true);


--
-- Name: materials materials_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_upd_authenticated ON public.materials FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: materials_vat_backup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials_vat_backup ENABLE ROW LEVEL SECURITY;

--
-- Name: prep_recipe_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prep_recipe_items ENABLE ROW LEVEL SECURITY;

--
-- Name: prep_recipe_items prep_recipe_items_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipe_items_del_authenticated ON public.prep_recipe_items FOR DELETE TO authenticated USING (true);


--
-- Name: prep_recipe_items prep_recipe_items_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipe_items_ins_authenticated ON public.prep_recipe_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: prep_recipe_items prep_recipe_items_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipe_items_sel_authenticated ON public.prep_recipe_items FOR SELECT TO authenticated USING (true);


--
-- Name: prep_recipe_items prep_recipe_items_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipe_items_upd_authenticated ON public.prep_recipe_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: prep_recipe_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prep_recipe_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: prep_recipe_tags prep_recipe_tags_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipe_tags_del_authenticated ON public.prep_recipe_tags FOR DELETE TO authenticated USING (true);


--
-- Name: prep_recipe_tags prep_recipe_tags_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipe_tags_ins_authenticated ON public.prep_recipe_tags FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: prep_recipe_tags prep_recipe_tags_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipe_tags_sel_authenticated ON public.prep_recipe_tags FOR SELECT TO authenticated USING (true);


--
-- Name: prep_recipe_tags prep_recipe_tags_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipe_tags_upd_authenticated ON public.prep_recipe_tags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: prep_recipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prep_recipes ENABLE ROW LEVEL SECURITY;

--
-- Name: prep_recipes prep_recipes_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipes_del_authenticated ON public.prep_recipes FOR DELETE TO authenticated USING (true);


--
-- Name: prep_recipes prep_recipes_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipes_ins_authenticated ON public.prep_recipes FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: prep_recipes prep_recipes_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipes_sel_authenticated ON public.prep_recipes FOR SELECT TO authenticated USING (true);


--
-- Name: prep_recipes prep_recipes_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prep_recipes_upd_authenticated ON public.prep_recipes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: recipe_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recipe_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: recipe_categories recipe_categories_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipe_categories_del_authenticated ON public.recipe_categories FOR DELETE TO authenticated USING (true);


--
-- Name: recipe_categories recipe_categories_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipe_categories_ins_authenticated ON public.recipe_categories FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: recipe_categories recipe_categories_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipe_categories_sel_authenticated ON public.recipe_categories FOR SELECT TO authenticated USING (true);


--
-- Name: recipe_categories recipe_categories_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipe_categories_upd_authenticated ON public.recipe_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: rental_equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rental_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: rental_equipment rental_equipment_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rental_equipment_del_authenticated ON public.rental_equipment FOR DELETE TO authenticated USING (true);


--
-- Name: rental_equipment rental_equipment_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rental_equipment_ins_authenticated ON public.rental_equipment FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: rental_equipment rental_equipment_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rental_equipment_sel_authenticated ON public.rental_equipment FOR SELECT TO authenticated USING (true);


--
-- Name: rental_equipment rental_equipment_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rental_equipment_upd_authenticated ON public.rental_equipment FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_del_authenticated ON public.suppliers FOR DELETE TO authenticated USING (true);


--
-- Name: suppliers suppliers_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_ins_authenticated ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: suppliers suppliers_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_sel_authenticated ON public.suppliers FOR SELECT TO authenticated USING (true);


--
-- Name: suppliers suppliers_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_upd_authenticated ON public.suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_del_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_del_authenticated ON public.tags FOR DELETE TO authenticated USING (true);


--
-- Name: tags tags_ins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_ins_authenticated ON public.tags FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: tags tags_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_sel_authenticated ON public.tags FOR SELECT TO authenticated USING (true);


--
-- Name: tags tags_upd_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_upd_authenticated ON public.tags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: uom; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uom ENABLE ROW LEVEL SECURITY;

--
-- Name: uom uom_sel_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uom_sel_authenticated ON public.uom FOR SELECT TO authenticated USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict qu8d0C9cgGaTR74DgCZ6dUplsARXYIL7uZNcmAA6ChUzlJSOgdmcDnXU0uFKLFQ

