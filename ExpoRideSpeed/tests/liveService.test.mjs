import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {liveModule,owner,uuid,stamp,snapshot,sample,positions,operation,receipt,hold} from './helpers/live.mjs';
const require=createRequire(import.meta.url);
function harness(respond){const sdk=require('@supabase/supabase-js'),requests=[],scope={userId:owner,generation:1},session={user:{id:owner},access_token:'live-owner-A'},token=session.access_token;let current=scope;
 const client=sdk.createClient('https://configured.test','publishable-test',{accessToken:async()=>token,global:{fetch:async(input,init)=>{const request={path:new URL(typeof input==='string'?input:input.url).pathname,token:new Headers(init.headers).get('Authorization'),body:JSON.parse(init.body)};requests.push(request);const response=await respond(request);return new Response(JSON.stringify(response.body),{status:response.status??200,headers:{'Content-Type':'application/json'}});}}});
 const api=liveModule('service',{'../../state/AuthState':{accountClient:()=>client,isAccountCurrent:s=>s===current}});return {api,scope,session,requests,switch(){current={userId:owner,generation:3};session.access_token='new-owner-A';}};
}
test('real SDK position transport uses original nullable flags and fixed scoped RPC bodies, never hidden GPS retry',async()=>{
 const h=harness(r=>({body:r.path.endsWith('rs_convoy_positions')?positions():{owner_id:owner,convoy_id:uuid(3),lease_id:uuid(5),sequence:1,received_at:stamp,expires_at:'2026-10-01T02:00:15.123456+00:00'}}));
 await h.api.publishLivePosition(h.scope,h.session,sample());await h.api.getConvoyPositions(h.scope,h.session,snapshot());assert.deepEqual(h.requests.map(r=>[r.path,r.body]),[['/rest/v1/rpc/rs_publish_live_position',{p_sample:sample()}],['/rest/v1/rpc/rs_convoy_positions',{p_convoy:uuid(3),p_topic_generation:3}]]);assert.ok(h.requests.every(r=>r.token==='Bearer live-owner-A'));
});
test('control/resolver fixed envelopes stay typed while SQL-shaped business errors remain uncertain transport',async()=>{
 const h=harness(()=>({body:{error:{code:'CONVOY_CHANGED'}}}));assert.deepEqual(await h.api.mutateLive(h.scope,h.session,operation()),{error:{code:'CONVOY_CHANGED'}});assert.equal(h.requests.length,1);
 const bad=harness(()=>({status:500,body:{code:'P0001',message:'CONVOY_CHANGED'}}));await assert.rejects(bad.api.mutateLive(bad.scope,bad.session,operation()),/^Error: LIVE_UNAVAILABLE$/);assert.equal(bad.requests.length,1);
 const resolver=harness(()=>({body:{owner_id:owner,server_now:stamp,preview:null}}));assert.equal((await resolver.api.resolveFriendLink(resolver.scope,resolver.session,uuid(40),'A'.repeat(43))).preview,null);assert.equal((await resolver.api.resolveConvoyCode(resolver.scope,resolver.session,'ab12-cd34')).preview,null);assert.deepEqual(resolver.requests.map(r=>r.body),[{p_link:uuid(40),p_token:'A'.repeat(43)},{p_code:'AB12CD34'}]);
});
test('real SDK room/status/host heartbeat validate full identities and do not expose another owner code hash',async()=>{
 const h=harness(r=>({body:r.path.endsWith('rs_get_convoy')?snapshot():r.path.endsWith('rs_live_operation')?receipt():{owner_id:owner,convoy_id:uuid(3),server_now:stamp,host_lease_until:'2026-10-01T02:00:45.123456+00:00'}}));
 assert.equal((await h.api.getConvoy(h.scope,h.session,uuid(3))).self_code.hash,'a'.repeat(64));assert.equal((await h.api.getLiveOperation(h.scope,h.session,uuid(10))).operation_id,uuid(10));await h.api.heartbeatConvoy(h.scope,h.session,snapshot());assert.deepEqual(h.requests.at(-1).body,{p_convoy:uuid(3),p_member_generation:2});
 await assert.rejects(h.api.resolveFriendLink(h.scope,h.session,uuid(40),'not-a-token'),/LIVE_INVALID/);assert.equal(h.requests.length,3);
});
test('held A→B→A response cannot adopt or pick up replacement JWT, including live location',async()=>{
 const entered=hold(),answer=hold(),h=harness(async()=>{entered.resolve();return answer.promise;});const work=h.api.getConvoyPositions(h.scope,h.session,snapshot());await entered.promise;h.switch();answer.resolve({body:positions()});await assert.rejects(work,/ACCOUNT_CHANGED/);assert.equal(h.requests[0].token,'Bearer live-owner-A');await assert.rejects(h.api.publishLivePosition(h.scope,h.session,sample()),/ACCOUNT_CHANGED/);assert.equal(h.requests.length,1);
});
test('real SDK grant cancellation sends original exact UUID/request and validates owner-bound cancellation or receipt',async()=>{
 const op=operation(),h=harness(()=>({body:{owner_id:owner,operation_id:op.operationId,request:op.request,state:'cancelled',cancelled_at:stamp}}));assert.equal((await h.api.cancelLiveGrant(h.scope,h.session,op)).state,'cancelled');assert.deepEqual(h.requests[0].body,{p_operation:op.operationId,p_request:op.request});assert.equal(h.requests[0].path,'/rest/v1/rpc/rs_cancel_live_grant');
 const applied=harness(()=>({body:receipt(op)}));assert.equal((await applied.api.cancelLiveGrant(applied.scope,applied.session,op)).result.precision,'precise');const bad=harness(()=>({status:500,body:{code:'P0001',message:'LIVE_OPERATION_CANCELLED'}}));await assert.rejects(bad.api.cancelLiveGrant(bad.scope,bad.session,op),/^Error: LIVE_UNAVAILABLE$/);await assert.rejects(h.api.cancelLiveGrant(h.scope,h.session,{...op,request:{schema_version:1,action:'convoy_start',convoy_id:uuid(3),expected_room_revision:3}}),/LIVE_INVALID/);assert.equal(h.requests.length,1);
});
