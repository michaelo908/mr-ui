-- Keep subscription lifecycle ordering independent from payment entitlement ordering.
-- Rollback: drop upsert_gravitas_subscription_v2 and the two event timestamp columns.

alter table public.subscriptions
  add column if not exists stripe_subscription_event_created_at timestamptz,
  add column if not exists stripe_payment_event_created_at timestamptz;

create or replace function public.upsert_gravitas_subscription_v2(
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_paid_through timestamptz,
  p_grace_ends_at timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created_at timestamptz,
  p_authority text
) returns boolean language plpgsql security definer set search_path = public as $$
declare existing_id uuid;
declare existing_subscription_event timestamptz;
declare existing_payment_event timestamptz;
begin
  if p_authority not in ('initial', 'subscription', 'payment') then
    raise exception 'invalid subscription authority';
  end if;

  select id, stripe_subscription_event_created_at, stripe_payment_event_created_at
    into existing_id, existing_subscription_event, existing_payment_event
    from public.subscriptions
    where stripe_subscription_id = p_subscription_id
       or (p_user_id is not null and user_id = p_user_id)
    order by (stripe_subscription_id = p_subscription_id) desc
    limit 1 for update;

  if existing_id is null then
    if p_user_id is null then return false; end if;
    insert into public.subscriptions(
      user_id, stripe_customer_id, stripe_subscription_id, status, paid_through,
      grace_ends_at, cancel_at_period_end, stripe_event_created_at,
      stripe_subscription_event_created_at, stripe_payment_event_created_at, updated_at
    ) values (
      p_user_id, p_customer_id, p_subscription_id, p_status,
      case when p_authority in ('initial', 'payment') then p_paid_through else null end,
      case when p_authority in ('initial', 'payment') then p_grace_ends_at else null end,
      p_cancel_at_period_end, p_event_created_at,
      case when p_authority in ('initial', 'subscription') then p_event_created_at else null end,
      case when p_authority in ('initial', 'payment') then p_event_created_at else null end,
      now()
    );
    return true;
  end if;

  if p_authority = 'subscription' then
    if existing_subscription_event is not null and existing_subscription_event > p_event_created_at then
      return false;
    end if;
    update public.subscriptions set
      stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
      stripe_subscription_id = p_subscription_id,
      status = p_status,
      cancel_at_period_end = p_cancel_at_period_end,
      stripe_subscription_event_created_at = p_event_created_at,
      stripe_event_created_at = greatest(coalesce(stripe_event_created_at, p_event_created_at), p_event_created_at),
      updated_at = now()
    where id = existing_id;
    return true;
  end if;

  if p_authority = 'payment' then
    if existing_payment_event is not null and existing_payment_event > p_event_created_at then
      return false;
    end if;
    update public.subscriptions set
      stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
      stripe_subscription_id = p_subscription_id,
      status = p_status,
      paid_through = coalesce(p_paid_through, paid_through),
      grace_ends_at = p_grace_ends_at,
      cancel_at_period_end = p_cancel_at_period_end,
      stripe_payment_event_created_at = p_event_created_at,
      stripe_event_created_at = greatest(coalesce(stripe_event_created_at, p_event_created_at), p_event_created_at),
      updated_at = now()
    where id = existing_id;
    return true;
  end if;

  if greatest(existing_subscription_event, existing_payment_event) is not null
     and greatest(existing_subscription_event, existing_payment_event) > p_event_created_at then
    return false;
  end if;
  update public.subscriptions set
    stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
    stripe_subscription_id = p_subscription_id,
    status = p_status,
    paid_through = coalesce(p_paid_through, paid_through),
    grace_ends_at = p_grace_ends_at,
    cancel_at_period_end = p_cancel_at_period_end,
    stripe_subscription_event_created_at = p_event_created_at,
    stripe_payment_event_created_at = p_event_created_at,
    stripe_event_created_at = p_event_created_at,
    updated_at = now()
  where id = existing_id;
  return true;
end $$;

revoke all on function public.upsert_gravitas_subscription_v2(uuid, text, text, text, timestamptz, timestamptz, boolean, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.upsert_gravitas_subscription_v2(uuid, text, text, text, timestamptz, timestamptz, boolean, timestamptz, text)
  to service_role;
