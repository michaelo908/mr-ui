/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');const path=require('node:path');
function harness(){
 const state={user:{id:'owner'},row:null,claim:null,captures:0,fetches:0,sub:{livemode:false,status:'active',id:'sub_1',items:{data:[{price:{id:'price_test'},current_period_start:100,current_period_end:Math.floor(Date.now()/1000)+3600}]}},access:{user:{id:'owner'},lifecycle:{state:'subscriber',subscriptionPaidThrough:new Date(Date.now()+7200000).toISOString()}},writes:[]};
 const db={from(table){const q={select(){return q;},eq(){return q;},is(){return q;},maybeSingle:async()=>({data:table==='subscriptions'?{stripe_subscription_id:'sub_1'}:state.row}),upsert:async value=>{state.writes.push(value);return {error:null};}};return q;},rpc:async()=>({data:state.claim,error:null})};
 const module={exports:{}};
 const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/audit/server.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 function localRequire(name){
  if(name==='server-only')return {};
  if(name==='next/headers')return {cookies:async()=>({get:()=>undefined})};
  if(name==='@supabase/supabase-js')return {createClient:()=>db};
  if(name==='@/lib/supabase/server')return {createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})}})};
  if(name==='@/lib/supabase/stripe')return {stripe:{subscriptions:{retrieve:async()=>state.sub}}};
  if(name==='@/lib/lifecycle-server')return {authenticatedLifecycle:async()=>state.access};
  if(name==='./contracts')return require('../lib/audit/contracts.ts');
  if(name==='@/lib/viewport-capture')return {captureRenderedPage:async()=>{state.captures++;throw Error('unexpected capture');}};
  if(name==='@/lib/signals/server')return {recordSignal:async()=>true};
  return require(name);
 }
 vm.runInNewContext(source,{module,exports:module.exports,require:localRequire,URL,Date,Response,Request,console,crypto:require('node:crypto').webcrypto,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://gglalhqmdnbdygcxasyd.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',STRIPE_PRICE_ID:'price_test'}},fetch:async()=>{state.fetches++;throw Error('unexpected fetch');},AbortSignal});
 return {state,api:module.exports};
}
test('an owned report cannot be opened by another signed-in account',async()=>{const {state,api}=harness();state.row={id:'00000000-0000-4000-8000-000000000001',user_id:'someone-else',anonymous_hash:null};await assert.rejects(()=>api.ownedAudit(state.row.id),/not found/);state.row.user_id='owner';assert.equal((await api.ownedAudit(state.row.id)).user_id,'owner');});
test('a busy or completed job never triggers another capture or model request',async()=>{const {state,api}=harness();await api.advance({id:'job',kind:'mini',urls:['https://example.com/'],step:0});assert.equal(state.captures,0);assert.equal(state.fetches,0);});
test('subscription allowance is tied to the paid current period',async()=>{const {state,api}=harness();const key=await api.entitlement('owner','comprehensive');assert.ok(key.startsWith('subscription:sub_1:100:'));assert.equal(state.writes.length,1);state.access.lifecycle.subscriptionPaidThrough=new Date(Date.now()-1000).toISOString();await assert.rejects(()=>api.entitlement('owner','comprehensive'),/paid billing period/);});
test('inactive subscriptions and add-ons cannot mint subscription allowances',async()=>{const {state,api}=harness();state.sub.status='past_due';await assert.rejects(()=>api.entitlement('owner','comprehensive'),/billing period/);await assert.rejects(()=>api.entitlement('owner','readiness'),/Purchase AI/);assert.equal(state.writes.length,0);});
test('cross-origin audit requests are rejected',()=>{const {api}=harness();assert.throws(()=>api.sameOrigin(new Request('https://staging.example/api/audit',{headers:{origin:'https://other.example'}})),/origin/);api.sameOrigin(new Request('https://staging.example/api/audit',{headers:{origin:'https://staging.example'}}));});
