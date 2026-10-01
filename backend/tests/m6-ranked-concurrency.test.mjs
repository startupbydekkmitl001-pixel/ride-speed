// Disposable17.11 loopback only. Never accepts production URLs or credentials.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {initialize,ports,profiles,friends,A,B,C,D,E,request} from './live-fixture.mjs';
import {createRace,reserveRaceAttempt,armRaceAttempt,completedRaceEvidence,nextRaceId} from './race-fixture.mjs';
let settings;try{settings=JSON.parse(await readFile(new URL('../../build/local-postgres/readiness.json',import.meta.url),'utf8'));}catch{}
const available=!!settings,connections=[];let admin,db,p,dbname,fixture;
async function connect(database,name){const c=new Client({host:'127.0.0.1',port:settings.port,user:'ride_test_admin',database,application_name:name,ssl:false,connectionTimeoutMillis:5000});await c.connect();c.exec=sql=>c.query(sql);await c.query("set timezone='UTC';set lock_timeout='3s';set statement_timeout='6s'");connections.push(c);return c;}
async function actor(owner,name){const c=await connect(dbname,name);await c.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await c.query('set role authenticated');return c;}
const value=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0].value;
const settle=promise=>promise.then(value=>({value}),error=>({error}));
async function waitBlocked(c){for(let n=0;n<100;n++){if((await db.query('select wait_event from pg_stat_activity where pid=$1',[c.processID])).rows[0]?.wait_event==='advisory')return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Ranked RPC did not reach its advisory fence');}
async function waitLegacyLock(c){for(let n=0;n<100;n++){const event=(await db.query('select wait_event from pg_stat_activity where pid=$1',[c.processID])).rows[0]?.wait_event;if(event==='advisory'||event==='transactionid')return event;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Legacy worker did not reach its lock wait');}
before(async()=>{
 if(!available)return;assert.equal(settings.host,'127.0.0.1');assert.equal(settings.user,'ride_test_admin');assert.equal(settings.version,'17.11');assert.ok(Number.isInteger(settings.port)&&settings.port>1024&&settings.port<65536);
 admin=await connect('postgres','ranked-bootstrap');dbname=`ride_ranked_m6_${process.pid}_${Date.now()}`;assert.match(dbname,/^ride_ranked_m6_[0-9]+_[0-9]+$/);await admin.query(`create database ${dbname}`);db=await connect(dbname,'ranked-controller');
 await db.query("do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;end$$");
 await initialize(db,{roles:false});p=ports(db);await profiles(p);const f=await createRace(p,{owner:B,peer:A}),a=await reserveRaceAttempt(p,f),armed=await armRaceAttempt(p,f,a),done=await completedRaceEvidence(p,f,a,armed);await p.service('select public.rs_finalize_race_attempt($1,$2,$3::jsonb)',[a.attemptId,done.claim.token,JSON.stringify(done.result)]);await p.service("select public.rs_set_ranked_course($1,'async','Disposable reviewed track',true)",[f.approvalId]);fixture={f,a};
});
after(async()=>{if(!available)return;for(const c of connections.filter(x=>x!==admin))await c.end();if(dbname)await admin.query(`drop database ${dbname}`);await admin.end();});
test('realPG concurrent publication CAS applies one immutable audience and stale second intent cannot win',{skip:!available},async()=>{
 const first=await actor(B,'ranked-publish-first'),second=await actor(B,'ranked-publish-waiter'),op=nextRaceId(),body=request('publication_set',{metric:'route_time',record_id:fixture.a.attemptId,expected_revision:0,audience:'global'});
 await first.query('begin');const ack=await value(first,'select public.rs_ranked_mutate($1,$2::jsonb) value',[op,JSON.stringify(body)]);assert.equal(ack.result.revision,1);
 const pending=settle(value(second,'select public.rs_ranked_mutate($1,$2::jsonb) value',[nextRaceId(),JSON.stringify({...body,audience:'private'})]));await waitBlocked(second);await first.query('commit');const out=await pending;assert.equal(out.error,undefined);assert.equal(out.value.error.code,'RANKED_PUBLICATION_CHANGED');assert.deepEqual(await value(second,'select public.rs_ranked_mutate($1,$2::jsonb) value',[op,JSON.stringify(body)]),ack);
});
test('realPG opposite-owner block commits before waiting ranked page and no formerly public peer row survives',{skip:!available},async()=>{
 const blocker=await actor(B,'ranked-block-first'),reader=await actor(A,'ranked-reader-waiter');await blocker.query('begin');const block=request('friend_action',{other_id:A,verb:'block',expected_generation:10});const ack=await value(blocker,'select public.rs_social_mutate($1,$2::jsonb) value',[nextRaceId(),JSON.stringify(block)]);assert.equal(ack.error,undefined);
 const filter={schema_version:1,period:'today',metric:'route_time',category:'scooter',class_key:'all',scope:'global',course:{approval_id:fixture.f.approvalId,config_hash:fixture.f.approved.config_hash,mode:'async'}};
 const pending=settle(value(reader,'select public.rs_ranked_page($1::jsonb,null,30) value',[JSON.stringify(filter)]));await waitBlocked(reader);await blocker.query('commit');const out=await pending;assert.equal(out.error,undefined);assert.equal(out.value.error,undefined);assert.equal(out.value.items.length,0);assert.equal(out.value.podium.length,0);
});
async function legacySubmission(owner,creator,state='queued'){
 const course=nextRaceId(),session=nextRaceId(),challenge=nextRaceId(),submission=nextRaceId(),end=new Date(Date.now()-10000).toISOString();await friends(p,owner,creator);
 await db.query("insert into public.rs_courses(id,name,closed_course_approved) values($1,'Disposable speed course',true)",[course]);
 await db.query("insert into public.rs_course_sessions(id,course_id,starts_at,ends_at,approved) values($1,$2,$3::timestamptz-interval '1 hour',$3::timestamptz+interval '1 hour',true)",[session,course,end]);
 await db.query("insert into public.rs_challenges(id,creator_id,route_snapshot,category,mode,metric,course_session_id,starts_at,ends_at) values($1,$2,'{}','scooter','timed_race','sustained_speed_3s',$3,$4::timestamptz-interval '1 hour',$4::timestamptz+interval '1 hour')",[challenge,creator,session,end]);
 await db.query("insert into public.rs_challenge_members(challenge_id,user_id,state,friendship_generation) values($1,$2,'accepted',10)",[challenge,owner]);
 await db.query('insert into public.rs_submissions(id,owner_id,challenge_id,evidence_path,visibility,state) values($1,$2,$3,$4,\'private\',$5)',[submission,owner,challenge,`${owner}/${submission}.bin`,state]);return{submission,challenge,end};
}
test('realPG legacy worker enters account-global fence before submission row and cannot deadlock creator deletion',{skip:!available},async()=>{
 const s=await legacySubmission(D,C),token=(await p.service('select public.rs_claim_submission($1,$2) value',[s.submission,D])).rows[0].value;
 const deleting=await connect(dbname,'ranked-legacy-deleting'),worker=await connect(dbname,'ranked-legacy-finalizing');await worker.query('set role service_role');let pending;
 await deleting.query('begin');try{
  await deleting.query('select ride_private.account_lock($1),ride_private.live_control_lock()',[C]);await deleting.query("update public.rs_challenges set state='cancelled' where id=$1",[s.challenge]);
  pending=settle(worker.query("select public.rs_finalize_submission($1,40,$2::timestamptz-interval '3 seconds',$2,4,1,$3,$4)",[s.submission,s.end,'a'.repeat(64),token]));
  const waiting=await waitLegacyLock(worker),deletion=await settle(deleting.query('select public.rs_begin_account_deletion($1,$2)',[C,nextRaceId()]));await deleting.query(deletion.error?'rollback':'commit');const out=await pending;assert.notEqual(deletion.error?.code,'40P01');assert.ok(out.error);assert.notEqual(out.error.code,'40P01');assert.equal(waiting,'advisory');assert.equal((await db.query('select count(*)::int n from public.rs_verified_records where submission_id=$1',[s.submission])).rows[0].n,0);
 }finally{await deleting.query('rollback');if(pending)await pending;}
});
test('realPG owner reassignment while claim waits cannot follow a stale owner into a new account',{skip:!available},async()=>{
 const s=await legacySubmission(D,E),fence=await connect(dbname,'ranked-legacy-owner-fence'),worker=await connect(dbname,'ranked-legacy-claim-waiter');await worker.query('set role service_role');let pending;await fence.query('begin');try{
  await fence.query('select ride_private.account_lock($1),ride_private.live_control_lock()',[D]);pending=settle(worker.query('select public.rs_claim_submission($1,$2)',[s.submission,D]));await waitBlocked(worker);
  await fence.query('update public.rs_submissions set owner_id=$2 where id=$1',[s.submission,E]);await fence.query('commit');const out=await pending;assert.equal(out.error?.code,'42501');const row=(await db.query('select state,verification_token from public.rs_submissions where id=$1',[s.submission])).rows[0];assert.deepEqual(row,{state:'queued',verification_token:null});
 }finally{await fence.query('rollback');if(pending)await pending;}
});
