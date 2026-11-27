-- Apply to staging before deploying paid-mini routes. Legacy free reports remain readable.
begin;
alter table public.reader_audit_entitlements add column upgrade_credit_used_at timestamptz;
alter table public.reader_audit_entitlements drop constraint reader_audit_entitlements_kind_check;
alter table public.reader_audit_entitlements add constraint reader_audit_entitlements_kind_check check(kind in ('mini','comprehensive','readiness'));
create or replace function public.create_reader_audit(p_id uuid,p_user uuid,p_anonymous text,p_kind text,p_urls jsonb,p_parent uuid,p_entitlement text,p_reserve bigint,p_daily_limit bigint,p_buckets text[])
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
 if true then
  select * into ent from reader_audit_entitlements where entitlement_key=p_entitlement for update;
  if p_user is null or not found or ent.user_id <> p_user or ent.kind <> p_kind or ent.consumed_at is not null or (ent.period_end is not null and ent.period_end <= now()) then raise exception 'Audit entitlement unavailable'; end if;
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
 if true then update reader_audit_entitlements set audit_id=p_id where entitlement_key=p_entitlement; end if;
 return p_id;
end $$;

create or replace function public.claim_reader_audit_step(p_id uuid,p_lease uuid,p_cost bigint,p_step integer,p_daily_limit bigint default 25000000)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j reader_audits; ent reader_audit_entitlements; daily_spent bigint;
begin
 select * into j from reader_audits where id=p_id for update;
 if not found or j.status='completed' or j.step <> p_step then return null; end if;
 if j.lease_until > now() then return null; end if;
 if true then
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


commit;
