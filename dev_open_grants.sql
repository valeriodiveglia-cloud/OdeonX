set client_encoding to 'UTF8';

-- consenti accesso allo schema
grant usage on schema public to authenticated;

-- lettura su TUTTE le tabelle base (comodo per FK e liste)
grant select on all tables in schema public to authenticated;

-- CRUD pieno dove l'UI scrive davvero
grant insert, update, delete on table public.materials           to authenticated;
grant insert, update, delete on table public.categories          to authenticated;
grant insert, update, delete on table public.suppliers           to authenticated;
grant insert, update, delete on table public.uom                 to authenticated;
grant insert, update, delete on table public.tags                to authenticated;

-- Se prevedi scritture anche su queste, scommenta:
-- grant insert, update, delete on table public.dish_categories    to authenticated;
-- grant insert, update, delete on table public.recipe_categories  to authenticated;
-- grant insert, update, delete on table public.equipment_categories to authenticated;
-- grant insert, update, delete on table public.rental_equipment   to authenticated;

-- Sequenze: concedi uso nel caso di id serial/bigserial
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
