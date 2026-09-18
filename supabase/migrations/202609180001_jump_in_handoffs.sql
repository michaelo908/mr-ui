-- A short-lived, service-role-only bridge from the cross-site marketing
-- embed to the first-party Multirrupt editor. It holds only pre-analysis
-- source material and expires after ten minutes.

create table if not exists public.gravitas_jump_in_handoffs (
  id uuid primary key,
  secret_hash text not null check (length(secret_hash) = 64),
  rate_bucket text not null check (length(rate_bucket) = 64),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists gravitas_jump_in_handoffs_expiry_idx
  on public.gravitas_jump_in_handoffs (expires_at);
create index if not exists gravitas_jump_in_handoffs_rate_idx
  on public.gravitas_jump_in_handoffs (rate_bucket, expires_at);

alter table public.gravitas_jump_in_handoffs enable row level security;
revoke all on public.gravitas_jump_in_handoffs from public, anon, authenticated;
grant select, insert, update, delete on public.gravitas_jump_in_handoffs to service_role;

comment on table public.gravitas_jump_in_handoffs is
  'Short-lived anonymous source-work handoffs from the marketing iframe to the first-party editor. Expired rows are removed opportunistically by the hand-off service.';
