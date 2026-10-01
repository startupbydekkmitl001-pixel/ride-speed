-- M5C distinct native-evidence route-time trials/races. Old speed verification
-- and immutable deployed001–008 sources retain their original meaning.
begin;

create table ride_private.race_policy(
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 max_live_races integer not null default 2 check(max_live_races between 1 and 2)
);
insert into ride_private.race_policy(singleton) values(true);
create table ride_private.race_course_approvals(
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 route_id uuid not null,route_revision integer not null check(route_revision>0),route_geometry_hash text not null,
 course_id uuid not null references public.rs_courses(id),session_id uuid not null references public.rs_course_sessions(id),
 configuration jsonb not null,config_hash text not null,category text not null check(category in('scooter','motorcycle','car')),
 reviewer_ref text not null check(length(reviewer_ref) between 1 and 120),request jsonb not null,
 created_at timestamptz not null default clock_timestamp(),revoked_at timestamptz,revocation_code text
);
create table ride_private.races(
 id uuid primary key,creator_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null default 1 check(revision>0),mode text not null check(mode in('async','live')),
 approval_id uuid not null references ride_private.race_course_approvals(id),route_snapshot jsonb not null,
 starts_at timestamptz not null,ends_at timestamptz not null,acknowledgement_version integer not null check(acknowledgement_version=1),
 state text not null check(state in('open','lobby','countdown','running','finished','cancelled','expired')),
 topic_id uuid not null default gen_random_uuid(),topic_generation integer not null default 1 check(topic_generation>0),
 lobby_epoch uuid not null default gen_random_uuid(),common_start_at timestamptz,schedule_epoch uuid,
 host_lease_until timestamptz,scheduled_members jsonb,terminal_at timestamptz,terminal_reason text,
 updated_at timestamptz not null default clock_timestamp(),created_at timestamptz not null default clock_timestamp(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours'),
 check((common_start_at is null)=(schedule_epoch is null))
);
create table ride_private.race_members(
 race_id uuid not null references ride_private.races(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,role text not null check(role in('host','member')),
 state text not null check(state in('invited','accepted','declined','withdrawn')),member_generation integer not null default 1 check(member_generation>0),
 host_friendship_generation integer,evidence_consent_version integer check(evidence_consent_version=1),consented_at timestamptz,
 ready_revision integer not null default 0 check(ready_revision>=0),ready_lease_id uuid,ready_attempt_id uuid,ready_until timestamptz,
 ready_probe_ids uuid[],ready_clock_generation uuid,updated_at timestamptz not null default clock_timestamp(),
 primary key(race_id,user_id),check((role='host')=(host_friendship_generation is null)),
 check((ready_lease_id is null)=(ready_until is null)),check((ready_lease_id is null)=(ready_attempt_id is null))
);
create table ride_private.race_attempts(
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 race_id uuid not null references ride_private.races(id) on delete cascade,revision integer not null default 1 check(revision>0),
 member_generation integer not null check(member_generation>0),ordinal integer not null check(ordinal between 1 and 3),
 approval_id uuid not null references ride_private.race_course_approvals(id),config_hash text not null,
 platform text not null check(platform in('ios','android')),provider text not null check(provider in('ios_core_location','expo_location')),
 ride_id uuid not null,capture_id uuid not null,vehicle jsonb,state text not null check(state in('reserved','armed','upload_pending','queued','verifying','verified','rejected','aborted','dnf')),
 armed_at timestamptz,arm_probe_ids uuid[],clock_generation uuid,schedule_epoch uuid,common_start_at timestamptz,
 evidence_path text unique,evidence_sha256 text,byte_length integer check(byte_length between 1 and 2097152),
 first_sequence integer,last_sequence integer,sample_count integer check(sample_count between 4 and 8000),upload_deadline timestamptz,
 verification_token uuid,verification_lease_until timestamptz,verification_attempts integer not null default 0,
 rejection_code text,terminal_reason text,terminal_at timestamptz,updated_at timestamptz not null default clock_timestamp(),created_at timestamptz not null default clock_timestamp(),
 check(platform='ios' or provider='expo_location'),check(evidence_sha256 is null or evidence_sha256~'^[a-f0-9]{64}$')
);
create unique index race_one_active_owner on ride_private.race_attempts(owner_id) where state in('reserved','armed','upload_pending','queued','verifying');
create table ride_private.race_stage_slots(
 owner_id uuid primary key references auth.users(id) on delete cascade,race_id uuid not null references ride_private.races(id) on delete cascade,
 attempt_id uuid not null references ride_private.race_attempts(id) on delete cascade,capture_id uuid not null,lobby_epoch uuid not null,
 member_generation integer not null,sequence integer not null,proof_id uuid not null unique,sample jsonb not null,sample_hash text not null,
 received_at timestamptz not null,expires_at timestamptz not null
);
create table ride_private.race_clock_probes(
 owner_id uuid not null references auth.users(id) on delete cascade,probe_id uuid not null,
 race_id uuid not null references ride_private.races(id) on delete cascade,attempt_id uuid not null references ride_private.race_attempts(id) on delete cascade,
 capture_id uuid not null,clock_generation uuid not null,server_received_at timestamptz not null,server_sent_at timestamptz not null,
 bound boolean not null default false,primary key(owner_id,probe_id),check(server_sent_at>=server_received_at)
);
create table ride_private.race_operations(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,request jsonb not null,
 applied_at timestamptz not null default clock_timestamp(),result jsonb not null,primary key(owner_id,operation_id)
);
create table ride_private.race_activation_cancellations(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,request jsonb not null,
 cancelled_at timestamptz not null default clock_timestamp(),primary key(owner_id,operation_id)
);
create table ride_private.race_results(
 attempt_id uuid primary key references ride_private.race_attempts(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,race_id uuid not null references ride_private.races(id) on delete cascade,
 approval_id uuid not null references ride_private.race_course_approvals(id),config_hash text not null,
 result jsonb not null,evidence_sha256 text not null,verified_at timestamptz not null default clock_timestamp()
);
create table ride_private.race_admission(subject uuid not null,label text not null,bucket timestamptz not null,hits integer not null,primary key(subject,label,bucket));
create table ride_private.race_poll_slots(owner_id uuid not null references auth.users(id) on delete cascade,label text not null,resource_id uuid not null,last_at timestamptz not null,primary key(owner_id,label,resource_id));
create table ride_private.race_evidence_cleanup(id uuid primary key default gen_random_uuid(),bucket text not null default 'ride-race-evidence' check(bucket='ride-race-evidence'),path text not null unique,sha256 text,eligible_at timestamptz not null,token uuid,lease_until timestamptz,attempts integer not null default 0);
create index race_inbox_owner on ride_private.race_members(user_id,race_id);
create index race_keyset on ride_private.races(updated_at desc,id desc);
create index race_attempt_owner on ride_private.race_attempts(owner_id,race_id,created_at desc,id desc);
create index race_cleanup_due on ride_private.race_evidence_cleanup(eligible_at);
-- Dedicated free-tier pilot headroom: unresolved reservations and stored
-- objects count once per path. Unknown object size fails closed at the cap.
create function ride_private.race_reserved_evidence_bytes() returns numeric language sql stable security definer set search_path='' as $$
 with sizes as(
 select a.evidence_path path,a.byte_length::numeric bytes from ride_private.race_attempts a join ride_private.race_evidence_cleanup q on q.path=a.evidence_path
 union all select name,case when metadata->>'size'~'^[0-9]{1,18}$' then(metadata->>'size')::numeric else 268435456::numeric end from storage.objects where bucket_id='ride-race-evidence'
 ),paths as(select path,max(bytes) bytes from sizes group by path)
 select coalesce(sum(bytes),0) from paths
$$;
do $$declare t text;begin foreach t in array array['race_policy','race_course_approvals','races','race_members','race_attempts','race_stage_slots','race_clock_probes','race_results','race_operations','race_activation_cancellations','race_admission','race_poll_slots','race_evidence_cleanup'] loop
 execute format('alter table ride_private.%I enable row level security',t);
 execute format('revoke all on ride_private.%I from public,anon,authenticated,service_role',t);
end loop;end$$;

create function ride_private.race_reject(code text) returns void language plpgsql immutable set search_path='' as $$begin raise exception '%',code using errcode='RC001';end$$;
create function ride_private.race_error(code text,retry_ms integer default null) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('error',case when code='RACE_RATE_LIMITED' then jsonb_build_object('code',code,'retry_after_ms',retry_ms) else jsonb_build_object('code',code) end)$$;
create function ride_private.race_uuid(v jsonb) returns boolean language sql immutable set search_path='' as $$select coalesce(jsonb_typeof(v)='string' and v#>>'{}'~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',false)$$;
create function ride_private.race_stamp(v jsonb) returns timestamptz language plpgsql immutable set search_path='' as $$declare parsed timestamptz;begin
 if jsonb_typeof(v)<>'string' or v#>>'{}'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then perform ride_private.race_reject('RACE_INVALID');end if;
 parsed:=(v#>>'{}')::timestamptz;if parsed<'2020-01-01'::timestamptz or parsed>='2101-01-01'::timestamptz then perform ride_private.race_reject('RACE_INVALID');end if;return parsed;
 exception when invalid_datetime_format or datetime_field_overflow then perform ride_private.race_reject('RACE_INVALID');end$$;
create function ride_private.race_admit(uid uuid,label_value text,minute_cap integer,day_cap integer,project_cap integer) returns integer language plpgsql volatile set search_path='' as $$
declare stamp timestamptz:=clock_timestamp();bucket_at timestamptz;cap integer;subject_id uuid;key text;size integer;units integer;
begin
 for size,cap,subject_id,key in select * from(values(60,minute_cap,uid,label_value||'_minute'),(86400,day_cap,uid,label_value||'_day'),(86400,project_cap,'00000000-0000-0000-0000-000000000000'::uuid,label_value||'_project')) as limits(seconds,maximum,subject,label) loop
  bucket_at:=to_timestamp(floor(extract(epoch from stamp)/size)*size);
  select hits into units from ride_private.race_admission where subject=subject_id and label=key and bucket=bucket_at;
  if coalesce(units,0)>=cap then return least(86400000,greatest(1,ceil(extract(epoch from bucket_at+make_interval(secs=>size)-stamp)*1000)::integer));end if;
 end loop;
 for size,cap,subject_id,key in select * from(values(60,minute_cap,uid,label_value||'_minute'),(86400,day_cap,uid,label_value||'_day'),(86400,project_cap,'00000000-0000-0000-0000-000000000000'::uuid,label_value||'_project')) as limits(seconds,maximum,subject,label) loop
  bucket_at:=to_timestamp(floor(extract(epoch from stamp)/size)*size);
  insert into ride_private.race_admission(subject,label,bucket,hits) values(subject_id,key,bucket_at,1) on conflict(subject,label,bucket) do update set hits=ride_private.race_admission.hits+1;
 end loop;return null;
end$$;
create function ride_private.race_receipt(uid uuid,op uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('owner_id',owner_id,'operation_id',operation_id,'request',request,'applied_at',applied_at,'result',result) from ride_private.race_operations where owner_id=uid and operation_id=op$$;
create function ride_private.race_request(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare action_value text:=p->>'action';required text[];key text;item jsonb;last_id text:=null;count integer;
begin
 if p is null or jsonb_typeof(p)<>'object' then perform ride_private.race_reject('RACE_INVALID');end if;
 if octet_length(p::text)>16384 then perform ride_private.race_reject('RACE_TOO_LARGE');end if;
 required:=case action_value
 when 'race_create' then array['race_id','mode','approval_id','route_id','route_revision','reviewed_projection_hash','starts_at','ends_at','friends','acknowledgement_version','evidence_consent_version']
 when 'member_action' then array['race_id','expected_revision','expected_member_generation','expected_friendship_generation','decision']||case when p->>'decision'='accept' then array['acknowledgement_version','evidence_consent_version'] else array[]::text[] end
 when 'attempt_reserve' then array['race_id','expected_revision','expected_member_generation','attempt_id','ride_id','capture_id','platform','provider','vehicle_local_id']
 when 'attempt_arm' then array['attempt_id','expected_revision','stage_proof_id','capture_id','clock_probe_ids']
 when 'attempt_abort' then array['attempt_id','expected_revision','reason']
 when 'race_ready' then array['race_id','expected_revision','expected_member_generation','expected_ready_revision','lobby_epoch','attempt_id','capture_id','stage_proof_id','clock_probe_ids']
 when 'race_unready' then array['race_id','expected_member_generation','expected_ready_revision','expected_ready_lease_id']
 when 'race_schedule' then array['race_id','expected_revision','lobby_epoch','ready']
 when 'race_cancel' then array['race_id','expected_revision','reason']
 when 'evidence_bind' then array['attempt_id','expected_revision','capture_id','first_sequence','last_sequence','sample_count','byte_length','sha256']
 when 'evidence_queue' then array['attempt_id','expected_revision','sha256'] else null end;
 if required is null then perform ride_private.race_reject('RACE_INVALID');end if;
 required:=required||array['schema_version','action'];
 if required is null or not p?&required or p-required<>'{}'::jsonb or p->'schema_version'<>'1'::jsonb then perform ride_private.race_reject('RACE_INVALID');end if;
 foreach key in array array['race_id','approval_id','route_id','attempt_id','ride_id','capture_id','stage_proof_id','lobby_epoch','expected_ready_lease_id'] loop if p?key and not ride_private.race_uuid(p->key) then perform ride_private.race_reject('RACE_INVALID');end if;end loop;
 foreach key in array array['expected_revision','expected_member_generation','expected_friendship_generation','route_revision'] loop if p?key and not ride_private.ride_number(p->key,1,2147483647,false,true) then perform ride_private.race_reject('RACE_INVALID');end if;end loop;
 if p?'expected_ready_revision' and not ride_private.ride_number(p->'expected_ready_revision',0,2147483646,false,true) then perform ride_private.race_reject('RACE_INVALID');end if;
 foreach key in array array['mode','decision','platform','provider','reason'] loop if p?key and jsonb_typeof(p->key)<>'string' then perform ride_private.race_reject('RACE_INVALID');end if;end loop;
 foreach key in array array['reviewed_projection_hash','sha256'] loop if p?key and (jsonb_typeof(p->key)<>'string' or p->>key!~'^[a-f0-9]{64}$') then perform ride_private.race_reject('RACE_INVALID');end if;end loop;
 foreach key in array array['acknowledgement_version','evidence_consent_version'] loop if p?key and p->key<>'1'::jsonb then perform ride_private.race_reject('RACE_INVALID');end if;end loop;
 if p?'starts_at' then perform ride_private.race_stamp(p->'starts_at');perform ride_private.race_stamp(p->'ends_at');end if;
 if action_value='race_create' then
  if p->>'mode' not in('async','live') or jsonb_typeof(p->'friends')<>'array' or jsonb_array_length(p->'friends') not between 1 and 3 then perform ride_private.race_reject('RACE_INVALID');end if;
  for item in select value from jsonb_array_elements(p->'friends') loop if jsonb_typeof(item)<>'object' or not item?&array['user_id','friendship_generation'] or item-array['user_id','friendship_generation']<>'{}'::jsonb or not ride_private.race_uuid(item->'user_id') or not ride_private.ride_number(item->'friendship_generation',1,2147483647,false,true) or (last_id is not null and item->>'user_id'<=last_id) then perform ride_private.race_reject('RACE_INVALID');end if;last_id:=item->>'user_id';end loop;
 elsif action_value='member_action' and p->>'decision' not in('accept','decline','withdraw') then perform ride_private.race_reject('RACE_INVALID');
 elsif action_value='attempt_reserve' and (p->>'platform' not in('ios','android') or p->>'provider' not in('ios_core_location','expo_location') or (p->>'platform'='android' and p->>'provider'<>'expo_location') or not ride_private.garage_text(p->'vehicle_local_id',100,true)) then perform ride_private.race_reject('RACE_INVALID');
 elsif action_value='attempt_abort' and p->>'reason' not in('user_stop','background','capture_changed','quality','storage_error','clock_invalid','late_start') then perform ride_private.race_reject('RACE_INVALID');
 elsif action_value='race_cancel' and p->>'reason'<>'user_cancel' then perform ride_private.race_reject('RACE_INVALID');end if;
 if p?'clock_probe_ids' then if jsonb_typeof(p->'clock_probe_ids')<>'array' or jsonb_array_length(p->'clock_probe_ids') not between 3 and 5 or (select count(distinct value) from jsonb_array_elements(p->'clock_probe_ids'))<>jsonb_array_length(p->'clock_probe_ids') then perform ride_private.race_reject('RACE_INVALID');end if;for item in select value from jsonb_array_elements(p->'clock_probe_ids') loop if not ride_private.race_uuid(item) then perform ride_private.race_reject('RACE_INVALID');end if;end loop;end if;
 if action_value='race_schedule' then
  if jsonb_typeof(p->'ready')<>'array' or jsonb_array_length(p->'ready') not between 2 and 4 then perform ride_private.race_reject('RACE_INVALID');end if;last_id:=null;
  if(select count(distinct value->>'user_id') from jsonb_array_elements(p->'ready'))<>jsonb_array_length(p->'ready') then perform ride_private.race_reject('RACE_INVALID');end if;
  for item in select value from jsonb_array_elements(p->'ready') loop if jsonb_typeof(item)<>'object' or not item?&array['user_id','member_generation','ready_revision','ready_lease_id','attempt_id'] or item-array['user_id','member_generation','ready_revision','ready_lease_id','attempt_id']<>'{}'::jsonb or not ride_private.race_uuid(item->'user_id') or not ride_private.race_uuid(item->'ready_lease_id') or not ride_private.race_uuid(item->'attempt_id') or not ride_private.ride_number(item->'member_generation',1,2147483647,false,true) or not ride_private.ride_number(item->'ready_revision',1,2147483647,false,true) then perform ride_private.race_reject('RACE_INVALID');end if;end loop;
 end if;
 if action_value='evidence_bind' then
  if not ride_private.ride_number(p->'first_sequence',1,2147483647,false,true) or not ride_private.ride_number(p->'last_sequence',1,2147483647,false,true) or not ride_private.ride_number(p->'sample_count',4,8000,false,true) or not ride_private.ride_number(p->'byte_length',1,2097152,false,true) or (p->>'last_sequence')::bigint-(p->>'first_sequence')::bigint+1<>(p->>'sample_count')::bigint then perform ride_private.race_reject('RACE_INVALID');end if;
 end if;return p;
end$$;

-- Authority helpers are invoked only with account -> common global fencing.
create function ride_private.race_approval_valid(aid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from ride_private.race_course_approvals a join public.rs_routes r on r.id=a.route_id join ride_private.route_documents d on d.route_id=r.id join public.rs_courses c on c.id=a.course_id join public.rs_course_sessions s on s.id=a.session_id
 where a.id=aid and a.revoked_at is null and r.owner_id=a.owner_id and r.revision=a.route_revision and d.geometry_hash=a.route_geometry_hash and d.segments=jsonb_build_array(a.configuration->'route_geometry') and c.closed_course_approved and c.boundary_polygon=a.configuration->'boundary_polygon' and s.approved and s.course_id=a.course_id and ride_private.account_active(a.owner_id))
$$;
create function ride_private.race_member_valid(rid uuid,uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from ride_private.races r join ride_private.race_members m on m.race_id=r.id where r.id=rid and m.user_id=uid and m.state='accepted' and m.evidence_consent_version=1 and ride_private.account_active(uid) and ride_private.account_active(r.creator_id) and (uid=r.creator_id or ride_private.live_friend_generation(r.creator_id,uid)=m.host_friendship_generation)
 and not exists(select 1 from ride_private.race_members other where other.race_id=r.id and other.state='accepted' and other.user_id<>uid and ride_private.blocked(uid,other.user_id)))
$$;
create function ride_private.race_visible(rid uuid,uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from ride_private.races r join ride_private.race_members m on m.race_id=r.id where r.id=rid and m.user_id=uid and ride_private.account_active(uid) and ride_private.account_active(r.creator_id)
 and (uid=r.creator_id or ride_private.live_friend_generation(r.creator_id,uid)=m.host_friendship_generation)
 and not exists(select 1 from ride_private.race_members o where o.race_id=r.id and o.state='accepted' and o.user_id<>uid and ride_private.blocked(uid,o.user_id)))
$$;
create function ride_private.race_rotate(rid uuid) returns void language plpgsql volatile set search_path='' as $$declare old_topic uuid;generation integer;begin
 select topic_id,topic_generation into old_topic,generation from ride_private.races where id=rid;
 if old_topic is null then return;end if;
 update ride_private.races set topic_id=gen_random_uuid(),topic_generation=topic_generation+1,updated_at=clock_timestamp() where id=rid;
 -- Same bounded shared hint budget as foreground convoys; hints contain no GPS.
 if ride_private.live_admit('00000000-0000-0000-0000-000000000000'::uuid,'control_hint_day',date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC',1000,5)
 and ride_private.live_admit('00000000-0000-0000-0000-000000000000'::uuid,'control_hint_month',date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC',20000,5) then
 perform realtime.send(jsonb_build_object('resource_id',rid,'topic_generation',generation+1,'event','changed'),'changed','rs-race:'||old_topic::text,true);
 end if;
end$$;
create function ride_private.race_end(rid uuid,reason text,state_value text default 'cancelled') returns void language plpgsql volatile set search_path='' as $$begin
 update ride_private.races set state=state_value,revision=revision+1,terminal_at=clock_timestamp(),terminal_reason=reason,host_lease_until=null,updated_at=clock_timestamp() where id=rid and state not in('cancelled','finished','expired');
 if not found then return;end if;
 update ride_private.race_attempts set state='dnf',revision=revision+1,terminal_reason=reason,terminal_at=clock_timestamp(),verification_token=null,verification_lease_until=null,updated_at=clock_timestamp() where race_id=rid and state in('reserved','armed','upload_pending','queued','verifying');
 update ride_private.race_members set ready_revision=ready_revision+1,ready_lease_id=null,ready_attempt_id=null,ready_until=null,ready_probe_ids=null,ready_clock_generation=null where race_id=rid and ready_lease_id is not null;
 delete from ride_private.race_stage_slots where race_id=rid;perform ride_private.race_rotate(rid);
end$$;
create function ride_private.race_repair(rid uuid) returns void language plpgsql volatile set search_path='' as $$declare r ride_private.races;stamp timestamptz:=clock_timestamp();invalid boolean;begin
 select * into r from ride_private.races where id=rid for update;if not found or r.state in('cancelled','finished','expired') then return;end if;
 if not ride_private.account_active(r.creator_id) then perform ride_private.race_end(rid,'account_deleted');return;end if;
 if not ride_private.race_approval_valid(r.approval_id) then perform ride_private.race_end(rid,'approval_revoked');return;end if;
 if exists(select 1 from ride_private.race_members m where m.race_id=rid and m.state='accepted' and not ride_private.race_member_valid(rid,m.user_id)) then perform ride_private.race_end(rid,'membership_changed');return;end if;
 if r.mode='live' then
 if r.common_start_at is null or stamp<r.common_start_at then
  if r.host_lease_until<=stamp then perform ride_private.race_end(rid,'host_expired');return;end if;
  if r.common_start_at is not null and exists(select 1 from jsonb_array_elements(r.scheduled_members) x join ride_private.race_members m on m.race_id=rid and m.user_id=(x->>'user_id')::uuid where m.member_generation<>(x->>'member_generation')::integer or m.ready_lease_id is distinct from (x->>'ready_lease_id')::uuid or m.ready_until<=stamp) then perform ride_private.race_end(rid,'membership_changed');return;end if;
 elsif r.state='countdown' then
  if exists(select 1 from jsonb_array_elements(r.scheduled_members)x join ride_private.race_members m on m.race_id=rid and m.user_id=(x->>'user_id')::uuid where m.member_generation<>(x->>'member_generation')::integer or m.ready_lease_id is distinct from (x->>'ready_lease_id')::uuid or m.ready_until<r.common_start_at) then perform ride_private.race_end(rid,'membership_changed');return;end if;
  update ride_private.races set state='running',updated_at=stamp where id=rid;
 end if;
 end if;
 -- Expiry permits already armed continuous candidates to upload during grace.
 update ride_private.race_attempts set state='dnf',revision=revision+1,terminal_reason='deadline',terminal_at=stamp,updated_at=stamp where race_id=rid and state in('reserved','armed') and coalesce(armed_at,created_at)+interval '30 minutes'<stamp;
 update ride_private.race_attempts set state='dnf',revision=revision+1,terminal_reason='deadline',terminal_at=stamp,updated_at=stamp where race_id=rid and state='upload_pending' and upload_deadline<=stamp;
 -- A disappeared worker cannot hold the one-active-owner slot indefinitely.
 -- Exhaustion is processing failure, never a fabricated quality verdict.
 update ride_private.race_attempts set state=case when verification_attempts>=3 then 'dnf' else 'queued' end,revision=revision+1,terminal_reason=case when verification_attempts>=3 then 'storage_error' else null end,terminal_at=case when verification_attempts>=3 then stamp else null end,verification_token=null,verification_lease_until=null,updated_at=stamp where race_id=rid and((state='verifying' and verification_lease_until<=stamp) or(state='queued' and verification_attempts>=3));
 if stamp>r.ends_at+interval '24 hours' then perform ride_private.race_end(rid,'deadline','expired');
 elsif stamp>r.ends_at and not exists(select 1 from ride_private.race_attempts where race_id=rid and state in('reserved','armed','upload_pending','queued','verifying')) then
  update ride_private.races set state='finished',revision=revision+1,terminal_at=stamp,host_lease_until=null,updated_at=stamp where id=rid;perform ride_private.race_rotate(rid);
 end if;
end$$;
create function ride_private.race_privacy(uid uuid) returns void language plpgsql volatile set search_path='' as $$declare x record;begin
 for x in select r.id from ride_private.races r where r.state not in('cancelled','finished','expired') and exists(select 1 from ride_private.race_members m where m.race_id=r.id and m.user_id=uid) order by r.id loop perform ride_private.race_repair(x.id);end loop;
end$$;
create function ride_private.race_approval(aid uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',a.id,'route_id',a.route_id,'route_revision',a.route_revision,'route_geometry_hash',a.route_geometry_hash,'config_hash',a.config_hash,'course_id',a.course_id,'session_id',a.session_id,'method','route_time_v1','category',a.category,'starts_at',s.starts_at,'ends_at',s.ends_at,'distance_m',
 (select sum(ride_private.route_distance(g,(a.configuration->'route_geometry')->(ord::integer))) from jsonb_array_elements(a.configuration->'route_geometry') with ordinality x(g,ord) where ord<jsonb_array_length(a.configuration->'route_geometry')),'maximum_duration_s',1800)
 from ride_private.race_course_approvals a join public.rs_course_sessions s on s.id=a.session_id where a.id=aid
$$;
create function ride_private.race_member(rid uuid,uid uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('user_id',m.user_id,'role',m.role,'state',m.state,'member_generation',m.member_generation,'friendship_generation',m.host_friendship_generation,'profile',jsonb_build_object('name',p.display_name,'handle',p.handle,'avatar_id',av.avatar_id),'evidence_consent_version',m.evidence_consent_version,'consented_at',m.consented_at,'ready_revision',m.ready_revision,'ready',m.ready_lease_id is not null and m.ready_until>clock_timestamp(),'ready_until',case when m.ready_lease_id is not null and m.ready_until>clock_timestamp() then m.ready_until else null end)
 from ride_private.race_members m join public.rs_profiles p on p.user_id=m.user_id left join public.rs_profile_avatars av on av.user_id=m.user_id where m.race_id=rid and m.user_id=uid
$$;
create function ride_private.race_snapshot(rid uuid,uid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'creator_id',r.creator_id,'revision',r.revision,'mode',r.mode,'metric','route_time','method','route_time_v1','state',r.state,'approval',ride_private.race_approval(r.approval_id),'route_summary',jsonb_build_object('title',r.route_snapshot->'title','revision',r.route_snapshot->'revision','category',r.route_snapshot->'category'),'route_snapshot',r.route_snapshot,'starts_at',r.starts_at,'ends_at',r.ends_at,'lobby_epoch',r.lobby_epoch,'common_start_at',r.common_start_at,'schedule_epoch',r.schedule_epoch,'topic',case when r.state not in('cancelled','finished','expired') and m.state='accepted' then 'rs-race:'||r.topic_id::text else null end,'topic_generation',r.topic_generation,'host_lease_until',r.host_lease_until,'self_member',ride_private.race_member(r.id,uid),'members',(select jsonb_agg(ride_private.race_member(r.id,x.user_id) order by x.user_id) from ride_private.race_members x where x.race_id=r.id),'self_ready',case when m.ready_lease_id is not null and m.ready_until>clock_timestamp() then jsonb_build_object('revision',m.ready_revision,'lease_id',m.ready_lease_id,'attempt_id',m.ready_attempt_id,'until',m.ready_until) else null end,'schedule_ready',case when uid=r.creator_id and m.state='accepted' and r.state in('lobby','countdown') then r.scheduled_members else null end,'updated_at',r.updated_at,'terminal_reason',r.terminal_reason)
 from ride_private.races r join ride_private.race_members m on m.race_id=r.id and m.user_id=uid where r.id=rid and ride_private.race_visible(rid,uid)
$$;
create function ride_private.race_reservation(aid uuid) returns jsonb language sql stable set search_path='' as $$select case when evidence_path is not null then jsonb_build_object('bucket','ride-race-evidence','path',evidence_path,'attempt_id',id,'capture_id',capture_id,'sha256',evidence_sha256,'byte_length',byte_length,'first_sequence',first_sequence,'last_sequence',last_sequence,'sample_count',sample_count,'upload_deadline',upload_deadline) else null end from ride_private.race_attempts where id=aid$$;
create function ride_private.race_attempt(aid uuid,uid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'owner_id',a.owner_id,'race_id',a.race_id,'revision',a.revision,'ordinal',a.ordinal,'member_generation',a.member_generation,'approval_id',a.approval_id,'config_hash',a.config_hash,'platform',a.platform,'provider',a.provider,'ride_id',a.ride_id,'capture_id',a.capture_id,'state',a.state,'armed_at',a.armed_at,'schedule_epoch',a.schedule_epoch,'common_start_at',a.common_start_at,'vehicle',a.vehicle,'evidence',ride_private.race_reservation(a.id),'rejection_code',a.rejection_code,'terminal_reason',a.terminal_reason,'terminal_at',a.terminal_at,'updated_at',a.updated_at)
 from ride_private.race_attempts a where a.id=aid and a.owner_id=uid and ride_private.account_active(uid)
$$;
create function ride_private.race_actor() returns uuid language plpgsql volatile set search_path='' as $$declare uid uuid:=auth.uid();begin
 if uid is null then perform ride_private.race_reject('RACE_AUTH_REQUIRED');end if;
 perform ride_private.account_lock(uid);perform ride_private.live_control_lock();
 if not ride_private.account_active(uid) then perform ride_private.race_reject('ACCOUNT_DELETION_PENDING');end if;return uid;
end$$;
create function ride_private.race_poll(uid uuid,label_value text,resource uuid) returns integer language plpgsql volatile set search_path='' as $$declare retry integer;begin
 retry:=ride_private.race_admit(uid,'read',30,5000,50000);if retry is not null then return retry;end if;return null;
end$$;
create function public.rs_race_operation(p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;begin
 uid:=ride_private.race_actor();if p_operation is null then return ride_private.race_error('RACE_INVALID');end if;return ride_private.race_receipt(uid,p_operation);
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);
end$$;
create function public.rs_get_race(p_race uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;begin
 uid:=ride_private.race_actor();if p_race is null then return ride_private.race_error('RACE_INVALID');end if;retry:=ride_private.race_poll(uid,'race',p_race);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 perform ride_private.race_repair(p_race);return ride_private.race_snapshot(p_race,uid);
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);
end$$;
create function public.rs_list_races(p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;items jsonb;cursor jsonb;n integer;x record;begin
 uid:=ride_private.race_actor();if p_limit is null or p_limit not between 1 and 30 or (p_before is null)<>(p_before_id is null) then return ride_private.race_error('RACE_INVALID');end if;
 retry:=ride_private.race_poll(uid,'list','00000000-0000-0000-0000-000000000000');if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 for x in select r.id from ride_private.races r join ride_private.race_members m on m.race_id=r.id where m.user_id=uid and r.state not in('cancelled','finished','expired') order by r.id loop perform ride_private.race_repair(x.id);end loop;
 select coalesce(jsonb_agg(value order by stamp desc,id desc),'[]'::jsonb),count(*) into items,n from(select r.id,r.updated_at stamp,ride_private.race_snapshot(r.id,uid) value from ride_private.races r where ride_private.race_visible(r.id,uid) and(p_before is null or(r.updated_at,r.id)<(p_before,p_before_id)) order by r.updated_at desc,r.id desc limit p_limit+1)x;
 if n>p_limit then items:=items-(n-1);cursor:=jsonb_build_object('before',items->(p_limit-1)->'updated_at','before_id',items->(p_limit-1)->'id');end if;
 return jsonb_build_object('owner_id',uid,'server_now',clock_timestamp(),'items',items,'next_cursor',cursor);
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);
end$$;
create function public.rs_list_race_approvals(p_route uuid,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;items jsonb;begin
 uid:=ride_private.race_actor();if p_route is null or p_revision is null or p_revision<1 then return ride_private.race_error('RACE_INVALID');end if;
 retry:=ride_private.race_poll(uid,'approvals',p_route);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 select coalesce(jsonb_agg(ride_private.race_approval(id) order by created_at desc,id),'[]') into items from(select a.* from ride_private.race_course_approvals a join public.rs_course_sessions s on s.id=a.session_id where a.route_id=p_route and a.route_revision=p_revision and a.owner_id=uid and s.ends_at>clock_timestamp() and ride_private.race_approval_valid(a.id) order by a.created_at desc,a.id limit 20)x;
 return jsonb_build_object('owner_id',uid,'server_now',clock_timestamp(),'items',items);
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);
end$$;
create function public.rs_get_race_course(p_race uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;value jsonb;begin
 uid:=ride_private.race_actor();retry:=ride_private.race_poll(uid,'course',p_race);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 perform ride_private.race_repair(p_race);if not ride_private.race_member_valid(p_race,uid) then return null;end if;
 select jsonb_build_object('race_id',r.id,'approval_id',a.id,'config_hash',a.config_hash,'route_geometry_hash',a.route_geometry_hash,'configuration',a.configuration) into value from ride_private.races r join ride_private.race_course_approvals a on a.id=r.approval_id where r.id=p_race and r.state not in('cancelled') and ride_private.race_approval_valid(a.id);return value;
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);
end$$;
create function public.rs_get_race_attempt(p_attempt uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;rid uuid;begin
 uid:=ride_private.race_actor();retry:=ride_private.race_poll(uid,'attempt',p_attempt);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 select race_id into rid from ride_private.race_attempts where id=p_attempt and owner_id=uid;perform ride_private.race_repair(rid);return ride_private.race_attempt(p_attempt,uid);
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);
end$$;
create function public.rs_list_race_attempts(p_race uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;items jsonb;begin
 uid:=ride_private.race_actor();if p_race is null then return ride_private.race_error('RACE_INVALID');end if;
 retry:=ride_private.race_poll(uid,'attempts',p_race);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 perform ride_private.race_repair(p_race);if not ride_private.race_visible(p_race,uid) then return ride_private.race_error('RACE_UNAVAILABLE');end if;
 select coalesce(jsonb_agg(ride_private.race_attempt(id,uid) order by ordinal),'[]'::jsonb) into items from ride_private.race_attempts where race_id=p_race and owner_id=uid;
 return jsonb_build_object('owner_id',uid,'race_id',p_race,'items',items);
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);
end$$;
create function public.rs_race_results(p_race uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;items jsonb;statuses jsonb;begin
 uid:=ride_private.race_actor();retry:=ride_private.race_poll(uid,'results',p_race);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 perform ride_private.race_repair(p_race);if not ride_private.race_visible(p_race,uid) then return null;end if;
 select coalesce(jsonb_agg(v.result order by v.verified_at,v.attempt_id),'[]') into items from ride_private.race_results v join ride_private.race_attempts a on a.id=v.attempt_id where v.race_id=p_race and a.state='verified' and ride_private.race_member_valid(p_race,v.owner_id) and ride_private.race_approval_valid(v.approval_id);
 select jsonb_agg(jsonb_build_object('user_id',m.user_id,'state',case when a.id is null then 'not_started' when a.state='verified' then 'verified' when a.state in('queued','verifying','upload_pending') then 'processing' when a.state='rejected' then 'rejected' when a.state in('dnf','aborted') then 'dnf' else 'in_progress' end,'terminal_reason',a.terminal_reason) order by m.user_id) into statuses from ride_private.race_members m left join lateral(select id,state,terminal_reason from ride_private.race_attempts x where x.race_id=m.race_id and x.owner_id=m.user_id order by case when state='verified' then 0 else 1 end,ordinal desc limit 1)a on true where m.race_id=p_race;
 return jsonb_build_object('owner_id',uid,'race_id',p_race,'server_now',clock_timestamp(),'items',items,'statuses',statuses);
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);
end$$;
-- SQL checks structural/operator authority independently. The trusted operator
-- compiler additionally proves full planar geometry; workers repeat that proof.
create function public.rs_approve_race_course(p_approval uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid;r public.rs_routes;d ride_private.route_documents;c public.rs_courses;s public.rs_course_sessions;existing ride_private.race_course_approvals;config jsonb;configuration jsonb;point jsonb;gate jsonb;n integer;distance double precision:=0;previous jsonb;hash text;
begin
 if p_approval is null or p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>65536 or not p_request?&array['schema_version','route_owner_id','route_id','route_revision','route_geometry_hash','course_id','session_id','reviewer_ref','config'] or p_request-array['schema_version','route_owner_id','route_id','route_revision','route_geometry_hash','course_id','session_id','reviewer_ref','config']<>'{}'::jsonb or p_request->'schema_version'<>'1'::jsonb or not ride_private.race_uuid(p_request->'route_owner_id') or not ride_private.race_uuid(p_request->'route_id') or not ride_private.race_uuid(p_request->'course_id') or not ride_private.race_uuid(p_request->'session_id') or not ride_private.ride_number(p_request->'route_revision',1,2147483647,false,true) or not ride_private.garage_text(p_request->'reviewer_ref',120,false) or p_request->>'route_geometry_hash'!~'^[a-f0-9]{64}$' then raise exception 'RACE_INVALID' using errcode='22023';end if;
 owner:=(p_request->>'route_owner_id')::uuid;perform ride_private.account_lock(owner);perform ride_private.live_control_lock();
 if not ride_private.account_active(owner) then raise exception 'ACCOUNT_DELETION_PENDING';end if;
 select * into existing from ride_private.race_course_approvals where id=p_approval;if found then if existing.request<>p_request then raise exception 'RACE_OPERATION_CONFLICT';end if;return ride_private.race_approval(p_approval);end if;
 select * into r from public.rs_routes where id=(p_request->>'route_id')::uuid for share;
 select * into d from ride_private.route_documents where route_id=r.id for share;
 select * into c from public.rs_courses where id=(p_request->>'course_id')::uuid for share;
 select * into s from public.rs_course_sessions where id=(p_request->>'session_id')::uuid for share;
 if r.id is null or r.owner_id<>owner or r.revision<>(p_request->>'route_revision')::integer or r.category not in('scooter','motorcycle','car') or d.geometry_hash<>p_request->>'route_geometry_hash' or jsonb_array_length(d.segments)<>1 or jsonb_array_length(d.segments->0) not between 2 and 512 or not coalesce(c.closed_course_approved,false) or jsonb_array_length(c.boundary_polygon) not between 3 and 128 or not coalesce(s.approved,false) or s.course_id<>c.id or s.ends_at<=clock_timestamp() then raise exception 'RACE_APPROVAL_UNAVAILABLE';end if;
 config:=p_request->'config';
 if jsonb_typeof(config)<>'object' or not config?&array['schema_version','method','staging_polygon','gates','corridor_half_width_m','maximum_speed_mps'] or config-array['schema_version','method','staging_polygon','gates','corridor_half_width_m','maximum_speed_mps']<>'{}'::jsonb or config->'schema_version'<>'1'::jsonb or config->>'method'<>'route_time_v1' or jsonb_typeof(config->'staging_polygon')<>'array' or jsonb_array_length(config->'staging_polygon') not between 3 and 32 or jsonb_typeof(config->'gates')<>'array' or jsonb_array_length(config->'gates') not between 2 and 16 or not ride_private.ride_number(config->'corridor_half_width_m',10,30,false,false) or not ride_private.ride_number(config->'maximum_speed_mps',0.1,138.888889,false,false) then raise exception 'RACE_INVALID' using errcode='22023';end if;
 for point in select value from jsonb_array_elements(d.segments->0) loop
 if not ride_private.route_coordinate(point) or abs((point->>'latitude')::double precision)>80 or ride_private.route_distance(d.segments->0->0,point)>15000 then raise exception 'RACE_INVALID';end if;
 if previous is not null then distance:=distance+ride_private.route_distance(previous,point);end if;previous:=point;
 end loop;if distance not between 100 and 15000 then raise exception 'RACE_INVALID';end if;
 -- Arrays checked individually; no operator replacement route or boundary.
 for point in select value from jsonb_array_elements(c.boundary_polygon||config->'staging_polygon') loop if not ride_private.route_coordinate(point) or abs((point->>'latitude')::double precision)>80 or ride_private.route_distance(d.segments->0->0,point)>15000 then raise exception 'RACE_INVALID';end if;end loop;
 n:=0;for gate in select value from jsonb_array_elements(config->'gates') loop
 if jsonb_typeof(gate)<>'object' or not gate?&array['index','kind','a','b','forward_point','progress_min_m','progress_max_m'] or gate-array['index','kind','a','b','forward_point','progress_min_m','progress_max_m']<>'{}'::jsonb or gate->'index'<>to_jsonb(n) or gate->>'kind'<>(case when n=0 then 'start' when n=jsonb_array_length(config->'gates')-1 then 'finish' else 'checkpoint' end) or not ride_private.route_coordinate(gate->'a') or not ride_private.route_coordinate(gate->'b') or not ride_private.route_coordinate(gate->'forward_point') or not ride_private.ride_number(gate->'progress_min_m',0,15000,false,false) or not ride_private.ride_number(gate->'progress_max_m',0,15000,false,false) or (gate->>'progress_max_m')::numeric<=(gate->>'progress_min_m')::numeric then raise exception 'RACE_INVALID';end if;n:=n+1;
 end loop;
 configuration:=config||jsonb_build_object('origin',d.segments->0->0,'route_geometry',d.segments->0,'boundary_polygon',c.boundary_polygon,'projection','wgs84_ecef_enu_v1','geometry_error_margin_m',0.25,'maximum_accuracy_m',15,'maximum_gap_ms',1500,'maximum_crossing_span_ms',3000,'maximum_duration_ms',1800000,'minimum_duration_ms',10000,'maximum_acceleration_mps2',15,'maximum_backtrack_m',5,'whole_capture_residual_ms',250,'server_time_drift_allowance_ms',250,'live_start_gate_window_ms',10000);
 hash:=encode(sha256(convert_to(configuration::text,'UTF8')),'hex');
 if(select count(*) from ride_private.race_course_approvals where owner_id=owner and revoked_at is null)>=30 then raise exception 'RACE_CAPACITY';end if;
 insert into ride_private.race_course_approvals(id,owner_id,route_id,route_revision,route_geometry_hash,course_id,session_id,configuration,config_hash,category,reviewer_ref,request) values(p_approval,owner,r.id,r.revision,d.geometry_hash,c.id,s.id,configuration,hash,r.category,p_request->>'reviewer_ref',p_request);
 return ride_private.race_approval(p_approval);
end$$;
create function public.rs_revoke_race_course(p_approval uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare owner uuid;x record;begin
 select owner_id into owner from ride_private.race_course_approvals where id=p_approval;if owner is null then return;end if;
 perform ride_private.account_lock(owner);perform ride_private.live_control_lock();
 if p_reason is null or p_reason not in('operator_revoked','course_closed','configuration_changed') then raise exception 'RACE_INVALID';end if;
 update ride_private.race_course_approvals set revoked_at=coalesce(revoked_at,clock_timestamp()),revocation_code=coalesce(revocation_code,p_reason) where id=p_approval;
 for x in select id from ride_private.races where approval_id=p_approval order by id loop perform ride_private.race_end(x.id,'approval_revoked');end loop;
end$$;
create function ride_private.race_xy(origin jsonb,p jsonb) returns double precision[] language plpgsql immutable set search_path='' as $$declare a double precision:=6378137;f double precision:=1/298.257223563;e2 double precision;lat double precision;lon double precision;olat double precision;olon double precision;n double precision;onum double precision;x double precision;y double precision;z double precision;begin
 e2:=f*(2-f);lat:=radians((p->>'latitude')::double precision);lon:=radians((p->>'longitude')::double precision);olat:=radians((origin->>'latitude')::double precision);olon:=radians((origin->>'longitude')::double precision);
 n:=a/sqrt(1-e2*sin(lat)^2);onum:=a/sqrt(1-e2*sin(olat)^2);x:=n*cos(lat)*cos(lon)-onum*cos(olat)*cos(olon);y:=n*cos(lat)*sin(lon)-onum*cos(olat)*sin(olon);z:=n*(1-e2)*sin(lat)-onum*(1-e2)*sin(olat);
 return array[-sin(olon)*x+cos(olon)*y,-sin(olat)*cos(olon)*x-sin(olat)*sin(olon)*y+cos(olat)*z];
end$$;
create function ride_private.race_stage_inside(config jsonb,point jsonb,radius double precision) returns boolean language plpgsql immutable set search_path='' as $$declare p double precision[];a double precision[];b double precision[];origin jsonb:=config->'origin';poly jsonb:=config->'staging_polygon';i integer;j integer;yes boolean:=false;t double precision;distance double precision;gate jsonb;forward double precision[];side double precision;forward_side double precision;begin
 p:=ride_private.race_xy(origin,point);j:=jsonb_array_length(poly)-1;
 for i in 0..jsonb_array_length(poly)-1 loop a:=ride_private.race_xy(origin,poly->j);b:=ride_private.race_xy(origin,poly->i);
 t:=greatest(0,least(1,((p[1]-a[1])*(b[1]-a[1])+(p[2]-a[2])*(b[2]-a[2]))/nullif((b[1]-a[1])^2+(b[2]-a[2])^2,0)));
 distance:=sqrt((p[1]-a[1]-t*(b[1]-a[1]))^2+(p[2]-a[2]-t*(b[2]-a[2]))^2);if distance<=radius+0.25 then return false;end if;
 if (a[2]>p[2])<>(b[2]>p[2]) and p[1]<(b[1]-a[1])*(p[2]-a[2])/(b[2]-a[2])+a[1] then yes:=not yes;end if;j:=i;
 end loop;if not yes then return false;end if;
 gate:=config->'gates'->0;a:=ride_private.race_xy(origin,gate->'a');b:=ride_private.race_xy(origin,gate->'b');forward:=ride_private.race_xy(origin,gate->'forward_point');
 side:=((b[1]-a[1])*(p[2]-a[2])-(b[2]-a[2])*(p[1]-a[1]))/nullif(sqrt((b[1]-a[1])^2+(b[2]-a[2])^2),0);forward_side:=(b[1]-a[1])*(forward[2]-a[2])-(b[2]-a[2])*(forward[1]-a[1]);
 return coalesce(case when forward_side>0 then side< -radius-0.25 else side>radius+0.25 end,false);
end$$;
create function ride_private.race_probes(uid uuid,aid uuid,capture uuid,ids uuid[]) returns uuid language plpgsql volatile set search_path='' as $$declare gen uuid;g uuid;p ride_private.race_clock_probes;begin
 if ids is null or array_length(ids,1) not between 3 and 5 or(select count(distinct x) from unnest(ids)x)<>array_length(ids,1) then perform ride_private.race_reject('RACE_CLOCK_UNAVAILABLE');end if;
 foreach g in array ids loop select * into p from ride_private.race_clock_probes where owner_id=uid and probe_id=g and attempt_id=aid and capture_id=capture;
 if not found or p.server_received_at<clock_timestamp()-interval '5 seconds' or(gen is not null and gen<>p.clock_generation) then perform ride_private.race_reject('RACE_CLOCK_UNAVAILABLE');end if;gen:=p.clock_generation;
 end loop;update ride_private.race_clock_probes set bound=true where owner_id=uid and probe_id=any(ids);return gen;
end$$;
create function ride_private.race_control(uid uuid,p jsonb) returns jsonb language plpgsql volatile set search_path='' as $$
declare action_value text:=p->>'action';r ride_private.races;m ride_private.race_members;a ride_private.race_attempts;approval ride_private.race_course_approvals;session public.rs_course_sessions;
 rid uuid;aid uuid;stamp timestamptz:=clock_timestamp();projection jsonb;friend jsonb;other uuid;stage ride_private.race_stage_slots;probes uuid[];gen uuid;vehicle jsonb;ordinal_value integer;binding jsonb;x record;retry integer;start_at timestamptz;end_at timestamptz;path text;object storage.objects;
begin
 if action_value='race_create' then
  if not(select enabled from ride_private.race_policy where singleton) then perform ride_private.race_reject('RACE_DISABLED');end if;
  if not exists(select 1 from public.rs_profiles where user_id=uid) then perform ride_private.race_reject('RACE_PROFILE_REQUIRED');end if;
  select * into approval from ride_private.race_course_approvals where id=(p->>'approval_id')::uuid;
  if not found or approval.owner_id<>uid or approval.route_id<>(p->>'route_id')::uuid or approval.route_revision<>(p->>'route_revision')::integer or not ride_private.race_approval_valid(approval.id) then perform ride_private.race_reject('RACE_APPROVAL_UNAVAILABLE');end if;
  select * into session from public.rs_course_sessions where id=approval.session_id;
  start_at:=ride_private.race_stamp(p->'starts_at');end_at:=ride_private.race_stamp(p->'ends_at');
  if start_at<session.starts_at or end_at>session.ends_at or end_at<=stamp or end_at<=start_at or end_at>start_at+interval '24 hours' then perform ride_private.race_reject('RACE_SESSION_UNAVAILABLE');end if;
  projection:=ride_private.route_safe_snapshot(approval.route_id);
  if projection->>'geometryHash' is null or projection->>'geometryHash'<>p->>'reviewed_projection_hash' then perform ride_private.race_reject('RACE_CHANGED');end if;
  if exists(select 1 from ride_private.races where id=(p->>'race_id')::uuid) then perform ride_private.race_reject('RACE_UNAVAILABLE');end if;
  if p->>'mode'='live' then
   for x in select id from ride_private.races where mode='live' and state in('lobby','countdown','running') order by id loop perform ride_private.race_repair(x.id);end loop;
   if(select count(*) from ride_private.races where mode='live' and state in('lobby','countdown','running'))>=(select max_live_races from ride_private.race_policy) then perform ride_private.race_reject('RACE_CAPACITY');end if;
  elsif(select count(*) from ride_private.races where creator_id=uid and mode='async' and state='open')>=10 then perform ride_private.race_reject('RACE_CAPACITY');end if;
  for friend in select value from jsonb_array_elements(p->'friends') loop other:=(friend->>'user_id')::uuid;
   if other=uid or ride_private.live_friend_generation(uid,other) is distinct from (friend->>'friendship_generation')::integer or not exists(select 1 from public.rs_profiles where user_id=other) then perform ride_private.race_reject('RACE_FRIEND_CHANGED');end if;
   if exists(select 1 from jsonb_array_elements(p->'friends') f where (f->>'user_id')::uuid<>other and ride_private.blocked(other,(f->>'user_id')::uuid)) then perform ride_private.race_reject('RACE_BLOCKED');end if;
  end loop;
  retry:=ride_private.race_admit(uid,'create',10,10,100);if retry is not null then perform ride_private.race_reject('RACE_CAPACITY');end if;
  rid:=(p->>'race_id')::uuid;
  insert into ride_private.races(id,creator_id,mode,approval_id,route_snapshot,starts_at,ends_at,acknowledgement_version,state,host_lease_until) values(rid,uid,p->>'mode',approval.id,projection,start_at,end_at,1,case when p->>'mode'='live' then 'lobby' else 'open' end,case when p->>'mode'='live' then least(stamp+interval '45 seconds',end_at) else null end);
  insert into ride_private.race_members(race_id,user_id,role,state,evidence_consent_version,consented_at) values(rid,uid,'host','accepted',1,stamp);
  for friend in select value from jsonb_array_elements(p->'friends') loop insert into ride_private.race_members(race_id,user_id,role,state,host_friendship_generation) values(rid,(friend->>'user_id')::uuid,'member','invited',(friend->>'friendship_generation')::integer);end loop;
  return jsonb_build_object('action',action_value,'race',ride_private.race_snapshot(rid,uid));
 end if;
 if p?'attempt_id' and action_value not in('attempt_reserve','race_ready') then
  select * into a from ride_private.race_attempts where id=(p->>'attempt_id')::uuid and owner_id=uid;rid:=a.race_id;aid:=a.id;
 else rid:=(p->>'race_id')::uuid;end if;
 if rid is null then perform ride_private.race_reject('RACE_UNAVAILABLE');end if;
 perform ride_private.race_repair(rid);select * into r from ride_private.races where id=rid for update;
 if not found or not ride_private.race_visible(rid,uid) then perform ride_private.race_reject('RACE_UNAVAILABLE');end if;
 select * into m from ride_private.race_members where race_id=rid and user_id=uid for update;
 if p?'expected_revision' and action_value in('member_action','attempt_reserve','race_ready','race_schedule','race_cancel') and r.revision<>(p->>'expected_revision')::integer then perform ride_private.race_reject('RACE_CHANGED');end if;
 if p?'expected_member_generation' and m.member_generation<>(p->>'expected_member_generation')::integer then perform ride_private.race_reject('RACE_MEMBER_CHANGED');end if;
 if action_value='race_cancel' then
  if uid<>r.creator_id or r.state in('cancelled','finished','expired') then perform ride_private.race_reject('RACE_UNAVAILABLE');end if;
  perform ride_private.race_end(rid,'host_cancelled');return jsonb_build_object('action',action_value,'race',ride_private.race_snapshot(rid,uid));
 end if;
 if action_value='member_action' then
  if m.role<>'member' or m.host_friendship_generation<>(p->>'expected_friendship_generation')::integer or m.host_friendship_generation is distinct from ride_private.live_friend_generation(r.creator_id,uid) then perform ride_private.race_reject('RACE_FRIEND_CHANGED');end if;
  if r.state not in('open','lobby') or r.ends_at<=stamp or(p->>'decision' in('accept','decline') and m.state<>'invited') or(p->>'decision'='withdraw' and m.state<>'accepted') then perform ride_private.race_reject('RACE_MEMBER_CHANGED');end if;
  if p->>'decision'='withdraw' then
   update ride_private.race_attempts set state='dnf',revision=revision+1,terminal_reason='membership_changed',terminal_at=stamp,verification_token=null,verification_lease_until=null,updated_at=stamp where race_id=rid and owner_id=uid and state in('reserved','armed','upload_pending','queued','verifying');
  end if;
  update ride_private.race_members set state=case p->>'decision' when 'accept' then 'accepted' when 'decline' then 'declined' else 'withdrawn' end,member_generation=member_generation+1,evidence_consent_version=case when p->>'decision'='accept' then 1 else evidence_consent_version end,consented_at=case when p->>'decision'='accept' then stamp else consented_at end,updated_at=stamp where race_id=rid and user_id=uid;
  update ride_private.races set revision=revision+1,lobby_epoch=gen_random_uuid(),updated_at=stamp where id=rid;
  update ride_private.race_members set ready_revision=ready_revision+1,ready_lease_id=null,ready_attempt_id=null,ready_until=null,ready_probe_ids=null,ready_clock_generation=null where race_id=rid and ready_lease_id is not null;
  delete from ride_private.race_stage_slots where race_id=rid;perform ride_private.race_rotate(rid);return jsonb_build_object('action',action_value,'race',ride_private.race_snapshot(rid,uid));
 end if;
 if not ride_private.race_member_valid(rid,uid) then perform ride_private.race_reject('RACE_MEMBER_CHANGED');end if;
 select * into approval from ride_private.race_course_approvals where id=r.approval_id;
 if not ride_private.race_approval_valid(approval.id) then perform ride_private.race_reject('RACE_APPROVAL_UNAVAILABLE');end if;
 if action_value='attempt_reserve' then
  if not(select enabled from ride_private.race_policy where singleton) then perform ride_private.race_reject('RACE_DISABLED');end if;
  if r.state not in('open','lobby') or stamp<r.starts_at or stamp>=r.ends_at then perform ride_private.race_reject('RACE_TOO_LATE');end if;
  if exists(select 1 from ride_private.race_attempts where owner_id=uid and state in('reserved','armed','upload_pending','queued','verifying')) then perform ride_private.race_reject('RACE_ATTEMPT_ACTIVE');end if;
  select coalesce(max(ordinal),0)+1 into ordinal_value from ride_private.race_attempts where race_id=rid and owner_id=uid;
  if ordinal_value>3 then perform ride_private.race_reject('RACE_ATTEMPT_LIMIT');end if;
  aid:=(p->>'attempt_id')::uuid;if exists(select 1 from ride_private.race_attempts where id=aid) then perform ride_private.race_reject('RACE_ATTEMPT_CHANGED');end if;
  if p->'vehicle_local_id'<>'null'::jsonb then
   select jsonb_build_object('local_id',v->'id','catalog_id',v->'catalogId','category',case v->>'category' when 'bigbike' then 'motorcycle' else v->>'category' end,'brand',v->'brand','model',v->'model','variant',v->'variant','year',v->'year','powertrain',coalesce(nullif(v->>'powertrain',''), 'unknown'),'engine_cc',v->'engineCc','motor_kw',v->'motorPowerKw') into vehicle from public.rs_garages g cross join lateral jsonb_array_elements(g.document->'vehicles')v where g.owner_id=uid and v->>'id'=p->>'vehicle_local_id';
   if vehicle is null or vehicle->>'category'<>approval.category then perform ride_private.race_reject('RACE_INVALID');end if;
  end if;
  retry:=ride_private.race_admit(uid,'reserve',10,10,1000);if retry is not null then perform ride_private.race_reject('RACE_ATTEMPT_LIMIT');end if;
  insert into ride_private.race_attempts(id,owner_id,race_id,member_generation,ordinal,approval_id,config_hash,platform,provider,ride_id,capture_id,vehicle,state) values(aid,uid,rid,m.member_generation,ordinal_value,approval.id,approval.config_hash,p->>'platform',p->>'provider',(p->>'ride_id')::uuid,(p->>'capture_id')::uuid,vehicle,'reserved');
  return jsonb_build_object('action',action_value,'attempt',ride_private.race_attempt(aid,uid));
 end if;
 if action_value in('race_unready','race_schedule') then
  if r.mode<>'live' then perform ride_private.race_reject('RACE_UNAVAILABLE');end if;
  if action_value='race_unready' then
   if m.ready_revision<>(p->>'expected_ready_revision')::integer or m.ready_lease_id is distinct from (p->>'expected_ready_lease_id')::uuid then perform ride_private.race_reject('RACE_READY_CHANGED');end if;
   update ride_private.race_members set ready_revision=ready_revision+1,ready_lease_id=null,ready_attempt_id=null,ready_until=null,ready_probe_ids=null,ready_clock_generation=null where race_id=rid and user_id=uid returning * into m;
   if r.common_start_at is not null and stamp<r.common_start_at then perform ride_private.race_end(rid,'membership_changed');
   elsif r.common_start_at is not null then update ride_private.race_attempts set state='dnf',revision=revision+1,terminal_reason='quality',terminal_at=stamp,updated_at=stamp where race_id=rid and owner_id=uid and state in('reserved','armed');end if;
   perform ride_private.race_rotate(rid);
  else
   if uid<>r.creator_id or r.state<>'lobby' or r.lobby_epoch<>(p->>'lobby_epoch')::uuid or r.host_lease_until<=stamp then perform ride_private.race_reject('RACE_CHANGED');end if;
   if jsonb_array_length(p->'ready')<>(select count(*) from ride_private.race_members where race_id=rid and state='accepted') then perform ride_private.race_reject('RACE_NOT_READY');end if;
   for binding in select value from jsonb_array_elements(p->'ready') loop
    select * into m from ride_private.race_members where race_id=rid and user_id=(binding->>'user_id')::uuid;
    select * into stage from ride_private.race_stage_slots where owner_id=m.user_id and race_id=rid and attempt_id=(binding->>'attempt_id')::uuid and lobby_epoch=r.lobby_epoch and expires_at>stamp;
    if m.state<>'accepted' or m.member_generation<>(binding->>'member_generation')::integer or m.ready_revision<>(binding->>'ready_revision')::integer or m.ready_lease_id is distinct from (binding->>'ready_lease_id')::uuid or m.ready_attempt_id is distinct from (binding->>'attempt_id')::uuid or m.ready_until<=stamp or stage.owner_id is null or not ride_private.race_member_valid(rid,m.user_id) then perform ride_private.race_reject('RACE_NOT_READY');end if;
    perform ride_private.race_probes(m.user_id,m.ready_attempt_id,stage.capture_id,m.ready_probe_ids);
   end loop;
   if stamp+interval '20 seconds'>r.ends_at then perform ride_private.race_reject('RACE_TOO_LATE');end if;
   update ride_private.races set state='countdown',revision=revision+1,common_start_at=stamp+interval '10 seconds',schedule_epoch=gen_random_uuid(),scheduled_members=p->'ready',updated_at=stamp where id=rid returning * into r;
   update ride_private.race_attempts a2 set schedule_epoch=r.schedule_epoch,common_start_at=r.common_start_at,updated_at=stamp where a2.race_id=rid and exists(select 1 from jsonb_array_elements(p->'ready') b where (b->>'attempt_id')::uuid=a2.id);
   perform ride_private.race_rotate(rid);return jsonb_build_object('action',action_value,'race',ride_private.race_snapshot(rid,uid),'common_start_at',r.common_start_at,'schedule_epoch',r.schedule_epoch,'scheduled_members',p->'ready');
  end if;
  return jsonb_build_object('action',action_value,'race_id',rid,'member_generation',m.member_generation,'ready_revision',m.ready_revision,'ready_lease_id',m.ready_lease_id,'ready_until',m.ready_until,'lobby_epoch',r.lobby_epoch,'attempt_id',m.ready_attempt_id);
 end if;
 if action_value='race_ready' then aid:=(p->>'attempt_id')::uuid;end if;
 select * into a from ride_private.race_attempts where id=aid and owner_id=uid for update;
 if not found or a.race_id<>rid or a.member_generation<>m.member_generation then perform ride_private.race_reject('RACE_ATTEMPT_CHANGED');end if;
 if action_value<>'race_ready' and a.revision<>(p->>'expected_revision')::integer then perform ride_private.race_reject('RACE_ATTEMPT_CHANGED');end if;
 if action_value in('attempt_arm','race_ready') then
  if not(select enabled from ride_private.race_policy where singleton) then perform ride_private.race_reject('RACE_DISABLED');end if;
  if a.capture_id<>(p->>'capture_id')::uuid then perform ride_private.race_reject('RACE_CAPTURE_MISMATCH');end if;
  if r.state not in('open','lobby') or stamp>=r.ends_at then perform ride_private.race_reject('RACE_TOO_LATE');end if;
  select * into stage from ride_private.race_stage_slots where owner_id=uid and attempt_id=aid and proof_id=(p->>'stage_proof_id')::uuid and capture_id=a.capture_id and lobby_epoch=r.lobby_epoch and expires_at>stamp;
  if not found then perform ride_private.race_reject('RACE_STAGE_UNAVAILABLE');end if;
  select array_agg(value::uuid order by ord) into probes from jsonb_array_elements_text(p->'clock_probe_ids') with ordinality x(value,ord);
  gen:=ride_private.race_probes(uid,aid,a.capture_id,probes);
  if action_value='attempt_arm' then
   if a.state<>'reserved' then perform ride_private.race_reject('RACE_ATTEMPT_CHANGED');end if;
   update ride_private.race_attempts set state='armed',revision=revision+1,armed_at=stamp,arm_probe_ids=probes,clock_generation=gen,updated_at=stamp where id=aid;
   return jsonb_build_object('action',action_value,'attempt',ride_private.race_attempt(aid,uid));
  end if;
  if r.mode<>'live' or r.lobby_epoch<>(p->>'lobby_epoch')::uuid or a.state<>'armed' or a.clock_generation<>gen or m.ready_revision<>(p->>'expected_ready_revision')::integer or m.ready_lease_id is not null then perform ride_private.race_reject('RACE_READY_CHANGED');end if;
  update ride_private.race_members set ready_revision=ready_revision+1,ready_lease_id=gen_random_uuid(),ready_attempt_id=aid,ready_until=least(stamp+interval '15 seconds',r.ends_at),ready_probe_ids=probes,ready_clock_generation=gen where race_id=rid and user_id=uid returning * into m;
  perform ride_private.race_rotate(rid);return jsonb_build_object('action',action_value,'race_id',rid,'member_generation',m.member_generation,'ready_revision',m.ready_revision,'ready_lease_id',m.ready_lease_id,'ready_until',m.ready_until,'lobby_epoch',r.lobby_epoch,'attempt_id',aid);
 end if;
 if action_value='attempt_abort' then
  if a.state not in('reserved','armed','upload_pending','queued') then perform ride_private.race_reject('RACE_ATTEMPT_CHANGED');end if;
  update ride_private.race_attempts set state=case when r.common_start_at is not null and stamp>=r.common_start_at then 'dnf' else 'aborted' end,revision=revision+1,terminal_reason=p->>'reason',terminal_at=stamp,updated_at=stamp where id=aid;
  delete from ride_private.race_stage_slots where owner_id=uid and attempt_id=aid;
  update ride_private.race_members set ready_revision=ready_revision+1,ready_lease_id=null,ready_attempt_id=null,ready_until=null,ready_probe_ids=null,ready_clock_generation=null where race_id=rid and user_id=uid and ready_lease_id is not null;
  if r.common_start_at is not null and stamp<r.common_start_at then perform ride_private.race_end(rid,'membership_changed');else perform ride_private.race_rotate(rid);end if;
  return jsonb_build_object('action',action_value,'attempt',ride_private.race_attempt(aid,uid));
 end if;
 if action_value='evidence_bind' then
  if a.capture_id<>(p->>'capture_id')::uuid then perform ride_private.race_reject('RACE_CAPTURE_MISMATCH');end if;
  if a.evidence_path is not null then perform ride_private.race_reject('RACE_EVIDENCE_BOUND');end if;
  if a.state<>'armed' or r.state='cancelled' or stamp>r.ends_at+interval '24 hours' or(r.mode='live' and (a.schedule_epoch is null or a.schedule_epoch is distinct from r.schedule_epoch)) then perform ride_private.race_reject('RACE_TOO_LATE');end if;
  if ride_private.race_reserved_evidence_bytes()+(p->>'byte_length')::numeric>268435456 then perform ride_private.race_reject('RACE_CAPACITY');end if;
  path:=uid::text||'/'||aid::text||'/route-time-v1.json';
  update ride_private.race_attempts set state='upload_pending',revision=revision+1,evidence_path=path,evidence_sha256=p->>'sha256',byte_length=(p->>'byte_length')::integer,first_sequence=(p->>'first_sequence')::integer,last_sequence=(p->>'last_sequence')::integer,sample_count=(p->>'sample_count')::integer,upload_deadline=least(stamp+interval '24 hours',r.ends_at+interval '24 hours'),updated_at=stamp where id=aid;
  insert into ride_private.race_evidence_cleanup(path,sha256,eligible_at) values(path,p->>'sha256',stamp+interval '7 days');
  return jsonb_build_object('action',action_value,'attempt',ride_private.race_attempt(aid,uid),'reservation',ride_private.race_reservation(aid));
 end if;
 if action_value='evidence_queue' then
  if a.state<>'upload_pending' or a.evidence_sha256<>p->>'sha256' then perform ride_private.race_reject('RACE_EVIDENCE_BOUND');end if;
  if a.upload_deadline<=stamp then perform ride_private.race_reject('RACE_UPLOAD_EXPIRED');end if;
  select * into object from storage.objects where bucket_id='ride-race-evidence' and name=a.evidence_path;
  if not found or object.metadata->>'mimetype'<>'application/json' or coalesce(object.metadata->>'size','')!~'^[0-9]+$' or(object.metadata->>'size')::numeric<>a.byte_length then perform ride_private.race_reject('RACE_EVIDENCE_UNAVAILABLE');end if;
  update ride_private.race_attempts set state='queued',revision=revision+1,updated_at=stamp where id=aid;delete from ride_private.race_stage_slots where owner_id=uid and attempt_id=aid;
  return jsonb_build_object('action',action_value,'attempt',ride_private.race_attempt(aid,uid));
 end if;
 perform ride_private.race_reject('RACE_INVALID');return null;
end$$;
create function public.rs_race_mutate(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;p jsonb;existing jsonb;cancelled ride_private.race_activation_cancellations;retry integer;result jsonb;begin
 begin uid:=ride_private.race_actor();p:=ride_private.race_request(p_request);if p_operation is null then perform ride_private.race_reject('RACE_INVALID');end if;
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);end;
 existing:=ride_private.race_receipt(uid,p_operation);if existing is not null then if existing->'request'<>p then return ride_private.race_error('RACE_OPERATION_CONFLICT');end if;return existing;end if;
 select * into cancelled from ride_private.race_activation_cancellations where owner_id=uid and operation_id=p_operation;
 if found then return ride_private.race_error(case when cancelled.request=p then 'RACE_OPERATION_CANCELLED' else 'RACE_OPERATION_CONFLICT' end);end if;
 retry:=ride_private.race_admit(uid,'control',60,500,10000);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 begin result:=ride_private.race_control(uid,p);insert into ride_private.race_operations(owner_id,operation_id,request,result) values(uid,p_operation,p,result);return ride_private.race_receipt(uid,p_operation);
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);end;
end$$;
create function public.rs_cancel_race_activation(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;p jsonb;existing jsonb;cancelled ride_private.race_activation_cancellations;retry integer;begin
 begin uid:=ride_private.race_actor();p:=ride_private.race_request(p_request);if p_operation is null or p->>'action' not in('attempt_arm','race_ready','race_schedule') then perform ride_private.race_reject('RACE_INVALID');end if;exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);end;
 existing:=ride_private.race_receipt(uid,p_operation);if existing is not null then if existing->'request'<>p then return ride_private.race_error('RACE_OPERATION_CONFLICT');end if;return existing;end if;
 select * into cancelled from ride_private.race_activation_cancellations where owner_id=uid and operation_id=p_operation;
 if found then if cancelled.request<>p then return ride_private.race_error('RACE_OPERATION_CONFLICT');end if;
 else retry:=ride_private.race_admit(uid,'control',60,500,10000);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 insert into ride_private.race_activation_cancellations(owner_id,operation_id,request) values(uid,p_operation,p) returning * into cancelled;end if;
 return jsonb_build_object('kind','cancelled','owner_id',uid,'operation_id',p_operation,'request',p,'cancelled_at',cancelled.cancelled_at);
end$$;
create function public.rs_race_clock(p_probe uuid,p_race uuid,p_capture uuid,p_generation uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;received timestamptz:=clock_timestamp();a ride_private.race_attempts;r ride_private.races;p ride_private.race_clock_probes;retry integer;begin
 begin uid:=ride_private.race_actor();if p_probe is null or p_race is null or p_capture is null or p_generation is null then perform ride_private.race_reject('RACE_INVALID');end if;exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);end;
 select * into p from ride_private.race_clock_probes where owner_id=uid and probe_id=p_probe;
 if found then if p.race_id<>p_race or p.capture_id<>p_capture or p.clock_generation<>p_generation then return ride_private.race_error('RACE_OPERATION_CONFLICT');end if;
 else
 retry:=ride_private.race_admit(uid,'clock',40,1200,20000);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 perform ride_private.race_repair(p_race);select * into r from ride_private.races where id=p_race;
 select * into a from ride_private.race_attempts where race_id=p_race and owner_id=uid and capture_id=p_capture and state in('reserved','armed');
 if not(select enabled from ride_private.race_policy where singleton) then return ride_private.race_error('RACE_DISABLED');end if;
 if a.id is null or not ride_private.race_member_valid(p_race,uid) or r.state not in('open','lobby','countdown') or(r.common_start_at is not null and r.common_start_at<=clock_timestamp()) or(a.clock_generation is not null and a.clock_generation<>p_generation) then return ride_private.race_error('RACE_CLOCK_UNAVAILABLE');end if;
 if(select count(*) from ride_private.race_clock_probes where attempt_id=a.id)>=24 then return ride_private.race_error('RACE_CAPACITY');end if;
 insert into ride_private.race_clock_probes(owner_id,probe_id,race_id,attempt_id,capture_id,clock_generation,server_received_at,server_sent_at) values(uid,p_probe,p_race,a.id,p_capture,p_generation,received,clock_timestamp()) returning * into p;
 end if;
 return jsonb_build_object('owner_id',uid,'probe_id',p.probe_id,'race_id',p.race_id,'capture_id',p.capture_id,'clock_generation',p.clock_generation,'server_received_at',p.server_received_at,'server_sent_at',p.server_sent_at);
end$$;
create function ride_private.race_clear_stage(uid uuid,rid uuid) returns void language plpgsql volatile set search_path='' as $$declare r ride_private.races;begin
 delete from ride_private.race_stage_slots where owner_id=uid and race_id=rid;
 update ride_private.race_members set ready_revision=ready_revision+1,ready_lease_id=null,ready_until=null,ready_attempt_id=null,ready_probe_ids=null,ready_clock_generation=null where user_id=uid and race_id=rid and ready_lease_id is not null;
 if found then select * into r from ride_private.races where id=rid;if r.common_start_at>clock_timestamp() then perform ride_private.race_end(rid,'membership_changed');else perform ride_private.race_rotate(rid);end if;end if;
end$$;
create function public.rs_race_stage(p_sample jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;r ride_private.races;m ride_private.race_members;a ride_private.race_attempts;old ride_private.race_stage_slots;slot ride_private.race_stage_slots;keys text[]:=array['schema_version','race_id','member_generation','attempt_id','capture_id','lobby_epoch','sequence','platform','provider','timestamp_ms','received_wall_ms','received_monotonic_ms','latitude','longitude','horizontal_accuracy_m','is_simulated_by_software','is_produced_by_accessory','mocked'];k text;hash text;retry integer;stamp timestamptz;rid uuid;
begin
 begin uid:=ride_private.race_actor();if p_sample is null or jsonb_typeof(p_sample)<>'object' or octet_length(p_sample::text)>4096 or not p_sample?&keys or p_sample-keys<>'{}'::jsonb or p_sample->'schema_version'<>'1'::jsonb then perform ride_private.race_reject('RACE_INVALID');end if;
 foreach k in array array['race_id','attempt_id','capture_id','lobby_epoch'] loop if not ride_private.race_uuid(p_sample->k) then perform ride_private.race_reject('RACE_INVALID');end if;end loop;
 foreach k in array array['platform','provider'] loop if jsonb_typeof(p_sample->k)<>'string' then perform ride_private.race_reject('RACE_INVALID');end if;end loop;
 foreach k in array array['sequence','member_generation'] loop if not ride_private.ride_number(p_sample->k,1,2147483647,false,true) then perform ride_private.race_reject('RACE_INVALID');end if;end loop;
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);end;
 rid:=(p_sample->>'race_id')::uuid;hash:=encode(sha256(convert_to(p_sample::text,'UTF8')),'hex');stamp:=clock_timestamp();
 select * into a from ride_private.race_attempts where id=(p_sample->>'attempt_id')::uuid and owner_id=uid and race_id=rid;
 if a.id is null then return ride_private.race_error('RACE_UNAVAILABLE');end if;
 select * into old from ride_private.race_stage_slots where owner_id=uid;
 if old.attempt_id=a.id and old.sequence=(p_sample->>'sequence')::integer and old.sample_hash=hash and old.expires_at>stamp and ride_private.race_member_valid(rid,uid) then slot:=old;
 else
  retry:=ride_private.race_admit(uid,'stage',60,1200,20000);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
  if old.attempt_id=a.id and old.received_at>stamp-interval '1 second' then return ride_private.race_error('RACE_RATE_LIMITED',greatest(1,ceil(extract(epoch from old.received_at+interval '1 second'-stamp)*1000)::integer));end if;
  begin
  perform ride_private.race_repair(rid);select * into r from ride_private.races where id=rid;select * into m from ride_private.race_members where race_id=rid and user_id=uid;
  if not(select enabled from ride_private.race_policy where singleton) then perform ride_private.race_reject('RACE_DISABLED');end if;
  if not ride_private.race_member_valid(rid,uid) or r.state not in('open','lobby','countdown') or r.common_start_at<=stamp or a.state not in('reserved','armed') or a.member_generation<>(p_sample->>'member_generation')::integer or m.member_generation<>a.member_generation or r.lobby_epoch<>(p_sample->>'lobby_epoch')::uuid then perform ride_private.race_reject('RACE_STAGE_UNAVAILABLE');end if;
  if a.capture_id<>(p_sample->>'capture_id')::uuid or a.platform<>p_sample->>'platform' or a.provider<>p_sample->>'provider' then perform ride_private.race_reject('RACE_CAPTURE_MISMATCH');end if;
  if old.attempt_id=a.id and old.sequence>=(p_sample->>'sequence')::integer then perform ride_private.race_reject('RACE_STAGE_UNAVAILABLE');end if;
  foreach k in array array['timestamp_ms','received_wall_ms'] loop if not ride_private.ride_number(p_sample->k,1577836800000,4133980800000,false,false) then perform ride_private.race_reject('RACE_STAGE_UNAVAILABLE');end if;end loop;
  if not ride_private.ride_number(p_sample->'received_monotonic_ms',0,9007199254740991,false,false) or not ride_private.ride_number(p_sample->'latitude',-80,80,false,false) or not ride_private.ride_number(p_sample->'longitude',-180,180,false,false) or not ride_private.ride_number(p_sample->'horizontal_accuracy_m',0.000001,15,false,false) or (p_sample->>'received_wall_ms')::numeric-(p_sample->>'timestamp_ms')::numeric not between -500 and 3000 then perform ride_private.race_reject('RACE_STAGE_UNAVAILABLE');end if;
  foreach k in array array['is_simulated_by_software','is_produced_by_accessory','mocked'] loop if jsonb_typeof(p_sample->k) not in('null','boolean') then perform ride_private.race_reject('RACE_STAGE_UNAVAILABLE');end if;end loop;
  if p_sample->'mocked'='true'::jsonb or p_sample->'is_simulated_by_software'='true'::jsonb or not ride_private.race_stage_inside((select configuration from ride_private.race_course_approvals where id=a.approval_id),jsonb_build_object('latitude',p_sample->'latitude','longitude',p_sample->'longitude'),(p_sample->>'horizontal_accuracy_m')::double precision) then perform ride_private.race_reject('RACE_STAGE_UNAVAILABLE');end if;
  insert into ride_private.race_stage_slots(owner_id,race_id,attempt_id,capture_id,lobby_epoch,member_generation,sequence,proof_id,sample,sample_hash,received_at,expires_at) values(uid,rid,a.id,a.capture_id,r.lobby_epoch,m.member_generation,(p_sample->>'sequence')::integer,gen_random_uuid(),p_sample,hash,stamp,least(stamp+interval '3 seconds',r.ends_at,coalesce(r.host_lease_until,r.ends_at)))
  on conflict(owner_id) do update set race_id=excluded.race_id,attempt_id=excluded.attempt_id,capture_id=excluded.capture_id,lobby_epoch=excluded.lobby_epoch,member_generation=excluded.member_generation,sequence=excluded.sequence,proof_id=excluded.proof_id,sample=excluded.sample,sample_hash=excluded.sample_hash,received_at=excluded.received_at,expires_at=excluded.expires_at returning * into slot;
  exception when sqlstate 'RC001' then perform ride_private.race_clear_stage(uid,rid);return ride_private.race_error(sqlerrm);end;
 end if;
 return jsonb_build_object('owner_id',uid,'race_id',slot.race_id,'attempt_id',slot.attempt_id,'capture_id',slot.capture_id,'lobby_epoch',slot.lobby_epoch,'member_generation',slot.member_generation,'sequence',slot.sequence,'proof_id',slot.proof_id,'received_at',slot.received_at,'expires_at',slot.expires_at);
end$$;
create function public.rs_race_heartbeat(p_race uuid,p_member_generation integer,p_ready_lease uuid default null,p_attempt uuid default null,p_stage_proof uuid default null,p_clock_probe_ids uuid[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;received timestamptz:=clock_timestamp();r ride_private.races;m ride_private.race_members;stage ride_private.race_stage_slots;gen uuid;retry integer;last_at timestamptz;
begin
 begin uid:=ride_private.race_actor();if p_race is null or p_member_generation is null or p_member_generation<1 or(p_ready_lease is null)<>(p_attempt is null) or(p_ready_lease is null)<>(p_stage_proof is null) or(p_ready_lease is null)<>(p_clock_probe_ids is null) then perform ride_private.race_reject('RACE_INVALID');end if;exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);end;
 retry:=ride_private.race_admit(uid,'heartbeat',60,1200,20000);if retry is not null then return ride_private.race_error('RACE_RATE_LIMITED',retry);end if;
 select x.last_at into last_at from ride_private.race_poll_slots x where owner_id=uid and label='heartbeat' and resource_id=p_race;
 if last_at>clock_timestamp()-interval '1 second' then return ride_private.race_error('RACE_RATE_LIMITED',greatest(1,ceil(extract(epoch from last_at+interval '1 second'-clock_timestamp())*1000)::integer));end if;
 begin
 perform ride_private.race_repair(p_race);select * into r from ride_private.races where id=p_race for update;select * into m from ride_private.race_members where race_id=p_race and user_id=uid for update;
 if not ride_private.race_member_valid(p_race,uid) or r.mode<>'live' or r.state not in('lobby','countdown','running') or m.member_generation<>p_member_generation then perform ride_private.race_reject('RACE_MEMBER_CHANGED');end if;
 if uid=r.creator_id then update ride_private.races set host_lease_until=least(clock_timestamp()+interval '45 seconds',ends_at) where id=p_race returning * into r;end if;
 if p_ready_lease is not null then
  select * into stage from ride_private.race_stage_slots where owner_id=uid and race_id=p_race and attempt_id=p_attempt and proof_id=p_stage_proof and lobby_epoch=r.lobby_epoch and expires_at>clock_timestamp();
  if m.ready_lease_id is distinct from p_ready_lease or m.ready_attempt_id is distinct from p_attempt or stage.owner_id is null or r.common_start_at<=clock_timestamp() then perform ride_private.race_reject('RACE_READY_CHANGED');end if;
  gen:=ride_private.race_probes(uid,p_attempt,stage.capture_id,p_clock_probe_ids);if gen<>m.ready_clock_generation then perform ride_private.race_reject('RACE_CLOCK_UNAVAILABLE');end if;
  update ride_private.race_members set ready_until=least(clock_timestamp()+interval '15 seconds',r.ends_at),ready_probe_ids=p_clock_probe_ids where race_id=p_race and user_id=uid returning * into m;
 end if;
 insert into ride_private.race_poll_slots values(uid,'heartbeat',p_race,clock_timestamp()) on conflict(owner_id,label,resource_id) do update set last_at=excluded.last_at;
 return jsonb_build_object('owner_id',uid,'race_id',p_race,'member_generation',m.member_generation,'server_received_at',received,'server_sent_at',clock_timestamp(),'host_lease_until',r.host_lease_until,'ready_revision',m.ready_revision,'ready_lease_id',m.ready_lease_id,'ready_until',m.ready_until);
 exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);end;
end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ride-race-evidence','ride-race-evidence',false,2097152,array['application/json']);
create function ride_private.can_upload_race_evidence(object_path text) returns boolean language plpgsql volatile security definer set search_path='' as $$declare uid uuid;a ride_private.race_attempts;r ride_private.races;begin
 uid:=ride_private.race_actor();select * into a from ride_private.race_attempts where owner_id=uid and evidence_path=object_path;
 if a.id is null then return false;end if;perform ride_private.race_repair(a.race_id);select * into r from ride_private.races where id=a.race_id;
 return a.state='upload_pending' and a.upload_deadline>clock_timestamp() and r.state<>'cancelled' and ride_private.race_member_valid(r.id,uid) and ride_private.race_approval_valid(a.approval_id);
 exception when sqlstate 'RC001' then return false;
end$$;
create function ride_private.can_read_race_evidence(object_path text) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and ride_private.account_active(auth.uid()) and exists(select 1 from ride_private.race_attempts where owner_id=auth.uid() and evidence_path=object_path)$$;
create policy rs_race_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='ride-race-evidence' and ride_private.can_upload_race_evidence(name));
create policy rs_race_evidence_read on storage.objects for select to authenticated using(bucket_id='ride-race-evidence' and ride_private.can_read_race_evidence(name));
create function ride_private.race_worker_owner(aid uuid) returns uuid language sql stable security definer set search_path='' as $$select owner_id from ride_private.race_attempts where id=aid$$;
create function ride_private.race_lock_approval(aid uuid) returns void language plpgsql volatile set search_path='' as $$declare a ride_private.race_course_approvals;begin
 select * into a from ride_private.race_course_approvals where id=aid for share;
 if not found then return;end if;
 perform 1 from public.rs_routes where id=a.route_id for share;
 perform 1 from public.rs_courses where id=a.course_id for share;
 perform 1 from public.rs_course_sessions where id=a.session_id for share;
end$$;
create function ride_private.race_verifiable(aid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from ride_private.race_attempts a join ride_private.races r on r.id=a.race_id join ride_private.race_members m on m.race_id=r.id and m.user_id=a.owner_id where a.id=aid and ride_private.race_member_valid(r.id,a.owner_id) and a.member_generation=m.member_generation and ride_private.race_approval_valid(a.approval_id) and r.state<>'cancelled' and clock_timestamp()<r.ends_at+interval '24 hours' and (r.mode='async' or(a.schedule_epoch is not null and a.schedule_epoch=r.schedule_epoch and a.common_start_at=r.common_start_at and exists(select 1 from jsonb_array_elements(r.scheduled_members)x where (x->>'user_id')::uuid=a.owner_id and (x->>'attempt_id')::uuid=a.id and (x->>'member_generation')::integer=a.member_generation))))
$$;
create function public.rs_claim_race_attempt(p_attempt uuid,p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare a ride_private.race_attempts;r ride_private.races;approval ride_private.race_course_approvals;token uuid;retry integer;begin
 if p_attempt is null or p_owner is null then return null;end if;perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();
 select * into a from ride_private.race_attempts where id=p_attempt and owner_id=p_owner;if a.id is null then return null;end if;
 perform ride_private.race_repair(a.race_id);select * into a from ride_private.race_attempts where id=p_attempt for update;
 if not ride_private.race_verifiable(p_attempt) or a.state not in('queued','verifying') or(a.state='verifying' and a.verification_lease_until>clock_timestamp()) or a.verification_attempts>=3 then return null;end if;
 retry:=ride_private.race_admit(p_owner,'worker',10,10,1000);if retry is not null then return null;end if;
 token:=gen_random_uuid();update ride_private.race_attempts set state='verifying',verification_token=token,verification_lease_until=clock_timestamp()+interval '2 minutes',verification_attempts=verification_attempts+1,updated_at=clock_timestamp() where id=p_attempt returning * into a;
 select * into r from ride_private.races where id=a.race_id;select * into approval from ride_private.race_course_approvals where id=a.approval_id;
 return jsonb_build_object('token',token,'server_now',clock_timestamp(),'attempt',ride_private.race_attempt(a.id,p_owner)||jsonb_build_object('mode',r.mode,'arm_clock_probe_ids',a.arm_probe_ids,'clock_generation',a.clock_generation),'approval',jsonb_build_object('id',approval.id,'config_hash',approval.config_hash,'configuration',approval.configuration,'starts_at',r.starts_at,'ends_at',r.ends_at),'clock_probes',coalesce((select jsonb_agg(jsonb_build_object('owner_id',owner_id,'probe_id',probe_id,'race_id',race_id,'capture_id',capture_id,'clock_generation',clock_generation,'server_received_at',server_received_at,'server_sent_at',server_sent_at) order by server_received_at,probe_id) from ride_private.race_clock_probes where attempt_id=a.id),'[]'::jsonb),'evidence',ride_private.race_reservation(a.id));
end$$;
create function public.rs_release_race_attempt(p_attempt uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$declare uid uuid;begin
 uid:=ride_private.race_worker_owner(p_attempt);if uid is null then return false;end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();
 update ride_private.race_attempts set state=case when ride_private.race_verifiable(id) then 'queued' else 'dnf' end,terminal_reason=case when ride_private.race_verifiable(id) then null else 'approval_revoked' end,terminal_at=case when ride_private.race_verifiable(id) then null else clock_timestamp() end,verification_token=null,verification_lease_until=null,updated_at=clock_timestamp() where id=p_attempt and state='verifying' and verification_token=p_token and verification_lease_until>clock_timestamp();return found;
end$$;
create function public.rs_reject_race_attempt(p_attempt uuid,p_token uuid,p_code text) returns boolean language plpgsql security definer set search_path='' as $$declare uid uuid;begin
 uid:=ride_private.race_worker_owner(p_attempt);if uid is null then return false;end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();
 if p_code not in('EVIDENCE_SCHEMA','EVIDENCE_DIGEST','EVIDENCE_SIZE','EVIDENCE_SOURCE','EVIDENCE_MOCKED','EVIDENCE_ACCURACY','EVIDENCE_TIMESTAMP','EVIDENCE_CLOCK','EVIDENCE_CLOCK_PRECISION','EVIDENCE_CLOCK_STALE','EVIDENCE_GAP','EVIDENCE_TRUNCATED','EVIDENCE_CAPTURE','EVIDENCE_FOREGROUND','EVIDENCE_TELEPORT','EVIDENCE_ACCELERATION','EVIDENCE_BOUNDARY','EVIDENCE_CORRIDOR','EVIDENCE_PROGRESS','EVIDENCE_GATE_DIRECTION','EVIDENCE_GATE_ORDER','EVIDENCE_GATE_AMBIGUOUS','EVIDENCE_STAGING','EVIDENCE_LATE_START','EVIDENCE_WINDOW','EVIDENCE_DURATION','APPROVAL_REVOKED','MEMBERSHIP_CHANGED','ACCOUNT_DELETION') then raise exception 'RACE_INVALID';end if;
 update ride_private.race_attempts set state='rejected',revision=revision+1,rejection_code=p_code,terminal_at=clock_timestamp(),verification_token=null,verification_lease_until=null,updated_at=clock_timestamp() where id=p_attempt and state='verifying' and verification_token=p_token and verification_lease_until>clock_timestamp();return found;
end$$;
create function public.rs_finalize_race_attempt(p_attempt uuid,p_token uuid,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;a ride_private.race_attempts;r ride_private.races;result jsonb;k text;interval_value jsonb;gate jsonb;counter integer:=0;stamp timestamptz;
begin
 uid:=ride_private.race_worker_owner(p_attempt);if uid is null then raise exception 'RACE_UNAVAILABLE';end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();
 select race_id into a.race_id from ride_private.race_attempts where id=p_attempt;perform ride_private.race_repair(a.race_id);
 select * into a from ride_private.race_attempts where id=p_attempt for update;select * into r from ride_private.races where id=a.race_id;perform ride_private.race_lock_approval(a.approval_id);
 if a.state<>'verifying' or a.verification_token is distinct from p_token or a.verification_lease_until<=clock_timestamp() or not ride_private.race_verifiable(a.id) then raise exception 'RACE_ELIGIBILITY_OR_LEASE_CHANGED';end if;
 if p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>16384 or not p_result?&array['attempt_id','owner_id','race_id','approval_id','config_hash','method','quality','platform','provenance_unknown','elapsed_lower_ms','elapsed_upper_ms','start_interval','finish_interval','gate_intervals','distance_m','maximum_speed_mps','average_speed_mps','sample_count','max_gap_ms','evidence_sha256'] or p_result-array['attempt_id','owner_id','race_id','approval_id','config_hash','method','quality','platform','provenance_unknown','elapsed_lower_ms','elapsed_upper_ms','start_interval','finish_interval','gate_intervals','distance_m','maximum_speed_mps','average_speed_mps','sample_count','max_gap_ms','evidence_sha256']<>'{}'::jsonb
 or p_result->>'attempt_id'<>a.id::text or p_result->>'owner_id'<>uid::text or p_result->>'race_id'<>a.race_id::text or p_result->>'approval_id'<>a.approval_id::text or p_result->>'config_hash'<>a.config_hash or p_result->>'evidence_sha256'<>a.evidence_sha256 or p_result->>'platform'<>a.platform or p_result->>'method'<>'route_time_v1' or p_result->>'quality'<>'native_evidence_consistency' or jsonb_typeof(p_result->'provenance_unknown')<>'boolean' then raise exception 'RACE_RESULT_INVALID';end if;
 foreach k in array array['elapsed_lower_ms','elapsed_upper_ms'] loop if not ride_private.ride_number(p_result->k,10000,1800000,false,false) then raise exception 'RACE_RESULT_INVALID';end if;end loop;
 if(p_result->>'elapsed_lower_ms')::numeric>(p_result->>'elapsed_upper_ms')::numeric or not ride_private.ride_number(p_result->'distance_m',100,20000,false,false) or not ride_private.ride_number(p_result->'maximum_speed_mps',0,138.888889,true,false) or not ride_private.ride_number(p_result->'average_speed_mps',0,138.888889,false,false) or not ride_private.ride_number(p_result->'sample_count',4,8000,false,true) or(p_result->>'sample_count')::integer<>a.sample_count or not ride_private.ride_number(p_result->'max_gap_ms',0,1500,false,false) then raise exception 'RACE_RESULT_INVALID';end if;
 foreach k in array array['start_interval','finish_interval'] loop interval_value:=p_result->k;
 if jsonb_typeof(interval_value)<>'object' or not interval_value?&array['lower_ms','upper_ms'] or interval_value-array['lower_ms','upper_ms']<>'{}'::jsonb or not ride_private.ride_number(interval_value->'lower_ms',1577836800000,4133980800000,false,false) or not ride_private.ride_number(interval_value->'upper_ms',1577836800000,4133980800000,false,false) or(interval_value->>'upper_ms')::numeric<(interval_value->>'lower_ms')::numeric then raise exception 'RACE_RESULT_INVALID';end if;end loop;
 if (p_result->'start_interval'->>'lower_ms')::numeric<extract(epoch from greatest(r.starts_at,a.armed_at))*1000 or(p_result->'finish_interval'->>'upper_ms')::numeric>extract(epoch from r.ends_at)*1000 or(p_result->'finish_interval'->>'upper_ms')::numeric>extract(epoch from clock_timestamp())*1000+500 then raise exception 'RACE_RESULT_INVALID';end if;
 if r.mode='live' and ((p_result->'start_interval'->>'lower_ms')::numeric<extract(epoch from r.common_start_at)*1000 or(p_result->'start_interval'->>'upper_ms')::numeric>extract(epoch from r.common_start_at)*1000+10000 or abs((p_result->>'elapsed_lower_ms')::numeric-((p_result->'finish_interval'->>'lower_ms')::numeric-extract(epoch from r.common_start_at)*1000))>0.001 or abs((p_result->>'elapsed_upper_ms')::numeric-((p_result->'finish_interval'->>'upper_ms')::numeric-extract(epoch from r.common_start_at)*1000))>0.001) then raise exception 'RACE_RESULT_INVALID';end if;
 if jsonb_typeof(p_result->'gate_intervals')<>'array' or jsonb_array_length(p_result->'gate_intervals')<>(select jsonb_array_length(configuration->'gates') from ride_private.race_course_approvals where id=a.approval_id) then raise exception 'RACE_RESULT_INVALID';end if;
 for gate in select value from jsonb_array_elements(p_result->'gate_intervals') loop if jsonb_typeof(gate)<>'object' or not gate?&array['index','lower_ms','upper_ms'] or gate-array['index','lower_ms','upper_ms']<>'{}'::jsonb or gate->'index'<>to_jsonb(counter) or not ride_private.ride_number(gate->'lower_ms',1577836800000,4133980800000,false,false) or not ride_private.ride_number(gate->'upper_ms',1577836800000,4133980800000,false,false) or(gate->>'upper_ms')::numeric<(gate->>'lower_ms')::numeric then raise exception 'RACE_RESULT_INVALID';end if;counter:=counter+1;end loop;
 stamp:=clock_timestamp();result:=p_result||jsonb_build_object('verified_at',stamp);
 insert into ride_private.race_results(attempt_id,owner_id,race_id,approval_id,config_hash,result,evidence_sha256,verified_at) values(a.id,uid,a.race_id,a.approval_id,a.config_hash,result,a.evidence_sha256,stamp);
 update ride_private.race_attempts set state='verified',revision=revision+1,terminal_at=stamp,verification_token=null,verification_lease_until=null,updated_at=stamp where id=a.id;
 return jsonb_build_object('attempt',ride_private.race_attempt(a.id,uid),'result',result);
end$$;
create function public.rs_race_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$declare x record;stages integer;probes integer;begin
 perform ride_private.live_control_lock();for x in select id from ride_private.races where state not in('cancelled','finished','expired') order by id limit 100 loop perform ride_private.race_repair(x.id);end loop;
 delete from ride_private.race_stage_slots where expires_at<=clock_timestamp();get diagnostics stages=ROW_COUNT;
 -- A last countdown probe need not be a ready/arm anchor. The immutable native
 -- candidate still includes it; keep every exact armed/upload/worker reference.
 delete from ride_private.race_clock_probes p where(p.owner_id,p.probe_id) in(select probe_row.owner_id,probe_row.probe_id from ride_private.race_clock_probes probe_row left join ride_private.race_attempts a on a.id=probe_row.attempt_id where(not probe_row.bound and probe_row.server_received_at<clock_timestamp()-interval '2 minutes' and(a.id is null or a.state in('reserved','verified','rejected','aborted','dnf'))) or(probe_row.server_received_at<clock_timestamp()-interval '7 days' and(a.state in('verified','rejected','aborted','dnf') or a.id is null)) order by probe_row.server_received_at limit 1000);get diagnostics probes=ROW_COUNT;
 delete from ride_private.race_admission where bucket<clock_timestamp()-interval '35 days';
 delete from ride_private.race_poll_slots where last_at<clock_timestamp()-interval '1 day';
 return jsonb_build_object('stages',stages,'probes',probes,'evidence_due',(select count(*) from ride_private.race_evidence_cleanup where eligible_at<=clock_timestamp()));
end$$;
create function public.rs_claim_race_evidence_cleanup(p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'RACE_INVALID';end if;perform ride_private.live_control_lock();
 with due as(select id from ride_private.race_evidence_cleanup where eligible_at<=clock_timestamp() and(lease_until is null or lease_until<=clock_timestamp()) order by eligible_at,id limit p_limit for update),updated as(update ride_private.race_evidence_cleanup q set token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1 from due where q.id=due.id returning q.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket',bucket,'path',path,'token',token)),'[]'::jsonb) into items from updated;return items;
end$$;
create function public.rs_ack_race_evidence_cleanup(p_id uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$declare q ride_private.race_evidence_cleanup;begin
 perform ride_private.live_control_lock();select * into q from ride_private.race_evidence_cleanup where id=p_id and token=p_token and lease_until>clock_timestamp() for update;if not found then return false;end if;
 if exists(select 1 from storage.objects where bucket_id=q.bucket and name=q.path) then raise exception 'RACE_EVIDENCE_ASSET_REMAINS';end if;
 delete from ride_private.race_evidence_cleanup where id=q.id;return true;
end$$;
create function public.rs_release_race_evidence_cleanup(p_id uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
 perform ride_private.live_control_lock();update ride_private.race_evidence_cleanup set token=null,lease_until=null,eligible_at=greatest(eligible_at,clock_timestamp()+interval '1 minute') where id=p_id and token=p_token;return found;
end$$;
create function ride_private.can_read_race(topic_name text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from ride_private.races r where 'rs-race:'||r.topic_id::text=topic_name and r.state not in('cancelled','finished','expired') and ride_private.race_member_valid(r.id,auth.uid()) and ride_private.race_approval_valid(r.approval_id) and(r.mode='async' or r.common_start_at is not null or r.host_lease_until>clock_timestamp()))
$$;
create policy rs_race_realtime on realtime.messages for select to authenticated using(extension='broadcast' and ride_private.can_read_race(realtime.topic()));
-- Preserve predecessor OIDs/bodies; wrappers acquire the common fence before
-- route/profile/account-state rows. Never lock another owner's account fence.
alter function ride_private.live_privacy(uuid) rename to live_privacy_pre_race_v1;
create function ride_private.live_privacy(uid uuid) returns void language plpgsql volatile set search_path='' as $$begin perform ride_private.live_privacy_pre_race_v1(uid);perform ride_private.race_privacy(uid);end$$;
alter function public.rs_save_route_v2(uuid,uuid,integer,jsonb) rename to rs_save_route_v2_pre_race_v1;
alter function public.rs_save_route_v2_pre_race_v1(uuid,uuid,integer,jsonb) set schema ride_private;
alter function public.rs_delete_route_v2(uuid,uuid,integer) rename to rs_delete_route_v2_pre_race_v1;
alter function public.rs_delete_route_v2_pre_race_v1(uuid,uuid,integer) set schema ride_private;
create function public.rs_save_route_v2(p_operation uuid,p_id uuid,p_expected_revision integer,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();result jsonb;x record;begin
 perform ride_private.live_control_lock();result:=ride_private.rs_save_route_v2_pre_race_v1(p_operation,p_id,p_expected_revision,p_document);
 for x in select r.id from ride_private.races r join ride_private.race_course_approvals a on a.id=r.approval_id where a.route_id=p_id order by r.id loop perform ride_private.race_repair(x.id);end loop;return result;
end$$;
create function public.rs_delete_route_v2(p_operation uuid,p_id uuid,p_expected_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();result jsonb;x record;begin
 perform ride_private.live_control_lock();result:=ride_private.rs_delete_route_v2_pre_race_v1(p_operation,p_id,p_expected_revision);
 for x in select r.id from ride_private.races r join ride_private.race_course_approvals a on a.id=r.approval_id where a.route_id=p_id order by r.id loop perform ride_private.race_repair(x.id);end loop;return result;
end$$;
alter function public.rs_begin_account_deletion(uuid,uuid) rename to rs_begin_account_deletion_pre_race_v1;
alter function public.rs_begin_account_deletion_pre_race_v1(uuid,uuid) set schema ride_private;
alter function public.rs_account_deletion_objects(uuid,uuid,uuid) rename to rs_account_deletion_objects_pre_race_v1;
alter function public.rs_account_deletion_objects_pre_race_v1(uuid,uuid,uuid) set schema ride_private;
alter function public.rs_purge_account_data(uuid,uuid,uuid) rename to rs_purge_account_data_pre_race_v1;
alter function public.rs_purge_account_data_pre_race_v1(uuid,uuid,uuid) set schema ride_private;
create function public.rs_begin_account_deletion(p_owner uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();result:=ride_private.rs_begin_account_deletion_pre_race_v1(p_owner,p_request);
 insert into ride_private.account_deletion_objects(owner_id,bucket,path) select p_owner,'ride-race-evidence',a.evidence_path from ride_private.race_attempts a join ride_private.races r on r.id=a.race_id where a.evidence_path is not null and(a.owner_id=p_owner or r.creator_id=p_owner) on conflict do nothing;
 perform ride_private.race_privacy(p_owner);return result;
end$$;
create function public.rs_account_deletion_objects(p_owner uuid,p_request uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();perform ride_private.deletion_lease(p_owner,p_request,p_token);
 insert into ride_private.account_deletion_objects(owner_id,bucket,path) select p_owner,bucket_id,name from storage.objects where bucket_id='ride-race-evidence' and starts_with(name,p_owner::text||'/') on conflict do nothing;
 return ride_private.rs_account_deletion_objects_pre_race_v1(p_owner,p_request,p_token);
end$$;
create function public.rs_purge_account_data(p_owner uuid,p_request uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();perform ride_private.deletion_lease(p_owner,p_request,p_token);
 if exists(select 1 from storage.objects o where(o.bucket_id='ride-race-evidence' and starts_with(o.name,p_owner::text||'/')) or exists(select 1 from ride_private.account_deletion_objects q where q.owner_id=p_owner and q.bucket=o.bucket_id and q.path=o.name)) then raise exception 'DELETION_ASSETS_REMAIN';end if;
 delete from ride_private.race_operations where owner_id=p_owner or request->>'race_id' in(select id::text from ride_private.races where creator_id=p_owner) or request->>'attempt_id' in(select a.id::text from ride_private.race_attempts a join ride_private.races r on r.id=a.race_id where r.creator_id=p_owner);
 delete from ride_private.race_activation_cancellations where owner_id=p_owner;
 delete from ride_private.race_evidence_cleanup q where not exists(select 1 from storage.objects o where o.bucket_id=q.bucket and o.name=q.path) and(starts_with(q.path,p_owner::text||'/') or exists(select 1 from ride_private.account_deletion_objects a where a.owner_id=p_owner and a.bucket=q.bucket and a.path=q.path));
 delete from ride_private.races where creator_id=p_owner;delete from ride_private.race_attempts where owner_id=p_owner;delete from ride_private.race_members where user_id=p_owner;
 delete from ride_private.race_course_approvals where owner_id=p_owner;delete from ride_private.race_admission where subject=p_owner;delete from ride_private.race_poll_slots where owner_id=p_owner;
 perform ride_private.rs_purge_account_data_pre_race_v1(p_owner,p_request,p_token);
end$$;
-- Narrow default-deny ACL. A qualified service still needs an authenticated
-- user claim for owner RPCs; operator/worker/cleanup contracts are service-only.
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and(p.proname like 'race_%' or p.proname like '%_pre_race_v1' or p.proname in('can_read_race','can_read_race_evidence','can_upload_race_evidence')) loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;end$$;
grant execute on function ride_private.can_read_race(text),ride_private.can_read_race_evidence(text),ride_private.can_upload_race_evidence(text) to authenticated;
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and(p.proname like 'rs_race_%' or p.proname in('rs_get_race','rs_list_races','rs_list_race_approvals','rs_get_race_course','rs_get_race_attempt','rs_list_race_attempts','rs_cancel_race_activation','rs_approve_race_course','rs_revoke_race_course','rs_claim_race_attempt','rs_release_race_attempt','rs_reject_race_attempt','rs_finalize_race_attempt','rs_claim_race_evidence_cleanup','rs_ack_race_evidence_cleanup','rs_release_race_evidence_cleanup','rs_save_route_v2','rs_delete_route_v2','rs_begin_account_deletion','rs_account_deletion_objects','rs_purge_account_data')) loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;end$$;
grant execute on function public.rs_race_mutate(uuid,jsonb),public.rs_race_operation(uuid),public.rs_cancel_race_activation(uuid,jsonb),public.rs_list_races(integer,timestamptz,uuid),public.rs_get_race(uuid),public.rs_list_race_approvals(uuid,integer),public.rs_get_race_course(uuid),public.rs_get_race_attempt(uuid),public.rs_list_race_attempts(uuid),public.rs_race_results(uuid),public.rs_race_clock(uuid,uuid,uuid,uuid),public.rs_race_stage(jsonb),public.rs_race_heartbeat(uuid,integer,uuid,uuid,uuid,uuid[]),public.rs_save_route_v2(uuid,uuid,integer,jsonb),public.rs_delete_route_v2(uuid,uuid,integer) to authenticated,service_role;
grant execute on function public.rs_approve_race_course(uuid,jsonb),public.rs_revoke_race_course(uuid,text),public.rs_claim_race_attempt(uuid,uuid),public.rs_release_race_attempt(uuid,uuid),public.rs_reject_race_attempt(uuid,uuid,text),public.rs_finalize_race_attempt(uuid,uuid,jsonb),public.rs_race_cleanup(),public.rs_claim_race_evidence_cleanup(integer),public.rs_ack_race_evidence_cleanup(uuid,uuid),public.rs_release_race_evidence_cleanup(uuid,uuid),public.rs_begin_account_deletion(uuid,uuid),public.rs_account_deletion_objects(uuid,uuid,uuid),public.rs_purge_account_data(uuid,uuid,uuid) to service_role;
grant select,update on ride_private.race_policy to service_role;
commit;
