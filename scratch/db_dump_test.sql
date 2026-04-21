

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pgsodium";








ALTER SCHEMA "public" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."candidate_stage" AS ENUM (
    'new',
    'screened',
    'interview_scheduled',
    'interviewed',
    'trial_shift',
    'offer_sent',
    'hired',
    'rejected',
    'withdrawn'
);


ALTER TYPE "public"."candidate_stage" OWNER TO "postgres";


CREATE TYPE "public"."hiring_request_priority" AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


ALTER TYPE "public"."hiring_request_priority" OWNER TO "postgres";


CREATE TYPE "public"."hiring_request_status" AS ENUM (
    'draft',
    'submitted',
    'in_progress',
    'waiting_manager',
    'on_hold',
    'closed'
);


ALTER TYPE "public"."hiring_request_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_method_type" AS ENUM (
    'cash',
    'card',
    'bank',
    'other'
);


ALTER TYPE "public"."payment_method_type" OWNER TO "postgres";


CREATE TYPE "public"."wastage_charge_target" AS ENUM (
    'Restaurant',
    'Staff'
);


ALTER TYPE "public"."wastage_charge_target" OWNER TO "postgres";


CREATE TYPE "public"."wastage_type" AS ENUM (
    'Dish',
    'Material',
    'Prep'
);


ALTER TYPE "public"."wastage_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reset_all"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_reset_all"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reset_data"("scope" "text", "caller_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_reset_data"("scope" "text", "caller_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reset_settings"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_reset_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reset_suppliers"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_reset_suppliers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_has_role"("roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.app_accounts a
    where a.user_id = auth.uid()
      and a.role = any(roles)
  );
$$;


ALTER FUNCTION "public"."app_has_role"("roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.app_accounts a
    where (a.user_id = auth.uid() or lower(a.email) = lower(public.app_jwt_email()))
      and lower(a.role) = 'admin'
  );
$$;


ALTER FUNCTION "public"."app_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_is_admin_or_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$ select coalesce(public.app_role(),'') in ('owner','admin') $$;


ALTER FUNCTION "public"."app_is_admin_or_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_is_authenticated"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$ select auth.uid() is not null $$;


ALTER FUNCTION "public"."app_is_authenticated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_is_contributor"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$ select coalesce(public.app_role(),'') in ('owner','admin','staff') $$;


ALTER FUNCTION "public"."app_is_contributor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_is_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.app_accounts a
    where (a.user_id = auth.uid() or lower(a.email) = lower(public.app_jwt_email()))
      and lower(a.role) = 'owner'
  );
$$;


ALTER FUNCTION "public"."app_is_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$ select coalesce(public.app_role(),'') = 'staff' $$;


ALTER FUNCTION "public"."app_is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_jwt_email"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), '');
$$;


ALTER FUNCTION "public"."app_jwt_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_mark_onboarded"("p_uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Metadati auth (persistono a livello server)
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || '{"is_onboarded": true, "needs_onboarding": false}'::jsonb
   where id = p_uid;

  -- Traccia applicativa
  update public.app_accounts
     set first_login_at = now()
   where user_id = p_uid
     and first_login_at is null;
end;
$$;


ALTER FUNCTION "public"."app_mark_onboarded"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select role from public.app_accounts where user_id = auth.uid()), 'anonymous');
$$;


ALTER FUNCTION "public"."app_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_settings_staff_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."app_settings_staff_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_settings_staff_guard_upd"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."app_settings_staff_guard_upd"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_settings_staff_only_language"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."app_settings_staff_only_language"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_settings_staff_only_language_ins"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."app_settings_staff_only_language_ins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_uid"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    nullif(current_setting('app.test_uid', true), '')::uuid,
    auth.uid()
  );
$$;


ALTER FUNCTION "public"."app_uid"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bootstrap_app_account"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$ declare owners_count int; default_role text := 'staff'; _updated int; _name text; begin select count(*) into owners_count from public.app_accounts where role = 'owner'; if owners_count = 0 then default_role := 'owner'; end if; _name := new.raw_user_meta_data->>'full_name'; if _name is null or _name = '' then _name := new.raw_user_meta_data->>'name'; end if; update public.app_accounts a set user_id = new.id, is_active = true, name = coalesce(a.name, _name) where a.user_id is null and lower(a.email) = lower(coalesce(new.email, '')) returning 1 into _updated; if coalesce(_updated,0) > 0 then return new; end if; insert into public.app_accounts (user_id, email, role, is_active, name) values (new.id, coalesce(new.email, ''), default_role, true, _name) on conflict (user_id) do update set name = excluded.name where app_accounts.name is null; return new; end; $$;


ALTER FUNCTION "public"."bootstrap_app_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bundle_types_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."bundle_types_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_jwt_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    nullif((current_setting('request.jwt.claims', true))::jsonb ->> 'role',''),
    'anonymous'
  );
$$;


ALTER FUNCTION "public"."current_jwt_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debug_current_role"() RETURNS "text"
    LANGUAGE "sql"
    AS $$
  select current_user;
$$;


ALTER FUNCTION "public"."debug_current_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_policy"("_schemaname" "text", "_tablename" "text", "_policyname" "text", "_definition" "text") RETURNS "void"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."ensure_policy"("_schemaname" "text", "_tablename" "text", "_policyname" "text", "_definition" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_policy"("p_schema" "text", "p_table" "text", "p_name" "text", "p_cmd" "text", "p_using" "text", "p_check" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."ensure_policy"("p_schema" "text", "p_table" "text", "p_name" "text", "p_cmd" "text", "p_using" "text", "p_check" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ensure_policy"("p_schema" "text", "p_table" "text", "p_name" "text", "p_cmd" "text", "p_using" "text", "p_check" "text") IS 'Crea/aggiorna policy rispettando le regole Postgres: USING solo per SELECT/UPDATE/DELETE; WITH CHECK solo per INSERT/UPDATE. Idempotente.';



CREATE OR REPLACE FUNCTION "public"."ensure_single_default_per_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."ensure_single_default_per_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_bundle_rows_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."event_bundle_rows_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_bundles_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."event_bundles_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_delete_full"("p_event_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_out jsonb := '{}'::jsonb;
  v_bundles text[];             -- 👈 ID bundle come testo
  c_bundle_rows int := 0;
  c_bundles     int := 0;
  c_eq_rows     int := 0;
  c_staff_rows  int := 0;
  c_staff_set   int := 0;
  c_trans_rows  int := 0;
  c_trans_set   int := 0;
  c_trans_types int := 0;
  c_assets      int := 0;
  c_fees        int := 0;
  c_discounts   int := 0;
  c_totals      int := 0;
  c_contracts   int := 0;
  c_headers     int := 0;
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'p_event_id is null/empty';
  end if;

  -- 0) Raccogli tutti i bundle dell'evento (id come testo)
  select coalesce(array_agg(id::text), array[]::text[]) into v_bundles
  from event_bundles
  where event_id::text = p_event_id::text;

  -- 1) Righe menu (se esiste tabella e usa bundle_id)
  begin
    delete from event_bundle_rows
    where bundle_id::text = any (v_bundles);
    get diagnostics c_bundle_rows = row_count;
  exception when undefined_table then
    c_bundle_rows := 0;
  end;

  -- 2) Bundles
  delete from event_bundles
  where event_id::text = p_event_id::text;
  get diagnostics c_bundles = row_count;

  -- 3) Equipment rows
  delete from event_equipment_rows
  where event_id::text = p_event_id::text;
  get diagnostics c_eq_rows = row_count;

  -- 4) Staff
  delete from event_staff_rows
  where event_id::text = p_event_id::text;
  get diagnostics c_staff_rows = row_count;

  delete from event_staff_settings
  where event_id::text = p_event_id::text;
  get diagnostics c_staff_set = row_count;

  -- 5) Transport
  delete from event_transport_rows
  where event_id::text = p_event_id::text;
  get diagnostics c_trans_rows = row_count;

  delete from event_transport_settings
  where event_id::text = p_event_id::text;
  get diagnostics c_trans_set = row_count;

  delete from event_transport_vehicle_types
  where event_id::text = p_event_id::text;
  get diagnostics c_trans_types = row_count;

  -- 6) Company assets
  delete from event_company_asset_rows
  where event_id::text = p_event_id::text;
  get diagnostics c_assets = row_count;

  -- 7) Extra fees
  delete from event_extra_fee_rows
  where event_id::text = p_event_id::text;
  get diagnostics c_fees = row_count;

  -- 8) Discounts
  delete from event_discount_rows
  where event_id::text = p_event_id::text;
  get diagnostics c_discounts = row_count;

  -- 9) Totals
  delete from event_totals
  where event_id::text = p_event_id::text;
  get diagnostics c_totals = row_count;

  -- 10) Contracts (se presente)
  begin
    delete from event_contracts
    where event_id::text = p_event_id::text;
    get diagnostics c_contracts = row_count;
  exception when undefined_table then
    c_contracts := 0;
  end;

  -- 11) Header (padre)
  delete from event_headers
  where id::text = p_event_id::text;
  get diagnostics c_headers = row_count;

  v_out := jsonb_build_object(
    'event_id',     p_event_id,
    'bundle_rows',  c_bundle_rows,
    'bundles',      c_bundles,
    'equipment',    c_eq_rows,
    'staff_rows',   c_staff_rows,
    'staff_settings', c_staff_set,
    'transport_rows', c_trans_rows,
    'transport_settings', c_trans_set,
    'transport_vehicle_types', c_trans_types,
    'company_assets', c_assets,
    'extra_fees',   c_fees,
    'discounts',    c_discounts,
    'totals',       c_totals,
    'contracts',    c_contracts,
    'headers',      c_headers,
    'mode',         'hard'
  );

  return v_out;
end;
$$;


ALTER FUNCTION "public"."event_delete_full"("p_event_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."event_delete_full"("p_event_id" "text") IS 'Hard delete an event and all related rows by event_id (text or uuid); returns per-table counts.';



CREATE OR REPLACE FUNCTION "public"."event_delete_full_many"("p_event_ids" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  id text;
  out jsonb := '[]'::jsonb;
begin
  if p_event_ids is null or array_length(p_event_ids,1) is null then
    raise exception 'p_event_ids is empty';
  end if;

  foreach id in array p_event_ids loop
    out := out || jsonb_build_array(public.event_delete_full(id));
  end loop;

  return out;
end;
$$;


ALTER FUNCTION "public"."event_delete_full_many"("p_event_ids" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."event_delete_full_many"("p_event_ids" "text"[]) IS 'Call event_delete_full(text) for each id in the array; returns a JSON array of results.';



CREATE OR REPLACE FUNCTION "public"."event_equipment_rows_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."event_equipment_rows_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_headers_payment_defaults"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Normalizza bounds sempre (se valorizzati)
  IF NEW.deposit_percent IS NOT NULL THEN
    NEW.deposit_percent := GREATEST(0, LEAST(100, NEW.deposit_percent));
  END IF;
  IF NEW.balance_percent IS NOT NULL THEN
    NEW.balance_percent := GREATEST(0, LEAST(100, NEW.balance_percent));
  END IF;

  IF NEW.payment_plan = 'full' THEN
    -- Contratto in un'unica soluzione: niente deposito, balance 100%
    NEW.deposit_percent  := NULL;
    NEW.deposit_due_date := NULL;
    NEW.balance_percent  := 100;
    -- balance_due_date: lo lasciamo come lo imposti dalla UI (se c’è)
  ELSE
    -- Dilazionato: se c'è deposit_percent, calcola balance_percent = 100 - deposit_percent
    IF NEW.deposit_percent IS NOT NULL THEN
      NEW.balance_percent := 100 - NEW.deposit_percent;
    END IF;
    -- Se non hai messo deposit_percent, non forziamo nulla: la UI lo richiede comunque.
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."event_headers_payment_defaults"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_headers_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."event_headers_set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."event_totals" (
    "event_id" "uuid" NOT NULL,
    "bundles_cost" bigint DEFAULT 0 NOT NULL,
    "bundles_price" bigint DEFAULT 0 NOT NULL,
    "equipment_cost" bigint DEFAULT 0 NOT NULL,
    "equipment_price" bigint DEFAULT 0 NOT NULL,
    "staff_cost" bigint DEFAULT 0 NOT NULL,
    "staff_price" bigint DEFAULT 0 NOT NULL,
    "transport_cost" bigint DEFAULT 0 NOT NULL,
    "transport_price" bigint DEFAULT 0 NOT NULL,
    "assets_price" bigint DEFAULT 0 NOT NULL,
    "extrafee_cost" bigint DEFAULT 0 NOT NULL,
    "extrafee_price" bigint DEFAULT 0 NOT NULL,
    "discounts_total" bigint DEFAULT 0 NOT NULL,
    "grand_cost" bigint DEFAULT 0 NOT NULL,
    "grand_price" bigint DEFAULT 0 NOT NULL,
    "price_after_discounts" bigint DEFAULT 0 NOT NULL,
    "people_count" integer,
    "budget_per_person" bigint,
    "budget_total" bigint,
    "service_hours" numeric(10,2),
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_totals" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_totals_set_total"("p_event_id" "uuid", "p_total" bigint) RETURNS "public"."event_totals"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.event_totals;
begin
  -- Upsert che tocca SOLO price_after_discounts + computed_at
  insert into public.event_totals as et (
    event_id,
    price_after_discounts,
    computed_at
  ) values (
    p_event_id,
    coalesce(p_total, 0),
    now()
  )
  on conflict (event_id) do update
  set price_after_discounts = excluded.price_after_discounts,
      computed_at           = now()
  returning * into v_row;

  return v_row;
end $$;


ALTER FUNCTION "public"."event_totals_set_total"("p_event_id" "uuid", "p_total" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_totals_upsert"("p_event_id" "uuid", "p_totals" "jsonb") RETURNS "public"."event_totals"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bundles_cost          bigint := coalesce((p_totals->>'bundles_cost')::bigint, 0);
  v_bundles_price         bigint := coalesce((p_totals->>'bundles_price')::bigint, 0);
  v_equipment_cost        bigint := coalesce((p_totals->>'equipment_cost')::bigint, 0);
  v_equipment_price       bigint := coalesce((p_totals->>'equipment_price')::bigint, 0);
  v_staff_cost            bigint := coalesce((p_totals->>'staff_cost')::bigint, 0);
  v_staff_price           bigint := coalesce((p_totals->>'staff_price')::bigint, 0);
  v_transport_cost        bigint := coalesce((p_totals->>'transport_cost')::bigint, 0);
  v_transport_price       bigint := coalesce((p_totals->>'transport_price')::bigint, 0);
  v_assets_price          bigint := coalesce((p_totals->>'assets_price')::bigint, 0);
  v_extrafee_cost         bigint := coalesce((p_totals->>'extrafee_cost')::bigint, 0);
  v_extrafee_price        bigint := coalesce((p_totals->>'extrafee_price')::bigint, 0);
  v_discounts_total       bigint := coalesce((p_totals->>'discounts_total')::bigint, 0);

  v_people_count          integer := nullif((p_totals->>'people_count')::int, 0);
  v_budget_per_person     bigint  := nullif((p_totals->>'budget_per_person')::bigint, 0);
  v_budget_total          bigint  := nullif((p_totals->>'budget_total')::bigint, 0);
  v_service_hours         numeric := (p_totals->>'service_hours')::numeric;

  v_grand_cost            bigint;
  v_grand_price           bigint;
  v_after_discounts       bigint;
  v_row                   public.event_totals;
begin
  -- Calcoli aggregati server-side (nessuna fiducia nei campi derivati del client)
  v_grand_cost := v_bundles_cost + v_equipment_cost + v_staff_cost + v_transport_cost + v_extrafee_cost;
  v_grand_price := v_bundles_price + v_equipment_price + v_staff_price + v_transport_price + v_assets_price + v_extrafee_price;
  v_after_discounts := v_grand_price - v_discounts_total;

  insert into public.event_totals as et (
    event_id,
    bundles_cost, bundles_price,
    equipment_cost, equipment_price,
    staff_cost, staff_price,
    transport_cost, transport_price,
    assets_price,
    extrafee_cost, extrafee_price,
    discounts_total,
    grand_cost, grand_price, price_after_discounts,
    people_count, budget_per_person, budget_total, service_hours,
    computed_at
  ) values (
    p_event_id,
    v_bundles_cost, v_bundles_price,
    v_equipment_cost, v_equipment_price,
    v_staff_cost, v_staff_price,
    v_transport_cost, v_transport_price,
    v_assets_price,
    v_extrafee_cost, v_extrafee_price,
    v_discounts_total,
    v_grand_cost, v_grand_price, v_after_discounts,
    v_people_count, v_budget_per_person, v_budget_total, v_service_hours,
    now()
  )
  on conflict (event_id) do update
  set bundles_cost          = excluded.bundles_cost,
      bundles_price         = excluded.bundles_price,
      equipment_cost        = excluded.equipment_cost,
      equipment_price       = excluded.equipment_price,
      staff_cost            = excluded.staff_cost,
      staff_price           = excluded.staff_price,
      transport_cost        = excluded.transport_cost,
      transport_price       = excluded.transport_price,
      assets_price          = excluded.assets_price,
      extrafee_cost         = excluded.extrafee_cost,
      extrafee_price        = excluded.extrafee_price,
      discounts_total       = excluded.discounts_total,
      grand_cost            = excluded.grand_cost,
      grand_price           = excluded.grand_price,
      price_after_discounts = excluded.price_after_discounts,
      people_count          = excluded.people_count,
      budget_per_person     = excluded.budget_per_person,
      budget_total          = excluded.budget_total,
      service_hours         = excluded.service_hours,
      computed_at           = now()
  returning * into v_row;

  return v_row;
end $$;


ALTER FUNCTION "public"."event_totals_upsert"("p_event_id" "uuid", "p_totals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fill_credit_customer_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.customer_id is not null then
    select c.name, c.phone, c.email
      into new.customer_name, new.customer_phone, new.customer_email
    from public.customers c
    where c.id = new.customer_id;

    -- Se l'utente ha scritto a mano name/phone/email, non li sovrascriviamo.
    if new.customer_name is null then
      select name into new.customer_name from public.customers where id = new.customer_id;
    end if;
    if new.customer_phone is null then
      select phone into new.customer_phone from public.customers where id = new.customer_id;
    end if;
    if new.customer_email is null then
      select email::text into new.customer_email from public.customers where id = new.customer_id;
    end if;
  end if;
  return new;
end$$;


ALTER FUNCTION "public"."fill_credit_customer_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_audit_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid;
  v_role text;
begin
  -- chi ha fatto l'operazione (se token client, auth.uid() restituisce l'utente)
  begin
    v_user := auth.uid();
  exception when others then
    v_user := null;
  end;

  -- ruolo applicativo (se esiste in app_accounts)
  select lower(role) into v_role
  from public.app_accounts
  where user_id = v_user
  limit 1;

  insert into public.audit_log(table_name, op, row_id, old_data, new_data, user_id, role)
  values (
    TG_TABLE_NAME,
    TG_OP,
    coalesce( (case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW)->>'id' end),
              (case when TG_OP = 'DELETE' then to_jsonb(OLD)->>'id' end) ),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) end,
    v_user,
    v_role
  );

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;


ALTER FUNCTION "public"."fn_audit_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_log_material_price_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."fn_log_material_price_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_partner_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  base_code TEXT;
  new_code TEXT;
  suffix INT := 10;
BEGIN
  IF NEW.partner_code IS NULL THEN
    -- Strip common hospitality words (English only)
    base_code := regexp_replace(COALESCE(NEW.name, 'PARTNER'), '(?i)\y(grand|hotel|resort|homestay|hostel|apartments?|villa|suites?|guesthouse|spa|restaurant)\y|b&b|bed and breakfast', '', 'g');
    
    -- Clean alphanumeric and uppercase
    base_code := upper(regexp_replace(base_code, '[^a-zA-Z0-9]', '', 'g'));
    
    -- Fallback if the name was entirely common words 
    IF length(base_code) = 0 THEN
      base_code := upper(regexp_replace(COALESCE(NEW.name, 'PARTNER'), '[^a-zA-Z0-9]', '', 'g'));
      IF length(base_code) = 0 THEN
        base_code := 'PARTNER';
      END IF;
    END IF;

    -- Trim to 8 chars max
    IF length(base_code) > 8 THEN
      base_code := left(base_code, 8);
    END IF;

    LOOP
      new_code := base_code || suffix::TEXT;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM crm_partners WHERE partner_code = new_code);
      suffix := suffix + 1;
    END LOOP;
    
    NEW.partner_code := new_code;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_partner_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_hr_staff_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_hr_staff_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_owner_or_admin_active"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.app_accounts a
    where a.is_active = true
      and a.role in ('owner','admin')
      and (
        (auth.uid() is not null and a.user_id = auth.uid()) or
        (public.jwt_email() is not null and a.email = public.jwt_email())
      )
  );
$$;


ALTER FUNCTION "public"."is_owner_or_admin_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jwt_email"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    (auth.jwt() ->> 'email'),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  );
$$;


ALTER FUNCTION "public"."jwt_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_equipment_price_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (tg_op = 'INSERT') then
    insert into public.equipment_price_history(
      equipment_id, change_type,
      new_cost, new_vat_rate_percent, new_markup_x, new_final_price
    ) values (
      new.id, 'insert',
      new.cost, new.vat_rate_percent, new.markup_x, new.final_price
    );
    return new;

  elsif (tg_op = 'UPDATE') then
    insert into public.equipment_price_history(
      equipment_id, change_type,
      old_cost, old_vat_rate_percent, old_markup_x, old_final_price,
      new_cost, new_vat_rate_percent, new_markup_x, new_final_price
    ) values (
      new.id, 'update',
      old.cost, old.vat_rate_percent, old.markup_x, old.final_price,
      new.cost, new.vat_rate_percent, new.markup_x, new.final_price
    );
    return new;

  elsif (tg_op = 'DELETE') then
    insert into public.equipment_price_history(
      equipment_id, change_type,
      old_cost, old_vat_rate_percent, old_markup_x, old_final_price
    ) values (
      old.id, 'delete',
      old.cost, old.vat_rate_percent, old.markup_x, old.final_price
    );
    return old;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."log_equipment_price_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_material_price_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."log_material_price_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_last_owner_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."prevent_last_owner_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rental_equipment_apply_pricing"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.final_price :=
    round(
      (coalesce(new.cost,0) * (1 + coalesce(new.vat_rate_percent,0)::numeric/100))
      * coalesce(new.markup_x, 1.5),
      0
    );
  new.last_update := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."rental_equipment_apply_pricing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rental_equipment_set_price"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."rental_equipment_set_price"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_event_vehicle_types"("p_event_id" "text", "p_names" "text"[], "p_costs" numeric[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  i int;
begin
  if p_event_id is null then
    raise exception 'event_id required';
  end if;
  if array_length(p_names,1) is distinct from array_length(p_costs,1) then
    raise exception 'names[] and costs[] must have same length';
  end if;

  delete from public.event_transport_vehicle_types where event_id = p_event_id;

  if p_names is not null then
    for i in 1 .. array_length(p_names,1) loop
      insert into public.event_transport_vehicle_types(event_id, name, cost_per_km)
      values (p_event_id, nullif(p_names[i], ''), coalesce(p_costs[i], 0));
    end loop;
  end if;
end$$;


ALTER FUNCTION "public"."replace_event_vehicle_types"("p_event_id" "text", "p_names" "text"[], "p_costs" numeric[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_ets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end$$;


ALTER FUNCTION "public"."set_ets_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_etvt_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end$$;


ALTER FUNCTION "public"."set_etvt_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_last_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.last_update := now();
  return new;
end $$;


ALTER FUNCTION "public"."set_last_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_timestamp_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end; $$;


ALTER FUNCTION "public"."set_timestamp_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_vat_and_recalc"("p_vat_enabled" boolean) RETURNS TABLE("prep_mat_rows_updated" integer, "final_mat_rows_updated" integer, "prep_prep_rows_updated" integer, "prep_headers_updated" integer, "final_prep_rows_updated" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."set_vat_and_recalc"("p_vat_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tags_normalize_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  return new;
end
$$;


ALTER FUNCTION "public"."tags_normalize_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_event_company_asset_rows_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;


ALTER FUNCTION "public"."tg_event_company_asset_rows_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_log_equipment_cost"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."trg_log_equipment_cost"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_customer"("p_name" "text", "p_phone" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_id uuid;
begin
  -- 1) prova per phone
  if p_phone is not null and length(trim(p_phone)) > 0 then
    select id into v_id from public.customers where phone = trim(p_phone) limit 1;
  end if;

  -- 2) se non trovato, prova per email
  if v_id is null and p_email is not null and length(trim(p_email)) > 0 then
    select id into v_id from public.customers where email = trim(p_email) limit 1;
  end if;

  -- 3) se non trovato, prova per nome case-insensitive
  if v_id is null and p_name is not null and length(trim(p_name)) > 0 then
    select id into v_id from public.customers where lower(name) = lower(trim(p_name)) limit 1;
  end if;

  -- 4) se non trovato, crea
  if v_id is null then
    insert into public.customers (name, phone, email)
    values (nullif(trim(p_name), ''), nullif(trim(p_phone), ''), nullif(trim(p_email), ''))
    returning id into v_id;
  else
    -- aggiorna campi mancanti se arrivano dati nuovi
    update public.customers
    set
      name  = coalesce(nullif(trim(p_name), ''), name),
      phone = coalesce(nullif(trim(p_phone), ''), phone),
      email = coalesce(nullif(trim(p_email), ''), email)
    where id = v_id;
  end if;

  return v_id;
end
$$;


ALTER FUNCTION "public"."upsert_customer"("p_name" "text", "p_phone" "text", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_event_transport_markup"("p_event_id" "text", "p_markup_x" numeric) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  insert into public.event_transport_settings (event_id, markup_x)
  values (p_event_id, p_markup_x)
  on conflict (event_id) do update
    set markup_x = excluded.markup_x,
        updated_at = now();
$$;


ALTER FUNCTION "public"."upsert_event_transport_markup"("p_event_id" "text", "p_markup_x" numeric) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_app_settings_backup" (
    "archived_at" timestamp with time zone DEFAULT "now"(),
    "row_json" "jsonb"
);


ALTER TABLE "public"."_app_settings_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'staff'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "phone" "text",
    "name" "text",
    "position" "text",
    "first_login_at" timestamp with time zone,
    "referral_code" character varying(50),
    CONSTRAINT "app_accounts_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'staff'::"text", 'sale advisor'::"text"])))
);


ALTER TABLE "public"."app_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" "text" DEFAULT 'singleton'::"text" NOT NULL,
    "currency" "text" DEFAULT 'VND'::"text" NOT NULL,
    "vat_rate" integer,
    "default_markup_pct" numeric,
    "round_unit_cost_digits" integer DEFAULT 0 NOT NULL,
    "show_costs_with_decimals" boolean DEFAULT false NOT NULL,
    "review_stale_months" integer DEFAULT 4 NOT NULL,
    "csv_require_confirm_refs" boolean DEFAULT true NOT NULL,
    "trash_retention_days" integer DEFAULT 30 NOT NULL,
    "recipes_split_mode" "text" DEFAULT 'split'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "language_code" "text" DEFAULT 'en'::"text" NOT NULL,
    "vat_enabled" boolean DEFAULT false NOT NULL,
    "materials_exclusive_default" boolean DEFAULT true NOT NULL,
    "default_markup_equipment_pct" numeric,
    "default_markup_recipes_pct" numeric,
    "materials_review_months" integer DEFAULT 4 NOT NULL,
    "equipment_review_months" integer DEFAULT 4 NOT NULL,
    "equipment_csv_require_confirm_refs" boolean DEFAULT true NOT NULL,
    "recipes_tab1_name" "text" DEFAULT 'Final'::"text" NOT NULL,
    "recipes_tab2_name" "text",
    "restaurant_name" "text",
    "company_name" "text",
    "address" "text",
    "tax_code" "text",
    "phone" "text",
    "email" "text",
    "website" "text",
    "logo_mime" "text",
    "logo_data" "text",
    "recipes_review_months" integer DEFAULT 4 NOT NULL,
    "hr_review_frequency" "text" DEFAULT 'Quarterly'::"text",
    "crm_advisor_commission_pct" numeric DEFAULT 10,
    "crm_commission_type" "text" DEFAULT 'Acquisition + Maintenance'::"text",
    "crm_commission_rules" "jsonb" DEFAULT '{"acquisition_pct": 10, "maintenance_pct": 4}'::"jsonb",
    "crm_partner_rules" "jsonb" DEFAULT '{"details": "", "has_discount": false, "has_commission": true, "commission_base": "Before Discount", "commission_type": "Percentage", "commission_value": 10, "client_discount_type": "Percentage", "client_discount_value": 0}'::"jsonb",
    CONSTRAINT "app_settings_language_code_check" CHECK (("language_code" = ANY (ARRAY['en'::"text", 'vi'::"text"])))
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings_staff_whitelist" (
    "col_name" "text" NOT NULL
);


ALTER TABLE "public"."app_settings_staff_whitelist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "table_name" "text" NOT NULL,
    "op" "text" NOT NULL,
    "row_id" "text",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "user_id" "uuid",
    "role" "text",
    CONSTRAINT "audit_log_op_check" CHECK (("op" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."bundle_types" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "max_modifiers" integer DEFAULT 0 NOT NULL,
    "dish_categories" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "modifier_slots" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "markup_x" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bundle_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "hiring_request_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "cv_url" "text",
    "stage" "public"."candidate_stage" DEFAULT 'new'::"public"."candidate_stage",
    "source" "text",
    "notes" "text"
);


ALTER TABLE "public"."candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_ledger_deposits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "branch" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "deposit_date" "date"
);


ALTER TABLE "public"."cash_ledger_deposits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cashier_closings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_date" "date" NOT NULL,
    "branch_name" "text" NOT NULL,
    "branch_id" "uuid",
    "shift" "text",
    "cashier_name" "text",
    "notes" "text",
    "opening_float_vnd" bigint DEFAULT 0 NOT NULL,
    "revenue_vnd" bigint DEFAULT 0 NOT NULL,
    "gojek_vnd" bigint DEFAULT 0 NOT NULL,
    "grab_vnd" bigint DEFAULT 0 NOT NULL,
    "mpos_vnd" bigint DEFAULT 0 NOT NULL,
    "unpaid_vnd" bigint DEFAULT 0 NOT NULL,
    "repayments_cash_card_vnd" bigint DEFAULT 0 NOT NULL,
    "set_off_debt_vnd" bigint DEFAULT 0 NOT NULL,
    "capichi_vnd" bigint DEFAULT 0 NOT NULL,
    "bank_transfer_ewallet_vnd" bigint DEFAULT 0 NOT NULL,
    "cash_out_vnd" bigint DEFAULT 0 NOT NULL,
    "payouts_vnd" bigint DEFAULT 0 NOT NULL,
    "deposits_vnd" bigint DEFAULT 0 NOT NULL,
    "cash_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "float_plan_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "third_party_amounts_json" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."cashier_closings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cashout" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "date" "date" DEFAULT "now"() NOT NULL,
    "description" "text" NOT NULL,
    "category" "text",
    "amount" numeric(12,0) DEFAULT 0 NOT NULL,
    "supplier_id" "uuid",
    "supplier_name" "text",
    "invoice" boolean DEFAULT false NOT NULL,
    "delivery_note" boolean DEFAULT false NOT NULL,
    "shift" "text",
    "paid_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "input_time" time without time zone DEFAULT ("now"())::time without time zone,
    "branch" "text"
);


ALTER TABLE "public"."cashout" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "name_key" "text" GENERATED ALWAYS AS ("lower"(TRIM(BOTH FROM "name"))) STORED
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."categories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."categories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."categories_id_seq" OWNED BY "public"."categories"."id";



CREATE TABLE IF NOT EXISTS "public"."event_headers" (
    "id" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "location" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "customer_type" "text",
    "company" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_director" "text",
    "company_tax_code" "text",
    "company_address" "text",
    "company_city" "text",
    "billing_email" "text",
    "preferred_contact" "text",
    "people_count" integer,
    "budget_per_person_vnd" numeric,
    "budget_total_vnd" numeric,
    "event_date" "date",
    "event_name" "text",
    "host_name" "text",
    "payment_plan" "text" DEFAULT 'full'::"text" NOT NULL,
    "deposit_percent" numeric(5,2),
    "deposit_due_date" "date",
    "balance_percent" numeric(5,2) DEFAULT 100,
    "balance_due_date" "date",
    "provider_branch_id" "text",
    "deposit_paid_at" timestamp with time zone,
    "balance_paid_at" timestamp with time zone,
    "status" "text",
    CONSTRAINT "event_headers_balance_percent_check" CHECK ((("balance_percent" >= (0)::numeric) AND ("balance_percent" <= (100)::numeric))),
    CONSTRAINT "event_headers_budget_pp_nonneg" CHECK ((("budget_per_person_vnd" IS NULL) OR ("budget_per_person_vnd" >= (0)::numeric))),
    CONSTRAINT "event_headers_budget_total_nonneg" CHECK ((("budget_total_vnd" IS NULL) OR ("budget_total_vnd" >= (0)::numeric))),
    CONSTRAINT "event_headers_deposit_percent_check" CHECK ((("deposit_percent" >= (0)::numeric) AND ("deposit_percent" <= (100)::numeric))),
    CONSTRAINT "event_headers_payment_plan_check" CHECK (("payment_plan" = ANY (ARRAY['full'::"text", 'installments'::"text"]))),
    CONSTRAINT "event_headers_people_count_nonneg" CHECK ((("people_count" IS NULL) OR ("people_count" >= 0))),
    CONSTRAINT "event_headers_preferred_contact_chk" CHECK ((("preferred_contact" IS NULL) OR ("preferred_contact" = ANY (ARRAY['phone'::"text", 'email'::"text", 'whatsapp'::"text", 'zalo'::"text", 'other'::"text"])))),
    CONSTRAINT "event_headers_status_check" CHECK (("status" = ANY (ARRAY['inquiry'::"text", 'pending'::"text", 'confirmed'::"text", 'unpaid'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."event_headers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."event_headers"."company_director" IS 'Legal representative / director name';



COMMENT ON COLUMN "public"."event_headers"."company_tax_code" IS 'Company tax/VAT code';



COMMENT ON COLUMN "public"."event_headers"."company_address" IS 'Company billing address';



COMMENT ON COLUMN "public"."event_headers"."company_city" IS 'Company city';



COMMENT ON COLUMN "public"."event_headers"."billing_email" IS 'Email where to send the invoice';



COMMENT ON COLUMN "public"."event_headers"."preferred_contact" IS 'Preferred contact method: phone/email/whatsapp/zalo/other';



COMMENT ON COLUMN "public"."event_headers"."people_count" IS 'Number of attendees (UI helper)';



COMMENT ON COLUMN "public"."event_headers"."budget_per_person_vnd" IS 'Budget per person, in VND';



COMMENT ON COLUMN "public"."event_headers"."budget_total_vnd" IS 'Total budget, in VND';



CREATE OR REPLACE VIEW "public"."catering_event_list_vw" WITH ("security_invoker"='on') AS
 WITH "base" AS (
         SELECT "eh"."id" AS "event_id",
            "eh"."event_date",
            "eh"."event_name",
            "eh"."host_name",
            ("et"."price_after_discounts")::numeric AS "total_vnd",
            "eh"."updated_at",
            "eh"."payment_plan",
            "eh"."deposit_due_date",
            "eh"."balance_due_date",
            "eh"."deposit_paid_at",
            "eh"."balance_paid_at",
            "eh"."status"
           FROM ("public"."event_headers" "eh"
             LEFT JOIN "public"."event_totals" "et" ON ((("et"."event_id")::"text" = "eh"."id")))
        ), "calc" AS (
         SELECT "base"."event_id",
            "base"."event_date",
            "base"."event_name",
            "base"."host_name",
            "base"."total_vnd",
            "base"."updated_at",
            "base"."payment_plan",
            "base"."deposit_due_date",
            "base"."balance_due_date",
            "base"."deposit_paid_at",
            "base"."balance_paid_at",
            "base"."status",
                CASE
                    WHEN ("base"."payment_plan" = 'full'::"text") THEN
                    CASE
                        WHEN (("base"."balance_due_date" IS NOT NULL) AND ("base"."balance_paid_at" IS NULL)) THEN 'balance'::"text"
                        ELSE NULL::"text"
                    END
                    WHEN ("base"."payment_plan" = 'installments'::"text") THEN
                    CASE
                        WHEN (("base"."deposit_due_date" IS NOT NULL) AND ("base"."deposit_paid_at" IS NULL)) THEN 'deposit'::"text"
                        WHEN (("base"."balance_due_date" IS NOT NULL) AND ("base"."balance_paid_at" IS NULL)) THEN 'balance'::"text"
                        ELSE NULL::"text"
                    END
                    ELSE NULL::"text"
                END AS "next_due_kind",
                CASE
                    WHEN (("base"."payment_plan" = 'full'::"text") AND ("base"."balance_paid_at" IS NULL)) THEN "base"."balance_due_date"
                    WHEN (("base"."payment_plan" = 'installments'::"text") AND ("base"."deposit_due_date" IS NOT NULL) AND ("base"."deposit_paid_at" IS NULL)) THEN "base"."deposit_due_date"
                    WHEN (("base"."payment_plan" = 'installments'::"text") AND ("base"."balance_due_date" IS NOT NULL) AND ("base"."balance_paid_at" IS NULL)) THEN "base"."balance_due_date"
                    ELSE NULL::"date"
                END AS "next_due_date"
           FROM "base"
        )
 SELECT "event_id",
    "event_date",
    "event_name",
    "host_name",
    "total_vnd",
    "updated_at",
    "payment_plan",
    "deposit_due_date",
    "balance_due_date",
    "deposit_paid_at",
    "balance_paid_at",
    "status",
    "next_due_kind",
    "next_due_date"
   FROM "calc";


ALTER VIEW "public"."catering_event_list_vw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catering_event_pay_state" (
    "event_id" "text" NOT NULL,
    "deposit_paid_at" timestamp with time zone,
    "balance_paid_at" timestamp with time zone,
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "catering_event_pay_state_status_check" CHECK (("status" = ANY (ARRAY['inquiry'::"text", 'pending'::"text", 'confirmed'::"text", 'unpaid'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."catering_event_pay_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_payment_state" (
    "event_id" "text" NOT NULL,
    "deposit_paid_at" timestamp with time zone,
    "balance_paid_at" timestamp with time zone,
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_payment_state_status_check" CHECK (("status" = ANY (ARRAY['inquiry'::"text", 'pending'::"text", 'confirmed'::"text", 'unpaid'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."event_payment_state" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."catering_event_pay_vw" WITH ("security_invoker"='on') AS
 WITH "base" AS (
         SELECT "eh"."id",
            "eh"."event_date",
            "eh"."event_name",
            "eh"."host_name",
            ("et"."price_after_discounts")::numeric AS "total_vnd",
            "eh"."updated_at",
            "eh"."payment_plan",
                CASE
                    WHEN ("eh"."deposit_percent" IS NULL) THEN NULL::numeric
                    WHEN ("eh"."deposit_percent" <= (1)::numeric) THEN ("eh"."deposit_percent" * (100)::numeric)
                    ELSE ("eh"."deposit_percent")::numeric
                END AS "deposit_percent_0_100",
            "eh"."deposit_due_date",
                CASE
                    WHEN ("eh"."balance_percent" IS NULL) THEN NULL::numeric
                    WHEN ("eh"."balance_percent" <= (1)::numeric) THEN ("eh"."balance_percent" * (100)::numeric)
                    ELSE ("eh"."balance_percent")::numeric
                END AS "balance_percent_0_100",
            "eh"."balance_due_date",
            "eps"."deposit_paid_at",
            "eps"."balance_paid_at",
            "eps"."status"
           FROM (("public"."event_headers" "eh"
             LEFT JOIN "public"."event_totals" "et" ON ((("et"."event_id")::"text" = "eh"."id")))
             LEFT JOIN "public"."event_payment_state" "eps" ON (("eps"."event_id" = "eh"."id")))
        ), "calc" AS (
         SELECT "base"."id",
            "base"."event_date",
            "base"."event_name",
            "base"."host_name",
            "base"."total_vnd",
            "base"."updated_at",
            "base"."payment_plan",
            "base"."deposit_percent_0_100",
            "base"."deposit_due_date",
            "base"."balance_percent_0_100",
            "base"."balance_due_date",
            "base"."deposit_paid_at",
            "base"."balance_paid_at",
            "base"."status",
                CASE
                    WHEN ("base"."payment_plan" = 'full'::"text") THEN
                    CASE
                        WHEN (("base"."balance_due_date" IS NOT NULL) AND ("base"."balance_paid_at" IS NULL)) THEN 'balance'::"text"
                        ELSE NULL::"text"
                    END
                    WHEN ("base"."payment_plan" = 'installments'::"text") THEN
                    CASE
                        WHEN (("base"."deposit_due_date" IS NOT NULL) AND ("base"."deposit_paid_at" IS NULL)) THEN 'deposit'::"text"
                        WHEN (("base"."balance_due_date" IS NOT NULL) AND ("base"."balance_paid_at" IS NULL)) THEN 'balance'::"text"
                        ELSE NULL::"text"
                    END
                    ELSE NULL::"text"
                END AS "next_due_kind",
                CASE
                    WHEN (("base"."payment_plan" = 'full'::"text") AND ("base"."balance_paid_at" IS NULL)) THEN "base"."balance_due_date"
                    WHEN (("base"."payment_plan" = 'installments'::"text") AND ("base"."deposit_due_date" IS NOT NULL) AND ("base"."deposit_paid_at" IS NULL)) THEN "base"."deposit_due_date"
                    WHEN (("base"."payment_plan" = 'installments'::"text") AND ("base"."balance_due_date" IS NOT NULL) AND ("base"."balance_paid_at" IS NULL)) THEN "base"."balance_due_date"
                    ELSE NULL::"date"
                END AS "next_due_date"
           FROM "base"
        )
 SELECT "id",
    "event_date",
    "event_name",
    "host_name",
    "total_vnd",
    "updated_at",
    "payment_plan",
    "deposit_percent_0_100",
    "deposit_due_date",
    "balance_percent_0_100",
    "balance_due_date",
    "next_due_kind",
    "next_due_date",
    (("next_due_date" IS NOT NULL) AND ("next_due_date" < CURRENT_DATE)) AS "is_overdue",
    "status"
   FROM "calc";


ALTER VIEW "public"."catering_event_pay_vw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_template_settings" (
    "key" "text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."contract_template_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_templates" (
    "key" "text" NOT NULL,
    "label" "text",
    "html" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "docx_path" "text"
);


ALTER TABLE "public"."contract_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "credit_id" "uuid" NOT NULL,
    "date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "amount" integer NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "method" "public"."payment_method_type",
    "method_other" "text",
    "method_label" "text" GENERATED ALWAYS AS (
CASE
    WHEN (("method" = 'other'::"public"."payment_method_type") AND ("method_other" IS NOT NULL) AND ("btrim"("method_other") <> ''::"text")) THEN "method_other"
    WHEN ("method" = 'cash'::"public"."payment_method_type") THEN 'Cash'::"text"
    WHEN ("method" = 'card'::"public"."payment_method_type") THEN 'Card'::"text"
    WHEN ("method" = 'bank'::"public"."payment_method_type") THEN 'Bank Transfer / e-Wallet'::"text"
    ELSE COALESCE("note", ''::"text")
END) STORED,
    CONSTRAINT "credit_payments_amount_check" CHECK (("amount" >= 0))
);


ALTER TABLE "public"."credit_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch" "text",
    "date" "date" NOT NULL,
    "type" "text" DEFAULT 'credit'::"text" NOT NULL,
    "customer_id" "uuid",
    "customer_name" "text",
    "customer_phone" "text",
    "customer_email" "text",
    "description" "text",
    "amount" integer NOT NULL,
    "reference" "text",
    "shift" "text",
    "handled_by" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credits_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "credits_type_check" CHECK (("type" = 'credit'::"text"))
);


ALTER TABLE "public"."credits" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."credit_totals_vw" WITH ("security_invoker"='on') AS
 SELECT "c"."id" AS "credit_id",
    (COALESCE("sum"("p"."amount"), (0)::bigint))::integer AS "paid",
    "max"("p"."date") AS "last_payment_at"
   FROM ("public"."credits" "c"
     LEFT JOIN "public"."credit_payments" "p" ON (("p"."credit_id" = "c"."id")))
  GROUP BY "c"."id";


ALTER VIEW "public"."credit_totals_vw" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."credits_with_totals_vw" WITH ("security_invoker"='on') AS
 SELECT "c"."id",
    "c"."branch",
    "c"."date",
    "c"."type",
    "c"."customer_id",
    "c"."customer_name",
    "c"."customer_phone",
    "c"."customer_email",
    "c"."description",
    "c"."amount",
    "c"."reference",
    "c"."shift",
    "c"."handled_by",
    "c"."note",
    "c"."created_at",
    "t"."paid",
    GREATEST(("c"."amount" - COALESCE("t"."paid", 0)), 0) AS "remaining",
        CASE
            WHEN (GREATEST(("c"."amount" - COALESCE("t"."paid", 0)), 0) = 0) THEN 'Paid'::"text"
            ELSE 'Unpaid'::"text"
        END AS "status",
    "t"."last_payment_at"
   FROM ("public"."credits" "c"
     LEFT JOIN "public"."credit_totals_vw" "t" ON (("t"."credit_id" = "c"."id")));


ALTER VIEW "public"."credits_with_totals_vw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_advisor_agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "partner_id" "uuid",
    "commission_type" "text" DEFAULT 'Acquisition + Maintenance'::"text",
    "commission_rules" "jsonb" DEFAULT '{"acquisition_pct": 10, "maintenance_pct": 4}'::"jsonb",
    "status" "text" DEFAULT 'Active'::"text",
    "valid_until" "date",
    "notes" "text"
);


ALTER TABLE "public"."crm_advisor_agreements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "partner_id" "uuid",
    "commission_type" "text" DEFAULT 'Percentage'::"text",
    "commission_value" numeric DEFAULT 0,
    "details" "text",
    "status" "text" DEFAULT 'Draft'::"text",
    "valid_until" "date",
    "client_discount_type" "text",
    "client_discount_value" numeric,
    "commission_base" "text" DEFAULT 'Before Discount'::"text"
);


ALTER TABLE "public"."crm_agreements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "uploaded_by" "uuid"
);


ALTER TABLE "public"."crm_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "partner_id" "uuid",
    "user_id" "uuid",
    "type" "text" DEFAULT 'Note'::"text",
    "date" timestamp with time zone DEFAULT "now"(),
    "notes" "text" NOT NULL
);


ALTER TABLE "public"."crm_interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" NOT NULL,
    "type" "text",
    "contact_name" "text",
    "email" "text",
    "phone" "text",
    "location" "text",
    "status" "text" DEFAULT 'Lead'::"text",
    "priority" "text" DEFAULT 'Medium'::"text",
    "pipeline_stage" "text" DEFAULT 'New Leads'::"text",
    "owner_id" "uuid",
    "notes" "text",
    "partner_code" "text",
    "partner_password_hash" "text",
    "failed_login_attempts" integer DEFAULT 0,
    "locked_until" timestamp with time zone,
    "created_by" "uuid",
    "rejection_reason" "text",
    "is_deleted" boolean DEFAULT false
);


ALTER TABLE "public"."crm_partners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "partner_id" "uuid",
    "period" "text" NOT NULL,
    "amount" numeric DEFAULT 0,
    "status" "text" DEFAULT 'Pending'::"text",
    "payment_date" "date",
    "reference_number" "text",
    "notes" "text",
    "sale_advisor_id" "uuid",
    "payout_type" "text" DEFAULT 'partner'::"text"
);


ALTER TABLE "public"."crm_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "partner_id" "uuid",
    "guest_name" "text" NOT NULL,
    "guest_contact" "text",
    "arrival_date" "date",
    "party_size" integer DEFAULT 1,
    "status" "text" DEFAULT 'Pending'::"text",
    "revenue_generated" numeric DEFAULT 0,
    "commission_value" numeric DEFAULT 0,
    "validation_notes" "text",
    "payout_id" "uuid",
    "sale_advisor_id" "uuid",
    "advisor_commission_value" numeric DEFAULT 0,
    "advisor_payout_id" "uuid"
);


ALTER TABLE "public"."crm_referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "partner_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "due_date" "date",
    "priority" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."crm_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "public"."citext",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_closings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "time" time without time zone NOT NULL,
    "branch_name" "text" NOT NULL,
    "revenue" bigint DEFAULT 0 NOT NULL,
    "unpaid" bigint DEFAULT 0 NOT NULL,
    "cashout" bigint DEFAULT 0 NOT NULL,
    "cash_to_take" bigint DEFAULT 0 NOT NULL,
    "entered_by" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_closings_nonneg" CHECK ((("revenue" >= 0) AND ("unpaid" >= 0) AND ("cashout" >= 0) AND ("cash_to_take" >= 0)))
);


ALTER TABLE "public"."daily_closings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_report_bank_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch" "text",
    "date" "date" NOT NULL,
    "amount" bigint NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_report_bank_transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_report_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_name" "text" NOT NULL,
    "settings" "jsonb" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_report_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deposit_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deposit_id" "uuid" NOT NULL,
    "amount" bigint DEFAULT 0 NOT NULL,
    "date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text",
    "ended_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."deposit_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deposits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch" "text" NOT NULL,
    "date" "date" NOT NULL,
    "event_date" "date",
    "customer_id" "uuid",
    "customer_name" "text",
    "customer_phone" "text",
    "customer_email" "text",
    "amount" bigint DEFAULT 0 NOT NULL,
    "reference" "text",
    "shift" "text",
    "handled_by" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."deposits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dish_categories" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0
);


ALTER TABLE "public"."dish_categories" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."dish_categories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."dish_categories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."dish_categories_id_seq" OWNED BY "public"."dish_categories"."id";



CREATE TABLE IF NOT EXISTS "public"."equipment_categories" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."equipment_categories" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."equipment_categories_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."equipment_categories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."equipment_categories_id_seq" OWNED BY "public"."equipment_categories"."id";



CREATE TABLE IF NOT EXISTS "public"."equipment_price_history" (
    "id" bigint NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "change_type" "text" DEFAULT 'update'::"text" NOT NULL,
    "old_cost" numeric,
    "old_vat_rate_percent" numeric,
    "old_markup_x" numeric,
    "old_final_price" numeric,
    "new_cost" numeric,
    "new_vat_rate_percent" numeric,
    "new_markup_x" numeric,
    "new_final_price" numeric,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "equipment_price_history_change_type_check" CHECK (("change_type" = ANY (ARRAY['insert'::"text", 'update'::"text", 'delete'::"text", 'snapshot'::"text"])))
);


ALTER TABLE "public"."equipment_price_history" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."equipment_price_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."equipment_price_history_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."equipment_price_history_id_seq" OWNED BY "public"."equipment_price_history"."id";



CREATE TABLE IF NOT EXISTS "public"."event_bundle_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bundle_id" "uuid" NOT NULL,
    "dish_id" "text" NOT NULL,
    "qty" integer DEFAULT 1 NOT NULL,
    "modifiers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_bundle_rows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "type_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_bundles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_company_asset_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text" NOT NULL,
    "asset_name" "text" NOT NULL,
    "asset_id" "uuid",
    "qty" numeric DEFAULT 1 NOT NULL,
    "include_price" boolean DEFAULT false NOT NULL,
    "unit_price_vnd" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_company_asset_rows_price_guard_ck" CHECK (((("include_price" = true) AND ("unit_price_vnd" IS NOT NULL) AND ("unit_price_vnd" >= (0)::numeric)) OR (("include_price" = false) AND ("unit_price_vnd" IS NULL)))),
    CONSTRAINT "event_company_asset_rows_qty_check" CHECK (("qty" >= (0)::numeric))
);


ALTER TABLE "public"."event_company_asset_rows" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_company_asset_rows" IS 'Righe asset aziendali per evento. Totale riga in UI: include_price ? qty * unit_price_vnd : 0';



COMMENT ON COLUMN "public"."event_company_asset_rows"."asset_name" IS 'Label visuale libero';



COMMENT ON COLUMN "public"."event_company_asset_rows"."unit_price_vnd" IS 'Prezzo unitario in VND se include_price = true';



CREATE TABLE IF NOT EXISTS "public"."event_contracts" (
    "event_id" "uuid" NOT NULL,
    "html" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "docx_path" "text"
);


ALTER TABLE "public"."event_contracts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_discount_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text" NOT NULL,
    "label" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "calc_mode" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_discount_rows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_equipment_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text" NOT NULL,
    "equipment_id" "uuid",
    "qty" numeric DEFAULT 1 NOT NULL,
    "notes" "text",
    "unit_cost_override" numeric,
    "vat_override_percent" numeric,
    "markup_x_override" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_equipment_rows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_extra_fee_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "notes" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "qty" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric,
    "calc_mode" boolean DEFAULT false NOT NULL,
    "cost" numeric,
    "markup_x" numeric,
    CONSTRAINT "event_extra_fee_rows_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "event_extra_fee_rows_markup_nonneg_chk" CHECK ((("markup_x" IS NULL) OR ("markup_x" >= (0)::numeric))),
    CONSTRAINT "event_extra_fee_rows_qty_nonneg_chk" CHECK (("qty" >= 0))
);


ALTER TABLE "public"."event_extra_fee_rows" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_extra_fee_rows" IS 'Extra fees per catering event. DB-first, UI raw inputs, totals in UI.';



COMMENT ON COLUMN "public"."event_extra_fee_rows"."event_id" IS 'FK to event_headers.id';



COMMENT ON COLUMN "public"."event_extra_fee_rows"."label" IS 'Short description of the fee';



COMMENT ON COLUMN "public"."event_extra_fee_rows"."amount" IS 'Amount in VND, non-negative. No rounding in DB.';



COMMENT ON COLUMN "public"."event_extra_fee_rows"."notes" IS 'Optional notes';



CREATE TABLE IF NOT EXISTS "public"."event_staff_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT ''::"text" NOT NULL,
    "cost_per_hour" numeric DEFAULT 0 NOT NULL,
    "hours" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_staff_rows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_staff_settings" (
    "event_id" "text" NOT NULL,
    "markup_x" numeric DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_staff_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_transport_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text" NOT NULL,
    "from_address" "text",
    "to_address" "text",
    "vehicle_key" "text",
    "distance_km" numeric(12,3),
    "eta_minutes" integer,
    "roundtrip" boolean DEFAULT true NOT NULL,
    "cost_per_km" numeric(12,2),
    "markup_x" numeric(6,3) DEFAULT 1.0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_transport_rows_cost_per_km_check" CHECK ((("cost_per_km" IS NULL) OR ("cost_per_km" >= (0)::numeric))),
    CONSTRAINT "event_transport_rows_distance_km_check" CHECK ((("distance_km" IS NULL) OR ("distance_km" >= (0)::numeric))),
    CONSTRAINT "event_transport_rows_eta_minutes_check" CHECK ((("eta_minutes" IS NULL) OR ("eta_minutes" >= 0)))
);


ALTER TABLE "public"."event_transport_rows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_transport_settings" (
    "event_id" "text" NOT NULL,
    "markup_x" numeric DEFAULT 1.0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_transport_settings_markup_x_check" CHECK (("markup_x" > (0)::numeric))
);


ALTER TABLE "public"."event_transport_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_transport_vehicle_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "cost_per_km" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_transport_vehicle_types_cost_per_km_check" CHECK (("cost_per_km" >= (0)::numeric))
);


ALTER TABLE "public"."event_transport_vehicle_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."final_recipe_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "final_id" "uuid" NOT NULL,
    "ref_type" "text",
    "ref_id" "uuid",
    "name" "text" NOT NULL,
    "qty" numeric,
    "uom" "text",
    "cost" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "final_recipe_items_ref_type_check" CHECK (("ref_type" = ANY (ARRAY['material'::"text", 'prep'::"text"])))
);


ALTER TABLE "public"."final_recipe_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."final_recipes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "category_id" integer NOT NULL,
    "type" "text" NOT NULL,
    "cost_per_unit_vnd" numeric,
    "price_current_vnd" numeric,
    "markup_factor" numeric DEFAULT 4,
    "last_update" timestamp with time zone DEFAULT "now"(),
    "price_vnd" numeric NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "final_recipes_category_req_chk" CHECK (("category_id" IS NOT NULL)),
    CONSTRAINT "final_recipes_name_not_blank" CHECK (("length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "final_recipes_price_nonneg_chk" CHECK (("price_vnd" >= (0)::numeric)),
    CONSTRAINT "final_recipes_price_positive" CHECK (("price_vnd" > (0)::numeric)),
    CONSTRAINT "final_recipes_type_check" CHECK (("type" = ANY (ARRAY['food'::"text", 'beverage'::"text"]))),
    CONSTRAINT "final_recipes_type_req_chk" CHECK (("type" IS NOT NULL)),
    CONSTRAINT "final_recipes_type_valid" CHECK (("type" = ANY (ARRAY['food'::"text", 'beverage'::"text"])))
);


ALTER TABLE "public"."final_recipes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."final_list_vw" WITH ("security_invoker"='on') AS
 SELECT "f"."id",
    "f"."name",
    "dc"."name" AS "category",
    "f"."type",
    COALESCE("sum"(COALESCE("fi"."cost", (0)::numeric)), (0)::numeric) AS "cost_unit_vnd",
    "f"."price_vnd",
        CASE
            WHEN (COALESCE("f"."price_vnd", (0)::numeric) > (0)::numeric) THEN (COALESCE("sum"(COALESCE("fi"."cost", (0)::numeric)), (0)::numeric) / "f"."price_vnd")
            ELSE NULL::numeric
        END AS "cost_ratio",
        CASE
            WHEN (COALESCE("sum"(COALESCE("fi"."cost", (0)::numeric)), (0)::numeric) > (0)::numeric) THEN "round"((COALESCE("sum"(COALESCE("fi"."cost", (0)::numeric)), (0)::numeric) / 0.3))
            ELSE (0)::numeric
        END AS "suggested_price_vnd",
    GREATEST(COALESCE("f"."updated_at", '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE("max"("fi"."created_at"), '1970-01-01 00:00:00+00'::timestamp with time zone)) AS "last_update"
   FROM (("public"."final_recipes" "f"
     LEFT JOIN "public"."dish_categories" "dc" ON (("dc"."id" = "f"."category_id")))
     LEFT JOIN "public"."final_recipe_items" "fi" ON (("fi"."final_id" = "f"."id")))
  GROUP BY "f"."id", "f"."name", "dc"."name", "f"."type", "f"."price_vnd", "f"."updated_at";


ALTER VIEW "public"."final_list_vw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."final_recipe_tags" (
    "final_id" "uuid" NOT NULL,
    "tag_id" integer NOT NULL
);


ALTER TABLE "public"."final_recipe_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."final_recipe_tags_vw" WITH ("security_invoker"='on') AS
 SELECT "fr"."id" AS "final_id",
    COALESCE("array_agg"("t"."name" ORDER BY "t"."name") FILTER (WHERE ("t"."id" IS NOT NULL)), '{}'::"text"[]) AS "tag_names",
    COALESCE("string_agg"("t"."name", ' '::"text" ORDER BY "t"."name"), ''::"text") AS "tags_text"
   FROM (("public"."final_recipes" "fr"
     LEFT JOIN "public"."final_recipe_tags" "frt" ON (("frt"."final_id" = "fr"."id")))
     LEFT JOIN "public"."tags" "t" ON (("t"."id" = "frt"."tag_id")))
  GROUP BY "fr"."id";


ALTER VIEW "public"."final_recipe_tags_vw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gift_vouchers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "value" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "issued_on" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_on" timestamp with time zone,
    "donor_type" "text" NOT NULL,
    "donor_name" "text",
    "notes" "text",
    CONSTRAINT "gift_vouchers_donor_type_check" CHECK (("donor_type" = ANY (ARRAY['restaurant'::"text", 'partner'::"text", 'customer'::"text"]))),
    CONSTRAINT "gift_vouchers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'redeemed'::"text", 'expired'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."gift_vouchers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hiring_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "position_title" "text" NOT NULL,
    "department" "text" NOT NULL,
    "status" "public"."hiring_request_status" DEFAULT 'draft'::"public"."hiring_request_status",
    "priority" "public"."hiring_request_priority" DEFAULT 'medium'::"public"."hiring_request_priority",
    "headcount" integer DEFAULT 1,
    "salary_min" numeric,
    "salary_max" numeric,
    "currency" "text" DEFAULT 'VND'::"text",
    "description" "text",
    "requirements" "text",
    "benefits" "text",
    "notes" "text",
    "created_by" "uuid",
    "branch_ids" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."hiring_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "hiring_request_id" "uuid",
    "actor_id" "uuid",
    "action_type" "text" NOT NULL,
    "message" "text",
    "payload" "jsonb"
);


ALTER TABLE "public"."hr_activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hr_departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_disciplinary_catalog" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "infraction_name" "text" NOT NULL,
    "default_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category_id" "uuid"
);


ALTER TABLE "public"."hr_disciplinary_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_disciplinary_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hr_disciplinary_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "department_id" "uuid",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hr_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_rating_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "scope" "text" DEFAULT 'global'::"text" NOT NULL,
    "scope_id" "uuid",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hr_rating_categories_scope_check" CHECK (("scope" = ANY (ARRAY['global'::"text", 'department'::"text", 'position'::"text"])))
);


ALTER TABLE "public"."hr_rating_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_review_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "is_default" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "target_offset" integer DEFAULT 0
);


ALTER TABLE "public"."hr_review_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_service_charge_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "month_id" character varying,
    "staff_id" "uuid",
    "hours_worked" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hr_service_charge_staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_service_charges" (
    "month_id" character varying NOT NULL,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hr_service_charges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "position" "text" NOT NULL,
    "department" "text",
    "phone" "text",
    "email" "text",
    "employment_type" "text" DEFAULT 'full_time'::"text" NOT NULL,
    "salary_type" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "salary_amount" numeric DEFAULT 0 NOT NULL,
    "start_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "department_id" "uuid",
    "position_id" "uuid",
    "contract_signing_date" "date",
    "probation_end_date" "date",
    "contract_expiration_date" "date",
    "contract_doc_url" "text",
    "cv_doc_url" "text",
    "id_card_doc_url" "text",
    CONSTRAINT "hr_staff_employment_type_check" CHECK (("employment_type" = ANY (ARRAY['full_time'::"text", 'part_time'::"text"]))),
    CONSTRAINT "hr_staff_salary_type_check" CHECK (("salary_type" = ANY (ARRAY['fixed'::"text", 'hourly'::"text"]))),
    CONSTRAINT "hr_staff_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'terminated'::"text"])))
);


ALTER TABLE "public"."hr_staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_staff_attendance_monthly" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid",
    "month_id" character varying(10) NOT NULL,
    "lates_count" integer DEFAULT 0,
    "no_shows_count" integer DEFAULT 0,
    "annual_leaves" numeric(5,2) DEFAULT 0,
    "sick_leaves" numeric(5,2) DEFAULT 0,
    "unpaid_leaves" numeric(5,2) DEFAULT 0,
    "other_leaves" numeric(5,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "lates_minutes" integer DEFAULT 0,
    "notes" "text"
);


ALTER TABLE "public"."hr_staff_attendance_monthly" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_staff_branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "branch_id" "text" NOT NULL,
    "is_primary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hr_staff_branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_staff_fines" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "infraction" "text" NOT NULL,
    "amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "notified_by" "text",
    "deduction_source" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hr_staff_fines_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'waived'::"text", 'disputed'::"text"])))
);


ALTER TABLE "public"."hr_staff_fines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_staff_overtime" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "hours" numeric(5,2) NOT NULL,
    "reason" "text" NOT NULL,
    "compensation_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hr_staff_overtime_compensation_type_check" CHECK (("compensation_type" = ANY (ARRAY['salary'::"text", 'annual_leave'::"text"]))),
    CONSTRAINT "hr_staff_overtime_hours_check" CHECK (("hours" > (0)::numeric))
);


ALTER TABLE "public"."hr_staff_overtime" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_staff_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "review_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "reviewer_name" "text",
    "period" "text",
    "rating" integer NOT NULL,
    "strengths" "text",
    "improvements" "text",
    "goals" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category_ratings" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "hr_staff_performance_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."hr_staff_performance" OWNER TO "postgres";


COMMENT ON COLUMN "public"."hr_staff_performance"."rating" IS 'Overall average rating computed from category_ratings';



COMMENT ON COLUMN "public"."hr_staff_performance"."category_ratings" IS 'JSON object mapping category keys to 1-5 ratings, e.g. {"quality_of_work": 4, "communication": 3}';



CREATE TABLE IF NOT EXISTS "public"."hr_staff_role_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid",
    "effective_date" "date" DEFAULT CURRENT_DATE,
    "old_position_id" "uuid",
    "new_position_id" "uuid",
    "old_department_id" "uuid",
    "new_department_id" "uuid",
    "reason" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hr_staff_role_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_staff_salary_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "effective_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "previous_amount" numeric DEFAULT 0 NOT NULL,
    "new_amount" numeric DEFAULT 0 NOT NULL,
    "salary_type" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "reason" "text",
    "approved_by" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hr_staff_salary_history_salary_type_check" CHECK (("salary_type" = ANY (ARRAY['fixed'::"text", 'hourly'::"text"])))
);


ALTER TABLE "public"."hr_staff_salary_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_card_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "uuid",
    "type" "text" NOT NULL,
    "purchase_amount" integer DEFAULT 0,
    "bonus_amount" integer DEFAULT 0,
    "total_amount" integer NOT NULL,
    "balance_after" integer NOT NULL,
    "description" "text",
    "operator" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "points_change" integer DEFAULT 0,
    "is_voided" boolean DEFAULT false,
    CONSTRAINT "prepaid_card_transactions_type_check" CHECK (("type" = ANY (ARRAY['topup'::"text", 'usage'::"text", 'adjustment'::"text", 'log'::"text"])))
);


ALTER TABLE "public"."loyalty_card_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_number" "text" NOT NULL,
    "customer_name" "text",
    "phone_number" "text",
    "email" "text",
    "address" "text",
    "status" "text" DEFAULT 'active'::"text",
    "class" "text" DEFAULT 'Standard'::"text",
    "points" integer DEFAULT 0,
    "total_points_earned" integer DEFAULT 0,
    "tier_expires_on" timestamp with time zone,
    "balance" bigint DEFAULT 0,
    "total_loaded" bigint DEFAULT 0,
    "total_spent" bigint DEFAULT 0,
    "card_expires_on" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "issued_on" timestamp with time zone DEFAULT "now"(),
    "replaced_by" "uuid",
    CONSTRAINT "loyalty_cards_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'blocked'::"text", 'expired'::"text", 'unassigned'::"text"])))
);


ALTER TABLE "public"."loyalty_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "classes" "jsonb" DEFAULT '[]'::"jsonb",
    "points_ratio" numeric DEFAULT 1000,
    "rewards" "jsonb" DEFAULT '[]'::"jsonb",
    "redemption_ratio" numeric DEFAULT 100,
    "prepaid_bonus_percentage" integer DEFAULT 0,
    "min_topup_amount" integer DEFAULT 0,
    "voucher_header" "text",
    "voucher_terms" "text",
    CONSTRAINT "singleton" CHECK ("id")
);


ALTER TABLE "public"."loyalty_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_transactions_type_check" CHECK (("type" = ANY (ARRAY['earn'::"text", 'redeem_reward'::"text", 'redeem_cashback'::"text"])))
);


ALTER TABLE "public"."loyalty_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."material_price_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "material_id" "uuid" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "old_package_price" numeric,
    "new_package_price" numeric,
    "old_packaging_size" numeric,
    "new_packaging_size" numeric,
    "old_unit_cost" numeric,
    "new_unit_cost" numeric,
    "changed_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."material_price_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."materials" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "category_id" integer,
    "uom_id" integer,
    "supplier_id" "uuid",
    "packaging_size" numeric,
    "package_price" numeric,
    "unit_cost" numeric,
    "notes" "text",
    "is_food_drink" boolean DEFAULT true,
    "is_default" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_update" timestamp with time zone DEFAULT "now"(),
    "brand" "text",
    "brand_key" "text" GENERATED ALWAYS AS (NULLIF("lower"(TRIM(BOTH FROM "brand")), ''::"text")) STORED,
    "deleted_at" timestamp with time zone,
    "unit_cost_vat" numeric,
    "vat_rate_percent" numeric(5,2),
    "uses_vat" boolean DEFAULT false NOT NULL,
    CONSTRAINT "materials_category_req_chk" CHECK (("category_id" IS NOT NULL)),
    CONSTRAINT "materials_package_price_req_chk" CHECK ((("package_price" IS NOT NULL) AND ("package_price" >= (0)::numeric))),
    CONSTRAINT "materials_packaging_size_req_chk" CHECK ((("packaging_size" IS NOT NULL) AND ("packaging_size" > (0)::numeric))),
    CONSTRAINT "materials_supplier_req_chk" CHECK (("supplier_id" IS NOT NULL)),
    CONSTRAINT "materials_uom_req_chk" CHECK (("uom_id" IS NOT NULL)),
    CONSTRAINT "materials_vat_chk" CHECK ((("vat_rate_percent" IS NULL) OR (("vat_rate_percent" >= (0)::numeric) AND ("vat_rate_percent" <= (100)::numeric)))),
    CONSTRAINT "materials_vat_rate_percent_range" CHECK ((("vat_rate_percent" IS NULL) OR (("vat_rate_percent" >= (0)::numeric) AND ("vat_rate_percent" <= (100)::numeric))))
);


ALTER TABLE "public"."materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."materials_vat_backup" (
    "id" "uuid",
    "vat_rate" numeric,
    "vat_rate_percent" numeric(5,2),
    "backed_up_at" timestamp with time zone
);


ALTER TABLE "public"."materials_vat_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."membership_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_number" "text" NOT NULL,
    "customer_name" "text",
    "phone_number" "text",
    "issued_on" timestamp with time zone DEFAULT "now"(),
    "expires_on" timestamp with time zone,
    "last_used" timestamp with time zone,
    "total_value" numeric DEFAULT 0,
    "class" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "address" "text",
    "status" "text" DEFAULT 'active'::"text",
    "points" integer DEFAULT 0,
    CONSTRAINT "membership_cards_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'unassigned'::"text", 'expired'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."membership_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prep_recipes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "category_id" integer,
    "type" "text",
    "yield_qty" numeric,
    "waste_pct" numeric DEFAULT 0,
    "cost_per_unit_vnd" numeric,
    "last_update" timestamp with time zone DEFAULT "now"(),
    "portion_size" numeric,
    "uom_id" integer,
    "archived_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "prep_recipes_category_req_chk" CHECK (("category_id" IS NOT NULL)),
    CONSTRAINT "prep_recipes_portion_size_chk" CHECK (("portion_size" > (0)::numeric)),
    CONSTRAINT "prep_recipes_type_check" CHECK (("type" = ANY (ARRAY['food'::"text", 'beverage'::"text"]))),
    CONSTRAINT "prep_recipes_type_req_chk" CHECK (("type" IS NOT NULL)),
    CONSTRAINT "prep_recipes_yield_qty_chk" CHECK (("yield_qty" > (0)::numeric))
);


ALTER TABLE "public"."prep_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_categories" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0
);


ALTER TABLE "public"."recipe_categories" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."prep_list_vw" WITH ("security_invoker"='on') AS
 SELECT "p"."id",
    "p"."name",
    "c"."name" AS "category",
    "p"."type",
    "p"."yield_qty",
    "p"."waste_pct",
    "p"."cost_per_unit_vnd" AS "cost_unit_vnd",
    "p"."last_update"
   FROM ("public"."prep_recipes" "p"
     LEFT JOIN "public"."recipe_categories" "c" ON (("c"."id" = "p"."category_id")));


ALTER VIEW "public"."prep_list_vw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."uom" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."uom" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."prep_list_with_uom_vw" WITH ("security_invoker"='on') AS
 SELECT "v"."id",
    "v"."name",
    "v"."category",
    "v"."type",
    "v"."yield_qty",
    "u"."name" AS "uom_name",
    "v"."waste_pct",
    "v"."cost_unit_vnd",
    "v"."last_update"
   FROM (("public"."prep_list_vw" "v"
     LEFT JOIN "public"."prep_recipes" "pr" ON (("pr"."id" = "v"."id")))
     LEFT JOIN "public"."uom" "u" ON (("u"."id" = "pr"."uom_id")));


ALTER VIEW "public"."prep_list_with_uom_vw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prep_recipe_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prep_id" "uuid" NOT NULL,
    "position" integer,
    "ref_type" "text",
    "ref_id" "uuid",
    "name" "text",
    "qty" numeric,
    "uom" "text",
    "cost" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "prep_recipe_items_ref_type_check" CHECK (("ref_type" = ANY (ARRAY['material'::"text", 'prep'::"text"])))
);


ALTER TABLE "public"."prep_recipe_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prep_recipe_tags" (
    "recipe_id" "uuid" NOT NULL,
    "tag_id" integer NOT NULL
);


ALTER TABLE "public"."prep_recipe_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prepaid_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_number" "text" NOT NULL,
    "balance" numeric DEFAULT 0,
    "customer_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "phone_number" "text",
    "email" "text",
    "status" "text" DEFAULT 'active'::"text",
    "issued_on" timestamp with time zone DEFAULT "now"(),
    "expires_on" timestamp with time zone,
    "total_purchased" integer DEFAULT 0,
    "bonus_amount" integer DEFAULT 0,
    "created_by" "text",
    CONSTRAINT "prepaid_cards_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'blocked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."prepaid_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_branches" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "company_name" "text",
    "address" "text",
    "tax_code" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bank" "text",
    "bank_account_name" "text",
    "account_number" "text",
    "sort_order" integer
);


ALTER TABLE "public"."provider_branches" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."recipe_categories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."recipe_categories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."recipe_categories_id_seq" OWNED BY "public"."recipe_categories"."id";



CREATE TABLE IF NOT EXISTS "public"."recruitment_platforms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "value" "text" NOT NULL,
    "label" "text" NOT NULL,
    "icon" "text" DEFAULT '📌'::"text" NOT NULL,
    "color_bg" "text" DEFAULT 'bg-gray-100'::"text" NOT NULL,
    "color_text" "text" DEFAULT 'text-gray-800'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recruitment_platforms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recruitment_postings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "hiring_request_id" "uuid",
    "platform" "text" NOT NULL,
    "platform_url" "text",
    "posted_by" "uuid",
    "posted_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text",
    "notes" "text",
    "responses_count" integer DEFAULT 0
);


ALTER TABLE "public"."recruitment_postings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category_id" bigint,
    "supplier_id" "uuid",
    "cost" numeric(14,2),
    "final_price" numeric(14,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_update" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "vat_rate_percent" numeric,
    "markup_x" numeric,
    CONSTRAINT "rental_equipment_vat_rate_percent_chk" CHECK ((("vat_rate_percent" IS NULL) OR (("vat_rate_percent" >= (0)::numeric) AND ("vat_rate_percent" <= (100)::numeric))))
);


ALTER TABLE "public"."rental_equipment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "point_of_contact" "text",
    "phone_number" "text",
    "email" "text",
    "poc" "text",
    "phone" "text",
    "order_method" "text",
    "payment_term" "text",
    "payment_method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name_key" "text" GENERATED ALWAYS AS ("lower"(TRIM(BOTH FROM "name"))) STORED
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tags_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tags_id_seq" OWNED BY "public"."tags"."id";



CREATE TABLE IF NOT EXISTS "public"."transport_defaults" (
    "key" "text" NOT NULL,
    "markup_x" numeric(12,6) DEFAULT 1 NOT NULL,
    "vehicle_types" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transport_defaults" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."uom_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."uom_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."uom_id_seq" OWNED BY "public"."uom"."id";



CREATE OR REPLACE VIEW "public"."view_deposit_remaining" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"date" AS "date",
    NULL::"text" AS "branch",
    NULL::bigint AS "total_amount",
    NULL::numeric AS "paid_amount",
    NULL::numeric AS "remaining";


ALTER VIEW "public"."view_deposit_remaining" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voucher_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "voucher_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "type" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "voucher_transactions_type_check" CHECK (("type" = ANY (ARRAY['issue'::"text", 'redeem'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."voucher_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vouchers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "value" numeric DEFAULT 0,
    "is_used" boolean DEFAULT false,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vouchers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wastage_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "time" time without time zone NOT NULL,
    "wtype" "public"."wastage_type" NOT NULL,
    "category_id" "text",
    "category_name" "text",
    "item_id" "text",
    "item_name" "text" NOT NULL,
    "unit" "text",
    "qty" integer NOT NULL,
    "unit_cost_vnd" integer DEFAULT 0 NOT NULL,
    "total_cost_vnd" integer GENERATED ALWAYS AS (("qty" * "unit_cost_vnd")) STORED,
    "charge_target" "public"."wastage_charge_target" NOT NULL,
    "reason" "text",
    "responsible" "text",
    "entered_by" "text",
    "branch_name" "text",
    "month_key" integer GENERATED ALWAYS AS ((((EXTRACT(year FROM "date"))::integer * 100) + (EXTRACT(month FROM "date"))::integer)) STORED,
    "month_first" "date" GENERATED ALWAYS AS ((("date" - ((((EXTRACT(day FROM "date"))::integer - 1))::double precision * '1 day'::interval)))::"date") STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wastage_entries_qty_check" CHECK (("qty" >= 0)),
    CONSTRAINT "wastage_entries_unit_cost_vnd_check" CHECK (("unit_cost_vnd" >= 0))
);


ALTER TABLE "public"."wastage_entries" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."wastage_monthly_vw" WITH ("security_invoker"='on') AS
 SELECT "month_first" AS "month",
    "wtype",
    COALESCE("category_name", ''::"text") AS "category_name",
    "item_name",
    "unit",
    "sum"("qty") AS "qty_sum",
    "sum"("total_cost_vnd") AS "total_cost_sum",
    "charge_target",
    COALESCE("branch_name", ''::"text") AS "branch_name"
   FROM "public"."wastage_entries"
  GROUP BY "month_first", "wtype", COALESCE("category_name", ''::"text"), "item_name", "unit", "charge_target", COALESCE("branch_name", ''::"text")
  ORDER BY "month_first", "wtype", COALESCE("category_name", ''::"text"), "item_name";


ALTER VIEW "public"."wastage_monthly_vw" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."categories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."dish_categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."dish_categories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."equipment_categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."equipment_categories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."equipment_price_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."equipment_price_history_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."recipe_categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."recipe_categories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tags" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tags_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."uom" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."uom_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_accounts"
    ADD CONSTRAINT "app_accounts_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."app_accounts"
    ADD CONSTRAINT "app_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_accounts"
    ADD CONSTRAINT "app_accounts_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."app_accounts"
    ADD CONSTRAINT "app_accounts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings_staff_whitelist"
    ADD CONSTRAINT "app_settings_staff_whitelist_pkey" PRIMARY KEY ("col_name");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bundle_types"
    ADD CONSTRAINT "bundle_types_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."candidates"
    ADD CONSTRAINT "candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_ledger_deposits"
    ADD CONSTRAINT "cash_ledger_deposits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cashier_closings"
    ADD CONSTRAINT "cashier_closings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cashier_closings"
    ADD CONSTRAINT "cashier_closings_unique_report_date_per_branch" UNIQUE ("report_date", "branch_name");



ALTER TABLE ONLY "public"."cashout"
    ADD CONSTRAINT "cashout_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catering_event_pay_state"
    ADD CONSTRAINT "catering_event_pay_state_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."contract_template_settings"
    ADD CONSTRAINT "contract_template_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."contract_templates"
    ADD CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits"
    ADD CONSTRAINT "credits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_advisor_agreements"
    ADD CONSTRAINT "crm_advisor_agreements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_agreements"
    ADD CONSTRAINT "crm_agreements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_documents"
    ADD CONSTRAINT "crm_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_interactions"
    ADD CONSTRAINT "crm_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_partners"
    ADD CONSTRAINT "crm_partners_partner_code_key" UNIQUE ("partner_code");



ALTER TABLE ONLY "public"."crm_partners"
    ADD CONSTRAINT "crm_partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_payouts"
    ADD CONSTRAINT "crm_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_referrals"
    ADD CONSTRAINT "crm_referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_closings"
    ADD CONSTRAINT "daily_closings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_report_bank_transfers"
    ADD CONSTRAINT "daily_report_bank_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_report_settings"
    ADD CONSTRAINT "daily_report_settings_branch_name_uniq" UNIQUE ("branch_name");



ALTER TABLE ONLY "public"."daily_report_settings"
    ADD CONSTRAINT "daily_report_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deposit_payments"
    ADD CONSTRAINT "deposit_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dish_categories"
    ADD CONSTRAINT "dish_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."dish_categories"
    ADD CONSTRAINT "dish_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_categories"
    ADD CONSTRAINT "equipment_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."equipment_categories"
    ADD CONSTRAINT "equipment_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_price_history"
    ADD CONSTRAINT "equipment_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_bundle_rows"
    ADD CONSTRAINT "event_bundle_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_bundles"
    ADD CONSTRAINT "event_bundles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_company_asset_rows"
    ADD CONSTRAINT "event_company_asset_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_contracts"
    ADD CONSTRAINT "event_contracts_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."event_discount_rows"
    ADD CONSTRAINT "event_discount_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_equipment_rows"
    ADD CONSTRAINT "event_equipment_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_extra_fee_rows"
    ADD CONSTRAINT "event_extra_fee_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_headers"
    ADD CONSTRAINT "event_headers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_payment_state"
    ADD CONSTRAINT "event_payment_state_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."event_staff_rows"
    ADD CONSTRAINT "event_staff_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_staff_settings"
    ADD CONSTRAINT "event_staff_settings_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."event_totals"
    ADD CONSTRAINT "event_totals_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."event_transport_rows"
    ADD CONSTRAINT "event_transport_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_transport_settings"
    ADD CONSTRAINT "event_transport_settings_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."event_transport_vehicle_types"
    ADD CONSTRAINT "event_transport_vehicle_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."final_recipe_items"
    ADD CONSTRAINT "final_recipe_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."final_recipe_tags"
    ADD CONSTRAINT "final_recipe_tags_pkey" PRIMARY KEY ("final_id", "tag_id");



ALTER TABLE ONLY "public"."final_recipes"
    ADD CONSTRAINT "final_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_vouchers"
    ADD CONSTRAINT "gift_vouchers_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."gift_vouchers"
    ADD CONSTRAINT "gift_vouchers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hiring_requests"
    ADD CONSTRAINT "hiring_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_activity_log"
    ADD CONSTRAINT "hr_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_departments"
    ADD CONSTRAINT "hr_departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_disciplinary_catalog"
    ADD CONSTRAINT "hr_disciplinary_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_disciplinary_categories"
    ADD CONSTRAINT "hr_disciplinary_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_positions"
    ADD CONSTRAINT "hr_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_rating_categories"
    ADD CONSTRAINT "hr_rating_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_review_periods"
    ADD CONSTRAINT "hr_review_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_service_charge_staff"
    ADD CONSTRAINT "hr_service_charge_staff_month_id_staff_id_key" UNIQUE ("month_id", "staff_id");



ALTER TABLE ONLY "public"."hr_service_charge_staff"
    ADD CONSTRAINT "hr_service_charge_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_service_charges"
    ADD CONSTRAINT "hr_service_charges_pkey" PRIMARY KEY ("month_id");



ALTER TABLE ONLY "public"."hr_staff_attendance_monthly"
    ADD CONSTRAINT "hr_staff_attendance_monthly_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_staff_attendance_monthly"
    ADD CONSTRAINT "hr_staff_attendance_monthly_staff_id_month_id_key" UNIQUE ("staff_id", "month_id");



ALTER TABLE ONLY "public"."hr_staff_branches"
    ADD CONSTRAINT "hr_staff_branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_staff_branches"
    ADD CONSTRAINT "hr_staff_branches_staff_id_branch_id_key" UNIQUE ("staff_id", "branch_id");



ALTER TABLE ONLY "public"."hr_staff_fines"
    ADD CONSTRAINT "hr_staff_fines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_staff_overtime"
    ADD CONSTRAINT "hr_staff_overtime_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_staff_performance"
    ADD CONSTRAINT "hr_staff_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_staff"
    ADD CONSTRAINT "hr_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_staff_role_history"
    ADD CONSTRAINT "hr_staff_role_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_staff_salary_history"
    ADD CONSTRAINT "hr_staff_salary_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_cards"
    ADD CONSTRAINT "loyalty_cards_card_number_key" UNIQUE ("card_number");



ALTER TABLE ONLY "public"."loyalty_cards"
    ADD CONSTRAINT "loyalty_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_settings"
    ADD CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_price_history"
    ADD CONSTRAINT "material_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."membership_cards"
    ADD CONSTRAINT "membership_cards_card_number_key" UNIQUE ("card_number");



ALTER TABLE ONLY "public"."membership_cards"
    ADD CONSTRAINT "membership_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prep_recipe_items"
    ADD CONSTRAINT "prep_recipe_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prep_recipe_tags"
    ADD CONSTRAINT "prep_recipe_tags_pkey" PRIMARY KEY ("recipe_id", "tag_id");



ALTER TABLE ONLY "public"."prep_recipes"
    ADD CONSTRAINT "prep_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_card_transactions"
    ADD CONSTRAINT "prepaid_card_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prepaid_cards"
    ADD CONSTRAINT "prepaid_cards_card_number_key" UNIQUE ("card_number");



ALTER TABLE ONLY "public"."prepaid_cards"
    ADD CONSTRAINT "prepaid_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_branches"
    ADD CONSTRAINT "provider_branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_categories"
    ADD CONSTRAINT "recipe_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."recipe_categories"
    ADD CONSTRAINT "recipe_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recruitment_platforms"
    ADD CONSTRAINT "recruitment_platforms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recruitment_platforms"
    ADD CONSTRAINT "recruitment_platforms_value_key" UNIQUE ("value");



ALTER TABLE ONLY "public"."recruitment_postings"
    ADD CONSTRAINT "recruitment_postings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_equipment"
    ADD CONSTRAINT "rental_equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id", "name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_defaults"
    ADD CONSTRAINT "transport_defaults_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "uniq_material_per_supplier" UNIQUE ("name", "supplier_id");



ALTER TABLE ONLY "public"."uom"
    ADD CONSTRAINT "uom_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_equipment"
    ADD CONSTRAINT "uq_equipment_per_supplier" UNIQUE ("name", "supplier_id");



ALTER TABLE ONLY "public"."voucher_transactions"
    ADD CONSTRAINT "voucher_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vouchers"
    ADD CONSTRAINT "vouchers_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."vouchers"
    ADD CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wastage_entries"
    ADD CONSTRAINT "wastage_entries_pkey" PRIMARY KEY ("id");



CREATE INDEX "app_accounts_active_idx" ON "public"."app_accounts" USING "btree" ("is_active");



CREATE INDEX "app_accounts_email_idx" ON "public"."app_accounts" USING "btree" ("email");



CREATE INDEX "app_accounts_role_idx" ON "public"."app_accounts" USING "btree" ("role");



CREATE UNIQUE INDEX "app_settings_singleton" ON "public"."app_settings" USING "btree" ((true));



CREATE INDEX "bundle_types_updated_at_idx" ON "public"."bundle_types" USING "btree" ("updated_at");



CREATE INDEX "cashier_closings_branch_name_idx" ON "public"."cashier_closings" USING "btree" ("branch_name");



CREATE INDEX "cashier_closings_report_date_idx" ON "public"."cashier_closings" USING "btree" ("report_date");



CREATE INDEX "cashout_branch_idx" ON "public"."cashout" USING "btree" ("branch");



CREATE UNIQUE INDEX "categories_name_key_uidx" ON "public"."categories" USING "btree" ("name_key");



CREATE UNIQUE INDEX "contract_templates_key_uidx" ON "public"."contract_templates" USING "btree" ("key");



CREATE INDEX "credit_payments_credit_id_date_idx" ON "public"."credit_payments" USING "btree" ("credit_id", "date" DESC);



CREATE INDEX "credit_payments_credit_id_idx" ON "public"."credit_payments" USING "btree" ("credit_id");



CREATE INDEX "credit_payments_date_idx" ON "public"."credit_payments" USING "btree" ("date" DESC);



CREATE INDEX "credits_branch_idx" ON "public"."credits" USING "btree" ("branch");



CREATE INDEX "credits_customer_name_idx" ON "public"."credits" USING "btree" ("lower"("customer_name"));



CREATE INDEX "credits_date_idx" ON "public"."credits" USING "btree" ("date" DESC);



CREATE INDEX "credits_handled_by_idx" ON "public"."credits" USING "btree" ("handled_by");



CREATE INDEX "credits_reference_idx" ON "public"."credits" USING "btree" ("reference");



CREATE INDEX "credits_shift_idx" ON "public"."credits" USING "btree" ("shift");



CREATE INDEX "customers_email_idx" ON "public"."customers" USING "btree" ("email");



CREATE UNIQUE INDEX "customers_email_unique_not_null" ON "public"."customers" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "customers_name_idx" ON "public"."customers" USING "btree" ("lower"("name"));



CREATE INDEX "customers_phone_idx" ON "public"."customers" USING "btree" ("phone");



CREATE UNIQUE INDEX "customers_phone_unique_not_null" ON "public"."customers" USING "btree" ("phone") WHERE ("phone" IS NOT NULL);



CREATE INDEX "daily_closings_branch_idx" ON "public"."daily_closings" USING "btree" ("branch_name");



CREATE INDEX "daily_closings_date_branch_idx" ON "public"."daily_closings" USING "btree" ("date", "branch_name");



CREATE INDEX "daily_closings_date_idx" ON "public"."daily_closings" USING "btree" ("date" DESC);



CREATE INDEX "daily_report_bank_transfers_branch_date_idx" ON "public"."daily_report_bank_transfers" USING "btree" ("branch", "date");



CREATE INDEX "daily_report_bank_transfers_date_idx" ON "public"."daily_report_bank_transfers" USING "btree" ("date");



CREATE INDEX "deposit_payments_deposit_id_date_idx" ON "public"."deposit_payments" USING "btree" ("deposit_id", "date");



CREATE INDEX "deposit_payments_deposit_id_idx" ON "public"."deposit_payments" USING "btree" ("deposit_id");



CREATE INDEX "deposits_branch_date_idx" ON "public"."deposits" USING "btree" ("branch", "date");



CREATE INDEX "deposits_customer_name_idx" ON "public"."deposits" USING "btree" ("lower"("customer_name"));



CREATE INDEX "event_bundle_rows_bundle_idx" ON "public"."event_bundle_rows" USING "btree" ("bundle_id");



CREATE INDEX "event_bundles_event_idx" ON "public"."event_bundles" USING "btree" ("event_id");



CREATE INDEX "event_company_asset_rows_asset_id_txt_idx" ON "public"."event_company_asset_rows" USING "btree" (COALESCE(("asset_id")::"text", ''::"text"));



CREATE INDEX "event_company_asset_rows_event_id_idx" ON "public"."event_company_asset_rows" USING "btree" ("event_id");



CREATE INDEX "event_equipment_rows_event_equipment_idx" ON "public"."event_equipment_rows" USING "btree" ("event_id", "equipment_id");



CREATE INDEX "event_equipment_rows_event_idx" ON "public"."event_equipment_rows" USING "btree" ("event_id");



CREATE INDEX "event_extra_fee_rows_created_idx" ON "public"."event_extra_fee_rows" USING "btree" ("created_at");



CREATE INDEX "event_extra_fee_rows_event_idx" ON "public"."event_extra_fee_rows" USING "btree" ("event_id");



CREATE INDEX "event_headers_balance_paid_at_idx" ON "public"."event_headers" USING "btree" ("balance_paid_at");



CREATE INDEX "event_headers_created_at_idx" ON "public"."event_headers" USING "btree" ("created_at");



CREATE INDEX "event_headers_deposit_paid_at_idx" ON "public"."event_headers" USING "btree" ("deposit_paid_at");



CREATE INDEX "event_headers_status_idx" ON "public"."event_headers" USING "btree" ("status");



CREATE INDEX "event_staff_rows_event_id_created_at_idx" ON "public"."event_staff_rows" USING "btree" ("event_id", "created_at");



CREATE INDEX "event_staff_rows_event_id_idx" ON "public"."event_staff_rows" USING "btree" ("event_id");



CREATE INDEX "final_recipe_tags_tag_id_idx" ON "public"."final_recipe_tags" USING "btree" ("tag_id");



CREATE INDEX "final_recipes_archived_idx" ON "public"."final_recipes" USING "btree" ("archived_at") WHERE ("archived_at" IS NOT NULL);



CREATE INDEX "final_recipes_deleted_idx" ON "public"."final_recipes" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_cashout_category" ON "public"."cashout" USING "btree" ("category");



CREATE INDEX "idx_cashout_date" ON "public"."cashout" USING "btree" ("date" DESC);



CREATE INDEX "idx_cashout_paid_by" ON "public"."cashout" USING "btree" ("paid_by");



CREATE INDEX "idx_cashout_shift" ON "public"."cashout" USING "btree" ("shift");



CREATE INDEX "idx_cashout_supplier_name" ON "public"."cashout" USING "btree" ("supplier_name");



CREATE INDEX "idx_etvt_event_id" ON "public"."event_transport_vehicle_types" USING "btree" ("event_id");



CREATE INDEX "idx_etvt_name" ON "public"."event_transport_vehicle_types" USING "btree" ("lower"("name"));



CREATE INDEX "idx_event_discount_rows_created_at" ON "public"."event_discount_rows" USING "btree" ("created_at");



CREATE INDEX "idx_event_discount_rows_event_id" ON "public"."event_discount_rows" USING "btree" ("event_id");



CREATE INDEX "idx_event_headers_provider_branch_id" ON "public"."event_headers" USING "btree" ("provider_branch_id");



CREATE INDEX "idx_event_transport_rows_event_id" ON "public"."event_transport_rows" USING "btree" ("event_id");



CREATE INDEX "idx_event_transport_rows_vehicle_key" ON "public"."event_transport_rows" USING "btree" (COALESCE("vehicle_key", ''::"text"));



CREATE INDEX "idx_final_recipe_tags_final" ON "public"."final_recipe_tags" USING "btree" ("final_id");



CREATE INDEX "idx_final_recipe_tags_tag" ON "public"."final_recipe_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_hr_staff_branches_branch_id" ON "public"."hr_staff_branches" USING "btree" ("branch_id");



CREATE INDEX "idx_hr_staff_branches_staff_id" ON "public"."hr_staff_branches" USING "btree" ("staff_id");



CREATE INDEX "idx_hr_staff_performance_review_date" ON "public"."hr_staff_performance" USING "btree" ("review_date");



CREATE INDEX "idx_hr_staff_performance_staff_id" ON "public"."hr_staff_performance" USING "btree" ("staff_id");



CREATE INDEX "idx_hr_staff_salary_history_effective_date" ON "public"."hr_staff_salary_history" USING "btree" ("effective_date");



CREATE INDEX "idx_hr_staff_salary_history_staff_id" ON "public"."hr_staff_salary_history" USING "btree" ("staff_id");



CREATE INDEX "idx_hr_staff_status" ON "public"."hr_staff" USING "btree" ("status");



CREATE INDEX "idx_loyalty_cards_replaced_by" ON "public"."loyalty_cards" USING "btree" ("replaced_by");



CREATE INDEX "idx_loyalty_transactions_card_id" ON "public"."loyalty_transactions" USING "btree" ("card_id");



CREATE INDEX "idx_loyalty_transactions_created_at" ON "public"."loyalty_transactions" USING "btree" ("created_at");



CREATE INDEX "idx_materials_deleted_at" ON "public"."materials" USING "btree" ("deleted_at");



CREATE INDEX "idx_materials_unit_cost_vat" ON "public"."materials" USING "btree" ("unit_cost_vat");



CREATE INDEX "idx_mph_changed_at" ON "public"."material_price_history" USING "btree" ("changed_at");



CREATE INDEX "idx_mph_material_id" ON "public"."material_price_history" USING "btree" ("material_id");



CREATE INDEX "idx_prep_recipe_items_prep_id" ON "public"."prep_recipe_items" USING "btree" ("prep_id");



CREATE INDEX "idx_prep_recipe_items_prep_id_created_at" ON "public"."prep_recipe_items" USING "btree" ("prep_id", "created_at");



CREATE INDEX "idx_provider_branches_name" ON "public"."provider_branches" USING "btree" ("lower"("name"));



CREATE INDEX "idx_provider_branches_updated_at" ON "public"."provider_branches" USING "btree" ("updated_at");



CREATE INDEX "idx_re_cat" ON "public"."rental_equipment" USING "btree" ("category_id");



CREATE INDEX "idx_re_lastupd" ON "public"."rental_equipment" USING "btree" ("last_update" DESC);



CREATE INDEX "idx_re_name" ON "public"."rental_equipment" USING "btree" ("name");



CREATE INDEX "idx_re_sup" ON "public"."rental_equipment" USING "btree" ("supplier_id");



CREATE INDEX "idx_wastage_branch" ON "public"."wastage_entries" USING "btree" ("branch_name");



CREATE INDEX "idx_wastage_category_name" ON "public"."wastage_entries" USING "btree" ("category_name");



CREATE INDEX "idx_wastage_charge_target" ON "public"."wastage_entries" USING "btree" ("charge_target");



CREATE INDEX "idx_wastage_created_at" ON "public"."wastage_entries" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_wastage_date" ON "public"."wastage_entries" USING "btree" ("date");



CREATE INDEX "idx_wastage_item_name_gin" ON "public"."wastage_entries" USING "gin" ("to_tsvector"('"simple"'::"regconfig", COALESCE("item_name", ''::"text")));



CREATE INDEX "idx_wastage_month_first" ON "public"."wastage_entries" USING "btree" ("month_first");



CREATE INDEX "idx_wastage_month_key" ON "public"."wastage_entries" USING "btree" ("month_key");



CREATE INDEX "idx_wastage_type" ON "public"."wastage_entries" USING "btree" ("wtype");



CREATE INDEX "prep_recipe_items_prep_id_idx" ON "public"."prep_recipe_items" USING "btree" ("prep_id");



CREATE INDEX "prep_recipes_archived_idx" ON "public"."prep_recipes" USING "btree" ("archived_at") WHERE ("archived_at" IS NOT NULL);



CREATE INDEX "prep_recipes_deleted_idx" ON "public"."prep_recipes" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "suppliers_name_idx" ON "public"."suppliers" USING "btree" ("lower"("name"));



CREATE UNIQUE INDEX "suppliers_name_key_uidx" ON "public"."suppliers" USING "btree" ("name_key");



CREATE UNIQUE INDEX "tags_name_lower_uniq" ON "public"."tags" USING "btree" ("lower"("name"));



CREATE UNIQUE INDEX "tags_name_unique_ci" ON "public"."tags" USING "btree" ("lower"(TRIM(BOTH FROM "name")));



CREATE UNIQUE INDEX "transport_defaults_key_uq" ON "public"."transport_defaults" USING "btree" ("key");



CREATE UNIQUE INDEX "uq_final_recipes_name" ON "public"."final_recipes" USING "btree" ("lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "uq_materials_active_name_supplier_brand" ON "public"."materials" USING "btree" ("lower"("name"), "supplier_id", COALESCE("lower"(TRIM(BOTH FROM "brand")), ''::"text")) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "uq_materials_name_supplier_brand" ON "public"."materials" USING "btree" ("lower"("name"), "supplier_id", "lower"(COALESCE("brand", ''::"text")));



CREATE OR REPLACE VIEW "public"."view_deposit_remaining" WITH ("security_invoker"='on') AS
 SELECT "d"."id",
    "d"."date",
    "d"."branch",
    "d"."amount" AS "total_amount",
    COALESCE("sum"("p"."amount"), (0)::numeric) AS "paid_amount",
    (("d"."amount")::numeric - COALESCE("sum"("p"."amount"), (0)::numeric)) AS "remaining"
   FROM ("public"."deposits" "d"
     LEFT JOIN "public"."deposit_payments" "p" ON (("d"."id" = "p"."deposit_id")))
  GROUP BY "d"."id";



CREATE OR REPLACE TRIGGER "app_accounts_prevent_last_owner_delete" BEFORE DELETE ON "public"."app_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_last_owner_change"();



CREATE OR REPLACE TRIGGER "app_accounts_prevent_last_owner_update" BEFORE UPDATE OF "role" ON "public"."app_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_last_owner_change"();



CREATE OR REPLACE TRIGGER "app_settings_staff_only_language" BEFORE UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."app_settings_staff_guard_upd"();



CREATE OR REPLACE TRIGGER "on_hr_staff_performance_updated" BEFORE UPDATE ON "public"."hr_staff_performance" FOR EACH ROW EXECUTE FUNCTION "public"."handle_hr_staff_updated_at"();



CREATE OR REPLACE TRIGGER "on_hr_staff_updated" BEFORE UPDATE ON "public"."hr_staff" FOR EACH ROW EXECUTE FUNCTION "public"."handle_hr_staff_updated_at"();



CREATE OR REPLACE TRIGGER "trg_audit_categories" AFTER INSERT OR DELETE OR UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_dish_categories" AFTER INSERT OR DELETE OR UPDATE ON "public"."dish_categories" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_equipment_categories" AFTER INSERT OR DELETE OR UPDATE ON "public"."equipment_categories" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_final_recipe_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."final_recipe_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_final_recipe_tags" AFTER INSERT OR DELETE OR UPDATE ON "public"."final_recipe_tags" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_final_recipes" AFTER INSERT OR DELETE OR UPDATE ON "public"."final_recipes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_materials" AFTER INSERT OR DELETE OR UPDATE ON "public"."materials" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_prep_recipe_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."prep_recipe_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_prep_recipe_tags" AFTER INSERT OR DELETE OR UPDATE ON "public"."prep_recipe_tags" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_prep_recipes" AFTER INSERT OR DELETE OR UPDATE ON "public"."prep_recipes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_recipe_categories" AFTER INSERT OR DELETE OR UPDATE ON "public"."recipe_categories" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_suppliers" AFTER INSERT OR DELETE OR UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_tags" AFTER INSERT OR DELETE OR UPDATE ON "public"."tags" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_row"();



CREATE OR REPLACE TRIGGER "trg_bundle_types_touch" BEFORE UPDATE ON "public"."bundle_types" FOR EACH ROW EXECUTE FUNCTION "public"."bundle_types_touch"();



CREATE OR REPLACE TRIGGER "trg_cashout_updated" BEFORE UPDATE ON "public"."cashout" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_contract_templates_updated_at" BEFORE UPDATE ON "public"."contract_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_credits_fill_customer" BEFORE INSERT OR UPDATE OF "customer_id" ON "public"."credits" FOR EACH ROW EXECUTE FUNCTION "public"."fill_credit_customer_snapshot"();



CREATE OR REPLACE TRIGGER "trg_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_deposits_set_updated_at" BEFORE UPDATE ON "public"."deposits" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ets_updated" BEFORE UPDATE ON "public"."event_transport_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_ets_updated_at"();



CREATE OR REPLACE TRIGGER "trg_etvt_updated" BEFORE UPDATE ON "public"."event_transport_vehicle_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_etvt_updated_at"();



CREATE OR REPLACE TRIGGER "trg_event_bundle_rows_touch" BEFORE UPDATE ON "public"."event_bundle_rows" FOR EACH ROW EXECUTE FUNCTION "public"."event_bundle_rows_touch"();



CREATE OR REPLACE TRIGGER "trg_event_bundles_touch" BEFORE UPDATE ON "public"."event_bundles" FOR EACH ROW EXECUTE FUNCTION "public"."event_bundles_touch"();



CREATE OR REPLACE TRIGGER "trg_event_company_asset_rows_set_updated_at" BEFORE UPDATE ON "public"."event_company_asset_rows" FOR EACH ROW EXECUTE FUNCTION "public"."tg_event_company_asset_rows_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_event_discount_rows_updated_at" BEFORE UPDATE ON "public"."event_discount_rows" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_event_equipment_rows_set_updated_at" BEFORE UPDATE ON "public"."event_equipment_rows" FOR EACH ROW EXECUTE FUNCTION "public"."event_equipment_rows_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_event_extra_fee_rows_touch_updated_at" BEFORE UPDATE ON "public"."event_extra_fee_rows" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_event_headers_payment_defaults" BEFORE INSERT OR UPDATE OF "payment_plan", "deposit_percent", "balance_percent" ON "public"."event_headers" FOR EACH ROW EXECUTE FUNCTION "public"."event_headers_payment_defaults"();



CREATE OR REPLACE TRIGGER "trg_event_headers_set_updated_at" BEFORE UPDATE ON "public"."event_headers" FOR EACH ROW EXECUTE FUNCTION "public"."event_headers_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_event_staff_rows_updated_at" BEFORE UPDATE ON "public"."event_staff_rows" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_event_transport_rows_updated_at" BEFORE UPDATE ON "public"."event_transport_rows" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "trg_generate_partner_code" BEFORE INSERT ON "public"."crm_partners" FOR EACH ROW EXECUTE FUNCTION "public"."generate_partner_code"();



CREATE OR REPLACE TRIGGER "trg_log_equipment_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."rental_equipment" FOR EACH ROW EXECUTE FUNCTION "public"."log_equipment_price_change"();



CREATE OR REPLACE TRIGGER "trg_log_material_price_change" AFTER UPDATE OF "unit_cost", "package_price" ON "public"."materials" FOR EACH ROW WHEN ((("old"."unit_cost" IS DISTINCT FROM "new"."unit_cost") OR ("old"."package_price" IS DISTINCT FROM "new"."package_price"))) EXECUTE FUNCTION "public"."log_material_price_change"();



CREATE OR REPLACE TRIGGER "trg_materials_last_update" BEFORE UPDATE ON "public"."materials" FOR EACH ROW EXECUTE FUNCTION "public"."set_last_update"();



CREATE OR REPLACE TRIGGER "trg_provider_branches_updated_at" BEFORE UPDATE ON "public"."provider_branches" FOR EACH ROW EXECUTE FUNCTION "public"."set_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "trg_rental_equipment_apply_pricing" BEFORE INSERT OR UPDATE OF "cost", "vat_rate_percent", "markup_x" ON "public"."rental_equipment" FOR EACH ROW EXECUTE FUNCTION "public"."rental_equipment_apply_pricing"();



CREATE OR REPLACE TRIGGER "trg_rental_equipment_set_price" BEFORE INSERT OR UPDATE OF "cost" ON "public"."rental_equipment" FOR EACH ROW EXECUTE FUNCTION "public"."rental_equipment_set_price"();



CREATE OR REPLACE TRIGGER "trg_single_default_per_name" BEFORE INSERT OR UPDATE ON "public"."materials" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_single_default_per_name"();



CREATE OR REPLACE TRIGGER "trg_suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tags_normalize" BEFORE INSERT OR UPDATE ON "public"."tags" FOR EACH ROW EXECUTE FUNCTION "public"."tags_normalize_name"();



CREATE OR REPLACE TRIGGER "trg_touch_event_staff_settings" BEFORE UPDATE ON "public"."event_staff_settings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "public"."daily_report_settings" FOR EACH ROW EXECUTE FUNCTION "public"."tg_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_final" BEFORE UPDATE ON "public"."final_recipes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."app_accounts"
    ADD CONSTRAINT "app_accounts_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_accounts"
    ADD CONSTRAINT "app_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."candidates"
    ADD CONSTRAINT "candidates_hiring_request_id_fkey" FOREIGN KEY ("hiring_request_id") REFERENCES "public"."hiring_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cashout"
    ADD CONSTRAINT "cashout_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."catering_event_pay_state"
    ADD CONSTRAINT "catering_event_pay_state_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."event_headers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credits"
    ADD CONSTRAINT "credits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_advisor_agreements"
    ADD CONSTRAINT "crm_advisor_agreements_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."crm_partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_agreements"
    ADD CONSTRAINT "crm_agreements_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."crm_partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_documents"
    ADD CONSTRAINT "crm_documents_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."crm_partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_documents"
    ADD CONSTRAINT "crm_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_interactions"
    ADD CONSTRAINT "crm_interactions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."crm_partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_interactions"
    ADD CONSTRAINT "crm_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."crm_partners"
    ADD CONSTRAINT "crm_partners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."crm_partners"
    ADD CONSTRAINT "crm_partners_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."crm_payouts"
    ADD CONSTRAINT "crm_payouts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."crm_partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_payouts"
    ADD CONSTRAINT "crm_payouts_sale_advisor_id_fkey" FOREIGN KEY ("sale_advisor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."crm_referrals"
    ADD CONSTRAINT "crm_referrals_advisor_payout_id_fkey" FOREIGN KEY ("advisor_payout_id") REFERENCES "public"."crm_payouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_referrals"
    ADD CONSTRAINT "crm_referrals_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."crm_partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_referrals"
    ADD CONSTRAINT "crm_referrals_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."crm_payouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_referrals"
    ADD CONSTRAINT "crm_referrals_sale_advisor_id_fkey" FOREIGN KEY ("sale_advisor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."crm_partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deposit_payments"
    ADD CONSTRAINT "deposit_payments_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "public"."deposits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment_price_history"
    ADD CONSTRAINT "equipment_price_history_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."rental_equipment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_bundle_rows"
    ADD CONSTRAINT "event_bundle_rows_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."event_bundles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_bundles"
    ADD CONSTRAINT "event_bundles_type_key_fkey" FOREIGN KEY ("type_key") REFERENCES "public"."bundle_types"("key") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."event_company_asset_rows"
    ADD CONSTRAINT "event_company_asset_rows_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."event_headers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_equipment_rows"
    ADD CONSTRAINT "event_equipment_rows_equipment_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."rental_equipment"("id");



ALTER TABLE ONLY "public"."event_extra_fee_rows"
    ADD CONSTRAINT "event_extra_fee_rows_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event_headers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_headers"
    ADD CONSTRAINT "event_headers_provider_branch_id_fkey" FOREIGN KEY ("provider_branch_id") REFERENCES "public"."provider_branches"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_payment_state"
    ADD CONSTRAINT "event_payment_state_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."event_headers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_staff_rows"
    ADD CONSTRAINT "event_staff_rows_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."event_headers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_transport_settings"
    ADD CONSTRAINT "event_transport_settings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."event_headers"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_transport_vehicle_types"
    ADD CONSTRAINT "event_transport_vehicle_types_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."event_headers"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."final_recipe_items"
    ADD CONSTRAINT "final_recipe_items_final_id_fkey" FOREIGN KEY ("final_id") REFERENCES "public"."final_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."final_recipe_tags"
    ADD CONSTRAINT "final_recipe_tags_final_id_fkey" FOREIGN KEY ("final_id") REFERENCES "public"."final_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."final_recipe_tags"
    ADD CONSTRAINT "final_recipe_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."final_recipes"
    ADD CONSTRAINT "final_recipes_category_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dish_categories"("id");



ALTER TABLE ONLY "public"."final_recipes"
    ADD CONSTRAINT "final_recipes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."dish_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_transport_rows"
    ADD CONSTRAINT "fk_event_transport_event" FOREIGN KEY ("event_id") REFERENCES "public"."event_headers"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hiring_requests"
    ADD CONSTRAINT "hiring_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."hr_activity_log"
    ADD CONSTRAINT "hr_activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."hr_activity_log"
    ADD CONSTRAINT "hr_activity_log_hiring_request_id_fkey" FOREIGN KEY ("hiring_request_id") REFERENCES "public"."hiring_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_disciplinary_catalog"
    ADD CONSTRAINT "hr_disciplinary_catalog_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."hr_disciplinary_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_positions"
    ADD CONSTRAINT "hr_positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."hr_departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_service_charge_staff"
    ADD CONSTRAINT "hr_service_charge_staff_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."hr_service_charges"("month_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_service_charge_staff"
    ADD CONSTRAINT "hr_service_charge_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."hr_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_staff_attendance_monthly"
    ADD CONSTRAINT "hr_staff_attendance_monthly_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."hr_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_staff_branches"
    ADD CONSTRAINT "hr_staff_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."provider_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_staff_branches"
    ADD CONSTRAINT "hr_staff_branches_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."hr_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_staff"
    ADD CONSTRAINT "hr_staff_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."hr_departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_staff_fines"
    ADD CONSTRAINT "hr_staff_fines_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."hr_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_staff_overtime"
    ADD CONSTRAINT "hr_staff_overtime_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."hr_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_staff_performance"
    ADD CONSTRAINT "hr_staff_performance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."hr_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_staff"
    ADD CONSTRAINT "hr_staff_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."hr_positions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_staff_role_history"
    ADD CONSTRAINT "hr_staff_role_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_staff_role_history"
    ADD CONSTRAINT "hr_staff_role_history_new_department_id_fkey" FOREIGN KEY ("new_department_id") REFERENCES "public"."hr_departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_staff_role_history"
    ADD CONSTRAINT "hr_staff_role_history_new_position_id_fkey" FOREIGN KEY ("new_position_id") REFERENCES "public"."hr_positions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_staff_role_history"
    ADD CONSTRAINT "hr_staff_role_history_old_department_id_fkey" FOREIGN KEY ("old_department_id") REFERENCES "public"."hr_departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_staff_role_history"
    ADD CONSTRAINT "hr_staff_role_history_old_position_id_fkey" FOREIGN KEY ("old_position_id") REFERENCES "public"."hr_positions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_staff_role_history"
    ADD CONSTRAINT "hr_staff_role_history_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."hr_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_staff_salary_history"
    ADD CONSTRAINT "hr_staff_salary_history_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."hr_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_card_transactions"
    ADD CONSTRAINT "loyalty_card_transactions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."loyalty_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_cards"
    ADD CONSTRAINT "loyalty_cards_replaced_by_fkey" FOREIGN KEY ("replaced_by") REFERENCES "public"."loyalty_cards"("id");



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."membership_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."material_price_history"
    ADD CONSTRAINT "material_price_history_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prep_recipe_items"
    ADD CONSTRAINT "prep_recipe_items_prep_id_fkey" FOREIGN KEY ("prep_id") REFERENCES "public"."prep_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prep_recipe_tags"
    ADD CONSTRAINT "prep_recipe_tags_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."prep_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prep_recipe_tags"
    ADD CONSTRAINT "prep_recipe_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prep_recipes"
    ADD CONSTRAINT "prep_recipes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."recipe_categories"("id");



ALTER TABLE ONLY "public"."prep_recipes"
    ADD CONSTRAINT "prep_recipes_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "public"."uom"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recruitment_postings"
    ADD CONSTRAINT "recruitment_postings_hiring_request_id_fkey" FOREIGN KEY ("hiring_request_id") REFERENCES "public"."hiring_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_equipment"
    ADD CONSTRAINT "rental_equipment_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_equipment"
    ADD CONSTRAINT "rental_equipment_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."voucher_transactions"
    ADD CONSTRAINT "voucher_transactions_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "public"."gift_vouchers"("id") ON DELETE CASCADE;



CREATE POLICY "Admin/Owner access only" ON "public"."cash_ledger_deposits" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "Allow all actions for hr_staff_role_history" ON "public"."hr_staff_role_history" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow all for authenticated" ON "public"."loyalty_card_transactions" TO "authenticated" USING (true);



CREATE POLICY "Allow all for authenticated" ON "public"."prepaid_cards" TO "authenticated" USING (true);



CREATE POLICY "Allow auth delete of crm_documents" ON "public"."crm_documents" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow auth insert of crm_documents" ON "public"."crm_documents" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow auth update of crm_documents" ON "public"."crm_documents" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated full access to hr_disciplinary_catalog" ON "public"."hr_disciplinary_catalog" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated full access to hr_disciplinary_categories" ON "public"."hr_disciplinary_categories" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated full access to hr_staff_attendance_monthly" ON "public"."hr_staff_attendance_monthly" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users full access to hr_staff" ON "public"."hr_staff" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users full access to hr_staff_branches" ON "public"."hr_staff_branches" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users full access to hr_staff_fines" ON "public"."hr_staff_fines" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users full access to hr_staff_performance" ON "public"."hr_staff_performance" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users full access to hr_staff_salary_histor" ON "public"."hr_staff_salary_history" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "App users full access" ON "public"."bundle_types" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."cashier_closings" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."cashout" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."catering_event_pay_state" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."contract_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."credits" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."customers" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."daily_report_bank_transfers" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."deposit_payments" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."deposits" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_bundle_rows" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_bundles" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_company_asset_rows" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_contracts" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_equipment_rows" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_extra_fee_rows" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_headers" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_payment_state" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_staff_rows" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_staff_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_totals" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_transport_rows" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_transport_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."event_transport_vehicle_types" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."gift_vouchers" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."hr_departments" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."hr_positions" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."hr_rating_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."hr_review_periods" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."loyalty_transactions" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."recruitment_platforms" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."recruitment_postings" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."transport_defaults" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."voucher_transactions" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users full access" ON "public"."wastage_entries" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "App users modify access" ON "public"."crm_tasks" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text"]))))));



CREATE POLICY "App users read access" ON "public"."crm_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "CRM Admin Access" ON "public"."crm_partners" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'admin'::"text")))));



CREATE POLICY "CRM Admin Access Agreements" ON "public"."crm_agreements" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'admin'::"text")))));



CREATE POLICY "CRM Admin Access Interactions" ON "public"."crm_interactions" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'admin'::"text")))));



CREATE POLICY "CRM Advisor Agreements Manager Access" ON "public"."crm_advisor_agreements" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "CRM Agreements Manager Access" ON "public"."crm_agreements" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "CRM Agreements Sale Advisor Insert" ON "public"."crm_agreements" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_agreements"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "CRM Agreements Sale Advisor Select" ON "public"."crm_agreements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))));



CREATE POLICY "CRM Agreements Sale Advisor Update" ON "public"."crm_agreements" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_agreements"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "CRM Agreements Staff Select" ON "public"."crm_agreements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))))));



CREATE POLICY "CRM Interactions Manager Access" ON "public"."crm_interactions" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "CRM Interactions Sale Advisor Insert" ON "public"."crm_interactions" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_interactions"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "CRM Interactions Sale Advisor Select" ON "public"."crm_interactions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_interactions"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "CRM Interactions Sale Advisor Update" ON "public"."crm_interactions" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_interactions"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "CRM Partners Manager Access" ON "public"."crm_partners" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "CRM Partners Sale Advisor Insert" ON "public"."crm_partners" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND ("owner_id" = "auth"."uid"())));



CREATE POLICY "CRM Partners Sale Advisor Select" ON "public"."crm_partners" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))));



CREATE POLICY "CRM Partners Sale Advisor Update" ON "public"."crm_partners" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = 'sale advisor'::"text")))) AND ("owner_id" = "auth"."uid"())));



CREATE POLICY "CRM Partners Staff Select" ON "public"."crm_partners" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))))));



CREATE POLICY "CRM Payouts Manager Access" ON "public"."crm_payouts" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "CRM Payouts Sale Advisor Access" ON "public"."crm_payouts" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ("sale_advisor_id" = "auth"."uid"())));



CREATE POLICY "CRM Referrals Manager Access" ON "public"."crm_referrals" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))))));



CREATE POLICY "CRM Referrals Sale Advisor Access" ON "public"."crm_referrals" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ("sale_advisor_id" = "auth"."uid"())));



CREATE POLICY "CRM Referrals Staff Admin Access" ON "public"."crm_referrals" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts"
  WHERE (("app_accounts"."user_id" = "auth"."uid"()) AND ("app_accounts"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))))));



CREATE POLICY "CRM Tasks Sale Advisor Access" ON "public"."crm_tasks" USING (((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ((("partner_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_tasks"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))) OR ("created_by" = "auth"."uid"())))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."role" = 'sale advisor'::"text")))) AND ((("partner_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."crm_partners" "p"
  WHERE (("p"."id" = "crm_tasks"."partner_id") AND ("p"."owner_id" = "auth"."uid"()))))) OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Enable all access for authenticated users" ON "public"."candidates" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."hiring_requests" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."hr_activity_log" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all access for authenticated users hr_service_charge_sta" ON "public"."hr_service_charge_staff" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all access for authenticated users hr_service_charges" ON "public"."hr_service_charges" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all for authenticated users" ON "public"."hr_staff_overtime" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all for authenticated users" ON "public"."loyalty_cards" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all for authenticated users" ON "public"."loyalty_settings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all for authenticated users" ON "public"."membership_cards" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all for authenticated users" ON "public"."prepaid_cards" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all for authenticated users" ON "public"."vouchers" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable read access for all users on hr_service_charge_staff" ON "public"."hr_service_charge_staff" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users on hr_service_charges" ON "public"."hr_service_charges" FOR SELECT USING (true);



ALTER TABLE "public"."_app_settings_backup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_accounts_del_owner_admin" ON "public"."app_accounts" FOR DELETE TO "authenticated" USING (("public"."app_is_owner"() OR ("public"."app_is_admin"() AND ("lower"("role") = ANY (ARRAY['admin'::"text", 'staff'::"text"])))));



CREATE POLICY "app_accounts_ins_owner_admin" ON "public"."app_accounts" FOR INSERT TO "authenticated" WITH CHECK (("public"."app_is_owner"() OR ("public"."app_is_admin"() AND ("lower"("role") = ANY (ARRAY['admin'::"text", 'staff'::"text"])))));



CREATE POLICY "app_accounts_sel_authenticated" ON "public"."app_accounts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "app_accounts_sel_self" ON "public"."app_accounts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "app_accounts_upd_owner_admin" ON "public"."app_accounts" FOR UPDATE TO "authenticated" USING (("public"."app_is_owner"() OR ("public"."app_is_admin"() AND ("lower"("role") = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))) WITH CHECK (("public"."app_is_owner"() OR ("public"."app_is_admin"() AND ("lower"("role") = ANY (ARRAY['admin'::"text", 'staff'::"text"])))));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_insert" ON "public"."app_settings" FOR INSERT TO "authenticated" WITH CHECK ((("id" = 'singleton'::"text") AND "public"."is_owner_or_admin_active"()));



CREATE POLICY "app_settings_select" ON "public"."app_settings" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."app_settings_staff_whitelist" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_staff_whitelist_del_admin_owner" ON "public"."app_settings_staff_whitelist" FOR DELETE TO "authenticated" USING (("public"."app_is_owner"() OR "public"."app_is_admin"()));



CREATE POLICY "app_settings_staff_whitelist_ins_admin_owner" ON "public"."app_settings_staff_whitelist" FOR INSERT TO "authenticated" WITH CHECK (("public"."app_is_owner"() OR "public"."app_is_admin"()));



CREATE POLICY "app_settings_staff_whitelist_sel_admin_owner" ON "public"."app_settings_staff_whitelist" FOR SELECT TO "authenticated" USING (("public"."app_is_owner"() OR "public"."app_is_admin"()));



CREATE POLICY "app_settings_staff_whitelist_upd_admin_owner" ON "public"."app_settings_staff_whitelist" FOR UPDATE TO "authenticated" USING (("public"."app_is_owner"() OR "public"."app_is_admin"())) WITH CHECK (("public"."app_is_owner"() OR "public"."app_is_admin"()));



CREATE POLICY "app_settings_update" ON "public"."app_settings" FOR UPDATE TO "authenticated" USING ("public"."is_owner_or_admin_active"()) WITH CHECK (("id" = 'singleton'::"text"));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_sel_admin_owner" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



ALTER TABLE "public"."bundle_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_ledger_deposits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cashier_closings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cashout" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_del_authenticated" ON "public"."categories" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "categories_ins_authenticated" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "categories_sel_authenticated" ON "public"."categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "categories_upd_authenticated" ON "public"."categories" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."catering_event_pay_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_template_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_payments delete authenticated" ON "public"."credit_payments" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "credit_payments insert authenticated" ON "public"."credit_payments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "credit_payments select authenticated" ON "public"."credit_payments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "credit_payments update authenticated" ON "public"."credit_payments" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "credit_payments_select_all" ON "public"."credit_payments" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."credits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_advisor_agreements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_agreements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_interactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_partners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_referrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ct_insert_auth" ON "public"."contract_templates" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ct_select_auth" ON "public"."contract_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ct_update_auth" ON "public"."contract_templates" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "cts_insert_auth" ON "public"."contract_template_settings" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "cts_select_auth" ON "public"."contract_template_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "cts_update_auth" ON "public"."contract_template_settings" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_closings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_closings delete" ON "public"."daily_closings" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "daily_closings read" ON "public"."daily_closings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "daily_closings update" ON "public"."daily_closings" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "daily_closings write" ON "public"."daily_closings" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."daily_report_bank_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_report_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_report_settings_insert_auth" ON "public"."daily_report_settings" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "daily_report_settings_select_auth" ON "public"."daily_report_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "daily_report_settings_update_auth" ON "public"."daily_report_settings" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "del_authenticated" ON "public"."event_equipment_rows" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "del_authenticated" ON "public"."event_headers" FOR DELETE TO "authenticated" USING (true);



ALTER TABLE "public"."deposit_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deposits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dish_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dish_categories_del_authenticated" ON "public"."dish_categories" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "dish_categories_ins_authenticated" ON "public"."dish_categories" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "dish_categories_sel_anon" ON "public"."dish_categories" FOR SELECT TO "anon" USING (true);



CREATE POLICY "dish_categories_sel_authenticated" ON "public"."dish_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "dish_categories_upd_authenticated" ON "public"."dish_categories" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "eph_select_all" ON "public"."equipment_price_history" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."equipment_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipment_categories_del_authenticated" ON "public"."equipment_categories" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "equipment_categories_ins_authenticated" ON "public"."equipment_categories" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "equipment_categories_sel_anon" ON "public"."equipment_categories" FOR SELECT TO "anon" USING (true);



CREATE POLICY "equipment_categories_sel_authenticated" ON "public"."equipment_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "equipment_categories_upd_authenticated" ON "public"."equipment_categories" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."equipment_price_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_bundle_rows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_bundles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_company_asset_rows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_contracts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_discount_rows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_equipment_rows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_extra_fee_rows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_headers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_payment_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_staff_rows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_staff_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_totals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_transport_rows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_transport_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_transport_vehicle_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."final_recipe_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "final_recipe_items_mod_active" ON "public"."final_recipe_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "final_recipe_items_sel_active" ON "public"."final_recipe_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



ALTER TABLE "public"."final_recipe_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "final_recipe_tags_mod_active" ON "public"."final_recipe_tags" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "final_recipe_tags_sel_active" ON "public"."final_recipe_tags" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



ALTER TABLE "public"."final_recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "final_recipes_del_authenticated" ON "public"."final_recipes" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "final_recipes_ins_authenticated" ON "public"."final_recipes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "final_recipes_sel_authenticated" ON "public"."final_recipes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "final_recipes_upd_authenticated" ON "public"."final_recipes" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."gift_vouchers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hiring_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_disciplinary_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_disciplinary_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_rating_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_review_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_service_charge_staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_service_charges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_staff_attendance_monthly" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_staff_branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_staff_fines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_staff_overtime" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_staff_performance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_staff_role_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_staff_salary_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ins_authenticated" ON "public"."event_equipment_rows" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ins_authenticated" ON "public"."event_headers" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."loyalty_card_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."material_price_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "material_price_history_sel_anon" ON "public"."material_price_history" FOR SELECT TO "anon" USING (true);



CREATE POLICY "material_price_history_sel_authenticated" ON "public"."material_price_history" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "materials_mod_active" ON "public"."materials" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "materials_sel_active" ON "public"."materials" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



ALTER TABLE "public"."materials_vat_backup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."membership_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pb_delete_auth" ON "public"."provider_branches" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "pb_insert_auth" ON "public"."provider_branches" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "pb_select_auth" ON "public"."provider_branches" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pb_update_auth" ON "public"."provider_branches" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."prep_recipe_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prep_recipe_items_mod_active" ON "public"."prep_recipe_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "prep_recipe_items_sel_active" ON "public"."prep_recipe_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



ALTER TABLE "public"."prep_recipe_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prep_recipe_tags_mod_active" ON "public"."prep_recipe_tags" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "prep_recipe_tags_sel_active" ON "public"."prep_recipe_tags" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



ALTER TABLE "public"."prep_recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prep_recipes_mod_active" ON "public"."prep_recipes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "prep_recipes_sel_active" ON "public"."prep_recipes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



ALTER TABLE "public"."prepaid_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_branches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read discounts (all auth)" ON "public"."event_discount_rows" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."recipe_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipe_categories_del_authenticated" ON "public"."recipe_categories" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "recipe_categories_ins_authenticated" ON "public"."recipe_categories" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "recipe_categories_sel_anon" ON "public"."recipe_categories" FOR SELECT TO "anon" USING (true);



CREATE POLICY "recipe_categories_sel_authenticated" ON "public"."recipe_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "recipe_categories_upd_authenticated" ON "public"."recipe_categories" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."recruitment_platforms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recruitment_postings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_equipment" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_equipment_del_authenticated" ON "public"."rental_equipment" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "rental_equipment_ins_authenticated" ON "public"."rental_equipment" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "rental_equipment_sel_authenticated" ON "public"."rental_equipment" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rental_equipment_upd_authenticated" ON "public"."rental_equipment" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "rw for authenticated" ON "public"."contract_templates" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "sel_authenticated" ON "public"."event_equipment_rows" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "sel_authenticated" ON "public"."event_headers" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_mod_active" ON "public"."suppliers" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "suppliers_sel_active" ON "public"."suppliers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_accounts" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_active" = true) AND ("lower"("a"."role") = ANY (ARRAY['staff'::"text", 'admin'::"text", 'owner'::"text"]))))));



ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tags_del_authenticated" ON "public"."tags" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "tags_delete_auth" ON "public"."tags" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "tags_ins_authenticated" ON "public"."tags" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "tags_insert_auth" ON "public"."tags" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "tags_sel_authenticated" ON "public"."tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tags_select_auth" ON "public"."tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tags_upd_authenticated" ON "public"."tags" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "tags_update_auth" ON "public"."tags" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."transport_defaults" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transport_defaults_all" ON "public"."transport_defaults" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "transport_insert_all" ON "public"."transport_defaults" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



ALTER TABLE "public"."uom" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "uom_sel_authenticated" ON "public"."uom" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "upd_authenticated" ON "public"."event_equipment_rows" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "upd_authenticated" ON "public"."event_headers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."voucher_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vouchers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wastage_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "write discounts (all auth)" ON "public"."event_discount_rows" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


































































































































































REVOKE ALL ON FUNCTION "public"."app_mark_onboarded"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."app_mark_onboarded"("p_uid" "uuid") TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_totals" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."event_totals_set_total"("p_event_id" "uuid", "p_total" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."event_totals_set_total"("p_event_id" "uuid", "p_total" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."event_totals_upsert"("p_event_id" "uuid", "p_totals" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."event_totals_upsert"("p_event_id" "uuid", "p_totals" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."upsert_customer"("p_name" "text", "p_phone" "text", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_customer"("p_name" "text", "p_phone" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_customer"("p_name" "text", "p_phone" "text", "p_email" "text") TO "service_role";



























GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."app_accounts" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."app_accounts" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."app_settings" TO "authenticated";
GRANT SELECT ON TABLE "public"."app_settings" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."app_settings_staff_whitelist" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."audit_log" TO "authenticated";



GRANT SELECT,USAGE ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."bundle_types" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."candidates" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."cash_ledger_deposits" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."cashier_closings" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."cashout" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."categories" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."categories_id_seq" TO "authenticated";
GRANT SELECT,USAGE ON SEQUENCE "public"."categories_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_headers" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."catering_event_list_vw" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."catering_event_pay_state" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_payment_state" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."catering_event_pay_vw" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."contract_template_settings" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."contract_templates" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."credit_payments" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."credits" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."credit_totals_vw" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."credits_with_totals_vw" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."crm_advisor_agreements" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."crm_agreements" TO "authenticated";
GRANT SELECT ON TABLE "public"."crm_agreements" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."crm_documents" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."crm_interactions" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."crm_partners" TO "authenticated";
GRANT SELECT,UPDATE ON TABLE "public"."crm_partners" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."crm_payouts" TO "authenticated";
GRANT SELECT ON TABLE "public"."crm_payouts" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."crm_referrals" TO "authenticated";
GRANT SELECT ON TABLE "public"."crm_referrals" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."crm_tasks" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."customers" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."daily_closings" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."daily_report_bank_transfers" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."daily_report_settings" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."deposit_payments" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."deposits" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."dish_categories" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."dish_categories" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."dish_categories_id_seq" TO "authenticated";
GRANT SELECT,USAGE ON SEQUENCE "public"."dish_categories_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE "public"."equipment_categories" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."equipment_categories" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."equipment_categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."equipment_categories_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."equipment_price_history" TO "authenticated";



GRANT SELECT,USAGE ON SEQUENCE "public"."equipment_price_history_id_seq" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_bundle_rows" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_bundles" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_company_asset_rows" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_contracts" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_discount_rows" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_equipment_rows" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_extra_fee_rows" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_staff_rows" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_staff_settings" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_transport_rows" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_transport_settings" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_transport_vehicle_types" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."final_recipe_items" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."final_recipes" TO "authenticated";



GRANT SELECT ON TABLE "public"."final_list_vw" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."final_recipe_tags" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."tags" TO "authenticated";



GRANT SELECT ON TABLE "public"."final_recipe_tags_vw" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."gift_vouchers" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hiring_requests" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_activity_log" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_departments" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_disciplinary_catalog" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_disciplinary_categories" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_positions" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_rating_categories" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_review_periods" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_service_charge_staff" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_service_charges" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_staff" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_staff_attendance_monthly" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_staff_branches" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_staff_fines" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_staff_overtime" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_staff_performance" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_staff_role_history" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."hr_staff_salary_history" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."loyalty_card_transactions" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."loyalty_cards" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."loyalty_settings" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."loyalty_transactions" TO "authenticated";



GRANT SELECT ON TABLE "public"."material_price_history" TO "authenticated";
GRANT SELECT ON TABLE "public"."material_price_history" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."materials" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."membership_cards" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."prep_recipes" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."recipe_categories" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."recipe_categories" TO "authenticated";



GRANT SELECT ON TABLE "public"."prep_list_vw" TO "authenticated";



GRANT SELECT ON TABLE "public"."uom" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."prep_list_with_uom_vw" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."prep_recipe_items" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."prep_recipe_tags" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."prepaid_cards" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."provider_branches" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."recipe_categories_id_seq" TO "authenticated";
GRANT SELECT,USAGE ON SEQUENCE "public"."recipe_categories_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."recruitment_platforms" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."recruitment_postings" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."rental_equipment" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."suppliers" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "authenticated";
GRANT SELECT,USAGE ON SEQUENCE "public"."tags_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."transport_defaults" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."transport_defaults" TO "anon";



GRANT ALL ON SEQUENCE "public"."uom_id_seq" TO "authenticated";
GRANT SELECT,USAGE ON SEQUENCE "public"."uom_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."view_deposit_remaining" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."voucher_transactions" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."vouchers" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."wastage_entries" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."wastage_monthly_vw" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,USAGE ON SEQUENCES TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "authenticated";



























