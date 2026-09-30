import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';

let db;
const A='00000000-0000-4000-8000-000000000031',B='00000000-0000-4000-8000-000000000032',C='00000000-0000-4000-8000-000000000033';
const uuid=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const result=q=>q.rows[0].value;
async function as(uid,sql,args=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
async function admin(sql,args=[]){await db.exec('reset role');return db.query(sql,args);}
async function service(sql,args=[]){await db.exec('reset role;set role service_role');try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
const vehicle=(id='legacy-local-id')=>({id,catalogId:null,category:'scooter',brand:'Test only',model:'Test only',variant:null,year:null,engineCc:156.9,motorPowerKw:null,powertrain:'petrol',nickname:null,color:null,photoPath:null});
const document=()=>({schema_version:1,vehicles:[vehicle()],selectedVehicleId:'legacy-local-id'});
const save=(owner,operation,revision,value)=>as(owner,'select public.rs_sync_garage($1,$2,$3::jsonb) as value',[operation,revision,JSON.stringify(value)]);
const reserve=(owner,upload,vehicleId='legacy-local-id',mime='image/jpeg')=>as(owner,'select public.rs_reserve_vehicle_photo($1,$2,$3) as value',[upload,vehicleId,mime]);
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to public;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon,service_role;grant all on storage.objects to authenticated,service_role;
 create schema realtime;create table realtime.messages(topic text,extension text,payload jsonb);alter table realtime.messages enable row level security;grant usage on schema realtime to authenticated,service_role;grant select,insert on realtime.messages to authenticated;
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;create function realtime.send(payload jsonb,event text,topic text,is_private boolean default true) returns void language sql as $$insert into realtime.messages(topic,extension,payload) values(topic,'broadcast',payload)$$;
 insert into auth.users values('${A}'),('${B}'),('${C}');`);
 const dir=new URL('../migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
});
after(async()=>{await db?.close();});

test('Auth-only garage starts genuinely empty and stays owner-only without user seed rows',async()=>{
 assert.deepEqual(result(await as(A,'select public.rs_get_garage() as value')),{revision:0,document:{schema_version:1,vehicles:[],selectedVehicleId:null},updated_at:null});
 const ack=result(await save(A,uuid(1),0,document()));assert.equal(ack.applied_revision,1);assert.equal(ack.current_revision,1);assert.match(ack.document_sha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(result(await as(A,'select public.rs_get_garage() as value')).document,document());
 assert.equal((await admin('select * from public.rs_profiles where user_id=$1',[A])).rows.length,0);
 assert.deepEqual((await as(B,'select * from public.rs_garages')).rows,[]);
 assert.equal(result(await as(B,'select public.rs_get_garage_sync_status($1) as value',[uuid(1)])),null);
});
test('immutable response-loss receipts preserve old local IDs/order and cannot roll a newer garage back',async()=>{
 const initial=result(await as(A,'select public.rs_get_garage_sync_status($1) as value',[uuid(1)]));
 const reversed=Object.fromEntries(Object.entries(document()).reverse());assert.deepEqual(result(await save(A,uuid(1),0,reversed)),initial);
 assert.equal((await admin("select hits from ride_private.daily_quotas where user_id=$1 and action='garage_sync'",[A])).rows[0].hits,1);
 const next={schema_version:1,vehicles:[vehicle('old:local.id'),vehicle()],selectedVehicleId:'old:local.id'};next.vehicles[0].category='bigbike';next.vehicles[0].engineCc=999;
 const ack=result(await save(A,uuid(2),1,next));assert.equal(ack.applied_revision,2);
 const replay=result(await save(A,uuid(1),0,document()));assert.equal(replay.applied_revision,1);assert.equal(replay.current_revision,2);
 assert.deepEqual(result(await as(A,'select public.rs_get_garage() as value')).document,next);
 await assert.rejects(save(A,uuid(3),1,document()),/GARAGE_REVISION_CONFLICT/);
 await assert.rejects(save(A,uuid(1),0,next),/GARAGE_OPERATION_CONFLICT/);
 assert.equal((await admin('select count(*)::int as n from public.rs_verified_records')).rows[0].n,0);
});
test('documents enforce exact fields, selected identity, bounds and EV/type metadata without invented verification',async()=>{
 const p=document();const invalid=[{...p,ownerId:B},{...p,selectedVehicleId:'missing'},{...p,vehicles:[vehicle(),vehicle()]},{...p,vehicles:[{...vehicle(),verified:true}]},
 {...p,vehicles:[{...vehicle(),category:'motorcycle'}]},{...p,vehicles:[{...vehicle(),engineCc:0}]},{...p,vehicles:[{...vehicle(),powertrain:'electric',motorPowerKw:10}]},
 {...p,vehicles:[{...vehicle(),color:'#fff'}]},{...p,vehicles:[{...vehicle(),id:'\u0001'}]},{...p,vehicles:[{...vehicle(),nickname:'a'.repeat(81)}]},
 {...p,vehicles:[{...vehicle(),photoPath:'https://foreign.test/image.jpg'}]}];
 for(const [i,value] of invalid.entries())await assert.rejects(save(B,uuid(100+i),0,value),/GARAGE_(INVALID|PHOTO_UNAVAILABLE)/);
 const electric={...p,vehicles:[{...vehicle(),powertrain:'electric',engineCc:null,motorPowerKw:12.5,color:'#abcdef',nickname:'รถของฉัน'}]};await save(B,uuid(20),0,electric);
 const full={schema_version:1,vehicles:Array.from({length:200},(_,i)=>vehicle(`kept-${i}`)),selectedVehicleId:null};await save(B,uuid(21),1,full);
 await assert.rejects(save(B,uuid(22),2,{...full,vehicles:[...full.vehicles,vehicle('extra')]}),/GARAGE_TOO_LARGE/);
});
test('photo reservations are idempotent and immutable per owner, vehicle and MIME before object upload',async()=>{
 const photo=result(await reserve(A,uuid(30)));assert.deepEqual(photo,{upload_id:uuid(30),vehicle_id:'legacy-local-id',state:'reserved',bucket:'vehicle-photos',path:`${A}/${uuid(30)}.jpg`,expires_at:photo.expires_at});
 assert.deepEqual(result(await reserve(A,uuid(30))),photo);
 await assert.rejects(reserve(B,uuid(30)),/GARAGE_PHOTO_UNAVAILABLE/);
 await assert.rejects(reserve(A,uuid(30),'another'),/GARAGE_PHOTO_UNAVAILABLE/);
 await assert.rejects(reserve(A,uuid(30),'legacy-local-id','image/png'),/GARAGE_PHOTO_UNAVAILABLE/);
 await assert.rejects(reserve(A,uuid(31),'legacy-local-id','image/svg+xml'),/GARAGE_INVALID/);
 const bucket=(await admin("select * from storage.buckets where id='vehicle-photos'")).rows[0];assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,1048576);assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp']);
 await assert.rejects(as(B,"insert into storage.objects(bucket_id,name,metadata) values('vehicle-photos',$1,'{}')",[photo.path]),/row-level security/i);
 await as(A,"insert into storage.objects(bucket_id,name,owner_id,metadata) values('vehicle-photos',$1,$2,$3::jsonb)",[photo.path,A,JSON.stringify({size:1500,mimetype:'image/jpeg'})]);
 assert.equal((await as(A,"select * from storage.objects where bucket_id='vehicle-photos' and name=$1",[photo.path])).rows.length,1);
 assert.equal((await as(B,"select * from storage.objects where bucket_id='vehicle-photos' and name=$1",[photo.path])).rows.length,0);
 assert.equal((await as(A,"update storage.objects set metadata='{}' where bucket_id='vehicle-photos' and name=$1 returning *",[photo.path])).rows.length,0);
 assert.equal((await as(A,"delete from storage.objects where bucket_id='vehicle-photos' and name=$1 returning *",[photo.path])).rows.length,0);
});
test('a document commits only an exact uploaded owner/vehicle reservation and current photo lookup never accepts paths',async()=>{
 const current=result(await as(A,'select public.rs_get_garage() as value'));current.document.vehicles[1].photoPath=`${A}/${uuid(30)}.jpg`;
 await save(A,uuid(32),current.revision,current.document);
 const photo=result(await as(A,'select public.rs_vehicle_photo_for_view($1) as value',['legacy-local-id']));assert.deepEqual(photo,{upload_id:uuid(30),path:`${A}/${uuid(30)}.jpg`});
 assert.equal(result(await as(B,'select public.rs_vehicle_photo_for_view($1) as value',['legacy-local-id'])),null);
 const fresh=result(await reserve(A,uuid(33)));const pending=structuredClone(current.document);pending.vehicles[1].photoPath=fresh.path;
 await assert.rejects(save(A,uuid(34),3,pending),/GARAGE_PHOTO_UPLOAD_REQUIRED/);
 await admin("insert into storage.objects(bucket_id,name,owner_id,metadata) values('vehicle-photos',$1,$2,$3::jsonb)",[fresh.path,A,JSON.stringify({size:1048577,mimetype:'image/jpeg'})]);
 await assert.rejects(save(A,uuid(34),3,pending),/GARAGE_PHOTO_INVALID_OBJECT/);
 await admin("update storage.objects set metadata=$2::jsonb where name=$1",[fresh.path,JSON.stringify({size:1500,mimetype:'image/png'})]);
 await assert.rejects(save(A,uuid(34),3,pending),/GARAGE_PHOTO_INVALID_OBJECT/);
 await admin("update storage.objects set metadata=$2::jsonb where name=$1",[fresh.path,JSON.stringify({size:1500,mimetype:'image/jpeg'})]);
 const wrong=structuredClone(pending);wrong.vehicles[0].photoPath=fresh.path;wrong.vehicles[1].photoPath=null;await assert.rejects(save(A,uuid(35),3,wrong),/GARAGE_PHOTO_UNAVAILABLE/);
 await save(A,uuid(34),3,pending);
 assert.deepEqual(result(await service('select public.rs_vehicle_photo_cleanup_objects($1) as value',[A])),[{bucket:'vehicle-photos',path:`${A}/${uuid(30)}.jpg`}]);
 await assert.rejects(save(A,uuid(36),4,current.document),/GARAGE_PHOTO_UNAVAILABLE/);
 const without=structuredClone(pending);without.vehicles[1].photoPath=null;await save(A,uuid(37),4,without);
 assert.equal(result(await as(A,'select public.rs_vehicle_photo_for_view($1) as value',['legacy-local-id'])),null);
 const recovered=result(await save(A,uuid(32),2,current.document));assert.equal(recovered.applied_revision,3);assert.equal(recovered.current_revision,5);
});
test('expired abandoned uploads are private, cannot commit, and have server-only bounded cleanup paths',async()=>{
 const upload=result(await reserve(B,uuid(40),'abandoned'));await admin("insert into storage.objects(bucket_id,name,owner_id,metadata) values('vehicle-photos',$1,$2,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')",[upload.path,B]);
 await admin("update public.rs_vehicle_photo_uploads set expires_at=now()-interval '1 second' where upload_id=$1",[uuid(40)]);
 const doc={schema_version:1,vehicles:[vehicle('abandoned')],selectedVehicleId:null};doc.vehicles[0].photoPath=upload.path;
 await assert.rejects(save(B,uuid(41),2,doc),/GARAGE_PHOTO_EXPIRED/);
 await assert.rejects(as(B,'select public.rs_vehicle_photo_cleanup_objects($1)',[B]),/permission denied/i);
 const objects=result(await service('select public.rs_vehicle_photo_cleanup_objects($1) as value',[B]));assert.deepEqual(objects,[{bucket:'vehicle-photos',path:upload.path}]);
 await assert.rejects(reserve(B,uuid(40),'abandoned'),/GARAGE_PHOTO_EXPIRED/);
 await assert.rejects(reserve(A,uuid(40),'abandoned'),/GARAGE_PHOTO_UNAVAILABLE/);
 await assert.rejects(as(B,"insert into storage.objects(bucket_id,name,metadata) values('vehicle-photos',$1,'{}')",[upload.path]),/row-level security/i);
});
test('account deletion drains every vehicle photo binary before purging owner garages/receipts/reservations',async()=>{
 await save(C,uuid(50),0,document());const upload=result(await reserve(C,uuid(51)));
 // Storage owner metadata can be absent after legacy/API behavior; reserved path prefix still fences deletion.
 await admin("insert into storage.objects(bucket_id,name,owner_id,metadata) values('vehicle-photos',$1,null,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')",[upload.path]);
 const request=uuid(52),job=result(await service('select public.rs_begin_account_deletion($1,$2) as value',[C,request]));
 await assert.rejects(save(C,uuid(53),1,document()),/ACCOUNT_DELETION_PENDING/);await assert.rejects(reserve(C,uuid(54)),/ACCOUNT_DELETION_PENDING/);
 assert.deepEqual((await as(C,'select * from public.rs_garages')).rows,[]);
 const objects=result(await service('select public.rs_account_deletion_objects($1,$2,$3) as value',[C,request,job.token]));assert.equal(objects.some(o=>o.bucket==='vehicle-photos'&&o.path===upload.path),true);
 await assert.rejects(service('select public.rs_purge_account_data($1,$2,$3)',[C,request,job.token]),/DELETION_ASSETS_REMAIN/);
 await admin("delete from storage.objects where bucket_id='vehicle-photos' and name=$1",[upload.path]);await service('select public.rs_purge_account_data($1,$2,$3)',[C,request,job.token]);
 for(const table of ['public.rs_garages','ride_private.garage_operations','public.rs_vehicle_photo_uploads'])assert.equal((await admin(`select count(*)::int as n from ${table} where owner_id=$1`,[C])).rows[0].n,0);
 assert.equal((await admin('select count(*)::int as n from public.rs_garages where owner_id=$1',[A])).rows[0].n,1);
 await admin('delete from auth.users where id=$1',[C]);assert.equal(result(await service('select public.rs_completed_account_deletion($1,$2) as value',[C,request])),true);
});
test('a committed upload can replay its original reservation after expiry without becoming a new upload',async()=>{
 const upload=result(await reserve(B,uuid(42),'committed'));await admin("insert into storage.objects(bucket_id,name,owner_id,metadata) values('vehicle-photos',$1,$2,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')",[upload.path,B]);
 const doc={schema_version:1,vehicles:[{...vehicle('committed'),photoPath:upload.path}],selectedVehicleId:'committed'};await save(B,uuid(43),2,doc);
 await admin("update public.rs_vehicle_photo_uploads set expires_at=now()-interval '1 hour' where upload_id=$1",[uuid(42)]);
 const replay=result(await reserve(B,uuid(42),'committed'));assert.equal(replay.state,'committed');assert.equal(replay.path,upload.path);assert.equal(Date.parse(replay.expires_at)<Date.now(),true);
 assert.deepEqual(result(await service('select public.rs_vehicle_photo_cleanup_objects($1) as value',[B])),[{bucket:'vehicle-photos',path:`${B}/${uuid(40)}.jpg`}]);
 await assert.rejects(as(B,"insert into storage.objects(bucket_id,name,metadata) values('vehicle-photos',$1,'{}')",[upload.path]),/row-level security/i);
 const receipt=result(await save(B,uuid(43),2,doc));assert.equal(receipt.applied_revision,3);assert.equal(receipt.current_revision,3);
});
test('M3 grants keep operations private, catalog service-managed, and every definer search path fixed',async()=>{
 await assert.rejects(as(A,'insert into public.rs_garages default values'),/permission denied/i);await assert.rejects(as(A,'select * from ride_private.garage_operations'),/permission denied/i);
 for(const name of ['rs_sync_garage(uuid,integer,jsonb)','rs_get_garage()','rs_get_garage_sync_status(uuid)','rs_reserve_vehicle_photo(uuid,text,text)','rs_vehicle_photo_for_view(text)']){
 assert.equal((await admin("select has_function_privilege('authenticated',$1,'execute') as allowed",[`public.${name}`])).rows[0].allowed,true);
 assert.equal((await admin("select has_function_privilege('anon',$1,'execute') as allowed",[`public.${name}`])).rows[0].allowed,false);}
 assert.equal((await admin("select has_function_privilege('authenticated','public.rs_vehicle_photo_cleanup_objects(uuid)','execute') as allowed")).rows[0].allowed,false);
 assert.equal((await admin("select has_table_privilege('authenticated','public.rs_vehicle_catalog','INSERT') as allowed")).rows[0].allowed,false);
 const unsafe=await admin("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='ride_private' or (n.nspname='public' and p.proname like 'rs_%')) and p.prosecdef and not coalesce(p.proconfig,array[]::text[]) @> array['search_path=\"\"']");assert.deepEqual(unsafe.rows,[]);
});
test('additive diesel extension preserves every other deployed M2 validator constraint and source',async()=>{
 const original=await readFile(new URL('../migrations/202610010004_private_ride_summaries.sql',import.meta.url),'utf8');
 const next=await readFile(new URL('../migrations/202610010005_garage_catalog.sql',import.meta.url),'utf8');
 const extract=(text,replace=false)=>text.match(new RegExp(`create ${replace?'or replace ':''}function ride_private\\.validate_ride_summary\\(p jsonb\\)[\\s\\S]*?end \\$\\$;`))[0].replace(/\r\n/g,'\n');
 const expected=extract(original).replace('create function','create or replace function').replace("not in('petrol','hybrid','electric','unknown')","not in('petrol','diesel','hybrid','electric','unknown')");assert.equal(extract(next,true),expected);
 const p={schema_version:1,started_at:'2026-10-01T01:00:00.000Z',ended_at:'2026-10-01T01:01:00.000Z',active_duration_ms:60000,elapsed_duration_ms:60000,clock_anomaly:false,distance_m:null,max_speed_mps:null,average_speed_mps:null,reported_provider:'expo_android',capture_count:1,accepted_fix_count:0,rejected_fix_count:0,geometry_status:'unavailable',vehicle:{local_id:'diesel',catalog_id:null,category:'car',brand:'Test',model:'Test',variant:null,year:null,powertrain:'diesel',engine_cc:2755,motor_kw:null},geometry:{encoding:'polyline5',fragments:[]}};
 const ack=result(await as(A,'select public.rs_sync_ride_summary($1,$2,0,$3::jsonb) as value',[uuid(60),uuid(61),JSON.stringify(p)]));assert.equal(ack.speed_status,'self_reported');
 assert.equal((await as(A,'select payload from public.rs_rides where id=$1',[uuid(61)])).rows[0].payload.vehicle.powertrain,'diesel');
 await assert.rejects(as(A,'select public.rs_sync_ride_summary($1,$2,0,$3::jsonb)',[uuid(62),uuid(63),JSON.stringify({...p,samples:[]})]),/RIDE_SUMMARY_INVALID/);
});
test('catalog seed preserves exact official-source and unverified provenance without creating any user data',async()=>{
 const source=await readFile(new URL('../../ExpoRideSpeed/src/data/vehicleCatalog.json',import.meta.url),'utf8'),catalog=JSON.parse(source);
 const seed=await readFile(new URL('../seeds/vehicle_catalog_v5.sql',import.meta.url),'utf8');
 // Git checks out LF on Linux and CRLF on Windows. The deployed seed remains
 // immutable; accept only those newline representations of the exact source.
 const lf=source.replace(/\r\n/g,'\n'),representations=[lf,lf.replace(/\n/g,'\r\n')];
 assert.equal(representations.some(bytes=>seed.includes(createHash('sha256').update(bytes).digest('hex'))),true);
 const before=(await admin('select (select count(*) from public.rs_garages)::int as garages,(select count(*) from auth.users)::int as users,(select count(*) from public.rs_verified_records)::int as ranked')).rows[0];
 await db.exec('reset role;set role service_role');try{await db.exec(seed);}finally{await db.exec('reset role');}
 const rows=(await as(A,'select metadata from public.rs_vehicle_catalog order by id')).rows.map(row=>row.metadata);assert.deepEqual(rows,catalog.entries.toSorted((a,b)=>a.id.localeCompare(b.id)));
 assert.equal(rows.length,90);assert.equal(rows.filter(row=>!row.specVerified).length,3);assert.equal(rows.filter(row=>row.specVerified&&row.powertrain==='electric').every(row=>row.engineCc===null),true);
 const after=(await admin('select (select count(*) from public.rs_garages)::int as garages,(select count(*) from auth.users)::int as users,(select count(*) from public.rs_verified_records)::int as ranked')).rows[0];assert.deepEqual(after,before);
 await assert.rejects(as(A,"insert into public.rs_vehicle_catalog(id,category,metadata) values('forged','car','{}')"),/permission denied/i);
 await db.exec('set role anon');try{await assert.rejects(db.query('select * from public.rs_vehicle_catalog'),/permission denied/i);}finally{await db.exec('reset role');}
});
test('garage quotas bound new snapshots while exact response-loss replays and reads remain available',async()=>{
 const owner='00000000-0000-4000-8000-000000000034',empty={schema_version:1,vehicles:[],selectedVehicleId:null};await admin('insert into auth.users values($1)',[owner]);
 for(let i=0;i<100;i++)await save(owner,uuid(1000+i),i,empty);
 await assert.rejects(save(owner,uuid(1100),100,empty),/Daily action limit reached/);
 const replay=result(await save(owner,uuid(1000),0,empty));assert.equal(replay.applied_revision,1);assert.equal(replay.current_revision,100);assert.equal(result(await as(owner,'select public.rs_get_garage() as value')).revision,100);
 await assert.rejects(save(owner,uuid(1101),2147483647,empty),/GARAGE_INVALID/);
});
