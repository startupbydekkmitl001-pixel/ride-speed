import test from 'node:test';
import assert from 'node:assert/strict';
import {socialModule,uuid,owner,peer,stamp,operation,receipt,socialPage} from './helpers/social.mjs';
const model=socialModule('model');
test('social requests normalize handles and detach immutable reviewed action expectations',()=>{
 assert.equal(typeof model.freezeSocialRequest,'function','social freezer is not implemented');
 const request={schema_version:1,action:'request_friend',handle:' RIDER_1 '},frozen=model.freezeSocialRequest(request);
 assert.deepEqual(frozen,{schema_version:1,action:'request_friend',handle:'rider_1'});request.handle='changed';assert.equal(frozen.handle,'rider_1');assert.equal(Object.isFrozen(frozen),true);
 for(const action of [
  {action:'friend_action',other_id:peer,verb:'accept',expected_generation:4},
  {action:'friend_action',other_id:peer,verb:'block',expected_generation:null},
  {action:'unblock',other_id:peer,block_token:uuid(3)},
  {action:'set_presence',enabled:false,expected_account_revision:2},
  {action:'create_invitation',challenge_id:uuid(4),route_id:uuid(5),route_revision:1,reviewed_geometry_hash:null,mode:'group_ride',session_id:null,starts_at:stamp,ends_at:'2026-10-02T02:00:00.123456+00:00',recipient_id:peer,friendship_generation:1},
  {action:'invitation_action',challenge_id:uuid(4),verb:'cancel',expected_member_state:null,friendship_generation:null},
 ])assert.deepEqual(model.freezeSocialRequest({schema_version:1,...action}),{schema_version:1,...action});
});
test('malformed and stale-intent request fields never become frozen operations',()=>{
 for(const request of [
  {...operation().request,owner_id:owner},{...operation().request,handle:'@rider'},
  {schema_version:1,action:'friend_action',other_id:peer,verb:['accept'],expected_generation:1},
  {schema_version:1,action:'friend_action',other_id:peer,verb:'accept',expected_generation:null},
  {schema_version:1,action:'friend_action',other_id:peer,verb:'accept',expected_generation:0},
  {schema_version:1,action:'set_presence',enabled:1,expected_account_revision:2},
  {schema_version:1,action:'set_presence',enabled:true,expected_account_revision:2147483648},
  {schema_version:1,action:'invitation_action',challenge_id:uuid(4),verb:'accept',expected_member_state:null,friendship_generation:null},
 ])assert.throws(()=>model.freezeSocialRequest(request),/SOCIAL_INVALID/);
 assert.throws(()=>model.freezeSocialOperation({...operation(),ownerId:owner}),/SOCIAL_INVALID/);
});
test('page decoder preserves microsecond cursors and rejects foreign, duplicated or malformed status rows',()=>{
 assert.equal(typeof model.validateSocialPage,'function');
 const page=socialPage();page.next_cursor={updated_at:stamp,user_id:peer};assert.deepEqual(model.validateSocialPage(page,owner),page);
 for(const patch of [
  {owner_id:uuid(8)},{items:[...page.items,...page.items]},{items:[{...page.items[0],user_id:owner}]},
  {statuses:[{...page.statuses[0],user_id:uuid(8)}]},{statuses:[{...page.statuses[0],topic:'public'}]},
  {statuses:[{...page.statuses[0],online:false}]},{items:[{...page.items[0],state:'pending'}]},
  {next_cursor:{updated_at:'2026-10-01T02:00:00.123Z',user_id:peer}},
 ])assert.throws(()=>model.validateSocialPage({...page,...patch},owner),/SOCIAL_INVALID_RESPONSE/);
 const later=socialPage();later.items.unshift({...page.items[0],user_id:uuid(5),updated_at:'2026-10-01T02:00:00.123457+00:00'});assert.equal(model.validateSocialPage(later,owner).items.length,2);
 assert.throws(()=>model.validateSocialPage({...later,items:later.items.toReversed()},owner),/SOCIAL_INVALID_RESPONSE/);
 const empty={owner_id:owner,server_now:stamp,self:{profile_ready:false,presence_opt_in:false,account_revision:0},items:[],statuses:[],next_cursor:null};assert.deepEqual(model.validateSocialPage(empty,owner),empty);
});
test('receipts bind the exact reviewed request, result kind and target; only fixed business envelopes are definitive',()=>{
 assert.equal(typeof model.validateSocialReceipt,'function');
 assert.deepEqual(model.validateSocialReceipt(receipt(),owner,operation()),receipt());
 for(const patch of [{owner_id:peer},{operation_id:uuid(99)},{request:{...operation().request,handle:'other'}},{result:{kind:'unblock',user_id:peer,state:'unblocked'}},{result:{kind:'friend',user_id:owner,state:'outgoing',generation:1}},{privateMessage:'SQL detail'}])assert.throws(()=>model.validateSocialReceipt({...receipt(),...patch},owner,operation()),/SOCIAL_INVALID_RESPONSE/);
 const op=operation({schema_version:1,action:'friend_action',other_id:peer,verb:'accept',expected_generation:1});assert.deepEqual(model.validateSocialReceipt(receipt(op,{kind:'friend',user_id:peer,state:'accepted',generation:2}),owner,op).result,{kind:'friend',user_id:peer,state:'accepted',generation:2});
 assert.throws(()=>model.validateSocialReceipt(receipt(op,{kind:'friend',user_id:peer,state:'declined',generation:2}),owner,op),/SOCIAL_INVALID_RESPONSE/);
 assert.deepEqual(model.validateSocialMutation({error:{code:'FRIEND_CHANGED'}},owner,op),{error:{code:'FRIEND_CHANGED'}});
 for(const response of [{error:{code:'private SQL failure'}},{error:{code:'FRIEND_CHANGED',message:'details'}},{...receipt(),error:{code:'FRIEND_CHANGED'}}])assert.throws(()=>model.validateSocialMutation(response,owner,op),/SOCIAL_INVALID_RESPONSE/);
 assert.equal(model.validateSocialOperation(null,owner,op.operationId),null);
});
test('bounded owner outbox fails unreadable operations rather than discarding unknown outcomes',()=>{
 assert.equal(typeof model.parseSocialOperations,'function');
 const row={...operation(),queuedAt:stamp,lastError:null};assert.deepEqual(model.parseSocialOperations([row]),[row]);assert.deepEqual(model.parseSocialOperations(undefined),[]);assert.deepEqual(model.parseSocialOperations([row],true),[]);
 for(const value of [null,{},[{...row,request:{...row.request,handle:'@invalid'}}],[{...row,request:{...row.request,handle:' RIDER '}}],[{...row,lastError:'private SQL connection detail'}],[row,row],Array.from({length:33},(_,i)=>({...row,operationId:uuid(100+i)}))])assert.throws(()=>model.parseSocialOperations(value),/SOCIAL_INVALID|SOCIAL_TOO_LARGE/);
});
test('blocked and invitation decoders retain authorized historical titles without inventing shared geometry',()=>{
 assert.equal(typeof model.validateInvitationPage,'function');
 const blocked={owner_id:owner,items:[{user_id:peer,handle:'rider',display_name:'ผู้ขี่',block_token:uuid(4)}],next_cursor:{user_id:peer}};assert.deepEqual(model.validateBlockedPage(blocked,owner),blocked);
 assert.throws(()=>model.validateBlockedPage({...blocked,items:[{...blocked.items[0],block_token:null}]},owner),/SOCIAL_INVALID_RESPONSE/);
 const item={id:uuid(5),creator_id:peer,creator_name:'ผู้ขี่',route_summary:{title:'เส้นทาง',revision:2,category:'scooter'},route_snapshot:null,mode:'group_ride',metric:'none',course_session_id:null,starts_at:stamp,ends_at:'2026-10-01T03:00:00Z',state:'open',created_at:stamp,member:{state:'invited',friendship_generation:1},can_cancel:false};
 const page={owner_id:owner,server_now:stamp,items:[item],next_cursor:null};assert.deepEqual(model.validateInvitationPage(page,owner),page);
 const snapshot={route_id:uuid(6),revision:2,title:'เส้นทาง',category:'scooter',segments:[],geometryStatus:'hidden',privacyTrimMeters:200,geometryHash:null,provider:'draft',attribution:null};assert.deepEqual(model.validateInvitationPage({...page,items:[{...item,route_snapshot:snapshot}]},owner).items[0].route_snapshot,snapshot);
 for(const patch of [{route_snapshot:{...snapshot,stops:[{lat:13,lng:100}]}},{route_snapshot:{...snapshot,revision:1}},{mode:'timed_race',metric:'none'},{can_cancel:true},{member:null},{creator_id:owner},{created_at:'2026-02-30T02:00:00Z'},{creator_id:owner,member:null,state:'cancelled',can_cancel:true}])assert.throws(()=>model.validateInvitationPage({...page,items:[{...item,...patch}]},owner),/SOCIAL_INVALID_RESPONSE/);
});
test('challenge window limits retain microseconds instead of admitting an extra fraction of a day',()=>{
 const request={schema_version:1,action:'create_invitation',challenge_id:uuid(4),route_id:uuid(5),route_revision:1,reviewed_geometry_hash:null,mode:'group_ride',session_id:null,starts_at:stamp,ends_at:'2026-10-02T02:00:00.123457+00:00',recipient_id:peer,friendship_generation:1};
 assert.throws(()=>model.freezeSocialRequest(request),/SOCIAL_INVALID/);assert.equal(model.freezeSocialRequest({...request,ends_at:'2026-10-01T02:00:00.123457+00:00'}).ends_at,'2026-10-01T02:00:00.123457+00:00');
});
