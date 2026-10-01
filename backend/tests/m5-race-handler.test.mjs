import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRaceVerificationHandler} from '../functions/_shared/race-verification-handler.mjs';
import {createRaceCleanupHandler} from '../functions/_shared/race-cleanup-handler.mjs';
import {raceFixture} from './route-time-fixture.mjs';
class HttpError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const response=(_req,value,status=200)=>Response.json(value,{status});
const failure=(req,error)=>response(req,{error:error instanceof HttpError?error.code:'SERVICE_UNAVAILABLE'},error instanceof HttpError?error.status:503);
const digest=async bytes=>createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
function handlerFixture({mutateEvidence=null,downloadFailure=false,finalizeFailure=false,ownerMismatch=false,changedDigest=false,state='queued'}={}){
 const {evidence,context}=raceFixture();if(mutateEvidence)mutateEvidence(evidence);
 const blob=new Blob([JSON.stringify(evidence)],{type:'application/json'}),sha=createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
 context.token='90000000-0000-4000-8000-000000000090';context.evidence={bucket:'ride-race-evidence',path:`${context.attempt.owner_id}/${context.attempt.id}/route-time-v1.json`,attempt_id:context.attempt.id,capture_id:context.attempt.capture_id,sha256:changedDigest?'b'.repeat(64):sha,byte_length:blob.size,first_sequence:evidence.first_sequence,last_sequence:evidence.last_sequence,sample_count:evidence.samples.length};
 const calls=[],own={...context.attempt,state},userClient={rpc:async(name,args)=>{calls.push({name,args,role:'user'});if(name==='rs_get_race_attempt')return {data:ownerMismatch?{...own,owner_id:'90000000-0000-4000-8000-000000000099'}:own,error:null};if(name==='rs_race_results')return{data:{items:[{attempt_id:own.id,owner_id:own.owner_id,method:'route_time_v1'}]},error:null};throw new Error('Unexpected user RPC');}},admin={rpc:async(name,args)=>{calls.push({name,args,role:'service'});if(name==='rs_claim_race_attempt')return {data:context,error:null};if(name==='rs_reject_race_attempt'||name==='rs_release_race_attempt')return{data:true,error:null};if(name==='rs_finalize_race_attempt')return finalizeFailure?{data:null,error:{message:'private SQL detail'}}:{data:{attempt:{...own,state:'verified'},result:{...args.p_result,verified_at:new Date().toISOString()}},error:null};throw new Error('Unexpected service RPC');},storage:{from:bucket=>({download:async path=>{calls.push({name:'download',bucket,path});return downloadFailure?{data:null,error:{message:'private path/coordinates'}}:{data:blob,error:null};}})}};
 const handler=createRaceVerificationHandler({authenticate:async()=>({userId:own.owner_id,userClient,admin}),preflight:()=>null,response,failure,HttpError,digest,readId:async(req,field)=>{const v=await req.json();if(Object.keys(v).length!==1||typeof v[field]!=='string')throw new HttpError(400,'INVALID_REQUEST');return v[field];}});
 return{handler,calls,context,request:()=>new Request('https://example.test',{method:'POST',body:JSON.stringify({attempt_id:own.id})})};
}
test('canonical race worker freezes actual digest/range and returns only safe result, never raw samples or course',async()=>{
 const f=handlerFixture(),res=await f.handler(f.request()),body=await res.json();assert.equal(res.status,200);assert.equal(body.attempt.state,'verified');assert.equal(body.result.method,'route_time_v1');assert.equal('samples'in body.result,false);assert.equal('configuration'in body,false);assert.equal(f.calls.find(x=>x.name==='rs_claim_race_attempt').args.p_owner,f.context.attempt.owner_id);assert.equal(f.calls.filter(x=>x.name==='rs_finalize_race_attempt').length,1);
});
test('wrong actor/body never invokes a privileged claim or downloads evidence',async()=>{
 const f=handlerFixture({ownerMismatch:true});assert.equal((await f.handler(f.request())).status,403);assert.equal(f.calls.some(x=>x.role==='service'),false);
 const g=handlerFixture();const req=new Request('https://example.test',{method:'POST',body:JSON.stringify({attempt_id:g.context.attempt.id,owner_id:g.context.attempt.owner_id})});assert.equal((await g.handler(req)).status,400);assert.equal(g.calls.length,0);
});
test('known mocked original sample and wrong actual digest produce token-fenced fixed rejection',async()=>{
 for(const [options,code]of[[{mutateEvidence:v=>v.samples[20].mocked=true},'EVIDENCE_MOCKED'],[{changedDigest:true},'EVIDENCE_DIGEST']]){
  const f=handlerFixture(options),res=await f.handler(f.request());assert.equal(res.status,422);assert.deepEqual(await res.json(),{error:code});assert.equal(f.calls.find(x=>x.name==='rs_reject_race_attempt').args.p_code,code);assert.equal(f.calls.some(x=>x.name==='rs_finalize_race_attempt'),false);
 }
});
test('unknown download/SQL failures release only the current token and never become a definitive evidence rejection',async()=>{
 for(const options of[{downloadFailure:true},{finalizeFailure:true}]){const f=handlerFixture(options),res=await f.handler(f.request());assert.ok([409,503].includes(res.status));assert.equal(f.calls.some(x=>x.name==='rs_reject_race_attempt'),false);assert.equal(f.calls.find(x=>x.name==='rs_release_race_attempt').args.p_token,f.context.token);assert.equal(JSON.stringify(await res.json()).includes('private'),false);}
});
test('terminal current own state is read-only and does not consume a fresh worker lease',async()=>{
 const f=handlerFixture({state:'verified'}),res=await f.handler(f.request());assert.equal(res.status,200);assert.equal(f.calls.some(x=>x.role==='service'),false);
});
test('binary janitor removes through Storage before SQL acknowledgment and leaves failed cleanup retryable',async()=>{
 for(const removalFailed of[false,true]){
  const calls=[],item={id:'a',token:'b',bucket:'ride-race-evidence',path:'90000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000003/route-time-v1.json'};
  const admin={rpc:async(name)=>{calls.push(name);return{data:name==='rs_claim_race_evidence_cleanup'?[item]:true,error:null};},storage:{from:()=>({remove:async()=>{calls.push('remove');return{error:removalFailed?{}:null};}})}};
  const handler=createRaceCleanupHandler({authorize:async()=>admin,response,failure,HttpError}),res=await handler(new Request('https://example.test',{method:'POST'}));
  assert.equal(res.status,removalFailed?503:200);if(removalFailed){assert.equal(calls.includes('rs_ack_race_evidence_cleanup'),false);assert.ok(calls.includes('rs_release_race_evidence_cleanup'));}else assert.ok(calls.indexOf('remove')<calls.indexOf('rs_ack_race_evidence_cleanup'));
 }
});
