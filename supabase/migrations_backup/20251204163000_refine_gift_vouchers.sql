-- Remove current_value as vouchers are single-use
alter table public.gift_vouchers drop column current_value;

-- Rename initial_value to value
alter table public.gift_vouchers rename column initial_value to value;

-- Add donor information
alter table public.gift_vouchers add column donor_type text check (donor_type in ('restaurant', 'partner', 'customer'));
alter table public.gift_vouchers add column donor_name text;

-- Set default donor type to 'restaurant' for existing records (if any)
update public.gift_vouchers set donor_type = 'restaurant' where donor_type is null;
alter table public.gift_vouchers alter column donor_type set not null;
