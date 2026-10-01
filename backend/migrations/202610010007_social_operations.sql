-- M5A: actor-scoped pages and exact social operation receipts. Additive after006.
-- No GPS, new Realtime topic, fabricated profile or live race is introduced.
begin;
alter table public.rs_blocks add column block_token uuid not null default gen_random_uuid();
create table ride_private.social_operations (
 owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null, request jsonb not null, result jsonb not null,
 applied_at timestamptz not null default clock_timestamp(), primary key(owner_id,operation_id)
);
alter table ride_private.social_operations enable row level security;
revoke all on ride_private.social_operations from public,anon,authenticated;
create index rs_social_friends_low_page on public.rs_friendships(user_low,updated_at desc,user_high desc);
create index rs_social_friends_high_page on public.rs_friendships(user_high,updated_at desc,user_low desc);
create index rs_social_challenges_creator_page on public.rs_challenges(creator_id,created_at desc,id desc);

create function ride_private.social_uuid(p jsonb,nullable boolean default false) returns boolean language sql immutable set search_path='' as $$
 select coalesce((nullable and p='null') or(jsonb_typeof(p)='string' and p#>>'{}' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),false)
$$;
create function ride_private.social_stamp(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare t timestamptz;
begin
 if p is null or jsonb_typeof(p)<>'string' or length(p#>>'{}')>35 or p#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then return false;end if;
 t:=(p#>>'{}')::timestamptz;return t>='1970-01-01T00:00:00Z'::timestamptz and t<'2100-01-01T00:00:00Z'::timestamptz;
 exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;
-- Throws only our reserved business code. Unknown database exceptions are not
-- converted into definitive no-apply errors by the public mutation wrapper.
create function ride_private.social_reject(code text) returns void language plpgsql immutable set search_path='' as $$
begin raise exception '%',code using errcode='RS001';end $$;
create function ride_private.social_request(p jsonb,uid uuid) returns jsonb language plpgsql immutable set search_path='' as $$
declare keys text[];action text:=p->>'action';
begin
 if p is not null and octet_length(p::text)>16384 then perform ride_private.social_reject('SOCIAL_TOO_LARGE');end if;
 if p is null or jsonb_typeof(p)<>'object' or p->'schema_version' is distinct from '1'::jsonb then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 keys:=case action when 'request_friend' then array['schema_version','action','handle']
 when 'friend_action' then array['schema_version','action','other_id','verb','expected_generation']
 when 'unblock' then array['schema_version','action','other_id','block_token']
 when 'set_presence' then array['schema_version','action','enabled','expected_account_revision']
 when 'create_invitation' then array['schema_version','action','challenge_id','route_id','route_revision','reviewed_geometry_hash','mode','session_id','starts_at','ends_at','recipient_id','friendship_generation']
 when 'invitation_action' then array['schema_version','action','challenge_id','verb','expected_member_state','friendship_generation'] end;
 if keys is null or not p?&keys or p-keys<>'{}' then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 if action='request_friend' then
 if jsonb_typeof(p->'handle')<>'string' or p->>'handle' !~ '^[a-z0-9_]{3,24}$' then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 elsif action in('friend_action','unblock') then
 if not ride_private.social_uuid(p->'other_id') or(p->>'other_id')::uuid=uid then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 if action='unblock' then
 if not ride_private.social_uuid(p->'block_token') then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 elsif p->>'verb' not in('accept','decline','cancel','remove','block') or jsonb_typeof(p->'verb')<>'string'
 or not ride_private.ride_number(p->'expected_generation',1,2147483647,true,true)
 or(p->'expected_generation'='null' and p->>'verb'<>'block') then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 elsif action='set_presence' then
 if jsonb_typeof(p->'enabled')<>'boolean' or not ride_private.ride_number(p->'expected_account_revision',0,2147483647,false,true) then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 elsif action='create_invitation' then
 if not ride_private.social_uuid(p->'challenge_id') or not ride_private.social_uuid(p->'route_id') or not ride_private.social_uuid(p->'recipient_id')
 or(p->>'recipient_id')::uuid=uid or not ride_private.ride_number(p->'route_revision',1,2147483647,false,true)
 or not ride_private.ride_number(p->'friendship_generation',1,2147483647,false,true) or not ride_private.social_uuid(p->'session_id',true)
 or not(p->'reviewed_geometry_hash'='null' or(jsonb_typeof(p->'reviewed_geometry_hash')='string' and p->>'reviewed_geometry_hash' ~ '^[a-f0-9]{64}$'))
 or p->>'mode' not in('group_ride','timed_race') or jsonb_typeof(p->'mode')<>'string'
 or(p->>'mode'='group_ride' and p->'session_id'<>'null') or(p->>'mode'='timed_race' and p->'session_id'='null')
 or not ride_private.social_stamp(p->'starts_at') or not ride_private.social_stamp(p->'ends_at') then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 if(p->>'ends_at')::timestamptz<=(p->>'starts_at')::timestamptz or(p->>'ends_at')::timestamptz>(p->>'starts_at')::timestamptz+interval '24 hours' then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 elsif action='invitation_action' then
 if not ride_private.social_uuid(p->'challenge_id') or jsonb_typeof(p->'verb')<>'string' or p->>'verb' not in('accept','decline','withdraw','cancel') then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 if p->>'verb'='cancel' then
 if p->'expected_member_state'<>'null' or p->'friendship_generation'<>'null' then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 elsif jsonb_typeof(p->'expected_member_state')<>'string' or p->>'expected_member_state' not in('invited','accepted','declined','withdrawn')
 or not ride_private.ride_number(p->'friendship_generation',1,2147483647,false,true) then perform ride_private.social_reject('SOCIAL_INVALID');end if;
 end if;
 return p;
end $$;
create function ride_private.social_summary(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p)='object' and ride_private.garage_text(p->'title',80,false)
 and ride_private.ride_number(p->'revision',1,2147483647,false,true) and jsonb_typeof(p->'category')='string' and p->>'category' in('scooter','motorcycle','car','bicycle')
 then jsonb_build_object('title',p->'title','revision',p->'revision','category',p->'category') else null end
$$;
-- Legacy profile constraints allow control characters. Use the person's actual
-- unique handle if that old display name cannot enter the bounded public wire;
-- do not alter their profile or let one malformed name poison an entire page.
create function ride_private.social_display_name(name text,handle text) returns text language sql immutable set search_path='' as $$
 select case when ride_private.garage_text(to_jsonb(name),40,false) then name else handle end
$$;
create function ride_private.social_safe_snapshot(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare keys text[]:=array['route_id','revision','title','category','segments','geometryStatus','privacyTrimMeters','geometryHash','provider','attribution'];part jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' or not p?&keys or p-keys<>'{}' or not ride_private.social_uuid(p->'route_id')
 or ride_private.social_summary(p) is null or not ride_private.route_segments(p->'segments') or p->'privacyTrimMeters'<>'200'
 or jsonb_typeof(p->'geometryStatus')<>'string' or p->>'geometryStatus' not in('trimmed','hidden')
 or jsonb_typeof(p->'provider')<>'string' or p->>'provider' not in('geoapify','recorded','draft')
 or not ride_private.garage_text(p->'attribution',300,true) then return null;end if;
 if p->>'geometryStatus'='hidden' then
 if jsonb_array_length(p->'segments')<>0 or p->'geometryHash'<>'null' then return null;end if;
 else
 if jsonb_array_length(p->'segments')=0 or jsonb_typeof(p->'geometryHash')<>'string' or p->>'geometryHash' !~ '^[a-f0-9]{64}$'
 or p->>'geometryHash'<>encode(sha256(convert_to((p->'segments')::text,'UTF8')),'hex') or p->>'provider'='draft' then return null;end if;
 for part in select value from jsonb_array_elements(p->'segments') loop if jsonb_array_length(part)<2 then return null;end if;end loop;
 end if;
 if p->>'provider'='geoapify' and p->'attribution'='null' then return null;end if;
 return p;
end $$;
create function ride_private.social_receipt(uid uuid,op uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('owner_id',owner_id,'operation_id',operation_id,'request',request,'applied_at',applied_at,'result',result) from ride_private.social_operations where owner_id=uid and operation_id=op
$$;
create function public.rs_social_operation(p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();begin if p_operation is null then raise exception 'SOCIAL_INVALID' using errcode='22023';end if;return ride_private.social_receipt(uid,p_operation);end $$;

create function public.rs_social_snapshot(p_limit integer default 30,p_before timestamptz default null,p_before_user uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();social_now timestamptz:=clock_timestamp();r record;n integer:=0;items jsonb:='[]';statuses jsonb:='[]';cursor jsonb:=null;last_cursor jsonb;profile_ready boolean;opted boolean;revision integer;
begin
 if p_limit is null or p_limit not between 1 and 30 or(p_before is null)<>(p_before_user is null) then raise exception 'SOCIAL_INVALID' using errcode='22023';end if;
 select true,p.presence_opt_in into profile_ready,opted from public.rs_profiles p where p.user_id=uid;select a.revision into revision from public.rs_account_state a where a.user_id=uid;
 for r in select p.user_id,p.handle,ride_private.social_display_name(p.display_name,p.handle) display_name,f.state,case when f.requester_id=uid then 'outgoing' else 'incoming' end direction,f.generation,f.updated_at,
 'rs-presence:'||f.presence_topic::text topic,coalesce(p.presence_opt_in and s.expires_at>social_now,false) online,
 case when p.presence_opt_in and s.expires_at>social_now then s.expires_at else null end expires_at
 from public.rs_friendships f join public.rs_profiles p on p.user_id=case when f.user_low=uid then f.user_high else f.user_low end
 left join ride_private.presence_sessions s on s.user_id=p.user_id
 where uid in(f.user_low,f.user_high) and f.state in('pending','accepted') and not ride_private.blocked(f.user_low,f.user_high) and ride_private.account_active(p.user_id)
 and(p_before is null or(f.updated_at,p.user_id)<(p_before,p_before_user)) order by f.updated_at desc,p.user_id desc limit p_limit+1 loop
 n:=n+1;if n>p_limit then cursor:=last_cursor;exit;end if;
 items:=items||jsonb_build_array(jsonb_build_object('user_id',r.user_id,'handle',r.handle,'display_name',r.display_name,'state',r.state,'direction',r.direction,'generation',r.generation,'updated_at',r.updated_at));
 if r.state='accepted' then statuses:=statuses||jsonb_build_array(jsonb_build_object('user_id',r.user_id,'topic',r.topic,'online',r.online,'expires_at',r.expires_at));end if;
 last_cursor:=jsonb_build_object('updated_at',r.updated_at,'user_id',r.user_id);
 end loop;
 return jsonb_build_object('owner_id',uid,'server_now',social_now,'self',jsonb_build_object('profile_ready',coalesce(profile_ready,false),'presence_opt_in',coalesce(opted,false),'account_revision',coalesce(revision,0)),'items',items,'statuses',statuses,'next_cursor',cursor);
end $$;
create function public.rs_blocked_people(p_limit integer default 30,p_before_user uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();r record;n integer:=0;items jsonb:='[]';cursor jsonb:=null;last_user uuid;
begin
 if p_limit is null or p_limit not between 1 and 30 then raise exception 'SOCIAL_INVALID' using errcode='22023';end if;
 for r in select p.user_id,p.handle,ride_private.social_display_name(p.display_name,p.handle) display_name,b.block_token from public.rs_blocks b join public.rs_profiles p on p.user_id=b.blocked_id
 where b.blocker_id=uid and ride_private.account_active(p.user_id) and(p_before_user is null or p.user_id>p_before_user) order by p.user_id limit p_limit+1 loop
 n:=n+1;if n>p_limit then cursor:=jsonb_build_object('user_id',last_user);exit;end if;items:=items||jsonb_build_array(to_jsonb(r));last_user:=r.user_id;
 end loop;return jsonb_build_object('owner_id',uid,'items',items,'next_cursor',cursor);
end $$;
create function public.rs_invitation_inbox(p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();r record;n integer:=0;items jsonb:='[]';cursor jsonb:=null;last_cursor jsonb;
begin
 if p_limit is null or p_limit not between 1 and 30 or(p_before is null)<>(p_before_id is null) then raise exception 'SOCIAL_INVALID' using errcode='22023';end if;
 for r in select c.*,case when c.creator_id=uid or ride_private.friends(c.creator_id,uid) then ride_private.social_display_name(p.display_name,p.handle) else null end creator_name,
 case when c.creator_id=uid then null else jsonb_build_object('state',m.state,'friendship_generation',m.friendship_generation) end member
 from public.rs_challenges c join public.rs_profiles p on p.user_id=c.creator_id left join public.rs_challenge_members m on m.challenge_id=c.id and m.user_id=uid
 where ride_private.account_active(c.creator_id) and(c.creator_id=uid or(m.user_id=uid and ride_private.friends(c.creator_id,uid)
 and m.friendship_generation=(select f.generation from public.rs_friendships f where f.user_low=least(c.creator_id,uid) and f.user_high=greatest(c.creator_id,uid))))
 and(p_before is null or(c.created_at,c.id)<(p_before,p_before_id)) order by c.created_at desc,c.id desc limit p_limit+1 loop
 n:=n+1;if n>p_limit then cursor:=last_cursor;exit;end if;
 items:=items||jsonb_build_array(jsonb_build_object('id',r.id,'creator_id',r.creator_id,'creator_name',r.creator_name,'route_summary',ride_private.social_summary(r.route_snapshot),
 'route_snapshot',ride_private.social_safe_snapshot(r.route_snapshot),'mode',r.mode,'metric',r.metric,'course_session_id',r.course_session_id,'starts_at',r.starts_at,'ends_at',r.ends_at,
 'state',r.state,'created_at',r.created_at,'member',r.member,'can_cancel',r.creator_id=uid and r.state='open'));
 last_cursor:=jsonb_build_object('created_at',r.created_at,'id',r.id);
 end loop;return jsonb_build_object('owner_id',uid,'server_now',clock_timestamp(),'items',items,'next_cursor',cursor);
end $$;

create function public.rs_social_mutate(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();request jsonb;existing ride_private.social_operations;social_action text;other uuid;f public.rs_friendships;
 c public.rs_challenges;m public.rs_challenge_members;r public.rs_routes;s public.rs_course_sessions;projection jsonb;result jsonb;
 revision integer;token uuid;code text;legacy_result text;target_state text;social_now timestamptz;constraint_name text;admission_hits integer;
begin
 if uid is null then return jsonb_build_object('error',jsonb_build_object('code','SOCIAL_AUTH_REQUIRED'));end if;
 perform ride_private.account_lock(uid);
 if not ride_private.account_active(uid) then return jsonb_build_object('error',jsonb_build_object('code','ACCOUNT_DELETION_PENDING'));end if;
 if p_operation is null then return jsonb_build_object('error',jsonb_build_object('code','SOCIAL_INVALID'));end if;
 begin request:=ride_private.social_request(p_request,uid);
 exception when sqlstate 'RS001' then return jsonb_build_object('error',jsonb_build_object('code',sqlerrm));end;
 select * into existing from ride_private.social_operations where owner_id=uid and operation_id=p_operation;
 if found then
 if existing.request<>request then return jsonb_build_object('error',jsonb_build_object('code','SOCIAL_OPERATION_CONFLICT'));end if;
 return ride_private.social_receipt(uid,p_operation);end if;
 if not exists(select 1 from public.rs_profiles where user_id=uid) then return jsonb_build_object('error',jsonb_build_object('code','PROFILE_REQUIRED'));end if;
 social_action:=request->>'action';
 -- Admission is outside the transition subtransaction: a recognized rejected
 -- probe returns normally, committing this40/UTC-day budget. Successful legacy
 -- lookups retain their independent40/day quota. Exact replay was checked first.
 if social_action='request_friend' then
 insert into ride_private.daily_quotas(user_id,action,bucket,hits)
 values(uid,'social_friend_probe',(clock_timestamp() at time zone 'UTC')::date,1)
 on conflict(user_id,action,bucket) do update set hits=daily_quotas.hits+1 where daily_quotas.hits<40 returning hits into admission_hits;
 if admission_hits is null then return jsonb_build_object('error',jsonb_build_object('code','SOCIAL_RATE_LIMITED'));end if;
 end if;
 begin
 if social_action='request_friend' then
 -- Freeze the mutable handle binding through the legacy helper's second lookup.
 -- This share lock precedes the pair lock, so a concurrent profile/presence
 -- update cannot redirect this reviewed request to a newly assigned handle.
 select user_id into other from public.rs_profiles where handle=request->>'handle' for share;
 if other is null or other=uid or not ride_private.account_active(other) or ride_private.blocked(uid,other) then perform ride_private.social_reject('SOCIAL_UNAVAILABLE');end if;
 perform ride_private.pair_lock(uid,other);
 if not ride_private.account_active(other) or ride_private.blocked(uid,other) then perform ride_private.social_reject('SOCIAL_UNAVAILABLE');end if;
 select * into f from public.rs_friendships where user_low=least(uid,other) and user_high=greatest(uid,other) for update;
 if found and f.state not in('accepted','pending') and f.updated_at>clock_timestamp()-interval '1 day' then perform ride_private.social_reject('SOCIAL_UNAVAILABLE');end if;
 legacy_result:=public.rs_request_friend(request->>'handle');
 select * into strict f from public.rs_friendships where user_low=least(uid,other) and user_high=greatest(uid,other);
 result:=jsonb_build_object('kind','friend','user_id',other,'state',case when f.state='accepted' then 'accepted' when f.requester_id=uid then 'outgoing' else 'incoming' end,'generation',f.generation);
 elsif social_action in('friend_action','unblock') then
 other:=(request->>'other_id')::uuid;perform ride_private.pair_lock(uid,other);
 if not ride_private.account_active(other) or not exists(select 1 from public.rs_profiles where user_id=other) then perform ride_private.social_reject('SOCIAL_UNAVAILABLE');end if;
 if social_action='unblock' then
 select block_token into token from public.rs_blocks where blocker_id=uid and blocked_id=other for update;
 if token is null or token<>(request->>'block_token')::uuid then perform ride_private.social_reject('BLOCK_CHANGED');end if;
 delete from public.rs_blocks where blocker_id=uid and blocked_id=other;result:=jsonb_build_object('kind','unblock','user_id',other,'state','unblocked');
 else
 select * into f from public.rs_friendships where user_low=least(uid,other) and user_high=greatest(uid,other) for update;
 if(f.user_low is null and request->'expected_generation'<>'null') or(f.user_low is not null and f.generation is distinct from(request->>'expected_generation')::integer)
 or(f.user_low is null and request->>'verb'<>'block') then perform ride_private.social_reject('FRIEND_CHANGED');end if;
 if request->>'verb'<>'block' then
 if ride_private.blocked(uid,other) or not((request->>'verb'='accept' and f.requester_id<>uid and f.state in('pending','accepted'))
 or(request->>'verb'='decline' and f.requester_id<>uid and f.state in('pending','declined')) or(request->>'verb'='cancel' and f.requester_id=uid and f.state in('pending','cancelled'))
 or(request->>'verb'='remove' and f.state in('accepted','removed'))) then perform ride_private.social_reject('FRIEND_CHANGED');end if;end if;
 legacy_result:=public.rs_friend_action(other,request->>'verb');
 select * into f from public.rs_friendships where user_low=least(uid,other) and user_high=greatest(uid,other);
 result:=jsonb_build_object('kind','friend','user_id',other,'state',legacy_result,'generation',f.generation);
 end if;
 elsif social_action='set_presence' then
 select a.revision into revision from public.rs_account_state a where a.user_id=uid for update;revision:=coalesce(revision,0);
 if revision<>(request->>'expected_account_revision')::integer then perform ride_private.social_reject('PRESENCE_CHANGED');end if;
 perform public.rs_set_presence((request->>'enabled')::boolean);select a.revision into strict revision from public.rs_account_state a where a.user_id=uid;
 result:=jsonb_build_object('kind','presence','enabled',request->'enabled','account_revision',revision);
 elsif social_action='create_invitation' then
 other:=(request->>'recipient_id')::uuid;perform ride_private.pair_lock(uid,other);
 select * into f from public.rs_friendships where user_low=least(uid,other) and user_high=greatest(uid,other) for update;
 if f.user_low is null or f.state<>'accepted' or f.generation<>(request->>'friendship_generation')::integer or ride_private.blocked(uid,other) or not ride_private.account_active(other) then perform ride_private.social_reject('FRIEND_CHANGED');end if;
 if exists(select 1 from public.rs_challenges where id=(request->>'challenge_id')::uuid) then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;
 select * into r from public.rs_routes where id=(request->>'route_id')::uuid and owner_id=uid for share;
 if r.id is null or r.revision<>(request->>'route_revision')::integer then perform ride_private.social_reject('INVITATION_CHANGED');end if;
 projection:=ride_private.social_safe_snapshot(ride_private.route_safe_snapshot(r.id));
 if projection is null or projection->'geometryHash' is distinct from request->'reviewed_geometry_hash' then perform ride_private.social_reject('INVITATION_CHANGED');end if;
 -- Evaluate wall time after locks, not the transaction's older now().
 social_now:=clock_timestamp();if(request->>'starts_at')::timestamptz<=social_now then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;
 if request->>'mode'='timed_race' then
 select * into s from public.rs_course_sessions where id=(request->>'session_id')::uuid and approved for share;
 if s.id is null or r.approved_course_id is distinct from s.course_id or r.approved_revision is distinct from r.revision
 or(request->>'starts_at')::timestamptz<s.starts_at or(request->>'ends_at')::timestamptz>s.ends_at
 or not exists(select 1 from public.rs_courses where id=s.course_id and closed_course_approved) then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;
 perform 1 from public.rs_courses where id=s.course_id and closed_course_approved for share;
 if not found then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;end if;
 perform public.rs_create_challenge((request->>'challenge_id')::uuid,r.id,r.revision,request->>'mode',(request->>'session_id')::uuid,(request->>'starts_at')::timestamptz,(request->>'ends_at')::timestamptz);
 perform public.rs_invite_challenge((request->>'challenge_id')::uuid,other);
 result:=jsonb_build_object('kind','invitation','challenge_id',request->'challenge_id','state','open');
 elsif social_action='invitation_action' then
 select creator_id into other from public.rs_challenges where id=(request->>'challenge_id')::uuid;
 if other is null or not ride_private.account_active(other) then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;
 if other<>uid then perform ride_private.pair_lock(uid,other);end if;
 select * into c from public.rs_challenges where id=(request->>'challenge_id')::uuid for update;
 if c.id is null then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;
 if request->>'verb'='cancel' then
 if c.creator_id<>uid then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;
 legacy_result:=public.rs_challenge_action(c.id,'cancel');
 else
 if c.creator_id=uid then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;
 select * into m from public.rs_challenge_members where challenge_id=c.id and user_id=uid for update;
 if m.user_id is null then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;
 select * into f from public.rs_friendships where user_low=least(uid,other) and user_high=greatest(uid,other) for update;
 if f.user_low is null or f.state<>'accepted' or f.generation<>(request->>'friendship_generation')::integer or ride_private.blocked(uid,other) then perform ride_private.social_reject('FRIEND_CHANGED');end if;
 if m.friendship_generation is distinct from f.generation or m.state<>request->>'expected_member_state' then perform ride_private.social_reject('INVITATION_CHANGED');end if;
 if c.state<>'open' or c.starts_at<=clock_timestamp() then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;
 if request->>'verb'='accept' and ride_private.social_safe_snapshot(c.route_snapshot) is null then perform ride_private.social_reject('INVITATION_UNAVAILABLE');end if;
 target_state:=case when request->>'verb'='accept' and m.state in('invited','accepted') then 'accepted'
 when request->>'verb'='decline' and m.state in('invited','declined') then 'declined'
 when request->>'verb'='withdraw' and m.state in('accepted','withdrawn') then 'withdrawn' end;
 if target_state is null then perform ride_private.social_reject('INVITATION_CHANGED');end if;
 if m.state<>target_state then legacy_result:=public.rs_challenge_action(c.id,request->>'verb');else legacy_result:=target_state;end if;
 end if;
 result:=jsonb_build_object('kind','invitation','challenge_id',c.id,'state',legacy_result);
 end if;
 insert into ride_private.social_operations(owner_id,operation_id,request,result) values(uid,p_operation,request,result);
 return ride_private.social_receipt(uid,p_operation);
 exception when sqlstate 'RS001' then
 code:=sqlerrm;if code not in('SOCIAL_INVALID','SOCIAL_TOO_LARGE','SOCIAL_OPERATION_CONFLICT','SOCIAL_UNAVAILABLE','SOCIAL_RATE_LIMITED','SOCIAL_AUTH_REQUIRED','PROFILE_REQUIRED','FRIEND_CHANGED','BLOCK_CHANGED','PRESENCE_CHANGED','INVITATION_CHANGED','INVITATION_UNAVAILABLE','ACCOUNT_DELETION_PENDING') then raise;end if;
 return jsonb_build_object('error',jsonb_build_object('code',code));
 when raise_exception then
 -- This one exact, legacy quota rejection is known to occur before application.
 -- No arbitrary SQL exception message/detail becomes a client business code.
 if sqlerrm='Daily action limit reached' then return jsonb_build_object('error',jsonb_build_object('code','SOCIAL_RATE_LIMITED'));else raise;end if;
 when unique_violation then
 get stacked diagnostics constraint_name=CONSTRAINT_NAME;
 if social_action='create_invitation' and constraint_name='rs_challenges_pkey' then return jsonb_build_object('error',jsonb_build_object('code','INVITATION_UNAVAILABLE'));else raise;end if;
 end;
end $$;

-- Binary removal still precedes every relational purge and Auth deletion. All
-- previous foreign-submission, summary/garage/route cleanup is retained exactly.
create or replace function public.rs_purge_account_data(p_owner uuid,p_request uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform ride_private.account_lock(p_owner);perform ride_private.deletion_lease(p_owner,p_request,p_token);
 if exists(select 1 from storage.objects o where o.owner_id=p_owner::text
 or(o.bucket_id in('ride-avatars','ride-community','ride-evidence','vehicle-photos') and starts_with(o.name,p_owner::text||'/'))
 or exists(select 1 from ride_private.account_deletion_objects q where q.owner_id=p_owner and q.bucket=o.bucket_id and q.path=o.name)) then raise exception 'DELETION_ASSETS_REMAIN' using errcode='P0001';end if;
 delete from public.rs_verified_records where owner_id=p_owner or challenge_id in(select id from public.rs_challenges where creator_id=p_owner);
 delete from public.rs_submissions where owner_id=p_owner or challenge_id in(select id from public.rs_challenges where creator_id=p_owner);
 delete from ride_private.ride_summary_operations where owner_id=p_owner;delete from public.rs_rides where owner_id=p_owner;
 delete from ride_private.garage_operations where owner_id=p_owner;delete from public.rs_garages where owner_id=p_owner;delete from public.rs_vehicle_photo_uploads where owner_id=p_owner;
 delete from ride_private.route_service_cache where owner_id=p_owner;delete from ride_private.route_service_calls where owner_id=p_owner;delete from ride_private.route_operations where owner_id=p_owner;delete from ride_private.route_tombstones where owner_id=p_owner;delete from public.rs_routes where owner_id=p_owner;
 delete from ride_private.social_operations where owner_id=p_owner;
 delete from public.rs_profiles where user_id=p_owner;delete from public.rs_account_state where user_id=p_owner;delete from ride_private.daily_quotas where user_id=p_owner;
 update ride_private.account_deletion_jobs set state='auth_pending' where owner_id=p_owner;
end $$;
revoke all on function ride_private.social_uuid(jsonb,boolean),ride_private.social_stamp(jsonb),ride_private.social_reject(text),ride_private.social_request(jsonb,uuid),ride_private.social_summary(jsonb),ride_private.social_display_name(text,text),ride_private.social_safe_snapshot(jsonb),ride_private.social_receipt(uuid,uuid) from public,anon,authenticated;
revoke all on function public.rs_social_operation(uuid),public.rs_social_snapshot(integer,timestamptz,uuid),public.rs_blocked_people(integer,uuid),public.rs_invitation_inbox(integer,timestamptz,uuid),public.rs_social_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.rs_social_operation(uuid),public.rs_social_snapshot(integer,timestamptz,uuid),public.rs_blocked_people(integer,uuid),public.rs_invitation_inbox(integer,timestamptz,uuid),public.rs_social_mutate(uuid,jsonb) to authenticated,service_role;
-- M5 clients use the receipt wrapper. Retiring only these superseded browser
-- writes closes the legacy exception/rolled-back-quota probe bypass. Definer
-- callers and existing trusted service semantics remain compatible; account
-- preference RPCs can still call rs_set_presence internally. Old app clients
-- must update their friend/invitation/presence actions rather than bypass CAS.
revoke all on function public.rs_request_friend(text),public.rs_friend_action(uuid,text),public.rs_set_presence(boolean),
 public.rs_create_challenge(uuid,uuid,integer,text,uuid,timestamptz,timestamptz),public.rs_invite_challenge(uuid,uuid),public.rs_challenge_action(uuid,text)
 from public,anon,authenticated;
commit;
