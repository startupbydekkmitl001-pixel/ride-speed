-- RideSpeed foundation. Apply with a database migration owner, never from a browser.
-- Requires Supabase Auth, Storage and Realtime schemas. No external project is created.
begin;
create schema if not exists ride_private;
revoke all on schema ride_private from public, anon, authenticated;
grant usage on schema ride_private to authenticated;

create function ride_private.valid_stops(points jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare p jsonb;
begin
  if points is null or jsonb_typeof(points)<>'array' or jsonb_array_length(points) not between 2 and 12 then return false; end if;
  for p in select value from jsonb_array_elements(points) loop
    if jsonb_typeof(p)<>'object' or jsonb_typeof(p->'lat')<>'number' or jsonb_typeof(p->'lng')<>'number'
      or (p->>'lat')::numeric not between -90 and 90 or (p->>'lng')::numeric not between -180 and 180
      or jsonb_typeof(p->'label')<>'string' or length(p->>'label') not between 1 and 80 then return false; end if;
    if not (p ? 'lat' and p ? 'lng' and p ? 'label') or p - array['lat','lng','label','place_id'] <> '{}'::jsonb then return false; end if;
    if p ? 'place_id' and (jsonb_typeof(p->'place_id')<>'string' or length(p->>'place_id')>300) then return false; end if;
  end loop;
  return true;
end $$;

create table public.rs_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check(handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check(length(trim(display_name)) between 1 and 40),
  presence_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.rs_blocks (
  blocker_id uuid references public.rs_profiles(user_id) on delete cascade,
  blocked_id uuid references public.rs_profiles(user_id) on delete cascade,
  primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);
create table public.rs_friendships (
  user_low uuid references public.rs_profiles(user_id) on delete cascade,
  user_high uuid references public.rs_profiles(user_id) on delete cascade,
  requester_id uuid not null references public.rs_profiles(user_id) on delete cascade,
  state text not null check(state in ('pending','accepted','declined','cancelled','removed')),
  generation integer not null default 1 check(generation>0),
  presence_topic uuid not null unique default gen_random_uuid(),
  updated_at timestamptz not null default now(), primary key(user_low,user_high),
  check(user_low<user_high and requester_id in(user_low,user_high))
);
create table public.rs_courses (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
  closed_course_approved boolean not null default false,
  boundary_polygon jsonb check(boundary_polygon is null or (jsonb_typeof(boundary_polygon)='array' and jsonb_array_length(boundary_polygon) between 3 and 256))
);
create table public.rs_course_sessions (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.rs_courses(id),
  starts_at timestamptz not null, ends_at timestamptz not null, approved boolean not null default false,
  check(ends_at>starts_at)
);
create table public.rs_routes (
  id uuid primary key, owner_id uuid not null references public.rs_profiles(user_id) on delete cascade,
  revision integer not null default 1 check(revision>0), title text not null check(length(trim(title)) between 1 and 80),
  category text not null check(category in ('scooter','motorcycle','car','bicycle')),
  stops jsonb not null check(ride_private.valid_stops(stops)),
  approved_course_id uuid references public.rs_courses(id), approved_revision integer,
  updated_at timestamptz not null default now(),
  check((approved_course_id is null and approved_revision is null) or (approved_course_id is not null and approved_revision is not null and approved_revision=revision))
);
create table public.rs_route_shares (
  route_id uuid references public.rs_routes(id) on delete cascade,
  recipient_id uuid references public.rs_profiles(user_id) on delete cascade,
  friendship_generation integer not null, primary key(route_id,recipient_id)
);
create table public.rs_challenges (
  id uuid primary key, creator_id uuid not null references public.rs_profiles(user_id) on delete cascade,
  route_id uuid references public.rs_routes(id) on delete set null,
  route_snapshot jsonb not null, category text not null check(category in ('scooter','motorcycle','car','bicycle')),
  mode text not null check(mode in ('group_ride','timed_race')),
  metric text not null check(metric in ('none','sustained_speed_3s')),
  course_session_id uuid references public.rs_course_sessions(id),
  starts_at timestamptz not null, ends_at timestamptz not null,
  state text not null default 'open' check(state in ('open','cancelled')),
  created_at timestamptz not null default now(), check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours'),
  check((mode='group_ride' and metric='none' and course_session_id is null) or (mode='timed_race' and metric='sustained_speed_3s' and course_session_id is not null))
);
create table public.rs_challenge_members (
  challenge_id uuid references public.rs_challenges(id) on delete cascade,
  user_id uuid references public.rs_profiles(user_id) on delete cascade,
  state text not null check(state in ('invited','accepted','declined','withdrawn')),
  updated_at timestamptz not null default now(), friendship_generation integer,
  primary key(challenge_id,user_id)
);
create table ride_private.presence_sessions (
  user_id uuid primary key references public.rs_profiles(user_id) on delete cascade,
  touched_at timestamptz not null, expires_at timestamptz not null
);
create table ride_private.daily_quotas (
  user_id uuid references auth.users(id) on delete cascade, action text, bucket date, hits integer not null,
  primary key(user_id,action,bucket)
);
create table public.rs_posts (
  id uuid primary key, owner_id uuid not null references public.rs_profiles(user_id) on delete cascade,
  caption text not null default '' check(length(caption)<=280), description text not null default '' check(length(description)<=4000),
  claimed_speed_kmh numeric(7,2) check(claimed_speed_kmh between 0 and 500),
  route_snapshot jsonb, media_path text unique,
  visibility text not null default 'private' check(visibility in ('private','friends','community')),
  moderation_state text not null default 'draft' check(moderation_state in ('draft','published','hidden')),
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.rs_post_reports (
  post_id uuid references public.rs_posts(id) on delete cascade,
  reporter_id uuid references public.rs_profiles(user_id) on delete cascade,
  reason text not null check(reason in ('spam','harassment','privacy','dangerous','other')),
  detail text not null check(length(detail)<=1000), created_at timestamptz not null default now(),
  primary key(post_id,reporter_id)
);
create table public.rs_submissions (
  id uuid primary key, owner_id uuid not null references public.rs_profiles(user_id) on delete cascade,
  challenge_id uuid not null references public.rs_challenges(id), evidence_path text not null unique,
  visibility text not null check(visibility in ('private','friends','community')),
  state text not null default 'pending_upload' check(state in ('pending_upload','queued','verifying','verified','rejected')),
  rejection_reason text check(length(rejection_reason)<=300), created_at timestamptz not null default now(),
  verification_started_at timestamptz, verification_attempts integer not null default 0,
  verification_token uuid
);
create table public.rs_verified_records (
  submission_id uuid primary key references public.rs_submissions(id) on delete cascade,
  owner_id uuid not null references public.rs_profiles(user_id) on delete cascade,
  challenge_id uuid not null references public.rs_challenges(id), course_id uuid not null references public.rs_courses(id),
  category text not null check(category in ('scooter','motorcycle','car','bicycle')),
  sustained_kmh numeric(7,2) not null check(sustained_kmh between 0 and 500),
  window_start timestamptz not null, window_end timestamptz not null,
  method text not null check(method='sustained_min_3s_v1'), sample_count integer not null check(sample_count>=4),
  maximum_gap_seconds numeric not null check(maximum_gap_seconds>0 and maximum_gap_seconds<=1.5),
  evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz not null default now(), check(window_end=window_start+interval '3 seconds')
);
create index rs_friendships_high on public.rs_friendships(user_high,state);
create index rs_members_user on public.rs_challenge_members(user_id,state);
create index rs_posts_feed on public.rs_posts(created_at desc) where moderation_state='published' and deleted_at is null;
create index rs_records_period on public.rs_verified_records(category,window_end,sustained_kmh desc);

create function ride_private.actor() returns uuid language plpgsql stable set search_path='' as $$
begin if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if; return auth.uid(); end $$;
create function ride_private.blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.rs_blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a))
$$;
create function ride_private.friends(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
  select a<>b and not ride_private.blocked(a,b) and exists(select 1 from public.rs_friendships where user_low=least(a,b) and user_high=greatest(a,b) and state='accepted')
$$;
create function ride_private.pair_lock(a uuid,b uuid) returns void language sql set search_path='' as $$
  select pg_advisory_xact_lock(hashtextextended(least(a,b)::text||greatest(a,b)::text,0))
$$;
create function ride_private.quota(action_name text, maximum integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  insert into ride_private.daily_quotas(user_id,action,bucket,hits) values(ride_private.actor(),action_name,(now() at time zone 'UTC')::date,1)
  on conflict(user_id,action,bucket) do update set hits=daily_quotas.hits+1 where daily_quotas.hits<maximum returning hits into n;
  if n is null then raise exception 'Daily action limit reached' using errcode='P0001'; end if;
end $$;
create function ride_private.can_view_challenge(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.rs_challenges c where c.id=cid and (c.creator_id=auth.uid() or
    (ride_private.friends(c.creator_id,auth.uid()) and exists(select 1 from public.rs_challenge_members m where m.challenge_id=c.id and m.user_id=auth.uid() and m.state in ('invited','accepted')
      and m.friendship_generation=(select f.generation from public.rs_friendships f where f.user_low=least(c.creator_id,auth.uid()) and f.user_high=greatest(c.creator_id,auth.uid()))))))
$$;
create function ride_private.can_view_route(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.rs_routes r where r.id=rid and (r.owner_id=auth.uid() or exists(
    select 1 from public.rs_route_shares s join public.rs_friendships f on f.user_low=least(r.owner_id,s.recipient_id) and f.user_high=greatest(r.owner_id,s.recipient_id)
    where s.route_id=r.id and s.recipient_id=auth.uid() and s.friendship_generation=f.generation and f.state='accepted' and not ride_private.blocked(r.owner_id,auth.uid()))))
$$;
create function ride_private.can_view_post(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.rs_posts p where p.id=pid and p.deleted_at is null and (p.owner_id=auth.uid() or
    (p.moderation_state='published' and not ride_private.blocked(p.owner_id,auth.uid()) and
      (p.visibility='community' or (p.visibility='friends' and ride_private.friends(p.owner_id,auth.uid()))))))
$$;
create function ride_private.can_read_presence(topic_name text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.rs_friendships f where topic_name='rs-presence:'||f.presence_topic::text
    and auth.uid() in(f.user_low,f.user_high) and f.state='accepted' and not ride_private.blocked(f.user_low,f.user_high))
$$;

-- All application table writes are RPC-only; no arbitrary sender IDs or status updates.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename like 'rs\_%' escape '\' loop
    execute format('alter table public.%I enable row level security',t.tablename);
    execute format('revoke all on table public.%I from public,anon,authenticated',t.tablename);
    execute format('grant select on table public.%I to authenticated',t.tablename);
    execute format('grant all on table public.%I to service_role',t.tablename);
  end loop;
end $$;
create policy rs_profiles_read on public.rs_profiles for select to authenticated using(user_id=auth.uid() or ride_private.friends(user_id,auth.uid()));
create policy rs_blocks_read on public.rs_blocks for select to authenticated using(blocker_id=auth.uid());
create policy rs_friends_read on public.rs_friendships for select to authenticated using(auth.uid() in(user_low,user_high) and not ride_private.blocked(user_low,user_high));
create policy rs_courses_read on public.rs_courses for select to authenticated using(closed_course_approved);
create policy rs_sessions_read on public.rs_course_sessions for select to authenticated using(approved and exists(select 1 from public.rs_courses c where c.id=course_id and c.closed_course_approved));
create policy rs_routes_read on public.rs_routes for select to authenticated using(ride_private.can_view_route(id));
create policy rs_shares_read on public.rs_route_shares for select to authenticated using(ride_private.can_view_route(route_id) and (recipient_id=auth.uid() or exists(select 1 from public.rs_routes r where r.id=route_id and r.owner_id=auth.uid())));
create policy rs_challenges_read on public.rs_challenges for select to authenticated using(ride_private.can_view_challenge(id));
create policy rs_members_read on public.rs_challenge_members for select to authenticated using(ride_private.can_view_challenge(challenge_id) and not ride_private.blocked(user_id,auth.uid()));
create policy rs_posts_read on public.rs_posts for select to authenticated using(ride_private.can_view_post(id));
create policy rs_reports_read on public.rs_post_reports for select to authenticated using(reporter_id=auth.uid());
create policy rs_submissions_read on public.rs_submissions for select to authenticated using(owner_id=auth.uid());
create policy rs_records_read on public.rs_verified_records for select to authenticated using(owner_id=auth.uid());

create function public.rs_upsert_profile(p_handle text,p_display_name text) returns public.rs_profiles language plpgsql security definer set search_path='' as $$
declare result public.rs_profiles; begin
  insert into public.rs_profiles(user_id,handle,display_name) values(ride_private.actor(),lower(trim(p_handle)),trim(p_display_name))
  on conflict(user_id) do update set handle=excluded.handle,display_name=excluded.display_name returning * into result; return result;
end $$;
create function public.rs_request_friend(p_handle text) returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); other_id uuid; f public.rs_friendships;
begin
  perform ride_private.quota('friend_lookup',40);
  select user_id into other_id from public.rs_profiles where handle=lower(trim(p_handle));
  if other_id is null or other_id=actor or ride_private.blocked(actor,other_id) then raise exception 'User unavailable'; end if;
  perform ride_private.pair_lock(actor,other_id);
  if ride_private.blocked(actor,other_id) then raise exception 'User unavailable'; end if;
  select * into f from public.rs_friendships where user_low=least(actor,other_id) and user_high=greatest(actor,other_id) for update;
  if found and f.state='accepted' then return 'accepted'; end if;
  if found and f.state='pending' then return case when f.requester_id=actor then 'outgoing' else 'incoming' end; end if;
  if found and f.updated_at>now()-interval '1 day' then raise exception 'Please wait before requesting again'; end if;
  insert into public.rs_friendships(user_low,user_high,requester_id,state) values(least(actor,other_id),greatest(actor,other_id),actor,'pending')
  on conflict(user_low,user_high) do update set requester_id=actor,state='pending',generation=rs_friendships.generation+1,presence_topic=gen_random_uuid(),updated_at=now();
  return 'outgoing';
end $$;
create function public.rs_my_friends() returns table(user_id uuid,handle text,display_name text,state text,direction text,generation integer)
language sql stable security definer set search_path='' as $$
  select p.user_id,p.handle,p.display_name,f.state,case when f.requester_id=auth.uid() then 'outgoing' else 'incoming' end,f.generation
  from public.rs_friendships f join public.rs_profiles p on p.user_id=case when f.user_low=auth.uid() then f.user_high else f.user_low end
  where auth.uid() in(f.user_low,f.user_high) and f.state in('pending','accepted') and not ride_private.blocked(f.user_low,f.user_high)
$$;
create function public.rs_friend_action(p_other uuid,p_action text) returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); f public.rs_friendships; next_state text;
begin
  if p_other=actor or p_other is null then raise exception 'Invalid friend'; end if;
  perform ride_private.pair_lock(actor,p_other);
  if p_action='block' then
    insert into public.rs_blocks values(actor,p_other) on conflict do nothing;
    update public.rs_friendships set state='removed',generation=generation+1,presence_topic=gen_random_uuid(),updated_at=now() where user_low=least(actor,p_other) and user_high=greatest(actor,p_other);
    return 'blocked';
  elsif p_action='unblock' then delete from public.rs_blocks where blocker_id=actor and blocked_id=p_other; return 'unblocked'; end if;
  if ride_private.blocked(actor,p_other) then raise exception 'Friend unavailable'; end if;
  select * into f from public.rs_friendships where user_low=least(actor,p_other) and user_high=greatest(actor,p_other) for update;
  if not found then raise exception 'Friend unavailable'; end if;
  if p_action='accept' and f.requester_id<>actor and f.state in('pending','accepted') then next_state:='accepted';
  elsif p_action='decline' and f.requester_id<>actor and f.state in('pending','declined') then next_state:='declined';
  elsif p_action='cancel' and f.requester_id=actor and f.state in('pending','cancelled') then next_state:='cancelled';
  elsif p_action='remove' and f.state in('accepted','removed') then next_state:='removed';
  else raise exception 'Only the recipient may accept an incoming request, or invalid transition' using errcode='42501'; end if;
  if f.state<>next_state then update public.rs_friendships set state=next_state,generation=generation+1,presence_topic=gen_random_uuid(),updated_at=now() where user_low=f.user_low and user_high=f.user_high; end if;
  return next_state;
end $$;

create function public.rs_save_route(p_id uuid,p_expected_revision integer,p_title text,p_category text,p_stops jsonb) returns public.rs_routes language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); r public.rs_routes;
begin
  perform ride_private.quota('route_write',100);
  if p_expected_revision=0 then
    insert into public.rs_routes(id,owner_id,title,category,stops) values(coalesce(p_id,gen_random_uuid()),actor,trim(p_title),p_category,p_stops) returning * into r;
  else
    update public.rs_routes set title=trim(p_title),category=p_category,stops=p_stops,revision=revision+1,approved_course_id=null,approved_revision=null,updated_at=now()
    where id=p_id and owner_id=actor and revision=p_expected_revision returning * into r;
    if not found then raise exception 'Route unavailable or revision conflict'; end if;
  end if; return r;
end $$;
create function public.rs_share_route(p_route uuid,p_friend uuid,p_share boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); gen integer;
begin
  perform ride_private.pair_lock(actor,p_friend);
  if not exists(select 1 from public.rs_routes where id=p_route and owner_id=actor) then raise exception 'Route unavailable' using errcode='42501'; end if;
  if not p_share then delete from public.rs_route_shares where route_id=p_route and recipient_id=p_friend; return; end if;
  if not ride_private.friends(actor,p_friend) then raise exception 'Accepted friend required'; end if;
  select generation into gen from public.rs_friendships where user_low=least(actor,p_friend) and user_high=greatest(actor,p_friend);
  insert into public.rs_route_shares values(p_route,p_friend,gen) on conflict(route_id,recipient_id) do update set friendship_generation=gen;
end $$;
create function public.rs_delete_route(p_id uuid,p_expected_revision integer) returns boolean language plpgsql security definer set search_path='' as $$
begin
  delete from public.rs_routes where id=p_id and owner_id=ride_private.actor() and revision=p_expected_revision;
  if not found then raise exception 'Route unavailable or revision conflict'; end if;
  return true;
end $$;

create function public.rs_create_challenge(p_id uuid,p_route uuid,p_revision integer,p_mode text,p_session uuid,p_starts timestamptz,p_ends timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); r public.rs_routes; s public.rs_course_sessions;
begin
  perform ride_private.quota('challenge_create',20);
  select * into r from public.rs_routes where id=p_route and owner_id=actor and revision=p_revision for share;
  if not found then raise exception 'Save your route first or refresh its revision'; end if;
  if p_starts<now() or p_ends<=p_starts then raise exception 'Choose a future challenge window'; end if;
  if p_mode='timed_race' then
    select * into s from public.rs_course_sessions where id=p_session and approved for share;
    if not found or r.approved_course_id is distinct from s.course_id or r.approved_revision is distinct from r.revision or p_starts<s.starts_at or p_ends>s.ends_at
      or not exists(select 1 from public.rs_courses where id=s.course_id and closed_course_approved) then raise exception 'An approved closed-course route and session are required'; end if;
  elsif p_mode<>'group_ride' or p_session is not null then raise exception 'Invalid challenge mode'; end if;
  insert into public.rs_challenges(id,creator_id,route_id,route_snapshot,category,mode,metric,course_session_id,starts_at,ends_at)
  values(p_id,actor,r.id,jsonb_build_object('route_id',r.id,'revision',r.revision,'title',r.title,'stops',r.stops,'category',r.category),r.category,p_mode,case when p_mode='timed_race' then 'sustained_speed_3s' else 'none' end,p_session,p_starts,p_ends);
  insert into public.rs_challenge_members(challenge_id,user_id,state) values(p_id,actor,'accepted'); return p_id;
end $$;
create function public.rs_invite_challenge(p_challenge uuid,p_friend uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); c public.rs_challenges; gen integer;
begin
  perform ride_private.pair_lock(actor,p_friend);
  select * into c from public.rs_challenges where id=p_challenge and creator_id=actor for update;
  if not found or c.state<>'open' or c.starts_at<=now() or not ride_private.friends(actor,p_friend) then raise exception 'Challenge or friend unavailable'; end if;
  select generation into gen from public.rs_friendships where user_low=least(actor,p_friend) and user_high=greatest(actor,p_friend);
  if exists(select 1 from public.rs_challenge_members where challenge_id=p_challenge and user_id=p_friend) then
    -- Reconnection never revives an old invitation; an explicit new invitation may.
    update public.rs_challenge_members set state='invited',friendship_generation=gen,updated_at=now()
    where challenge_id=p_challenge and user_id=p_friend and friendship_generation is distinct from gen;
    return;
  end if;
  if (select count(*) from public.rs_challenge_members where challenge_id=p_challenge)>=11 then raise exception 'Challenge participant limit reached'; end if;
  insert into public.rs_challenge_members(challenge_id,user_id,state,friendship_generation)
  values(p_challenge,p_friend,'invited',gen) on conflict do nothing;
end $$;
create function public.rs_challenge_action(p_challenge uuid,p_action text) returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); creator uuid; c public.rs_challenges; m public.rs_challenge_members; next_state text;
begin
  select creator_id into creator from public.rs_challenges where id=p_challenge;
  if creator is null then raise exception 'Challenge unavailable'; end if;
  if creator<>actor then perform ride_private.pair_lock(actor,creator); end if;
  select * into c from public.rs_challenges where id=p_challenge for update;
  if not found then raise exception 'Challenge unavailable'; end if;
  if p_action='cancel' and c.creator_id=actor then update public.rs_challenges set state='cancelled' where id=c.id; return 'cancelled'; end if;
  if c.state<>'open' or c.starts_at<=now() or not ride_private.can_view_challenge(c.id) or not ride_private.friends(actor,c.creator_id) then raise exception 'Challenge unavailable'; end if;
  select * into m from public.rs_challenge_members where challenge_id=c.id and user_id=actor for update;
  if not found then raise exception 'Invitation required' using errcode='42501'; end if;
  if p_action='accept' and m.state in('invited','accepted') then next_state:='accepted';
  elsif p_action='decline' and m.state in('invited','declined') then next_state:='declined';
  elsif p_action='withdraw' and m.state in('accepted','withdrawn') then next_state:='withdrawn';
  else raise exception 'Invalid challenge transition'; end if;
  update public.rs_challenge_members set state=next_state,updated_at=now() where challenge_id=c.id and user_id=actor; return next_state;
end $$;

create function public.rs_set_presence(p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); f public.rs_friendships;
begin
  update public.rs_profiles set presence_opt_in=p_enabled where user_id=actor;
  if not p_enabled then
    delete from ride_private.presence_sessions where user_id=actor;
    for f in select * from public.rs_friendships where actor in(user_low,user_high) order by user_low,user_high for update loop
      if f.state='accepted' then perform realtime.send(jsonb_build_object('user_id',actor,'online',false,'expires_at',now()),'presence','rs-presence:'||f.presence_topic::text,true); end if;
      update public.rs_friendships set presence_topic=gen_random_uuid() where user_low=f.user_low and user_high=f.user_high;
    end loop;
  end if;
end $$;
create function public.rs_heartbeat() returns timestamptz language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); opted boolean; last_beat timestamptz; expiry timestamptz; f public.rs_friendships;
begin
  select presence_opt_in into opted from public.rs_profiles where user_id=actor for update;
  if not coalesce(opted,false) then raise exception 'Presence is disabled'; end if;
  select touched_at,expires_at into last_beat,expiry from ride_private.presence_sessions where user_id=actor;
  if last_beat>now()-interval '20 seconds' then return expiry; end if;
  expiry:=now()+interval '70 seconds';
  insert into ride_private.presence_sessions values(actor,now(),expiry) on conflict(user_id) do update set touched_at=now(),expires_at=expiry;
  for f in select * from public.rs_friendships where actor in(user_low,user_high) and state='accepted' order by user_low,user_high for update loop
    if not ride_private.blocked(f.user_low,f.user_high) then perform realtime.send(jsonb_build_object('user_id',actor,'online',true,'expires_at',expiry),'presence','rs-presence:'||f.presence_topic::text,true); end if;
  end loop; return expiry;
end $$;
create function public.rs_friend_presence() returns table(user_id uuid,topic text,online boolean,expires_at timestamptz) language sql stable security definer set search_path='' as $$
  select p.user_id,'rs-presence:'||f.presence_topic::text,coalesce(p.presence_opt_in and s.expires_at>now(),false),
    case when p.presence_opt_in and s.expires_at>now() then s.expires_at else null end
  from public.rs_friendships f join public.rs_profiles p on p.user_id=case when f.user_low=auth.uid() then f.user_high else f.user_low end
  left join ride_private.presence_sessions s on s.user_id=p.user_id
  where auth.uid() in(f.user_low,f.user_high) and f.state='accepted' and not ride_private.blocked(f.user_low,f.user_high)
$$;
-- Realtime already enables RLS; Supabase does not permit altering its ownership.
create policy rs_presence_receive on realtime.messages for select to authenticated using(extension='broadcast' and ride_private.can_read_presence(realtime.topic()));
-- No client INSERT policy: presence payloads originate only in the server heartbeat.

create function public.rs_create_post(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();
begin
  if exists(select 1 from public.rs_posts where id=p_id and owner_id=actor) then return p_id; end if;
  perform ride_private.quota('post_create',20); insert into public.rs_posts(id,owner_id) values(p_id,actor); return p_id;
end $$;
create function public.rs_publish_post(p_id uuid,p_caption text,p_description text,p_speed numeric,p_route uuid,p_route_revision integer,p_visibility text,p_media_path text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); p public.rs_posts; r public.rs_routes; snapshot jsonb;
begin
  select * into p from public.rs_posts where id=p_id and owner_id=actor for update;
  if not found or p.deleted_at is not null or p.moderation_state='hidden' then raise exception 'Post unavailable' using errcode='42501'; end if;
  if p_route is not null then
    select * into r from public.rs_routes where id=p_route and owner_id=actor and revision=p_route_revision for share;
    if not found then raise exception 'Route unavailable or revision changed; preview the saved route again'; end if;
    snapshot:=jsonb_build_object('title',r.title,'stops',r.stops,'category',r.category,'revision',r.revision);
  elsif p_route_revision is not null then raise exception 'A route revision requires a route'; end if;
  if p_media_path is not null and (p_media_path !~ ('^'||actor::text||'/'||p_id::text||'/[a-f0-9-]+\.(jpg|jpeg|png|webp)$') or
    not exists(select 1 from storage.objects where bucket_id='ride-community' and name=p_media_path)) then raise exception 'Upload your post image first'; end if;
  update public.rs_posts set caption=p_caption,description=p_description,claimed_speed_kmh=p_speed,route_snapshot=snapshot,visibility=p_visibility,media_path=p_media_path,moderation_state='published' where id=p_id;
end $$;
create function public.rs_delete_post(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin update public.rs_posts set deleted_at=coalesce(deleted_at,now()),visibility='private' where id=p_id and owner_id=ride_private.actor(); end $$;
create function public.rs_report_post(p_id uuid,p_reason text,p_detail text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not ride_private.can_view_post(p_id) then raise exception 'Post unavailable'; end if;
  perform ride_private.quota('report',10);
  insert into public.rs_post_reports values(p_id,ride_private.actor(),p_reason,p_detail,now()) on conflict(post_id,reporter_id) do nothing;
end $$;
create function public.rs_feed(p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null)
returns table(id uuid,owner_id uuid,caption text,description text,claimed_speed_kmh numeric,route_snapshot jsonb,media_path text,visibility text,created_at timestamptz,display_name text,handle text,speed_status text)
language sql stable security definer set search_path='' as $$
  select p.id,p.owner_id,p.caption,p.description,p.claimed_speed_kmh,p.route_snapshot,p.media_path,p.visibility,p.created_at,u.display_name,u.handle,'self_reported'::text
  from public.rs_posts p join public.rs_profiles u on u.user_id=p.owner_id
  where auth.uid() is not null and p.moderation_state='published' and ride_private.can_view_post(p.id)
    and (p_before is null or p.created_at<p_before or (p.created_at=p_before and p_before_id is not null and p.id<p_before_id))
  order by p.created_at desc,p.id desc limit least(greatest(coalesce(p_limit,30),1),50)
$$;

create function public.rs_reserve_submission(p_id uuid,p_challenge uuid,p_visibility text) returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); c public.rs_challenges; path text;
begin
  select * into c from public.rs_challenges where id=p_challenge;
  if not found or not ride_private.can_view_challenge(c.id) or c.mode<>'timed_race' or c.state<>'open' or now()>c.ends_at+interval '7 days' or
    not exists(select 1 from public.rs_challenge_members where challenge_id=c.id and user_id=actor and state='accepted') then raise exception 'Accepted timed challenge required'; end if;
  perform ride_private.quota('submission',10); path:=actor::text||'/'||p_id::text||'/samples.bin';
  insert into public.rs_submissions(id,owner_id,challenge_id,evidence_path,visibility) values(p_id,actor,p_challenge,path,p_visibility); return path;
end $$;
create function public.rs_queue_submission(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.rs_submissions;
begin
  select * into s from public.rs_submissions where id=p_id and owner_id=ride_private.actor() for update;
  if not found or s.state not in('pending_upload','queued') then raise exception 'Submission unavailable'; end if;
  if not exists(select 1 from storage.objects where bucket_id='ride-evidence' and name=s.evidence_path) then raise exception 'Evidence upload required'; end if;
  update public.rs_submissions set state='queued' where id=s.id;
end $$;
create function public.rs_claim_submission(p_id uuid,p_owner uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare token uuid;
begin
  update public.rs_submissions set state='verifying',verification_started_at=now(),verification_attempts=verification_attempts+1,verification_token=gen_random_uuid()
  where id=p_id and owner_id=p_owner and verification_attempts<3 and (state='queued' or (state='verifying' and verification_started_at<now()-interval '2 minutes')) returning verification_token into token;
  return token;
end $$;
create function public.rs_release_submission(p_id uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin update public.rs_submissions set state='queued',verification_token=null where id=p_id and state='verifying' and verification_token=p_token; end $$;
-- Trusted worker result sink, NOT a sensor verifier. No client may execute this RPC.
create function public.rs_finalize_submission(p_id uuid,p_speed numeric,p_start timestamptz,p_end timestamptz,p_samples integer,p_max_gap numeric,p_sha256 text,p_token uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare s public.rs_submissions; c public.rs_challenges; cs public.rs_course_sessions;
begin
  select * into s from public.rs_submissions where id=p_id for update;
  if not found or s.state<>'verifying' or p_token is null or s.verification_token is distinct from p_token then raise exception 'Claimed submission required'; end if;
  select * into c from public.rs_challenges where id=s.challenge_id for share;
  select * into cs from public.rs_course_sessions where id=c.course_session_id for share;
  if c.mode<>'timed_race' or c.state<>'open' or not cs.approved or p_start<c.starts_at or p_end>c.ends_at or p_end>now()
    or p_start<cs.starts_at or p_end>cs.ends_at or not exists(select 1 from public.rs_courses where id=cs.course_id and closed_course_approved)
    or (s.owner_id<>c.creator_id and not ride_private.friends(s.owner_id,c.creator_id))
    or not exists(select 1 from public.rs_challenge_members m where m.challenge_id=c.id and m.user_id=s.owner_id and m.state='accepted'
      and (s.owner_id=c.creator_id or m.friendship_generation=(select f.generation from public.rs_friendships f where f.user_low=least(s.owner_id,c.creator_id) and f.user_high=greatest(s.owner_id,c.creator_id)))) then raise exception 'Record is ineligible'; end if;
  insert into public.rs_verified_records values(s.id,s.owner_id,c.id,cs.course_id,c.category,p_speed,p_start,p_end,'sustained_min_3s_v1',p_samples,p_max_gap,p_sha256,now());
  update public.rs_submissions set state='verified',verification_token=null where id=s.id;
end $$;
create function public.rs_reject_submission(p_id uuid,p_reason text,p_token uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.rs_submissions set state='rejected',rejection_reason=p_reason,verification_token=null where id=p_id and state in('queued','verifying','verified') and (p_token is null or verification_token=p_token);
  if not found then return false; end if;
  delete from public.rs_verified_records where submission_id=p_id; return true;
end $$;
create function public.rs_moderate_post(p_id uuid,p_hide boolean) returns void language plpgsql security definer set search_path='' as $$
begin update public.rs_posts set moderation_state=case when p_hide then 'hidden' else 'published' end where id=p_id and deleted_at is null; end $$;

create function public.rs_leaderboard(p_period text,p_category text,p_scope text default 'community',p_course uuid default null)
returns table(rank bigint,user_id uuid,display_name text,sustained_kmh numeric,recorded_at timestamptz,method text)
language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz; end_at timestamptz;
begin
  perform ride_private.actor();
  if p_period not in('today','week','month') or p_scope not in('community','friends') or p_category not in('scooter','motorcycle','car','bicycle') then raise exception 'Invalid leaderboard filter'; end if;
  start_at:=date_trunc(case when p_period='today' then 'day' else p_period end,now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  end_at:=((start_at at time zone 'Asia/Bangkok')+case when p_period='today' then interval '1 day' when p_period='week' then interval '1 week' else interval '1 month' end) at time zone 'Asia/Bangkok';
  return query with eligible as (
    select v.*,row_number() over(partition by v.owner_id order by v.sustained_kmh desc,v.window_end asc,v.submission_id) as personal_best
    from public.rs_verified_records v join public.rs_submissions s on s.id=v.submission_id
    join public.rs_challenges c on c.id=v.challenge_id join public.rs_course_sessions cs on cs.id=c.course_session_id join public.rs_courses co on co.id=v.course_id
    where s.state='verified' and c.state='open' and cs.approved and co.closed_course_approved and v.category=p_category
      and v.window_end>=start_at and v.window_end<end_at and v.window_end<=now() and (p_course is null or v.course_id=p_course)
      and not ride_private.blocked(v.owner_id,auth.uid()) and
      ((p_scope='community' and s.visibility='community') or (p_scope='friends' and s.visibility in('friends','community') and (v.owner_id=auth.uid() or ride_private.friends(v.owner_id,auth.uid()))))
  ) select dense_rank() over(order by e.sustained_kmh desc),e.owner_id,p.display_name,e.sustained_kmh,e.window_end,e.method
    from eligible e join public.rs_profiles p on p.user_id=e.owner_id where e.personal_best=1 order by e.sustained_kmh desc,e.window_end asc,e.owner_id limit 100;
end $$;

-- Private assets. Upload ownership is taken from auth.uid(), not an owner header.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('ride-community','ride-community',false,3145728,array['image/jpeg','image/png','image/webp']),
 ('ride-evidence','ride-evidence',false,2097152,array['application/octet-stream']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function ride_private.can_upload_post(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rs_posts p where p.owner_id=auth.uid() and p.deleted_at is null and p.moderation_state<>'hidden'
  and path ~ ('^'||auth.uid()::text||'/'||p.id::text||'/[a-f0-9-]+\.(jpg|jpeg|png|webp)$'))
$$;
create policy rs_media_insert on storage.objects for insert to authenticated with check(bucket_id='ride-community' and ride_private.can_upload_post(name));
-- Other readers use media-url, which rechecks post RLS and enforces a 60s TTL.
create policy rs_media_read on storage.objects for select to authenticated using(bucket_id='ride-community' and split_part(name,'/',1)=auth.uid()::text);
create policy rs_media_delete on storage.objects for delete to authenticated using(bucket_id='ride-community' and split_part(name,'/',1)=auth.uid()::text);
create policy rs_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='ride-evidence' and exists(select 1 from public.rs_submissions s where s.evidence_path=name and s.owner_id=auth.uid() and s.state='pending_upload'));
create policy rs_evidence_read on storage.objects for select to authenticated using(bucket_id='ride-evidence' and exists(select 1 from public.rs_submissions s where s.evidence_path=name and s.owner_id=auth.uid()));
-- No UPDATE/upsert policies: evidence objects are immutable once uploaded.

-- SECURITY DEFINER functions do not inherit default public execute access.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ride_private' or (n.nspname='public' and p.proname like 'rs\_%' escape '\') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.nspname='public' and f.proname not in('rs_finalize_submission','rs_reject_submission','rs_moderate_post','rs_claim_submission','rs_release_submission') then
      execute format('grant execute on function %s to authenticated',f.signature);
    end if;
    if f.nspname='public' then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $$;
grant execute on function ride_private.friends(uuid,uuid),ride_private.blocked(uuid,uuid),ride_private.can_view_challenge(uuid),ride_private.can_view_route(uuid),ride_private.can_view_post(uuid),ride_private.can_read_presence(text),ride_private.can_upload_post(text) to authenticated;
commit;
