-- Policy residue (dovrebbe tornare 0 righe)
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname='public'
order by tablename, policyname;

-- Stato RLS su tutte le tabelle base
select n.nspname   as schema,
       c.relname   as table,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public'
  and c.relkind='r'  -- 'r' = ordinary table
order by c.relname;
