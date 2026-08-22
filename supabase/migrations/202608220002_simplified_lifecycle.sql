-- Minimal lifecycle timing and idempotent-effect support.
-- Rollback: drop the functions below, then stripe_webhook_effects, then the added columns.
-- Existing entitlement and customer rows are not rewritten or backfilled.

alter table public.subscriptions
  add column if not exists paid_through timestamptz,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists stripe_event_created_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  add column if not exists day_pass_purchased_at timestamptz;

create table if not exists public.gravitas_day_pass_grants (
  event_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_time timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.gravitas_day_pass_grants enable row level security;
revoke all on public.gravitas_day_pass_grants from public, anon, authenticated;
grant select, insert on public.gravitas_day_pass_grants to service_role;

create table if not exists public.stripe_webhook_effects (
  effect_key text primary key,
  event_id text not null references public.stripe_webhook_receipts(event_id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'retryable_failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.stripe_webhook_effects enable row level security;
revoke all on public.stripe_webhook_effects from public, anon, authenticated;
grant select, insert, update on public.stripe_webhook_effects to service_role;

create or replace function public.claim_stripe_webhook_side_effect(
  p_event_id text, p_effect_key text
) returns boolean language plpgsql security definer set search_path = public as $$
declare current_status text;
declare current_updated_at timestamptz;
begin
  insert into public.stripe_webhook_effects(event_id, effect_key)
  values (p_event_id, p_effect_key)
  on conflict (effect_key) do nothing;
  if found then return true; end if;

  select status, updated_at into current_status, current_updated_at
    from public.stripe_webhook_effects where effect_key = p_effect_key for update;
  if current_status = 'retryable_failed'
     or (current_status = 'processing' and current_updated_at < now() - interval '5 minutes') then
    update public.stripe_webhook_effects
      set status = 'processing', attempt_count = attempt_count + 1, updated_at = now()
      where effect_key = p_effect_key;
    return true;
  end if;
  return false;
end $$;

create or replace function public.finish_stripe_webhook_side_effect(
  p_effect_key text, p_status text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('completed', 'retryable_failed') then
    raise exception 'invalid side effect status';
  end if;
  update public.stripe_webhook_effects
    set status = p_status,
        completed_at = case when p_status = 'completed' then now() else completed_at end,
        updated_at = now()
    where effect_key = p_effect_key;
end $$;

create or replace function public.grant_gravitas_day_pass(
  p_user_id uuid, p_event_id text, p_purchase_time timestamptz
) returns table(applied boolean, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare current_expiry timestamptz;
declare resulting_expiry timestamptz;
declare recorded_expiry timestamptz;
begin
  select g.expires_at into recorded_expiry
    from public.gravitas_day_pass_grants g where g.event_id = p_event_id;
  if recorded_expiry is not null then
    return query select false, recorded_expiry;
    return;
  end if;
  insert into public.profiles(id) values (p_user_id) on conflict (id) do nothing;
  select trial_end_date into current_expiry
    from public.profiles where id = p_user_id for update;
  select g.expires_at into recorded_expiry
    from public.gravitas_day_pass_grants g where g.event_id = p_event_id;
  if recorded_expiry is not null then
    return query select false, recorded_expiry;
    return;
  end if;
  resulting_expiry := greatest(coalesce(current_expiry, p_purchase_time), p_purchase_time)
    + interval '48 hours';
  insert into public.gravitas_day_pass_grants(event_id, user_id, purchase_time, expires_at)
    values (p_event_id, p_user_id, p_purchase_time, resulting_expiry);
  update public.profiles
    set access_level = 'trial',
        trial_start_date = case
          when current_expiry is null or current_expiry <= p_purchase_time then p_purchase_time
          else trial_start_date
        end,
        trial_end_date = resulting_expiry,
        day_pass_purchased_at = p_purchase_time
    where id = p_user_id;
  return query select true, resulting_expiry;
end $$;

create or replace function public.upsert_gravitas_subscription(
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_paid_through timestamptz,
  p_grace_ends_at timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare existing_event_created_at timestamptz;
declare existing_id uuid;
begin
  select id, stripe_event_created_at into existing_id, existing_event_created_at
    from public.subscriptions
    where stripe_subscription_id = p_subscription_id
       or (p_user_id is not null and user_id = p_user_id)
    order by (stripe_subscription_id = p_subscription_id) desc
    limit 1 for update;

  if existing_id is not null then
    if existing_event_created_at is not null and existing_event_created_at > p_event_created_at then
      return false;
    end if;
    update public.subscriptions
      set stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
          stripe_subscription_id = p_subscription_id,
          status = p_status,
          paid_through = coalesce(p_paid_through, paid_through),
          grace_ends_at = p_grace_ends_at,
          cancel_at_period_end = p_cancel_at_period_end,
          stripe_event_created_at = p_event_created_at,
          updated_at = now()
      where id = existing_id;
    return true;
  end if;

  if p_user_id is null then return false; end if;
  insert into public.subscriptions(
    user_id, stripe_customer_id, stripe_subscription_id, status, paid_through,
    grace_ends_at, cancel_at_period_end, stripe_event_created_at, updated_at
  ) values (
    p_user_id, p_customer_id, p_subscription_id, p_status, p_paid_through,
    p_grace_ends_at, p_cancel_at_period_end, p_event_created_at, now()
  );
  return true;
end $$;

revoke all on function public.claim_stripe_webhook_side_effect(text, text) from public, anon, authenticated;
revoke all on function public.finish_stripe_webhook_side_effect(text, text) from public, anon, authenticated;
revoke all on function public.grant_gravitas_day_pass(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.upsert_gravitas_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_side_effect(text, text) to service_role;
grant execute on function public.finish_stripe_webhook_side_effect(text, text) to service_role;
grant execute on function public.grant_gravitas_day_pass(uuid, text, timestamptz) to service_role;
grant execute on function public.upsert_gravitas_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean, timestamptz) to service_role;
