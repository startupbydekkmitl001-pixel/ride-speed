import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {socialModule,owner,peer,uuid,stamp,socialPage,operation,receipt,hold} from './helpers/social.mjs';
const require=createRequire(import.meta.url);
function harness(respond){
 const sdk=require('@supabase/supabase-js'),requests=[],scope={userId:owner,generation:1},session={user:{id:owner},access_token:'social-owner-A'};let current=scope;const token=session.access_token;
 const client=sdk.createClient('https://configured.test','publishable-test',{accessToken:async()=>token,global:{fetch:async(input,init)=>{const request={path:new URL(typeof input==='string'?input:input.url).pathname,token:new Headers(init?.headers).get('Authorization'),body:JSON.parse(init.body)};requests.push(request);const response=await respond(request,requests.length);return new Response(JSON.stringify(response.body),{status:response.status??200,headers:{'Content-Type':'application/json'}});}}});
 const api=socialModule('service',{'../../state/AuthState':{accountClient:()=>client,isAccountCurrent:value=>value===current}});
 return {api,scope,session,requests,switch(){current={userId:owner,generation:3};session.access_token='social-new-A';}};
}
test('real SDK social pages use only actor-facing cursor RPCs with captured JWT and full precision',async()=>{
 const h=harness(request=>({body:request.path.endsWith('rs_social_snapshot')?socialPage():request.path.endsWith('rs_blocked_people')?{owner_id:owner,items:[],next_cursor:null}:{owner_id:owner,server_now:stamp,items:[],next_cursor:null}}));assert.equal(typeof h.api.getSocialSnapshot,'function');
 await h.api.getSocialSnapshot(h.scope,h.session,20,{updated_at:stamp,user_id:peer});await h.api.getBlockedPeople(h.scope,h.session,30,{user_id:peer});await h.api.getInvitationInbox(h.scope,h.session,15,{created_at:stamp,id:uuid(5)});
 assert.deepEqual(h.requests,[
  {path:'/rest/v1/rpc/rs_social_snapshot',token:'Bearer social-owner-A',body:{p_limit:20,p_before:stamp,p_before_user:peer}},
  {path:'/rest/v1/rpc/rs_blocked_people',token:'Bearer social-owner-A',body:{p_limit:30,p_before_user:peer}},
  {path:'/rest/v1/rpc/rs_invitation_inbox',token:'Bearer social-owner-A',body:{p_limit:15,p_before:stamp,p_before_id:uuid(5)}},
 ]);
 await assert.rejects(h.api.getSocialSnapshot(h.scope,h.session,31),/SOCIAL_INVALID/);await assert.rejects(h.api.getBlockedPeople(h.scope,h.session,10,{user_id:peer,owner_id:owner}),/SOCIAL_INVALID/);assert.equal(h.requests.length,3);
});
test('real SDK mutation returns the fixed envelope unchanged and never performs hidden receipt recovery',async()=>{
 const h=harness(()=>({body:{error:{code:'FRIEND_CHANGED'}}}));assert.equal(typeof h.api.sendSocialMutation,'function');assert.deepEqual(await h.api.sendSocialMutation(h.scope,h.session,operation()),{error:{code:'FRIEND_CHANGED'}});assert.deepEqual(h.requests,[{path:'/rest/v1/rpc/rs_social_mutate',token:'Bearer social-owner-A',body:{p_operation:uuid(10),p_request:{schema_version:1,action:'request_friend',handle:'rider'}}}]);
 const bad=harness(()=>({status:500,body:{code:'P0001',message:'FRIEND_CHANGED'}}));await assert.rejects(bad.api.sendSocialMutation(bad.scope,bad.session,operation()),/^Error: SOCIAL_UNAVAILABLE$/);assert.equal(bad.requests.length,1);
});
test('real SDK status binds owner and exact UUID while heartbeat returns a validated UTC lease',async()=>{
 const h=harness(request=>({body:request.path.endsWith('rs_social_operation')?receipt():stamp}));assert.equal(typeof h.api.getSocialOperation,'function');assert.deepEqual(await h.api.getSocialOperation(h.scope,h.session,uuid(10)),receipt());assert.equal(await h.api.heartbeatSocial(h.scope,h.session),stamp);
 assert.deepEqual(h.requests.map(x=>[x.path,x.body]),[['/rest/v1/rpc/rs_social_operation',{p_operation:uuid(10)}],['/rest/v1/rpc/rs_heartbeat',{}]]);
 const forged=harness(()=>({body:{...receipt(),owner_id:peer}}));await assert.rejects(forged.api.getSocialOperation(forged.scope,forged.session,uuid(10)),/SOCIAL_INVALID_RESPONSE/);
 const invalid=harness(()=>({body:'2026-02-30T02:00:00Z'}));await assert.rejects(invalid.api.heartbeatSocial(invalid.scope,invalid.session),/SOCIAL_INVALID_RESPONSE/);
});
test('real SDK delayed A→B→A response is fenced and cannot pick up a replacement owner token',async()=>{
 const entered=hold(),response=hold(),h=harness(async()=>{entered.resolve();return response.promise;});assert.equal(typeof h.api.getSocialSnapshot,'function');const work=h.api.getSocialSnapshot(h.scope,h.session);await entered.promise;h.switch();response.resolve({body:socialPage()});await assert.rejects(work,/ACCOUNT_CHANGED/);assert.equal(h.requests[0].token,'Bearer social-owner-A');await assert.rejects(h.api.sendSocialMutation(h.scope,h.session,operation()),/ACCOUNT_CHANGED/);assert.equal(h.requests.length,1);
});
