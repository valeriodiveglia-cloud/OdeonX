set client_encoding to 'UTF8';

do $$
declare
  r   record;
  pol record;
begin
  -- Itera su tutte le tabelle "BASE TABLE" nello schema public
  for r in
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type   = 'BASE TABLE'
  loop
    -- Droppa ogni policy esistente su questa tabella
    for pol in
      select policyname
      from pg_policies
      where schemaname = r.table_schema
        and tablename  = r.table_name
    loop
      execute format('drop policy if exists %I on %I.%I;',
                     pol.policyname, r.table_schema, r.table_name);
    end loop;

    -- Disabilita la RLS (diventa "Unrestricted")
    execute format('alter table %I.%I disable row level security;',
                   r.table_schema, r.table_name);

    -- Log di servizio
    raise notice 'RLS disabled and policies dropped on %.%', r.table_schema, r.table_name;
  end loop;
end$$;
