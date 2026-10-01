import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {initialize,ports,profiles,friends,schema,owners,A,B,C,D,id,request} from './live-fixture.mjs';
import {createRace,reserveRaceAttempt,armRaceAttempt,completedRaceEvidence,nextRaceId} from './race-fixture.mjs';
import {rankedModule} from '../../ExpoRideSpeed/tests/rankedFixtures.mjs';
const model=rankedModule('model'),publicationModel=rankedModule('publicationModel');let db,p;
const filter=(extra={})=>({schema_version:1,period:'today',metric:'sustained_speed',category:'scooter',class_key:'all',scope:'global',course:null,...extra});
const page=(owner=A,f=filter(),cursor=null,limit=30)=>p.value(owner,'select public.rs_ranked_page($1::jsonb,$2::jsonb,$3) value',[JSON.stringify(f),cursor?JSON.stringify(cursor):null,limit]);
const mutate=(owner,operation,body)=>p.value(owner,'select public.rs_ranked_mutate($1,$2::jsonb) value',[operation,JSON.stringify(body)]);
const publish=(owner,record,audience='global',expected_revision=0,metric='sustained_speed')=>mutate(owner,nextRaceId(),request('publication_set',{metric,record_id:record,expected_revision,audience}));
beforeEach(async()=>{await db?.close();db=new PGlite();await initialize(db);p=ports(db);await profiles(p);});
after(async()=>{await db?.close()});
// Explicit disposable trusted database fixtures; these are neither client
// verification producers nor invented hosted records. The canonical workers
// and their native evidence qualification are independently tested.
async function speed(owner,value=40,end=new Date(Date.now()-10000).toISOString()){
 const course=nextRaceId(),session=nextRaceId(),challenge=nextRaceId(),submission=nextRaceId();
 await p.admin("insert into public.rs_courses(id,name,closed_course_approved) values($1,'Local speed fixture',true)",[course]);
 await p.admin('insert into public.rs_course_sessions(id,course_id,starts_at,ends_at,approved) values($1,$2,$3::timestamptz-interval \'1 hour\',$3::timestamptz+interval \'1 hour\',true)',[session,course,end]);
 await p.admin("insert into public.rs_challenges(id,creator_id,route_snapshot,category,mode,metric,course_session_id,starts_at,ends_at) values($1,$2,'{}','scooter','timed_race','sustained_speed_3s',$3,$4::timestamptz-interval '1 hour',$4::timestamptz+interval '1 hour')",[challenge,owner,session,end]);
 await p.admin("insert into public.rs_challenge_members(challenge_id,user_id,state) values($1,$2,'accepted')",[challenge,owner]);
 await p.admin("insert into public.rs_submissions(id,owner_id,challenge_id,evidence_path,visibility,state) values($1,$2,$3,$4,'community','verified')",[submission,owner,challenge,`${owner}/${submission}.bin`]);
 await p.admin("insert into public.rs_verified_records(submission_id,owner_id,challenge_id,course_id,category,sustained_kmh,window_start,window_end,method,sample_count,maximum_gap_seconds,evidence_sha256,verified_at) values($1,$2,$3,$4,'scooter',$5,$6::timestamptz-interval '3 seconds',$6,'sustained_min_3s_v1',4,1,$7,$6::timestamptz+interval '1 second')",[submission,owner,challenge,course,value,end,'a'.repeat(64)]);
 return {submission,course,challenge};
}
async function routeResult(){const f=await createRace(p),a=await reserveRaceAttempt(p,f),armed=await armRaceAttempt(p,f,a),completed=await completedRaceEvidence(p,f,a,armed);await p.service('select public.rs_finalize_race_attempt($1,$2,$3::jsonb)',[a.attemptId,completed.claim.token,JSON.stringify(completed.result)]);return{f,a,completed};}
test('Bangkok half-open day, Monday week and leap/month boundaries use canonical UTC',async()=>{
 for(const[stamp,period,start,end]of[
 ['2026-10-01T16:59:59Z','today','2026-09-30T17:00:00+00:00','2026-10-01T17:00:00+00:00'],
 ['2026-10-01T17:00:00Z','today','2026-10-01T17:00:00+00:00','2026-10-02T17:00:00+00:00'],
 ['2026-09-27T17:00:00Z','week','2026-09-27T17:00:00+00:00','2026-10-04T17:00:00+00:00'],
 ['2024-02-29T12:00:00Z','month','2024-01-31T17:00:00+00:00','2024-02-29T17:00:00+00:00'],
 ['2024-02-28T17:00:00Z','today','2024-02-28T17:00:00+00:00','2024-02-29T17:00:00+00:00'],
 ['2026-12-31T17:00:00Z','month','2026-12-31T17:00:00+00:00','2027-01-31T17:00:00+00:00'],
 ['2026-12-31T17:00:00Z','week','2026-12-27T17:00:00+00:00','2027-01-03T17:00:00+00:00']]){
  const actual=(await p.admin('select ride_private.ranked_window($1,$2) value',[stamp,period])).rows[0].value;assert.equal(actual.starts_at,start.replace('+00:00','.000000+00:00'));assert.equal(actual.ends_at,end.replace('+00:00','.000000+00:00'));
 }
});
test('immutable server class boundaries preserve decimals, hybrid, EV, car unknown and legacy unknown',async()=>{
 for(const[category,cc,powertrain,expected]of[['scooter',125,'petrol','scooter:le125'],['scooter',125.1,'hybrid','scooter:gt125_le160'],['scooter',160.1,'petrol','scooter:gt160'],['motorcycle',500,'petrol','motorcycle:le500'],['motorcycle',500.1,'diesel','motorcycle:gt500_le900'],['motorcycle',900.1,'petrol','motorcycle:gt900'],['car',2000,'petrol','car:unknown'],['car',null,'electric','car:ev'],['scooter',160,'electric','scooter:ev'],['scooter',null,null,'scooter:unknown']])assert.equal((await p.admin('select ride_private.ranked_class($1,$2::jsonb) value',[category,JSON.stringify({engine_cc:cc,powertrain})])).rows[0].value,expected);
});
test('genuine old sustained records stay private until explicit CAS publication, never invent class or source proof',async()=>{
 const s=await speed(A);let value=await page();model.validateRankedPage(value,A,filter());assert.equal(value.items.length,0);assert.equal(value.self_status,'private');
 const ack=await publish(A,s.submission);assert.equal(ack.result.revision,1);value=await page();model.validateRankedPage(value,A,filter());assert.equal(value.items[0].sustained_kmh,40);assert.equal(value.items[0].metadata_authority,'unknown');assert.equal(value.items[0].class_key,'scooter:unknown');assert.equal(value.items[0].provenance_unknown,true);
 const narrowed=await page(A,filter({class_key:'scooter:le125'}));assert.equal(narrowed.self_status,'unclassified');assert.equal(narrowed.items.length,0);
});
test('publication response-loss replay and changed UUID content cannot roll newer intent back or expose foreign IDs',async()=>{
 const s=await speed(A),op=nextRaceId(),req=request('publication_set',{metric:'sustained_speed',record_id:s.submission,expected_revision:0,audience:'global'}),first=await mutate(A,op,req);
 publicationModel.validateRankedReceipt(first,A,{owner_id:A,operation_id:op,request:req});publicationModel.validateRankedPublication(await p.value(A,"select public.rs_get_result_publication('sustained_speed',$1) value",[s.submission]),A,'sustained_speed',s.submission);assert.equal(first.applied_at,first.result.updated_at);
 const later=await publish(A,s.submission,'private',1);assert.equal(later.result.revision,2);assert.deepEqual(await mutate(A,op,req),first);assert.equal((await page()).items.length,0);
 assert.equal((await mutate(A,op,{...req,audience:'friends'})).error.code,'RANKED_OPERATION_CONFLICT');assert.equal((await publish(B,s.submission)).error.code,'RANKED_RECORD_UNAVAILABLE');assert.equal((await publish(A,s.submission,'global',1)).error.code,'RANKED_PUBLICATION_CHANGED');
 assert.deepEqual(await p.value(A,'select public.rs_ranked_operation($1) value',[op]),first);assert.equal(await p.value(B,'select public.rs_ranked_operation($1) value',[op]),null);
});
test('full-board speed ties and own rank stay authoritative across pagination; relevant privacy changes invalidate cursor',async()=>{
 for(const[owner,value]of[[A,40],[B,60],[C,60],[D,30]]){const s=await speed(owner,value);await publish(owner,s.submission);}
 const first=await page(A,filter(),null,1);model.validateRankedPage(first,A,filter());assert.equal(first.self.rank,2);assert.equal(first.self.position,3);assert.deepEqual(first.podium.map(x=>x.rank),[1,1,2]);assert.equal(first.podium[0].tied,true);
 const next=await page(A,filter(),first.next_cursor,1);model.validateRankedPage(next,A,filter(),first.next_cursor);assert.equal(next.items[0].rank,1);
 await p.admin('insert into public.rs_blocks(blocker_id,blocked_id) values($1,$2)',[A,B]);assert.equal((await page(A,filter(),first.next_cursor,1)).error.code,'RANKED_CHANGED');const current=await page();assert.equal(current.items.some(x=>x.user_id===B),false);
});
test('friends audience requires current accepted unblocked relation, while ghost status does not grant or revoke publication',async()=>{
 const s=await speed(B);await publish(B,s.submission,'friends');assert.equal((await page(A,filter({scope:'friends'}))).items.length,0);await friends(p,A,B);assert.equal((await page(A,filter({scope:'friends'}))).items.length,1);assert.equal((await page()).items.length,0);
 await p.admin("update public.rs_account_state set preferences=preferences||'{\"ghost_mode\":true}'::jsonb where user_id=$1",[B]);assert.equal((await page(A,filter({scope:'friends'}))).items.length,1);await p.admin("update public.rs_friendships set state='removed' where user_low=least($1::uuid,$2::uuid) and user_high=greatest($1::uuid,$2::uuid)",[A,B]);assert.equal((await page(A,filter({scope:'friends'}))).items.length,0);
});
test('route-time results require separate operator discovery and owner publication; raw private geometry never leaves ranked pages',async()=>{
 const {f,a}=await routeResult(),key={approval_id:f.approvalId,config_hash:f.approved.config_hash,mode:'async'},q=filter({metric:'route_time',course:key});
 assert.equal((await page(A,q)).error.code,'RANKED_COURSE_UNAVAILABLE');await p.service("select public.rs_set_ranked_course($1,'async','Reviewed track',true)",[f.approvalId]);const discovery=await p.value(A,'select public.rs_ranked_courses(null,30) value');model.validateRankedCourses(discovery,A);assert.equal(discovery.items[0].title,'Reviewed track');assert.equal(JSON.stringify(discovery).includes('latitude'),false);
 let value=await page(A,q);assert.equal(value.self_status,'private');await publish(A,a.attemptId,'global',0,'route_time');value=await page(A,q);model.validateRankedPage(value,A,q);assert.equal(value.items[0].method,'route_time_v1');assert.equal(value.items[0].class_key,'scooter:unknown');assert.equal(JSON.stringify(value).includes('gate_intervals'),false);
 await p.service("select public.rs_set_ranked_course($1,'async','Reviewed track',false)",[f.approvalId]);assert.equal((await page(A,q)).error.code,'RANKED_COURSE_UNAVAILABLE');
});
test('reporting is idempotent and visibility bound, never auto-revokes; trusted moderation hides without forging verification',async()=>{
 const s=await speed(B),body=request('report_record',{metric:'sustained_speed',record_id:s.submission,reason:'suspected_cheating',detail:'Review evidence'}),op=nextRaceId();assert.equal((await mutate(A,op,body)).error.code,'RANKED_RECORD_UNAVAILABLE');await publish(B,s.submission);const ack=await mutate(A,op,body);assert.equal(ack.result.state,'received');assert.deepEqual(await mutate(A,op,body),ack);assert.equal((await page()).items.length,1);
 await assert.rejects(p.as(A,'select public.rs_ranked_reports(null,null,30)'),/permission denied/);const queue=(await p.service('select public.rs_ranked_reports(null,null,30) value')).rows[0].value;assert.equal(queue.items.length,1);assert.equal(queue.items[0].record_id,s.submission);
 await assert.rejects(p.as(A,"select public.rs_moderate_ranked_record('sustained_speed',$1,true,'Reviewed')",[s.submission]),/permission denied/);await p.service("select public.rs_moderate_ranked_record('sustained_speed',$1,true,'Reviewed')",[s.submission]);assert.equal((await page()).items.length,0);
});
test('new tables/private helpers/default grants deny forgery and superseded browser leaderboard access',async()=>{
 for(const t of['ranked_publications','ranked_operations','ranked_reports','ranked_course_discovery','ranked_hidden_records'])await assert.rejects(p.as(A,`select * from ride_private.${t}`),/permission denied/);
 await assert.rejects(p.as(A,"select * from public.rs_leaderboard('today','scooter','community',null)"),/permission denied/);await p.service("select * from public.rs_leaderboard('today','scooter','community',null)");
 for(const name of['rs_ranked_page','rs_ranked_courses','rs_ranked_mutate','rs_ranked_operation','rs_get_result_publication']){const v=(await p.admin("select has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') auth,proconfig from pg_proc where proname=$1",[name])).rows[0];assert.equal(v.anon,false);assert.equal(v.auth,true);assert.ok(v.proconfig.includes('search_path=""'));}
});
test('owner selector recovers genuinely private records with exact microsecond keysets and canonical publication snapshots',async()=>{
 const stamp=new Date(Date.now()-10000).toISOString().replace(/\.\d{3}Z$/,'.123456Z'),older=stamp.replace('123456','123455');
 const a=await speed(A,40,stamp),b=await speed(A,35,older);await speed(B,60,stamp);
 const first=await p.value(A,'select public.rs_ranked_own_records(null,1) value');assert.equal(first.items.length,1);assert.equal(first.items[0].record_id,a.submission);assert.deepEqual(first.items[0].publication,{revision:0,audience:'private',updated_at:null});assert.equal('owner_id' in first.items[0],false);assert.equal('rank' in first.items[0],false);
 publicationModel.validateRankedOwnPage(first,A);const next=await p.value(A,'select public.rs_ranked_own_records($1::jsonb,1) value',[JSON.stringify(first.next_cursor)]);publicationModel.validateRankedOwnPage(next,A,first.next_cursor);assert.equal(next.items[0].record_id,b.submission);assert.equal(next.next_cursor,null);await publish(A,a.submission);const current=await p.value(A,'select public.rs_ranked_own_records(null,30) value');publicationModel.validateRankedOwnPage(current,A);assert.equal(current.items[0].publication.revision,1);assert.equal(current.items.length,2);
});
test('malformed null/extra/cross-owner cursors fail closed and valid failed publication probes consume committed admission',async()=>{
 for(const key of['period','metric','category','class_key','scope'])assert.equal((await page(A,filter({[key]:null}))).error.code,'RANKED_INVALID');assert.equal((await page(A,filter({owner_id:B}))).error.code,'RANKED_INVALID');
 const s=await speed(A);await publish(A,s.submission);const q=await page(A,filter(),null,1);const cursor={owner_id:A,filter_hash:'a'.repeat(64),board_revision:'b'.repeat(64),starts_at:q.period.starts_at,ends_at:q.period.ends_at,as_of:q.period.as_of,after_position:1};
 assert.equal((await page(A,filter(),{...cursor,board_revision:null})).error.code,'RANKED_INVALID');assert.equal((await page(A,filter(),{...cursor,owner_id:B})).error.code,'RANKED_CHANGED');
 assert.equal((await p.value(A,'select public.rs_ranked_own_records($1::jsonb,30) value',[JSON.stringify({completed_at:null,record_id:s.submission,metric:'sustained_speed'})])).error.code,'RANKED_INVALID');
 for(let n=0;n<3;n++)assert.equal((await publish(B,s.submission)).error.code,'RANKED_RECORD_UNAVAILABLE');assert.equal((await p.admin("select hits from ride_private.race_admission where subject=$1 and label='ranked_control_day'",[B])).rows[0].hits,3);
 await p.admin("update ride_private.ranked_publications set revision=2147483647 where record_id=$1",[s.submission]);assert.equal((await publish(A,s.submission,'private',2147483647)).error.code,'RANKED_PUBLICATION_CHANGED');
});
test('complete native elapsed-overlap chains tie across pages and personal best uses upper bound before lower',async()=>{
 const {f,a}=await routeResult();await p.service("select public.rs_set_ranked_course($1,'async','Reviewed track',true)",[f.approvalId]);
 const time=new Date(Date.now()-10000).toISOString(),rows=[];
 for(const[owner,lower,upper]of[[A,10000,20000],[A,17000,19000],[B,19000,30000],[C,29000,40000],[D,50000,60000]]){
  const attempt=nextRaceId();await p.admin("insert into ride_private.race_attempts select (jsonb_populate_record(null::ride_private.race_attempts,to_jsonb(a)||jsonb_build_object('id',$2::uuid,'owner_id',$3::uuid,'ordinal',$4::int,'evidence_path',null))).* from ride_private.race_attempts a where a.id=$1",[a.attemptId,attempt,owner,owner===A?rows.length+2:1]);
  await p.admin("insert into ride_private.race_results select $2,$3,race_id,approval_id,config_hash,result||jsonb_build_object('attempt_id',$2::uuid,'owner_id',$3::uuid,'elapsed_lower_ms',$4::int,'elapsed_upper_ms',$5::int,'finish_interval',jsonb_build_object('lower_ms',extract(epoch from $6::timestamptz)*1000-500,'upper_ms',extract(epoch from $6::timestamptz)*1000)),evidence_sha256,$6::timestamptz+interval '1 second' from ride_private.race_results where attempt_id=$1",[a.attemptId,attempt,owner,lower,upper,time]);
  await publish(owner,attempt,'global',0,'route_time');rows.push({owner,attempt});
 }
 const q=filter({metric:'route_time',course:{approval_id:f.approvalId,config_hash:f.approved.config_hash,mode:'async'}}),first=await page(D,q,null,1);model.validateRankedPage(first,D,q);assert.deepEqual(first.podium.map(x=>x.rank),[1,1,1]);assert.equal(first.podium[0].elapsed_upper_ms,19000);assert.equal(first.self.rank,4);assert.equal(first.self.position,4);let cursor=first.next_cursor,seen=[...first.items];while(cursor){const next=await page(D,q,cursor,1);model.validateRankedPage(next,D,q,cursor);seen.push(...next.items);cursor=next.next_cursor;}assert.deepEqual(seen.map(x=>x.rank),[1,1,1,4]);
});
test('route-time finish intervals straddling Bangkok start are excluded rather than assigned a midpoint',async()=>{
 const {f,a}=await routeResult();await p.service("select public.rs_set_ranked_course($1,'async','Reviewed track',true)",[f.approvalId]);await publish(A,a.attemptId,'global',0,'route_time');const start=(await page()).period.starts_at,lower=Date.parse(start)-1,upper=Date.parse(start)+1;
 await p.admin("update ride_private.race_results set result=result||jsonb_build_object('finish_interval',jsonb_build_object('lower_ms',$2::numeric,'upper_ms',$3::numeric)) where attempt_id=$1",[a.attemptId,lower,upper]);const q=filter({metric:'route_time',course:{approval_id:f.approvalId,config_hash:f.approved.config_hash,mode:'async'}});assert.equal((await page(A,q)).items.length,0);
 await p.admin("update ride_private.race_results set result=result||jsonb_build_object('finish_interval',jsonb_build_object('lower_ms',$2::numeric,'upper_ms',$3::numeric)) where attempt_id=$1",[a.attemptId,lower+1,upper]);assert.equal((await page(A,q)).items.length,1);
});
test('binary-first account purge removes owner and foreign creator-dependent publication/report receipts before canonical results',async()=>{
 const s=await speed(A);await publish(A,s.submission);const report=request('report_record',{metric:'sustained_speed',record_id:s.submission,reason:'other',detail:''});await mutate(B,nextRaceId(),report);
 const deletion=nextRaceId(),job=(await p.service('select public.rs_begin_account_deletion($1,$2) value',[A,deletion])).rows[0].value;assert.equal((await page(B)).items.length,0);
 await p.service('select public.rs_purge_account_data($1,$2,$3)',[A,deletion,job.token]);assert.equal((await p.admin('select count(*)::int n from ride_private.ranked_publications')).rows[0].n,0);assert.equal((await p.admin('select count(*)::int n from ride_private.ranked_reports')).rows[0].n,0);assert.equal((await p.admin('select count(*)::int n from ride_private.ranked_operations')).rows[0].n,0);
});
test('owner can revoke an existing publication while canonical approval is unavailable, but cannot re-share ineligible results',async()=>{
 const s=await speed(A);await publish(A,s.submission);await p.admin('update public.rs_courses set closed_course_approved=false where id=$1',[s.course]);assert.equal((await page()).items.length,0);
 const current=await p.value(A,"select public.rs_get_result_publication('sustained_speed',$1) value",[s.submission]);assert.equal(current.revision,1);assert.equal(current.audience,'global');const revoked=await publish(A,s.submission,'private',1);assert.equal(revoked.result.revision,2);assert.equal(revoked.result.audience,'private');assert.equal((await publish(A,s.submission,'global',2)).error.code,'RANKED_RECORD_UNAVAILABLE');
 await p.admin('update public.rs_courses set closed_course_approved=true where id=$1',[s.course]);assert.equal((await page()).items.length,0);
});
test('unsupported or null ranked action is rejected before receipt, report or admission writes',async()=>{
 const s=await speed(A);
 for(const action of['unsupported',null])for(const record of[s.submission,nextRaceId()]){
  const body={schema_version:1,action,metric:'sustained_speed',record_id:record};
  assert.deepEqual(await mutate(A,nextRaceId(),body),{error:{code:'RANKED_INVALID'}});
 }
 for(const table of['ranked_operations','ranked_reports'])assert.equal((await p.admin(`select count(*)::int n from ride_private.${table}`)).rows[0].n,0);
 assert.equal((await p.admin("select count(*)::int n from ride_private.race_admission where label like 'ranked_control_%'")).rows[0].n,0);
});
test('legacy worker lease remains owner-bound after trusted row reassignment, with private helpers and terminal cleanup',async()=>{
 const s=await speed(A);await p.admin('delete from public.rs_verified_records where submission_id=$1',[s.submission]);await p.admin("update public.rs_submissions set state='queued' where id=$1",[s.submission]);
 const token=(await p.service('select public.rs_claim_submission($1,$2) value',[s.submission,A])).rows[0].value;assert.ok(token);
 await p.admin('update public.rs_submissions set owner_id=$2 where id=$1',[s.submission,B]);
 for(const[sql,args]of[
  ['select public.rs_release_submission($1,$2)',[s.submission,token]],
  ["select public.rs_reject_submission($1,'Stale owner',$2)",[s.submission,token]],
  ["select public.rs_finalize_submission($1,40,now()-interval '4 seconds',now()-interval '1 second',4,1,repeat('a',64),$2)",[s.submission,token]]
 ])await assert.rejects(p.service(sql,args),error=>error.code==='42501');
 assert.equal((await p.admin('select state,verification_token from public.rs_submissions where id=$1',[s.submission])).rows[0].verification_token,token);
 await p.admin('update public.rs_submissions set owner_id=$2 where id=$1',[s.submission,A]);await p.service('select public.rs_release_submission($1,$2)',[s.submission,token]);
 assert.equal((await p.admin('select count(*)::int n from ride_private.ranked_speed_claims where submission_id=$1',[s.submission])).rows[0].n,0);
 await assert.rejects(p.as(A,'select * from ride_private.ranked_speed_claims'),/permission denied/);
 for(const name of['rs_claim_submission','rs_release_submission','rs_finalize_submission','rs_reject_submission']){
  const rows=(await p.admin("select n.nspname,has_function_privilege('authenticated',p.oid,'execute') auth,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname=$1 or p.proname=$1||'_pre_ranked_v1'",[name])).rows;
  assert.equal(rows.find(x=>x.nspname==='public').service,true);assert.equal(rows.find(x=>x.nspname==='public').auth,false);assert.equal(rows.find(x=>x.nspname==='ride_private').service,false);
 }
});
test('owned sharing settings remain discoverable and revocable through expired qualification with exact keyset pagination',async()=>{
 const a=await speed(A),b=await speed(A);await publish(A,a.submission);await publish(A,b.submission,'friends');await p.admin('update public.rs_courses set closed_course_approved=false where id=any($1::uuid[])',[[a.course,b.course]]);
 assert.equal((await p.value(A,'select public.rs_ranked_own_records(null,30) value')).items.length,0);
 const first=await p.value(A,'select public.rs_ranked_publications(null,1) value');publicationModel.validateRankedPublicationPage(first,A);assert.equal(first.items.length,1);assert.equal(first.items[0].owner_id,A);assert.equal(first.items[0].revision,1);assert.ok(first.next_cursor);assert.deepEqual(Object.keys(first.items[0]).sort(),['audience','metric','owner_id','record_id','revision','updated_at']);
 const second=await p.value(A,'select public.rs_ranked_publications($1::jsonb,1) value',[JSON.stringify(first.next_cursor)]);publicationModel.validateRankedPublicationPage(second,A,first.next_cursor);assert.equal(second.items.length,1);assert.notEqual(first.items[0].record_id,second.items[0].record_id);assert.equal(second.next_cursor,null);
 await p.admin('insert into public.rs_blocks(blocker_id,blocked_id) values($1,$2)',[A,B]);assert.equal((await p.value(B,'select public.rs_ranked_publications(null,30) value')).items.length,0);
 for(const row of[first.items[0],second.items[0]])assert.equal((await publish(A,row.record_id,'private',row.revision)).result.audience,'private');
 await p.admin('update public.rs_courses set closed_course_approved=true where id=any($1::uuid[])',[[a.course,b.course]]);assert.equal((await page()).items.length,0);assert.equal((await p.value(A,'select public.rs_ranked_publications(null,30) value')).items.every(x=>x.audience==='private'),true);
 assert.equal((await p.value(A,'select public.rs_ranked_publications($1::jsonb,30) value',[JSON.stringify({...first.next_cursor,updated_at:null})])).error.code,'RANKED_INVALID');
});
test('creator source purge removes another owner retained sharing settings and deleting actors cannot enumerate them',async()=>{
 const s=await speed(A);await publish(A,s.submission);await p.admin('update public.rs_challenges set creator_id=$2 where id=$1',[s.challenge,B]);
 const operation=nextRaceId(),job=(await p.service('select public.rs_begin_account_deletion($1,$2) value',[B,operation])).rows[0].value;assert.equal((await p.value(B,'select public.rs_ranked_publications(null,30) value')).error.code,'ACCOUNT_DELETION_PENDING');
 assert.equal((await p.value(A,'select public.rs_ranked_publications(null,30) value')).items.length,1);await p.service('select public.rs_purge_account_data($1,$2,$3)',[B,operation,job.token]);assert.equal((await p.value(A,'select public.rs_ranked_publications(null,30) value')).items.length,0);
});
test('additive migration preserves exact legacy worker bodies and seeds only a real existing verifying lease',async()=>{
 const prior=new PGlite();try{
  await prior.exec('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;');await prior.exec(schema);for(const owner of owners)await prior.query('insert into auth.users values($1)',[owner]);
  const directory=new URL('../migrations/',import.meta.url),files=(await readdir(directory)).filter(x=>x.endsWith('.sql')).sort(),migration=files.find(x=>x.startsWith('202610010010_'));
  // Capture010's real predecessor state, excluding all later additive slices.
  for(const file of files.filter(x=>x<migration))await prior.exec(await readFile(new URL(file,directory),'utf8'));
  const q=ports(prior);await profiles(q);const challenge=nextRaceId(),submission=nextRaceId(),pending=nextRaceId();
  await q.admin("insert into public.rs_challenges(id,creator_id,route_snapshot,category,mode,metric,starts_at,ends_at) values($1,$2,'{}','scooter','group_ride','none',now()-interval '1 hour',now()+interval '1 hour')",[challenge,A]);
  for(const value of[submission,pending])await q.admin("insert into public.rs_submissions(id,owner_id,challenge_id,evidence_path,visibility,state) values($1,$2,$3,$4,'private','queued')",[value,A,challenge,`${A}/${value}.bin`]);
  const token=(await q.service('select public.rs_claim_submission($1,$2) value',[submission,A])).rows[0].value;assert.ok(token);await q.admin('update public.rs_submissions set verification_token=gen_random_uuid() where id=$1',[pending]);
  const names=['rs_claim_submission','rs_release_submission','rs_finalize_submission','rs_reject_submission'],original=(await q.admin("select proname,prosrc from pg_proc where proname=any($1::text[]) order by proname",[names])).rows;
  await prior.exec(await readFile(new URL(migration,directory),'utf8'));const bindings=(await q.admin('select submission_id,verification_token,owner_id from ride_private.ranked_speed_claims')).rows;assert.deepEqual(bindings,[{submission_id:submission,verification_token:token,owner_id:A}]);
  const predecessors=(await q.admin("select replace(proname,'_pre_ranked_v1','') proname,prosrc from pg_proc where proname=any($1::text[]) order by proname",[names.map(x=>`${x}_pre_ranked_v1`)])).rows;assert.deepEqual(predecessors,original);
  await q.service('select public.rs_release_submission($1,$2)',[submission,token]);assert.equal((await q.admin('select count(*)::int n from ride_private.ranked_speed_claims')).rows[0].n,0);
 }finally{await prior.close();}
});
