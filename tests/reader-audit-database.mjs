const {PGlite}=await import(process.env.AUDIT_PGLITE_PATH || '@electric-sql/pglite');
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create table public.gravitas_signals(category text);create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
await db.exec(await readFile(new URL('../supabase/migrations/202611280001_reader_side_audit.sql',import.meta.url),'utf8'));
const user='00000000-0000-4000-8000-000000000001';
await db.query('insert into auth.users(id) values($1)',[user]);
await db.query("insert into reader_audit_entitlements(entitlement_key,user_id,kind,period_end) values('period-1',$1,'comprehensive',now()+interval '1 day')",[user]);
let number=2;const uuid=()=>`00000000-0000-4000-8000-${String(number++).padStart(12,'0')}`;
async function create(id,key='period-1',daily=25000000){return db.query('select create_reader_audit($1,$2,null,\'comprehensive\',$3,null,$4,4000000,$5,$6)',[id,user,JSON.stringify(['https://example.com/']),key,daily,[]]);}
const job=uuid();await create(job);await create(job);
assert.equal((await db.query('select count(*)::int n from reader_audits')).rows[0].n,1);
await assert.rejects(()=>create(uuid()),/already using/);
const lease=uuid();await db.query('select claim_reader_audit_step($1,$2,100000,0)',[job,lease]);
assert.equal((await db.query('select claim_reader_audit_step($1,$2,100000,0) r',[job,uuid()])).rows[0].r,null);
assert.equal((await db.query('select finish_reader_audit_step($1,$2,null,null,false,\'failed\',null,\'{}\') r',[job,uuid()])).rows[0].r,false);
await db.query('select finish_reader_audit_step($1,$2,null,null,false,\'failed\',null,\'{}\')',[job,lease]);
let ent=(await db.query("select * from reader_audit_entitlements where entitlement_key='period-1'")).rows[0];assert.equal(ent.consumed_at,null);assert.equal(ent.audit_id,null);
const retry=uuid();await db.query('select claim_reader_audit_step($1,$2,100000,0)',[job,retry]);
await db.query('select finish_reader_audit_step($1,$2,\'{"summary":"complete"}\',\'[]\',true,null,50000,\'{}\')',[job,retry]);
ent=(await db.query("select * from reader_audit_entitlements where entitlement_key='period-1'")).rows[0];assert.ok(ent.consumed_at);
assert.equal((await db.query('select spent_microusd from reader_audits where id=$1',[job])).rows[0].spent_microusd,150000);
await assert.rejects(()=>create(uuid()),/entitlement unavailable/);
await db.query("insert into reader_audit_entitlements(entitlement_key,user_id,kind,period_end) values('period-2',$1,'comprehensive',now()+interval '31 days'),('expired',$1,'comprehensive',now()-interval '1 day')",[user]);
const second=uuid();await create(second,'period-2');
assert.equal((await db.query('select claim_reader_audit_step($1,$2,100000,9) r',[second,uuid()])).rows[0].r,null);
await assert.rejects(()=>create(uuid(),'expired'),/unavailable/);
await db.query("insert into reader_audit_entitlements(entitlement_key,user_id,kind) values('purchase-2',$1,'comprehensive')",[user]);
await assert.rejects(()=>create(uuid(),'purchase-2',8000000),/budget reached/);
assert.equal((await db.query('select reserved_microusd from reader_audit_daily_budget')).rows[0].reserved_microusd,8000000);
const anon=uuid();await db.query("select create_reader_audit($1,null,'hash','mini',$2,null,null,550000,25000000,ARRAY['visitor'])",[anon,JSON.stringify(['https://example.com/'])]);
for(let i=0;i<2;i++){const l=uuid();await db.query('select claim_reader_audit_step($1,$2,263000,0)',[anon,l]);await db.query("select finish_reader_audit_step($1,$2,null,null,false,'failed',null,'{}')",[anon,l]);}
assert.equal((await db.query('select claim_reader_audit_step($1,$2,263000,0) r',[anon,uuid()])).rows[0].r.blocked,true);
// Concurrent creates contend on the same entitlement; exactly one succeeds.
await db.query("insert into reader_audit_entitlements(entitlement_key,user_id,kind) values('concurrent',$1,'comprehensive')",[user]);
const raced=await Promise.allSettled([create(uuid(),'concurrent'),create(uuid(),'concurrent')]);assert.equal(raced.filter(x=>x.status==='fulfilled').length,1);
// An add-on cannot be reassigned to a different saved audit.
await db.query("insert into reader_audit_entitlements(entitlement_key,user_id,kind,parent_id) values('addon',$1,'readiness',$2)",[user,job]);
await assert.rejects(()=>db.query("select create_reader_audit($1,$2,null,'readiness',$3,$4,'addon',2000000,25000000,ARRAY[]::text[])",[uuid(),user,JSON.stringify(['https://example.com/']),second]),/another audit/);
// Execution-day reservations also cover carried-over jobs and roll back on exhaustion.
await assert.rejects(()=>db.query('select claim_reader_audit_step($1,$2,1000,0,1)',[second,uuid()]),/Daily processing budget/);
assert.equal((await db.query('select attempts from reader_audits where id=$1',[second])).rows[0].attempts,0);
assert.equal((await db.query("select has_table_privilege('anon','reader_audits','select') allowed")).rows[0].allowed,false);
console.log('PASS: duplicate create, exclusive lease, stale lease fencing, failure release, unknown-cost retention, retry success, consumption, renewal, expired period, daily budget rollback, stale-step fencing, two-attempt ceiling.');
await db.close();
