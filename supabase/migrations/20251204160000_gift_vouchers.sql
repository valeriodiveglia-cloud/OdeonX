create table public.gift_vouchers (
  id uuid not null default gen_random_uuid (),
  code text not null,
  initial_value numeric not null default 0,
  current_value numeric not null default 0,
  status text not null default 'active'::text,
  created_at timestamp with time zone not null default now(),
  issued_on timestamp with time zone not null default now(),
  expires_on timestamp with time zone null,
  constraint gift_vouchers_pkey primary key (id),
  constraint gift_vouchers_code_key unique (code),
  constraint gift_vouchers_status_check check (
    (
      status = any (
        array[
          'active'::text,
          'redeemed'::text,
          'expired'::text,
          'blocked'::text
        ]
      )
    )
  )
) tablespace pg_default;

create table public.voucher_transactions (
  id uuid not null default gen_random_uuid (),
  voucher_id uuid not null,
  amount numeric not null,
  type text not null,
  description text null,
  created_at timestamp with time zone not null default now(),
  constraint voucher_transactions_pkey primary key (id),
  constraint voucher_transactions_voucher_id_fkey foreign key (voucher_id) references gift_vouchers (id) on delete cascade,
  constraint voucher_transactions_type_check check (
    (
      type = any (
        array[
          'issue'::text,
          'redeem'::text,
          'adjustment'::text
        ]
      )
    )
  )
) tablespace pg_default;

-- Enable RLS
alter table public.gift_vouchers enable row level security;
alter table public.voucher_transactions enable row level security;

-- Create policies (allow all for now as per existing pattern, or restrict if needed. Assuming internal tool usage)
create policy "Enable read access for all users" on public.gift_vouchers for select using (true);
create policy "Enable insert access for all users" on public.gift_vouchers for insert with check (true);
create policy "Enable update access for all users" on public.gift_vouchers for update using (true);
create policy "Enable delete access for all users" on public.gift_vouchers for delete using (true);

create policy "Enable read access for all users" on public.voucher_transactions for select using (true);
create policy "Enable insert access for all users" on public.voucher_transactions for insert with check (true);
create policy "Enable update access for all users" on public.voucher_transactions for update using (true);
create policy "Enable delete access for all users" on public.voucher_transactions for delete using (true);
