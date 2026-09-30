import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const A='00000000-0000-4000-8000-000000000021',B='00000000-0000-4000-8000-000000000022',C='00000000-0000-4000-8000-000000000023';
const id=(prefix,n)=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ride=n=>id('70000000',n),op=n=>id('80000000',n);
const result=q=>q.rows[0].value;
async function as(uid,sql,args=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
async function admin(sql,args=[]){await db.exec('reset role');return db.query(sql,args);}
async function service(sql,args=[]){await db.exec('reset role;set role service_role');try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
const vehicle=()=>({local_id:'local-test-vehicle',catalog_id:null,category:'scooter',brand:'Test only',model:'Test only',variant:null,year:null,powertrain:'petrol',engine_cc:156.9,motor_kw:null});
const payload=()=>({schema_version:1,started_at:'2026-10-01T01:00:00.000Z',ended_at:'2026-10-01T01:01:00.000Z',active_duration_ms:60000,elapsed_duration_ms:60000,clock_anomaly:false,distance_m:100,max_speed_mps:10,average_speed_mps:100/60,reported_provider:'expo_android',capture_count:1,accepted_fix_count:3,rejected_fix_count:0,geometry_status:'complete',vehicle:vehicle(),geometry:{encoding:'polyline5',fragments:[{segment_id:id('90000000',1),capture_id:id('91000000',1),part_index:0,polyline:'_p~iF~ps|U_ulLnnqC_mqNvxq`@',point_count:3}]}});
const save=(owner,operation,rid,revision,p)=>as(owner,'select public.rs_sync_ride_summary($1,$2,$3,$4::jsonb) as value',[operation,rid,revision,JSON.stringify(p)]);
function encodeTest(points){let lat=0,lng=0,out='';for(const [a,b] of points){for(const delta of [Math.round(a*1e5)-lat,Math.round(b*1e5)-lng]){let bits=delta<0?~(delta<<1):delta<<1;while(bits>=32){out+=String.fromCharCode(((bits&31)|32)+63);bits>>=5;}out+=String.fromCharCode(bits+63);}lat=Math.round(a*1e5);lng=Math.round(b*1e5);}return out;}
before(async()=>{
  db=new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to public;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon,service_role;grant all on storage.objects to authenticated,service_role;
    create schema realtime;create table realtime.messages(topic text,extension text,payload jsonb);alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated,service_role;grant select,insert on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
    create function realtime.send(payload jsonb,event text,topic text,is_private boolean default true) returns void language sql as $$insert into realtime.messages(topic,extension,payload) values(topic,'broadcast',payload)$$;
    insert into auth.users values('${A}'),('${B}'),('${C}');`);
  const dir=new URL('../migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
});
after(async()=>{await db?.close();});

test('Auth-only owner can save a private self-reported summary without creating a profile or rank',async()=>{
  const ack=result(await save(A,op(1),ride(1),0,payload()));
  assert.equal(ack.applied_revision,1);assert.equal(ack.current_revision,1);assert.equal(ack.ride_id,ride(1));assert.equal(ack.operation_id,op(1));
  assert.equal(ack.visibility,'private');assert.equal(ack.speed_status,'self_reported');assert.match(ack.payload_sha256,/^[a-f0-9]{64}$/);
  assert.equal((await admin('select * from public.rs_profiles where user_id=$1',[A])).rows.length,0);
  assert.equal((await admin('select * from public.rs_verified_records')).rows.length,0);
  const row=(await as(A,'select * from public.rs_rides where id=$1',[ride(1)])).rows[0];
  assert.equal(row.category,'scooter');assert.equal(row.class_key,'scooter:gt125_le160');assert.equal(row.metadata_authority,'self_reported');
  assert.equal((await as(B,'select * from public.rs_rides where id=$1',[ride(1)])).rows.length,0);
  assert.equal(result(await as(B,'select public.rs_get_ride_sync_status($1) as value',[op(1)])),null);
});
test('response-loss replay is one committed operation and does not consume another mutation quota',async()=>{
  const first=result(await as(A,'select public.rs_get_ride_sync_status($1) as value',[op(1)]));
  const reordered=Object.fromEntries(Object.entries(payload()).reverse());
  assert.deepEqual(result(await save(A,op(1),ride(1),0,reordered)),first);
  assert.equal((await admin("select hits from ride_private.daily_quotas where user_id=$1 and action='ride_summary'",[A])).rows[0].hits,1);
  assert.equal((await admin('select count(*)::int as n from ride_private.ride_summary_operations where owner_id=$1',[A])).rows[0].n,1);
  await assert.rejects(save(A,op(1),ride(1),0,{...payload(),max_speed_mps:11}),/RIDE_OPERATION_CONFLICT/);
  await assert.rejects(save(B,op(10),ride(1),0,payload()),/RIDE_UNAVAILABLE/);
});
test('CAS updates preserve the start snapshot and old acknowledgements cannot roll a newer row back',async()=>{
  const changed={...payload(),distance_m:120,average_speed_mps:2};
  const ack=result(await save(A,op(2),ride(1),1,changed));assert.equal(ack.applied_revision,2);
  const replay=result(await save(A,op(1),ride(1),0,payload()));assert.equal(replay.applied_revision,1);assert.equal(replay.current_revision,2);
  assert.equal((await as(A,'select payload from public.rs_rides where id=$1',[ride(1)])).rows[0].payload.distance_m,120);
  await assert.rejects(save(A,op(3),ride(1),1,payload()),/RIDE_REVISION_CONFLICT/);
  await assert.rejects(save(A,op(4),ride(1),2,{...changed,vehicle:{...vehicle(),model:'Changed after start'}}),/RIDE_SNAPSHOT_CONFLICT/);
  await assert.rejects(save(A,op(5),ride(1),2,{...changed,started_at:'2026-10-01T00:59:00.000Z',elapsed_duration_ms:120000}),/RIDE_SNAPSHOT_CONFLICT/);
});
test('unavailable fixes remain null, stationary zero stays zero and clock anomalies preserve UTC observations',async()=>{
  const missing={...payload(),vehicle:null,accepted_fix_count:0,distance_m:null,max_speed_mps:null,average_speed_mps:null,geometry_status:'unavailable',geometry:{encoding:'polyline5',fragments:[]}};
  await save(B,op(20),ride(20),0,missing);
  const zero={...payload(),accepted_fix_count:2,distance_m:0,max_speed_mps:0,average_speed_mps:0,geometry:{encoding:'polyline5',fragments:[{...payload().geometry.fragments[0],polyline:'????',point_count:2}]}};
  await save(B,op(21),ride(21),0,zero);
  const anomalous={...missing,clock_anomaly:true,ended_at:'2026-10-01T00:59:00.000Z',elapsed_duration_ms:null};
  await save(B,op(22),ride(22),0,anomalous);
  const row=(await as(B,'select payload from public.rs_rides where id=$1',[ride(22)])).rows[0].payload;
  assert.equal(row.ended_at,anomalous.ended_at);assert.equal(row.elapsed_duration_ms,null);
});
test('payload validation rejects raw evidence, forged verification metadata, malformed geometry and inconsistent units',async()=>{
  const invalid=[{...payload(),samples:[{latitude:13,longitude:100}]},{...payload(),verified:true},{...payload(),visibility:'friends'},
    {...payload(),max_speed_mps:'NaN'},{...payload(),average_speed_mps:99},{...payload(),active_duration_ms:-1},{...payload(),elapsed_duration_ms:40000},
    {...payload(),ended_at:'2026-02-30T01:01:00.000Z'},{...payload(),vehicle:{...vehicle(),metadata_authority:'verified'}},
    {...payload(),geometry:{encoding:'polyline5',fragments:[{...payload().geometry.fragments[0],polyline:'?',point_count:1}]}},
    {...payload(),geometry:{encoding:'polyline5',fragments:[{...payload().geometry.fragments[0],polyline:'~~~~~~~~',point_count:1}]}},
    {...payload(),geometry:{encoding:'polyline5',fragments:[{...payload().geometry.fragments[0],polyline:encodeTest([[0,181]]),point_count:1}]}},
    {...payload(),geometry:{encoding:'polyline5',fragments:[{...payload().geometry.fragments[0],point_count:2}]}},
    {...payload(),geometry:{encoding:'polyline5',fragments:[payload().geometry.fragments[0],payload().geometry.fragments[0]]}}];
  for(const [i,value] of invalid.entries())await assert.rejects(save(B,op(100+i),ride(100+i),0,value),/RIDE_SUMMARY_INVALID/);
  const tooMany={...payload(),accepted_fix_count:4097,geometry:{encoding:'polyline5',fragments:[{...payload().geometry.fragments[0],polyline:'??'.repeat(4097),point_count:4097}]}};
  await assert.rejects(save(B,op(200),ride(200),0,tooMany),/RIDE_SUMMARY_TOO_LARGE/);
  const tooLong={...payload(),geometry:{encoding:'polyline5',fragments:[{...payload().geometry.fragments[0],polyline:'?'.repeat(65537)}]}};
  await assert.rejects(save(B,op(201),ride(201),0,tooLong),/RIDE_SUMMARY_TOO_LARGE/);
});
test('disconnected capture fragments remain separate and EV/type classes never become verified',async()=>{
  const p=payload();p.accepted_fix_count=6;p.capture_count=2;p.geometry.fragments.push({...p.geometry.fragments[0],segment_id:id('90000000',2),capture_id:id('91000000',2)});
  await save(B,op(30),ride(30),0,p);
  assert.equal((await as(B,'select payload from public.rs_rides where id=$1',[ride(30)])).rows[0].payload.geometry.fragments.length,2);
  const electric={...payload(),vehicle:{...vehicle(),powertrain:'electric',engine_cc:null,motor_kw:15}};
  await save(B,op(31),ride(31),0,electric);
  const row=(await as(B,'select category,class_key,metadata_authority from public.rs_rides where id=$1',[ride(31)])).rows[0];
  assert.equal(row.category,'scooter');assert.equal(row.class_key,'scooter:ev');assert.equal(row.metadata_authority,'self_reported');
});
test('polyline validation accepts the exact point bound and signed geographic edges, rejecting overlong zero varints',async()=>{
  const p=payload();p.accepted_fix_count=4096;p.geometry.fragments[0].polyline='??'.repeat(4096);p.geometry.fragments[0].point_count=4096;
  await save(B,op(35),ride(35),0,p);
  const edges=payload();edges.geometry.fragments[0].polyline=encodeTest([[-90,-180],[90,180],[-0.00015,0.00015]]);
  await save(B,op(36),ride(36),0,edges);
  const bad=payload();bad.geometry.fragments[0].polyline='_??';bad.geometry.fragments[0].point_count=1;
  await assert.rejects(save(B,op(37),ride(37),0,bad),/RIDE_SUMMARY_INVALID/);
});
test('bounded owner history paginates tied timestamps without exposing another account or evidence',async()=>{
  for(const n of [50,51])await save(B,op(n),ride(n),0,{...payload(),ended_at:'2026-10-01T01:02:00.000Z',elapsed_duration_ms:120000});
  const collected=[];let cursor=null;
  do {
    const page=result(await as(B,'select public.rs_list_ride_summaries($1,$2,$3) as value',[2,cursor?.ended_at??null,cursor?.ride_id??null]));
    assert.equal(page.items.length<=2,true);
    for(const item of page.items){assert.equal(item.visibility,'private');assert.equal(item.speed_status,'self_reported');assert.equal(item.metadata_authority,'self_reported');assert.equal('owner_id' in item,false);assert.equal('samples' in item,false);collected.push(item.ride_id);}
    cursor=page.next_cursor;
  }while(cursor);
  assert.equal(collected.length,9);assert.equal(new Set(collected).size,9);assert.deepEqual(collected.slice(0,2),[ride(51),ride(50)]);assert.equal(collected.includes(ride(1)),false);
  const own=result(await as(A,'select public.rs_list_ride_summaries() as value'));assert.equal(own.items.length,1);assert.equal(own.items[0].ride_id,ride(1));assert.equal(own.next_cursor,null);
  await assert.rejects(as(B,'select public.rs_list_ride_summaries($1,$2,$3)',[51,null,null]),/RIDE_SUMMARY_INVALID/);
  await assert.rejects(as(B,'select public.rs_list_ride_summaries($1,$2,$3)',[2,'2026-10-01T01:01:00Z',null]),/RIDE_SUMMARY_INVALID/);
});
test('RLS and explicit grants deny direct mutation, receipt reads and existing server-only result sinks',async()=>{
  await assert.rejects(as(A,'insert into public.rs_rides default values'),/permission denied/i);
  await assert.rejects(as(A,'select * from ride_private.ride_summary_operations'),/permission denied/i);
  for(const name of ['rs_sync_ride_summary(uuid,uuid,integer,jsonb)','rs_get_ride_sync_status(uuid)','rs_list_ride_summaries(integer,timestamptz,uuid)'])assert.equal((await admin("select has_function_privilege('authenticated',$1,'execute') as allowed",[`public.${name}`])).rows[0].allowed,true);
  assert.equal((await admin("select has_function_privilege('authenticated','public.rs_finalize_submission(uuid,numeric,timestamptz,timestamptz,integer,numeric,text,uuid)','execute') as allowed")).rows[0].allowed,false);
  assert.equal((await admin("select relrowsecurity from pg_class where relname='rs_rides'")).rows[0].relrowsecurity,true);
  const unsafe=await admin("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='ride_private' or (n.nspname='public' and p.proname like 'rs_%')) and p.prosecdef and not coalesce(p.proconfig,array[]::text[]) @> array['search_path=\"\"']");assert.deepEqual(unsafe.rows,[]);
});
test('account deletion fences and purges Auth-only ride summaries/receipts before Auth removal',async()=>{
  await save(C,op(40),ride(40),0,payload());
  const request=id('20000000',40),job=result(await service('select public.rs_begin_account_deletion($1,$2) as value',[C,request]));
  await assert.rejects(save(C,op(41),ride(41),0,payload()),/ACCOUNT_DELETION_PENDING/);
  await assert.rejects(as(C,'select public.rs_list_ride_summaries()'),/ACCOUNT_DELETION_PENDING/);
  assert.deepEqual((await as(C,'select * from public.rs_rides')).rows,[]);
  await service('select public.rs_purge_account_data($1,$2,$3)',[C,request,job.token]);
  assert.equal((await admin('select * from public.rs_rides where owner_id=$1',[C])).rows.length,0);
  assert.equal((await admin('select * from ride_private.ride_summary_operations where owner_id=$1',[C])).rows.length,0);
  assert.equal((await admin('select * from auth.users where id=$1',[C])).rows.length,1);
  assert.equal((await admin('select * from public.rs_rides where owner_id=$1',[A])).rows.length,1);
  await admin('delete from auth.users where id=$1',[C]);
  assert.equal(result(await service('select public.rs_completed_account_deletion($1,$2) as value',[C,request])),true);
});
