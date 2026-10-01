import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {initialize,ports,profiles,A,B,id,request} from './live-fixture.mjs';
import {createRace,acceptRace,reserveRaceAttempt,armRaceAttempt,bindRaceEvidence,completedRaceEvidence,scheduledRace,raceMutate,raceRead,nextRaceId} from './race-fixture.mjs';
import {raceModule} from '../../ExpoRideSpeed/tests/helpers/races.mjs';
const model=raceModule('model');let db,p;
before(async()=>{db=new PGlite();await initialize(db);p=ports(db);await profiles(p);});
after(async()=>{await db?.close()});
const receipt=(owner,value,operation,body)=>model.validateRaceReceipt(value,owner,{operation_id:operation,request:body});
test('actual SQL invitation/current owner snapshots, course and exact receipts pass strict client decoders',async()=>{
 const f=await createRace(p);receipt(A,f.receipt,f.createOperation,f.createRequest);
 const invited=await raceRead(p,B,f.raceId);assert.equal(model.validateRaceSnapshot(invited,B,f.raceId).self_member.state,'invited');
 const accepted=await acceptRace(p,f);receipt(B,accepted.receipt,accepted.operation,accepted.body);
 const page=await p.value(A,'select public.rs_list_races(30,null,null) value');model.validateRacePage(page,A);
 const approvals=await p.value(A,'select public.rs_list_race_approvals($1,1) value',[f.routeId]);model.validateApprovalPage(approvals,A,f.routeId,1);
 const course=await p.value(B,'select public.rs_get_race_course($1) value',[f.raceId]);model.validateRaceCourse(course,f.raceId);
 const operation=await p.value(A,'select public.rs_race_operation($1) value',[f.createOperation]);model.validateRaceOperation(operation,A,f.createOperation);
});
test('actual native stage/clock/arm/evidence shapes and exact cancellation proof pass source validators',async()=>{
 const f=await createRace(p,{owner:B,peer:A}),a=await reserveRaceAttempt(p,f),armed=await armRaceAttempt(p,f,a);
 receipt(B,a.receipt,a.operation,a.body);model.validateRaceAttempt(a.receipt.result.attempt,B,a.attemptId);
 const attempts=await p.value(B,'select public.rs_list_race_attempts($1) value',[f.raceId]);model.validateRaceAttemptPage(attempts,B,f.raceId);assert.equal(attempts.items[0].id,a.attemptId);
 model.validateRaceStageProof(armed.stage.proof,B,armed.stage.body);
 for(const probe of armed.clock.probes)model.validateRaceClockProbe(probe,B,{probe_id:probe.probe_id,race_id:f.raceId,capture_id:a.captureId,clock_generation:armed.clock.generation});
 receipt(B,armed.receipt,armed.operation,armed.body);const bound=await bindRaceEvidence(p,a,armed);receipt(B,bound.receipt,bound.operation,bound.body);
 const result=await p.value(B,'select public.rs_race_results($1) value',[f.raceId]);model.validateRaceResults(result,B,f.raceId);
 const body=request('attempt_arm',{...armed.body,attempt_id:nextRaceId(),capture_id:nextRaceId()}),op={operation_id:nextRaceId(),request:body};
 const cancelled=await p.value(B,'select public.rs_cancel_race_activation($1,$2::jsonb) value',[op.operation_id,JSON.stringify(body)]);model.validateRaceCancellation(cancelled,B,op);
 model.validateRaceMutation(await raceMutate(p,B,op.operation_id,body),B,op);
});
test('real SQL worker claim plus pure verifier yields a safe nonempty result and rejects future finalization authority',async()=>{
 await p.admin("update ride_private.race_attempts set state='aborted',terminal_at=clock_timestamp(),terminal_reason='user_stop' where state in('reserved','armed','upload_pending')");
 const f=await createRace(p),a=await reserveRaceAttempt(p,f),armed=await armRaceAttempt(p,f,a),completed=await completedRaceEvidence(p,f,a,armed);
 assert.equal(completed.evidence.first_sequence,25);assert.ok(Number.isFinite(Date.parse(completed.claim.server_now)));
 const future={...completed.result,finish_interval:{lower_ms:Date.now()+60000,upper_ms:Date.now()+61000}};
 await assert.rejects(p.service('select public.rs_finalize_race_attempt($1,$2,$3::jsonb)',[a.attemptId,completed.claim.token,JSON.stringify(future)]),/RACE_RESULT_INVALID/);
 const finalized=(await p.service('select public.rs_finalize_race_attempt($1,$2,$3::jsonb) value',[a.attemptId,completed.claim.token,JSON.stringify(completed.result)])).rows[0].value;
 model.validateRaceAttempt(finalized.attempt,A,a.attemptId);assert.equal(finalized.attempt.state,'verified');
 const page=await p.value(A,'select public.rs_race_results($1) value',[f.raceId]);model.validateRaceResults(page,A,f.raceId);assert.equal(page.items.length,1);assert.equal(page.items[0].evidence_sha256,completed.sha256);assert.equal('samples' in page.items[0],false);
 const attempts=await p.value(A,'select public.rs_list_race_attempts($1) value',[f.raceId]);model.validateRaceAttemptPage(attempts,A,f.raceId);assert.equal(attempts.items[0].state,'verified');
 await p.admin("update ride_private.race_evidence_cleanup set eligible_at=clock_timestamp()-interval '1 second' where path=$1",[completed.reservation.path]);
 const cleanup=(await p.service('select public.rs_claim_race_evidence_cleanup(20) value')).rows[0].value.find(x=>x.path===completed.reservation.path);assert.ok(cleanup);
 await assert.rejects(p.service('select public.rs_ack_race_evidence_cleanup($1,$2)',[cleanup.id,cleanup.token]),/RACE_EVIDENCE_ASSET_REMAINS/);
 await p.admin("delete from storage.objects where bucket_id='ride-race-evidence' and name=$1",[cleanup.path]);assert.equal((await p.service('select public.rs_ack_race_evidence_cleanup($1,$2) value',[cleanup.id,cleanup.token])).rows[0].value,true);
 assert.equal((await p.value(A,'select public.rs_race_results($1) value',[f.raceId])).items.length,1);
});
test('actual two-member live ready/schedule/heartbeat and terminal privacy match frozen wire',async()=>{
 await p.admin("update ride_private.race_attempts set state='aborted',terminal_at=clock_timestamp(),terminal_reason='user_stop' where state in('reserved','armed','upload_pending')");
 const f=await createRace(p,{mode:'live'});await acceptRace(p,f);const ready=[];
 for(const owner of[A,B]){
  const a=await reserveRaceAttempt(p,f,owner),armed=await armRaceAttempt(p,f,a),view=await raceRead(p,owner,f.raceId),operation=nextRaceId(),body=request('race_ready',{race_id:f.raceId,expected_revision:view.revision,expected_member_generation:view.self_member.member_generation,expected_ready_revision:view.self_member.ready_revision,lobby_epoch:view.lobby_epoch,attempt_id:a.attemptId,capture_id:a.captureId,stage_proof_id:armed.stage.proof.proof_id,clock_probe_ids:armed.clock.probes.map(x=>x.probe_id)});
  const response=await raceMutate(p,owner,operation,body);receipt(owner,response,operation,body);
  const hbInput={race_id:f.raceId,member_generation:view.self_member.member_generation,ready_lease_id:response.result.ready_lease_id,attempt_id:a.attemptId,stage_proof_id:armed.stage.proof.proof_id,clock_probe_ids:body.clock_probe_ids};
  const hb=await p.value(owner,'select public.rs_race_heartbeat($1,$2,$3,$4,$5,$6::uuid[]) value',[f.raceId,hbInput.member_generation,hbInput.ready_lease_id,hbInput.attempt_id,hbInput.stage_proof_id,hbInput.clock_probe_ids]);model.validateRaceHeartbeat(hb,owner,hbInput);
  ready.push({user_id:owner,member_generation:view.self_member.member_generation,ready_revision:response.result.ready_revision,ready_lease_id:response.result.ready_lease_id,attempt_id:a.attemptId});
 }
 const view=await raceRead(p,A,f.raceId),operation=nextRaceId(),body=request('race_schedule',{race_id:f.raceId,expected_revision:view.revision,lobby_epoch:view.lobby_epoch,ready:ready.reverse()});
 const scheduled=await raceMutate(p,A,operation,body);receipt(A,scheduled,operation,body);assert.equal(scheduled.result.race.state,'countdown');
 model.validateRaceSnapshot(await raceRead(p,B,f.raceId),B,f.raceId);
 const cancelledBody=request('race_cancel',{race_id:f.raceId,expected_revision:scheduled.result.race.revision,reason:'user_cancel'}),cancelOperation=nextRaceId(),cancelled=await raceMutate(p,A,cancelOperation,cancelledBody);receipt(A,cancelled,cancelOperation,cancelledBody);
 const terminal=await raceRead(p,B,f.raceId);model.validateRaceSnapshot(terminal,B,f.raceId);assert.equal(terminal.topic,null);assert.equal(terminal.schedule_ready,null);
});
test('last original countdown probe survives long active capture cleanup and qualifies through the actual worker claim',async()=>{
 await p.admin("update ride_private.race_attempts set state='aborted',terminal_at=clock_timestamp(),terminal_reason='user_stop' where state in('reserved','armed','upload_pending','queued','verifying')");
 const f=await createRace(p,{owner:B,peer:A,mode:'live'}),scheduled=await scheduledRace(p,f),a=scheduled.attempts[0],extra=nextRaceId();
 const probe=await p.value(B,'select public.rs_race_clock($1,$2,$3,$4) value',[extra,f.raceId,a.captureId,a.armed.clock.generation]);assert.equal(probe.probe_id,extra);
 assert.equal((await p.admin('select bound from ride_private.race_clock_probes where owner_id=$1 and probe_id=$2',[B,extra])).rows[0].bound,false);
 await p.admin("update ride_private.race_clock_probes set server_received_at=clock_timestamp()-interval '3 minutes',server_sent_at=clock_timestamp()-interval '3 minutes' where owner_id=$1 and probe_id=$2",[B,extra]);
 await p.service('select public.rs_race_cleanup()');assert.equal((await p.admin('select count(*)::int n from ride_private.race_clock_probes where owner_id=$1 and probe_id=$2',[B,extra])).rows[0].n,1);
 const completed=await completedRaceEvidence(p,f,a,a.armed,{extraProbe:extra});assert.ok(completed.result.elapsed_lower_ms>120000);assert.equal(completed.evidence.clock_probes.length,4);assert.ok(completed.claim.clock_probes.some(x=>x.probe_id===extra));
 const finalized=(await p.service('select public.rs_finalize_race_attempt($1,$2,$3::jsonb) value',[a.attemptId,completed.claim.token,JSON.stringify(completed.result)])).rows[0].value;assert.equal(finalized.attempt.state,'verified');model.validateRaceResults(await p.value(B,'select public.rs_race_results($1) value',[f.raceId]),B,f.raceId);
});
