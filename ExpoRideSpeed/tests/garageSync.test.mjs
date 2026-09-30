import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const compile=(path,imports={})=>{const module={exports:{}};vm.compileFunction(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,['require','module','exports'])(name=>{if(name in imports)return imports[name];throw Error(name);},module,module.exports);return module.exports;};
const model=compile('../src/features/garage/syncModel.ts');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const vehicle=(id='legacy-base36-vehicle')=>({id,catalogId:null,category:'scooter',brand:'Test',model:'Test',variant:null,year:null,engineCc:156.9,motorPowerKw:null,powertrain:'petrol',nickname:null,color:null,photoPath:null});
const doc=()=>({schema_version:1,vehicles:[vehicle()],selectedVehicleId:'legacy-base36-vehicle'});
const draft=()=>({operationId:uuid(3),expectedRevision:0,document:doc()});
const ack=(d=draft())=>({operation_id:d.operationId,applied_revision:d.expectedRevision+1,current_revision:d.expectedRevision+1,document_sha256:'a'.repeat(64),synced_at:'2026-10-01T02:00:00.123456+00:00'});
test('wire validation preserves display order, stable local IDs, nullable metadata and exact private photo paths',()=>{
 const p=doc();p.vehicles.push({...vehicle('local:second'),category:'bigbike',powertrain:'diesel',nickname:'รถของฉัน',color:'#FF5A1F'});
 const copy=model.validateGarageDocument(p,uuid(1));assert.deepEqual(copy,p);p.vehicles[0].model='changed';assert.equal(copy.vehicles[0].model,'Test');assert.equal(Object.isFrozen(copy.vehicles),true);
 const photo=doc();photo.vehicles[0].photoPath=`${uuid(1)}/${uuid(2)}.jpg`;assert.deepEqual(model.validateGarageDocument(photo,uuid(1)),photo);
 assert.throws(()=>model.validateGarageDocument(photo,uuid(4)),/GARAGE_PHOTO_UNAVAILABLE/);
});
test('malformed fields, excess vehicles, dangling selection, local photos and forged proof never reach transport',()=>{
 const p=doc();for(const candidate of [{...p,ownerId:uuid(1)},{...p,vehicles:[vehicle(),vehicle()]},{...p,selectedVehicleId:'missing'},
 {...p,vehicles:[{...vehicle(),id:'\u0000'}]},{...p,vehicles:[{...vehicle(),category:'motorcycle'}]},{...p,vehicles:[{...vehicle(),category:['scooter']}]},{...p,vehicles:[{...vehicle(),powertrain:['petrol']}]},{...p,vehicles:[{...vehicle(),verified:true}]},
 {...p,vehicles:[{...vehicle(),engineCc:Infinity}]},{...p,vehicles:[{...vehicle(),powertrain:'electric'}]},
 {...p,vehicles:[{...vehicle(),photoPath:'file:///private/photo.jpg'}]},{...p,vehicles:[{...vehicle(),color:'#fff'}]}])assert.throws(()=>model.validateGarageDocument(candidate),/GARAGE_INVALID/);
 assert.throws(()=>model.validateGarageDocument({...p,vehicles:Array.from({length:201},(_,i)=>vehicle(`v-${i}`)),selectedVehicleId:null}),/GARAGE_TOO_LARGE/);
 assert.equal(model.validateGarageDocument({...p,vehicles:Array.from({length:200},(_,i)=>vehicle(`v-${i}`)),selectedVehicleId:null}).vehicles.length,200);
});
test('snapshots distinguish genuine empty revision zero and acknowledgements bind the exact immutable operation/revision',()=>{
 assert.deepEqual(model.validateGarageSnapshot({revision:0,document:{schema_version:1,vehicles:[],selectedVehicleId:null},updated_at:null}),{revision:0,document:{schema_version:1,vehicles:[],selectedVehicleId:null},updated_at:null});
 assert.throws(()=>model.validateGarageSnapshot({revision:0,document:doc(),updated_at:null}),/GARAGE_SYNC_INVALID_RESPONSE/);
 assert.deepEqual(model.validateGarageSyncAck({...ack(),current_revision:3},draft()),{...ack(),current_revision:3});
 for(const patch of [{operation_id:uuid(99)},{applied_revision:2},{current_revision:0},{current_revision:2147483648},{document_sha256:'client-hash'},{synced_at:'later'},{verified:true}])assert.throws(()=>model.validateGarageSyncAck({...ack(),...patch},draft()),/GARAGE_SYNC_INVALID_RESPONSE/);
 assert.equal(model.validateGarageSyncStatus(null,uuid(3)),null);
});
test('lost response status recovery preserves the initiating immutable document even if its caller mutates input',async()=>{
 const value=draft(),events=[];const saved=await model.sendGarageDocument(value,{async send(input){events.push(input);value.operationId=uuid(99);value.document.vehicles[0].brand='edited';throw Error('network lost');},async status(id){events.push(id);return ack();}},()=>{});
 assert.equal(saved.operation_id,uuid(3));assert.equal(events[0].document.vehicles[0].brand,'Test');assert.equal(events[1],uuid(3));
});
test('conflicts, account closure and malformed acknowledgements do not silently rebase or recover another request',async()=>{
 let status=0,current=true;for(const code of ['GARAGE_REVISION_CONFLICT','GARAGE_OPERATION_CONFLICT','GARAGE_PHOTO_UPLOAD_REQUIRED','ACCOUNT_DELETION_PENDING'])await assert.rejects(model.sendGarageDocument(draft(),{async send(){throw Error(code);},async status(){status++;return null;}},()=>{}),new RegExp(code));
 await assert.rejects(model.sendGarageDocument(draft(),{async send(){current=false;return ack();},async status(){status++;return ack();}},()=>{if(!current)throw Error('ACCOUNT_CHANGED');}),/ACCOUNT_CHANGED/);
 await assert.rejects(model.sendGarageDocument(draft(),{async send(){return {...ack(),applied_revision:9};},async status(){status++;return ack();}},()=>{}),/GARAGE_SYNC_INVALID_RESPONSE/);assert.equal(status,0);
});
function harness(respond){
 const sdk=require('@supabase/supabase-js'),requests=[],scope={userId:uuid(1),generation:1},session={user:{id:uuid(1)},access_token:'garage-fixed-owner-A'};let current=scope;
 const client=sdk.createClient('https://configured.test','test-publishable',{accessToken:async()=>session.access_token,global:{fetch:async(input,init)=>{
 const request={path:new URL(typeof input==='string'?input:input.url).pathname,token:new Headers(init?.headers).get('Authorization'),body:JSON.parse(init.body)};requests.push(request);const value=await respond(request,requests.length);return new Response(JSON.stringify(value.body),{status:value.status??200,headers:{'Content-Type':'application/json'}});
 }}});
 const api=compile('../src/features/garage/syncService.ts',{'../../state/AuthState':{accountClient:()=>client,isAccountCurrent:value=>value===current},'./syncModel':model});return {api,scope,session,requests,switchAccount(){current={userId:uuid(1),generation:3};}};
}
test('real SDK uses only garage owner RPCs, fixed JWT, explicit CAS and no local-file/photo egress',async()=>{
 const h=harness(()=>({body:ack()}));assert.deepEqual(await h.api.syncGarage(h.scope,h.session,draft()),ack());assert.deepEqual(h.requests[0],{path:'/rest/v1/rpc/rs_sync_garage',token:'Bearer garage-fixed-owner-A',body:{p_operation:uuid(3),p_expected_revision:0,p_document:doc()}});
 const bad=draft();bad.document.vehicles[0].photoPath=`${uuid(4)}/${uuid(2)}.jpg`;await assert.rejects(h.api.syncGarage(h.scope,h.session,bad),/GARAGE_PHOTO_UNAVAILABLE/);assert.equal(h.requests.length,1);
});
test('real SDK unknown-response recovery reads the exact receipt while stable conflicts expose no raw server text',async()=>{
 const h=harness((_,n)=>n===1?{status:503,body:{message:'private outage details'}}:{body:ack()});assert.deepEqual(await h.api.syncGarage(h.scope,h.session,draft()),ack());assert.deepEqual(h.requests.map(r=>r.path),['/rest/v1/rpc/rs_sync_garage','/rest/v1/rpc/rs_get_garage_sync_status']);assert.deepEqual(h.requests[1].body,{p_operation:uuid(3)});
 const c=harness(()=>({status:400,body:{code:'P0001',message:'GARAGE_REVISION_CONFLICT'}}));await assert.rejects(c.api.syncGarage(c.scope,c.session,draft()),/GARAGE_REVISION_CONFLICT/);assert.equal(c.requests.length,1);
});
test('real SDK A→B→A rejects delayed garage reads and sync completions, with no follow-on request',async()=>{
 let entered,release;const ready=new Promise(r=>entered=r),held=new Promise(r=>release=r);const h=harness(async()=>{entered();return held;});const pending=h.api.getGarage(h.scope,h.session);await ready;h.switchAccount();release({body:{revision:1,document:doc(),updated_at:ack().synced_at}});await assert.rejects(pending,/ACCOUNT_CHANGED/);assert.equal(h.requests.length,1);await assert.rejects(h.api.syncGarage(h.scope,h.session,draft()),/ACCOUNT_CHANGED/);assert.equal(h.requests.length,1);
});
