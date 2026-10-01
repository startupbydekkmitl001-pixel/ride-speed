-- M5B: private four-person foreground convoy pilot. Default disabled.
-- Additive only; predecessor bodies/OIDs are preserved as revoked helpers.
begin;
create table ride_private.friend_links(id uuid primary key,issuer_id uuid not null references auth.users(id) on delete cascade,revision integer not null default 1 check(revision>0),token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),state text not null default 'active' check(state in('active','revoked')),created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null);
create table ride_private.convoys(id uuid primary key,host_id uuid not null references auth.users(id) on delete cascade,title text not null check(length(title) between 1 and 48),revision integer not null default 1 check(revision>0),state text not null default 'lobby' check(state in('lobby','active','ended','cancelled')),route_snapshot jsonb not null,created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,host_lease_until timestamptz not null,last_heartbeat_at timestamptz not null default clock_timestamp(),topic_id uuid not null default gen_random_uuid(),topic_generation integer not null default 1 check(topic_generation>0),change_revision integer not null default 1 check(change_revision>0),last_emit_at timestamptz,terminal_at timestamptz);
create table ride_private.convoy_codes(convoy_id uuid primary key references ride_private.convoys(id) on delete cascade,generation integer not null default 1 check(generation>0),code_hash text not null unique check(code_hash~'^[a-f0-9]{64}$'),expires_at timestamptz not null);
create table ride_private.convoy_members(convoy_id uuid not null references ride_private.convoys(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,role text not null check(role in('host','member')),state text not null check(state in('requested','accepted','declined','left','removed')),generation integer not null default 1 check(generation>0),host_friendship_generation integer,joined_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),primary key(convoy_id,user_id),check((role='host' and host_friendship_generation is null) or(role='member' and host_friendship_generation>0)));
create table ride_private.location_consents(convoy_id uuid not null,user_id uuid not null,revision integer not null default 0 check(revision>=0),precision text not null default 'none' check(precision in('none','precise')),member_generation integer not null check(member_generation>0),lease_id uuid,capture_id uuid,granted_at timestamptz,expires_at timestamptz,last_sequence integer not null default 0 check(last_sequence>=0),last_sample_hash text,last_received_at timestamptz,primary key(convoy_id,user_id),foreign key(convoy_id,user_id) references ride_private.convoy_members(convoy_id,user_id) on delete cascade,check((precision='none' and lease_id is null and capture_id is null and expires_at is null) or(precision='precise' and lease_id is not null and capture_id is not null and granted_at is not null and expires_at is not null)));
create table ride_private.live_positions(convoy_id uuid not null,user_id uuid not null,member_generation integer not null,consent_revision integer not null,lease_id uuid not null,capture_id uuid not null,sequence integer not null check(sequence>0),sample_hash text not null,latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),accuracy_m double precision not null check(accuracy_m>0 and accuracy_m<=20),heading_deg double precision check(heading_deg>=0 and heading_deg<360),captured_at timestamptz not null,received_at timestamptz not null,expires_at timestamptz not null,source jsonb not null,primary key(convoy_id,user_id),foreign key(convoy_id,user_id) references ride_private.location_consents(convoy_id,user_id) on delete cascade);
create table ride_private.live_proofs(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,kind text not null check(kind in('friend_link','convoy_code')),resource_id uuid not null,issuer_id uuid not null references auth.users(id) on delete cascade,resource_generation integer not null check(resource_generation>0),host_friendship_generation integer,expires_at timestamptz not null,used_operation uuid);
create table ride_private.live_operations(owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,request jsonb not null,result jsonb not null,applied_at timestamptz not null default clock_timestamp(),primary key(owner_id,operation_id));
create table ride_private.live_grant_cancellations(owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,request jsonb not null,cancelled_at timestamptz not null default clock_timestamp(),primary key(owner_id,operation_id));
create table ride_private.live_admission(subject uuid not null,action text not null,bucket timestamptz not null,hits integer not null check(hits>=0),primary key(subject,action,bucket));
create table ride_private.live_poll_slots(owner_id uuid primary key references auth.users(id) on delete cascade,last_at timestamptz not null);
create table ride_private.live_policy(singleton boolean primary key default true check(singleton),live_enabled boolean not null default false,room_cap integer not null default 2 check(room_cap between 1 and 2));
insert into ride_private.live_policy(singleton) values(true);
create index rs_live_links_owner on ride_private.friend_links(issuer_id,state,expires_at);
create index rs_live_rooms_host on ride_private.convoys(host_id,state,expires_at);
create index rs_live_rooms_expiry on ride_private.convoys(state,host_lease_until,expires_at);
create index rs_live_members_owner on ride_private.convoy_members(user_id,state,convoy_id);
create index rs_live_members_room on ride_private.convoy_members(convoy_id,state);
create index rs_live_proofs_owner on ride_private.live_proofs(owner_id,expires_at);
create index rs_live_proofs_issuer on ride_private.live_proofs(issuer_id,resource_id);
create index rs_live_proofs_expiry on ride_private.live_proofs(expires_at);
create index rs_live_positions_expiry on ride_private.live_positions(expires_at);
do $$declare t text;begin foreach t in array array['friend_links','convoys','convoy_codes','convoy_members','location_consents','live_positions','live_proofs','live_operations','live_grant_cancellations','live_admission','live_poll_slots','live_policy'] loop execute format('alter table ride_private.%I enable row level security',t);execute format('revoke all on ride_private.%I from public,anon,authenticated,service_role',t);end loop;end$$;
grant select,update on ride_private.live_policy to service_role;

create function ride_private.live_control_lock() returns void language sql volatile set search_path='' as $$select pg_advisory_xact_lock(hashtextextended('ride-live-control-v1',0))$$;
create function ride_private.live_error(code text) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('error',jsonb_build_object('code',code))$$;
create function ride_private.live_reject(code text) returns void language plpgsql immutable set search_path='' as $$begin raise exception '%',code using errcode='RL001';end$$;
create function ride_private.live_actor() returns uuid language plpgsql volatile set search_path='' as $$declare uid uuid:=ride_private.actor();begin perform ride_private.live_control_lock();return uid;end$$;
create function ride_private.live_enabled() returns boolean language sql stable security definer set search_path='' as $$select live_enabled from ride_private.live_policy where singleton$$;
create function ride_private.live_admit(uid uuid,label text,window_at timestamptz,cap integer,units integer default 1) returns boolean language plpgsql volatile set search_path='' as $$declare n integer;begin
 insert into ride_private.live_admission(subject,action,bucket,hits) values(uid,label,window_at,units) on conflict(subject,action,bucket) do update set hits=live_admission.hits+units where live_admission.hits+units<=cap returning hits into n;return n is not null;
end$$;
create function ride_private.live_attempt(uid uuid,label text,minute_cap integer,day_cap integer,project_cap integer default null) returns boolean language plpgsql volatile set search_path='' as $$declare stamp timestamptz:=clock_timestamp();ok boolean;begin
 ok:=ride_private.live_admit(uid,label||'_minute',date_trunc('minute',stamp),minute_cap);
 ok:=ride_private.live_admit(uid,label||'_day',date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC',day_cap) and ok;
 if project_cap is not null then ok:=ride_private.live_admit('00000000-0000-0000-0000-000000000000',label||'_project',date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC',project_cap) and ok;end if;return ok;
end$$;
create function ride_private.live_emit(room uuid,event_kind text,old_topic uuid default null,old_generation integer default null) returns void language plpgsql volatile set search_path='' as $$declare c ride_private.convoys;stamp timestamptz:=clock_timestamp();ok boolean;begin
 select * into c from ride_private.convoys where id=room;if c.id is null then return;end if;
 if event_kind='positions_changed' and c.last_emit_at>stamp-interval '1 second' then return;end if;
 ok:=ride_private.live_admit('00000000-0000-0000-0000-000000000000',case when event_kind='positions_changed' then 'hint_day' else 'control_hint_day' end,date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC',case when event_kind='positions_changed' then 7200 else 1000 end,5);
 ok:=ride_private.live_admit('00000000-0000-0000-0000-000000000000',case when event_kind='positions_changed' then 'hint_month' else 'control_hint_month' end,date_trunc('month',stamp at time zone 'UTC') at time zone 'UTC',case when event_kind='positions_changed' then 200000 else 20000 end,5) and ok;
 if ok then perform realtime.send(jsonb_build_object('schema_version',1,'convoy_id',room,'topic_generation',coalesce(old_generation,c.topic_generation),'change_revision',c.change_revision,'kind',event_kind),'convoy','rs-convoy:'||coalesce(old_topic,c.topic_id)::text,true);end if;
 if event_kind='positions_changed' then update ride_private.convoys set last_emit_at=stamp where id=room;end if;
end$$;
create function ride_private.live_rotate(room uuid) returns void language plpgsql volatile set search_path='' as $$declare c ride_private.convoys;begin
 select * into c from ride_private.convoys where id=room for update;if c.id is null then return;end if;
 perform ride_private.live_emit(room,'room_changed',c.topic_id,c.topic_generation);
 delete from ride_private.live_positions where convoy_id=room;
 update ride_private.convoys set topic_id=gen_random_uuid(),topic_generation=topic_generation+1,change_revision=change_revision+1,last_emit_at=null where id=room;
end$$;
create function ride_private.live_close(room uuid,new_state text default 'cancelled') returns void language plpgsql volatile set search_path='' as $$begin
 if not exists(select 1 from ride_private.convoys where id=room and state in('lobby','active')) then return;end if;
 perform ride_private.live_rotate(room);
 update ride_private.convoys set state=new_state,revision=revision+1,terminal_at=clock_timestamp() where id=room;
 update ride_private.location_consents set precision='none',revision=revision+1,lease_id=null,capture_id=null,granted_at=null,expires_at=null,last_sequence=0,last_sample_hash=null,last_received_at=null where convoy_id=room and precision='precise';
 delete from ride_private.convoy_codes where convoy_id=room;delete from ride_private.live_proofs where kind='convoy_code' and resource_id=room;
end$$;
create function ride_private.live_friend_generation(one uuid,two uuid) returns integer language sql stable security definer set search_path='' as $$select generation from public.rs_friendships where user_low=least(one,two) and user_high=greatest(one,two) and state='accepted' and not ride_private.blocked(one,two) and ride_private.account_active(one) and ride_private.account_active(two)$$;
create function ride_private.live_room_valid(room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(c.state in('lobby','active') and c.expires_at>clock_timestamp() and c.host_lease_until>clock_timestamp() and ride_private.account_active(c.host_id)
 and not exists(select 1 from ride_private.convoy_members m where m.convoy_id=c.id and m.state in('requested','accepted') and(not ride_private.account_active(m.user_id) or(m.role='member' and m.host_friendship_generation is distinct from ride_private.live_friend_generation(c.host_id,m.user_id))))
 and not exists(select 1 from ride_private.convoy_members a join ride_private.convoy_members b on b.convoy_id=a.convoy_id and b.user_id>a.user_id where a.convoy_id=c.id and a.state in('requested','accepted') and b.state in('requested','accepted') and ride_private.blocked(a.user_id,b.user_id)),false) from ride_private.convoys c where c.id=room
$$;
create function ride_private.live_repair() returns void language plpgsql volatile set search_path='' as $$declare c record;begin
 for c in select id from ride_private.convoys where state in('lobby','active') order by id loop if not coalesce(ride_private.live_room_valid(c.id),false) then perform ride_private.live_close(c.id);end if;end loop;
end$$;
create function ride_private.live_privacy(uid uuid) returns void language plpgsql volatile set search_path='' as $$declare c record;begin
 if not ride_private.account_active(uid) then
 update ride_private.friend_links set state='revoked',revision=revision+1 where issuer_id=uid and state='active';delete from ride_private.live_proofs where issuer_id=uid or owner_id=uid;
 end if;
 perform ride_private.live_repair();
 for c in select l.convoy_id from ride_private.location_consents l join ride_private.convoys r on r.id=l.convoy_id where l.user_id=uid and l.precision='precise' and r.state in('lobby','active') and(not coalesce((select p.presence_opt_in from public.rs_profiles p where p.user_id=uid),false) or coalesce((select(a.preferences->>'ghost_mode')::boolean from public.rs_account_state a where a.user_id=uid),true)) order by l.convoy_id loop
 update ride_private.location_consents set revision=revision+1,precision='none',lease_id=null,capture_id=null,granted_at=null,expires_at=null,last_sequence=0,last_sample_hash=null,last_received_at=null where convoy_id=c.convoy_id and user_id=uid;
 perform ride_private.live_rotate(c.convoy_id);
 end loop;
end$$;
create function ride_private.live_receipt(uid uuid,op uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('owner_id',owner_id,'operation_id',operation_id,'request',request,'applied_at',applied_at,'result',result) from ride_private.live_operations where owner_id=uid and operation_id=op$$;
create function ride_private.live_request(p jsonb,uid uuid) returns jsonb language plpgsql immutable set search_path='' as $$declare keys text[];a text:=p->>'action';k text;begin
 if p is not null and octet_length(p::text)>16384 then perform ride_private.live_reject('LIVE_TOO_LARGE');end if;
 if p is null or jsonb_typeof(p)<>'object' or p->'schema_version' is distinct from '1'::jsonb then perform ride_private.live_reject('LIVE_INVALID');end if;
 keys:=case a when 'friend_link_create' then array['schema_version','action','link_id','token_hash','ttl_seconds'] when 'friend_link_revoke' then array['schema_version','action','link_id','expected_revision'] when 'friend_link_request' then array['schema_version','action','proof_id','issuer_id']
 when 'convoy_create' then array['schema_version','action','convoy_id','title','route_id','route_revision','reviewed_geometry_hash','code_hash','ttl_seconds'] when 'convoy_join' then array['schema_version','action','convoy_id','proof_id','expected_room_revision','host_friendship_generation']
 when 'convoy_member' then array['schema_version','action','convoy_id','other_id','verb','expected_room_revision','expected_member_generation','expected_member_state'] when 'convoy_start' then array['schema_version','action','convoy_id','expected_room_revision'] when 'convoy_end' then array['schema_version','action','convoy_id','expected_room_revision','verb'] when 'convoy_code_rotate' then array['schema_version','action','convoy_id','expected_room_revision','code_hash']
 when 'location_grant' then array['schema_version','action','convoy_id','expected_room_revision','expected_member_generation','expected_consent_revision','capture_id','duration_seconds','precision'] when 'location_revoke' then array['schema_version','action','convoy_id','expected_member_generation','expected_consent_revision','expected_lease_id'] end;
 if keys is null or not p?&keys or p-keys<>'{}' then perform ride_private.live_reject('LIVE_INVALID');end if;
 foreach k in array array['link_id','proof_id','issuer_id','convoy_id','route_id','other_id','capture_id'] loop if p?k and not ride_private.social_uuid(p->k) then perform ride_private.live_reject('LIVE_INVALID');end if;end loop;
 foreach k in array array['expected_revision','route_revision','expected_room_revision','host_friendship_generation','expected_member_generation'] loop if p?k and not ride_private.ride_number(p->k,1,2147483647,false,true) then perform ride_private.live_reject('LIVE_INVALID');end if;end loop;
 if p?'expected_consent_revision' and not ride_private.ride_number(p->'expected_consent_revision',0,2147483647,false,true) then perform ride_private.live_reject('LIVE_INVALID');end if;
 foreach k in array array['token_hash','code_hash'] loop if p?k and(jsonb_typeof(p->k)<>'string' or p->>k!~'^[a-f0-9]{64}$') then perform ride_private.live_reject('LIVE_INVALID');end if;end loop;
 if a='friend_link_create' and p->'ttl_seconds' not in('3600'::jsonb,'86400'::jsonb) then perform ride_private.live_reject('LIVE_INVALID');end if;
 if a='friend_link_request' and(p->>'issuer_id')::uuid=uid then perform ride_private.live_reject('LIVE_INVALID');end if;
 if a='convoy_create' and(not ride_private.garage_text(p->'title',48,false) or p->'ttl_seconds'<>'3600' or not(p->'reviewed_geometry_hash'='null' or(jsonb_typeof(p->'reviewed_geometry_hash')='string' and p->>'reviewed_geometry_hash'~'^[a-f0-9]{64}$'))) then perform ride_private.live_reject('LIVE_INVALID');end if;
 if a='convoy_member' and(jsonb_typeof(p->'verb')<>'string' or p->>'verb' not in('approve','decline','remove','leave') or jsonb_typeof(p->'expected_member_state')<>'string' or p->>'expected_member_state' not in('requested','accepted') or(p->>'verb'='leave' and(p->>'other_id')::uuid<>uid)) then perform ride_private.live_reject('LIVE_INVALID');end if;
 if a='convoy_end' and(jsonb_typeof(p->'verb')<>'string' or p->>'verb' not in('end','cancel')) then perform ride_private.live_reject('LIVE_INVALID');end if;
 if a='location_grant' and(p->'duration_seconds' not in('900'::jsonb,'3600'::jsonb) or p->'precision'<>'"precise"') then perform ride_private.live_reject('LIVE_INVALID');end if;
 if a='location_revoke' and not ride_private.social_uuid(p->'expected_lease_id',true) then perform ride_private.live_reject('LIVE_INVALID');end if;
 return p;
end$$;

create function public.rs_live_operation(p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();begin if p_operation is null then raise exception 'LIVE_INVALID' using errcode='22023';end if;return ride_private.live_receipt(uid,p_operation);end$$;
create function public.rs_friend_links() returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.live_actor();begin return jsonb_build_object('owner_id',uid,'server_now',clock_timestamp(),'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'state',state,'expires_at',expires_at) order by created_at desc,id) from ride_private.friend_links where issuer_id=uid and state='active' and expires_at>clock_timestamp()),'[]'::jsonb));end$$;
create function public.rs_resolve_friend_link(p_link uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=auth.uid();link ride_private.friend_links;profile public.rs_profiles;proof uuid;preview jsonb;stamp timestamptz;begin
 if uid is null then return ride_private.live_error('LIVE_AUTH_REQUIRED');end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();if not ride_private.account_active(uid) then return ride_private.live_error('ACCOUNT_DELETION_PENDING');end if;
 if p_token is not null and octet_length(p_token)>500 then return ride_private.live_error('LIVE_TOO_LARGE');end if;
 if not ride_private.live_attempt(uid,'resolve',10,100,1000) then return ride_private.live_error('LIVE_RATE_LIMITED');end if;
 if p_link is null or p_token is null or p_token!~'^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' then return ride_private.live_error('LIVE_INVALID');end if;
 stamp:=clock_timestamp();select * into link from ride_private.friend_links where id=p_link and token_hash=encode(sha256(convert_to('ride-speed:friend-link:v1:'||p_token,'UTF8')),'hex') and state='active' and expires_at>stamp;
 if link.id is not null and link.issuer_id<>uid and ride_private.account_active(link.issuer_id) and not ride_private.blocked(uid,link.issuer_id) then
 select * into profile from public.rs_profiles where user_id=link.issuer_id;
 if profile.user_id is not null then
 if(select count(*) from ride_private.live_proofs where owner_id=uid and expires_at>stamp and used_operation is null)>=16 then return ride_private.live_error('LIVE_CAPACITY');end if;
 insert into ride_private.live_proofs(owner_id,kind,resource_id,issuer_id,resource_generation,expires_at) values(uid,'friend_link',link.id,link.issuer_id,link.revision,least(stamp+interval '5 minutes',link.expires_at)) returning id into proof;
 preview:=jsonb_build_object('proof_id',proof,'link_id',link.id,'issuer_id',link.issuer_id,'handle',profile.handle,'display_name',ride_private.social_display_name(profile.display_name,profile.handle),'expires_at',least(stamp+interval '5 minutes',link.expires_at));end if;end if;
 return jsonb_build_object('owner_id',uid,'server_now',stamp,'preview',preview);
end$$;
create function public.rs_resolve_convoy_code(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=auth.uid();code text;room ride_private.convoys;code_row ride_private.convoy_codes;profile public.rs_profiles;proof uuid;generation integer;preview jsonb;stamp timestamptz;begin
 if uid is null then return ride_private.live_error('LIVE_AUTH_REQUIRED');end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();if not ride_private.account_active(uid) then return ride_private.live_error('ACCOUNT_DELETION_PENDING');end if;
 if p_code is not null and octet_length(p_code)>500 then return ride_private.live_error('LIVE_TOO_LARGE');end if;
 if not ride_private.live_attempt(uid,'resolve',10,100,1000) then return ride_private.live_error('LIVE_RATE_LIMITED');end if;
 code:=upper(replace(replace(p_code,'-',''),' ',''));if code is null or code!~'^[0-9A-HJKMNP-TV-Z]{8}$' then return ride_private.live_error('LIVE_INVALID');end if;
 if not ride_private.live_enabled() then return ride_private.live_error('LIVE_DISABLED');end if;perform ride_private.live_repair();stamp:=clock_timestamp();
 select * into code_row from ride_private.convoy_codes where code_hash=encode(sha256(convert_to('ride-speed:convoy-code:v1:'||code,'UTF8')),'hex') and expires_at>stamp;
 select * into room from ride_private.convoys where id=code_row.convoy_id and state in('lobby','active');generation:=ride_private.live_friend_generation(uid,room.host_id);
 if room.id is not null and room.host_id<>uid and generation is not null and not exists(select 1 from ride_private.convoy_members m where m.convoy_id=room.id and m.state in('accepted','requested') and ride_private.blocked(uid,m.user_id)) then
 select * into profile from public.rs_profiles where user_id=room.host_id;
 if(select count(*) from ride_private.live_proofs where owner_id=uid and expires_at>stamp and used_operation is null)>=16 then return ride_private.live_error('LIVE_CAPACITY');end if;
 insert into ride_private.live_proofs(owner_id,kind,resource_id,issuer_id,resource_generation,host_friendship_generation,expires_at) values(uid,'convoy_code',room.id,room.host_id,code_row.generation,generation,least(stamp+interval '5 minutes',code_row.expires_at,room.expires_at)) returning id into proof;
 preview:=jsonb_build_object('proof_id',proof,'convoy_id',room.id,'host_id',room.host_id,'host_name',ride_private.social_display_name(profile.display_name,profile.handle),'title',room.title,'room_revision',room.revision,'host_friendship_generation',generation,'expires_at',least(stamp+interval '5 minutes',code_row.expires_at,room.expires_at));end if;
 return jsonb_build_object('owner_id',uid,'server_now',stamp,'preview',preview);
end$$;

create function public.rs_live_mutate(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare uid uuid:=auth.uid();req jsonb;existing ride_private.live_operations;a text;stamp timestamptz;outcome jsonb;c ride_private.convoys;m ride_private.convoy_members;l ride_private.location_consents;link ride_private.friend_links;proof ride_private.live_proofs;r public.rs_routes;projection jsonb;other uuid;generation integer;f public.rs_friendships;handle text;hits integer;lease uuid;terminal text;code text;constraint_name text;
begin
 if uid is null then return ride_private.live_error('LIVE_AUTH_REQUIRED');end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();if not ride_private.account_active(uid) then return ride_private.live_error('ACCOUNT_DELETION_PENDING');end if;
 if p_operation is null then return ride_private.live_error('LIVE_INVALID');end if;
 begin req:=ride_private.live_request(p_request,uid);exception when sqlstate 'RL001' then return ride_private.live_error(sqlerrm);end;
 select * into existing from ride_private.live_operations where owner_id=uid and operation_id=p_operation;
 if found then if existing.request<>req then return ride_private.live_error('LIVE_OPERATION_CONFLICT');end if;return ride_private.live_receipt(uid,p_operation);end if;
 if exists(select 1 from ride_private.live_grant_cancellations where owner_id=uid and operation_id=p_operation) then
 if not exists(select 1 from ride_private.live_grant_cancellations where owner_id=uid and operation_id=p_operation and request=req) then return ride_private.live_error('LIVE_OPERATION_CONFLICT');end if;return ride_private.live_error('LIVE_OPERATION_CANCELLED');end if;
 if not exists(select 1 from public.rs_profiles where user_id=uid) then return ride_private.live_error('PROFILE_REQUIRED');end if;
 a:=req->>'action';if a not like 'friend_link_%' and not ride_private.live_enabled() then return ride_private.live_error('LIVE_DISABLED');end if;
 if not ride_private.live_attempt(uid,'control',60,240) then return ride_private.live_error('LIVE_RATE_LIMITED');end if;
 if a='friend_link_request' then
 insert into ride_private.daily_quotas(user_id,action,bucket,hits) values(uid,'social_friend_probe',(clock_timestamp() at time zone 'UTC')::date,1) on conflict(user_id,action,bucket) do update set hits=daily_quotas.hits+1 where daily_quotas.hits<40 returning daily_quotas.hits into hits;
 if hits is null then return ride_private.live_error('LIVE_RATE_LIMITED');end if;end if;
 if a='convoy_create' and not ride_private.live_attempt(uid,'room_create',10,10,20) then return ride_private.live_error('LIVE_RATE_LIMITED');end if;
 -- Expiry/invariant repair is outside the recognized-rejection subtransaction.
 perform ride_private.live_repair();stamp:=clock_timestamp();
 begin
 if a='friend_link_create' then
 if exists(select 1 from ride_private.friend_links where id=(req->>'link_id')::uuid or token_hash=req->>'token_hash') then perform ride_private.live_reject('FRIEND_LINK_UNAVAILABLE');end if;
 if(select count(*) from ride_private.friend_links where issuer_id=uid and state='active' and expires_at>stamp)>=8 then perform ride_private.live_reject('LIVE_CAPACITY');end if;
 insert into ride_private.friend_links(id,issuer_id,token_hash,expires_at) values((req->>'link_id')::uuid,uid,req->>'token_hash',stamp+make_interval(secs=>(req->>'ttl_seconds')::integer)) returning * into link;
 outcome:=jsonb_build_object('kind','friend_link','link_id',link.id,'revision',link.revision,'state',link.state,'expires_at',link.expires_at);
 elsif a='friend_link_revoke' then
 select * into link from ride_private.friend_links where id=(req->>'link_id')::uuid and issuer_id=uid for update;
 if link.id is null or link.revision<>(req->>'expected_revision')::integer then perform ride_private.live_reject('FRIEND_LINK_UNAVAILABLE');end if;
 if link.state='active' then update ride_private.friend_links set state='revoked',revision=revision+1 where id=link.id returning * into link;delete from ride_private.live_proofs where kind='friend_link' and resource_id=link.id;end if;
 outcome:=jsonb_build_object('kind','friend_link','link_id',link.id,'revision',link.revision,'state',link.state,'expires_at',link.expires_at);
 elsif a='friend_link_request' then
 select * into proof from ride_private.live_proofs where id=(req->>'proof_id')::uuid and owner_id=uid and kind='friend_link' and issuer_id=(req->>'issuer_id')::uuid and expires_at>stamp and used_operation is null for update;
 select * into link from ride_private.friend_links where id=proof.resource_id and issuer_id=proof.issuer_id and revision=proof.resource_generation and state='active' and expires_at>stamp;
 if link.id is null or not ride_private.account_active(link.issuer_id) or ride_private.blocked(uid,link.issuer_id) then perform ride_private.live_reject('FRIEND_LINK_UNAVAILABLE');end if;
 select p.handle into handle from public.rs_profiles p where p.user_id=link.issuer_id for share;
 if handle is null then perform ride_private.live_reject('FRIEND_LINK_UNAVAILABLE');end if;other:=link.issuer_id;perform ride_private.pair_lock(uid,other);
 select * into f from public.rs_friendships where user_low=least(uid,other) and user_high=greatest(uid,other) for update;
 if f.user_low is not null and f.state not in('accepted','pending') and f.updated_at>stamp-interval '1 day' then perform ride_private.live_reject('FRIEND_LINK_UNAVAILABLE');end if;
 perform public.rs_request_friend(handle);select * into strict f from public.rs_friendships where user_low=least(uid,other) and user_high=greatest(uid,other);
 update ride_private.live_proofs set used_operation=p_operation where id=proof.id;
 outcome:=jsonb_build_object('kind','friend','user_id',other,'state',case when f.state='accepted' then 'accepted' when f.requester_id=uid then 'outgoing' else 'incoming' end,'generation',f.generation);
 elsif a='convoy_create' then
 if exists(select 1 from ride_private.convoys where id=(req->>'convoy_id')::uuid) or exists(select 1 from ride_private.convoy_codes where code_hash=req->>'code_hash') then perform ride_private.live_reject('CONVOY_UNAVAILABLE');end if;
 if exists(select 1 from ride_private.convoy_members m join ride_private.convoys c on c.id=m.convoy_id where m.user_id=uid and m.state in('requested','accepted') and c.state in('lobby','active')) then perform ride_private.live_reject('CONVOY_CHANGED');end if;
 if(select count(*) from ride_private.convoys where state in('lobby','active'))>=(select room_cap from ride_private.live_policy where singleton) then perform ride_private.live_reject('LIVE_CAPACITY');end if;
 select * into r from public.rs_routes where id=(req->>'route_id')::uuid and owner_id=uid and revision=(req->>'route_revision')::integer for share;
 projection:=ride_private.social_safe_snapshot(ride_private.route_safe_snapshot(r.id));
 if r.id is null or projection is null or projection->>'provider'='draft' or projection->'geometryHash' is distinct from req->'reviewed_geometry_hash' then perform ride_private.live_reject('CONVOY_CHANGED');end if;
 insert into ride_private.convoys(id,host_id,title,route_snapshot,expires_at,host_lease_until) values((req->>'convoy_id')::uuid,uid,req->>'title',projection,stamp+interval '1 hour',stamp+interval '45 seconds') returning * into c;
 insert into ride_private.convoy_codes(convoy_id,code_hash,expires_at) values(c.id,req->>'code_hash',c.expires_at);
 insert into ride_private.convoy_members(convoy_id,user_id,role,state) values(c.id,uid,'host','accepted');insert into ride_private.location_consents(convoy_id,user_id,member_generation) values(c.id,uid,1);
 outcome:=jsonb_build_object('kind','convoy','convoy_id',c.id,'revision',c.revision,'state',c.state);
 else
 select * into c from ride_private.convoys where id=(req->>'convoy_id')::uuid for update;
 if c.id is null or not ride_private.account_active(c.host_id) then perform ride_private.live_reject('CONVOY_UNAVAILABLE');end if;
 if req?'expected_room_revision' and c.revision<>(req->>'expected_room_revision')::integer then perform ride_private.live_reject('CONVOY_CHANGED');end if;
 if c.state not in('lobby','active') then perform ride_private.live_reject('CONVOY_UNAVAILABLE');end if;
 if a='convoy_join' then
 select * into proof from ride_private.live_proofs where id=(req->>'proof_id')::uuid and owner_id=uid and kind='convoy_code' and resource_id=c.id and issuer_id=c.host_id and expires_at>stamp and used_operation is null for update;
 if proof.id is null or not exists(select 1 from ride_private.convoy_codes where convoy_id=c.id and generation=proof.resource_generation and expires_at>stamp) then perform ride_private.live_reject('CONVOY_CHANGED');end if;
 generation:=ride_private.live_friend_generation(uid,c.host_id);
 if uid=c.host_id or generation is null or generation<>(req->>'host_friendship_generation')::integer or generation<>proof.host_friendship_generation or exists(select 1 from ride_private.convoy_members x where x.convoy_id=c.id and x.state in('requested','accepted') and ride_private.blocked(uid,x.user_id)) then perform ride_private.live_reject('FRIEND_CHANGED');end if;
 if exists(select 1 from ride_private.convoy_members x join ride_private.convoys y on y.id=x.convoy_id where x.user_id=uid and x.state in('requested','accepted') and y.state in('lobby','active')) then perform ride_private.live_reject('CONVOY_CHANGED');end if;
 select * into m from ride_private.convoy_members where convoy_id=c.id and user_id=uid;
 if(select count(*) from ride_private.convoy_members where convoy_id=c.id and state='requested')>=12 or(m.user_id is null and(select count(*) from ride_private.convoy_members where convoy_id=c.id)>=24) then perform ride_private.live_reject('CONVOY_FULL');end if;
 insert into ride_private.convoy_members(convoy_id,user_id,role,state,host_friendship_generation) values(c.id,uid,'member','requested',generation) on conflict(convoy_id,user_id) do update set state='requested',generation=convoy_members.generation+1,host_friendship_generation=excluded.host_friendship_generation,updated_at=stamp returning * into m;
 insert into ride_private.location_consents(convoy_id,user_id,member_generation) values(c.id,uid,m.generation) on conflict(convoy_id,user_id) do update set precision='none',revision=location_consents.revision+1,member_generation=excluded.member_generation,lease_id=null,capture_id=null,granted_at=null,expires_at=null,last_sequence=0,last_sample_hash=null,last_received_at=null;
 update ride_private.live_proofs set used_operation=p_operation where id=proof.id;update ride_private.convoys set revision=revision+1 where id=c.id returning * into c;perform ride_private.live_rotate(c.id);
 outcome:=jsonb_build_object('kind','member','convoy_id',c.id,'user_id',uid,'room_revision',c.revision,'state',m.state,'generation',m.generation);
 elsif a='convoy_member' then
 other:=(req->>'other_id')::uuid;select * into m from ride_private.convoy_members where convoy_id=c.id and user_id=other for update;
 if m.user_id is null or m.role='host' or m.generation<>(req->>'expected_member_generation')::integer or m.state<>req->>'expected_member_state' then perform ride_private.live_reject('CONVOY_CHANGED');end if;
 if(req->>'verb'='leave' and uid<>other) or(req->>'verb'<>'leave' and uid<>c.host_id) then perform ride_private.live_reject('CONVOY_UNAVAILABLE');end if;
 terminal:=case when req->>'verb'='approve' and m.state='requested' then 'accepted' when req->>'verb'='decline' and m.state='requested' then 'declined' when req->>'verb'='remove' and m.state='accepted' then 'removed' when req->>'verb'='leave' then 'left' end;
 if terminal is null then perform ride_private.live_reject('CONVOY_CHANGED');end if;
 if terminal='accepted' and(select count(*) from ride_private.convoy_members where convoy_id=c.id and state='accepted')>=4 then perform ride_private.live_reject('CONVOY_FULL');end if;
 update ride_private.convoy_members set state=terminal,generation=generation+1,updated_at=stamp where convoy_id=c.id and user_id=other returning * into m;
 update ride_private.location_consents set precision='none',revision=revision+1,member_generation=m.generation,lease_id=null,capture_id=null,granted_at=null,expires_at=null,last_sequence=0,last_sample_hash=null,last_received_at=null where convoy_id=c.id and user_id=other;
 update ride_private.convoys set revision=revision+1 where id=c.id returning * into c;perform ride_private.live_rotate(c.id);
 outcome:=jsonb_build_object('kind','member','convoy_id',c.id,'user_id',other,'room_revision',c.revision,'state',m.state,'generation',m.generation);
 elsif a in('convoy_start','convoy_end','convoy_code_rotate') then
 if uid<>c.host_id then perform ride_private.live_reject('CONVOY_UNAVAILABLE');end if;
 if a='convoy_start' then
 if c.state<>'lobby' then perform ride_private.live_reject('CONVOY_CHANGED');end if;if(select count(*) from ride_private.convoy_members where convoy_id=c.id and state='accepted')<2 then perform ride_private.live_reject('CONVOY_FULL');end if;
 update ride_private.convoys set state='active',revision=revision+1 where id=c.id returning * into c;perform ride_private.live_rotate(c.id);
 elsif a='convoy_end' then perform ride_private.live_close(c.id,case when req->>'verb'='end' then 'ended' else 'cancelled' end);select * into c from ride_private.convoys where id=c.id;
 else
 if exists(select 1 from ride_private.convoy_codes where code_hash=req->>'code_hash') then perform ride_private.live_reject('CONVOY_CHANGED');end if;
 update ride_private.convoy_codes set generation=generation+1,code_hash=req->>'code_hash',expires_at=least(stamp+interval '1 hour',c.expires_at) where convoy_id=c.id;
 delete from ride_private.live_proofs where kind='convoy_code' and resource_id=c.id;update ride_private.convoys set revision=revision+1 where id=c.id returning * into c;perform ride_private.live_rotate(c.id);end if;
 outcome:=jsonb_build_object('kind','convoy','convoy_id',c.id,'revision',c.revision,'state',c.state);
 elsif a in('location_grant','location_revoke') then
 select * into m from ride_private.convoy_members where convoy_id=c.id and user_id=uid for update;
 if m.user_id is null or m.state<>'accepted' or m.generation<>(req->>'expected_member_generation')::integer then perform ride_private.live_reject('CONVOY_CHANGED');end if;
 select * into strict l from ride_private.location_consents where convoy_id=c.id and user_id=uid for update;
 if l.revision<>(req->>'expected_consent_revision')::integer then perform ride_private.live_reject('LOCATION_CONSENT_CHANGED');end if;
 if a='location_grant' then
 if c.state<>'active' or not coalesce((select presence_opt_in from public.rs_profiles where user_id=uid),false) or coalesce((select(preferences->>'ghost_mode')::boolean from public.rs_account_state where user_id=uid),true) then perform ride_private.live_reject('LOCATION_CONSENT_REQUIRED');end if;
 update ride_private.location_consents set revision=revision+1,precision='precise',member_generation=m.generation,lease_id=gen_random_uuid(),capture_id=(req->>'capture_id')::uuid,granted_at=stamp,expires_at=least(stamp+make_interval(secs=>(req->>'duration_seconds')::integer),c.expires_at),last_sequence=0,last_sample_hash=null,last_received_at=null where convoy_id=c.id and user_id=uid returning * into l;perform ride_private.live_rotate(c.id);
 elsif l.precision='precise' then
 if l.lease_id is distinct from(req->>'expected_lease_id')::uuid then perform ride_private.live_reject('LOCATION_CONSENT_CHANGED');end if;
 update ride_private.location_consents set revision=revision+1,precision='none',lease_id=null,capture_id=null,granted_at=null,expires_at=null,last_sequence=0,last_sample_hash=null,last_received_at=null where convoy_id=c.id and user_id=uid returning * into l;perform ride_private.live_rotate(c.id);
 elsif req->'expected_lease_id'<>'null' then perform ride_private.live_reject('LOCATION_CONSENT_CHANGED');end if;
 outcome:=jsonb_build_object('kind','consent','convoy_id',c.id,'revision',l.revision,'precision',l.precision,'lease_id',l.lease_id,'capture_id',l.capture_id,'expires_at',l.expires_at);
 end if;end if;
 insert into ride_private.live_operations(owner_id,operation_id,request,result) values(uid,p_operation,req,outcome);return ride_private.live_receipt(uid,p_operation);
 exception when sqlstate 'RL001' then
 code:=sqlerrm;if code not in('LIVE_INVALID','LIVE_TOO_LARGE','LIVE_OPERATION_CONFLICT','LIVE_UNAVAILABLE','LIVE_RATE_LIMITED','LIVE_AUTH_REQUIRED','LIVE_DISABLED','LIVE_CAPACITY','PROFILE_REQUIRED','FRIEND_CHANGED','FRIEND_LINK_UNAVAILABLE','CONVOY_UNAVAILABLE','CONVOY_CHANGED','CONVOY_FULL','LOCATION_CONSENT_REQUIRED','LOCATION_CONSENT_CHANGED','LOCATION_STALE','LOCATION_QUALITY','POSITION_SEQUENCE','ACCOUNT_DELETION_PENDING') then raise;end if;return ride_private.live_error(code);
 when raise_exception then if sqlerrm='Daily action limit reached' then return ride_private.live_error('LIVE_RATE_LIMITED');else raise;end if;
 when unique_violation then get stacked diagnostics constraint_name=CONSTRAINT_NAME;if constraint_name in('friend_links_pkey','friend_links_token_hash_key','convoys_pkey','convoy_codes_code_hash_key') then return ride_private.live_error('LIVE_UNAVAILABLE');else raise;end if;
 end;
end$$;

-- Privacy OFF fences the exact unknown grant, without guessing from status=null.
-- A delayed original acquires the same lock and cannot apply after cancellation.
create function public.rs_cancel_live_grant(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=auth.uid();req jsonb;existing ride_private.live_operations;cancelled ride_private.live_grant_cancellations;begin
 if uid is null then return ride_private.live_error('LIVE_AUTH_REQUIRED');end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();if not ride_private.account_active(uid) then return ride_private.live_error('ACCOUNT_DELETION_PENDING');end if;
 if p_operation is null then return ride_private.live_error('LIVE_INVALID');end if;
 begin req:=ride_private.live_request(p_request,uid);exception when sqlstate 'RL001' then return ride_private.live_error(sqlerrm);end;
 if req->>'action'<>'location_grant' then return ride_private.live_error('LIVE_INVALID');end if;
 select * into existing from ride_private.live_operations where owner_id=uid and operation_id=p_operation;
 if found then if existing.request<>req then return ride_private.live_error('LIVE_OPERATION_CONFLICT');end if;return ride_private.live_receipt(uid,p_operation);end if;
 select * into cancelled from ride_private.live_grant_cancellations where owner_id=uid and operation_id=p_operation;
 if found then if cancelled.request<>req then return ride_private.live_error('LIVE_OPERATION_CONFLICT');end if;
 else
 if not ride_private.live_attempt(uid,'control',60,240) then return ride_private.live_error('LIVE_RATE_LIMITED');end if;
 insert into ride_private.live_grant_cancellations(owner_id,operation_id,request) values(uid,p_operation,req) returning * into cancelled;
 end if;
 return jsonb_build_object('owner_id',uid,'operation_id',p_operation,'request',cancelled.request,'state','cancelled','cancelled_at',cancelled.cancelled_at);
end$$;

create function public.rs_list_convoys() returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.live_actor();items jsonb;begin
 if ride_private.live_enabled() then perform ride_private.live_repair();select jsonb_agg(jsonb_build_object('id',c.id,'host_id',c.host_id,'title',c.title,'revision',c.revision,'state',c.state,'self_state',m.state,'expires_at',c.expires_at) order by c.id) into items from ride_private.convoys c join ride_private.convoy_members m on m.convoy_id=c.id where m.user_id=uid and m.state in('requested','accepted') and c.state in('lobby','active');end if;
 return jsonb_build_object('owner_id',uid,'server_now',clock_timestamp(),'items',coalesce(items,'[]'::jsonb));
end$$;
create function public.rs_get_convoy(p_convoy uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.live_actor();c ride_private.convoys;m ride_private.convoy_members;l ride_private.location_consents;stamp timestamptz;terminal boolean;visible jsonb;consent jsonb;own_code jsonb;begin
 if not ride_private.live_enabled() then return null;end if;perform ride_private.live_repair();stamp:=clock_timestamp();select * into c from ride_private.convoys where id=p_convoy;select * into m from ride_private.convoy_members where convoy_id=p_convoy and user_id=uid;
 if c.id is null or m.user_id is null or m.state not in('requested','accepted') or not ride_private.account_active(c.host_id) then return null;end if;
 terminal:=c.state in('ended','cancelled');
 if terminal and(c.terminal_at<stamp-interval '24 hours' or m.state<>'accepted') then return null;end if;
 if uid<>c.host_id and(m.host_friendship_generation is distinct from ride_private.live_friend_generation(uid,c.host_id) or exists(select 1 from ride_private.convoy_members x where x.convoy_id=c.id and x.state in('requested','accepted') and ride_private.blocked(uid,x.user_id))) then return null;end if;
 select jsonb_agg(jsonb_build_object('user_id',x.user_id,'handle',p.handle,'display_name',ride_private.social_display_name(p.display_name,p.handle),'role',x.role,'state',x.state,'generation',x.generation,'host_friendship_generation',x.host_friendship_generation) order by case when x.role='host' then 0 else 1 end,x.user_id) into visible
 from ride_private.convoy_members x join public.rs_profiles p on p.user_id=x.user_id where x.convoy_id=c.id and x.state in('requested','accepted')
 and(case when terminal then x.user_id in(uid,c.host_id) when m.state='requested' then x.user_id in(uid,c.host_id) when uid=c.host_id then true else x.state='accepted' end);
 select * into l from ride_private.location_consents where convoy_id=c.id and user_id=uid;
 consent:=jsonb_build_object('revision',coalesce(l.revision,0),'precision','none','lease_id',null,'capture_id',null,'expires_at',null,'last_sequence',0);
 if m.state='requested' then consent:=jsonb_build_object('revision',0,'precision','none','lease_id',null,'capture_id',null,'expires_at',null,'last_sequence',0);end if;
 if not terminal and m.state='accepted' and c.state='active' and l.precision='precise' and l.expires_at>stamp and coalesce((select presence_opt_in from public.rs_profiles where user_id=uid),false) and not coalesce((select(preferences->>'ghost_mode')::boolean from public.rs_account_state where user_id=uid),true) then consent:=jsonb_build_object('revision',l.revision,'precision',l.precision,'lease_id',l.lease_id,'capture_id',l.capture_id,'expires_at',l.expires_at,'last_sequence',l.last_sequence);end if;
 if uid=c.host_id and not terminal then select jsonb_build_object('generation',generation,'hash',code_hash,'expires_at',expires_at) into own_code from ride_private.convoy_codes where convoy_id=c.id;end if;
 return jsonb_build_object('owner_id',uid,'server_now',stamp,'id',c.id,'host_id',c.host_id,'title',c.title,'revision',c.revision,'state',c.state,'expires_at',c.expires_at,'host_lease_until',c.host_lease_until,'route_snapshot',c.route_snapshot,'viewer_role',case when uid=c.host_id then 'host' when m.state='requested' then 'applicant' else 'member' end,'self_state',m.state,'self_generation',m.generation,'members',coalesce(visible,'[]'::jsonb),'topic',case when not terminal and m.state='accepted' then 'rs-convoy:'||c.topic_id::text else null end,'topic_generation',c.topic_generation,'change_revision',c.change_revision,'self_code',own_code,'self_consent',consent);
end$$;
create function public.rs_convoy_heartbeat(p_convoy uuid,p_member_generation integer) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=auth.uid();c ride_private.convoys;stamp timestamptz;begin
 if uid is null then return ride_private.live_error('LIVE_AUTH_REQUIRED');end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();if not ride_private.account_active(uid) then return ride_private.live_error('ACCOUNT_DELETION_PENDING');end if;
 if not ride_private.live_enabled() then return ride_private.live_error('LIVE_DISABLED');end if;
 if not ride_private.live_attempt(uid,'heartbeat',8,2880) then return ride_private.live_error('LIVE_RATE_LIMITED');end if;perform ride_private.live_repair();stamp:=clock_timestamp();
 select * into c from ride_private.convoys where id=p_convoy and host_id=uid and state in('lobby','active') for update;
 if c.id is null or not exists(select 1 from ride_private.convoy_members where convoy_id=c.id and user_id=uid and role='host' and state='accepted' and generation=p_member_generation) then return ride_private.live_error('CONVOY_UNAVAILABLE');end if;
 if c.last_heartbeat_at<=stamp-interval '15 seconds' then update ride_private.convoys set host_lease_until=least(stamp+interval '45 seconds',expires_at),last_heartbeat_at=stamp where id=c.id returning * into c;end if;
 return jsonb_build_object('owner_id',uid,'convoy_id',c.id,'server_now',stamp,'host_lease_until',c.host_lease_until);
end$$;
create function ride_private.live_sample(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare k text;begin
 if p is not null and octet_length(p::text)>4096 then perform ride_private.live_reject('LIVE_TOO_LARGE');end if;
 if p is null or jsonb_typeof(p)<>'object' or not p?&array['schema_version','convoy_id','topic_generation','member_generation','consent_revision','lease_id','capture_id','sequence','latitude','longitude','accuracy_m','heading_deg','captured_at','source'] or p-array['schema_version','convoy_id','topic_generation','member_generation','consent_revision','lease_id','capture_id','sequence','latitude','longitude','accuracy_m','heading_deg','captured_at','source']<>'{}' or p->'schema_version'<>'1' then perform ride_private.live_reject('LIVE_INVALID');end if;
 foreach k in array array['convoy_id','lease_id','capture_id'] loop if not ride_private.social_uuid(p->k) then perform ride_private.live_reject('LIVE_INVALID');end if;end loop;
 foreach k in array array['topic_generation','member_generation','consent_revision','sequence'] loop if not ride_private.ride_number(p->k,1,2147483647,false,true) then perform ride_private.live_reject('LIVE_INVALID');end if;end loop;
 if not ride_private.ride_number(p->'latitude',-90,90,false,false) or not ride_private.ride_number(p->'longitude',-180,180,false,false) or not ride_private.ride_number(p->'accuracy_m',0,100000,false,false) or not ride_private.ride_number(p->'heading_deg',0,360,true,false) or not ride_private.social_stamp(p->'captured_at') then perform ride_private.live_reject('LIVE_INVALID');end if;
 if(p->>'accuracy_m')::double precision<=0 or(p->'heading_deg'<>'null' and(p->>'heading_deg')::double precision>=360) then perform ride_private.live_reject('LIVE_INVALID');end if;
 if jsonb_typeof(p->'source')<>'object' or not(p->'source')?&array['platform','mocked','simulated'] or(p->'source')-array['platform','mocked','simulated']<>'{}' or jsonb_typeof(p#>'{source,platform}')<>'string' or p#>>'{source,platform}' not in('ios','android','web') then perform ride_private.live_reject('LIVE_INVALID');end if;
 foreach k in array array['mocked','simulated'] loop if p#>array['source',k]<>'null' and jsonb_typeof(p#>array['source',k])<>'boolean' then perform ride_private.live_reject('LIVE_INVALID');end if;end loop;return p;
end$$;
create function public.rs_publish_live_position(p_sample jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=auth.uid();s jsonb;c ride_private.convoys;m ride_private.convoy_members;l ride_private.location_consents;point ride_private.live_positions;stamp timestamptz;expiry timestamptz;position_digest text;seq integer;begin
 if uid is null then return ride_private.live_error('LIVE_AUTH_REQUIRED');end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();if not ride_private.account_active(uid) then return ride_private.live_error('ACCOUNT_DELETION_PENDING');end if;
 if not ride_private.live_enabled() then return ride_private.live_error('LIVE_DISABLED');end if;
 if p_sample is not null and octet_length(p_sample::text)>4096 then return ride_private.live_error('LIVE_TOO_LARGE');end if;
 if not ride_private.live_attempt(uid,'publish',64,86400) then return ride_private.live_error('LIVE_RATE_LIMITED');end if;
 begin s:=ride_private.live_sample(p_sample);exception when sqlstate 'RL001' then return ride_private.live_error(sqlerrm);end;
 perform ride_private.live_repair();stamp:=clock_timestamp();select * into c from ride_private.convoys where id=(s->>'convoy_id')::uuid for update;select * into m from ride_private.convoy_members where convoy_id=c.id and user_id=uid for update;
 if c.id is null or c.state<>'active' or m.user_id is null or m.state<>'accepted' then return ride_private.live_error('CONVOY_UNAVAILABLE');end if;
 if c.topic_generation<>(s->>'topic_generation')::integer or m.generation<>(s->>'member_generation')::integer then return ride_private.live_error('CONVOY_CHANGED');end if;
 select * into l from ride_private.location_consents where convoy_id=c.id and user_id=uid for update;
 if l.precision<>'precise' or l.expires_at<=stamp or not coalesce((select presence_opt_in from public.rs_profiles where user_id=uid),false) or coalesce((select(preferences->>'ghost_mode')::boolean from public.rs_account_state where user_id=uid),true) then return ride_private.live_error('LOCATION_CONSENT_REQUIRED');end if;
 if l.revision<>(s->>'consent_revision')::integer or l.member_generation<>m.generation or l.lease_id<>(s->>'lease_id')::uuid or l.capture_id<>(s->>'capture_id')::uuid then return ride_private.live_error('LOCATION_CONSENT_CHANGED');end if;
 if(s->>'accuracy_m')::double precision>20 or s#>'{source,mocked}'='true' or s#>'{source,simulated}'='true' then return ride_private.live_error('LOCATION_QUALITY');end if;
 if(s->>'captured_at')::timestamptz<stamp-interval '3 seconds' or(s->>'captured_at')::timestamptz>stamp+interval '2 seconds' then return ride_private.live_error('LOCATION_STALE');end if;
 seq:=(s->>'sequence')::integer;position_digest:=encode(sha256(convert_to(s::text,'UTF8')),'hex');
 if seq<=l.last_sequence then
 select p.* into point from ride_private.live_positions p where p.convoy_id=c.id and p.user_id=uid and p.sequence=seq and p.sample_hash=position_digest and p.expires_at>stamp;
 if seq=l.last_sequence and l.last_sample_hash=position_digest and point.user_id is not null then return jsonb_build_object('owner_id',uid,'convoy_id',c.id,'lease_id',point.lease_id,'sequence',seq,'received_at',point.received_at,'expires_at',point.expires_at);end if;
 return ride_private.live_error('POSITION_SEQUENCE');end if;
 if l.last_received_at>stamp-interval '1 second' then return ride_private.live_error('LIVE_RATE_LIMITED');end if;
 expiry:=least(stamp+interval '15 seconds',l.expires_at,c.expires_at,c.host_lease_until);
 insert into ride_private.live_positions(convoy_id,user_id,member_generation,consent_revision,lease_id,capture_id,sequence,sample_hash,latitude,longitude,accuracy_m,heading_deg,captured_at,received_at,expires_at,source) values(c.id,uid,m.generation,l.revision,l.lease_id,l.capture_id,seq,position_digest,(s->>'latitude')::double precision,(s->>'longitude')::double precision,(s->>'accuracy_m')::double precision,(s->>'heading_deg')::double precision,(s->>'captured_at')::timestamptz,stamp,expiry,s->'source') on conflict(convoy_id,user_id) do update set member_generation=excluded.member_generation,consent_revision=excluded.consent_revision,lease_id=excluded.lease_id,capture_id=excluded.capture_id,sequence=excluded.sequence,sample_hash=excluded.sample_hash,latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,heading_deg=excluded.heading_deg,captured_at=excluded.captured_at,received_at=excluded.received_at,expires_at=excluded.expires_at,source=excluded.source;
 update ride_private.location_consents set last_sequence=seq,last_sample_hash=position_digest,last_received_at=stamp where convoy_id=c.id and user_id=uid;perform ride_private.live_emit(c.id,'positions_changed');
 return jsonb_build_object('owner_id',uid,'convoy_id',c.id,'lease_id',l.lease_id,'sequence',seq,'received_at',stamp,'expires_at',expiry);
end$$;
create function public.rs_convoy_positions(p_convoy uuid,p_topic_generation integer) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=auth.uid();c ride_private.convoys;m ride_private.convoy_members;stamp timestamptz;last_poll timestamptz;items jsonb;begin
 if uid is null then return ride_private.live_error('LIVE_AUTH_REQUIRED');end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();if not ride_private.account_active(uid) then return ride_private.live_error('ACCOUNT_DELETION_PENDING');end if;
 if not ride_private.live_enabled() then return ride_private.live_error('LIVE_DISABLED');end if;
 if not ride_private.live_attempt(uid,'read',72,86400) then return ride_private.live_error('LIVE_RATE_LIMITED');end if;
 perform ride_private.live_repair();stamp:=clock_timestamp();select * into c from ride_private.convoys where id=p_convoy;select * into m from ride_private.convoy_members where convoy_id=c.id and user_id=uid;
 if c.id is null or c.state<>'active' or m.user_id is null or m.state<>'accepted' then return ride_private.live_error('CONVOY_UNAVAILABLE');end if;
 if c.topic_generation is distinct from p_topic_generation then return ride_private.live_error('CONVOY_CHANGED');end if;
 select last_at into last_poll from ride_private.live_poll_slots where owner_id=uid;if last_poll>stamp-interval '1 second' then return ride_private.live_error('LIVE_RATE_LIMITED');end if;
 insert into ride_private.live_poll_slots(owner_id,last_at) values(uid,stamp) on conflict(owner_id) do update set last_at=excluded.last_at;
 select jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',ride_private.social_display_name(u.display_name,u.handle),'latitude',p.latitude,'longitude',p.longitude,'accuracy_m',p.accuracy_m,'heading_deg',p.heading_deg,'captured_at',p.captured_at,'received_at',p.received_at,'expires_at',p.expires_at,'member_generation',p.member_generation,'consent_revision',p.consent_revision,'sequence',p.sequence,'authority','unverified_live') order by p.user_id) into items
 from ride_private.live_positions p join ride_private.location_consents l on l.convoy_id=p.convoy_id and l.user_id=p.user_id join ride_private.convoy_members x on x.convoy_id=p.convoy_id and x.user_id=p.user_id join public.rs_profiles u on u.user_id=p.user_id join public.rs_account_state a on a.user_id=p.user_id
 where p.convoy_id=c.id and p.user_id<>uid and p.expires_at>stamp and l.precision='precise' and l.expires_at>stamp and l.member_generation=x.generation and x.state='accepted' and p.member_generation=x.generation and p.consent_revision=l.revision and p.lease_id=l.lease_id and p.capture_id=l.capture_id and u.presence_opt_in and not(a.preferences->>'ghost_mode')::boolean and ride_private.account_active(p.user_id);
 return jsonb_build_object('owner_id',uid,'convoy_id',c.id,'server_now',stamp,'topic_generation',c.topic_generation,'change_revision',c.change_revision,'items',coalesce(items,'[]'::jsonb));
end$$;
create function ride_private.can_read_convoy(topic text) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and ride_private.live_enabled() and ride_private.account_active(auth.uid()) and exists(select 1 from ride_private.convoys c join ride_private.convoy_members m on m.convoy_id=c.id where topic='rs-convoy:'||c.topic_id::text and m.user_id=auth.uid() and m.state='accepted' and ride_private.live_room_valid(c.id))$$;
create policy rs_convoy_receive on realtime.messages for select to authenticated using(extension='broadcast' and ride_private.can_read_convoy(realtime.topic()));

create function public.rs_live_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$declare c record;rooms integer:=0;points integer;proofs integer;begin
 perform ride_private.live_control_lock();
 for c in select id from ride_private.convoys where state in('lobby','active') order by id limit 100 loop if not coalesce(ride_private.live_room_valid(c.id),false) then perform ride_private.live_close(c.id);rooms:=rooms+1;end if;end loop;
 for c in select distinct l.convoy_id from ride_private.location_consents l join ride_private.convoys r on r.id=l.convoy_id where l.precision='precise' and l.expires_at<=clock_timestamp() and r.state in('lobby','active') order by l.convoy_id limit 100 loop
 update ride_private.location_consents set precision='none',revision=revision+1,lease_id=null,capture_id=null,granted_at=null,expires_at=null,last_sequence=0,last_sample_hash=null,last_received_at=null where convoy_id=c.convoy_id and precision='precise' and expires_at<=clock_timestamp();perform ride_private.live_rotate(c.convoy_id);end loop;
 delete from ride_private.live_positions where expires_at<=clock_timestamp();get diagnostics points=ROW_COUNT;
 delete from ride_private.live_proofs where id in(select id from ride_private.live_proofs where expires_at<=clock_timestamp() order by expires_at limit 1000);get diagnostics proofs=ROW_COUNT;
 delete from ride_private.convoys where id in(select id from ride_private.convoys where state in('ended','cancelled') and terminal_at<clock_timestamp()-interval '24 hours' order by terminal_at limit 100);
 delete from ride_private.friend_links where id in(select id from ride_private.friend_links where(state='revoked' and created_at<clock_timestamp()-interval '24 hours') or expires_at<clock_timestamp()-interval '24 hours' order by expires_at limit 1000);
 delete from ride_private.live_admission where bucket<clock_timestamp()-interval '35 days';
 return jsonb_build_object('rooms',rooms,'positions',points,'proofs',proofs);
end$$;

-- Move predecessor function OIDs/bodies without text reimplementation. Every
-- public wrapper fences account -> global before predecessor lower row locks.
alter function public.rs_social_mutate(uuid,jsonb) rename to rs_social_mutate_pre_live_v1;
alter function public.rs_social_mutate_pre_live_v1(uuid,jsonb) set schema ride_private;
alter function public.rs_request_friend(text) rename to rs_request_friend_pre_live_v1;
alter function public.rs_request_friend_pre_live_v1(text) set schema ride_private;
alter function public.rs_friend_action(uuid,text) rename to rs_friend_action_pre_live_v1;
alter function public.rs_friend_action_pre_live_v1(uuid,text) set schema ride_private;
alter function public.rs_set_presence(boolean) rename to rs_set_presence_pre_live_v1;
alter function public.rs_set_presence_pre_live_v1(boolean) set schema ride_private;
alter function public.rs_heartbeat() rename to rs_heartbeat_pre_live_v1;
alter function public.rs_heartbeat_pre_live_v1() set schema ride_private;
alter function public.rs_update_account_state(integer,text,text,jsonb) rename to rs_update_account_state_pre_live_v1;
alter function public.rs_update_account_state_pre_live_v1(integer,text,text,jsonb) set schema ride_private;
alter function public.rs_begin_account_deletion(uuid,uuid) rename to rs_begin_account_deletion_pre_live_v1;
alter function public.rs_begin_account_deletion_pre_live_v1(uuid,uuid) set schema ride_private;
alter function public.rs_purge_account_data(uuid,uuid,uuid) rename to rs_purge_account_data_pre_live_v1;
alter function public.rs_purge_account_data_pre_live_v1(uuid,uuid,uuid) set schema ride_private;
create function public.rs_social_mutate(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=auth.uid();result jsonb;replay boolean;begin
 if uid is not null then perform ride_private.account_lock(uid);perform ride_private.live_control_lock();end if;
 replay:=exists(select 1 from ride_private.social_operations where owner_id=uid and operation_id=p_operation);
 result:=ride_private.rs_social_mutate_pre_live_v1(p_operation,p_request);if uid is not null and not replay and not(result?'error') then perform ride_private.live_privacy(uid);end if;return result;
end$$;
create function public.rs_request_friend(p_handle text) returns text language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();result text;begin perform ride_private.live_control_lock();result:=ride_private.rs_request_friend_pre_live_v1(p_handle);perform ride_private.live_privacy(uid);return result;end$$;
create function public.rs_friend_action(p_other uuid,p_action text) returns text language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();result text;begin perform ride_private.live_control_lock();result:=ride_private.rs_friend_action_pre_live_v1(p_other,p_action);perform ride_private.live_privacy(uid);return result;end$$;
create function public.rs_set_presence(p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();begin perform ride_private.live_control_lock();perform ride_private.rs_set_presence_pre_live_v1(p_enabled);perform ride_private.live_privacy(uid);end$$;
create function public.rs_heartbeat() returns timestamptz language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();begin perform ride_private.live_control_lock();return ride_private.rs_heartbeat_pre_live_v1();end$$;
create function public.rs_update_account_state(p_expected_revision integer,p_onboarding_step text,p_location_choice text,p_preferences jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();result jsonb;begin perform ride_private.live_control_lock();result:=ride_private.rs_update_account_state_pre_live_v1(p_expected_revision,p_onboarding_step,p_location_choice,p_preferences);perform ride_private.live_privacy(uid);return result;end$$;
create function public.rs_begin_account_deletion(p_owner uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();result:=ride_private.rs_begin_account_deletion_pre_live_v1(p_owner,p_request);perform ride_private.live_privacy(p_owner);return result;end$$;
create function public.rs_purge_account_data(p_owner uuid,p_request uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();perform ride_private.rs_purge_account_data_pre_live_v1(p_owner,p_request,p_token);
 delete from ride_private.convoys where host_id=p_owner;delete from ride_private.convoy_members where user_id=p_owner;
 delete from ride_private.live_operations where owner_id=p_owner;delete from ride_private.live_grant_cancellations where owner_id=p_owner;delete from ride_private.friend_links where issuer_id=p_owner;delete from ride_private.live_proofs where owner_id=p_owner or issuer_id=p_owner;delete from ride_private.live_poll_slots where owner_id=p_owner;delete from ride_private.live_admission where subject=p_owner;
end$$;

-- Explicit narrow ACLs; no broad schema grants and no legacy browser restoration.
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and(p.proname like 'live_%' or p.proname like '%_pre_live_v1' or p.proname='can_read_convoy') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;end$$;
grant execute on function ride_private.can_read_convoy(text) to authenticated;
revoke all on function public.rs_live_operation(uuid),public.rs_friend_links(),public.rs_resolve_friend_link(uuid,text),public.rs_resolve_convoy_code(text),public.rs_live_mutate(uuid,jsonb),public.rs_list_convoys(),public.rs_get_convoy(uuid),public.rs_convoy_heartbeat(uuid,integer),public.rs_publish_live_position(jsonb),public.rs_convoy_positions(uuid,integer),public.rs_live_cleanup() from public,anon,authenticated,service_role;
grant execute on function public.rs_live_operation(uuid),public.rs_friend_links(),public.rs_resolve_friend_link(uuid,text),public.rs_resolve_convoy_code(text),public.rs_live_mutate(uuid,jsonb),public.rs_list_convoys(),public.rs_get_convoy(uuid),public.rs_convoy_heartbeat(uuid,integer),public.rs_publish_live_position(jsonb),public.rs_convoy_positions(uuid,integer) to authenticated,service_role;
grant execute on function public.rs_live_cleanup() to service_role;
revoke all on function public.rs_cancel_live_grant(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rs_cancel_live_grant(uuid,jsonb) to authenticated,service_role;
revoke all on function public.rs_social_mutate(uuid,jsonb),public.rs_request_friend(text),public.rs_friend_action(uuid,text),public.rs_set_presence(boolean),public.rs_heartbeat(),public.rs_update_account_state(integer,text,text,jsonb),public.rs_begin_account_deletion(uuid,uuid),public.rs_purge_account_data(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rs_social_mutate(uuid,jsonb),public.rs_heartbeat(),public.rs_update_account_state(integer,text,text,jsonb) to authenticated,service_role;
grant execute on function public.rs_request_friend(text),public.rs_friend_action(uuid,text),public.rs_set_presence(boolean),public.rs_begin_account_deletion(uuid,uuid),public.rs_purge_account_data(uuid,uuid,uuid) to service_role;
commit;
