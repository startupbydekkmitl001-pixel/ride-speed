import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const owners=Array.from({length:8},(_,n)=>`00000000-0000-4000-8000-${String(n+71).padStart(12,'0')}`);
export const [A,B,C,D,E,F,G,H]=owners;
export const id=n=>`80000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const request=(action,fields)=>({schema_version:1,action,...fields});
export const hash=(kind,value)=>createHash('sha256').update(`ride-speed:${kind}:v1:${value}`).digest('hex');
export const schema=`create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to public;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon,service_role;grant all on storage.objects to authenticated,service_role;
create schema realtime;create table realtime.messages(topic text,extension text,payload jsonb);alter table realtime.messages enable row level security;
grant usage on schema realtime to authenticated,service_role;grant select,insert on realtime.messages to authenticated;
create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
create function realtime.send(payload jsonb,event text,topic text,is_private boolean default true) returns void language sql as $$insert into realtime.messages(topic,extension,payload) values(topic,'broadcast',payload)$$;`;
export async function initialize(db,{roles=true}={}){
 if(roles)await db.exec('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;');
 await db.exec(schema);for(const owner of owners)await db.query('insert into auth.users values($1)',[owner]);
 const directory=new URL('../migrations/',import.meta.url);for(const file of(await readdir(directory)).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,directory),'utf8'));
}
export function ports(db){
 const admin=(sql,args=[])=>db.query(sql,args);
 const as=async(owner,sql,args=[])=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');}};
 const service=async(sql,args=[])=>{await db.exec('reset role;set role service_role');try{return await db.query(sql,args);}finally{await db.exec('reset role');}};
 const value=async(owner,sql,args=[])=> (await as(owner,sql,args)).rows[0].value;
 return {admin,as,service,value,mutate:(owner,op,req)=>value(owner,'select public.rs_live_mutate($1,$2::jsonb) as value',[op,JSON.stringify(req)]),snapshot:(owner,room)=>value(owner,'select public.rs_get_convoy($1) as value',[room])};
}
export async function profiles(p){for(const[ index,owner]of owners.entries()){await p.as(owner,'select public.rs_upsert_profile($1,$2)',[`live_${index}`,`Rider ${index}`]);const state=(await p.value(owner,'select public.rs_get_account_state() as value'));await p.as(owner,"select public.rs_update_account_state($1,'complete','granted','{\"ghost_mode\":false}'::jsonb)",[state.revision]);}}
export async function friends(p,one,two,generation=10){await p.admin(`insert into public.rs_friendships(user_low,user_high,requester_id,state,generation,updated_at) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'accepted',$3,now()-interval '2 days') on conflict(user_low,user_high) do update set state='accepted',generation=$3,updated_at=now()-interval '2 days'`,[one,two,generation]);}
export async function route(p,owner,routeId){const encode=(points)=>{let lat=0,lng=0,out='';const part=n=>{let x=n<0?~(n<<1):n<<1,s='';while(x>=32){s+=String.fromCharCode((32|(x&31))+63);x>>=5;}return s+String.fromCharCode(x+63);};for(const[a,b]of points){const x=Math.round(a*1e5),y=Math.round(b*1e5);out+=part(x-lat)+part(y-lng);lat=x;lng=y;}return out;};
 const document={schema_version:1,title:'Private fixture route',category:'scooter',visibility:'private',stops:[{lat:13.7,lng:100.5,label:'Secret home'},{lat:13.71,lng:100.5,label:'Secret finish'}],source:{kind:'recorded',segments:[encode([[13.7,100.5],[13.71,100.5]])]}};
 await p.as(owner,'select public.rs_save_route_v2($1,$2,0,$3::jsonb)',[id(Number(routeId.slice(-12))+50000),routeId,JSON.stringify(document)]);return p.value(owner,'select public.rs_get_route_projection($1) as value',[routeId]);
}
export async function room(p,owner,roomId,routeId,code='ABCD1234'){const projection=await route(p,owner,routeId);return p.mutate(owner,id(Number(roomId.slice(-12))+60000),request('convoy_create',{convoy_id:roomId,title:'Morning convoy',route_id:routeId,route_revision:1,reviewed_geometry_hash:projection.geometryHash,code_hash:hash('convoy-code',code),ttl_seconds:3600}));}
export async function join(p,owner,roomId,code,operation){const preview=(await p.value(owner,'select public.rs_resolve_convoy_code($1) as value',[code])).preview;return p.mutate(owner,operation,request('convoy_join',{convoy_id:roomId,proof_id:preview.proof_id,expected_room_revision:preview.room_revision,host_friendship_generation:preview.host_friendship_generation}));}
export async function approve(p,host,owner,roomId,operation){const view=await p.snapshot(host,roomId),member=view.members.find(x=>x.user_id===owner);return p.mutate(host,operation,request('convoy_member',{convoy_id:roomId,other_id:owner,verb:'approve',expected_room_revision:view.revision,expected_member_generation:member.generation,expected_member_state:member.state}));}
export async function start(p,host,roomId,operation){const view=await p.snapshot(host,roomId);return p.mutate(host,operation,request('convoy_start',{convoy_id:roomId,expected_room_revision:view.revision}));}
export async function grant(p,owner,roomId,operation,capture=id(999)){const view=await p.snapshot(owner,roomId);return p.mutate(owner,operation,request('location_grant',{convoy_id:roomId,expected_room_revision:view.revision,expected_member_generation:view.self_generation,expected_consent_revision:view.self_consent.revision,capture_id:capture,duration_seconds:900,precision:'precise'}));}
export async function sample(p,owner,roomId,sequence=1,extra={}){const view=await p.snapshot(owner,roomId);return {schema_version:1,convoy_id:roomId,topic_generation:view.topic_generation,member_generation:view.self_generation,consent_revision:view.self_consent.revision,lease_id:view.self_consent.lease_id,capture_id:view.self_consent.capture_id,sequence,latitude:13.705,longitude:100.5,accuracy_m:5,heading_deg:null,captured_at:new Date().toISOString(),source:{platform:'android',mocked:null,simulated:null},...extra};}
