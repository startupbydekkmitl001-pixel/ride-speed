import {test} from 'node:test';import assert from 'node:assert/strict';
import {raceModule,uuid,owner,peer,raceId,stamp,copy,snapshot,operation,stored,receipt,attempt,clock} from './helpers/races.mjs';
const model=raceModule('model');

test('own attempt restart page preserves ordinals and rejects peer, race, duplicate or unbounded rows',()=>{
 const first=attempt(),second={...attempt(),id:uuid(40),ordinal:2,state:'reserved',armed_at:null};const page={owner_id:owner,race_id:raceId,items:[first,second]};
 assert.equal(model.validateRaceAttemptPage(page,owner,raceId).items[1].ordinal,2);assert.deepEqual(model.validateRaceAttemptPage({...page,items:[]},owner,raceId).items,[]);
 for(const change of [v=>{v.owner_id=peer;},v=>{v.items[0].owner_id=peer;},v=>{v.items[0].race_id=uuid(99);},v=>{v.items.reverse();},v=>{v.items[1].id=v.items[0].id;},v=>{v.items.push({...second,id:uuid(41),ordinal:3},{...second,id:uuid(42),ordinal:3});},v=>{v.server_now=stamp;}]){const bad=copy(page);change(bad);assert.throws(()=>model.validateRaceAttemptPage(bad,owner,raceId),/RACE_INVALID_RESPONSE/);}
});

test('create receipts compare PostgreSQL UTC representations without losing microsecond request identity',()=>{
 const race=snapshot();race.starts_at='2026-10-01T02:00:01.123456+00:00';race.ends_at='2026-10-01T03:00:00.000000+00:00';
 const request={schema_version:1,action:'race_create',race_id:race.id,mode:race.mode,approval_id:race.approval.id,route_id:race.approval.route_id,route_revision:race.approval.route_revision,reviewed_projection_hash:'d'.repeat(64),starts_at:'2026-10-01T02:00:01.123456Z',ends_at:'2026-10-01T03:00:00Z',friends:[{user_id:peer,friendship_generation:4}],acknowledgement_version:1,evidence_consent_version:1};
 const op=operation(request),value={owner_id:owner,operation_id:op.operation_id,request,applied_at:stamp,result:{action:'race_create',race}};
 const result=model.validateRaceReceipt(value,owner,op);assert.equal(result.request.starts_at,request.starts_at);
 const changed=copy(value);changed.result.race.starts_at='2026-10-01T02:00:01.123457+00:00';assert.throws(()=>model.validateRaceReceipt(changed,owner,op),/RACE_INVALID_RESPONSE/);
});
test('race controls freeze exact consent/provider/source identities and reject unknown keys before persistence',()=>{
 const op=operation(),frozen=model.freezeRaceOperation(op);op.request.clock_probe_ids[0]=uuid(99);assert.equal(frozen.request.clock_probe_ids[0],uuid(20));assert.ok(Object.isFrozen(frozen.request.clock_probe_ids));
 assert.throws(()=>model.freezeRaceRequest({...frozen.request,owner_id:peer}),/RACE_INVALID/);
 assert.throws(()=>model.freezeRaceRequest({...frozen.request,clock_probe_ids:[uuid(20),uuid(20),uuid(22)]}),/RACE_INVALID/);
 assert.throws(()=>model.freezeRaceRequest({schema_version:1,action:'member_action',race_id:raceId,expected_revision:1,expected_member_generation:1,expected_friendship_generation:1,decision:'accept'}),/RACE_INVALID/);
});
test('strict race snapshots mask invited/terminal authority and preserve microsecond UTC without raw owner pins',()=>{
 const s=snapshot();assert.equal(model.validateRaceSnapshot(s,owner,raceId).route_snapshot.privacyTrimMeters,200);
 for(const change of [v=>{v.self_member.user_id=peer;},v=>{v.route_snapshot.stops=[];},v=>{v.schedule_ready=[{user_id:owner,member_generation:2,ready_revision:1,ready_lease_id:uuid(40),attempt_id:uuid(4)}];v.creator_id=peer;v.members[0].role='member';v.members[0].friendship_generation=4;v.members[1].role='host';v.members[1].friendship_generation=null;v.self_member=v.members[0];},v=>{v.state='cancelled';v.terminal_reason='host_cancelled';}]){const bad=copy(s);change(bad);assert.throws(()=>model.validateRaceSnapshot(bad,owner,raceId),/RACE_INVALID_RESPONSE/);}
 const bad=copy(s);bad.updated_at='2026-02-30T00:00:00Z';assert.throws(()=>model.validateRaceSnapshot(bad,owner,raceId),/RACE_INVALID_RESPONSE/);
});
test('receipt/cancellation identity is exact, mismatched capture or owner cannot settle an operation',()=>{
 const op=operation();assert.equal(model.validateRaceReceipt(receipt(op),owner,op).operation_id,op.operation_id);
 const foreign=receipt(op);foreign.result.attempt.owner_id=peer;assert.throws(()=>model.validateRaceReceipt(foreign,owner,op),/RACE_INVALID_RESPONSE/);
 const wrong=receipt(op);wrong.result.attempt.capture_id=uuid(99);assert.throws(()=>model.validateRaceReceipt(wrong,owner,op),/RACE_INVALID_RESPONSE/);
 const proof={kind:'cancelled',owner_id:owner,operation_id:op.operation_id,request:op.request,cancelled_at:stamp};assert.equal(model.validateRaceCancellation(proof,owner,op).kind,'cancelled');
 assert.throws(()=>model.validateRaceCancellation({...proof,request:{...op.request,expected_revision:2}},owner,op),/RACE_INVALID_RESPONSE/);
});
test('unread/corrupt durable operations remain unread and bounded; restored rows never persist review authority',()=>{
 assert.deepEqual(model.parseRaceOperations(undefined),[]);assert.equal(model.parseRaceOperations([stored()])[0].queued_at,stamp);
 for(const value of [null,{},[{...stored(),reviewed:true}],[stored(),stored()],Array.from({length:33},(_,i)=>stored(undefined,100+i))])assert.throws(()=>model.parseRaceOperations(value),/RACE_INVALID/);
});
test('business errors are fixed exact envelopes; rate interval is authoritative and cannot be inferred from text',()=>{
 assert.deepEqual(model.validateRaceError({error:{code:'RACE_RATE_LIMITED',retry_after_ms:2000}}),{error:{code:'RACE_RATE_LIMITED',retry_after_ms:2000}});
 for(const value of [{error:{code:'RACE_RATE_LIMITED'}},{error:{code:'RACE_RATE_LIMITED',retry_after_ms:0}},{error:{code:'RACE_CHANGED',message:'private detail'}},{error:{code:'not_real'}},{error:{code:'RACE_CHANGED'},owner_id:peer}])assert.throws(()=>model.validateRaceError(value),/RACE_INVALID_RESPONSE/);
 assert.equal(model.validateRaceError({code:'P0001',message:'RACE_CHANGED'}),null);
});
test('native attempt and original issued clock probes bind owner/capture/generation and keep unknown source flags honest',()=>{
 assert.equal(model.validateRaceAttempt(attempt(),owner,uuid(4)).provider,'expo_location');
 assert.throws(()=>model.validateRaceAttempt({...attempt(),platform:'android',provider:'ios_core_location'},owner),/RACE_INVALID_RESPONSE/);
 const binding={probe_id:uuid(20),race_id:raceId,capture_id:uuid(5),clock_generation:uuid(14)};assert.equal(model.validateRaceClockProbe(clock(),owner,binding).server_sent_at,stamp);
 assert.throws(()=>model.validateRaceClockProbe({...clock(),server_sent_at:'2026-10-01T01:59:59Z'},owner,binding),/RACE_INVALID_RESPONSE/);
});
test('race keysets retain adjacent PostgreSQL microseconds rather than rounding to the same millisecond',()=>{
 const first=snapshot(),second=snapshot();first.id=uuid(1);first.updated_at='2026-10-01T02:00:00.000002Z';second.id=uuid(99);second.updated_at='2026-10-01T02:00:00.000001Z';
 assert.equal(model.validateRacePage({owner_id:owner,server_now:stamp,items:[first,second],next_cursor:{before:second.updated_at,before_id:second.id}},owner).items.length,2);
 assert.throws(()=>model.validateRacePage({owner_id:owner,server_now:stamp,items:[second,first],next_cursor:null},owner),/RACE_INVALID_RESPONSE/);
});
test('consented course constants and ordered gates are exact; invalid private config is never a valid preview',()=>{
 const c={race_id:raceId,approval_id:uuid(6),config_hash:'b'.repeat(64),route_geometry_hash:'a'.repeat(64),configuration:{schema_version:1,method:'route_time_v1',origin:{latitude:13,longitude:100},route_geometry:[{latitude:13,longitude:100},{latitude:13.004,longitude:100}],boundary_polygon:[{latitude:12.999,longitude:99.999},{latitude:13.005,longitude:99.999},{latitude:13.005,longitude:100.001},{latitude:12.999,longitude:100.001}],staging_polygon:[{latitude:12.9999,longitude:99.9999},{latitude:13.0001,longitude:99.9999},{latitude:13.0001,longitude:100.0001}],gates:[{index:0,kind:'start',a:{latitude:13,longitude:99.9999},b:{latitude:13,longitude:100.0001},forward_point:{latitude:13.0001,longitude:100},progress_min_m:0,progress_max_m:20},{index:1,kind:'finish',a:{latitude:13.004,longitude:99.9999},b:{latitude:13.004,longitude:100.0001},forward_point:{latitude:13.0041,longitude:100},progress_min_m:420,progress_max_m:460}],corridor_half_width_m:20,maximum_speed_mps:50,projection:'wgs84_ecef_enu_v1',geometry_error_margin_m:0.25,maximum_accuracy_m:15,maximum_gap_ms:1500,maximum_crossing_span_ms:3000,maximum_duration_ms:1800000,minimum_duration_ms:10000,maximum_acceleration_mps2:15,maximum_backtrack_m:5,whole_capture_residual_ms:250,server_time_drift_allowance_ms:250,live_start_gate_window_ms:10000}};
 assert.equal(model.validateRaceCourse(c,raceId).configuration.gates.length,2);
 for(const change of [v=>{v.configuration.maximum_accuracy_m=20;},v=>{v.configuration.gates[1].index=2;},v=>{v.configuration.gates[1].progress_min_m=10;},v=>{v.configuration.route_geometry[1].longitude=-100;},v=>{v.configuration.owner_id=peer;}]){const bad=copy(c);change(bad);assert.throws(()=>model.validateRaceCourse(bad,raceId),/RACE_INVALID_RESPONSE/);}
});
test('result summaries are finite bounded intervals with no foreign pending evidence or invented attestation',()=>{
 const value={owner_id:owner,race_id:raceId,server_now:stamp,items:[{attempt_id:uuid(4),owner_id:owner,race_id:raceId,approval_id:uuid(6),config_hash:'b'.repeat(64),method:'route_time_v1',quality:'native_evidence_consistency',platform:'android',provenance_unknown:true,elapsed_lower_ms:11000,elapsed_upper_ms:12500,start_interval:{lower_ms:1790820000000,upper_ms:1790820000500},finish_interval:{lower_ms:1790820011000,upper_ms:1790820012500},gate_intervals:[{index:0,lower_ms:1790820000000,upper_ms:1790820000500},{index:1,lower_ms:1790820011000,upper_ms:1790820012500}],distance_m:500,maximum_speed_mps:null,average_speed_mps:40,sample_count:14,max_gap_ms:1000,evidence_sha256:'c'.repeat(64),verified_at:stamp}],statuses:[{user_id:owner,state:'verified',terminal_reason:null},{user_id:peer,state:'dnf',terminal_reason:'background'}]};
 assert.equal(model.validateRaceResults(value,owner,raceId).items[0].provenance_unknown,true);
 const distance=copy(value);distance.items[0].distance_m=20000;assert.equal(model.validateRaceResults(distance,owner,raceId).items[0].distance_m,20000);distance.items[0].distance_m=20000.01;assert.throws(()=>model.validateRaceResults(distance,owner,raceId),/RACE_INVALID_RESPONSE/);
 for(const change of [v=>{v.owner_id=peer;},v=>{v.items[0].elapsed_upper_ms=10000;},v=>{v.items[0].gate_intervals[1].index=0;},v=>{v.statuses[0].path='private/raw.json';},v=>{v.items[0].quality='attested';}]){const bad=copy(value);change(bad);assert.throws(()=>model.validateRaceResults(bad,owner,raceId),/RACE_INVALID_RESPONSE/);}
});
