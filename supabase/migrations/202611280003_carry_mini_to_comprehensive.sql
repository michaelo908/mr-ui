-- Staging-only: retain a completed paid mini as the homepage evidence for its upgrade.
begin;
alter table public.reader_audits add column source_audit_id uuid references public.reader_audits(id);
alter table public.reader_audit_entitlements add column source_audit_id uuid references public.reader_audits(id);

create function public.create_reader_audit(p_id uuid,p_user uuid,p_anonymous text,p_kind text,p_urls jsonb,p_parent uuid,p_entitlement text,p_reserve bigint,p_daily_limit bigint,p_buckets text[],p_source uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare b text; n integer; existing reader_audits; ent reader_audit_entitlements; source reader_audits;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from reader_audits where id=p_id;
 if found then
  if existing.user_id is not distinct from p_user and existing.anonymous_hash is not distinct from p_anonymous then return existing.id; end if;
  raise exception 'Audit identifier unavailable';
 end if;
 if p_reserve <= 0 or p_daily_limit <= 0 or p_kind not in ('mini','comprehensive','readiness') then raise exception 'Invalid budget'; end if;
 select * into ent from reader_audit_entitlements where entitlement_key=p_entitlement for update;
 if p_user is null or not found or ent.user_id <> p_user or ent.kind <> p_kind or ent.consumed_at is not null or (ent.period_end is not null and ent.period_end <= now()) then raise exception 'Audit entitlement unavailable'; end if;
 if p_kind='readiness' and ent.parent_id is distinct from p_parent then raise exception 'Add-on belongs to another audit'; end if;
 if ent.audit_id is not null then
  select * into existing from reader_audits where id=ent.audit_id;
  if existing.status <> 'failed' and existing.updated_at > now()-interval '24 hours' then raise exception 'An audit is already using this entitlement'; end if;
 end if;
 if p_source is not null then
  if p_kind <> 'comprehensive' or ent.source_audit_id is distinct from p_source then raise exception 'Invalid homepage audit source'; end if;
  select * into source from reader_audits where id=p_source for share;
  if not found or source.kind <> 'mini' or source.user_id <> p_user or source.status <> 'completed' or source.result is null or jsonb_array_length(source.source_keys) < 1 or source.urls->>0 is distinct from p_urls->>0 then raise exception 'Completed homepage audit does not match this comprehensive audit'; end if;
 end if;
 foreach b in array p_buckets loop
  insert into reader_audit_limits(bucket,count) values(b,1)
  on conflict(bucket) do update set count=reader_audit_limits.count+1 returning count into n;
  if n > 3 then raise exception 'Daily audit attempt limit reached'; end if;
 end loop;
 insert into reader_audit_daily_budget(day,reserved_microusd) values((now() at time zone 'UTC')::date,p_reserve)
 on conflict(day) do update set reserved_microusd=reader_audit_daily_budget.reserved_microusd+excluded.reserved_microusd returning reserved_microusd into n;
 if n > p_daily_limit then raise exception 'Daily audit processing budget reached'; end if;
 insert into reader_audits(id,user_id,anonymous_hash,kind,urls,parent_id,source_audit_id,entitlement_key,reserve_microusd,step,reports,source_keys)
 values(p_id,p_user,p_anonymous,p_kind,p_urls,p_parent,p_source,p_entitlement,p_reserve,case when p_source is null then 0 else 1 end,case when p_source is null then '[]'::jsonb else jsonb_build_array(source.result) end,case when p_source is null then '[]'::jsonb else jsonb_build_array(source.source_keys->>0) end);
 update reader_audit_entitlements set audit_id=p_id where entitlement_key=p_entitlement;
 return p_id;
end $$;

revoke all on function public.create_reader_audit(uuid,uuid,text,text,jsonb,uuid,text,bigint,bigint,text[],uuid) from public,anon,authenticated;
grant execute on function public.create_reader_audit(uuid,uuid,text,text,jsonb,uuid,text,bigint,bigint,text[],uuid) to service_role;
commit;
