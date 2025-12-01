-- Alter membership_cards
alter table public.membership_cards 
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists status text default 'active' check (status in ('active', 'unassigned', 'expired', 'blocked'));

alter table public.membership_cards
  alter column customer_name drop not null;

-- Create loyalty_settings
create table if not exists public.loyalty_settings (
  id boolean primary key default true,
  classes jsonb default '[]'::jsonb,
  points_ratio numeric default 1000,
  constraint singleton check (id)
);

-- Enable RLS for settings
alter table public.loyalty_settings enable row level security;

-- Policies for settings
create policy "Enable all for authenticated users" on public.loyalty_settings
  for all to authenticated using (true) with check (true);

-- Insert default settings if not exists
insert into public.loyalty_settings (id, classes, points_ratio)
values (true, '[
  {"name": "Standard", "method": "value", "threshold": 0},
  {"name": "Silver", "method": "value", "threshold": 10000000},
  {"name": "Gold", "method": "value", "threshold": 50000000},
  {"name": "Platinum", "method": "value", "threshold": 100000000}
]'::jsonb, 1000)
on conflict (id) do nothing;
