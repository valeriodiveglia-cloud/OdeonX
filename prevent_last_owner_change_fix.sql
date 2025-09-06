create or replace function public.prevent_last_owner_change()
returns trigger
language plpgsql
as $f$
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
$f$;
