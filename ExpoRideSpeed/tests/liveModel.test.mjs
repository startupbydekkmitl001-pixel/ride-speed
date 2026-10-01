import {test} from 'node:test';
import assert from 'node:assert/strict';
import {liveModule,owner,peer,uuid,snapshot,sample,positions,grant,operation,receipt,copy} from './helpers/live.mjs';
const m=liveModule('model');
test('live immutable controls are bounded and never accept raw secret, coordinate or persisted review authority',()=>{
 const input=grant(),frozen=m.freezeLiveRequest(input);input.capture_id=uuid(20);assert.equal(frozen.capture_id,uuid(4));assert.ok(Object.isFrozen(frozen));
 for(const change of [{token:'secret'},{latitude:13},{expected_consent_revision:-1},{duration_seconds:3601}])assert.throws(()=>m.freezeLiveRequest({...grant(),...change}),/LIVE_INVALID/);
 assert.equal(m.parseLiveOperations([operation()])[0].request.action,'location_grant');assert.throws(()=>m.parseLiveOperations([{...operation(),reviewRequired:false}]),/LIVE_INVALID/);assert.throws(()=>m.parseLiveOperations(Array.from({length:33},(_,i)=>operation(grant(),i+100))),/LIVE_TOO_LARGE/);
});
test('exact grant receipts bind owner, immutable request, capture and revision; generic business-shaped errors are not envelopes',()=>{
 const op=operation();assert.equal(m.validateLiveReceipt(receipt(op),owner,op).result.precision,'precise');
 for(const value of [{...receipt(op),owner_id:peer},{...receipt(op),request:{...grant(),capture_id:uuid(99)}},{...receipt(op),result:{...receipt(op).result,capture_id:uuid(99)}},{...receipt(op),result:{...receipt(op).result,revision:1}}])assert.throws(()=>m.validateLiveReceipt(value,owner,op),/LIVE_INVALID_RESPONSE/);
 assert.equal(m.validateLiveMutation({error:{code:'CONVOY_CHANGED'}},owner,op).error.code,'CONVOY_CHANGED');assert.throws(()=>m.validateLiveMutation({error:{code:'sql-secret'}},owner,op),/LIVE_INVALID_RESPONSE/);assert.throws(()=>m.validateLiveMutation(Error('CONVOY_CHANGED'),owner,op),/LIVE_INVALID_RESPONSE/);
});
test('snapshot role boundaries forbid applicant peers/topics, member code hashes and raw private pins',()=>{
 assert.equal(m.validateConvoySnapshot(snapshot(),owner,uuid(3)).self_consent.last_sequence,0);
 const member=copy(snapshot());member.owner_id=peer;member.viewer_role='member';member.self_code=null;member.self_consent={revision:0,precision:'none',lease_id:null,capture_id:null,expires_at:null,last_sequence:0};assert.equal(m.validateConvoySnapshot(member,peer,uuid(3)).members.length,2);
 assert.throws(()=>m.validateConvoySnapshot({...member,self_code:snapshot().self_code},peer,uuid(3)),/LIVE_INVALID_RESPONSE/);
 const applicant=copy(member);applicant.viewer_role='applicant';applicant.self_state='requested';applicant.members[1].state='requested';applicant.topic=null;assert.equal(m.validateConvoySnapshot(applicant,peer,uuid(3)).viewer_role,'applicant');assert.throws(()=>m.validateConvoySnapshot({...applicant,topic:snapshot().topic},peer,uuid(3)),/LIVE_INVALID_RESPONSE/);
 const raw=copy(snapshot());raw.route_snapshot.stops=[{latitude:13,longitude:100}];assert.throws(()=>m.validateConvoySnapshot(raw,owner,uuid(3)),/LIVE_INVALID_RESPONSE/);
});
test('actual sample unknown mock flags are preserved while known mocks, zero accuracy and extra GPS fields reject',()=>{
 const input=sample(),fixed=m.freezeLiveSample(input);assert.equal(fixed.source.mocked,null);assert.equal(fixed.heading_deg,null);assert.ok(Object.isFrozen(fixed.source));
 for(const bad of [{...input,accuracy_m:0},{...input,latitude:91},{...input,source:{...input.source,mocked:true}},{...input,source:{...input.source,simulated:true}},{...input,sequence:0},{...input,owner_id:owner}])assert.throws(()=>m.freezeLiveSample(bad),/LIVE_INVALID/);
});
test('positions are current accepted other members only and never overrun consent-independent TTL or room lease',()=>{
 const room=snapshot(),p=positions();assert.equal(m.validateConvoyPositions(p,owner,room).items[0].authority,'unverified_live');
 for(const mutate of [v=>v.items.push(copy(v.items[0])),v=>v.items[0].user_id=owner,v=>v.topic_generation++,v=>v.items[0].member_generation++,v=>v.items[0].expires_at='2026-10-01T02:00:16.123456+00:00',v=>v.items[0].authority='verified']){const bad=copy(p);mutate(bad);assert.throws(()=>m.validateConvoyPositions(bad,owner,room),/LIVE_INVALID_RESPONSE/);}
 assert.throws(()=>m.validateConvoyPositions(p,owner,{...room,host_lease_until:'2026-10-01T02:00:10Z'}),/LIVE_INVALID_RESPONSE/);
});
test('friend scheme and Crockford code parsing stay bounded and never auto-authorize resolver secrets',()=>{
 const token='A'.repeat(43),link=uuid(40);assert.deepEqual(m.parseFriendLink(`ridespeed://friend/v1/${link}#token=${token}`),{linkId:link,token,scheme:'ridespeed'});
 for(const value of [`https://evil.invalid/${link}#token=${token}`,`ridespeed://friend/v1/${link}?token=${token}`,`ridespeed://friend/v1/${link}#token=${token}&other=1`])assert.equal(m.parseFriendLink(value),null);
 assert.equal(m.normalizeConvoyCode('ab12-cd34'),'AB12CD34');assert.throws(()=>m.normalizeConvoyCode('I2345678'),/LIVE_INVALID/);
});
test('initial none-consent revoke revision zero is valid; cancellation proof binds only original owned immutable grant',()=>{
 const op=operation({schema_version:1,action:'location_revoke',convoy_id:uuid(3),expected_member_generation:2,expected_consent_revision:0,expected_lease_id:null}),ack={...receipt(op),result:{kind:'consent',convoy_id:uuid(3),revision:0,precision:'none',lease_id:null,capture_id:null,expires_at:null}};assert.equal(m.validateLiveReceipt(ack,owner,op).result.revision,0);
 const grantOp=operation(),proof={owner_id:owner,operation_id:grantOp.operationId,request:grantOp.request,state:'cancelled',cancelled_at:ack.applied_at};assert.equal(m.validateLiveGrantCancellation(proof,owner,grantOp).state,'cancelled');assert.equal(m.validateLiveGrantCancellation(receipt(grantOp),owner,grantOp).operation_id,grantOp.operationId);assert.equal(m.validateLiveGrantCancellation({error:{code:'LIVE_OPERATION_CANCELLED'}},owner,grantOp).error.code,'LIVE_OPERATION_CANCELLED');
 for(const bad of [{...proof,owner_id:peer},{...proof,request:{...grantOp.request,capture_id:uuid(50)}},{...proof,state:'applied'},{...proof,latitude:13}])assert.throws(()=>m.validateLiveGrantCancellation(bad,owner,grantOp),/LIVE_INVALID_RESPONSE/);assert.throws(()=>m.validateLiveGrantCancellation(proof,owner,op),/LIVE_INVALID/);
});
