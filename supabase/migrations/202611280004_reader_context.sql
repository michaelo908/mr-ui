-- Staging-only: preserve optional owner-declared reader context per selected page.
begin;
alter table public.reader_audits add column page_contexts jsonb not null default '[]'::jsonb;

create function public.create_reader_audit(p_id uuid,p_user uuid,p_anonymous text,p_kind text,p_urls jsonb,p_parent uuid,p_entitlement text,p_reserve bigint,p_daily_limit bigint,p_buckets text[],p_source uuid,p_contexts jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare item text;
begin
 if jsonb_typeof(p_contexts) <> 'array' or jsonb_array_length(p_contexts) <> jsonb_array_length(p_urls) then
  raise exception 'Invalid page context';
 end if;
 for item in select jsonb_array_elements_text(p_contexts) loop
  if length(item) > 1200 then raise exception 'Page context is too long'; end if;
 end loop;
 perform public.create_reader_audit(p_id,p_user,p_anonymous,p_kind,p_urls,p_parent,p_entitlement,p_reserve,p_daily_limit,p_buckets,p_source);
 update public.reader_audits set page_contexts=p_contexts where id=p_id;
 return p_id;
end $$;

revoke all on function public.create_reader_audit(uuid,uuid,text,text,jsonb,uuid,text,bigint,bigint,text[],uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_reader_audit(uuid,uuid,text,text,jsonb,uuid,text,bigint,bigint,text[],uuid,jsonb) to service_role;
commit;
