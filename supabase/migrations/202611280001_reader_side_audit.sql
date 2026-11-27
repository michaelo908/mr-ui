-- Staging-only V1.0. Apply only after verifying the dedicated staging project.
begin;
alter table public.gravitas_signals drop constraint if exists gravitas_signals_category_check;
alter table public.gravitas_signals add constraint gravitas_signals_category_check check(category in ('acquisition','discovery','analysis','engagement','workflow','purchase','audit'));

create table public.reader_audits (
 id uuid primary key, user_id uuid references auth.users(id), anonymous_hash text,
 kind text not null check(kind in ('mini','comprehensive','readiness')),
 urls jsonb not null check(jsonb_array_length(urls) between 1 and 5),
 status text not null default 'queued' check(status in ('queued','running','failed','completed')),
 step integer not null default 0, attempts integer not null default 0,
 reports jsonb not null default '[]', result jsonb, source_keys jsonb not null default '[]',
 parent_id uuid references public.reader_audits(id), entitlement_key text,
 reserve_microusd bigint not null, spent_microusd bigint not null default 0,
 lease uuid, lease_until timestamptz, failure text,
 methodology text not null default 'reader-side-1.0',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(user_id is not null or anonymous_hash is not null)
);
create index reader_audits_owner on public.reader_audits(user_id,created_at desc);
create table public.reader_audit_entitlements (
 entitlement_key text primary key, user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('comprehensive','readiness')),
 parent_id uuid references public.reader_audits(id), period_end timestamptz, audit_id uuid references public.reader_audits(id), consumed_at timestamptz
);
create table public.reader_audit_daily_budget(day date primary key, reserved_microusd bigint not null, execution_microusd bigint not null default 0);
create table public.reader_audit_limits(bucket text primary key, count integer not null default 0);
create table public.reader_audit_usage (
 id uuid primary key, audit_id uuid not null references public.reader_audits(id), step integer not null,
 reserved_microusd bigint not null, actual_microusd bigint, metrics jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.reader_audits enable row level security;
alter table public.reader_audit_entitlements enable row level security;
alter table public.reader_audit_daily_budget enable row level security;
alter table public.reader_audit_limits enable row level security;
alter table public.reader_audit_usage enable row level security;
-- All reads/writes go through the authenticated application server; anonymous access uses an HttpOnly capability.
revoke all on public.reader_audits, public.reader_audit_entitlements, public.reader_audit_daily_budget, public.reader_audit_limits, public.reader_audit_usage from anon, authenticated;
grant all on public.reader_audits, public.reader_audit_entitlements, public.reader_audit_daily_budget, public.reader_audit_limits, public.reader_audit_usage to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('reader-audit-sources','reader-audit-sources',false,8000000,array['application/json']) on conflict(id) do nothing;

create function public.create_reader_audit(p_id uuid,p_user uuid,p_anonymous text,p_kind text,p_urls jsonb,p_parent uuid,p_entitlement text,p_reserve bigint,p_daily_limit bigint,p_buckets text[])
returns uuid language plpgsql security definer set search_path=public as $$
declare b text; n integer; existing reader_audits; ent reader_audit_entitlements;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from reader_audits where id=p_id;
 if found then
  if existing.user_id is not distinct from p_user and existing.anonymous_hash is not distinct from p_anonymous then return existing.id; end if;
  raise exception 'Audit identifier unavailable';
 end if;
 if p_reserve <= 0 or p_daily_limit <= 0 or p_kind not in ('mini','comprehensive','readiness') then raise exception 'Invalid budget'; end if;
 if p_kind <> 'mini' then
  select * into ent from reader_audit_entitlements where entitlement_key=p_entitlement for update;
  if not found or ent.user_id <> p_user or ent.kind <> p_kind or ent.consumed_at is not null or (ent.period_end is not null and ent.period_end <= now()) then raise exception 'Audit entitlement unavailable'; end if;
  if p_kind='readiness' and ent.parent_id is distinct from p_parent then raise exception 'Add-on belongs to another audit'; end if;
  if ent.audit_id is not null then
   select * into existing from reader_audits where id=ent.audit_id;
   if existing.status <> 'failed' and existing.updated_at > now()-interval '24 hours' then raise exception 'An audit is already using this entitlement'; end if;
  end if;
 end if;
 foreach b in array p_buckets loop
  insert into reader_audit_limits(bucket,count) values(b,1)
  on conflict(bucket) do update set count=reader_audit_limits.count+1 returning count into n;
  if n > 3 then raise exception 'Daily audit attempt limit reached'; end if;
 end loop;
 insert into reader_audit_daily_budget(day,reserved_microusd) values((now() at time zone 'UTC')::date,p_reserve)
 on conflict(day) do update set reserved_microusd=reader_audit_daily_budget.reserved_microusd+excluded.reserved_microusd returning reserved_microusd into n;
 if n > p_daily_limit then raise exception 'Daily audit processing budget reached'; end if;
 insert into reader_audits(id,user_id,anonymous_hash,kind,urls,parent_id,entitlement_key,reserve_microusd)
 values(p_id,p_user,p_anonymous,p_kind,p_urls,p_parent,p_entitlement,p_reserve);
 if p_kind <> 'mini' then update reader_audit_entitlements set audit_id=p_id where entitlement_key=p_entitlement; end if;
 return p_id;
end $$;

create function public.claim_reader_audit_step(p_id uuid,p_lease uuid,p_cost bigint,p_step integer,p_daily_limit bigint default 25000000)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j reader_audits; ent reader_audit_entitlements; daily_spent bigint;
begin
 select * into j from reader_audits where id=p_id for update;
 if not found or j.status='completed' or j.step <> p_step then return null; end if;
 if j.lease_until > now() then return null; end if;
 if j.kind <> 'mini' then
  select * into ent from reader_audit_entitlements where entitlement_key=j.entitlement_key for update;
  if not found or ent.consumed_at is not null or (ent.period_end is not null and ent.period_end <= now()) or (ent.audit_id is not null and ent.audit_id <> j.id) then
   update reader_audits set status='failed',failure='The billing period ended or this allowance is assigned to another audit.',lease=null,lease_until=null,updated_at=now() where id=p_id;
   update reader_audit_entitlements set audit_id=null where audit_id=p_id and consumed_at is null;
   return jsonb_build_object('blocked',true);
  end if;
  update reader_audit_entitlements set audit_id=j.id where entitlement_key=j.entitlement_key;
 end if;
 if j.attempts >= 2 or p_cost <= 0 or j.spent_microusd+p_cost > j.reserve_microusd then
  update reader_audits set status='failed',failure='Processing allowance reached; entitlement has not been consumed.',lease=null,lease_until=null where id=p_id;
  update reader_audit_entitlements set audit_id=null where audit_id=p_id and consumed_at is null;
  return jsonb_build_object('blocked',true);
 end if;
 if p_daily_limit <= 0 then raise exception 'Invalid daily processing limit'; end if;
 insert into reader_audit_daily_budget(day,reserved_microusd,execution_microusd) values((now() at time zone 'UTC')::date,0,p_cost)
 on conflict(day) do update set execution_microusd=reader_audit_daily_budget.execution_microusd+excluded.execution_microusd returning execution_microusd into daily_spent;
 if daily_spent > p_daily_limit then raise exception 'Daily processing budget reached; saved work will resume when capacity resets'; end if;
 update reader_audits set status='running',lease=p_lease,lease_until=now()+interval '10 minutes',attempts=attempts+1,spent_microusd=spent_microusd+p_cost,updated_at=now(),failure=null where id=p_id returning * into j;
 insert into reader_audit_usage(id,audit_id,step,reserved_microusd) values(p_lease,p_id,j.step,p_cost);
 return to_jsonb(j);
end $$;

create function public.finish_reader_audit_step(p_id uuid,p_lease uuid,p_report jsonb,p_sources jsonb,p_complete boolean,p_error text,p_actual bigint,p_metrics jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare j reader_audits; u reader_audit_usage;
begin
 select * into j from reader_audits where id=p_id for update;
 if j.lease is distinct from p_lease then return false; end if;
 select * into u from reader_audit_usage where id=p_lease;
 if p_actual is not null and (p_actual < 0 or p_actual > u.reserved_microusd) then raise exception 'Invalid measured cost'; end if;
 update reader_audit_usage set actual_microusd=p_actual,metrics=p_metrics where id=p_lease;
 update reader_audits set
  spent_microusd=spent_microusd-(u.reserved_microusd-coalesce(p_actual,u.reserved_microusd)),
  status=case when p_error is not null then 'failed' when p_complete then 'completed' else 'queued' end,
  step=case when p_error is null then step+1 else step end,
  attempts=case when p_error is null then 0 else attempts end,
  reports=case when p_error is null and not p_complete and p_report is not null then reports || jsonb_build_array(p_report) else reports end,
  result=case when p_complete and p_error is null then p_report else result end,
  source_keys=coalesce(p_sources,source_keys),failure=p_error,lease=null,lease_until=null,updated_at=now()
 where id=p_id;
 if p_error is not null then update reader_audit_entitlements set audit_id=null where audit_id=p_id and consumed_at is null;
 elsif p_complete then update reader_audit_entitlements set consumed_at=now() where audit_id=p_id and consumed_at is null; end if;
 return true;
end $$;

revoke all on function public.create_reader_audit(uuid,uuid,text,text,jsonb,uuid,text,bigint,bigint,text[]) from public,anon,authenticated;
revoke all on function public.claim_reader_audit_step(uuid,uuid,bigint,integer,bigint) from public,anon,authenticated;
revoke all on function public.finish_reader_audit_step(uuid,uuid,jsonb,jsonb,boolean,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.create_reader_audit(uuid,uuid,text,text,jsonb,uuid,text,bigint,bigint,text[]) to service_role;
grant execute on function public.claim_reader_audit_step(uuid,uuid,bigint,integer,bigint) to service_role;
grant execute on function public.finish_reader_audit_step(uuid,uuid,jsonb,jsonb,boolean,text,bigint,jsonb) to service_role;
commit;
