set client_encoding to 'UTF8';

do $$
declare
  tbl text;
  pol record;
begin
  -- Modifica l'elenco se vuoi aggiungere/rimuovere tabelle
  for tbl in
    select unnest(array[
      'categories',
      'dish_categories',
      'equipment_categories',
      'materials',
      'recipe_categories',
      'suppliers',
      'tags',
      'uom',
      'rental_equipment'
    ])
  loop
    begin
      -- Droppa tutte le policy esistenti sulla tabella
      for pol in
        select policyname
        from pg_policies
        where schemaname='public' and tablename=tbl
      loop
        execute format('drop policy if exists %I on public.%I;', pol.policyname, tbl);
      end loop;

      -- Disabilita la RLS (tavola “Unrestricted”)
      execute format('alter table public.%I disable row level security;', tbl);
    exception
      when undefined_table then
        -- ignora tabelle mancanti
        null;
    end;
  end loop;
end$$;
