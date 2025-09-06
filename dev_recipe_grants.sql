set client_encoding to 'UTF8';

grant usage on schema public to authenticated;

-- Lettura su tutte (FK ecc.)
grant select on all tables in schema public to authenticated;

-- CRUD su ricette Dish
grant insert, update, delete on table public.final_recipes       to authenticated;
grant insert, update, delete on table public.final_recipe_items  to authenticated;
grant insert, update, delete on table public.final_recipe_tags   to authenticated;

-- CRUD su ricette Prep
grant insert, update, delete on table public.prep_recipes        to authenticated;
grant insert, update, delete on table public.prep_recipe_items   to authenticated;
grant insert, update, delete on table public.prep_recipe_tags    to authenticated;

-- Sequenze: concedi uso/select/update a authenticated su tutte le sequence di public
do $$
declare s record;
begin
  for s in
    select n.nspname as schema, c.relname as seqname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S' and n.nspname = 'public'
  loop
    execute format('grant usage, select, update on sequence %I.%I to authenticated;', s.schema, s.seqname);
  end loop;
end$$;
