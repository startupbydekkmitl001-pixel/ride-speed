import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const A='00000000-0000-4000-8000-000000000051',B='00000000-0000-4000-8000-000000000052',C='00000000-0000-4000-8000-000000000053',D='00000000-0000-4000-8000-000000000054',E='00000000-0000-4000-8000-000000000055';
const id=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const value=r=>r.rows[0].value;
async function as(owner,q,args=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');try{return await db.query(q,args);}finally{await db.exec('reset role');}}
async function admin(q,args=[]){await db.exec('reset role');return db.query(q,args);}
async function service(q,args=[]){await db.exec('reset role;set role service_role');try{return await db.query(q,args);}finally{await db.exec('reset role');}}
const req=(action,fields)=>({schema_version:1,action,...fields});
const mutate=async(owner,operation,request)=>value(await as(owner,'select public.rs_social_mutate($1,$2::jsonb) as value',[operation,JSON.stringify(request)]));
const snapshot=async(owner,limit=30,before=null,user=null)=>value(await as(owner,'select public.rs_social_snapshot($1,$2,$3) as value',[limit,before,user]));
const status=async(owner,operation)=>value(await as(owner,'select public.rs_social_operation($1) as value',[operation]));
const error=(response,code)=>assert.deepEqual(response,{error:{code}});
async function pair(state='accepted',generation=10){await admin('delete from public.rs_blocks where blocker_id in($1,$2) and blocked_id in($1,$2)',[A,B]);await admin(`insert into public.rs_friendships(user_low,user_high,requester_id,state,generation,updated_at) values($1,$2,$1,$3,$4,now()-interval '2 days') on conflict(user_low,user_high) do update set requester_id=$1,state=$3,generation=$4,presence_topic=gen_random_uuid(),updated_at=now()-interval '2 days'`,[A,B,state,generation]);}
function encode(points){let lat=0,lng=0,out='';const part=n=>{let x=n<0?~(n<<1):n<<1,s='';while(x>=32){s+=String.fromCharCode((32|(x&31))+63);x>>=5;}return s+String.fromCharCode(x+63);};for(const[a,b]of points){const x=Math.round(a*1e5),y=Math.round(b*1e5);out+=part(x-lat)+part(y-lng);lat=x;lng=y;}return out;}
async function route(routeId,short=false){const document={schema_version:1,title:'Private fixture route',category:'scooter',visibility:'private',stops:[{lat:13.7,lng:100.5,label:'Home secret',place_id:'secret'},{lat:short?13.701:13.71,lng:100.5,label:'Work secret'}],source:{kind:'recorded',segments:[encode([[13.7,100.5],[short?13.701:13.71,100.5]])]}};return value(await as(A,'select public.rs_save_route_v2($1,$2,0,$3::jsonb) as value',[id(Number(routeId.slice(-12))+5000),routeId,JSON.stringify(document)]));}
async function invitation(challengeId,routeId,overrides={}){const projection=value(await as(A,'select public.rs_get_route_projection($1) as value',[routeId]));const now=(await admin('select clock_timestamp() as t')).rows[0].t;return req('create_invitation',{challenge_id:challengeId,route_id:routeId,route_revision:1,reviewed_geometry_hash:projection.geometryHash,mode:'group_ride',session_id:null,starts_at:new Date(Date.parse(now)+3600000).toISOString(),ends_at:new Date(Date.parse(now)+7200000).toISOString(),recipient_id:B,friendship_generation:10,...overrides});}
before(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to public;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon,service_role;grant all on storage.objects to authenticated,service_role;
 create schema realtime;create table realtime.messages(topic text,extension text,payload jsonb);alter table realtime.messages enable row level security;grant usage on schema realtime to authenticated,service_role;grant select,insert on realtime.messages to authenticated;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;create function realtime.send(payload jsonb,event text,topic text,is_private boolean default true) returns void language sql as $$insert into realtime.messages(topic,extension,payload) values(topic,'broadcast',payload)$$;
 insert into auth.users values('${A}'),('${B}'),('${C}'),('${D}'),('${E}');`);
 const directory=new URL('../migrations/',import.meta.url),files=(await readdir(directory)).filter(x=>x.endsWith('.sql')).sort();for(const file of files.filter(x=>x<'202610010007'))await db.exec(await readFile(new URL(file,directory),'utf8'));
 for(const[owner,handle]of[[A,'social_a'],[B,'social_b'],[C,'social_c'],[E,'social_e']])await as(owner,'select public.rs_upsert_profile($1,$2)',[handle,handle]);
 // Real legacy rows receive ABA tokens without changing their ownership.
 await as(C,"select public.rs_friend_action($1,'block')",[B]);
 for(const file of files.filter(x=>x>='202610010007'))await db.exec(await readFile(new URL(file,directory),'utf8'));
});after(async()=>{await db?.close();});

test('Auth-only reads are honest and profile-gated writes create no profile/account/receipt',async()=>{
 const page=await snapshot(D);assert.equal(page.owner_id,D);assert.deepEqual(page.self,{profile_ready:false,presence_opt_in:false,account_revision:0});assert.deepEqual(page.items,[]);assert.deepEqual(page.statuses,[]);
 error(await mutate(D,id(1),req('request_friend',{handle:'social_a'})),'PROFILE_REQUIRED');assert.equal(await status(D,id(1)),null);
 assert.equal((await admin('select * from public.rs_account_state where user_id=$1',[D])).rows.length,0);
 error(await mutate('',id(2),req('request_friend',{handle:'social_a'})),'SOCIAL_AUTH_REQUIRED');
});
test('additive token migration preserves established blocks without exposing another owner block list',async()=>{
 const own=value(await as(C,'select public.rs_blocked_people(30,null) as value'));assert.equal(own.items[0].user_id,B);assert.match(own.items[0].block_token,/^[a-f0-9-]{36}$/);assert.deepEqual(value(await as(B,'select public.rs_blocked_people(30,null) as value')).items,[]);
});
test('strict bounded request normalization rejects arbitrary owner/geometry/unknown keys before admission',async()=>{
 for(const input of[null,{},req('request_friend',{handle:'SOCIAL_A'}),req('request_friend',{handle:'social_b',owner_id:B}),req('friend_action',{other_id:A,verb:'accept',expected_generation:1}),req('set_presence',{enabled:true,expected_account_revision:0,coordinates:[1,2]})])error(await mutate(A,id(10),input),'SOCIAL_INVALID');
 error(await mutate(A,id(11),req('request_friend',{handle:'a'.repeat(17000)})),'SOCIAL_TOO_LARGE');assert.equal(await status(A,id(10)),null);
});
test('exact requests produce owner receipts; crossed requests derive incoming direction; replay is immutable',async()=>{
 await pair('removed',1);const request=req('request_friend',{handle:'social_b'});const first=await mutate(A,id(20),request);assert.equal(first.owner_id,A);assert.equal(first.operation_id,id(20));assert.deepEqual(first.request,request);assert.deepEqual(first.result,{kind:'friend',user_id:B,state:'outgoing',generation:2});
 const crossed=await mutate(B,id(21),req('request_friend',{handle:'social_a'}));assert.equal(crossed.result.state,'incoming');assert.equal(crossed.result.generation,2);
 await pair('removed',30);assert.deepEqual(await mutate(A,id(20),request),first);assert.deepEqual(await status(A,id(20)),first);assert.equal(await status(C,id(20)),null);
 error(await mutate(A,id(20),req('request_friend',{handle:'social_c'})),'SOCIAL_OPERATION_CONFLICT');assert.equal((await admin('select generation from public.rs_friendships where user_low=$1 and user_high=$2',[A,B])).rows[0].generation,30);
});
test('generation CAS and recipient-only transitions reject stale intent without rotating current topic',async()=>{
 await pair('pending',10);const before=(await admin('select presence_topic from public.rs_friendships where user_low=$1 and user_high=$2',[A,B])).rows[0].presence_topic;
 error(await mutate(A,id(30),req('friend_action',{other_id:B,verb:'accept',expected_generation:10})),'FRIEND_CHANGED');
 error(await mutate(B,id(31),req('friend_action',{other_id:A,verb:'accept',expected_generation:9})),'FRIEND_CHANGED');
 assert.equal((await admin('select presence_topic from public.rs_friendships where user_low=$1 and user_high=$2',[A,B])).rows[0].presence_topic,before);
 const accepted=await mutate(B,id(32),req('friend_action',{other_id:A,verb:'accept',expected_generation:10}));assert.equal(accepted.result.state,'accepted');assert.equal(accepted.result.generation,11);
 error(await mutate(A,id(33),req('friend_action',{other_id:B,verb:'remove',expected_generation:10})),'FRIEND_CHANGED');
});
test('failed missing, blocked and cooldown probes consume a committed admission budget; replay is free',async()=>{
 await admin("delete from ride_private.daily_quotas where user_id=$1 and action in('social_friend_probe','friend_lookup')",[A]);await pair('removed',40);await admin('update public.rs_friendships set updated_at=now() where user_low=$1 and user_high=$2',[A,B]);
 error(await mutate(A,id(40),req('request_friend',{handle:'social_b'})),'SOCIAL_UNAVAILABLE');
 await admin('insert into public.rs_blocks(blocker_id,blocked_id) values($1,$2)',[A,C]);error(await mutate(A,id(41),req('request_friend',{handle:'social_c'})),'SOCIAL_UNAVAILABLE');
 for(let i=2;i<40;i++)error(await mutate(A,id(40+i),req('request_friend',{handle:'missing_person'})),'SOCIAL_UNAVAILABLE');
 const row=(await admin("select hits from ride_private.daily_quotas where user_id=$1 and action='social_friend_probe'",[A])).rows[0];assert.equal(row.hits,40);
 error(await mutate(A,id(80),req('request_friend',{handle:'social_b'})),'SOCIAL_RATE_LIMITED');
 const old=await status(A,id(20));assert.deepEqual(await mutate(A,id(20),old.request),old);assert.equal((await admin("select hits from ride_private.daily_quotas where user_id=$1 and action='social_friend_probe'",[A])).rows[0].hits,40);
 await admin("delete from ride_private.daily_quotas where user_id=$1 and action='social_friend_probe'",[A]);await admin('delete from public.rs_blocks where blocker_id=$1',[A]);
});
test('block tokens fence ABA unblock and never restore removed friendship or old status topics',async()=>{
 await pair();const blocked=await mutate(A,id(90),req('friend_action',{other_id:B,verb:'block',expected_generation:10}));assert.equal(blocked.result.state,'blocked');
 const page=value(await as(A,'select public.rs_blocked_people(30,null) as value'));const token=page.items.find(x=>x.user_id===B).block_token;assert.match(token,/^[a-f0-9-]{36}$/);assert.equal(page.items.find(x=>x.user_id===B).handle,'social_b');
 assert.equal((await as(A,'select * from public.rs_profiles where user_id=$1',[B])).rows.length,0);assert.deepEqual(value(await as(B,'select public.rs_blocked_people(30,null) as value')).items,[]);
 await mutate(A,id(91),req('unblock',{other_id:B,block_token:token}));await mutate(A,id(92),req('friend_action',{other_id:B,verb:'block',expected_generation:11}));
 error(await mutate(A,id(93),req('unblock',{other_id:B,block_token:token})),'BLOCK_CHANGED');const newToken=value(await as(A,'select public.rs_blocked_people(30,null) as value')).items.find(x=>x.user_id===B).block_token;assert.notEqual(newToken,token);
 await mutate(A,id(94),req('unblock',{other_id:B,block_token:newToken}));assert.deepEqual((await snapshot(A)).items.filter(x=>x.user_id===B),[]);assert.equal((await admin('select state from public.rs_friendships where user_low=$1 and user_high=$2',[A,B])).rows[0].state,'removed');
});
test('presence CAS preserves account progress and authoritative ghost state; opt-out revokes lease/topics',async()=>{
 await pair();const account=value(await as(A,'select public.rs_get_account_state() as value'));await as(A,"select public.rs_update_account_state($1,'complete','denied','{\"notifications_enabled\":true}'::jsonb)",[account.revision]);const base=(await snapshot(A)).self.account_revision;
 const enabled=await mutate(A,id(100),req('set_presence',{enabled:true,expected_account_revision:base}));assert.equal(enabled.result.enabled,true);assert.equal(enabled.result.account_revision,base+1);await as(A,'select public.rs_heartbeat()');
 const peer=await snapshot(B);assert.equal(peer.statuses.find(x=>x.user_id===A).online,true);const oldTopic=peer.statuses.find(x=>x.user_id===A).topic;
 error(await mutate(A,id(101),req('set_presence',{enabled:false,expected_account_revision:base})),'PRESENCE_CHANGED');const disabled=await mutate(A,id(102),req('set_presence',{enabled:false,expected_account_revision:base+1}));assert.equal(disabled.result.account_revision,base+2);
 const fresh=await snapshot(B);assert.equal(fresh.statuses.find(x=>x.user_id===A).online,false);assert.equal(fresh.statuses.find(x=>x.user_id===A).expires_at,null);assert.notEqual(fresh.statuses.find(x=>x.user_id===A).topic,oldTopic);
 const stored=value(await as(A,'select public.rs_get_account_state() as value'));assert.equal(stored.onboarding_step,'complete');assert.equal(stored.location_choice,'denied');assert.equal(stored.preferences.notifications_enabled,true);assert.equal(stored.preferences.ghost_mode,true);
 assert.deepEqual(await mutate(A,id(100),enabled.request),enabled);assert.equal((await snapshot(A)).self.presence_opt_in,false);
});
test('friend keyset pages preserve microseconds and limit statuses to accepted returned IDs',async()=>{
 await pair();for(let i=0;i<3;i++){const owner=id(200+i);await admin('insert into auth.users values($1)',[owner]);await as(owner,'select public.rs_upsert_profile($1,$2)',[`page_${i}`,`คนที่ ${i}`]);await admin(`insert into public.rs_friendships(user_low,user_high,requester_id,state,generation,updated_at) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'accepted',1,$3::timestamptz)`,[A,owner,`2026-10-01T00:00:00.12345${i}Z`]);}
 const first=await snapshot(A,1);assert.equal(first.items[0].user_id,id(202));assert.equal(first.statuses.length,1);assert.equal(first.statuses[0].user_id,first.items[0].user_id);assert.match(first.next_cursor.updated_at,/123452/);
 const second=await snapshot(A,1,first.next_cursor.updated_at,first.next_cursor.user_id);assert.equal(second.items[0].user_id,id(201));await assert.rejects(snapshot(A,30,first.next_cursor.updated_at,null),/SOCIAL_INVALID/);
});
test('malformed legacy display names use real handles without poisoning pages or rewriting profiles',async()=>{
 await pair();await admin('update public.rs_profiles set display_name=$1 where user_id=$2',['legacy\nname',B]);const page=await snapshot(A);assert.equal(page.items.find(x=>x.user_id===B).display_name,'social_b');assert.equal((await admin('select display_name from public.rs_profiles where user_id=$1',[B])).rows[0].display_name,'legacy\nname');await admin('update public.rs_profiles set display_name=$1 where user_id=$2',['social_b',B]);
});
test('atomic creation binds exact friendship, saved revision and reviewed sanitized projection',async()=>{
 await pair();await route(id(300));const request=await invitation(id(301),id(300));
 error(await mutate(A,id(302),{...request,friendship_generation:9}),'FRIEND_CHANGED');error(await mutate(A,id(303),{...request,reviewed_geometry_hash:'a'.repeat(64)}),'INVITATION_CHANGED');error(await mutate(A,id(304),{...request,route_revision:2}),'INVITATION_CHANGED');
 assert.equal((await admin('select * from public.rs_challenges where id=$1',[id(301)])).rows.length,0);
 const receipt=await mutate(A,id(305),request);assert.equal(receipt.result.state,'open');assert.equal((await admin('select * from public.rs_challenge_members where challenge_id=$1',[id(301)])).rows.length,2);
 const inbox=value(await as(B,'select public.rs_invitation_inbox(30,null,null) as value'));const item=inbox.items.find(x=>x.id===id(301));assert.equal(item.member.state,'invited');assert.equal(item.member.friendship_generation,10);assert.equal(item.can_cancel,false);assert.equal(item.route_summary.title,'Private fixture route');assert.equal(item.route_snapshot.geometryStatus,'trimmed');assert.equal(JSON.stringify(item).includes('Home secret'),false);assert.equal('stops' in item.route_snapshot,false);
 assert.deepEqual(value(await as(C,'select public.rs_invitation_inbox(30,null,null) as value')).items,[]);
 error(await mutate(A,id(306),request),'INVITATION_UNAVAILABLE');assert.deepEqual(await mutate(A,id(305),request),receipt);
});
test('hidden legitimate projection can be invited, while injected second-step failure rolls creation back',async()=>{
 await pair();await route(id(310),true);const request=await invitation(id(311),id(310));assert.equal(request.reviewed_geometry_hash,null);assert.equal((await mutate(A,id(312),request)).result.state,'open');
 const item=value(await as(B,'select public.rs_invitation_inbox(30,null,null) as value')).items.find(x=>x.id===id(311));assert.deepEqual(item.route_snapshot.segments,[]);assert.equal(item.route_snapshot.geometryStatus,'hidden');
 await db.exec(`create function ride_private.test_fail_invite() returns trigger language plpgsql as $$begin if new.user_id='${B}' then raise exception 'private unexpected storage detail' using errcode='XX000';end if;return new;end$$;create trigger test_fail_invite before insert on public.rs_challenge_members for each row execute function ride_private.test_fail_invite()`);
 const failing={...request,challenge_id:id(313)};await assert.rejects(mutate(A,id(314),failing),/private unexpected storage detail/);assert.equal(await status(A,id(314)),null);assert.equal((await admin('select * from public.rs_challenges where id=$1',[id(313)])).rows.length,0);await db.exec('drop trigger test_fail_invite on public.rs_challenge_members;drop function ride_private.test_fail_invite()');
});
test('known concurrent challenge identity collisions reject atomically; unrelated unique faults stay uncertain',async()=>{
 await pair();const request=await invitation(id(315),id(310));await db.exec(`create function ride_private.test_collision() returns trigger language plpgsql as $$begin if new.id='${id(315)}' then raise exception 'identity collision fixture' using errcode='23505',constraint='rs_challenges_pkey';elsif new.id='${id(316)}' then raise exception 'unrecognized constraint detail fixture' using errcode='23505',constraint='unrecognized_fixture_pkey';end if;return new;end$$;create trigger test_collision before insert on public.rs_challenges for each row execute function ride_private.test_collision()`);
 try{error(await mutate(A,id(317),request),'INVITATION_UNAVAILABLE');assert.equal(await status(A,id(317)),null);await assert.rejects(mutate(A,id(318),{...request,challenge_id:id(316)}),/unrecognized constraint detail fixture/);assert.equal(await status(A,id(318)),null);assert.equal((await admin('select * from public.rs_challenges where id in($1,$2)',[id(315),id(316)])).rows.length,0);}finally{await db.exec('drop trigger test_collision on public.rs_challenges;drop function ride_private.test_collision()');}
});
test('participant state/generation CAS and creator-only cancel preserve current invitation rights',async()=>{
 await pair();const action=verb=>req('invitation_action',{challenge_id:id(301),verb,expected_member_state:'invited',friendship_generation:10});
 error(await mutate(B,id(320),{...action('accept'),expected_member_state:'accepted'}),'INVITATION_CHANGED');error(await mutate(C,id(321),action('accept')),'INVITATION_UNAVAILABLE');
 const accept=await mutate(B,id(322),action('accept'));assert.equal(accept.result.state,'accepted');error(await mutate(B,id(323),action('decline')),'INVITATION_CHANGED');
 const withdraw=await mutate(B,id(324),{...action('withdraw'),expected_member_state:'accepted'});assert.equal(withdraw.result.state,'withdrawn');error(await mutate(B,id(325),{...action('accept'),expected_member_state:'withdrawn'}),'INVITATION_CHANGED');
 error(await mutate(B,id(326),req('invitation_action',{challenge_id:id(301),verb:'cancel',expected_member_state:null,friendship_generation:null})),'INVITATION_UNAVAILABLE');
 const cancelled=await mutate(A,id(327),req('invitation_action',{challenge_id:id(301),verb:'cancel',expected_member_state:null,friendship_generation:null}));assert.equal(cancelled.result.state,'cancelled');assert.deepEqual(await mutate(B,id(322),action('accept')),accept);
});
test('historical metadata remains nongeographic and cannot accept; block/removal invalidates old invitation',async()=>{
 await pair();await admin("insert into public.rs_challenges(id,creator_id,route_snapshot,category,mode,metric,starts_at,ends_at) values($1,$2,$3::jsonb,'scooter','group_ride','none',now()+interval '1 hour',now()+interval '2 hours')",[id(330),A,JSON.stringify({title:'Legacy route',category:'scooter',revision:3,stops:[{lat:13.7,lng:100.5,label:'Private legacy address'}],bounds:[13.7,100.5]})]);await admin("insert into public.rs_challenge_members(challenge_id,user_id,state,friendship_generation) values($1,$2,'invited',10)",[id(330),B]);
 const item=value(await as(B,'select public.rs_invitation_inbox(30,null,null) as value')).items.find(x=>x.id===id(330));assert.equal(item.route_snapshot,null);assert.deepEqual(item.route_summary,{title:'Legacy route',category:'scooter',revision:3});assert.equal(JSON.stringify(item).includes('Private legacy address'),false);assert.equal(JSON.stringify(item).includes('bounds'),false);
 const request=req('invitation_action',{challenge_id:id(330),verb:'accept',expected_member_state:'invited',friendship_generation:10});error(await mutate(B,id(331),request),'INVITATION_UNAVAILABLE');
 await pair('accepted',11);error(await mutate(B,id(332),request),'FRIEND_CHANGED');assert.equal(value(await as(B,'select public.rs_invitation_inbox(30,null,null) as value')).items.some(x=>x.id===id(330)),false);
});
test('timed invitations require operator approval/exact session and wall-clock bounded future window',async()=>{
 await pair();const request=await invitation(id(340),id(300));error(await mutate(A,id(341),{...request,mode:'timed_race',session_id:id(342)}),'INVITATION_UNAVAILABLE');error(await mutate(A,id(343),{...request,ends_at:new Date(Date.parse(request.starts_at)+86400001).toISOString()}),'SOCIAL_INVALID');
 await admin("insert into public.rs_courses(id,name,closed_course_approved) values($1,'Private track fixture',true)",[id(342)]);await admin('insert into public.rs_course_sessions(id,course_id,starts_at,ends_at,approved) values($1,$2,$3,$4,true)',[id(344),id(342),request.starts_at,request.ends_at]);await admin('update public.rs_routes set approved_course_id=$1,approved_revision=revision where id=$2',[id(342),id(300)]);
 const accepted=await mutate(A,id(345),{...request,mode:'timed_race',session_id:id(344)});assert.equal(accepted.result.state,'open');assert.equal((await admin('select metric from public.rs_challenges where id=$1',[id(340)])).rows[0].metric,'sustained_speed_3s');
});
test('future invitation gate uses wall time after locks, not an older transaction start',async()=>{
 await pair();const request=await invitation(id(346),id(300));const stamp=(await admin('select clock_timestamp() as t')).rows[0].t;request.starts_at=new Date(Date.parse(stamp)+150).toISOString();
 await db.exec('begin');try{await admin('select pg_sleep(0.25)');error(await mutate(A,id(347),request),'INVITATION_UNAVAILABLE');await db.exec('commit');}catch(e){await db.exec('rollback');throw e;}
 assert.equal(await status(A,id(347)),null);assert.equal((await admin('select * from public.rs_challenges where id=$1',[id(346)])).rows.length,0);
});
test('new RPC grants/private receipts and binary-first deletion preserve account isolation',async()=>{
 for(const name of['rs_social_snapshot','rs_blocked_people','rs_invitation_inbox','rs_social_mutate','rs_social_operation']){const row=(await admin("select p.oid,proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') auth from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname=$1",[name])).rows[0];assert.equal(row.anon,false);assert.equal(row.auth,true);assert.ok(row.proconfig.some(x=>x.startsWith('search_path=')));}
 await assert.rejects(as(A,'select * from ride_private.social_operations'),/permission denied/);await assert.rejects(as(A,"insert into public.rs_blocks(blocker_id,blocked_id) values($1,$2)",[A,B]),/permission denied/);
 const request=req('request_friend',{handle:'social_c'});await mutate(E,id(350),request);const job=value(await service('select public.rs_begin_account_deletion($1,$2) as value',[E,id(351)]));error(await mutate(E,id(352),request),'ACCOUNT_DELETION_PENDING');await assert.rejects(snapshot(E),/ACCOUNT_DELETION_PENDING/);
 await admin("insert into storage.objects(bucket_id,name,owner_id) values('vehicle-photos',$1,$2)",[`${E}/${id(353)}.jpg`,E]);await assert.rejects(service('select public.rs_purge_account_data($1,$2,$3)',[E,id(351),job.token]),/DELETION_ASSETS_REMAIN/);assert.ok((await admin('select * from ride_private.social_operations where owner_id=$1',[E])).rows.length);
 await admin('delete from storage.objects where owner_id=$1',[E]);await service('select public.rs_purge_account_data($1,$2,$3)',[E,id(351),job.token]);assert.equal((await admin('select * from ride_private.social_operations where owner_id=$1',[E])).rows.length,0);assert.equal((await admin('select * from auth.users where id=$1',[E])).rows.length,1);assert.ok(await status(A,id(20)));
});
test('superseded browser writes cannot bypass committed admission/CAS; trusted helper contracts remain granted',async()=>{
 for(const [name,signature,query,args]of[
 ['rs_request_friend','public.rs_request_friend(text)','select public.rs_request_friend($1)',['missing_person']],
 ['rs_friend_action','public.rs_friend_action(uuid,text)','select public.rs_friend_action($1,$2)',[B,'block']],
 ['rs_set_presence','public.rs_set_presence(boolean)','select public.rs_set_presence($1)',[true]],
 ['rs_create_challenge','public.rs_create_challenge(uuid,uuid,integer,text,uuid,timestamptz,timestamptz)',"select public.rs_create_challenge($1,$2,1,'group_ride',null,now()+interval '1 hour',now()+interval '2 hours')",[id(400),id(300)]],
 ['rs_invite_challenge','public.rs_invite_challenge(uuid,uuid)','select public.rs_invite_challenge($1,$2)',[id(301),B]],
 ['rs_challenge_action','public.rs_challenge_action(uuid,text)','select public.rs_challenge_action($1,$2)',[id(301),'cancel']]]){
  await assert.rejects(as(A,query,args),new RegExp(`permission denied for function ${name}`));const row=(await admin("select has_function_privilege('authenticated',$1,'execute') auth,has_function_privilege('anon',$1,'execute') anon,has_function_privilege('service_role',$1,'execute') service",[signature])).rows[0];assert.deepEqual(row,{auth:false,anon:false,service:true});
 }
});
test('blocked/invitation keyset pages cap30, preserve tied-time IDs and hide creator membership',async()=>{
 for(let i=0;i<3;i++)await admin('insert into public.rs_blocks(blocker_id,blocked_id) values($1,$2)',[A,id(200+i)]);const first=value(await as(A,'select public.rs_blocked_people(1,null) as value'));assert.equal(first.items[0].user_id,id(200));const next=value(await as(A,'select public.rs_blocked_people(1,$1) as value',[first.next_cursor.user_id]));assert.equal(next.items[0].user_id,id(201));
 await pair();for(let i=0;i<31;i++)await admin("insert into public.rs_challenges(id,creator_id,route_snapshot,category,mode,metric,starts_at,ends_at,created_at) values($1,$2,'{\"title\":\"History fixture\",\"revision\":1,\"category\":\"scooter\"}','scooter','group_ride','none',now()+interval '1 hour',now()+interval '2 hours',date_trunc('second',clock_timestamp())+interval '1 day')",[id(500+i),A]);
 const inbox=value(await as(A,'select public.rs_invitation_inbox(30,null,null) as value'));assert.equal(inbox.items.length,30);assert.equal(inbox.items[0].id,id(530));assert.equal(inbox.items[0].member,null);assert.equal(inbox.items[0].can_cancel,true);const tail=value(await as(A,'select public.rs_invitation_inbox(30,$1,$2) as value',[inbox.next_cursor.created_at,inbox.next_cursor.id]));assert.equal(tail.items[0].id,id(500));assert.equal(new Set([...inbox.items,...tail.items].map(x=>x.id)).size,inbox.items.length+tail.items.length);
 await assert.rejects(as(A,'select public.rs_invitation_inbox(31,null,null)'),/SOCIAL_INVALID/);await assert.rejects(as(A,'select public.rs_blocked_people(0,null)'),/SOCIAL_INVALID/);
});
