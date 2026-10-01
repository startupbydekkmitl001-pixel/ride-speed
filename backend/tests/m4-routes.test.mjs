import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
let db;
const A='00000000-0000-4000-8000-000000000041',B='00000000-0000-4000-8000-000000000042',C='00000000-0000-4000-8000-000000000043';
const id=n=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const value=r=>r.rows[0].value;
async function as(owner,q,args=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');try{return await db.query(q,args);}finally{await db.exec('reset role');}}
async function admin(q,args=[]){await db.exec('reset role');return db.query(q,args);}
async function service(q,args=[]){await db.exec('reset role;set role service_role');try{return await db.query(q,args);}finally{await db.exec('reset role');}}
function encode(points){let lat=0,lng=0,out='';const part=n=>{let x=n<0?~(n<<1):n<<1;let s='';while(x>=32){s+=String.fromCharCode((32|(x&31))+63);x>>=5;}return s+String.fromCharCode(x+63);};for(const p of points){const a=Math.round(p[0]*1e5),b=Math.round(p[1]*1e5);out+=part(a-lat)+part(b-lng);lat=a;lng=b;}return out;}
const stops=[{lat:13.7,lng:100.5,label:'Private start',place_id:'home-secret'},{lat:13.71,lng:100.5,label:'Private finish',place_id:'work-secret'}];
const doc=(visibility='private')=>({schema_version:1,title:'Test route only',category:'scooter',visibility,stops,source:{kind:'recorded',segments:[encode([[13.7,100.5],[13.71,100.5]])]}});
const save=(owner,operation,route,revision,document)=>as(owner,'select public.rs_save_route_v2($1,$2,$3,$4::jsonb) as value',[operation,route,revision,JSON.stringify(document)]);
before(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to public;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon,service_role;grant all on storage.objects to authenticated,service_role;
 create schema realtime;create table realtime.messages(topic text,extension text,payload jsonb);alter table realtime.messages enable row level security;grant usage on schema realtime to authenticated,service_role;grant select,insert on realtime.messages to authenticated;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;create function realtime.send(payload jsonb,event text,topic text,is_private boolean default true) returns void language sql as $$insert into realtime.messages(topic,extension,payload) values(topic,'broadcast',payload)$$;
 insert into auth.users values('${A}'),('${B}'),('${C}');`);
 const directory=new URL('../migrations/',import.meta.url),files=(await readdir(directory)).filter(x=>x.endsWith('.sql')).sort();
 for(const file of files.filter(x=>x<'202610010006'))await db.exec(await readFile(new URL(file,directory),'utf8'));
 // Existing raw owner data must survive the additive migration; fixtures never leave this in-memory DB.
 await as(A,"select public.rs_upsert_profile('route_legacy','Legacy')");
 await as(A,"select public.rs_save_route($1,0,'Legacy private','scooter',$2::jsonb)",[id(1),JSON.stringify(stops)]);
 await admin("insert into public.rs_posts(id,owner_id,route_snapshot,visibility,moderation_state) values($1,$2,$3::jsonb,'community','published')",[id(2),A,JSON.stringify({title:'Legacy private',revision:1,stops,geometry:[[13.7,100.5]],bounds:[13.7,100.5],category:'scooter'})]);
 for(const file of files.filter(x=>x>='202610010006'))await db.exec(await readFile(new URL(file,directory),'utf8'));
});after(async()=>{await db?.close();});
test('migration preserves exact legacy owner pins while sanitizing every old public snapshot',async()=>{
 const owner=value(await as(A,'select public.rs_get_route_owner($1) as value',[id(1)]));assert.deepEqual(owner.document.stops,stops);assert.equal(owner.provider,'draft');
 const row=(await admin('select stops from public.rs_routes where id=$1',[id(1)])).rows[0];assert.deepEqual(row.stops,[]);
 const post=(await admin('select route_snapshot from public.rs_posts where id=$1',[id(2)])).rows[0].route_snapshot;assert.equal(post.title,'Legacy private');assert.equal('stops' in post,false);assert.equal('bounds' in post,false);assert.equal('geometry' in post,false);
});
test('Auth-only private CAS save needs no profile and exact receipts never overwrite newer revisions',async()=>{
 const first=value(await save(B,id(10),id(11),0,doc()));assert.equal(first.applied_revision,1);assert.equal(first.action,'save');
 assert.equal((await admin('select * from public.rs_profiles where user_id=$1',[B])).rows.length,0);
 assert.equal(value(await as(C,'select public.rs_get_route_owner($1) as value',[id(11)])),null);assert.equal(value(await as(C,'select public.rs_get_route_operation($1) as value',[id(10)])),null);
 await save(B,id(12),id(11),1,{...doc(),title:'Edited'});const replay=value(await save(B,id(10),id(11),0,doc()));assert.equal(replay.applied_revision,1);assert.equal(replay.current_revision,2);
 await assert.rejects(save(B,id(13),id(11),1,doc()),/ROUTE_REVISION_CONFLICT/);await assert.rejects(save(B,id(10),id(11),0,{...doc(),title:'Changed op'}),/ROUTE_OPERATION_CONFLICT/);
});
test('nonowner public projection clips >=200m geodesically and excludes raw stops/metrics/bounds',async()=>{
 await save(B,id(14),id(11),2,doc('public'));const projection=value(await as(C,'select public.rs_get_route_projection($1) as value',[id(11)]));assert.equal(projection.geometryStatus,'trimmed');assert.equal(projection.privacyTrimMeters,200);assert.equal(projection.segments.length,1);
 const part=projection.segments[0];assert.ok(part[0].latitude>13.70179);assert.ok(part.at(-1).latitude<13.70821);for(const key of ['stops','place_id','distanceMeters','durationSeconds','calculatedAt','bounds','updated_at','routeToken'])assert.equal(key in projection,false);
 const raw=(await as(C,'select * from public.rs_routes where id=$1',[id(11)])).rows[0];assert.ok(raw.stops.every(p=>p.label==='Route'));assert.equal(JSON.stringify(raw).includes('home-secret'),false);
});
test('short geometry hides completely and disconnected recording gaps are never connected',async()=>{
 const short={...doc('public'),source:{kind:'recorded',segments:[encode([[13.7,100.5],[13.702,100.5]])]}};await save(B,id(20),id(21),0,short);const hidden=value(await as(C,'select public.rs_get_route_projection($1) as value',[id(21)]));assert.equal(hidden.geometryStatus,'hidden');assert.deepEqual(hidden.segments,[]);
 const split={...doc('public'),source:{kind:'recorded',segments:[encode([[13.7,100.5],[13.705,100.5]]),encode([[13.708,100.5],[13.713,100.5]])]}};await save(B,id(22),id(23),0,split);const projection=value(await as(C,'select public.rs_get_route_projection($1) as value',[id(23)]));assert.equal(projection.segments.length,2);assert.equal(projection.segments[0].at(-1).latitude,13.705);assert.equal(projection.segments[1][0].latitude,13.708);
});
test('compatibility post/challenge snapshots bind only trimmed independent parts and never raw pins',async()=>{
 // Existing profile-dependent social APIs stay intact; private route saves do not need a profile.
 await as(B,"select public.rs_upsert_profile('route_friend','Friend')");
 await as(B,'select public.rs_create_post($1)',[id(24)]);await as(B,"select public.rs_publish_post($1,'Test only','',null,$2,1,'community',null)",[id(24),id(23)]);
 await as(B,"select public.rs_create_challenge($1,$2,1,'group_ride',null,now()+interval '1 hour',now()+interval '2 hours')",[id(25),id(23)]);
 for(const table of ['public.rs_posts','public.rs_challenges']){const snapshot=(await admin(`select route_snapshot from ${table} where id=$1`,[table.endsWith('posts')?id(24):id(25)])).rows[0].route_snapshot;assert.equal(snapshot.revision,1);assert.equal(snapshot.segments.length,2);assert.equal('stops' in snapshot,false);assert.equal('routeToken' in snapshot,false);assert.equal(JSON.stringify(snapshot).includes('home-secret'),false);}
});
test('friend and targeted-share projections revoke on block and do not restore stale generation',async()=>{
 await as(B,"select public.rs_upsert_profile('route_friend','Friend')");await as(C,"select public.rs_upsert_profile('route_peer','Peer')");await as(B,"select public.rs_request_friend('route_peer')");await as(C,"select public.rs_friend_action($1,'accept')",[B]);
 await save(B,id(30),id(31),0,doc('friends'));assert.ok(value(await as(C,'select public.rs_get_route_projection($1) as value',[id(31)])));
 await as(C,"select public.rs_friend_action($1,'block')",[B]);assert.equal(value(await as(C,'select public.rs_get_route_projection($1) as value',[id(31)])),null);assert.equal(value(await as(C,'select public.rs_get_route_projection($1) as value',[id(11)])),null);
});
test('delete receipts and tombstones prevent lost-ACK replay from resurrecting routes',async()=>{
 const ack=value(await as(B,'select public.rs_delete_route_v2($1,$2,$3) as value',[id(40),id(11),3]));assert.equal(ack.action,'delete');assert.equal(ack.current_revision,null);assert.equal(value(await as(B,'select public.rs_get_route_owner($1) as value',[id(11)])),null);
 assert.deepEqual(value(await as(B,'select public.rs_delete_route_v2($1,$2,$3) as value',[id(40),id(11),3])),ack);
 const old=value(await save(B,id(10),id(11),0,doc()));assert.equal(old.current_revision,null);await assert.rejects(save(B,id(41),id(11),0,doc()),/ROUTE_DELETED/);
});
test('validated provider tokens are owner/stops/profile bound and cannot grant course approval',async()=>{
 const request={operation:'route',stops:[{latitude:13.7,longitude:100.5},{latitude:13.71,longitude:100.5}],profile:'scooter',consent:true};
 const claim=value(await service('select public.rs_route_service_claim($1,$2::jsonb) as value',[B,JSON.stringify(request)]));assert.equal(claim.state,'claimed');
 const result={provider:'geoapify',profile:'scooter',segments:[[{latitude:13.7,longitude:100.5},{latitude:13.71,longitude:100.5}]],distanceMeters:1200,durationSeconds:180,calculatedAt:new Date().toISOString(),attribution:'Powered by Geoapify | OpenStreetMap'};
 const stored=value(await service('select public.rs_route_service_finish($1,$2,$3::jsonb) as value',[B,claim.lease,JSON.stringify(result)]));assert.match(stored.routeToken,/^[a-f0-9-]{36}$/);
 const road={...doc(),source:{kind:'road',routeToken:stored.routeToken}};await assert.rejects(save(A,id(50),id(51),0,road),/ROUTE_SOURCE_UNAVAILABLE/);await assert.rejects(save(B,id(52),id(53),0,{...road,category:'car'}),/ROUTE_SOURCE_MISMATCH/);
 await save(B,id(54),id(55),0,road);const owner=value(await as(B,'select public.rs_get_route_owner($1) as value',[id(55)]));assert.equal(owner.distanceMeters,1200);assert.equal(owner.provider,'geoapify');assert.equal((await admin('select approved_course_id from public.rs_routes where id=$1',[id(55)])).rows[0].approved_course_id,null);
});
test('provider cache is owner-private, miss leases coalesce and budget is reserved atomically before upstream work',async()=>{
 const request={operation:'search',query:'Bangkok',language:'en',consent:true};const first=value(await service('select public.rs_route_service_claim($1,$2::jsonb) as value',[A,JSON.stringify(request)]));assert.equal(first.state,'claimed');
 await assert.rejects(service('select public.rs_route_service_claim($1,$2::jsonb)',[A,JSON.stringify(request)]),/THROTTLED/);
 await service('select public.rs_route_service_finish($1,$2,$3::jsonb)',[A,first.lease,JSON.stringify({items:[],attribution:'Powered by Geoapify | OpenStreetMap'})]);
 const hit=value(await service('select public.rs_route_service_claim($1,$2::jsonb) as value',[A,JSON.stringify(request)]));assert.equal(hit.state,'cached');assert.deepEqual(hit.result.items,[]);
 const separate=value(await service('select public.rs_route_service_claim($1,$2::jsonb) as value',[C,JSON.stringify(request)]));assert.equal(separate.state,'claimed');assert.notEqual(separate.lease,first.lease);
 assert.equal((await as(A,'select * from ride_private.route_service_cache').catch(()=>({rows:[]}))).rows.length,0);
});
test('token expiry is precise, saved unchanged geometry survives cache expiry and receipt replay precedes it',async()=>{
 const token=(await admin("select route_token from ride_private.route_service_cache where owner_id=$1 and request->>'operation'='route'",[B])).rows[0].route_token;
 await admin("update ride_private.route_service_cache set expires_at=now()-interval '1 second' where route_token=$1",[token]);
 const road={...doc(),source:{kind:'road',routeToken:token}};
 await assert.rejects(save(B,id(80),id(81),0,road),/ROUTE_SOURCE_EXPIRED/);
 const replay=value(await save(B,id(54),id(55),0,road));assert.equal(replay.applied_revision,1);
 await save(B,id(82),id(55),1,{...road,title:'Metadata edit after cache expiry'});assert.equal(value(await as(B,'select public.rs_get_route_owner($1) as value',[id(55)])).distanceMeters,1200);
});
test('keyset owner history handles tied timestamps and incomplete drafts retain exact pins',async()=>{
 await save(A,id(90),id(91),0,{...doc(),stops:[],source:{kind:'draft'}});await save(A,id(92),id(93),0,{...doc(),stops:[stops[0]],source:{kind:'draft'}});
 await admin("update public.rs_routes set updated_at='2026-10-01T01:00:00Z' where owner_id=$1",[A]);
 const first=value(await as(A,'select public.rs_list_routes_owner(1,null,null) as value'));assert.equal(first.items.length,1);assert.ok(first.next_cursor);
 const next=value(await as(A,'select public.rs_list_routes_owner(1,$1,$2) as value',[first.next_cursor.updated_at,first.next_cursor.id]));assert.notEqual(first.items[0].id,next.items[0].id);assert.equal(first.items[0].owner_id,A);
 const partial=value(await as(A,'select public.rs_get_route_owner($1) as value',[id(93)]));assert.deepEqual(partial.document.stops,[stops[0]]);assert.deepEqual(partial.segments,[]);
 await assert.rejects(as(A,'select public.rs_list_routes_owner(30,now(),null)'),/ROUTE_INVALID/);
});
test('rolling provider owner/global/rate budgets reject before creating a lease and do not meter hits',async()=>{
 await admin("update ride_private.route_service_calls set created_at=now()-interval '2 seconds'");
 const request={operation:'search',query:'Quota fixture',language:'en',consent:true};
 await admin('insert into ride_private.route_service_calls(owner_id,units,created_at) select $1,30,now()-interval \'2 seconds\' from generate_series(1,5)',[A]);
 const count=(await admin('select count(*)::int as n from ride_private.route_service_calls')).rows[0].n;
 await assert.rejects(service('select public.rs_route_service_claim($1,$2::jsonb)',[A,JSON.stringify(request)]),/QUOTA_EXCEEDED/);
 assert.equal((await admin('select count(*)::int as n from ride_private.route_service_calls')).rows[0].n,count);
 await admin('delete from ride_private.route_service_calls');await admin("insert into ride_private.route_service_calls(owner_id,units,created_at) select $1,30,now()-interval '2 seconds' from generate_series(1,90)",[A]);
 await assert.rejects(service('select public.rs_route_service_claim($1,$2::jsonb)',[B,JSON.stringify(request)]),/QUOTA_EXCEEDED/);
 await admin('delete from ride_private.route_service_calls');await admin('insert into ride_private.route_service_calls(owner_id,units) select $1,1 from generate_series(1,4)',[A]);
 await assert.rejects(service('select public.rs_route_service_claim($1,$2::jsonb)',[B,JSON.stringify(request)]),/THROTTLED/);
 await admin('delete from ride_private.route_service_calls');
});
test('known rejected-long-route work reconciles upward under its exact owner lease and never refunds',async()=>{
 const request={operation:'route',stops:[{latitude:13.7,longitude:100.5},{latitude:13.71,longitude:100.5}],profile:'drive',consent:true};
 const claim=value(await service('select public.rs_route_service_claim($1,$2::jsonb) as value',[B,JSON.stringify(request)]));
 await service('select public.rs_route_service_reconcile($1,$2,$3)',[B,claim.lease,2000000]);
 assert.equal((await admin('select units from ride_private.route_service_calls where owner_id=$1',[B])).rows[0].units,5);
 await service('select public.rs_route_service_reconcile($1,$2,$3)',[B,claim.lease,1000]);assert.equal((await admin('select units from ride_private.route_service_calls where owner_id=$1',[B])).rows[0].units,5);
 await assert.rejects(service('select public.rs_route_service_reconcile($1,$2,$3)',[A,claim.lease,2000000]),/PROVIDER_UNAVAILABLE/);
 await assert.rejects(as(B,'select public.rs_route_service_reconcile($1,$2,$3)',[B,claim.lease,2000000]),/permission denied/i);
});
test('provider reservations use wall time even inside a transaction opened earlier',async()=>{
 await admin('begin');
 try{
  await admin('select pg_sleep(0.02)');
  const claim=value(await service('select public.rs_route_service_claim($1,$2::jsonb) as value',[A,JSON.stringify({operation:'search',query:'Fresh time fixture',language:'en',consent:true})]));
  const row=(await admin('select c.created_at>transaction_timestamp()+interval \'10 milliseconds\' as fresh,k.lease_until-c.created_at=interval \'30 seconds\' as duration from ride_private.route_service_cache k join ride_private.route_service_calls c on c.id=k.call_id where k.lease=$1',[claim.lease])).rows[0];
  assert.equal(row.fresh,true);assert.equal(row.duration,true);
 }finally{await admin('rollback');}
});
test('live route capacity cannot hide extra rows and the highest integer revision can still be deleted',async()=>{
 await save(A,id(110),id(111),0,{...doc(),stops:[],source:{kind:'draft'}});
 await admin('update public.rs_routes set revision=2147483647 where id=$1',[id(111)]);
 const deleted=value(await as(A,'select public.rs_delete_route_v2($1,$2,2147483647) as value',[id(112),id(111)]));assert.equal(deleted.applied_revision,2147483647);assert.equal(deleted.current_revision,null);
 const fixtures=[];
 try{
  const count=(await admin('select count(*)::int as n from public.rs_routes where owner_id=$1',[A])).rows[0].n;
  fixtures.push(...(await admin("insert into public.rs_routes(id,owner_id,title,category,stops,revision,visibility) select gen_random_uuid(),$1,'Capacity fixture','scooter','[]'::jsonb,1,'private' from generate_series(1,$2::integer) returning id",[A,200-count])).rows.map(row=>row.id));
  await assert.rejects(save(A,id(113),id(114),0,{...doc(),stops:[],source:{kind:'draft'}}),/ROUTE_TOO_LARGE/);
  assert.equal((await admin('select count(*)::int as n from public.rs_routes where owner_id=$1',[A])).rows[0].n,200);
  assert.equal(value(await as(A,'select public.rs_get_route_operation($1) as value',[id(113)])),null);
 }finally{await admin('delete from public.rs_routes where id=any($1::uuid[])',[fixtures]);}
});
test('private function grants, strict payload bounds and account deletion fences preserve every prior contract',async()=>{
 await assert.rejects(as(A,'select public.rs_route_service_claim($1,$2::jsonb)',[A,'{}']),/permission denied/i);await assert.rejects(as(A,'select * from ride_private.route_documents'),/permission denied/i);await assert.rejects(as(A,'update public.rs_routes set title=\'forged\''),/permission denied/i);
 for(const invalid of [{...doc(),owner_id:C},{...doc(),visibility:'community'},{...doc(),source:{kind:'road',routeToken:'bad'}},{...doc(),title:'x'.repeat(81)},{...doc(),source:{kind:'recorded',segments:['~']}}])await assert.rejects(save(A,id(60),id(61),0,invalid),/ROUTE_INVALID/);
 const unsafe=await admin("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='ride_private' or(n.nspname='public' and p.proname like 'rs_%')) and p.prosecdef and not coalesce(p.proconfig,array[]::text[]) @> array['search_path=\"\"']");assert.deepEqual(unsafe.rows,[]);
 const job=value(await service('select public.rs_begin_account_deletion($1,$2) as value',[C,id(70)]));await assert.rejects(service('select public.rs_route_service_claim($1,$2::jsonb)',[C,JSON.stringify({operation:'search',query:'Bangkok',language:'en',consent:true})]),/ACCOUNT_DELETION_PENDING/);
 await service('select public.rs_purge_account_data($1,$2,$3)',[C,id(70),job.token]);for(const table of ['ride_private.route_service_cache','ride_private.route_service_calls','ride_private.route_operations','ride_private.route_documents'])assert.equal((await admin(`select count(*)::int as n from ${table} where owner_id=$1`,[C])).rows[0].n,0);
});
