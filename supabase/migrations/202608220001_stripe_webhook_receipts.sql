-- Minimal Stripe webhook idempotency receipt store. No payloads or customer data are retained.
-- Rollback (destructive): drop function if exists public.claim_stripe_webhook_effect(text, text);
-- drop function if exists public.finish_stripe_webhook_event(text, text, text);
-- drop function if exists public.claim_stripe_webhook_event(text, text);
-- drop table if exists public.stripe_webhook_receipts;

create table if not exists public.stripe_webhook_receipts (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'retryable_failed', 'terminal_failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  failure_category text,
  effect_key text unique,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_webhook_receipts enable row level security;
revoke all on public.stripe_webhook_receipts from public, anon, authenticated;
grant select, insert, update on public.stripe_webhook_receipts to service_role;

create or replace function public.claim_stripe_webhook_event(p_event_id text, p_event_type text)
returns text language plpgsql security definer set search_path = public as $$
declare current_status text;
declare current_updated_at timestamptz;
begin
  insert into public.stripe_webhook_receipts(event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;
  if found then return 'claimed'; end if;

  select status, updated_at into current_status, current_updated_at
    from public.stripe_webhook_receipts where event_id = p_event_id for update;
  if current_status = 'retryable_failed'
     or (current_status = 'processing' and current_updated_at < now() - interval '5 minutes') then
    update public.stripe_webhook_receipts
      set status = 'processing', attempt_count = attempt_count + 1,
          failure_category = null, updated_at = now()
      where event_id = p_event_id;
    return 'claimed';
  end if;
  return current_status;
end $$;

create or replace function public.claim_stripe_webhook_effect(p_event_id text, p_effect_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare existing_event_id text;
begin
  select event_id into existing_event_id
    from public.stripe_webhook_receipts where effect_key = p_effect_key;
  if existing_event_id is not null then
    return existing_event_id = p_event_id;
  end if;
  update public.stripe_webhook_receipts set effect_key = p_effect_key, updated_at = now()
  where event_id = p_event_id and effect_key is null;
  return found;
exception when unique_violation then
  return false;
end $$;

create or replace function public.finish_stripe_webhook_event(
  p_event_id text, p_status text, p_failure_category text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('completed', 'retryable_failed', 'terminal_failed') then
    raise exception 'invalid receipt status';
  end if;
  update public.stripe_webhook_receipts
    set status = p_status, failure_category = p_failure_category,
        processed_at = case when p_status = 'completed' then now() else processed_at end,
        updated_at = now()
    where event_id = p_event_id;
end $$;

revoke all on function public.claim_stripe_webhook_event(text, text) from public, anon, authenticated;
revoke all on function public.claim_stripe_webhook_effect(text, text) from public, anon, authenticated;
revoke all on function public.finish_stripe_webhook_event(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text, text) to service_role;
grant execute on function public.claim_stripe_webhook_effect(text, text) to service_role;
grant execute on function public.finish_stripe_webhook_event(text, text, text) to service_role;
