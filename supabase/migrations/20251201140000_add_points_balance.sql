-- Add points column to membership_cards
alter table public.membership_cards
  add column if not exists points numeric default 0;
