create table if not exists public.membership_cards (
  id uuid not null default gen_random_uuid(),
  card_number text not null,
  customer_name text not null,
  phone_number text,
  issued_on timestamptz default now(),
  expires_on timestamptz,
  last_used timestamptz,
  total_value numeric default 0,
  class text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint membership_cards_pkey primary key (id),
  constraint membership_cards_card_number_key unique (card_number)
);

create table if not exists public.vouchers (
  id uuid not null default gen_random_uuid(),
  code text not null,
  value numeric default 0,
  is_used boolean default false,
  expires_at timestamptz,
  created_at timestamptz default now(),
  constraint vouchers_pkey primary key (id),
  constraint vouchers_code_key unique (code)
);

create table if not exists public.prepaid_cards (
  id uuid not null default gen_random_uuid(),
  card_number text not null,
  balance numeric default 0,
  customer_name text,
  created_at timestamptz default now(),
  constraint prepaid_cards_pkey primary key (id),
  constraint prepaid_cards_card_number_key unique (card_number)
);

-- Enable RLS
alter table public.membership_cards enable row level security;
alter table public.vouchers enable row level security;
alter table public.prepaid_cards enable row level security;

-- Policies (Allow all authenticated for now)
create policy "Enable all for authenticated users" on public.membership_cards
  for all to authenticated using (true) with check (true);

create policy "Enable all for authenticated users" on public.vouchers
  for all to authenticated using (true) with check (true);

create policy "Enable all for authenticated users" on public.prepaid_cards
  for all to authenticated using (true) with check (true);
