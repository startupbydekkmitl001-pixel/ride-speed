import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createLegacyInternalAs } from './legacy-internal.mjs';

let db;
const legacyInternalAs=createLegacyInternalAs(()=>db);
const A='00000000-0000-4000-8000-000000000011', B='00000000-0000-4000-8000-000000000012', C='00000000-0000-4000-8000-000000000013';
const D='00000000-0000-4000-8000-000000000014';
const U='10000000-0000-4000-8000-000000000011', V='10000000-0000-4000-8000-000000000012';
const R='20000000-0000-4000-8000-000000000011';
async function as(uid, sql, args=[]) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  await db.exec('set role authenticated');
  try { return await db.query(sql,args); } finally { await db.exec('reset role'); }
}
async function service(sql,args=[]) {
  await db.exec('reset role; set role service_role');
  try { return await db.query(sql,args); } finally { await db.exec('reset role'); }
}
async function admin(sql,args=[]) { await db.exec('reset role'); return db.query(sql,args); }
const result = query => query.rows[0].value;

before(async()=> {
  db=new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon,service_role; grant execute on function auth.uid() to public;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);
    alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon,service_role; grant all on storage.objects to authenticated,service_role;
    create schema realtime; create table realtime.messages(topic text,extension text,payload jsonb);
    alter table realtime.messages enable row level security; grant usage on schema realtime to authenticated,service_role; grant select,insert on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
    create function realtime.send(payload jsonb,event text,topic text,is_private boolean default true) returns void language sql as $$insert into realtime.messages(topic,extension,payload) values(topic,'broadcast',payload)$$;
    insert into auth.users values('${A}'),('${B}'),('${C}'),('${D}');
  `);
  const migrations=new URL('../migrations/',import.meta.url);
  const files=(await readdir(migrations)).filter(file=>file.endsWith('.sql')).sort();
  for(const file of files) {
    await db.exec(await readFile(new URL(file,migrations),'utf8'));
    if(file==='202609300001_online_foundation.sql') {
      await as(A,"select public.rs_upsert_profile('existing_a','Existing A')");
      await as(B,"select public.rs_upsert_profile('existing_b','Existing B')");
      await legacyInternalAs(B,'select public.rs_set_presence(true)');
    }
  }
});
after(async()=>{await db?.close();});

test('migration completes established profiles but a new account has separate private onboarding',async()=> {
  assert.equal(result(await as(A,'select public.rs_get_account_state() as value')).onboarding_step,'complete');
  assert.equal(result(await as(B,'select public.rs_get_account_state() as value')).preferences.ghost_mode,false,'existing explicit presence consent is retained');
  const fresh=result(await as(C,'select public.rs_get_account_state() as value'));
  assert.equal(fresh.onboarding_step,'language'); assert.equal(fresh.revision,0);
  assert.deepEqual(fresh.preferences,{ghost_mode:true,route_audience:'friends',notifications_enabled:false});
  assert.equal((await as(B,'select * from public.rs_account_state where user_id=$1',[A])).rows.length,0);
  await assert.rejects(as(B,"update public.rs_account_state set onboarding_step='complete' where user_id=$1",[A]),/permission denied/i);
  await as(C,"select public.rs_upsert_profile('new_c','New C')");
  assert.equal(result(await as(C,'select public.rs_get_account_state() as value')).onboarding_step,'language');
  assert.equal(result(await as(D,"select public.rs_update_account_state(0,'complete','denied','{}') as value")).onboarding_step,'complete');
  assert.equal((await admin('select * from public.rs_profiles where user_id=$1',[D])).rows.length,0,'skipping profile never invents one');
  await assert.rejects(as(D,"select public.rs_reserve_avatar($1,'image/jpeg')",[V]),/AVATAR_PROFILE_REQUIRED/);
});

test('account state uses optimistic revisions and a bounded preferences whitelist',async()=> {
  const saved=result(await as(C,"select public.rs_update_account_state(0,'complete','denied',$1::jsonb) as value",[JSON.stringify({ghost_mode:true,route_audience:'private',notifications_enabled:false})]));
  assert.equal(saved.revision,1); assert.equal(saved.location_choice,'denied');
  assert.equal(saved.preferences.route_audience,'private');
  await assert.rejects(as(C,"select public.rs_update_account_state(0,'profile','unknown','{}')"),/ACCOUNT_STATE_CONFLICT/);
  await assert.rejects(as(C,"select public.rs_update_account_state(1,'complete','denied','{\"admin\":true}')"),/ACCOUNT_STATE_INVALID/);
  await assert.rejects(as(C,"select public.rs_update_account_state(1,'complete','denied','{\"ghost_mode\":\"false\"}')"),/ACCOUNT_STATE_INVALID/);
  await assert.rejects(as(C,"select public.rs_upsert_profile('existing_a','Impersonator')"),/unique constraint/i);
});

test('ghost mode revokes server presence and explicit legacy consent synchronizes the preference',async()=> {
  await legacyInternalAs(A,"select public.rs_request_friend('existing_b')");
  await legacyInternalAs(B,"select public.rs_friend_action($1,'accept')",[A]);
  await legacyInternalAs(A,'select public.rs_set_presence(true)');
  await as(A,'select public.rs_heartbeat()');
  const state=result(await as(A,'select public.rs_get_account_state() as value'));
  assert.equal(state.preferences.ghost_mode,false);
  const previous=(await as(B,'select * from public.rs_friend_presence()')).rows[0];
  assert.equal(previous.online,true);
  const next=result(await as(A,"select public.rs_update_account_state($1,'complete','unknown','{\"ghost_mode\":true}') as value",[state.revision]));
  assert.equal(next.revision,state.revision+1);
  const privatePresence=(await as(B,'select * from public.rs_friend_presence()')).rows[0];
  assert.equal(privatePresence.online,false); assert.notEqual(privatePresence.topic,previous.topic);
  await assert.rejects(as(A,'select public.rs_heartbeat()'),/Presence is disabled/);
  const visible=result(await as(A,"select public.rs_update_account_state($1,'complete','unknown','{\"ghost_mode\":false}') as value",[next.revision]));
  assert.equal(visible.revision,next.revision+1);
  await as(A,'select public.rs_heartbeat()');
  assert.equal((await as(B,'select * from public.rs_friend_presence()')).rows[0].online,true);
  await legacyInternalAs(A,'select public.rs_set_presence(true)');
  assert.equal(result(await as(A,'select public.rs_get_account_state() as value')).preferences.ghost_mode,false);
});

test('avatar reservations bind UUID, MIME and owner; arbitrary or overwritten paths cannot commit',async()=> {
  const reserved=result(await as(A,"select public.rs_reserve_avatar($1,'image/jpeg') as value",[U]));
  assert.equal(reserved.path,`${A}/${U}.jpg`); assert.equal(reserved.bucket,'ride-avatars');
  assert.equal(result(await as(A,"select public.rs_reserve_avatar($1,'image/jpeg') as value",[U])).path,reserved.path);
  await assert.rejects(as(B,"select public.rs_reserve_avatar($1,'image/jpeg')",[U]),/AVATAR_UNAVAILABLE/);
  await assert.rejects(as(A,"select public.rs_reserve_avatar($1,'image/png')",[U]),/AVATAR_UNAVAILABLE/);
  await assert.rejects(as(A,'select public.rs_commit_avatar($1,0)',[U]),/AVATAR_UPLOAD_REQUIRED/);
  await assert.rejects(as(B,"insert into storage.objects(bucket_id,name,metadata) values('ride-avatars',$1,'{\"size\":80,\"mimetype\":\"image/jpeg\"}')",[reserved.path]),/row-level security/i);
  await assert.rejects(as(A,"insert into storage.objects(bucket_id,name) values('ride-avatars',$1)",[`${A}/unreserved.jpg`]),/row-level security/i);
  await as(A,"insert into storage.objects(bucket_id,name,metadata) values('ride-avatars',$1,'{\"size\":80,\"mimetype\":\"image/jpeg\"}')",[reserved.path]);
  assert.equal((await as(A,'select * from storage.objects where name=$1',[reserved.path])).rows.length,1);
  const committed=result(await as(A,'select public.rs_commit_avatar($1,0) as value',[U]));
  assert.equal(committed.avatar_id,U); assert.equal(committed.revision,1);
  assert.equal((await as(B,"select * from storage.objects where bucket_id='ride-avatars' and name=$1",[reserved.path])).rows.length,0,'friend avatars still require the authorized signer');
  assert.equal(result(await as(A,'select public.rs_commit_avatar($1,0) as value',[U])).revision,1);
  assert.deepEqual((await as(A,"update storage.objects set metadata='{}' where name=$1 returning *",[reserved.path])).rows,[]);
  assert.equal((await as(A,'select metadata from storage.objects where name=$1',[reserved.path])).rows[0].metadata.size,80);
});

test('avatar visibility follows friendship and replacement checks actual private object size',async()=> {
  assert.equal(result(await as(C,'select public.rs_avatar_for_view($1) as value',[A])),null);
  await legacyInternalAs(A,"select public.rs_request_friend('existing_b')");
  await legacyInternalAs(B,"select public.rs_friend_action($1,'accept')",[A]);
  assert.equal(result(await as(B,'select public.rs_avatar_for_view($1) as value',[A])).avatar_id,U);
  await legacyInternalAs(B,"select public.rs_friend_action($1,'block')",[A]);
  assert.equal(result(await as(B,'select public.rs_avatar_for_view($1) as value',[A])),null);
  const reserved=result(await as(A,"select public.rs_reserve_avatar($1,'image/png') as value",[V]));
  await as(A,"insert into storage.objects(bucket_id,name,metadata) values('ride-avatars',$1,'{\"size\":1048577,\"mimetype\":\"image/png\"}')",[reserved.path]);
  await assert.rejects(as(A,'select public.rs_commit_avatar($1,1)',[V]),/AVATAR_INVALID_OBJECT/);
  await admin("update storage.objects set metadata='{\"size\":99,\"mimetype\":\"image/png\"}' where name=$1",[reserved.path]);
  await assert.rejects(as(A,'select public.rs_commit_avatar($1,0)',[V]),/AVATAR_REVISION_CONFLICT/);
  await as(A,'select public.rs_commit_avatar($1,1)',[V]);
  const garbage=result(await service('select public.rs_avatar_cleanup_objects($1) as value',[A]));
  assert.equal(garbage.some(item=>item.path===`${A}/${U}.jpg`),true);
  assert.equal(garbage.some(item=>item.path===`${A}/${V}.png`),false);
});

test('new lifecycle tables and worker functions preserve RLS, fixed paths and server-only grants',async()=> {
  for(const name of ['rs_begin_account_deletion(uuid,uuid)','rs_account_deletion_objects(uuid,uuid,uuid)','rs_purge_account_data(uuid,uuid,uuid)','rs_release_account_deletion(uuid,uuid,uuid,text)','rs_avatar_cleanup_objects(uuid)','rs_completed_account_deletion(uuid,uuid)']) {
    assert.equal((await admin("select has_function_privilege('authenticated',$1,'execute') as allowed",[`public.${name}`])).rows[0].allowed,false);
    assert.equal((await admin("select has_function_privilege('service_role',$1,'execute') as allowed",[`public.${name}`])).rows[0].allowed,true);
  }
  const unsafe=await admin("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='ride_private' or (n.nspname='public' and p.proname like 'rs_%')) and p.prosecdef and not coalesce(p.proconfig,array[]::text[]) @> array['search_path=\"\"']");
  assert.deepEqual(unsafe.rows,[]);
  for(const name of ['rs_account_state','rs_avatar_uploads','rs_profile_avatars']) {
    assert.equal((await admin('select relrowsecurity from pg_class where relname=$1',[name])).rows[0].relrowsecurity,true);
    await assert.rejects(as(C,`insert into public.${name} default values`),/permission denied/i);
  }
});

test('deletion quarantines the caller and fences in-flight verifier work while preserving unrelated accounts',async()=> {
  await as(C,"select public.rs_upsert_profile('new_c','New C')");
  const course='30000000-0000-4000-8000-000000000011', session='40000000-0000-4000-8000-000000000011';
  const challenge='50000000-0000-4000-8000-000000000011', unrelated='50000000-0000-4000-8000-000000000012';
  const submission='60000000-0000-4000-8000-000000000011', other='60000000-0000-4000-8000-000000000012';
  await admin("insert into public.rs_courses(id,name,closed_course_approved) values($1,'Local test only',true)",[course]);
  await admin("insert into public.rs_course_sessions values($1,$2,now()-interval '1 day',now()+interval '1 hour',true)",[session,course]);
  for(const [id,creator] of [[challenge,A],[unrelated,C]]) await admin("insert into public.rs_challenges(id,creator_id,route_snapshot,category,mode,metric,course_session_id,starts_at,ends_at) values($1,$2,'{}','car','timed_race','sustained_speed_3s',$3,now()-interval '1 hour',now()+interval '1 hour')",[id,creator,session]);
  for(const [id,cid] of [[submission,challenge],[other,unrelated]]) {
    await admin("insert into public.rs_submissions(id,owner_id,challenge_id,evidence_path,visibility,state,verification_token) values($1,$2,$3,$4,'community','verifying',gen_random_uuid())",[id,B,cid,`${B}/${id}/samples.bin`]);
    await admin("insert into storage.objects(bucket_id,name,owner_id) values('ride-evidence',$1,$2)",[`${B}/${id}/samples.bin`,B]);
  }
  const staleToken=(await admin('select verification_token from public.rs_submissions where id=$1',[submission])).rows[0].verification_token;
  // A second other-owner record exercises the non-cascading record/challenge FK.
  const verified='60000000-0000-4000-8000-000000000013';
  await admin("insert into public.rs_submissions(id,owner_id,challenge_id,evidence_path,visibility,state) values($1,$2,$3,$4,'friends','verified')",[verified,B,challenge,`${B}/${verified}/samples.bin`]);
  await admin("insert into public.rs_verified_records(submission_id,owner_id,challenge_id,course_id,category,sustained_kmh,window_start,window_end,method,sample_count,maximum_gap_seconds,evidence_sha256) values($1,$2,$3,$4,'car',36,now()-interval '4 seconds',now()-interval '1 second','sustained_min_3s_v1',4,1,repeat('a',64))",[verified,B,challenge,course]);
  await admin("insert into storage.objects(bucket_id,name,owner_id) values('ride-evidence',$1,$2)",[`${B}/${verified}/samples.bin`,B]);
  await admin("insert into storage.objects(bucket_id,name,owner_id) values('ride-community',$1,$2)",[`${A}/orphan/no-post.jpg`,A]);
  const job=result(await service('select public.rs_begin_account_deletion($1,$2) as value',[A,R]));
  assert.equal(job.request_id,R); assert.ok(job.token);
  assert.equal(result(await service('select public.rs_completed_account_deletion($1,$2) as value',[A,R])),false);
  await assert.rejects(service('select public.rs_begin_account_deletion($1,$2)',[A,R]),/DELETION_IN_PROGRESS/);
  await assert.rejects(as(A,"select public.rs_upsert_profile('existing_a','Reopened')"),/ACCOUNT_DELETION_PENDING/);
  await assert.rejects(as(A,"insert into storage.objects(bucket_id,name) values('ride-community',$1)",[`${A}/orphan/new.jpg`]),/row-level security/i);
  const objects=result(await service('select public.rs_account_deletion_objects($1,$2,$3) as value',[A,R,job.token]));
  assert.equal(objects.some(item=>item.path===`${B}/${submission}/samples.bin`),true);
  assert.equal(objects.some(item=>item.path===`${B}/${other}/samples.bin`),false);
  assert.equal((await admin('select state,verification_token from public.rs_submissions where id=$1',[submission])).rows[0].state,'rejected');
  assert.equal(result(await service('select public.rs_claim_submission($1,$2) as value',[submission,B])),null);
  await assert.rejects(service("select public.rs_finalize_submission($1,36,now()-interval '4 seconds',now()-interval '1 second',4,1,repeat('a',64),$2)",[submission,staleToken]),error=>error.code==='42501');
  assert.equal((await admin('select * from public.rs_verified_records where submission_id=$1',[verified])).rows.length,0);
  await assert.rejects(service('select public.rs_purge_account_data($1,$2,$3)',[A,R,job.token]),/DELETION_ASSETS_REMAIN/);
  await service("select public.rs_release_account_deletion($1,$2,$3,'DELETION_STORAGE_FAILED')",[A,R,job.token]);
  const retry=result(await service('select public.rs_begin_account_deletion($1,$2) as value',[A,R]));
  assert.notEqual(retry.token,job.token);
  await assert.rejects(service('select public.rs_purge_account_data($1,$2,$3)',[A,R,job.token]),/DELETION_LEASE_LOST/);
  for(const object of objects) await admin('delete from storage.objects where bucket_id=$1 and name=$2',[object.bucket,object.path]);
  await service('select public.rs_purge_account_data($1,$2,$3)',[A,R,retry.token]);
  assert.equal((await admin('select * from public.rs_submissions where id=$1',[submission])).rows.length,0);
  assert.equal((await admin('select * from public.rs_challenges where id=$1',[challenge])).rows.length,0);
  assert.equal((await admin('select * from public.rs_submissions where id=$1',[other])).rows.length,1);
  assert.equal((await admin('select * from auth.users where id=$1',[A])).rows.length,1,'Auth removal only follows successful Storage/purge phase');
  await service("select public.rs_release_account_deletion($1,$2,$3,'DELETION_AUTH_FAILED')",[A,R,retry.token]);
  const authRetry=result(await service('select public.rs_begin_account_deletion($1,$2) as value',[A,R]));
  assert.equal(authRetry.state,'auth_pending');
  await service('select public.rs_purge_account_data($1,$2,$3)',[A,R,authRetry.token]);
  await admin('delete from auth.users where id=$1',[A]);
  const finished=result(await service('select public.rs_begin_account_deletion($1,$2) as value',[A,R]));
  assert.equal(finished.state,'deleted');
  assert.equal(result(await service('select public.rs_completed_account_deletion($1,$2) as value',[A,R])),true);
  assert.equal(result(await service('select public.rs_completed_account_deletion($1,$2) as value',[B,R])),false);
  assert.equal(result(await service('select public.rs_completed_account_deletion($1,$2) as value',[A,U])),false);
  assert.equal((await admin('select * from public.rs_profiles where user_id=$1',[B])).rows.length,1);
});
