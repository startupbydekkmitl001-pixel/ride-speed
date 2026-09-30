-- Additive M1 upgrade after the dashboard-deployed foundation. Never reapply the
-- creation migration to a live project; reconcile CLI history before pushing.
begin;

create table public.rs_account_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 0 check(revision>=0),
  onboarding_version integer not null default 1 check(onboarding_version=1),
  onboarding_step text not null default 'language' check(onboarding_step in('language','location','profile','vehicle','complete')),
  location_choice text not null default 'unknown' check(location_choice in('unknown','granted','denied')),
  preferences jsonb not null default '{"ghost_mode":true,"route_audience":"friends","notifications_enabled":false}',
  updated_at timestamptz not null default now()
);
-- Existing real profiles already completed the older account flow. New accounts
-- created after this migration are incomplete regardless of profile existence.
insert into public.rs_account_state(user_id,onboarding_step,preferences)
select user_id,'complete',jsonb_build_object('ghost_mode',not presence_opt_in,'route_audience','friends','notifications_enabled',false) from public.rs_profiles;

create table public.rs_avatar_uploads (
  upload_id uuid primary key,
  owner_id uuid not null references public.rs_profiles(user_id) on delete cascade,
  path text not null unique,
  mime text not null check(mime in('image/jpeg','image/png','image/webp')),
  state text not null default 'reserved' check(state in('reserved','committed','obsolete')),
  expires_at timestamptz not null default now()+interval '1 hour',
  created_at timestamptz not null default now()
);
create table public.rs_profile_avatars (
  user_id uuid primary key references public.rs_profiles(user_id) on delete cascade,
  avatar_id uuid references public.rs_avatar_uploads(upload_id),
  revision integer not null default 0 check(revision>=0)
);
create index rs_avatar_cleanup on public.rs_avatar_uploads(owner_id,state,expires_at);

-- A minimal private receipt survives Auth removal; it contains no email/name,
-- coordinates, media bytes or JWT. Operator retention removes completed receipts.
create table ride_private.account_deletion_jobs (
  owner_id uuid primary key,
  request_id uuid not null unique,
  state text not null default 'storage_pending' check(state in('storage_pending','auth_pending','deleted')),
  token uuid, lease_until timestamptz, attempts integer not null default 0,
  last_error text check(last_error is null or length(last_error)<=80),
  requested_at timestamptz not null default now(), completed_at timestamptz
);
create table ride_private.account_deletion_objects (
  owner_id uuid references ride_private.account_deletion_jobs(owner_id) on delete cascade,
  bucket text not null, path text not null,
  primary key(owner_id,bucket,path)
);
alter table ride_private.account_deletion_jobs enable row level security;
alter table ride_private.account_deletion_objects enable row level security;
revoke all on ride_private.account_deletion_jobs,ride_private.account_deletion_objects from public,anon,authenticated;

create function ride_private.account_active(uid uuid) returns boolean language sql stable security definer set search_path='' as $$
  select uid is not null and not exists(select 1 from ride_private.account_deletion_jobs where owner_id=uid)
$$;
create function ride_private.account_lock(uid uuid) returns void language sql volatile set search_path='' as $$
  select pg_advisory_xact_lock(hashtextextended('ride-account:'||uid::text,0))
$$;
-- Fence old RPC writes against deletion, preserving the actor-derived identity
-- and empty search path. The lock also serializes uploads using the same fence.
create or replace function ride_private.actor() returns uuid language plpgsql volatile set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform ride_private.account_lock(uid);
  if not ride_private.account_active(uid) then raise exception 'ACCOUNT_DELETION_PENDING' using errcode='42501'; end if;
  return uid;
end $$;

create function ride_private.valid_account_preferences(p jsonb) returns boolean language sql immutable set search_path='' as $$
  select p is not null and jsonb_typeof(p)='object' and p-array['ghost_mode','route_audience','notifications_enabled']='{}'::jsonb
    and (not p?'ghost_mode' or jsonb_typeof(p->'ghost_mode')='boolean')
    and (not p?'notifications_enabled' or jsonb_typeof(p->'notifications_enabled')='boolean')
    and (not p?'route_audience' or (jsonb_typeof(p->'route_audience')='string' and p->>'route_audience' in('private','friends')))
$$;
alter table public.rs_account_state add constraint rs_account_preferences_valid check(ride_private.valid_account_preferences(preferences));

create function public.rs_get_account_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor(); result public.rs_account_state;
begin
  insert into public.rs_account_state(user_id) values(uid) on conflict(user_id) do nothing;
  select * into result from public.rs_account_state where user_id=uid;
  return to_jsonb(result)-'user_id';
end $$;
-- Keep the older explicit presence consent API compatible. Privacy preference
-- writes and legacy consent changes both update authoritative server state.
create or replace function public.rs_set_presence(p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor(); f public.rs_friendships;
begin
  if p_enabled is null then raise exception 'ACCOUNT_STATE_INVALID' using errcode='22023'; end if;
  insert into public.rs_account_state(user_id) values(actor) on conflict(user_id) do nothing;
  update public.rs_account_state set preferences=jsonb_set(preferences,'{ghost_mode}',to_jsonb(not p_enabled)),revision=revision+1,updated_at=now()
    where user_id=actor and (preferences->>'ghost_mode')::boolean is distinct from not p_enabled;
  update public.rs_profiles set presence_opt_in=p_enabled where user_id=actor;
  if not p_enabled then
    delete from ride_private.presence_sessions where user_id=actor;
    for f in select * from public.rs_friendships where actor in(user_low,user_high) order by user_low,user_high for update loop
      if f.state='accepted' then perform realtime.send(jsonb_build_object('user_id',actor,'online',false,'expires_at',now()),'presence','rs-presence:'||f.presence_topic::text,true); end if;
      update public.rs_friendships set presence_topic=gen_random_uuid() where user_low=f.user_low and user_high=f.user_high;
    end loop;
  end if;
end $$;
create function public.rs_update_account_state(p_expected_revision integer,p_onboarding_step text,p_location_choice text,p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor(); result public.rs_account_state;
begin
  if p_expected_revision is null or p_expected_revision<0 or p_onboarding_step is null or p_onboarding_step not in('language','location','profile','vehicle','complete')
    or p_location_choice is null or p_location_choice not in('unknown','granted','denied') or not ride_private.valid_account_preferences(p_preferences)
    then raise exception 'ACCOUNT_STATE_INVALID' using errcode='22023'; end if;
  insert into public.rs_account_state(user_id) values(uid) on conflict(user_id) do nothing;
  update public.rs_account_state set revision=revision+1,onboarding_step=p_onboarding_step,location_choice=p_location_choice,
    preferences=preferences||p_preferences,updated_at=now() where user_id=uid and revision=p_expected_revision returning * into result;
  if not found then raise exception 'ACCOUNT_STATE_CONFLICT' using errcode='P0001'; end if;
  if p_preferences?'ghost_mode' then perform public.rs_set_presence(not (p_preferences->>'ghost_mode')::boolean); end if;
  return to_jsonb(result)-'user_id';
end $$;

create function public.rs_get_avatar() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor(); result public.rs_profile_avatars;
begin
  select * into result from public.rs_profile_avatars where user_id=uid;
  return case when found then to_jsonb(result)-'user_id' else jsonb_build_object('revision',0,'avatar_id',null) end;
end $$;
create function public.rs_reserve_avatar(p_id uuid,p_mime text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor(); result public.rs_avatar_uploads; ext text;
begin
  if p_id is null or p_mime is null or p_mime not in('image/jpeg','image/png','image/webp') then raise exception 'AVATAR_INVALID_OBJECT' using errcode='22023'; end if;
  if not exists(select 1 from public.rs_profiles where user_id=uid) then raise exception 'AVATAR_PROFILE_REQUIRED' using errcode='P0001'; end if;
  select * into result from public.rs_avatar_uploads where upload_id=p_id;
  if found then
    if result.owner_id<>uid or result.mime<>p_mime or result.state='obsolete' then raise exception 'AVATAR_UNAVAILABLE' using errcode='42501'; end if;
  else
    perform ride_private.quota('avatar_upload',20);
    ext:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
    insert into public.rs_avatar_uploads(upload_id,owner_id,path,mime) values(p_id,uid,uid::text||'/'||p_id::text||'.'||ext,p_mime) returning * into result;
  end if;
  return jsonb_build_object('upload_id',result.upload_id,'bucket','ride-avatars','path',result.path,'expires_at',result.expires_at);
end $$;
create function public.rs_commit_avatar(p_id uuid,p_expected_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor(); upload public.rs_avatar_uploads; current public.rs_profile_avatars;
begin
  insert into public.rs_profile_avatars(user_id) values(uid) on conflict(user_id) do nothing;
  select * into current from public.rs_profile_avatars where user_id=uid for update;
  if current.avatar_id=p_id then return to_jsonb(current)-'user_id'; end if;
  if p_expected_revision is null or current.revision<>p_expected_revision then raise exception 'AVATAR_REVISION_CONFLICT' using errcode='P0001'; end if;
  select * into upload from public.rs_avatar_uploads where upload_id=p_id and owner_id=uid for update;
  if not found or upload.state<>'reserved' or upload.expires_at<now() then raise exception 'AVATAR_UNAVAILABLE' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects where bucket_id='ride-avatars' and name=upload.path) then raise exception 'AVATAR_UPLOAD_REQUIRED' using errcode='P0001'; end if;
  if not exists(select 1 from storage.objects where bucket_id='ride-avatars' and name=upload.path
    and jsonb_typeof(metadata->'size')='number' and (metadata->>'size')::numeric between 1 and 1048576 and metadata->>'mimetype'=upload.mime)
    then raise exception 'AVATAR_INVALID_OBJECT' using errcode='22023'; end if;
  update public.rs_avatar_uploads set state='obsolete' where upload_id=current.avatar_id;
  update public.rs_avatar_uploads set state='committed' where upload_id=upload.upload_id;
  update public.rs_profile_avatars set avatar_id=p_id,revision=revision+1 where user_id=uid returning * into current;
  return to_jsonb(current)-'user_id';
end $$;
create function public.rs_avatar_for_view(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor(); result jsonb;
begin
  if not ride_private.account_active(p_owner) or (p_owner<>uid and not ride_private.friends(p_owner,uid))
    or not exists(select 1 from public.rs_profiles where user_id=p_owner) then return null; end if;
  select jsonb_build_object('avatar_id',a.avatar_id,'path',u.path) into result
    from public.rs_profile_avatars a left join public.rs_avatar_uploads u on u.upload_id=a.avatar_id and u.state='committed' where a.user_id=p_owner;
  return coalesce(result,jsonb_build_object('avatar_id',null,'path',null));
end $$;
create function public.rs_avatar_cleanup_objects(p_owner uuid) returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('bucket','ride-avatars','path',x.path)),'[]'::jsonb) from (
    select u.path from public.rs_avatar_uploads u join storage.objects o on o.bucket_id='ride-avatars' and o.name=u.path
    where u.owner_id=p_owner and (u.state='obsolete' or (u.state='reserved' and u.expires_at<now()))
      and not exists(select 1 from public.rs_profile_avatars a where a.avatar_id=u.upload_id) order by u.path limit 20
  ) x
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ride-avatars','ride-avatars',false,1048576,array['image/jpeg','image/png','image/webp']);
create function ride_private.can_upload_avatar(object_path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then return false; end if;
  perform ride_private.account_lock(uid);
  return ride_private.account_active(uid) and exists(select 1 from public.rs_avatar_uploads where owner_id=uid and path=object_path and state='reserved' and expires_at>now());
end $$;
create policy rs_avatar_insert on storage.objects for insert to authenticated with check(bucket_id='ride-avatars' and ride_private.can_upload_avatar(name));
create policy rs_avatar_read on storage.objects for select to authenticated using(bucket_id='ride-avatars' and ride_private.account_active(auth.uid()) and exists(select 1 from public.rs_avatar_uploads where owner_id=auth.uid() and path=name));
-- There is deliberately no client UPDATE/upsert or DELETE policy for avatars.
-- Replacement/abandonment cleanup uses the service API and server-issued paths.

create or replace function ride_private.can_upload_post(path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then return false; end if;
  perform ride_private.account_lock(uid);
  return ride_private.account_active(uid) and exists(select 1 from public.rs_posts p where p.owner_id=uid and p.deleted_at is null and p.moderation_state<>'hidden'
    and path ~ ('^'||uid::text||'/'||p.id::text||'/[a-f0-9-]+\.(jpg|jpeg|png|webp)$'));
end $$;
create function ride_private.can_upload_evidence(path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid(); creator uuid; lock_uid uuid;
begin
  select c.creator_id into creator from public.rs_submissions s join public.rs_challenges c on c.id=s.challenge_id where s.evidence_path=path and s.owner_id=uid;
  if uid is null or creator is null then return false; end if;
  -- A creator's deletion also removes other owners' challenge evidence. Acquire
  -- both account fences in UUID order, then recheck using a fresh SQL snapshot.
  for lock_uid in select distinct x from unnest(array[uid,creator]) x order by x loop perform ride_private.account_lock(lock_uid); end loop;
  return ride_private.account_active(uid) and ride_private.account_active(creator) and exists(select 1 from public.rs_submissions where evidence_path=path and owner_id=uid and state='pending_upload');
end $$;
drop policy rs_evidence_insert on storage.objects;
create policy rs_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='ride-evidence' and ride_private.can_upload_evidence(name));

create function public.rs_begin_account_deletion(p_owner uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare job ride_private.account_deletion_jobs;
begin
  if p_owner is null or p_request is null then raise exception 'DELETION_INVALID_REQUEST' using errcode='22023'; end if;
  perform ride_private.account_lock(p_owner);
  select * into job from ride_private.account_deletion_jobs where owner_id=p_owner for update;
  if found then
    if job.request_id<>p_request then raise exception 'DELETION_REQUEST_CONFLICT' using errcode='P0001'; end if;
    if job.state='deleted' then return jsonb_build_object('state','deleted','request_id',job.request_id); end if;
    if job.lease_until>now() then raise exception 'DELETION_IN_PROGRESS' using errcode='P0001'; end if;
  else
    if not exists(select 1 from auth.users where id=p_owner) then raise exception 'DELETION_ACCOUNT_UNAVAILABLE' using errcode='P0001'; end if;
    insert into ride_private.account_deletion_jobs(owner_id,request_id) values(p_owner,p_request);
    -- Save foreign-owner paths before deleting their FK-dependent submissions.
    insert into ride_private.account_deletion_objects(owner_id,bucket,path)
      select p_owner,'ride-evidence',s.evidence_path from public.rs_submissions s join public.rs_challenges c on c.id=s.challenge_id where c.creator_id=p_owner
      on conflict do nothing;
    update public.rs_profiles set presence_opt_in=false where user_id=p_owner;
    delete from ride_private.presence_sessions where user_id=p_owner;
    update public.rs_friendships set state='removed',generation=generation+1,presence_topic=gen_random_uuid(),updated_at=now() where p_owner in(user_low,user_high);
    delete from public.rs_route_shares where recipient_id=p_owner or route_id in(select id from public.rs_routes where owner_id=p_owner);
    update public.rs_posts set moderation_state='hidden',deleted_at=coalesce(deleted_at,now()) where owner_id=p_owner;
    update public.rs_challenges set state='cancelled' where creator_id=p_owner;
    update public.rs_challenge_members set state='withdrawn',updated_at=now() where user_id=p_owner;
    update public.rs_submissions set state='rejected',rejection_reason='ACCOUNT_DELETION',verification_token=null
      where owner_id=p_owner or challenge_id in(select id from public.rs_challenges where creator_id=p_owner);
    delete from public.rs_verified_records where owner_id=p_owner or challenge_id in(select id from public.rs_challenges where creator_id=p_owner);
  end if;
  update ride_private.account_deletion_jobs set token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,last_error=null where owner_id=p_owner returning * into job;
  return jsonb_build_object('state',job.state,'request_id',job.request_id,'token',job.token);
end $$;
create function ride_private.deletion_lease(p_owner uuid,p_request uuid,p_token uuid) returns void language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from ride_private.account_deletion_jobs where owner_id=p_owner and request_id=p_request and token=p_token and lease_until>now() and state<>'deleted')
    then raise exception 'DELETION_LEASE_LOST' using errcode='P0001'; end if;
end $$;
create function public.rs_account_deletion_objects(p_owner uuid,p_request uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform ride_private.account_lock(p_owner);
  perform ride_private.deletion_lease(p_owner,p_request,p_token);
  -- Re-enumerate owner-prefix orphans and all Storage objects owned by this Auth
  -- user. Metadata is read only; actual binaries are removed via Storage API.
  insert into ride_private.account_deletion_objects(owner_id,bucket,path)
    select p_owner,bucket_id,name from storage.objects where owner_id=p_owner::text
      or (bucket_id in('ride-avatars','ride-community','ride-evidence') and starts_with(name,p_owner::text||'/')) on conflict do nothing;
  select coalesce(jsonb_agg(jsonb_build_object('bucket',x.bucket,'path',x.path)),'[]'::jsonb) into result from (
    select q.bucket,q.path from ride_private.account_deletion_objects q join storage.objects o on o.bucket_id=q.bucket and o.name=q.path
      where q.owner_id=p_owner order by q.bucket,q.path limit 100
  ) x;
  return result;
end $$;
create function public.rs_release_account_deletion(p_owner uuid,p_request uuid,p_token uuid,p_error text) returns void language plpgsql security definer set search_path='' as $$
begin
  update ride_private.account_deletion_jobs set token=null,lease_until=null,last_error=left(p_error,80)
    where owner_id=p_owner and request_id=p_request and token=p_token and state<>'deleted';
end $$;
create function public.rs_purge_account_data(p_owner uuid,p_request uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform ride_private.account_lock(p_owner);
  perform ride_private.deletion_lease(p_owner,p_request,p_token);
  if exists(select 1 from storage.objects o where o.owner_id=p_owner::text
    or (o.bucket_id in('ride-avatars','ride-community','ride-evidence') and starts_with(o.name,p_owner::text||'/'))
    or exists(select 1 from ride_private.account_deletion_objects q where q.owner_id=p_owner and q.bucket=o.bucket_id and q.path=o.name))
    then raise exception 'DELETION_ASSETS_REMAIN' using errcode='P0001'; end if;
  -- Explicitly remove other owners' dependent records/submissions before the
  -- creator/challenge cascade. Existing foundation FKs intentionally restrict it.
  delete from public.rs_verified_records where owner_id=p_owner or challenge_id in(select id from public.rs_challenges where creator_id=p_owner);
  delete from public.rs_submissions where owner_id=p_owner or challenge_id in(select id from public.rs_challenges where creator_id=p_owner);
  delete from public.rs_profiles where user_id=p_owner;
  delete from public.rs_account_state where user_id=p_owner;
  delete from ride_private.daily_quotas where user_id=p_owner;
  update ride_private.account_deletion_jobs set state='auth_pending' where owner_id=p_owner;
end $$;
create function ride_private.complete_account_deletion() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update ride_private.account_deletion_jobs set state='deleted',completed_at=now(),token=null,lease_until=null,last_error=null where owner_id=old.id and state='auth_pending';
  return old;
end $$;
-- Completing the receipt in Auth's DELETE transaction avoids a successful Auth
-- removal followed by a lost network response leaving an unfinished DB job.
create trigger rs_account_deletion_completed after delete on auth.users for each row execute function ride_private.complete_account_deletion();

alter table public.rs_account_state enable row level security;
alter table public.rs_avatar_uploads enable row level security;
alter table public.rs_profile_avatars enable row level security;
revoke all on public.rs_account_state,public.rs_avatar_uploads,public.rs_profile_avatars from public,anon,authenticated;
grant select on public.rs_account_state,public.rs_avatar_uploads,public.rs_profile_avatars to authenticated;
grant all on public.rs_account_state,public.rs_avatar_uploads,public.rs_profile_avatars to service_role;
create policy rs_account_state_read on public.rs_account_state for select to authenticated using(user_id=auth.uid());
create policy rs_avatar_uploads_read on public.rs_avatar_uploads for select to authenticated using(owner_id=auth.uid());
create policy rs_profile_avatars_read on public.rs_profile_avatars for select to authenticated using(user_id=auth.uid());

-- Restrict only new APIs; retain the foundation's already-reviewed verifier and
-- moderator grants instead of using a broad grant-every-rs-function loop.
revoke all on function ride_private.account_active(uuid),ride_private.account_lock(uuid),ride_private.actor(),ride_private.valid_account_preferences(jsonb),ride_private.can_upload_avatar(text),ride_private.can_upload_evidence(text),ride_private.can_upload_post(text),ride_private.deletion_lease(uuid,uuid,uuid),ride_private.complete_account_deletion() from public,anon,authenticated;
grant execute on function ride_private.account_active(uuid),ride_private.can_upload_avatar(text),ride_private.can_upload_evidence(text),ride_private.can_upload_post(text) to authenticated;
revoke all on function public.rs_get_account_state(),public.rs_update_account_state(integer,text,text,jsonb),public.rs_get_avatar(),public.rs_reserve_avatar(uuid,text),public.rs_commit_avatar(uuid,integer),public.rs_avatar_for_view(uuid),public.rs_avatar_cleanup_objects(uuid),public.rs_begin_account_deletion(uuid,uuid),public.rs_account_deletion_objects(uuid,uuid,uuid),public.rs_release_account_deletion(uuid,uuid,uuid,text),public.rs_purge_account_data(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rs_get_account_state(),public.rs_update_account_state(integer,text,text,jsonb),public.rs_get_avatar(),public.rs_reserve_avatar(uuid,text),public.rs_commit_avatar(uuid,integer),public.rs_avatar_for_view(uuid) to authenticated;
grant execute on function public.rs_get_account_state(),public.rs_update_account_state(integer,text,text,jsonb),public.rs_get_avatar(),public.rs_reserve_avatar(uuid,text),public.rs_commit_avatar(uuid,integer),public.rs_avatar_for_view(uuid),public.rs_avatar_cleanup_objects(uuid),public.rs_begin_account_deletion(uuid,uuid),public.rs_account_deletion_objects(uuid,uuid,uuid),public.rs_release_account_deletion(uuid,uuid,uuid,text),public.rs_purge_account_data(uuid,uuid,uuid) to service_role;
commit;
