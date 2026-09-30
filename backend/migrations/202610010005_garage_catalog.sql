-- M3 owner garage documents and private, reservation-bound vehicle photos.
-- Catalog metadata and every client-entered spec remain noncompetitive hints.
-- Additive after deployed 001–004. Do not rewrite those migration sources.
begin;

create function ride_private.garage_text(v jsonb,max_length integer,nullable boolean default false)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(case when v='null'::jsonb then nullable when jsonb_typeof(v)='string' then
 length(v#>>'{}') between 1 and max_length and length(trim(v#>>'{}'))>0 and (v#>>'{}') !~ '[[:cntrl:]]' else false end,false)
$$;
create function ride_private.validate_garage(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare v jsonb;keys text[]:=array['id','catalogId','category','brand','model','variant','year','engineCc','motorPowerKw','powertrain','nickname','color','photoPath'];seen text[]:=array[]::text[];
begin
 if p is null or jsonb_typeof(p)<>'object' then raise exception 'GARAGE_INVALID' using errcode='22023';end if;
 if octet_length(p::text)>524288 then raise exception 'GARAGE_TOO_LARGE' using errcode='22023';end if;
 if not p?&array['schema_version','vehicles','selectedVehicleId'] or p-array['schema_version','vehicles','selectedVehicleId']<>'{}'::jsonb
 or p->'schema_version'<>'1'::jsonb or jsonb_typeof(p->'vehicles')<>'array' or not ride_private.garage_text(p->'selectedVehicleId',100,true) then raise exception 'GARAGE_INVALID' using errcode='22023';end if;
 if jsonb_array_length(p->'vehicles')>200 then raise exception 'GARAGE_TOO_LARGE' using errcode='22023';end if;
 for v in select value from jsonb_array_elements(p->'vehicles') loop
  if jsonb_typeof(v)<>'object' or not v?&keys or v-keys<>'{}'::jsonb
  or not ride_private.garage_text(v->'id',100) or not ride_private.garage_text(v->'catalogId',100,true)
  or not ride_private.garage_text(v->'brand',80) or not ride_private.garage_text(v->'model',100)
  or not ride_private.garage_text(v->'variant',100,true) or not ride_private.garage_text(v->'year',30,true)
  or not ride_private.garage_text(v->'nickname',80,true) or not ride_private.garage_text(v->'color',7,true)
  or not ride_private.garage_text(v->'photoPath',100,true)
  or jsonb_typeof(v->'category')<>'string' or v->>'category' not in('scooter','bigbike','car')
  or (v->'powertrain'<>'null'::jsonb and (jsonb_typeof(v->'powertrain')<>'string' or v->>'powertrain' not in('petrol','diesel','hybrid','electric')))
  or not ride_private.ride_number(v->'engineCc',0.01,10000,true) or not ride_private.ride_number(v->'motorPowerKw',0.01,2000,true)
  or (v->>'powertrain'='electric' and v->'engineCc'<>'null'::jsonb)
  or (v->'color'<>'null'::jsonb and v->>'color' !~ '^#[a-fA-F0-9]{6}$')
  or (v->'photoPath'<>'null'::jsonb and v->>'photoPath' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$')
  or v->>'id'=any(seen) then raise exception 'GARAGE_INVALID' using errcode='22023';end if;
  seen:=array_append(seen,v->>'id');
 end loop;
 if p->'selectedVehicleId'<>'null'::jsonb and not (p->>'selectedVehicleId'=any(seen)) then raise exception 'GARAGE_INVALID' using errcode='22023';end if;
 return p;
end $$;

create table public.rs_garages(
 owner_id uuid primary key references auth.users(id) on delete cascade,revision integer not null check(revision>0),
 document jsonb not null,updated_at timestamptz not null default now()
);
create table ride_private.garage_operations(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,
 expected_revision integer not null check(expected_revision>=0),applied_revision integer not null check(applied_revision=expected_revision+1),
 document jsonb not null,document_sha256 text not null check(document_sha256~'^[a-f0-9]{64}$'),synced_at timestamptz not null default now(),primary key(owner_id,operation_id)
);
create table public.rs_vehicle_photo_uploads(
 upload_id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,vehicle_id text not null,
 path text not null unique,mime text not null check(mime in('image/jpeg','image/png','image/webp')),
 state text not null default 'reserved' check(state in('reserved','committed','obsolete')),
 expires_at timestamptz not null default now()+interval '1 hour',created_at timestamptz not null default now()
);
create index rs_vehicle_photo_owner on public.rs_vehicle_photo_uploads(owner_id,state,expires_at);
-- Populated only by the reviewed official-source seed, never by a client.
create table public.rs_vehicle_catalog(
 id text primary key check(length(id) between 1 and 100),category text not null check(category in('scooter','bigbike','car')),
 metadata jsonb not null check(jsonb_typeof(metadata)='object'),updated_at timestamptz not null default now()
);
alter table public.rs_garages enable row level security;
alter table ride_private.garage_operations enable row level security;
alter table public.rs_vehicle_photo_uploads enable row level security;
alter table public.rs_vehicle_catalog enable row level security;
revoke all on public.rs_garages,ride_private.garage_operations,public.rs_vehicle_photo_uploads,public.rs_vehicle_catalog from public,anon,authenticated;
grant select on public.rs_garages,public.rs_vehicle_photo_uploads,public.rs_vehicle_catalog to authenticated;
grant all on public.rs_garages,public.rs_vehicle_photo_uploads,public.rs_vehicle_catalog to service_role;
create policy rs_garages_read on public.rs_garages for select to authenticated using(owner_id=auth.uid() and ride_private.account_active(auth.uid()));
create policy rs_vehicle_photo_uploads_read on public.rs_vehicle_photo_uploads for select to authenticated using(owner_id=auth.uid() and ride_private.account_active(auth.uid()));
create policy rs_vehicle_catalog_read on public.rs_vehicle_catalog for select to authenticated using(true);

create function public.rs_get_garage() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();garage public.rs_garages;
begin
 select * into garage from public.rs_garages where owner_id=actor;
 return case when found then jsonb_build_object('revision',garage.revision,'document',garage.document,'updated_at',garage.updated_at)
 else jsonb_build_object('revision',0,'document',jsonb_build_object('schema_version',1,'vehicles',jsonb_build_array(),'selectedVehicleId',null),'updated_at',null) end;
end $$;
create function ride_private.garage_sync_ack(p_owner uuid,p_operation uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('operation_id',o.operation_id,'applied_revision',o.applied_revision,'current_revision',g.revision,'document_sha256',o.document_sha256,'synced_at',o.synced_at)
 from ride_private.garage_operations o join public.rs_garages g on g.owner_id=o.owner_id where o.owner_id=p_owner and o.operation_id=p_operation
$$;
create function public.rs_get_garage_sync_status(p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();
begin
 if p_operation is null then raise exception 'GARAGE_INVALID' using errcode='22023';end if;
 return ride_private.garage_sync_ack(actor,p_operation);
end $$;
create function public.rs_reserve_vehicle_photo(p_id uuid,p_vehicle_id text,p_mime text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();upload public.rs_vehicle_photo_uploads;ext text;
begin
 if p_id is null or not ride_private.garage_text(to_jsonb(p_vehicle_id),100) or p_mime is null or p_mime not in('image/jpeg','image/png','image/webp') then raise exception 'GARAGE_INVALID' using errcode='22023';end if;
 select * into upload from public.rs_vehicle_photo_uploads where upload_id=p_id;
 if found then
  if upload.owner_id<>actor or upload.vehicle_id<>p_vehicle_id or upload.mime<>p_mime or upload.state='obsolete' then raise exception 'GARAGE_PHOTO_UNAVAILABLE' using errcode='42501';end if;
  if upload.state='reserved' and upload.expires_at<=now() then raise exception 'GARAGE_PHOTO_EXPIRED' using errcode='P0001';end if;
 else
  perform ride_private.quota('vehicle_photo',20);
  ext:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
  begin
   insert into public.rs_vehicle_photo_uploads(upload_id,owner_id,vehicle_id,path,mime) values(p_id,actor,p_vehicle_id,actor::text||'/'||p_id::text||'.'||ext,p_mime) returning * into upload;
  exception when unique_violation then raise exception 'GARAGE_PHOTO_UNAVAILABLE' using errcode='42501';end;
 end if;
 return jsonb_build_object('upload_id',upload.upload_id,'vehicle_id',upload.vehicle_id,'state',upload.state,'bucket','vehicle-photos','path',upload.path,'expires_at',upload.expires_at);
end $$;
create function public.rs_sync_garage(p_operation uuid,p_expected_revision integer,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();doc jsonb;receipt ride_private.garage_operations;garage public.rs_garages;v jsonb;upload public.rs_vehicle_photo_uploads;paths text[]:=array[]::text[];
begin
 if p_operation is null or p_expected_revision is null or p_expected_revision not between 0 and 2147483646 then raise exception 'GARAGE_INVALID' using errcode='22023';end if;
 doc:=ride_private.validate_garage(p_document);
 select * into receipt from ride_private.garage_operations where owner_id=actor and operation_id=p_operation;
 if found then
  if receipt.expected_revision<>p_expected_revision or receipt.document<>doc then raise exception 'GARAGE_OPERATION_CONFLICT' using errcode='P0001';end if;
  return ride_private.garage_sync_ack(actor,p_operation);
 end if;
 select * into garage from public.rs_garages where owner_id=actor for update;
 if coalesce(garage.revision,0)<>p_expected_revision then raise exception 'GARAGE_REVISION_CONFLICT' using errcode='P0001';end if;
 for v in select value from jsonb_array_elements(doc->'vehicles') where value->'photoPath'<>'null'::jsonb loop
  select * into upload from public.rs_vehicle_photo_uploads where owner_id=actor and vehicle_id=v->>'id' and path=v->>'photoPath' for update;
  if not found or upload.state='obsolete' then raise exception 'GARAGE_PHOTO_UNAVAILABLE' using errcode='42501';end if;
  if upload.state='reserved' and upload.expires_at<=now() then raise exception 'GARAGE_PHOTO_EXPIRED' using errcode='P0001';end if;
  if not exists(select 1 from storage.objects where bucket_id='vehicle-photos' and name=upload.path) then raise exception 'GARAGE_PHOTO_UPLOAD_REQUIRED' using errcode='P0001';end if;
  if not exists(select 1 from storage.objects where bucket_id='vehicle-photos' and name=upload.path and jsonb_typeof(metadata->'size')='number'
   and (metadata->>'size')::numeric between 1 and 1048576 and metadata->>'mimetype'=upload.mime) then raise exception 'GARAGE_PHOTO_INVALID_OBJECT' using errcode='22023';end if;
  paths:=array_append(paths,upload.path);
 end loop;
 perform ride_private.quota('garage_sync',100);
 insert into public.rs_garages(owner_id,revision,document) values(actor,p_expected_revision+1,doc) on conflict(owner_id) do update set revision=excluded.revision,document=excluded.document,updated_at=now();
 update public.rs_vehicle_photo_uploads set state='obsolete' where owner_id=actor and state='committed' and not (path=any(paths));
 update public.rs_vehicle_photo_uploads set state='committed' where owner_id=actor and path=any(paths);
 insert into ride_private.garage_operations(owner_id,operation_id,expected_revision,applied_revision,document,document_sha256)
 values(actor,p_operation,p_expected_revision,p_expected_revision+1,doc,encode(sha256(convert_to(doc::text,'UTF8')),'hex'));
 return ride_private.garage_sync_ack(actor,p_operation);
end $$;
create function public.rs_vehicle_photo_for_view(p_vehicle_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();photo jsonb;
begin
 if not ride_private.garage_text(to_jsonb(p_vehicle_id),100) then raise exception 'GARAGE_INVALID' using errcode='22023';end if;
 select jsonb_build_object('upload_id',u.upload_id,'path',u.path) into photo from public.rs_garages g
 cross join lateral jsonb_array_elements(g.document->'vehicles') v join public.rs_vehicle_photo_uploads u on u.owner_id=g.owner_id and u.vehicle_id=v->>'id' and u.path=v->>'photoPath' and u.state='committed'
 where g.owner_id=actor and v->>'id'=p_vehicle_id;
 return photo;
end $$;
create function public.rs_vehicle_photo_cleanup_objects(p_owner uuid) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('bucket','vehicle-photos','path',x.path)),'[]'::jsonb) from(
 select u.path from public.rs_vehicle_photo_uploads u join storage.objects o on o.bucket_id='vehicle-photos' and o.name=u.path
 where u.owner_id=p_owner and (u.state='obsolete' or (u.state='reserved' and u.expires_at<=now()))
 and not exists(select 1 from public.rs_garages g cross join lateral jsonb_array_elements(g.document->'vehicles') v where g.owner_id=p_owner and v->>'photoPath'=u.path) order by u.path limit 20
 )x
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('vehicle-photos','vehicle-photos',false,1048576,array['image/jpeg','image/png','image/webp']);
create function ride_private.can_upload_vehicle_photo(object_path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null then return false;end if;perform ride_private.account_lock(actor);
 return ride_private.account_active(actor) and exists(select 1 from public.rs_vehicle_photo_uploads where owner_id=actor and path=object_path and state='reserved' and expires_at>now());
end $$;
create policy rs_vehicle_photo_insert on storage.objects for insert to authenticated with check(bucket_id='vehicle-photos' and ride_private.can_upload_vehicle_photo(name));
create policy rs_vehicle_photo_read on storage.objects for select to authenticated using(bucket_id='vehicle-photos' and ride_private.account_active(auth.uid()) and exists(select 1 from public.rs_vehicle_photo_uploads where owner_id=auth.uid() and path=name and state in('reserved','committed')));
-- No client UPDATE/upsert/DELETE. Signers and cleanup derive paths on the server.

create or replace function public.rs_account_deletion_objects(p_owner uuid,p_request uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform ride_private.account_lock(p_owner);perform ride_private.deletion_lease(p_owner,p_request,p_token);
 insert into ride_private.account_deletion_objects(owner_id,bucket,path)
 select p_owner,bucket_id,name from storage.objects where owner_id=p_owner::text
 or (bucket_id in('ride-avatars','ride-community','ride-evidence','vehicle-photos') and starts_with(name,p_owner::text||'/'))
 or (bucket_id='vehicle-photos' and exists(select 1 from public.rs_vehicle_photo_uploads u where u.owner_id=p_owner and u.path=name)) on conflict do nothing;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',x.bucket,'path',x.path)),'[]'::jsonb) into result from(
 select q.bucket,q.path from ride_private.account_deletion_objects q join storage.objects o on o.bucket_id=q.bucket and o.name=q.path
 where q.owner_id=p_owner order by q.bucket,q.path limit 100)x;
 return result;
end $$;
create or replace function public.rs_purge_account_data(p_owner uuid,p_request uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform ride_private.account_lock(p_owner);perform ride_private.deletion_lease(p_owner,p_request,p_token);
 if exists(select 1 from storage.objects o where o.owner_id=p_owner::text
 or (o.bucket_id in('ride-avatars','ride-community','ride-evidence','vehicle-photos') and starts_with(o.name,p_owner::text||'/'))
 or exists(select 1 from ride_private.account_deletion_objects q where q.owner_id=p_owner and q.bucket=o.bucket_id and q.path=o.name)) then raise exception 'DELETION_ASSETS_REMAIN' using errcode='P0001';end if;
 delete from public.rs_verified_records where owner_id=p_owner or challenge_id in(select id from public.rs_challenges where creator_id=p_owner);
 delete from public.rs_submissions where owner_id=p_owner or challenge_id in(select id from public.rs_challenges where creator_id=p_owner);
 delete from ride_private.ride_summary_operations where owner_id=p_owner;delete from public.rs_rides where owner_id=p_owner;
 delete from ride_private.garage_operations where owner_id=p_owner;delete from public.rs_garages where owner_id=p_owner;delete from public.rs_vehicle_photo_uploads where owner_id=p_owner;
 delete from public.rs_profiles where user_id=p_owner;delete from public.rs_account_state where user_id=p_owner;delete from ride_private.daily_quotas where user_id=p_owner;
 update ride_private.account_deletion_jobs set state='auth_pending' where owner_id=p_owner;
end $$;
revoke all on function ride_private.garage_text(jsonb,integer,boolean),ride_private.validate_garage(jsonb),ride_private.garage_sync_ack(uuid,uuid),ride_private.can_upload_vehicle_photo(text) from public,anon,authenticated;
grant execute on function ride_private.can_upload_vehicle_photo(text) to authenticated;
revoke all on function public.rs_get_garage(),public.rs_get_garage_sync_status(uuid),public.rs_reserve_vehicle_photo(uuid,text,text),public.rs_sync_garage(uuid,integer,jsonb),public.rs_vehicle_photo_for_view(text),public.rs_vehicle_photo_cleanup_objects(uuid) from public,anon,authenticated;
grant execute on function public.rs_get_garage(),public.rs_get_garage_sync_status(uuid),public.rs_reserve_vehicle_photo(uuid,text,text),public.rs_sync_garage(uuid,integer,jsonb),public.rs_vehicle_photo_for_view(text) to authenticated,service_role;
grant execute on function public.rs_vehicle_photo_cleanup_objects(uuid) to service_role;

-- M3 backward-compatible diesel metadata. All other M2 validation is identical.
create or replace function ride_private.validate_ride_summary(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare required text[]:=array['schema_version','started_at','ended_at','active_duration_ms','elapsed_duration_ms','clock_anomaly','distance_m','max_speed_mps','average_speed_mps','reported_provider','capture_count','accepted_fix_count','rejected_fix_count','geometry_status','vehicle','geometry'];
  v jsonb; g jsonb; fragment jsonb; fragment_keys text[]:=array['segment_id','capture_id','part_index','polyline','point_count'];
  vehicle_keys text[]:=array['local_id','catalog_id','category','brand','model','variant','year','powertrain','engine_cc','motor_kw'];
  started timestamptz; ended timestamptz; active_ms numeric; elapsed_ms numeric; distance numeric; average numeric;
  total_points integer:=0; total_bytes integer:=0; decoded_points integer; key text; fragment_identity text; seen text[]:=array[]::text[]; captures jsonb:='{}';
begin
  if p is null or jsonb_typeof(p)<>'object' then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  if octet_length(p::text)>131072 then raise exception 'RIDE_SUMMARY_TOO_LARGE' using errcode='22023'; end if;
  if not p?&required or p-required<>'{}'::jsonb or p->'schema_version'<>'1'::jsonb
    or jsonb_typeof(p->'clock_anomaly')<>'boolean' or p->>'reported_provider' not in('corelocation','expo_ios','expo_android','web','mixed')
    or jsonb_typeof(p->'reported_provider')<>'string' or p->>'geometry_status' not in('complete','simplified','unavailable') or jsonb_typeof(p->'geometry_status')<>'string'
    then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  if not ride_private.ride_number(p->'active_duration_ms',0,604800000,false,true)
    or not ride_private.ride_number(p->'elapsed_duration_ms',0,604800000,true,true)
    or not ride_private.ride_number(p->'distance_m',0,10000000,true)
    or not ride_private.ride_number(p->'max_speed_mps',0,500::numeric/3.6,true)
    or not ride_private.ride_number(p->'average_speed_mps',0,500::numeric/3.6,true)
    or not ride_private.ride_number(p->'capture_count',1,10000000,false,true)
    or not ride_private.ride_number(p->'accepted_fix_count',0,10000000,false,true)
    or not ride_private.ride_number(p->'rejected_fix_count',0,10000000,false,true)
    then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  started:=ride_private.ride_utc_stamp(p->'started_at');ended:=ride_private.ride_utc_stamp(p->'ended_at');
  active_ms:=(p->>'active_duration_ms')::numeric;elapsed_ms:=(p->>'elapsed_duration_ms')::numeric;
  distance:=(p->>'distance_m')::numeric;average:=(p->>'average_speed_mps')::numeric;
  if (p->>'clock_anomaly')::boolean then
    if p->'elapsed_duration_ms'<>'null'::jsonb then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  elsif ended<started or elapsed_ms is null or abs(elapsed_ms-extract(epoch from ended-started)*1000)>1000 or active_ms>elapsed_ms+1000 then
    raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023';
  end if;
  if average is not null and (distance is null or active_ms=0 or abs(average-distance/(active_ms/1000))>0.001) then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  if (p->>'accepted_fix_count')::integer=0 and (distance is not null or p->'max_speed_mps'<>'null'::jsonb or average is not null) then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  v:=p->'vehicle';
  if v<>'null'::jsonb then
    if jsonb_typeof(v)<>'object' or not v?&vehicle_keys or v-vehicle_keys<>'{}'::jsonb then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
    if not ride_private.ride_text(v->'local_id',100,true) or not ride_private.ride_text(v->'catalog_id',100,true)
      or not ride_private.ride_text(v->'brand',80) or not ride_private.ride_text(v->'model',100)
      or not ride_private.ride_text(v->'variant',100,true) or not ride_private.ride_text(v->'year',30,true)
      or jsonb_typeof(v->'category')<>'string' or v->>'category' not in('scooter','motorcycle','car')
      or jsonb_typeof(v->'powertrain')<>'string' or v->>'powertrain' not in('petrol','diesel','hybrid','electric','unknown')
      or not ride_private.ride_number(v->'engine_cc',0.01,10000,true) or not ride_private.ride_number(v->'motor_kw',0.01,2000,true)
      or (v->>'powertrain'='electric' and v->'engine_cc'<>'null'::jsonb) then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  end if;
  g:=p->'geometry';
  if jsonb_typeof(g)<>'object' or not g?&array['encoding','fragments'] or g-array['encoding','fragments']<>'{}'::jsonb
    or g->>'encoding'<>'polyline5' or jsonb_typeof(g->'encoding')<>'string' or jsonb_typeof(g->'fragments')<>'array' then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  if jsonb_array_length(g->'fragments')>128 then raise exception 'RIDE_SUMMARY_TOO_LARGE' using errcode='22023'; end if;
  if (p->>'geometry_status'='unavailable') is distinct from (jsonb_array_length(g->'fragments')=0) then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  for fragment in select value from jsonb_array_elements(g->'fragments') loop
    if jsonb_typeof(fragment)<>'object' or not fragment?&fragment_keys or fragment-fragment_keys<>'{}'::jsonb then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
    foreach key in array array['segment_id','capture_id'] loop
      if jsonb_typeof(fragment->key)<>'string' or fragment->>key !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
    end loop;
    if not ride_private.ride_number(fragment->'part_index',0,127,false,true) or not ride_private.ride_number(fragment->'point_count',1,10000000,false,true) or jsonb_typeof(fragment->'polyline')<>'string' then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
    total_bytes:=total_bytes+octet_length(fragment->>'polyline');
    if total_bytes>65536 then raise exception 'RIDE_SUMMARY_TOO_LARGE' using errcode='22023'; end if;
    fragment_identity:=lower(fragment->>'segment_id')||':'||(fragment->>'part_index')::integer::text;
    if fragment_identity=any(seen) or (captures?lower(fragment->>'segment_id') and captures->>lower(fragment->>'segment_id')<>lower(fragment->>'capture_id')) then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
    seen:=array_append(seen,fragment_identity);captures:=captures||jsonb_build_object(lower(fragment->>'segment_id'),lower(fragment->>'capture_id'));
    decoded_points:=ride_private.ride_polyline_points(fragment->>'polyline');
    if decoded_points<>(fragment->>'point_count')::integer then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
    total_points:=total_points+decoded_points;
    if total_points>4096 then raise exception 'RIDE_SUMMARY_TOO_LARGE' using errcode='22023'; end if;
  end loop;
  if total_points>(p->>'accepted_fix_count')::integer or (select count(distinct value) from jsonb_each_text(captures))>(p->>'capture_count')::integer then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  return p;
end $$;
commit;
