import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const compile=(path,imports={})=>{const module={exports:{}};vm.compileFunction(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,['require','module','exports'])(name=>{if(name in imports)return imports[name];throw Error(name);},module,module.exports);return module.exports;};
const model=compile('../src/features/routes/providerModel.ts');
const uuid='00000000-0000-4000-8000-000000000001';
const a={latitude:13.7,longitude:100.5},b={latitude:13.8,longitude:100.6};
const road=()=>({routeToken:uuid,requestHash:'a'.repeat(64),provider:'geoapify',profile:'scooter',segments:[[{...a},{...b}],[{latitude:14,longitude:101},{latitude:14.01,longitude:101.01}]],distanceMeters:18000,durationSeconds:400,calculatedAt:'2026-10-01T00:00:00.000Z',attribution:'Powered by Geoapify',cached:false});
test('provider geometry remains detached and disconnected; malformed or oversized output cannot masquerade as road data',()=>{
 const value=road(),parsed=model.parseRoadResult(value,'scooter');assert.equal(parsed.segments.length,2);value.segments[0][0].latitude=0;assert.equal(parsed.segments[0][0].latitude,13.7);
 for(const patch of [{routeToken:'x'},{requestHash:'x'},{provider:'other'},{profile:'drive'},{distanceMeters:Infinity},{durationSeconds:-1},{calculatedAt:'tomorrow'},{segments:[[a]]},{segments:[[a,{latitude:91,longitude:0}]]},{verified:true},{segments:Array.from({length:33},()=>[a,b])}])assert.throws(()=>model.parseRoadResult({...road(),...patch},'scooter'),/ROUTE_PROVIDER_INVALID_RESPONSE/);
});
test('queries and stops validate before egress; consent cannot be omitted and search results are bounded',()=>{
 assert.deepEqual(model.searchRequest('  บางนา   กม. 5 ','th',true),{operation:'search',query:'บางนา กม. 5',language:'th',consent:true});
 for(const args of [['ab','en',true],['bangkok','en',false],['x'.repeat(121),'en',true]])assert.throws(()=>model.searchRequest(...args),/INVALID_REQUEST/);
 assert.throws(()=>model.roadRequest([a],'scooter',true),/INVALID_REQUEST/);
 assert.throws(()=>model.roadRequest([a,b],'scooter',false),/INVALID_REQUEST/);
 const item={id:'place',label:'Bang Na',subtitle:'Bangkok',...a};
 assert.equal(model.parseSearchResult({items:[item],attribution:'Geoapify',cached:true}).items[0].latitude,13.7);
 assert.throws(()=>model.parseSearchResult({items:Array(6).fill(item),attribution:'Geoapify',cached:true}),/ROUTE_PROVIDER_INVALID_RESPONSE/);
});
function harness(respond){
 const sdk=require('@supabase/supabase-js'),requests=[],scope={userId:uuid,generation:1},session={user:{id:uuid},access_token:'fixed-owner-A'};let current=scope;
 const client=sdk.createClient('https://configured.test','public',{accessToken:async()=>session.access_token,global:{fetch:async(input,init)=>{
 const request={path:new URL(typeof input==='string'?input:input.url).pathname,token:new Headers(init?.headers).get('Authorization'),body:JSON.parse(init.body)};requests.push(request);const value=await respond(request);return new Response(JSON.stringify(value.body),{status:value.status??200,headers:{'Content-Type':'application/json'}});
 }}});
 const api=compile('../src/features/routes/routeService.ts',{'../../state/AuthState':{accountClient:()=>client,isAccountCurrent:value=>value===current},'./providerModel':model});return {api,scope,session,requests,switchAccount(){current={userId:uuid,generation:3};}};
}
test('real SDK provider calls use initiating JWT, explicit consent and no provider secret or owner argument',async()=>{
 const h=harness(()=>({body:road()}));assert.equal((await h.api.calculateRoad(h.scope,h.session,[a,b],'scooter',true)).distanceMeters,18000);
 assert.deepEqual(h.requests,[{path:'/functions/v1/route-service',token:'Bearer fixed-owner-A',body:{operation:'route',stops:[a,b],profile:'scooter',consent:true}}]);
 await assert.rejects(h.api.calculateRoad(h.scope,h.session,[a,b],'scooter',false),/INVALID_REQUEST/);assert.equal(h.requests.length,1);
});
test('A→B→A completion cannot return road data, and HTTP errors expose stable codes without private text',async()=>{
 let entered,release;const ready=new Promise(r=>entered=r),held=new Promise(r=>release=r);const h=harness(async()=>{entered();return held;});const pending=h.api.calculateRoad(h.scope,h.session,[a,b],'scooter',true);await ready;h.switchAccount();release({body:road()});await assert.rejects(pending,/ACCOUNT_CHANGED/);assert.equal(h.requests.length,1);
 const denied=harness(()=>({status:429,body:{error:'QUOTA_EXCEEDED',details:'private URL secret'}}));await assert.rejects(denied.api.calculateRoad(denied.scope,denied.session,[a,b],'scooter',true),/^Error: QUOTA_EXCEEDED$/);
 const unknown=harness(()=>({status:503,body:{error:'private upstream secret'}}));await assert.rejects(unknown.api.calculateRoad(unknown.scope,unknown.session,[a,b],'scooter',true),/^Error: PROVIDER_UNAVAILABLE$/);
});
