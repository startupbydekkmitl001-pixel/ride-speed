// Actual PostgreSQL-engine operator statements; Cron/Vault/pg_net are local
// facades. Fake credentials never leave this process, and no HTTP is sent.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialize} from './live-fixture.mjs';

const project='https://mzjmhvwixptrmnaalijt.supabase.co';
const fakeKey='synthetic_service_credential_for_local_test_only_1234567890';
const jobName='ride-community-media-cleanup-v1';
const file=name=>readFile(new URL(`../ops/${name}.sql`,import.meta.url),'utf8');
const facade=`
create schema cron;
create table cron.job(jobid bigserial primary key,jobname text not null,username text not null default current_user,database text not null default current_database(),schedule text not null,command text not null,active boolean not null default true,unique(jobname,username));
create table cron.job_run_details(runid bigserial primary key,jobid bigint not null references cron.job(jobid),status text,start_time timestamptz,end_time timestamptz,return_message text);
create function cron.schedule(job_name text,schedule text,command text) returns bigint language plpgsql as $$declare job_id bigint;begin insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid into job_id;return job_id;end$$;
create function cron.alter_job(job_id bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null) returns void language sql as $$update cron.job j set schedule=coalesce($2,j.schedule),command=coalesce($3,j.command),database=coalesce($4,j.database),username=coalesce($5,j.username),active=coalesce($6,j.active) where j.jobid=$1$$;
create schema vault;
create table vault.secrets(id uuid primary key default gen_random_uuid(),name text,secret text);
create table vault.test_reads(key_reads integer not null default 0);
insert into vault.test_reads values(0);
create function vault.test_decrypt(secret_name text,secret_value text) returns text language plpgsql volatile as $$begin if secret_name='service_role_key' then update vault.test_reads set key_reads=key_reads+1;end if;return secret_value;end$$;
create view vault.decrypted_secrets as select id,name,vault.test_decrypt(name,secret) decrypted_secret from vault.secrets;
create schema net;
create table net.http_request_queue(id bigserial primary key,method text,url text,headers jsonb,body bytea,timeout_milliseconds integer);
create table net._http_response(id bigint primary key,status_code integer,content_type text,headers jsonb,content text,timed_out boolean,error_msg text,created timestamptz default clock_timestamp());
create table net.test_worker(up boolean not null);
insert into net.test_worker values(true);
create function net.check_worker_is_up() returns void language plpgsql as $$begin if not(select up from net.test_worker) then raise exception 'synthetic worker down';end if;end$$;
create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 5000) returns bigint language plpgsql as $$declare request_id bigint;begin insert into net.http_request_queue(method,url,headers,body,timeout_milliseconds) values('POST',$1,$4,convert_to($2::text,'UTF8'),$5) returning id into request_id;return request_id;end$$;
revoke all on schema cron,vault,net from public,anon,authenticated,service_role;
revoke all on all tables in schema cron,vault,net from public,anon,authenticated,service_role;
revoke all on all functions in schema cron,vault,net from public,anon,authenticated,service_role;
revoke all on all sequences in schema cron,vault,net from public,anon,authenticated,service_role;
`;
async function database({extensions=true,secrets=true}={}){
 const db=new PGlite();await initialize(db);
 if(extensions)await db.exec(facade);
 if(extensions&&secrets)await db.query('insert into vault.secrets(name,secret) values($1,$2),($3,$4)',['project_url',project,'service_role_key',fakeKey]);
 return db;
}
async function setup(db){await db.exec(await file('m7-community-cron'));}
async function rejectSetup(db,code){await assert.rejects(setup(db),error=>error.message===code);await db.exec('rollback');}
async function jobs(db){return(await db.query('select * from cron.job order by jobid')).rows;}
async function enqueue(db){return(await db.query('select ride_operator.rs_enqueue_community_cleanup_v1() value')).rows[0].value;}
async function status(db){return(await db.query(await file('m7-community-cron-status'))).rows[0].community_cleanup_status;}

test('read-only preflight is safe with absent extensions and exposes catalog ACL aggregates only',async()=>{
 for(const extensions of[false,true]){
  const db=await database({extensions});try{
   const view=(await db.query(await file('m7-community-cron-preflight'))).rows[0].community_cleanup_preflight;
   assert.equal(view.catalog.community_migration_present,true);assert.equal(view.catalog.http_queue_present,extensions);assert.equal(view.catalog.operator_helper_present,false);assert.equal(view.worker_functions.length,3);
   assert.equal(JSON.stringify(view).includes(fakeKey),false);assert.equal(JSON.stringify(view).includes('decrypted_secret'),false);
   if(extensions){assert.equal((await db.query('select key_reads from vault.test_reads')).rows[0].key_reads,0);assert.equal((await db.query('select count(*)::int n from net.http_request_queue')).rows[0].n,0);}
  }finally{await db.close();}
 }
});

test('Vault follow-up reads only the two required names and counts without decryption',async()=>{
 const db=await database();try{
  await db.query('insert into vault.secrets(name,secret) values($1,$2)',['unrelated_private_name',fakeKey]);
  const view=(await db.query(await file('m7-community-vault-preflight'))).rows[0].community_cleanup_vault_metadata;
  assert.deepEqual(view.required_names,{project_url:1,service_role_key:1});assert.equal(view.each_name_present_once,true);
  assert.equal((await db.query('select key_reads from vault.test_reads')).rows[0].key_reads,0);
  assert.equal(JSON.stringify(view).includes(fakeKey),false);assert.equal(JSON.stringify(view).includes('unrelated_private_name'),false);
 }finally{await db.close();}
});

test('missing extensions and missing Vault metadata fail atomically without a scheduler or product mutation',async()=>{
 const db=await database({extensions:false});try{
  await rejectSetup(db,'COMMUNITY_CRON_EXTENSION_REQUIRED');
  assert.equal((await db.query("select to_regprocedure('ride_operator.rs_enqueue_community_cleanup_v1()') function")).rows[0].function,null);
  assert.equal((await db.query('select enabled from ride_private.race_policy')).rows[0].enabled,false);
 }finally{await db.close();}
 const empty=await database({secrets:false});try{await rejectSetup(empty,'COMMUNITY_CRON_VAULT_REQUIRED');assert.deepEqual(await jobs(empty),[]);}finally{await empty.close();}
});

test('setup reads no service credential, requires exact project origin and refuses unsafe queue or Vault ACLs',async()=>{
 const db=await database();try{
  await db.query("update vault.secrets set secret='https://different-project.supabase.co' where name='project_url'");
  await rejectSetup(db,'COMMUNITY_CRON_PROJECT_MISMATCH');
  assert.equal((await db.query('select key_reads from vault.test_reads')).rows[0].key_reads,0);
  await db.query("update vault.secrets set secret=$1 where name='project_url'",[project]);
  await db.exec('grant usage on schema net to authenticated;grant select on net.http_request_queue to authenticated');
  await rejectSetup(db,'COMMUNITY_CRON_UNSAFE_EXTENSION_ACL');
  await db.exec('revoke select on net.http_request_queue from authenticated;revoke usage on schema net from authenticated;grant select on vault.decrypted_secrets to authenticated');
  await rejectSetup(db,'COMMUNITY_CRON_UNSAFE_EXTENSION_ACL');
 }finally{await db.close();}
});

test('repeat setup reuses only exact reviewed own job and never invokes HTTP or replaces unrelated jobs',async()=>{
 const db=await database();try{
  await db.query("select cron.schedule('unrelated-job','0 0 * * *','select 42')");const unrelated=(await jobs(db))[0];
  await setup(db);const first=(await jobs(db)).find(j=>j.jobname===jobName);
  assert.equal(first.schedule,'* * * * *');assert.equal(first.active,true);assert.ok(!first.command.includes(fakeKey));assert.ok(!first.command.includes('decrypted_secret'));
  await db.query('update cron.job set active=false where jobid=$1',[first.jobid]);await setup(db);
  assert.deepEqual((await jobs(db)).find(j=>j.jobname===jobName),first);assert.deepEqual((await jobs(db)).find(j=>j.jobname==='unrelated-job'),unrelated);
  assert.equal((await db.query('select count(*)::int n from net.http_request_queue')).rows[0].n,0);
  assert.equal((await db.query('select key_reads from vault.test_reads')).rows[0].key_reads,0);
  for(const role of['anon','authenticated','service_role']){
   assert.equal((await db.query("select has_function_privilege($1,'ride_operator.rs_enqueue_community_cleanup_v1()','execute') allowed",[role])).rows[0].allowed,false);
   assert.equal((await db.query("select has_table_privilege($1,'ride_operator.community_cleanup_dispatches_v1','select,insert,update,delete') allowed",[role])).rows[0].allowed,false);
  }
  await db.exec('set role authenticated');await assert.rejects(db.query('select ride_operator.rs_enqueue_community_cleanup_v1()'),e=>e.code==='42501');await db.exec('reset role');
 }finally{await db.close();}
});

test('unknown own command, foreign owner/database and partial operator objects are refused without replacement',async()=>{
 for(const change of["command='select 99'","username='different_operator'","database='different_database'"]){
  const db=await database();try{await setup(db);await db.exec(`update cron.job set ${change} where jobname='${jobName}'`);const before=await jobs(db);await rejectSetup(db,'COMMUNITY_CRON_JOB_REQUIRES_REVIEW');assert.deepEqual(await jobs(db),before);}finally{await db.close();}
 }
 const db=await database();try{await db.exec('create schema ride_operator;create table ride_operator.community_cleanup_dispatches_v1(unreviewed text)');await rejectSetup(db,'COMMUNITY_CRON_OBJECT_REQUIRES_REVIEW');assert.deepEqual(await jobs(db),[]);}finally{await db.close();}
});

test('fixed authenticated HTTP request is bounded and duplicate/unfinished dispatches are suppressed',async()=>{
 const db=await database();try{
  await setup(db);assert.deepEqual(await enqueue(db),{enqueued:true,reason:'queued'});
  const sent=(await db.query('select * from net.http_request_queue')).rows[0];
  assert.equal(sent.url,`${project}/functions/v1/community-media-cleanup`);assert.equal(sent.method,'POST');assert.equal(sent.timeout_milliseconds,55000);assert.equal(Buffer.from(sent.body).toString(),'{}');
  assert.deepEqual(sent.headers,{'Content-Type':'application/json',Authorization:`Bearer ${fakeKey}`});
  assert.deepEqual(await enqueue(db),{enqueued:false,reason:'interval'});
  await db.exec("update ride_operator.community_cleanup_dispatches_v1 set queued_at=clock_timestamp()-interval '4 minutes'");
  assert.deepEqual(await enqueue(db),{enqueued:false,reason:'queue_pending'});
  await db.exec('delete from net.http_request_queue');await db.exec("update ride_operator.community_cleanup_dispatches_v1 set queued_at=clock_timestamp()-interval '2 minutes'");
  assert.deepEqual(await enqueue(db),{enqueued:false,reason:'request_unconfirmed'});
  await db.exec("update ride_operator.community_cleanup_dispatches_v1 set queued_at=clock_timestamp()-interval '4 minutes',queue_absent_at=clock_timestamp()-interval '4 minutes'");assert.equal((await enqueue(db)).enqueued,true);
 }finally{await db.close();}
});

test('runtime Vault/worker/ACL failures enqueue nothing and errors never expose a service token',async()=>{
 const db=await database();try{
  await setup(db);await db.query("update vault.secrets set secret='https://other-project.supabase.co' where name='project_url'");await assert.rejects(enqueue(db),e=>e.message==='COMMUNITY_CRON_PROJECT_MISMATCH');
  await db.query("update vault.secrets set secret=$1 where name='project_url'",[project]);await db.exec('update net.test_worker set up=false');await assert.rejects(enqueue(db),e=>e.message==='COMMUNITY_CRON_WORKER_UNAVAILABLE');await db.exec('update net.test_worker set up=true');
  await db.exec("delete from vault.secrets where name='service_role_key'");await assert.rejects(enqueue(db),e=>e.message==='COMMUNITY_CRON_VAULT_REQUIRED');
  await db.query('insert into vault.secrets(name,secret) values($1,$2)',['service_role_key',`${fakeKey}\nInjected: true`]);await assert.rejects(enqueue(db),e=>e.message==='COMMUNITY_CRON_KEY_INVALID'&&!e.message.includes(fakeKey));
  assert.equal((await db.query('select count(*)::int n from net.http_request_queue')).rows[0].n,0);
 }finally{await db.close();}
});

test('aggregate status distinguishes Cron enqueue from observed HTTP success and never returns request/response secrets',async()=>{
 const db=await database();try{
  await setup(db);await enqueue(db);const sent=(await db.query('select id from net.http_request_queue')).rows[0].id;
  await db.query("insert into cron.job_run_details(jobid,status,start_time,end_time,return_message) select jobid,'succeeded',now(),now(),$1 from cron.job where jobname=$2",[fakeKey,jobName]);
  let view=await status(db);assert.equal(view.dispatch.queued,1);assert.equal(view.dispatch.http_succeeded,0);assert.equal(view.cron.succeeded_runs,1);assert.equal(JSON.stringify(view).includes(fakeKey),false);
  await db.query('insert into net._http_response(id,status_code,content,headers,timed_out) values($1,200,$2,$3::jsonb,false)',[sent,JSON.stringify({removed:2,failed:0,untrusted:fakeKey}),JSON.stringify({Authorization:fakeKey})]);await db.exec('delete from net.http_request_queue');
  view=await status(db);assert.equal(view.dispatch.http_succeeded,1);assert.equal(view.dispatch.worker_acknowledged,0);assert.equal(JSON.stringify(view).includes(fakeKey),false);
  await db.query('update net._http_response set content=$1 where id=$2',[JSON.stringify({removed:2,failed:0}),sent]);view=await status(db);assert.equal(view.dispatch.worker_acknowledged,1);assert.equal(view.dispatch.removed,2);
  await db.query('update net._http_response set status_code=503,content=$1 where id=$2',[JSON.stringify({removed:1,failed:1}),sent]);view=await status(db);assert.equal(view.dispatch.worker_acknowledged,0);assert.equal(view.dispatch.http_failed,1);assert.equal(view.dispatch.failed,1);
  await db.query('update net._http_response set timed_out=true where id=$1',[sent]);view=await status(db);assert.equal(view.dispatch.removed,0);assert.equal(view.dispatch.failed,0);assert.equal(view.dispatch.worker_acknowledged,0);
  await db.query('update net._http_response set timed_out=false,error_msg=$1 where id=$2',['synthetic transport failure',sent]);view=await status(db);assert.equal(view.dispatch.removed,0);assert.equal(view.dispatch.failed,0);
  await db.query('update net._http_response set error_msg=null,status_code=200 where id=$1',[sent]);view=await status(db);assert.equal(view.dispatch.removed,0);assert.equal(view.dispatch.failed,0);assert.equal(view.dispatch.worker_acknowledged,0);
 }finally{await db.close();}
});

test('minute tool retains bounded own seven-day metadata and preserves unrelated histories and pending requests',async()=>{
 const db=await database();try{
  await setup(db);await db.query("select cron.schedule('unrelated-job','0 0 * * *','select 42')");
  await db.exec("insert into cron.job_run_details(jobid,status,start_time,end_time) select j.jobid,'succeeded',now()-interval '8 days',now()-interval '8 days' from cron.job j cross join generate_series(1,1001) where j.jobname='ride-community-media-cleanup-v1';insert into cron.job_run_details(jobid,status,start_time,end_time) select jobid,'succeeded',now()-interval '8 days',now()-interval '8 days' from cron.job where jobname='unrelated-job'");
  await db.exec("insert into ride_operator.community_cleanup_dispatches_v1(request_id,operator_role,database_name,queued_at,queue_absent_at) select 100000+n,current_user,current_database(),now()-interval '8 days',now()-interval '8 days' from generate_series(1,1001)n");
  const job=(await jobs(db)).find(j=>j.jobname===jobName);await db.exec('begin');await db.exec(job.command);await db.exec('commit');
  assert.equal((await db.query("select count(*)::int n from cron.job_run_details d join cron.job j using(jobid) where j.jobname=$1",[jobName])).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from cron.job_run_details d join cron.job j using(jobid) where j.jobname='unrelated-job'")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from ride_operator.community_cleanup_dispatches_v1 where queued_at<now()-interval '7 days'")).rows[0].n,1);
  assert.equal((await db.query('select enabled from ride_private.race_policy')).rows[0].enabled,false);
 }finally{await db.close();}
});

test('reserved metadata/daily caps fail closed without another HTTP enqueue',async()=>{
 const db=await database();try{
  await setup(db);await db.exec("insert into ride_operator.community_cleanup_dispatches_v1(request_id,operator_role,database_name,queued_at,queue_absent_at) select 200000+n,current_user,current_database(),now()-interval '2 days',now()-interval '2 days' from generate_series(1,11000)n");assert.deepEqual(await enqueue(db),{enqueued:false,reason:'capacity'});
  await db.exec("delete from ride_operator.community_cleanup_dispatches_v1;insert into ride_operator.community_cleanup_dispatches_v1(request_id,operator_role,database_name,queued_at,queue_absent_at) select 300000+n,current_user,current_database(),now()-interval '1 hour',now()-interval '1 hour' from generate_series(1,1440)n");assert.deepEqual(await enqueue(db),{enqueued:false,reason:'daily_limit'});
  assert.equal((await db.query('select count(*)::int n from net.http_request_queue')).rows[0].n,0);
 }finally{await db.close();}
});

test('delayed queue consumption starts a fresh conservative unknown-response fence',async()=>{
 const db=await database();try{
  await setup(db);await enqueue(db);
  await db.exec("update ride_operator.community_cleanup_dispatches_v1 set queued_at=clock_timestamp()-interval '8 days'");
  assert.equal((await enqueue(db)).reason,'queue_pending');
  await db.exec('delete from net.http_request_queue');assert.equal((await enqueue(db)).reason,'request_unconfirmed');
  assert.equal((await db.query('select count(*)::int n from ride_operator.community_cleanup_dispatches_v1')).rows[0].n,1);
  const absence=(await db.query('select queue_absent_at from ride_operator.community_cleanup_dispatches_v1')).rows[0].queue_absent_at;assert.ok(Math.abs(Date.now()-Date.parse(absence))<5000);
  assert.equal((await db.query('select count(*)::int n from net.http_request_queue')).rows[0].n,0);
  await db.exec("update ride_operator.community_cleanup_dispatches_v1 set queue_absent_at=clock_timestamp()-interval '4 minutes'");assert.equal((await enqueue(db)).enqueued,true);
 }finally{await db.close();}
});

test('HTTP timeout/error/gateway replies remain unknown until queue-absence grace, canonical worker counts may release it',async()=>{
 const db=await database();try{
  await setup(db);await enqueue(db);const sent=(await db.query('select id from net.http_request_queue')).rows[0].id;
  await db.exec("update ride_operator.community_cleanup_dispatches_v1 set queued_at=clock_timestamp()-interval '4 minutes';delete from net.http_request_queue");
  await db.query('insert into net._http_response(id,status_code,timed_out,error_msg) values($1,null,true,$2)',[sent,'synthetic timeout']);assert.equal((await enqueue(db)).reason,'request_unconfirmed');
  await db.query('update net._http_response set timed_out=false,error_msg=$1 where id=$2',['synthetic transport failure',sent]);assert.equal((await enqueue(db)).reason,'request_unconfirmed');
  await db.query('update net._http_response set status_code=502,timed_out=false,error_msg=null,content=$1 where id=$2',['upstream gateway timeout',sent]);assert.equal((await enqueue(db)).reason,'request_unconfirmed');
  await db.query('update net._http_response set status_code=200,content=$1 where id=$2',[JSON.stringify({removed:0,failed:0,untrusted:fakeKey}),sent]);assert.equal((await enqueue(db)).reason,'request_unconfirmed');
  await db.query('update net._http_response set content=$1 where id=$2',[JSON.stringify({removed:0,failed:0}),sent]);assert.equal((await enqueue(db)).enqueued,true);
 }finally{await db.close();}
});

test('extension failure after local queue write is rolled back and replaced by a fixed secret-free error',async()=>{
 const db=await database();try{
  await setup(db);await db.exec(`create or replace function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 5000) returns bigint language plpgsql as $$begin insert into net.http_request_queue(method,url,headers,body,timeout_milliseconds) values('POST',$1,$4,convert_to($2::text,'UTF8'),$5);raise exception 'unsafe request %',$4;end$$`);
  await assert.rejects(enqueue(db),e=>e.message==='COMMUNITY_CRON_DISPATCH_UNAVAILABLE'&&!JSON.stringify({message:e.message,detail:e.detail,where:e.where,internalQuery:e.internalQuery}).includes(fakeKey));
  assert.equal((await db.query('select count(*)::int n from net.http_request_queue')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from ride_operator.community_cleanup_dispatches_v1')).rows[0].n,0);
 }finally{await db.close();}
});
