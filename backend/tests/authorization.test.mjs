import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createLegacyInternalAs } from './legacy-internal.mjs';

let db;
const legacyInternalAs=createLegacyInternalAs(()=>db);
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const C = '00000000-0000-4000-8000-000000000003';
async function as(uid, query, params = []) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec('set role authenticated');
  try { return await db.query(query, params); } finally { await db.exec('reset role'); }
}
async function admin(query, params = []) { await db.exec('reset role'); return db.query(query, params); }

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated, anon, service_role; grant execute on function auth.uid() to public;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text,name text,owner_id text,metadata jsonb);
    alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon,service_role; grant all on storage.objects to authenticated,service_role;
    create schema realtime; create table realtime.messages(topic text,extension text,payload jsonb);
    alter table realtime.messages enable row level security; grant usage on schema realtime to authenticated,service_role; grant select,insert on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
    create function realtime.send(payload jsonb,event text,topic text,is_private boolean default true) returns void language sql as $$insert into realtime.messages(topic,extension,payload) values(topic,'broadcast',payload)$$;
    insert into auth.users values ('${A}'),('${B}'),('${C}');
  `);
  // These stubs exercise real PostgreSQL grants/RLS, not a Supabase network service.
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, migrations), 'utf8'));
  }
});
after(async () => { await db?.close(); });

test('profile data is private, sender cannot accept their own friend request, and duplicate requests stay single', async () => {
  await as(A, `select public.rs_upsert_profile('arnalxz','Arnalxz')`);
  await as(B, `select public.rs_upsert_profile('mint_ride','Mint')`);
  await as(C, `select public.rs_upsert_profile('stranger','Stranger')`);
  assert.equal((await as(C, 'select * from public.rs_profiles where user_id=$1', [A])).rows.length, 0);
  await legacyInternalAs(A,`select public.rs_request_friend('mint_ride')`);
  await legacyInternalAs(A,`select public.rs_request_friend('mint_ride')`);
  assert.equal((await admin('select * from public.rs_friendships')).rows.length, 1);
  await assert.rejects(legacyInternalAs(A,`select public.rs_friend_action($1,'accept')`, [B]), /recipient|permission|incoming/i);
  await legacyInternalAs(B,`select public.rs_friend_action($1,'accept')`, [A]);
  assert.equal((await as(B, 'select * from public.rs_profiles where user_id=$1', [A])).rows.length, 1);
});

test('browser roles cannot approve their own speed or directly mutate protected relationships', async () => {
  await assert.rejects(as(A, `update public.rs_friendships set state='accepted'`), /permission denied/i);
  await assert.rejects(as(A, `insert into public.rs_verified_records (submission_id,owner_id,challenge_id,course_id,category,sustained_kmh,window_start,window_end,method) values(gen_random_uuid(),$1,gen_random_uuid(),gen_random_uuid(),'motorcycle',300,now()-interval '3 seconds',now(),'sustained_min_3s_v1')`, [A]), /permission denied/i);
  await assert.rejects(as(A, `select public.rs_finalize_submission(gen_random_uuid(),90,now()-interval '3 seconds',now(),4,1.0,'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')`), /permission denied/i);
});

test('pending client submissions cannot create leaderboard entries', async () => {
  const ranks = await legacyInternalAs(A, `select * from public.rs_leaderboard('today','motorcycle','community',null)`);
  assert.deepEqual(ranks.rows, []);
});

const routeId = '10000000-0000-4000-8000-000000000001';
const challengeId = '20000000-0000-4000-8000-000000000001';
const postId = '30000000-0000-4000-8000-000000000001';
const stops = [{label:'Start',lat:13.70,lng:100.50},{label:'Finish',lat:13.71,lng:100.51}];

test('saved-route revisions protect edits; explicit shares and challenge snapshots expose only intended data', async () => {
  await as(A, `select public.rs_save_route($1,0,'Weekend','motorcycle',$2::jsonb)`, [routeId, JSON.stringify(stops)]);
  assert.equal((await as(C, 'select * from public.rs_routes')).rows.length, 0);
  await as(A, 'select public.rs_share_route($1,$2,true)', [routeId,B]);
  assert.equal((await as(B, 'select * from public.rs_routes')).rows.length, 1);
  await assert.rejects(as(B, `select public.rs_save_route($1,1,'Stolen','motorcycle',$2::jsonb)`, [routeId,JSON.stringify(stops)]), /unavailable|conflict/i);
  await legacyInternalAs(A,`select public.rs_create_challenge($1,$2,1,'group_ride',null,now()+interval '1 hour',now()+interval '2 hours')`, [challengeId,routeId]);
  await legacyInternalAs(A,`select public.rs_invite_challenge($1,$2)`, [challengeId,B]);
  await assert.rejects(legacyInternalAs(C,`select public.rs_challenge_action($1,'accept')`, [challengeId]), /unavailable|invitation/i);
  await legacyInternalAs(B,`select public.rs_challenge_action($1,'accept')`, [challengeId]);
  await as(A, `select public.rs_save_route($1,1,'Changed later','motorcycle',$2::jsonb)`, [routeId,JSON.stringify(stops)]);
  const snapshot = (await as(B, 'select route_snapshot from public.rs_challenges where id=$1',[challengeId])).rows[0].route_snapshot;
  assert.equal(snapshot.title,'Weekend'); assert.equal(snapshot.revision,1);
  await assert.rejects(legacyInternalAs(A,`select public.rs_create_challenge(gen_random_uuid(),$1,2,'timed_race',gen_random_uuid(),now()+interval '1 hour',now()+interval '2 hours')`,[routeId]), /closed-course/i);
});

test('posts require explicit audience, all supplied speeds remain self-reported, private media cannot be signed by arbitrary readers', async () => {
  await as(A,'select public.rs_create_post($1)',[postId]);
  await as(A,`select public.rs_publish_post($1,'Hello','Ride note',88,null,null,'friends',null)`,[postId]);
  assert.equal((await as(B,'select * from public.rs_posts')).rows.length,1);
  assert.equal((await as(C,'select * from public.rs_posts')).rows.length,0);
  await as(A,`select public.rs_publish_post($1,'Hello','Ride note',88,null,null,'community',null)`,[postId]);
  const feed = await as(C,'select * from public.rs_feed(30,null)');
  assert.equal(feed.rows[0].speed_status,'self_reported');
  assert.deepEqual((await legacyInternalAs(C, `select * from public.rs_leaderboard('today','motorcycle','community',null)`)).rows,[]);
  await assert.rejects(as(C,'select public.rs_moderate_post($1,true)',[postId]),/permission denied/i);
  await as(C,`select public.rs_report_post($1,'privacy','Please review')`,[postId]);
  assert.equal((await as(B,'select * from public.rs_post_reports')).rows.length,0);
  await assert.rejects(as(A,`select public.rs_publish_post($1,'Hello','Ride note',88,$2,1,'community',null)`,[postId,routeId]),/revision changed/i);
  await as(A,`select public.rs_publish_post($1,'Hello','Ride note',88,$2,2,'community',null)`,[postId,routeId]);
  assert.equal((await as(C,'select route_snapshot from public.rs_posts where id=$1',[postId])).rows[0].route_snapshot.revision,2);
});

test('presence is opt-in, server TTL expires, and block revokes shares, posts, invitations and presence generations', async () => {
  await assert.rejects(as(A,'select public.rs_heartbeat()'),/disabled/i);
  await legacyInternalAs(A,'select public.rs_set_presence(true)');
  await as(A,'select public.rs_heartbeat()');
  const before = (await as(B,'select * from public.rs_friend_presence()')).rows[0];
  assert.equal(before.online,true);
  assert.equal((await as(C,'select * from public.rs_friend_presence()')).rows.length,0);
  await admin("update ride_private.presence_sessions set expires_at=now()-interval '1 second'");
  assert.equal((await as(B,'select * from public.rs_friend_presence()')).rows[0].online,false);
  await legacyInternalAs(B,`select public.rs_friend_action($1,'block')`,[A]);
  assert.equal((await as(B,'select * from public.rs_routes')).rows.length,0);
  assert.equal((await as(B,'select * from public.rs_posts')).rows.length,0);
  assert.equal((await as(B,'select * from public.rs_challenges')).rows.length,0);
  assert.equal((await as(B,'select * from public.rs_friend_presence()')).rows.length,0);
  assert.equal((await as(B,'select ride_private.can_read_presence($1) as allowed',[before.topic])).rows[0].allowed,false);
  await assert.rejects(legacyInternalAs(A,`select public.rs_friend_action($1,'accept')`,[B]),/unavailable/i);
  await legacyInternalAs(B,`select public.rs_friend_action($1,'unblock')`,[A]);
  await admin("update public.rs_friendships set updated_at=now()-interval '2 days'");
  await legacyInternalAs(A,"select public.rs_request_friend('mint_ride')");
  await legacyInternalAs(B,"select public.rs_friend_action($1,'accept')",[A]);
  assert.equal((await as(B,'select * from public.rs_routes')).rows.length,0);
  assert.equal((await as(B,'select * from public.rs_challenges')).rows.length,0);
  await assert.rejects(legacyInternalAs(B,"select public.rs_challenge_action($1,'accept')",[challengeId]),/unavailable/i);
  await legacyInternalAs(A,'select public.rs_invite_challenge($1,$2)',[challengeId,B]);
  assert.equal((await as(B,'select * from public.rs_challenges')).rows.length,1);
  assert.equal((await as(B,'select state from public.rs_challenge_members where challenge_id=$1 and user_id=$2',[challengeId,B])).rows[0].state,'invited');
  await legacyInternalAs(B,"select public.rs_friend_action($1,'block')",[A]);
});

test('media ownership and server-only broadcast resist direct impersonation', async () => {
  const path = `${A}/${postId}/abcdef.jpg`;
  await as(A, `insert into storage.objects(bucket_id,name) values('ride-community',$1)`, [path]);
  await assert.rejects(as(C, `insert into storage.objects(bucket_id,name) values('ride-community',$1)`, [path]), /row-level security/i);
  assert.equal((await as(C, `select * from storage.objects where name=$1`, [path])).rows.length, 0);
  assert.equal((await as(A, `select * from storage.objects where name=$1`, [path])).rows.length, 1);
  await assert.rejects(as(A, `insert into realtime.messages(topic,extension,payload) values('rs-presence:any','broadcast','{"online":true}')`), /row-level security/i);
  await as(A, 'select public.rs_delete_post($1)', [postId]);
  assert.equal((await as(C, 'select * from public.rs_posts where id=$1', [postId])).rows.length, 0);
});

test('route validation supports 12 stops and deletion preserves the immutable challenge snapshot', async () => {
  const twelve = Array.from({length:12}, (_,i) => ({label:`Stop ${i}`,lat:13.7+i/1000,lng:100.5}));
  const result = await as(A, `select (public.rs_save_route(null,0,'Twelve','car',$1::jsonb)).*`, [JSON.stringify(twelve)]);
  assert.match(result.rows[0].id, /^[a-f0-9-]{36}$/);
  await assert.rejects(as(A, `select public.rs_save_route(null,0,'Too many','car',$1::jsonb)`, [JSON.stringify([...twelve, twelve[0]])]), /check constraint/i);
  await assert.rejects(as(A, `select public.rs_save_route(null,0,'Invalid','car',$1::jsonb)`, [JSON.stringify([{label:'Oops',lat:999,lng:100},stops[1]])]), /check constraint/i);
  await assert.rejects(as(C, 'select public.rs_delete_route($1,2)', [routeId]), /unavailable|conflict/i);
  await as(A, 'select public.rs_delete_route($1,2)', [routeId]);
  const challenge = (await as(A, 'select * from public.rs_challenges where id=$1', [challengeId])).rows[0];
  assert.equal(challenge.route_id,null); assert.equal(challenge.route_snapshot.title,'Weekend');
});

test('verification leases fence stale workers, server records alone rank, Bangkok boundary and moderation revoke records', async () => {
  const course='40000000-0000-4000-8000-000000000001', session='50000000-0000-4000-8000-000000000001';
  const challenge='20000000-0000-4000-8000-000000000002', submission='60000000-0000-4000-8000-000000000001';
  await admin(`insert into public.rs_courses(id,name,closed_course_approved,boundary_polygon) values($1,'Test fixture only',true,'[{"lat":13,"lng":100},{"lat":14,"lng":100},{"lat":14,"lng":101}]')`, [course]);
  await admin(`insert into public.rs_course_sessions values($1,$2,now()-interval '1 day',now()+interval '1 hour',true)`, [session,course]);
  await admin(`insert into public.rs_challenges(id,creator_id,route_snapshot,category,mode,metric,course_session_id,starts_at,ends_at) values($1,$2,'{}','motorcycle','timed_race','sustained_speed_3s',$3,now()-interval '23 hours',now()+interval '1 minute')`, [challenge,A,session]);
  await admin(`insert into public.rs_challenge_members(challenge_id,user_id,state) values($1,$2,'accepted')`, [challenge,A]);
  const path = (await as(A, `select public.rs_reserve_submission($1,$2,'community') as path`, [submission,challenge])).rows[0].path;
  await assert.rejects(as(C, `select public.rs_reserve_submission(gen_random_uuid(),$1,'community')`, [challenge]), /accepted/i);
  await as(A, `insert into storage.objects(bucket_id,name) values('ride-evidence',$1)`, [path]);
  await as(A, 'select public.rs_queue_submission($1)', [submission]);
  await assert.rejects(as(A, 'select public.rs_claim_submission($1,$2)', [submission,A]), /permission denied/i);
  const first=(await admin('select public.rs_claim_submission($1,$2) as token',[submission,A])).rows[0].token;
  assert.equal((await admin('select public.rs_claim_submission($1,$2) as token',[submission,A])).rows[0].token,null);
  await admin(`update public.rs_submissions set verification_started_at=now()-interval '3 minutes' where id=$1`,[submission]);
  const second=(await admin('select public.rs_claim_submission($1,$2) as token',[submission,A])).rows[0].token;
  assert.notEqual(first,second);
  // Additive010 rejects stale owner-bound leases before the unchanged legacy body.
  await assert.rejects(admin('select public.rs_release_submission($1,$2)',[submission,first]),error=>error.code==='42501');
  await assert.rejects(admin("select public.rs_reject_submission($1,'STALE',$2) as rejected",[submission,first]),error=>error.code==='42501');
  assert.equal((await as(A,'select state from public.rs_submissions where id=$1',[submission])).rows[0].state,'verifying');
  const sha='a'.repeat(64);
  await assert.rejects(admin(`select public.rs_finalize_submission($1,36,now()-interval '4 seconds',now()-interval '1 second',4,1,$2,$3)`, [submission,sha,first]),error=>error.code==='42501');
  await admin(`select public.rs_finalize_submission($1,36,now()-interval '4 seconds',now()-interval '1 second',4,1,$2,$3)`, [submission,sha,second]);
  assert.equal((await legacyInternalAs(C, `select * from public.rs_leaderboard('today','motorcycle','community',null)`)).rows[0].sustained_kmh,'36.00');
  assert.equal((await legacyInternalAs(B, `select * from public.rs_leaderboard('today','motorcycle','community',null)`)).rows.length,0);
  await admin(`update public.rs_verified_records set window_start=(date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')-interval '4 seconds',window_end=(date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')-interval '1 second' where submission_id=$1`,[submission]);
  assert.equal((await legacyInternalAs(C, `select * from public.rs_leaderboard('today','motorcycle','community',null)`)).rows.length,0);
  await admin(`update public.rs_verified_records set window_start=(date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')-interval '3 seconds',window_end=(date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') where submission_id=$1`,[submission]);
  assert.equal((await legacyInternalAs(C, `select * from public.rs_leaderboard('today','motorcycle','community',null)`)).rows.length,1);
  await admin("select public.rs_reject_submission($1,'Operator revoked')",[submission]);
  assert.equal((await legacyInternalAs(C, `select * from public.rs_leaderboard('today','motorcycle','community',null)`)).rows.length,0);
});
