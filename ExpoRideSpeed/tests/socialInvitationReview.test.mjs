import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {socialModule,owner,peer,uuid,hold,socialPage} from './helpers/social.mjs';
const require=createRequire(import.meta.url),sdk=require('@supabase/supabase-js');
const route=()=>({id:uuid(4),owner_id:owner,title:'Private route',revision:3,category:'scooter',approved_course_id:null,approved_revision:null,updated_at:'2026-10-01T02:00:00.123456+00:00'});
function fixture(respond){
 const scope={userId:owner,generation:1},session={user:{id:owner},access_token:'original-review-JWT'},requests=[];let current=true;
 const token=session.access_token;
 const client=sdk.createClient('https://configured.test','public-test',{accessToken:async()=>token,global:{fetch:async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url),request={path:url.pathname,query:url.searchParams,token:new Headers(init.headers).get('Authorization')};requests.push(request);const body=await respond(request);return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});}}});
 const shared={id:uuid(4),owner_id:owner,revision:3,title:'Private route',category:'scooter',visibility:'private',segments:[],geometryStatus:'hidden',privacyTrimMeters:200,geometryHash:null,provider:'draft',attribution:null};
 const api=socialModule('invitationReviewService',{'../../state/AuthState':{accountClient:()=>client,isAccountCurrent:()=>current},'./service':{getSocialSnapshot:async()=>socialPage()},'../routes/syncService':{getRouteOwner:async()=>({id:uuid(4),owner_id:owner,revision:3,document:{title:'Private route',category:'scooter'}}),getRouteProjection:async()=>shared}});
 return {api,scope,session,requests,switch(){current=false;session.access_token='replacement-JWT';}};
}
test('choices are bounded owner-only real SDK reads and retain exact route approval metadata',async()=>{
 const h=fixture(request=>request.path.endsWith('rs_routes')?[route()]:[]);
 assert.equal(typeof h.api.getInvitationChoices,'function');const value=await h.api.getInvitationChoices(h.scope,h.session);
 assert.equal(value.routes.length,1);assert.equal(h.requests[0].query.get('owner_id'),`eq.${owner}`);assert.equal(h.requests[0].query.get('limit'),'31');assert.ok(h.requests.every(value=>value.token==='Bearer original-review-JWT'));
});
test('review re-reads exact owner version and friend generation, preserving a legitimate hidden projection',async()=>{
 const h=fixture(()=>route());assert.equal(typeof h.api.reviewInvitation,'function');
 const result=await h.api.reviewInvitation(h.scope,h.session,{route:route(),friend:{...socialPage().items[0],user_id:peer},mode:'group_ride',startsAt:'2030-10-01T08:00:00Z',endsAt:'2030-10-01T11:00:00Z',sessionId:null},Date.parse('2030-10-01T06:00:00Z'));
 assert.equal(result.shared.geometryStatus,'hidden');assert.equal(result.shared.geometryHash,null);assert.equal(result.friend.generation,1);assert.equal(Object.hasOwn(result.shared,'stops'),false);
 const changed=fixture(()=>({...route(),revision:4}));await assert.rejects(changed.api.reviewInvitation(changed.scope,changed.session,{route:route(),friend:socialPage().items[0],mode:'group_ride',startsAt:'2030-10-01T08:00:00Z',endsAt:'2030-10-01T11:00:00Z',sessionId:null},Date.parse('2030-10-01T06:00:00Z')),/SOCIAL_ROUTE_CHANGED/);
});
test('delayed choices cannot adopt after A→B→A or use a replacement token',async()=>{
 const entered=hold(),response=hold(),h=fixture(async()=>{entered.resolve();return response.promise;});assert.equal(typeof h.api.getInvitationChoices,'function');const work=h.api.getInvitationChoices(h.scope,h.session);await entered.promise;h.switch();response.resolve([]);await assert.rejects(work,/ACCOUNT_CHANGED/);assert.ok(h.requests.every(value=>value.token==='Bearer original-review-JWT'));
});
test('the 31st saved route is reachable through an owner-only precision-preserving metadata cursor',async()=>{
 const first=Array.from({length:31},(_,index)=>({...route(),id:uuid(100-index),title:`Route ${index+1}`}));
 const h=fixture(request=>request.query.has('or')?[first[30]]:first);assert.equal(typeof h.api.getInvitationRoutePage,'function');
 const page=await h.api.getInvitationRoutePage(h.scope,h.session);assert.equal(page.routes.length,30);assert.deepEqual(page.nextCursor,{updated_at:'2026-10-01T02:00:00.123456+00:00',id:uuid(71)});
 const next=await h.api.getInvitationRoutePage(h.scope,h.session,page.nextCursor);assert.equal(next.routes[0].title,'Route 31');assert.equal(next.nextCursor,null);assert.equal(h.requests[1].query.get('owner_id'),`eq.${owner}`);assert.match(h.requests[1].query.get('or'),/123456/);assert.equal(h.requests[1].query.get('limit'),'31');
 await assert.rejects(h.api.getInvitationRoutePage(h.scope,h.session,{updated_at:'bad,or.evil',id:uuid(71)}),/SOCIAL_INVALID/);assert.equal(h.requests.length,2);
});
