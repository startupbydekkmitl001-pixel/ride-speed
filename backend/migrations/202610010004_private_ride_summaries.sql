-- M2 private summaries only. Never promote these client-reported values to ranks.
-- Additive after deployed 001/002/003; those sources remain immutable.
begin;

create function ride_private.ride_number(v jsonb,low numeric,high numeric,nullable boolean default false,whole boolean default false)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(case when v='null'::jsonb then nullable when jsonb_typeof(v)='number' then
    (v::text)::numeric between low and high and (not whole or trunc((v::text)::numeric)=(v::text)::numeric) else false end,false)
$$;
create function ride_private.ride_text(v jsonb,max_length integer,nullable boolean default false)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(case when v='null'::jsonb then nullable when jsonb_typeof(v)='string' then length(trim(v#>>'{}')) between 1 and max_length else false end,false)
$$;
create function ride_private.ride_utc_stamp(v jsonb) returns timestamptz language plpgsql immutable set search_path='' as $$
declare value text; instant timestamptz;
begin
  value:=v#>>'{}';
  if jsonb_typeof(v) is distinct from 'string' or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,3})?Z$' then raise exception 'invalid'; end if;
  instant:=value::timestamptz;
  if instant<'1970-01-01T00:00:00Z'::timestamptz or instant>'2100-12-31T23:59:59Z'::timestamptz then raise exception 'invalid'; end if;
  return instant;
exception when others then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023';
end $$;

-- Decode without creating GPS rows. Bound strings/coordinate pairs/varints before
-- arithmetic grows, and restart latitude/longitude for every disconnected part.
create function ride_private.ride_polyline_points(encoded text) returns integer language plpgsql immutable set search_path='' as $$
declare cursor integer:=0; points integer:=0; axis integer; count_groups integer; digit integer;
  unsigned bigint; delta bigint; shift_bits integer; lat bigint:=0; lng bigint:=0;bytes bytea;size integer;
begin
  if encoded is null or encoded='' or octet_length(encoded)>65536 then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  bytes:=convert_to(encoded,'UTF8');size:=octet_length(bytes);
  while cursor<size loop
    for axis in 1..2 loop
      unsigned:=0; shift_bits:=0; count_groups:=0;
      loop
        if cursor>=size then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
        digit:=get_byte(bytes,cursor)-63; cursor:=cursor+1;count_groups:=count_groups+1;
        if digit<0 or digit>63 or count_groups>7 then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
        unsigned:=unsigned|((digit&31)::bigint<<shift_bits);
        if digit<32 then exit; end if;shift_bits:=shift_bits+5;
      end loop;
      if (count_groups>1 and digit=0) or unsigned>4294967295 then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
      delta:=case when (unsigned&1)=1 then -(unsigned>>1)-1 else unsigned>>1 end;
      if axis=1 then lat:=lat+delta; else lng:=lng+delta; end if;
    end loop;
    if lat not between -9000000 and 9000000 or lng not between -18000000 and 18000000 then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
    points:=points+1;
    if points>4096 then raise exception 'RIDE_SUMMARY_TOO_LARGE' using errcode='22023'; end if;
  end loop;
  return points;
end $$;

create function ride_private.validate_ride_summary(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
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
      or jsonb_typeof(v->'powertrain')<>'string' or v->>'powertrain' not in('petrol','hybrid','electric','unknown')
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

create function ride_private.ride_vehicle_class(v jsonb) returns text language sql immutable set search_path='' as $$
  select case when v='null'::jsonb then 'unknown'
    when v->>'powertrain'='electric' then (v->>'category')||':ev'
    when v->>'engine_cc' is null or v->>'category'='car' then (v->>'category')||':unknown'
    when v->>'category'='scooter' then 'scooter:'||case when (v->>'engine_cc')::numeric<=125 then 'le125' when (v->>'engine_cc')::numeric<=160 then 'gt125_le160' else 'gt160' end
    else 'motorcycle:'||case when (v->>'engine_cc')::numeric<=500 then 'le500' when (v->>'engine_cc')::numeric<=900 then 'gt500_le900' else 'gt900' end end
$$;

create table public.rs_rides (
  id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check(revision>0),payload jsonb not null,schema_version integer not null default 1 check(schema_version=1),
  started_at timestamptz not null,ended_at timestamptz not null,
  category text check(category in('scooter','motorcycle','car')),class_key text not null,class_scheme_version integer not null default 1 check(class_scheme_version=1),
  metadata_authority text not null default 'self_reported' check(metadata_authority='self_reported'),
  speed_status text not null default 'self_reported' check(speed_status='self_reported'),visibility text not null default 'private' check(visibility='private'),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index rs_rides_owner_history on public.rs_rides(owner_id,ended_at desc,id);
create table ride_private.ride_summary_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,
  ride_id uuid not null references public.rs_rides(id) on delete cascade,
  expected_revision integer not null check(expected_revision>=0),applied_revision integer not null check(applied_revision=expected_revision+1),
  payload jsonb not null,payload_sha256 text not null check(payload_sha256~'^[a-f0-9]{64}$'),synced_at timestamptz not null default now(),
  primary key(owner_id,operation_id)
);
alter table public.rs_rides enable row level security;
alter table ride_private.ride_summary_operations enable row level security;
revoke all on public.rs_rides,ride_private.ride_summary_operations from public,anon,authenticated;
grant select on public.rs_rides to authenticated;
grant all on public.rs_rides to service_role;
create policy rs_rides_owner_read on public.rs_rides for select to authenticated using(owner_id=auth.uid() and ride_private.account_active(auth.uid()));

create function ride_private.ride_sync_ack(p_owner uuid,p_operation uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('operation_id',o.operation_id,'ride_id',o.ride_id,'applied_revision',o.applied_revision,'current_revision',r.revision,
    'payload_sha256',o.payload_sha256,'speed_status','self_reported','visibility','private','synced_at',o.synced_at)
    from ride_private.ride_summary_operations o join public.rs_rides r on r.id=o.ride_id and r.owner_id=o.owner_id where o.owner_id=p_owner and o.operation_id=p_operation
$$;
create function public.rs_sync_ride_summary(p_operation uuid,p_ride uuid,p_expected_revision integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();p jsonb;receipt ride_private.ride_summary_operations;current public.rs_rides;
begin
  if p_operation is null or p_ride is null or p_expected_revision is null or p_expected_revision not between 0 and 2147483646 then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  p:=ride_private.validate_ride_summary(p_payload);
  select * into receipt from ride_private.ride_summary_operations where owner_id=actor and operation_id=p_operation;
  if found then
    if receipt.ride_id<>p_ride or receipt.expected_revision<>p_expected_revision or receipt.payload<>p then raise exception 'RIDE_OPERATION_CONFLICT' using errcode='P0001'; end if;
    return ride_private.ride_sync_ack(actor,p_operation);
  end if;
  select * into current from public.rs_rides where id=p_ride and owner_id=actor for update;
  if not found then
    if exists(select 1 from public.rs_rides where id=p_ride) then raise exception 'RIDE_UNAVAILABLE' using errcode='42501'; end if;
    if p_expected_revision<>0 then raise exception 'RIDE_REVISION_CONFLICT' using errcode='P0001'; end if;
    perform ride_private.quota('ride_summary',100);
    begin
      insert into public.rs_rides(id,owner_id,revision,payload,started_at,ended_at,category,class_key)
        values(p_ride,actor,1,p,ride_private.ride_utc_stamp(p->'started_at'),ride_private.ride_utc_stamp(p->'ended_at'),p->'vehicle'->>'category',ride_private.ride_vehicle_class(p->'vehicle'));
    exception when unique_violation then raise exception 'RIDE_UNAVAILABLE' using errcode='42501'; end;
  else
    if current.revision<>p_expected_revision then raise exception 'RIDE_REVISION_CONFLICT' using errcode='P0001'; end if;
    if current.payload->'vehicle'<>p->'vehicle' or current.started_at<>ride_private.ride_utc_stamp(p->'started_at') or current.schema_version<>(p->>'schema_version')::integer then raise exception 'RIDE_SNAPSHOT_CONFLICT' using errcode='P0001'; end if;
    perform ride_private.quota('ride_summary',100);
    update public.rs_rides set payload=p,revision=revision+1,ended_at=ride_private.ride_utc_stamp(p->'ended_at'),updated_at=now() where id=p_ride;
  end if;
  insert into ride_private.ride_summary_operations(owner_id,operation_id,ride_id,expected_revision,applied_revision,payload,payload_sha256)
    values(actor,p_operation,p_ride,p_expected_revision,p_expected_revision+1,p,encode(sha256(convert_to(p::text,'UTF8')),'hex'));
  return ride_private.ride_sync_ack(actor,p_operation);
end $$;
create function public.rs_get_ride_sync_status(p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();
begin
  if p_operation is null then raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023'; end if;
  return ride_private.ride_sync_ack(actor,p_operation);
end $$;

-- Keyset owner history supports installs on a second device without exposing
-- raw receipts, proof bytes, private operation IDs or another owner's rows.
create function public.rs_list_ride_summaries(p_limit integer default 20,p_before_end timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();items jsonb;more boolean;cursor jsonb:='null';
begin
  if p_limit is null or p_limit not between 1 and 50 or (p_before_end is null) is distinct from (p_before_id is null)
    or (p_before_end is not null and (not isfinite(p_before_end) or p_before_end<'1970-01-01T00:00:00Z'::timestamptz or p_before_end>'2100-12-31T23:59:59Z'::timestamptz)) then
    raise exception 'RIDE_SUMMARY_INVALID' using errcode='22023';
  end if;
  with page as (
    select r.*,row_number() over(order by r.ended_at desc,r.id desc) as position from public.rs_rides r where r.owner_id=actor
      and (p_before_end is null or (r.ended_at,r.id)<(p_before_end,p_before_id)) order by r.ended_at desc,r.id desc limit p_limit+1
  ) select coalesce(jsonb_agg(jsonb_build_object('ride_id',id,'revision',revision,'payload',payload,'category',category,'class_key',class_key,
      'class_scheme_version',class_scheme_version,'metadata_authority',metadata_authority,'speed_status',speed_status,'visibility',visibility,
      'created_at',created_at,'updated_at',updated_at) order by position) filter(where position<=p_limit),'[]'::jsonb),count(*)>p_limit
      into items,more from page;
  if more then cursor:=jsonb_build_object('ended_at',items->(p_limit-1)->'payload'->'ended_at','ride_id',items->(p_limit-1)->'ride_id'); end if;
  return jsonb_build_object('items',items,'next_cursor',cursor);
end $$;

-- Preserve binary-first deletion, token fencing and foreign challenge cleanup.
-- Auth-only ride owners need explicit summary purge before final Auth removal.
create or replace function public.rs_purge_account_data(p_owner uuid,p_request uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform ride_private.account_lock(p_owner);perform ride_private.deletion_lease(p_owner,p_request,p_token);
  if exists(select 1 from storage.objects o where o.owner_id=p_owner::text
    or (o.bucket_id in('ride-avatars','ride-community','ride-evidence') and starts_with(o.name,p_owner::text||'/'))
    or exists(select 1 from ride_private.account_deletion_objects q where q.owner_id=p_owner and q.bucket=o.bucket_id and q.path=o.name)) then raise exception 'DELETION_ASSETS_REMAIN' using errcode='P0001'; end if;
  delete from public.rs_verified_records where owner_id=p_owner or challenge_id in(select id from public.rs_challenges where creator_id=p_owner);
  delete from public.rs_submissions where owner_id=p_owner or challenge_id in(select id from public.rs_challenges where creator_id=p_owner);
  delete from ride_private.ride_summary_operations where owner_id=p_owner;
  delete from public.rs_rides where owner_id=p_owner;
  delete from public.rs_profiles where user_id=p_owner;
  delete from public.rs_account_state where user_id=p_owner;
  delete from ride_private.daily_quotas where user_id=p_owner;
  update ride_private.account_deletion_jobs set state='auth_pending' where owner_id=p_owner;
end $$;
revoke all on function ride_private.ride_number(jsonb,numeric,numeric,boolean,boolean),ride_private.ride_text(jsonb,integer,boolean),ride_private.ride_utc_stamp(jsonb),ride_private.ride_polyline_points(text),ride_private.validate_ride_summary(jsonb),ride_private.ride_vehicle_class(jsonb),ride_private.ride_sync_ack(uuid,uuid) from public,anon,authenticated;
revoke all on function public.rs_sync_ride_summary(uuid,uuid,integer,jsonb),public.rs_get_ride_sync_status(uuid),public.rs_list_ride_summaries(integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.rs_sync_ride_summary(uuid,uuid,integer,jsonb),public.rs_get_ride_sync_status(uuid),public.rs_list_ride_summaries(integer,timestamptz,uuid) to authenticated,service_role;
commit;
