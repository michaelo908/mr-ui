-- Reproduces the production subscriptions schema without copying customer data.
-- Rollback (destructive): drop table if exists public.subscriptions;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  created_at timestamptz default now()
);

create index if not exists idx_subscriptions_user_id
  on public.subscriptions using btree (user_id);

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
  on public.subscriptions
  as permissive
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete, truncate, references, trigger
  on table public.subscriptions to anon;
grant select, insert, update, delete, truncate, references, trigger
  on table public.subscriptions to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on table public.subscriptions to service_role;
