-- Grants effettivi su public.categories
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='categories'
  and grantee in ('anon','authenticated','service_role')
order by grantee, privilege_type;

-- Policy effettive su public.categories
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public' and tablename='categories'
order by policyname, cmd;
