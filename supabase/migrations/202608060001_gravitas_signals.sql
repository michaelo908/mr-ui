create table if not exists public.gravitas_signals (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  signal_name text not null
    check (
      length(signal_name) between 3 and 120
      and signal_name ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
    ),
  signal_version integer not null check (signal_version > 0),
  category text not null check (category in ('discovery','analysis','engagement','workflow','purchase')),
  visitor_id uuid,
  session_id uuid,
  user_id uuid,
  surface text not null check (surface in ('jump-in','paid','founder','unknown')),
  first_touch jsonb not null default '{}'::jsonb
    check (jsonb_typeof(first_touch) = 'object' and pg_column_size(first_touch) <= 8192),
  last_touch jsonb not null default '{}'::jsonb
    check (jsonb_typeof(last_touch) = 'object' and pg_column_size(last_touch) <= 8192),
  properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 16384),
  is_test boolean not null default false,
  verified boolean not null default false,
  dedupe_key text check (dedupe_key is null or length(dedupe_key) between 1 and 240),
  constraint gravitas_signals_category_matches_name
    check (split_part(signal_name, '.', 1) = category)
);

create unique index if not exists gravitas_signals_dedupe_key_idx
  on public.gravitas_signals (dedupe_key) where dedupe_key is not null;
create index if not exists gravitas_signals_occurred_at_idx on public.gravitas_signals (occurred_at desc);
create index if not exists gravitas_signals_name_time_idx on public.gravitas_signals (signal_name, occurred_at desc);
create index if not exists gravitas_signals_visitor_time_idx on public.gravitas_signals (visitor_id, occurred_at) where visitor_id is not null;
create index if not exists gravitas_signals_session_time_idx on public.gravitas_signals (session_id, occurred_at) where session_id is not null;
create index if not exists gravitas_signals_user_time_idx on public.gravitas_signals (user_id, occurred_at) where user_id is not null;
create index if not exists gravitas_signals_production_time_idx on public.gravitas_signals (occurred_at desc) where is_test = false;

alter table public.gravitas_signals enable row level security;
revoke all on public.gravitas_signals from public, anon, authenticated;
grant select, insert on public.gravitas_signals to service_role;

create or replace function public.prevent_gravitas_signal_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'gravitas_signals is append-only';
end;
$$;

revoke all on function public.prevent_gravitas_signal_mutation() from public;

drop trigger if exists gravitas_signals_no_update on public.gravitas_signals;
create trigger gravitas_signals_no_update before update on public.gravitas_signals
for each row execute function public.prevent_gravitas_signal_mutation();
drop trigger if exists gravitas_signals_no_delete on public.gravitas_signals;
create trigger gravitas_signals_no_delete before delete on public.gravitas_signals
for each row execute function public.prevent_gravitas_signal_mutation();
drop trigger if exists gravitas_signals_no_truncate on public.gravitas_signals;
create trigger gravitas_signals_no_truncate before truncate on public.gravitas_signals
for each statement execute function public.prevent_gravitas_signal_mutation();

comment on table public.gravitas_signals is 'Append-only Gravitas Signals Core. Raw source content, email addresses and full URLs are prohibited.';
comment on column public.gravitas_signals.occurred_at is 'Time the trusted application layer constructed the signal.';
comment on column public.gravitas_signals.received_at is 'Database insertion time assigned by PostgreSQL.';

-- Mutable operational state for a privacy-preserving, service-role-only rate limit.
-- bucket_key is a daily HMAC; raw IP addresses are never persisted.
create table if not exists public.gravitas_signal_rate_limits (
  bucket_key text not null check (length(bucket_key) = 64),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (bucket_key, window_start)
);

alter table public.gravitas_signal_rate_limits enable row level security;
revoke all on public.gravitas_signal_rate_limits from public, anon, authenticated;

create or replace function public.consume_gravitas_signal_rate_limit(
  p_bucket_key text,
  p_limit integer default 120,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if length(p_bucket_key) <> 64 or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.gravitas_signal_rate_limits (
    bucket_key,
    window_start,
    request_count
  ) values (
    p_bucket_key,
    v_window_start,
    1
  )
  on conflict (bucket_key, window_start)
  do update set request_count = public.gravitas_signal_rate_limits.request_count + 1
  returning request_count into v_count;

  if random() < 0.01 then
    delete from public.gravitas_signal_rate_limits
    where window_start < clock_timestamp() - interval '2 days';
  end if;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_gravitas_signal_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_gravitas_signal_rate_limit(text, integer, integer) to service_role;
