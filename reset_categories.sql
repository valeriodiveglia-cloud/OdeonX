set client_encoding to 'UTF8';

-- 1) Abilita RLS
alter table public.categories enable row level security;

-- 2) Pulisci policy esistenti
drop policy if exists categories_sel_contrib          on public.categories;
drop policy if exists categories_select_authenticated on public.categories;
drop policy if exists categories_ins_contrib          on public.categories;
drop policy if exists categories_insert_admin_owner   on public.categories;
drop policy if exists categories_upd_contrib          on public.categories;
drop policy if exists categories_update_admin_owner   on public.categories;
drop policy if exists categories_del_contrib          on public.categories;
drop policy if exists categories_delete_admin_owner   on public.categories;

-- 3) Grants minimi alla role "authenticated"
grant select, insert, update, delete on table public.categories to authenticated;

-- 4) Policy minime
create policy categories_select_authenticated
  on public.categories
  for select
  to authenticated
  using (public.app_is_authenticated());

create policy categories_insert_contributor
  on public.categories
  for insert
  to authenticated
  with check (public.app_is_contributor());

create policy categories_update_contributor
  on public.categories
  for update
  to authenticated
  using (public.app_is_contributor())
  with check (public.app_is_contributor());

create policy categories_delete_contributor
  on public.categories
  for delete
  to authenticated
  using (public.app_is_contributor());

-- 5) Grants sulla sequence, se esiste
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S'
      and n.nspname = 'public'
      and c.relname = 'categories_id_seq'
  ) then
    execute 'grant usage, select, update on sequence public.categories_id_seq to authenticated';
  end if;
end$$;
