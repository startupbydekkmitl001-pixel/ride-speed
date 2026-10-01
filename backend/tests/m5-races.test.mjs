import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {initialize,ports,profiles,friends,route,A,B,C,D,E,id,request} from './live-fixture.mjs';
import {approvedRaceCourse,createRace,acceptRace,reserveRaceAttempt,stageRaceAttempt,probeRaceAttempt,armRaceAttempt,bindRaceEvidence,scheduledRace,raceMutate,raceRead,nextRaceId} from './race-fixture.mjs';
let db,p;
const mutate=(owner,operation,body)=>p.value(owner,'select public.rs_race_mutate($1,$2::jsonb) as value',[operation,JSON.stringify(body)]);
const snapshot=(owner,race)=>p.value(owner,'select public.rs_get_race($1) as value',[race]);
const error=(value,code)=>assert.equal(value?.error?.code,code);
beforeEach(async()=>{await db?.close();db=new PGlite();await initialize(db);p=ports(db);await profiles(p);});
after(async()=>{await db?.close()});
test('race pilot is independently disabled, private tables are denied and operator grants remain service-only',async()=>{
  assert.equal((await p.admin('select enabled from ride_private.race_policy')).rows[0].enabled,false);
  for(const table of['race_policy','race_course_approvals','races','race_members','race_attempts','race_operations','race_activation_cancellations','race_results'])await assert.rejects(p.as(A,`select * from ride_private.${table}`),/permission denied/);
  for(const name of['rs_approve_race_course','rs_revoke_race_course','rs_claim_race_attempt','rs_finalize_race_attempt','rs_race_cleanup']){const row=(await p.admin("select has_function_privilege('authenticated',p.oid,'execute') auth,has_function_privilege('service_role',p.oid,'execute') service,proconfig from pg_proc p where p.proname=$1",[name])).rows[0];assert.equal(row.auth,false);assert.equal(row.service,true);assert.ok(row.proconfig.some(x=>x.startsWith('search_path=')));}
});
test('invalid controls and exact unknown activation cancellation are owner-bound, no arbitrary future arm can apply',async()=>{
  error(await mutate(A,id(9001),request('race_create',{owner_id:B})),'RACE_INVALID');
  const req=request('attempt_arm',{attempt_id:id(9002),expected_revision:1,stage_proof_id:id(9003),capture_id:id(9004),clock_probe_ids:[id(9005),id(9006),id(9007)]});
  const cancelled=await p.value(A,'select public.rs_cancel_race_activation($1,$2::jsonb) as value',[id(9008),JSON.stringify(req)]);assert.equal(cancelled.kind,'cancelled');assert.equal(cancelled.owner_id,A);assert.deepEqual(cancelled.request,req);
  assert.deepEqual(await p.value(A,'select public.rs_cancel_race_activation($1,$2::jsonb) as value',[id(9008),JSON.stringify(req)]),cancelled);
  error(await mutate(A,id(9008),req),'RACE_OPERATION_CANCELLED');
  error(await mutate(A,id(9008),{...req,capture_id:id(9009)}),'RACE_OPERATION_CONFLICT');
  assert.equal(await p.value(B,'select public.rs_race_operation($1) as value',[id(9008)]),null);
});
test('failed valid business probes retain admission and expose a bounded authoritative retry-after',async()=>{
  const req=request('race_cancel',{race_id:id(9010),expected_revision:1,reason:'user_cancel'});
  for(let n=0;n<60;n++)error(await mutate(E,id(9100+n),req),'RACE_UNAVAILABLE');
  const denied=await mutate(E,id(9200),req);error(denied,'RACE_RATE_LIMITED');assert.ok(Number.isInteger(denied.error.retry_after_ms)&&denied.error.retry_after_ms>0&&denied.error.retry_after_ms<=86400000);
});
test('live location pilot and speed verifier semantics are unchanged by route-time resources',async()=>{
  assert.equal((await p.admin('select live_enabled from ride_private.live_policy')).rows[0].live_enabled,false);
  const checks=(await p.admin("select pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relname='rs_verified_records' and pg_get_constraintdef(c.oid) like '%method%'" )).rows;
  assert.ok(checks.some(x=>x.definition.includes('sustained_min_3s_v1')));assert.equal(checks.some(x=>x.definition.includes('route_time')),false);
});
test('operator approval binds exact own source geometry/session; browser, source edits and provider tokens cannot approve',async()=>{
 const c=await approvedRaceCourse(p);
 assert.equal(c.approved.method,'route_time_v1');
 await assert.rejects(p.as(A,'select public.rs_approve_race_course($1,$2::jsonb)',[nextRaceId(),JSON.stringify(c.approvalRequest)]),/permission denied/);
 await assert.rejects(p.service('select public.rs_approve_race_course($1,$2::jsonb)',[nextRaceId(),JSON.stringify({...c.approvalRequest,route_owner_id:B})]),/RACE_APPROVAL_UNAVAILABLE/);
 await assert.rejects(p.service('select public.rs_approve_race_course($1,$2::jsonb)',[nextRaceId(),JSON.stringify({...c.approvalRequest,config:{...c.approvalRequest.config,route_geometry:[{latitude:0,longitude:0}]}})]),/RACE_INVALID/);
 await p.admin('update public.rs_course_sessions set approved=false where id=$1',[c.sessionId]);
 assert.equal((await p.value(A,'select public.rs_list_race_approvals($1,1) value',[c.routeId])).items.length,0);
});
test('race invitations require explicit distinct consent and immutable replay survives route revision invalidation',async()=>{
 const f=await createRace(p),invite=await snapshot(B,f.raceId);
 assert.equal(invite.self_member.evidence_consent_version,null);assert.equal(invite.topic,null);
 const missing=request('member_action',{race_id:f.raceId,expected_revision:invite.revision,expected_member_generation:invite.self_member.member_generation,expected_friendship_generation:10,decision:'accept'});
 error(await mutate(B,nextRaceId(),missing),'RACE_INVALID');
 const accepted=await acceptRace(p,f);assert.equal(accepted.receipt.result.race.self_member.evidence_consent_version,1);
 const changed={...f.document,title:'Source changed after review'};await p.as(A,'select public.rs_save_route_v2($1,$2,1,$3::jsonb)',[nextRaceId(),f.routeId,JSON.stringify(changed)]);
 assert.equal((await snapshot(A,f.raceId)).state,'cancelled');
 assert.deepEqual(await mutate(A,f.createOperation,f.createRequest),f.receipt);
 assert.equal(await snapshot(C,f.raceId),null);
});
test('one active attempt and three immutable per-race native snapshots are owner-scoped and browser flags cannot qualify',async()=>{
 const f=await createRace(p);await acceptRace(p,f);const a=await reserveRaceAttempt(p,f);
 error(await mutate(A,nextRaceId(),{...a.body,attempt_id:nextRaceId(),capture_id:nextRaceId()}),'RACE_ATTEMPT_ACTIVE');
 error(await mutate(B,nextRaceId(),{...a.body,platform:'web'}),'RACE_INVALID');
 assert.equal(await p.value(B,'select public.rs_get_race_attempt($1) value',[a.attemptId]),null);
 assert.equal((await p.value(B,'select public.rs_list_race_attempts($1) value',[f.raceId])).items.length,0);
 for(let ordinal=1;ordinal<=3;ordinal++){
  const current=ordinal===1?a:await reserveRaceAttempt(p,f);assert.equal(current.receipt.result.attempt.ordinal,ordinal);
  const aborted=await mutate(A,nextRaceId(),request('attempt_abort',{attempt_id:current.attemptId,expected_revision:1,reason:'user_stop'}));assert.equal(aborted.result.attempt.state,'aborted');
 }
 const view=await snapshot(A,f.raceId);error(await mutate(A,nextRaceId(),{...a.body,expected_revision:view.revision,attempt_id:nextRaceId(),capture_id:nextRaceId()}),'RACE_ATTEMPT_LIMIT');
 const history=await p.value(A,'select public.rs_list_race_attempts($1) value',[f.raceId]);assert.deepEqual(history.items.map(x=>x.ordinal),[1,2,3]);assert.ok(history.items.every(x=>x.owner_id===A));
 error(await p.value(C,'select public.rs_list_race_attempts($1) value',[f.raceId]),'RACE_UNAVAILABLE');
});
test('clock exact replay never creates a new stamp and stale probes cannot arm or change the capture generation',async()=>{
 const f=await createRace(p),a=await reserveRaceAttempt(p,f),stage=await stageRaceAttempt(p,f,a),clock=await probeRaceAttempt(p,f,a),first=clock.probes[0];
 assert.deepEqual(await p.value(A,'select public.rs_race_clock($1,$2,$3,$4) value',[first.probe_id,f.raceId,a.captureId,clock.generation]),first);
 error(await p.value(A,'select public.rs_race_clock($1,$2,$3,$4) value',[first.probe_id,f.raceId,nextRaceId(),clock.generation]),'RACE_OPERATION_CONFLICT');
 await p.admin("update ride_private.race_clock_probes set server_received_at=server_received_at-interval '6 seconds',server_sent_at=server_sent_at-interval '6 seconds' where attempt_id=$1",[a.attemptId]);
 error(await mutate(A,nextRaceId(),request('attempt_arm',{attempt_id:a.attemptId,expected_revision:1,stage_proof_id:stage.proof.proof_id,capture_id:a.captureId,clock_probe_ids:clock.probes.map(x=>x.probe_id)})),'RACE_CLOCK_UNAVAILABLE');
 assert.equal((await p.value(A,'select public.rs_get_race_attempt($1) value',[a.attemptId])).state,'reserved');
});
test('bad original staging quality clears earlier ready authority, without retaining a rejected coordinate',async()=>{
 const f=await createRace(p,{mode:'live'});await acceptRace(p,f);const a=await reserveRaceAttempt(p,f),armed=await armRaceAttempt(p,f,a),view=await snapshot(A,f.raceId);
 const ready=await mutate(A,nextRaceId(),request('race_ready',{race_id:f.raceId,expected_revision:view.revision,expected_member_generation:view.self_member.member_generation,expected_ready_revision:0,lobby_epoch:view.lobby_epoch,attempt_id:a.attemptId,capture_id:a.captureId,stage_proof_id:armed.stage.proof.proof_id,clock_probe_ids:armed.clock.probes.map(x=>x.probe_id)}));assert.ok(ready.result.ready_lease_id);
 await p.admin("update ride_private.race_stage_slots set received_at=received_at-interval '2 seconds' where owner_id=$1",[A]);
 const bad=await stageRaceAttempt(p,f,a,{sequence:2,mocked:true});error(bad.proof,'RACE_STAGE_UNAVAILABLE');
 const cleared=await snapshot(A,f.raceId);assert.equal(cleared.self_ready,null);assert.equal(cleared.self_member.ready,false);
 assert.equal((await p.admin('select count(*) n from ride_private.race_stage_slots where owner_id=$1',[A])).rows[0].n,0);
});
test('evidence path is exact owner/reservation, immutable binary metadata precedes queue and worker lease cannot be impersonated',async()=>{
 const f=await createRace(p),a=await reserveRaceAttempt(p,f),armed=await armRaceAttempt(p,f,a),bound=await bindRaceEvidence(p,a,armed),reservation=bound.receipt.result.reservation;
 assert.equal(reservation.path,`${A}/${a.attemptId}/route-time-v1.json`);
 await assert.rejects(p.as(B,"insert into storage.objects(bucket_id,name,owner_id,metadata) values('ride-race-evidence',$1,$2,'{\"size\":50000,\"mimetype\":\"application/json\"}')",[reservation.path,B]),/row-level security/);
 await p.as(A,"insert into storage.objects(bucket_id,name,owner_id,metadata) values('ride-race-evidence',$1,$2,'{\"size\":50000,\"mimetype\":\"application/json\"}')",[reservation.path,A]);
 assert.equal((await p.as(B,"select * from storage.objects where bucket_id='ride-race-evidence'")).rows.length,0);
 assert.equal((await p.as(A,"update storage.objects set metadata='{}' where bucket_id='ride-race-evidence' returning *")).rows.length,0);
 const queued=await mutate(A,nextRaceId(),request('evidence_queue',{attempt_id:a.attemptId,expected_revision:bound.receipt.result.attempt.revision,sha256:reservation.sha256}));assert.equal(queued.result.attempt.state,'queued');
 const claim=(await p.service('select public.rs_claim_race_attempt($1,$2) value',[a.attemptId,A])).rows[0].value;assert.ok(claim.token);assert.equal(claim.attempt.mode,'async');assert.deepEqual(claim.attempt.arm_clock_probe_ids,armed.body.clock_probe_ids);
 assert.equal((await p.service('select public.rs_reject_race_attempt($1,$2,$3) value',[a.attemptId,nextRaceId(),'EVIDENCE_MOCKED'])).rows[0].value,false);
 assert.equal((await p.service('select public.rs_reject_race_attempt($1,$2,$3) value',[a.attemptId,claim.token,'EVIDENCE_MOCKED'])).rows[0].value,true);
});
test('creator deletion quarantines every participant and requires foreign evidence binary removal before dependent purge',async()=>{
 const f=await createRace(p);await acceptRace(p,f);const a=await reserveRaceAttempt(p,f,B),armed=await armRaceAttempt(p,f,a),bound=await bindRaceEvidence(p,a,armed),path=bound.receipt.result.reservation.path;
 await p.admin("insert into storage.objects(bucket_id,name,owner_id,metadata) values('ride-race-evidence',$1,$2,'{\"size\":50000,\"mimetype\":\"application/json\"}')",[path,B]);
 const operation=nextRaceId(),job=(await p.service('select public.rs_begin_account_deletion($1,$2) value',[A,operation])).rows[0].value;
 assert.equal(await snapshot(B,f.raceId),null);
 const objects=(await p.service('select public.rs_account_deletion_objects($1,$2,$3) value',[A,operation,job.token])).rows[0].value;assert.ok(objects.some(x=>x.path===path&&x.bucket==='ride-race-evidence'));
 await assert.rejects(p.service('select public.rs_purge_account_data($1,$2,$3)',[A,operation,job.token]),/DELETION_ASSETS_REMAIN/);
 await p.admin('delete from storage.objects where name=$1',[path]);await p.service('select public.rs_purge_account_data($1,$2,$3)',[A,operation,job.token]);
 assert.equal((await p.admin('select count(*) n from ride_private.race_attempts where id=$1',[a.attemptId])).rows[0].n,0);
 assert.equal((await p.admin('select count(*) n from public.rs_profiles where user_id=$1',[B])).rows[0].n,1);
});
test('expired uploads and exhausted crashed workers release active-attempt authority; unbound probes expire independently',async()=>{
 const f=await createRace(p),a=await reserveRaceAttempt(p,f),armed=await armRaceAttempt(p,f,a),bound=await bindRaceEvidence(p,a,armed);
 await p.admin("update ride_private.race_attempts set upload_deadline=clock_timestamp()-interval '1 second' where id=$1",[a.attemptId]);
 const expired=await p.value(A,'select public.rs_get_race_attempt($1) value',[a.attemptId]);assert.equal(expired.state,'dnf');assert.equal(expired.terminal_reason,'deadline');
 const b=await reserveRaceAttempt(p,f),nextArmed=await armRaceAttempt(p,f,b),nextBound=await bindRaceEvidence(p,b,nextArmed),reservation=nextBound.receipt.result.reservation;
 await p.admin("insert into storage.objects(bucket_id,name,owner_id,metadata) values('ride-race-evidence',$1,$2,'{\"size\":50000,\"mimetype\":\"application/json\"}')",[reservation.path,A]);
 await mutate(A,nextRaceId(),request('evidence_queue',{attempt_id:b.attemptId,expected_revision:nextBound.receipt.result.attempt.revision,sha256:reservation.sha256}));
 for(let count=1;count<=3;count++){
  const claim=(await p.service('select public.rs_claim_race_attempt($1,$2) value',[b.attemptId,A])).rows[0].value;assert.ok(claim);
  await p.admin("update ride_private.race_attempts set verification_lease_until=clock_timestamp()-interval '1 second' where id=$1",[b.attemptId]);
  const current=await p.value(A,'select public.rs_get_race_attempt($1) value',[b.attemptId]);assert.equal(current.state,count===3?'dnf':'queued');if(count===3)assert.equal(current.terminal_reason,'storage_error');
 }
 const c=await reserveRaceAttempt(p,f),clock=await probeRaceAttempt(p,f,c);await p.admin("update ride_private.race_clock_probes set server_received_at=clock_timestamp()-interval '3 minutes',server_sent_at=clock_timestamp()-interval '3 minutes' where attempt_id=$1",[c.attemptId]);
 await p.service('select public.rs_race_cleanup()');assert.equal((await p.admin('select count(*)::int n from ride_private.race_clock_probes where attempt_id=$1',[c.attemptId])).rows[0].n,0);
 assert.equal((await p.admin('select count(*)::int n from ride_private.race_clock_probes where attempt_id=$1',[a.attemptId])).rows[0].n,3);assert.equal(clock.probes.length,3);assert.ok(bound.receipt.result.reservation);
});
test('host loss before common epoch cancels authority while post-epoch host loss preserves selected native candidates',async()=>{
 const before=await createRace(p,{mode:'live'}),first=await scheduledRace(p,before);assert.equal(first.response.result.race.state,'countdown');
 await p.admin("update ride_private.races set host_lease_until=clock_timestamp()-interval '1 second' where id=$1",[before.raceId]);
 const cancelled=await snapshot(B,before.raceId);assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.terminal_reason,'host_expired');assert.equal(cancelled.topic,null);
 const after=await createRace(p,{mode:'live'}),second=await scheduledRace(p,after);
 await p.admin("update ride_private.races set common_start_at=clock_timestamp()-interval '1 second',host_lease_until=clock_timestamp()-interval '2 seconds' where id=$1",[after.raceId]);
 const running=await snapshot(B,after.raceId);assert.equal(running.state,'running');assert.equal(running.terminal_reason,null);assert.ok(running.topic);
 const attempt=await p.value(B,'select public.rs_get_race_attempt($1) value',[second.attempts[1].attemptId]);assert.equal(attempt.state,'armed');
 await p.admin('update ride_private.race_members set ready_until=$2::timestamptz-interval \'1 second\' where race_id=$1 and user_id=$3',[after.raceId,running.common_start_at,A]);
 // Once running, host network loss does not rewrite historical start authority.
 assert.equal((await snapshot(B,after.raceId)).state,'running');
});
test('race evidence256MiB budget counts pending reservations and actual orphans once, while exact bind replay stays free',async()=>{
 const f=await createRace(p),a=await reserveRaceAttempt(p,f),armed=await armRaceAttempt(p,f,a);
 await p.admin("insert into storage.objects(bucket_id,name,owner_id,metadata) values('ride-race-evidence','operator-orphan',null,$1::jsonb)",[JSON.stringify({size:268435456-50000,mimetype:'application/json'})]);
 const bound=await bindRaceEvidence(p,a,armed);assert.ok(bound.receipt.result.reservation);
 assert.deepEqual(await mutate(A,bound.operation,bound.body),bound.receipt);
 const replayPath=bound.receipt.result.reservation.path;await p.as(A,"insert into storage.objects(bucket_id,name,owner_id,metadata) values('ride-race-evidence',$1,$2,'{\"size\":50000,\"mimetype\":\"application/json\"}')",[replayPath,A]);
 assert.equal(Number((await p.admin('select ride_private.race_reserved_evidence_bytes() n')).rows[0].n),268435456);
 const aborted=await mutate(A,nextRaceId(),request('attempt_abort',{attempt_id:a.attemptId,expected_revision:bound.receipt.result.attempt.revision,reason:'user_stop'}));assert.equal(aborted.result.attempt.state,'aborted');
 const b=await reserveRaceAttempt(p,f),second=await armRaceAttempt(p,f,b),denied=await mutate(A,nextRaceId(),{...bound.body,attempt_id:b.attemptId,capture_id:b.captureId,expected_revision:second.receipt.result.attempt.revision});error(denied,'RACE_CAPACITY');
 assert.equal((await p.admin('select evidence_path from ride_private.race_attempts where id=$1',[b.attemptId])).rows[0].evidence_path,null);
 await p.admin("delete from storage.objects where name='operator-orphan'");const recovered=await bindRaceEvidence(p,b,second);assert.ok(recovered.receipt.result.reservation);
});
test('accepted member withdrawal immediately fences its active attempt and worker token without holding the owner slot',async()=>{
 const f=await createRace(p);await acceptRace(p,f);const a=await reserveRaceAttempt(p,f,B),armed=await armRaceAttempt(p,f,a),view=await snapshot(B,f.raceId);
 const withdrawn=await mutate(B,nextRaceId(),request('member_action',{race_id:f.raceId,expected_revision:view.revision,expected_member_generation:view.self_member.member_generation,expected_friendship_generation:view.self_member.friendship_generation,decision:'withdraw'}));assert.equal(withdrawn.result.race.self_member.state,'withdrawn');
 const row=(await p.admin('select state,terminal_reason,verification_token from ride_private.race_attempts where id=$1',[a.attemptId])).rows[0];assert.equal(row.state,'dnf');assert.equal(row.terminal_reason,'membership_changed');assert.equal(row.verification_token,null);
 const other=await createRace(p,{owner:B,peer:C}),fresh=await reserveRaceAttempt(p,other);assert.equal(fresh.receipt.result.attempt.state,'reserved');assert.equal(armed.receipt.result.attempt.state,'armed');
});
