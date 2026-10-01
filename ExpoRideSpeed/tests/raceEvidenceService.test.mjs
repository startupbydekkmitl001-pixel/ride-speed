import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
import {raceModule,owner,peer,uuid,hold,tick} from './helpers/races.mjs';
const text='{"samples":"ต้นฉบับ original"}',hash=v=>createHash('sha256').update(v).digest('hex'),size=new TextEncoder().encode(text).byteLength;
const ref=()=>({owner_id:owner,attempt_id:uuid(4),race_id:uuid(3),ride_id:uuid(13),capture_id:uuid(5),sha256:hash(text),byte_length:size,first_sequence:4,last_sequence:7,sample_count:4});
const reservation=()=>({bucket:'ride-race-evidence',path:`${owner}/${uuid(4)}/route-time-v1.json`,attempt_id:uuid(4),capture_id:uuid(5),sha256:hash(text),byte_length:size,first_sequence:4,last_sequence:7,sample_count:4,upload_deadline:'2026-10-01T03:00:00Z'});
function setup(){let active={userId:owner,generation:1},stored=null,wait=null,lost=false,infoFail=false,allowed=true;const scope=active,requests=[];
 const fetch=async(url,options={})=>{const path=new URL(url).pathname;requests.push({path,options});if(wait)await wait.promise;
  if(path.includes('/object/info/'))return stored===null||infoFail?new Response(JSON.stringify({statusCode:infoFail?'503':'404',error:infoFail?'unavailable':'NotFound',message:'unavailable'}),{status:infoFail?503:404,headers:{'content-type':'application/json'}}):new Response(JSON.stringify({size:new TextEncoder().encode(stored).byteLength,content_type:'application/json'}),{status:200,headers:{'content-type':'application/json'}});
  if(options.method==='POST'&&path.includes('/object/')){stored=new TextDecoder().decode(options.body);if(lost)throw Error('lost acknowledgement');return new Response(JSON.stringify({Key:'bound',Id:uuid(20)}),{status:200,headers:{'content-type':'application/json'}});}
  if(path.includes('/object/'))return new Response(stored,{status:200,headers:{'content-type':'application/json'}});
  if(path.endsWith('/verify-race-attempt'))return new Response(JSON.stringify({not_authority:true}),{status:200,headers:{'content-type':'application/json'}});
  throw Error('unexpected endpoint');};
 const actual=raceModule('evidenceService',{'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'SHA-256'},digestStringAsync:async(_,v)=>hash(v)},'../../state/AuthState':{isAccountCurrent:s=>s===active,accountClient:(_,session)=>createClient('https://configured.test','publishable-test',{accessToken:async()=>session.access_token,global:{fetch}})}}),guard=()=>{if(!allowed)throw Error('RACE_CHANGED');},service={uploadRaceEvidence:(...args)=>actual.uploadRaceEvidence(...args,guard),requestRaceVerification:(...args)=>actual.requestRaceVerification(...args,guard)};
 return{service,scope,session:{user:{id:owner},access_token:'original-owner-jwt'},requests,stored:v=>{stored=v;},lost:()=>{lost=true;},failInfo:()=>{infoFail=true;},hold:()=>{wait=hold();return wait;},change:()=>{active={userId:peer,generation:2};},restore:()=>{active={userId:owner,generation:3};},revoke:()=>{allowed=false;}};
}
test('actual SDK uploads exact original UTF8 ArrayBuffer once with pinned JWT and replacement disabled',async()=>{
 const h=setup();await h.service.uploadRaceEvidence(h.scope,h.session,ref(),reservation(),text);const write=h.requests.find(r=>r.options.method==='POST');assert.ok(write.options.body instanceof ArrayBuffer);assert.equal(new TextDecoder().decode(write.options.body),text);assert.equal(new Headers(write.options.headers).get('x-upsert'),'false');assert.equal(new Headers(write.options.headers).get('authorization'),'Bearer original-owner-jwt');assert.equal(h.requests.length,4);
 await h.service.uploadRaceEvidence(h.scope,h.session,ref(),reservation(),text);assert.equal(h.requests.filter(r=>r.options.method==='POST').length,1);
});
test('unknown upload result recovers only the exact same immutable object',async()=>{
 const h=setup();h.lost();await h.service.uploadRaceEvidence(h.scope,h.session,ref(),reservation(),text);assert.equal(h.requests.filter(r=>r.options.method==='POST').length,1);
 const mismatch=setup();mismatch.stored(text.replace('original','diffxxxx'));await assert.rejects(mismatch.service.uploadRaceEvidence(mismatch.scope,mismatch.session,ref(),reservation(),text),/RACE_EVIDENCE_BOUND/);assert.equal(mismatch.requests.filter(r=>r.options.method==='POST').length,0);
});
test('foreign binding, mutated bytes, and unknown metadata failure cannot write',async()=>{
 const h=setup();await assert.rejects(h.service.uploadRaceEvidence(h.scope,h.session,ref(),{...reservation(),path:`${peer}/other.json`},text),/RACE_EVIDENCE_BOUND/);await assert.rejects(h.service.uploadRaceEvidence(h.scope,h.session,ref(),reservation(),text.replace('original','mutated!')),/RACE_EVIDENCE_UNAVAILABLE/);assert.equal(h.requests.length,0);h.failInfo();await assert.rejects(h.service.uploadRaceEvidence(h.scope,h.session,ref(),reservation(),text),/RACE_UNAVAILABLE/);assert.equal(h.requests.length,1);
});
test('held old account metadata cannot continue after A to B to A, and Edge response carries no verification authority',async()=>{
 const h=setup(),wait=h.hold(),task=h.service.uploadRaceEvidence(h.scope,h.session,ref(),reservation(),text);await tick();h.change();h.restore();wait.resolve();await assert.rejects(task,/ACCOUNT_CHANGED/);assert.equal(h.requests.length,1);
 const fresh=setup();assert.equal(await fresh.service.requestRaceVerification(fresh.scope,fresh.session,uuid(4)),undefined);assert.deepEqual(JSON.parse(fresh.requests[0].options.body),{attempt_id:uuid(4)});assert.equal(new Headers(fresh.requests[0].options.headers).get('authorization'),'Bearer original-owner-jwt');
});
test('held metadata cannot start another upload or download after foreground/deletion caller authority ends',async()=>{for(const exists of [false,true]){const h=setup();if(exists)h.stored(text);const wait=h.hold(),task=h.service.uploadRaceEvidence(h.scope,h.session,ref(),reservation(),text);await tick();h.revoke();wait.resolve();await assert.rejects(task,/RACE_CHANGED/);assert.equal(h.requests.length,1);assert.equal(h.requests[0].path.includes('/object/info/'),true);}});
