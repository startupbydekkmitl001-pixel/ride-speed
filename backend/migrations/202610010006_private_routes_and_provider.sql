-- M4: owner full geometry, sanitized projections, immutable operations and private provider cache.
-- Additive only. Existing deployed migrations are never rewritten.
begin;
create table ride_private.route_documents (
 route_id uuid primary key references public.rs_routes(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 document jsonb not null, segments jsonb not null default '[]',
 distance_m numeric, duration_s numeric, geometry_hash text, provider text not null default 'draft',
 calculated_at timestamptz, attribution text, projection jsonb not null default '[]'
);
create table ride_private.route_operations (
 owner_id uuid references auth.users(id) on delete cascade,operation_id uuid,route_id uuid not null,
 action text not null check(action in('save','delete')),expected_revision integer not null,
 document jsonb,applied_revision integer not null,document_sha256 text,synced_at timestamptz not null default now(),
 primary key(owner_id,operation_id)
);
create table ride_private.route_tombstones (
 route_id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null,deleted_at timestamptz not null default now()
);
create table ride_private.route_service_cache (
 owner_id uuid references auth.users(id) on delete cascade,request_hash text,
 request jsonb not null,result jsonb,route_token uuid unique,
 lease uuid,lease_until timestamptz,call_id uuid,expires_at timestamptz not null,
 primary key(owner_id,request_hash)
);
create table ride_private.route_service_calls (
 id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id) on delete cascade,
 units integer not null check(units between 1 and 100000),created_at timestamptz not null default now()
);
create index rs_provider_calls_time on ride_private.route_service_calls(created_at);
create index rs_owner_routes_time on public.rs_routes(owner_id,updated_at desc,id desc);
do $$declare t text;begin
 foreach t in array array['route_documents','route_operations','route_tombstones','route_service_cache','route_service_calls'] loop
 execute format('alter table ride_private.%I enable row level security',t);
 execute format('revoke all on ride_private.%I from public,anon,authenticated',t);
 end loop;
end $$;
alter table public.rs_routes add column visibility text not null default 'private' check(visibility in('private','friends','public'));
alter table public.rs_routes drop constraint rs_routes_owner_id_fkey;
alter table public.rs_routes add constraint rs_routes_owner_id_fkey foreign key(owner_id) references auth.users(id) on delete cascade;
-- Stop geometry in the public row is a sanitized projection, including [] for a hidden route.
alter table public.rs_routes drop constraint rs_routes_stops_check;
alter table public.rs_routes add constraint rs_routes_stops_safe check(jsonb_typeof(stops)='array' and jsonb_array_length(stops)<=12);
insert into ride_private.route_documents(route_id,owner_id,document)
 select id,owner_id,jsonb_build_object('schema_version',1,'title',title,'category',category,'visibility','private','stops',stops,'source',jsonb_build_object('kind','draft')) from public.rs_routes;
update public.rs_routes set stops='[]';
-- Preserve only nongeographic historical context; old snapshots cannot leak pin addresses.
update public.rs_posts set route_snapshot=jsonb_build_object('title',route_snapshot->'title','category',route_snapshot->'category','revision',route_snapshot->'revision') where route_snapshot is not null;
update public.rs_challenges set route_snapshot=jsonb_build_object('route_id',route_snapshot->'route_id','title',route_snapshot->'title','category',route_snapshot->'category','revision',route_snapshot->'revision') where route_snapshot is not null;

create function ride_private.route_coordinate(p jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object' and p?&array['latitude','longitude'] and p-array['latitude','longitude']='{}'
 and ride_private.ride_number(p->'latitude',-90,90) and ride_private.ride_number(p->'longitude',-180,180),false)
$$;
create function ride_private.route_segments(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare part jsonb;point jsonb;n integer:=0;
begin
 if p is null or jsonb_typeof(p)<>'array' or jsonb_array_length(p)>32 or octet_length(p::text)>1048576 then return false;end if;
 for part in select value from jsonb_array_elements(p) loop
 if jsonb_typeof(part)<>'array' or jsonb_array_length(part) not between 1 and 4096 then return false;end if;
 n:=n+jsonb_array_length(part);if n>10000 then return false;end if;
 for point in select value from jsonb_array_elements(part) loop if not ride_private.route_coordinate(point) then return false;end if;end loop;
 end loop;return true;
end $$;
create function ride_private.route_decode(encoded text) returns jsonb language plpgsql immutable set search_path='' as $$
declare cursor integer:=0;axis integer;digit integer;unsigned bigint;delta bigint;shift_bits integer;lat bigint:=0;lng bigint:=0;bytes bytea;size integer;out jsonb:='[]';
begin
 perform ride_private.ride_polyline_points(encoded);bytes:=convert_to(encoded,'UTF8');size:=octet_length(bytes);
 while cursor<size loop
 for axis in 1..2 loop
 unsigned:=0;shift_bits:=0;
 loop digit:=get_byte(bytes,cursor)-63;cursor:=cursor+1;unsigned:=unsigned|((digit&31)::bigint<<shift_bits);exit when digit<32;shift_bits:=shift_bits+5;end loop;
 delta:=case when(unsigned&1)=1 then -(unsigned>>1)-1 else unsigned>>1 end;
 if axis=1 then lat:=lat+delta;else lng:=lng+delta;end if;
 end loop;
 out:=out||jsonb_build_array(jsonb_build_object('latitude',lat::numeric/100000,'longitude',lng::numeric/100000));
 end loop;return out;
exception when others then raise exception 'ROUTE_INVALID' using errcode='22023';
end $$;
create function ride_private.route_distance(a jsonb,b jsonb) returns double precision language sql immutable set search_path='' as $$
 select 6371008.8*2*asin(sqrt(least(1.0,greatest(0.0,
 sin(radians((b->>'latitude')::double precision-(a->>'latitude')::double precision)/2)^2+
 cos(radians((a->>'latitude')::double precision))*cos(radians((b->>'latitude')::double precision))*sin(radians((b->>'longitude')::double precision-(a->>'longitude')::double precision)/2)^2))))
$$;
create function ride_private.route_interpolate(a jsonb,b jsonb,f double precision) returns jsonb language plpgsql immutable set search_path='' as $$
declare lat1 double precision:=radians((a->>'latitude')::double precision);lon1 double precision:=radians((a->>'longitude')::double precision);
 lat2 double precision:=radians((b->>'latitude')::double precision);lon2 double precision:=radians((b->>'longitude')::double precision);
 angle double precision:=ride_private.route_distance(a,b)/6371008.8;x double precision;y double precision;z double precision;aa double precision;bb double precision;
begin
 if f<=0 then return a;elsif f>=1 then return b;end if;
 if angle<0.0000000001 then return a;end if;
 -- Antipodal points have no unique short arc; reject rather than invent an unsafe projection.
 if abs(sin(angle))<0.0000000001 then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 aa:=sin((1-f)*angle)/sin(angle);bb:=sin(f*angle)/sin(angle);
 x:=aa*cos(lat1)*cos(lon1)+bb*cos(lat2)*cos(lon2);y:=aa*cos(lat1)*sin(lon1)+bb*cos(lat2)*sin(lon2);z:=aa*sin(lat1)+bb*sin(lat2);
 return jsonb_build_object('latitude',degrees(atan2(z,sqrt(x*x+y*y))),'longitude',degrees(atan2(y,x)));
end $$;
create function ride_private.route_trim(parts jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare part jsonb;point jsonb;previous jsonb;total double precision:=0;travelled double precision:=0;length double precision;lo double precision;hi double precision;startpoint jsonb;endpoint jsonb;out jsonb:='[]';piece jsonb;
begin
 if not ride_private.route_segments(parts) then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 for part in select value from jsonb_array_elements(parts) loop previous:=null;for point in select value from jsonb_array_elements(part) loop if previous is not null then total:=total+ride_private.route_distance(previous,point);end if;previous:=point;end loop;end loop;
 if total<=400.02 then return out;end if;
 for part in select value from jsonb_array_elements(parts) loop
 previous:=null;piece:='[]';
 for point in select value from jsonb_array_elements(part) loop
 if previous is not null then
 length:=ride_private.route_distance(previous,point);
 if length>0 and travelled+length>200.01 and travelled<total-200.01 then
 lo:=greatest(0.0,(200.01-travelled)/length);hi:=least(1.0,(total-200.01-travelled)/length);
 if hi>lo then startpoint:=ride_private.route_interpolate(previous,point,lo);endpoint:=ride_private.route_interpolate(previous,point,hi);
 if jsonb_array_length(piece)=0 or piece->(jsonb_array_length(piece)-1)<>startpoint then piece:=piece||jsonb_build_array(startpoint);end if;
 piece:=piece||jsonb_build_array(endpoint);end if;
 end if;travelled:=travelled+length;
 end if;previous:=point;
 end loop;if jsonb_array_length(piece)>=2 then out:=out||jsonb_build_array(piece);end if;
 end loop;return out;
end $$;
create function ride_private.validate_route_document(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare source jsonb;part jsonb;n integer:=0;decoded jsonb;s jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' or not p?&array['schema_version','title','category','visibility','stops','source'] or p-array['schema_version','title','category','visibility','stops','source']<>'{}'
 or p->'schema_version'<>'1' or not ride_private.garage_text(p->'title',80,false) or p->>'category' not in('scooter','motorcycle','car','bicycle') or p->>'visibility' not in('private','friends','public')
 or jsonb_typeof(p->'stops')<>'array' or jsonb_array_length(p->'stops')>12 then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 if octet_length(p::text)>524288 then raise exception 'ROUTE_TOO_LARGE' using errcode='22023';end if;
 for s in select value from jsonb_array_elements(p->'stops') loop if jsonb_typeof(s)<>'object' or not s?&array['lat','lng','label'] or s-array['lat','lng','label','place_id']<>'{}' or not ride_private.ride_number(s->'lat',-90,90) or not ride_private.ride_number(s->'lng',-180,180) or not ride_private.garage_text(s->'label',80,false) or(s?'place_id' and not ride_private.garage_text(s->'place_id',300,false)) then raise exception 'ROUTE_INVALID' using errcode='22023';end if;end loop;
 source:=p->'source';if jsonb_typeof(source)<>'object' or(source->>'kind'<>'draft' and jsonb_array_length(p->'stops')<2) then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 if source->>'kind'='road' then
 if not source?&array['kind','routeToken'] or source-array['kind','routeToken']<>'{}' or jsonb_typeof(source->'routeToken')<>'string' or source->>'routeToken' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 elsif source->>'kind'='recorded' then
 if not source?&array['kind','segments'] or source-array['kind','segments']<>'{}' or jsonb_typeof(source->'segments')<>'array' or jsonb_array_length(source->'segments') not between 1 and 32 then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 for part in select value from jsonb_array_elements(source->'segments') loop
 if jsonb_typeof(part)<>'string' then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 decoded:=ride_private.route_decode(part#>>'{}');n:=n+jsonb_array_length(decoded);if n>10000 then raise exception 'ROUTE_TOO_LARGE' using errcode='22023';end if;
 end loop;
 elsif source<>jsonb_build_object('kind','draft') then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 return p;
end $$;
create or replace function ride_private.can_view_route(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select ride_private.account_active(auth.uid()) and exists(select 1 from public.rs_routes r where r.id=rid and ride_private.account_active(r.owner_id) and(r.owner_id=auth.uid() or(not ride_private.blocked(r.owner_id,auth.uid()) and(
 r.visibility='public' or(r.visibility='friends' and ride_private.friends(r.owner_id,auth.uid())) or exists(
 select 1 from public.rs_route_shares s join public.rs_friendships f on f.user_low=least(r.owner_id,s.recipient_id) and f.user_high=greatest(r.owner_id,s.recipient_id)
 where s.route_id=r.id and s.recipient_id=auth.uid() and s.friendship_generation=f.generation and f.state='accepted')))))
$$;
create function ride_private.route_ack(uid uuid,op uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('operation_id',o.operation_id,'route_id',o.route_id,'action',o.action,'applied_revision',o.applied_revision,'current_revision',r.revision,'document_sha256',o.document_sha256,'synced_at',o.synced_at)
 from ride_private.route_operations o left join public.rs_routes r on r.id=o.route_id and r.owner_id=uid where o.owner_id=uid and o.operation_id=op
$$;
create function ride_private.route_snapshot(rid uuid,uid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'owner_id',r.owner_id,'revision',r.revision,'document',d.document,'segments',d.segments,'distanceMeters',d.distance_m,'durationSeconds',d.duration_s,'geometryHash',d.geometry_hash,'provider',d.provider,'calculatedAt',d.calculated_at,'attribution',d.attribution,'updated_at',r.updated_at)
 from public.rs_routes r join ride_private.route_documents d on d.route_id=r.id where r.id=rid and r.owner_id=uid
$$;
create function public.rs_get_route_owner(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();begin return ride_private.route_snapshot(p_id,uid);end $$;
create function public.rs_get_route_operation(p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();begin return ride_private.route_ack(uid,p_operation);end $$;
create function public.rs_list_routes_owner(p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();items jsonb;cursor jsonb;limit_count integer:=least(greatest(coalesce(p_limit,30),1),50);n integer;
begin
 if(p_before is null)<>(p_before_id is null) then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 select coalesce(jsonb_agg(x.snapshot order by x.updated_at desc,x.id desc),'[]'),count(*) into items,n from(
 select r.id,r.updated_at,ride_private.route_snapshot(r.id,uid) snapshot from public.rs_routes r where r.owner_id=uid and(p_before is null or(r.updated_at,r.id)<(p_before,p_before_id)) order by r.updated_at desc,r.id desc limit limit_count+1)x;
 if n>limit_count then items:=items-(n-1);cursor:=jsonb_build_object('updated_at',items->(limit_count-1)->'updated_at','id',items->(limit_count-1)->'id');end if;
 return jsonb_build_object('items',items,'next_cursor',cursor);
end $$;
create function public.rs_get_route_projection(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();result jsonb;
begin
 if not ride_private.can_view_route(p_id) then return null;end if;
 select jsonb_build_object('id',r.id,'owner_id',r.owner_id,'revision',r.revision,'title',r.title,'category',r.category,'visibility',r.visibility,'segments',d.projection,'geometryStatus',case when jsonb_array_length(d.projection)=0 then 'hidden' else 'trimmed' end,'privacyTrimMeters',200,'geometryHash',case when jsonb_array_length(d.projection)>0 then encode(sha256(convert_to(d.projection::text,'UTF8')),'hex') else null end,'provider',d.provider,'attribution',d.attribution)
 into result from public.rs_routes r join ride_private.route_documents d on d.route_id=r.id where r.id=p_id;return result;
end $$;
create function public.rs_save_route_v2(p_operation uuid,p_id uuid,p_expected_revision integer,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();doc jsonb;receipt ride_private.route_operations;r public.rs_routes;existing ride_private.route_documents;cache ride_private.route_service_cache;
 parts jsonb:='[]';projection jsonb;part jsonb;provider text;distance numeric;duration numeric;calculated timestamptz;attribution text;hash text;publicstops jsonb:='[]';revision integer;
begin
 if p_operation is null or p_id is null or p_expected_revision is null or p_expected_revision not between 0 and 2147483646 then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 doc:=ride_private.validate_route_document(p_document);
 select * into receipt from ride_private.route_operations where owner_id=uid and operation_id=p_operation;
 if found then if receipt.route_id<>p_id or receipt.action<>'save' or receipt.expected_revision<>p_expected_revision or receipt.document<>doc then raise exception 'ROUTE_OPERATION_CONFLICT' using errcode='P0001';end if;return ride_private.route_ack(uid,p_operation);end if;
 if exists(select 1 from ride_private.route_tombstones where route_id=p_id) then raise exception 'ROUTE_DELETED' using errcode='P0001';end if;
 select * into r from public.rs_routes where id=p_id for update;
 if(r.id is null and p_expected_revision<>0) or(r.id is not null and(r.owner_id<>uid or r.revision<>p_expected_revision)) then raise exception 'ROUTE_REVISION_CONFLICT' using errcode='P0001';end if;
 if r.id is null and(select count(*) from public.rs_routes where owner_id=uid)>=200 then raise exception 'ROUTE_TOO_LARGE' using errcode='22023';end if;
 select * into existing from ride_private.route_documents where route_id=p_id and owner_id=uid;
 if doc->'source'->>'kind'='road' then
 if existing.document->'source'=doc->'source' and existing.document->'stops'=doc->'stops' and existing.document->'category'=doc->'category' then
 parts:=existing.segments;provider:=existing.provider;distance:=existing.distance_m;duration:=existing.duration_s;calculated:=existing.calculated_at;attribution:=existing.attribution;
 else
 select * into cache from ride_private.route_service_cache where owner_id=uid and route_token=(doc->'source'->>'routeToken')::uuid and result is not null;
 if not found then raise exception 'ROUTE_SOURCE_UNAVAILABLE' using errcode='P0001';end if;
 if cache.expires_at<=now() then raise exception 'ROUTE_SOURCE_EXPIRED' using errcode='P0001';end if;
 if cache.request->>'profile'<>(case doc->>'category' when 'scooter' then 'scooter' when 'motorcycle' then 'motorcycle' when 'car' then 'drive' else 'bicycle' end)
 or cache.request->'stops'<>(select jsonb_agg(jsonb_build_object('latitude',s->'lat','longitude',s->'lng') order by ord) from jsonb_array_elements(doc->'stops') with ordinality as x(s,ord)) then raise exception 'ROUTE_SOURCE_MISMATCH' using errcode='P0001';end if;
 parts:=cache.result->'segments';provider:='geoapify';distance:=(cache.result->>'distanceMeters')::numeric;duration:=(cache.result->>'durationSeconds')::numeric;calculated:=(cache.result->>'calculatedAt')::timestamptz;attribution:=cache.result->>'attribution';
 end if;
 elsif doc->'source'->>'kind'='recorded' then
 provider:='recorded';for part in select value from jsonb_array_elements(doc->'source'->'segments') loop parts:=parts||jsonb_build_array(ride_private.route_decode(part#>>'{}'));end loop;
 else provider:='draft';end if;
 projection:=ride_private.route_trim(parts);if jsonb_array_length(parts)>0 then hash:=encode(sha256(convert_to(parts::text,'UTF8')),'hex');end if;
 if jsonb_array_length(projection)>0 then publicstops:=jsonb_build_array(jsonb_build_object('lat',projection->0->0->'latitude','lng',projection->0->0->'longitude','label','Route'),jsonb_build_object('lat',projection->(jsonb_array_length(projection)-1)->(jsonb_array_length(projection->(jsonb_array_length(projection)-1))-1)->'latitude','lng',projection->(jsonb_array_length(projection)-1)->(jsonb_array_length(projection->(jsonb_array_length(projection)-1))-1)->'longitude','label','Route'));end if;
 perform ride_private.quota('route_write',100);revision:=p_expected_revision+1;
 insert into public.rs_routes(id,owner_id,revision,title,category,stops,visibility) values(p_id,uid,revision,doc->>'title',doc->>'category',publicstops,doc->>'visibility')
 on conflict(id) do update set revision=excluded.revision,title=excluded.title,category=excluded.category,stops=excluded.stops,visibility=excluded.visibility,approved_course_id=null,approved_revision=null,updated_at=now();
 insert into ride_private.route_documents(route_id,owner_id,document,segments,distance_m,duration_s,geometry_hash,provider,calculated_at,attribution,projection)
 values(p_id,uid,doc,parts,distance,duration,hash,provider,calculated,attribution,projection)
 on conflict(route_id) do update set document=excluded.document,segments=excluded.segments,distance_m=excluded.distance_m,duration_s=excluded.duration_s,geometry_hash=excluded.geometry_hash,provider=excluded.provider,calculated_at=excluded.calculated_at,attribution=excluded.attribution,projection=excluded.projection;
 insert into ride_private.route_operations(owner_id,operation_id,route_id,action,expected_revision,document,applied_revision,document_sha256) values(uid,p_operation,p_id,'save',p_expected_revision,doc,revision,encode(sha256(convert_to(doc::text,'UTF8')),'hex'));
 return ride_private.route_ack(uid,p_operation);
end $$;
create function public.rs_delete_route_v2(p_operation uuid,p_id uuid,p_expected_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();receipt ride_private.route_operations;r public.rs_routes;
begin
 if p_operation is null or p_id is null or p_expected_revision is null or p_expected_revision not between 1 and 2147483647 then raise exception 'ROUTE_INVALID' using errcode='22023';end if;
 select * into receipt from ride_private.route_operations where owner_id=uid and operation_id=p_operation;
 if found then if receipt.route_id<>p_id or receipt.action<>'delete' or receipt.expected_revision<>p_expected_revision then raise exception 'ROUTE_OPERATION_CONFLICT' using errcode='P0001';end if;return ride_private.route_ack(uid,p_operation);end if;
 select * into r from public.rs_routes where id=p_id for update;if not found or r.owner_id<>uid or r.revision<>p_expected_revision then raise exception 'ROUTE_REVISION_CONFLICT' using errcode='P0001';end if;
 perform ride_private.quota('route_write',100);insert into ride_private.route_tombstones values(p_id,uid,p_expected_revision,now());delete from public.rs_routes where id=p_id;
 insert into ride_private.route_operations(owner_id,operation_id,route_id,action,expected_revision,applied_revision) values(uid,p_operation,p_id,'delete',p_expected_revision,p_expected_revision);
 return ride_private.route_ack(uid,p_operation);
end $$;
-- Compatibility RPCs preserve revision/course gates while saving exact private pins.
create or replace function public.rs_save_route(p_id uuid,p_expected_revision integer,p_title text,p_category text,p_stops jsonb) returns public.rs_routes language plpgsql security definer set search_path='' as $$
declare uid uuid:=ride_private.actor();rid uuid:=coalesce(p_id,gen_random_uuid());result public.rs_routes;
begin
 if not ride_private.valid_stops(p_stops) then raise exception 'route stops check constraint' using errcode='23514';end if;
 perform public.rs_save_route_v2(gen_random_uuid(),rid,p_expected_revision,jsonb_build_object('schema_version',1,'title',trim(p_title),'category',p_category,'visibility','private','stops',p_stops,'source',jsonb_build_object('kind','draft')));
 select * into result from public.rs_routes where id=rid and owner_id=uid;return result;
exception when sqlstate 'P0001' then raise exception 'Route unavailable or revision conflict' using errcode='P0001';
end $$;
create or replace function public.rs_delete_route(p_id uuid,p_expected_revision integer) returns boolean language plpgsql security definer set search_path='' as $$
begin perform public.rs_delete_route_v2(gen_random_uuid(),p_id,p_expected_revision);return true;exception when sqlstate 'P0001' then raise exception 'Route unavailable or revision conflict' using errcode='P0001';end $$;
-- Compatibility publishers bind the exact immutable safe geometry snapshot, not
-- two endpoints that would draw a false connector across a recording gap.
create function ride_private.route_safe_snapshot(rid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('route_id',r.id,'revision',r.revision,'title',r.title,'category',r.category,
 'segments',d.projection,'geometryStatus',case when jsonb_array_length(d.projection)=0 then 'hidden' else 'trimmed' end,
 'privacyTrimMeters',200,'geometryHash',case when jsonb_array_length(d.projection)>0 then encode(sha256(convert_to(d.projection::text,'UTF8')),'hex') else null end,
 'provider',d.provider,'attribution',d.attribution)
 from public.rs_routes r join ride_private.route_documents d on d.route_id=r.id where r.id=rid
$$;
create or replace function public.rs_create_challenge(p_id uuid,p_route uuid,p_revision integer,p_mode text,p_session uuid,p_starts timestamptz,p_ends timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();r public.rs_routes;s public.rs_course_sessions;
begin
 perform ride_private.quota('challenge_create',20);
 select * into r from public.rs_routes where id=p_route and owner_id=actor and revision=p_revision for share;
 if not found then raise exception 'Save your route first or refresh its revision';end if;
 if p_starts<now() or p_ends<=p_starts then raise exception 'Choose a future challenge window';end if;
 if p_mode='timed_race' then
 select * into s from public.rs_course_sessions where id=p_session and approved for share;
 if not found or r.approved_course_id is distinct from s.course_id or r.approved_revision is distinct from r.revision or p_starts<s.starts_at or p_ends>s.ends_at
 or not exists(select 1 from public.rs_courses where id=s.course_id and closed_course_approved) then raise exception 'An approved closed-course route and session are required';end if;
 elsif p_mode<>'group_ride' or p_session is not null then raise exception 'Invalid challenge mode';end if;
 insert into public.rs_challenges(id,creator_id,route_id,route_snapshot,category,mode,metric,course_session_id,starts_at,ends_at)
 values(p_id,actor,r.id,ride_private.route_safe_snapshot(r.id),r.category,p_mode,case when p_mode='timed_race' then 'sustained_speed_3s' else 'none' end,p_session,p_starts,p_ends);
 insert into public.rs_challenge_members(challenge_id,user_id,state) values(p_id,actor,'accepted');return p_id;
end $$;
create or replace function public.rs_publish_post(p_id uuid,p_caption text,p_description text,p_speed numeric,p_route uuid,p_route_revision integer,p_visibility text,p_media_path text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=ride_private.actor();p public.rs_posts;r public.rs_routes;snapshot jsonb;
begin
 select * into p from public.rs_posts where id=p_id and owner_id=actor for update;
 if not found or p.deleted_at is not null or p.moderation_state='hidden' then raise exception 'Post unavailable' using errcode='42501';end if;
 if p_route is not null then
 select * into r from public.rs_routes where id=p_route and owner_id=actor and revision=p_route_revision for share;
 if not found then raise exception 'Route unavailable or revision changed; preview the saved route again';end if;
 snapshot:=ride_private.route_safe_snapshot(r.id);
 elsif p_route_revision is not null then raise exception 'A route revision requires a route';end if;
 if p_media_path is not null and(p_media_path !~('^'||actor::text||'/'||p_id::text||'/[a-f0-9-]+\.(jpg|jpeg|png|webp)$') or not exists(select 1 from storage.objects where bucket_id='ride-community' and name=p_media_path)) then raise exception 'Upload your post image first';end if;
 update public.rs_posts set caption=p_caption,description=p_description,claimed_speed_kmh=p_speed,route_snapshot=snapshot,visibility=p_visibility,media_path=p_media_path,moderation_state='published' where id=p_id;
end $$;

create function public.rs_route_service_claim(p_owner uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cache ride_private.route_service_cache;hash text;cost integer;total integer;owner_total integer;calls integer;op text;stop jsonb;previous jsonb;distance double precision:=0;call_id uuid;request_at timestamptz;
begin
 perform ride_private.account_lock(p_owner);if not ride_private.account_active(p_owner) or not exists(select 1 from auth.users where id=p_owner) then raise exception 'ACCOUNT_DELETION_PENDING' using errcode='42501';end if;
 request_at:=clock_timestamp();
 op:=p_request->>'operation';
 if jsonb_typeof(p_request)<>'object' or p_request->'consent'<>'true'::jsonb then raise exception 'INVALID_REQUEST' using errcode='22023';end if;
 if op='search' then
 if not p_request?&array['operation','query','language','consent'] or p_request-array['operation','query','language','consent','proximity']<>'{}' or not ride_private.garage_text(p_request->'query',120,false) or length(p_request->>'query')<3 or p_request->>'language' not in('th','en') or(p_request?'proximity' and not ride_private.route_coordinate(p_request->'proximity')) then raise exception 'INVALID_REQUEST' using errcode='22023';end if;cost:=1;
 elsif op='route' then
 if not p_request?&array['operation','stops','profile','consent'] or p_request-array['operation','stops','profile','consent']<>'{}' or p_request->>'profile' not in('scooter','motorcycle','drive') or jsonb_typeof(p_request->'stops')<>'array' or jsonb_array_length(p_request->'stops') not between 2 and 12 then raise exception 'INVALID_REQUEST' using errcode='22023';end if;
 for stop in select value from jsonb_array_elements(p_request->'stops') loop if not ride_private.route_coordinate(stop) then raise exception 'INVALID_REQUEST' using errcode='22023';end if;if previous is not null then distance:=distance+ride_private.route_distance(previous,stop);end if;previous:=stop;end loop;
 if distance>200000 then raise exception 'ROUTE_DISTANCE_LIMIT' using errcode='22023';end if;cost:=3*(jsonb_array_length(p_request->'stops')-1);
 else raise exception 'INVALID_REQUEST' using errcode='22023';end if;
 hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 select * into cache from ride_private.route_service_cache where owner_id=p_owner and request_hash=hash;
 if found and cache.result is not null and cache.expires_at>request_at then return jsonb_build_object('state','cached','result',cache.result);end if;
 if found and cache.lease_until>request_at then raise exception 'THROTTLED' using errcode='P0001';end if;
 perform pg_advisory_xact_lock(hashtextextended('ride-speed-geoapify-budget-v1',0));
 -- Evaluate the sliding window after lock acquisition, not at transaction start.
 request_at:=clock_timestamp();
 select coalesce(sum(units),0)::integer,coalesce(sum(units) filter(where owner_id=p_owner),0)::integer,count(*) filter(where created_at>request_at-interval '1 second') into total,owner_total,calls from ride_private.route_service_calls where created_at>request_at-interval '24 hours';
 if total+cost>2700 or owner_total+cost>150 then raise exception 'QUOTA_EXCEEDED' using errcode='P0001';end if;
 if calls>=4 then raise exception 'THROTTLED' using errcode='P0001';end if;
 insert into ride_private.route_service_calls(owner_id,units,created_at) values(p_owner,cost,request_at) returning id into call_id;
 insert into ride_private.route_service_cache(owner_id,request_hash,request,lease,lease_until,call_id,expires_at)
 values(p_owner,hash,p_request,gen_random_uuid(),request_at+interval '30 seconds',call_id,request_at+case when op='route' then interval '7 days' else interval '24 hours' end)
 on conflict(owner_id,request_hash) do update set request=excluded.request,result=null,route_token=null,lease=excluded.lease,lease_until=excluded.lease_until,call_id=excluded.call_id,expires_at=excluded.expires_at returning * into cache;
 -- Bound cleanup per call; active reservations/results stay fenced, retained saved geometry is independent.
 delete from ride_private.route_service_cache where(owner_id,request_hash) in(select owner_id,request_hash from ride_private.route_service_cache where expires_at<request_at-interval '1 day' and coalesce(lease_until,'epoch')<request_at limit 20);
 delete from ride_private.route_service_calls where id in(select id from ride_private.route_service_calls where created_at<request_at-interval '24 hours' limit 50);
 return jsonb_build_object('state','claimed','lease',cache.lease,'requestHash',hash);
end $$;
-- Known long-distance work is charged even if the client result is later rejected.
-- This is an upward conservative estimate, not a provider billing attestation.
create function public.rs_route_service_reconcile(p_owner uuid,p_lease uuid,p_distance_m numeric) returns void language plpgsql security definer set search_path='' as $$
declare cache ride_private.route_service_cache;estimated integer;
begin
 perform ride_private.account_lock(p_owner);if not ride_private.account_active(p_owner) then raise exception 'ACCOUNT_DELETION_PENDING' using errcode='42501';end if;
 select * into cache from ride_private.route_service_cache where owner_id=p_owner and lease=p_lease and lease_until>clock_timestamp() for update;
 if not found or cache.request->>'operation'<>'route' or p_distance_m is null or p_distance_m not between 0 and 1000000000 then raise exception 'PROVIDER_UNAVAILABLE' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('ride-speed-geoapify-budget-v1',0));
 estimated:=least(100000,(jsonb_array_length(cache.request->'stops')-1)*(1+ceil(p_distance_m/500000)::integer));
 update ride_private.route_service_calls set units=greatest(units,estimated) where owner_id=p_owner and id=cache.call_id;
end $$;
create function public.rs_route_service_finish(p_owner uuid,p_lease uuid,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cache ride_private.route_service_cache;finished_result jsonb;item jsonb;
begin
 perform ride_private.account_lock(p_owner);if not ride_private.account_active(p_owner) then raise exception 'ACCOUNT_DELETION_PENDING' using errcode='42501';end if;
 select * into cache from ride_private.route_service_cache where owner_id=p_owner and lease=p_lease and lease_until>clock_timestamp() for update;if not found then raise exception 'PROVIDER_UNAVAILABLE' using errcode='P0001';end if;
 if p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>1048576 or not ride_private.garage_text(p_result->'attribution',300,false) then raise exception 'PROVIDER_UNAVAILABLE' using errcode='22023';end if;
 if cache.request->>'operation'='route' then
 if not p_result?&array['provider','profile','segments','distanceMeters','durationSeconds','calculatedAt','attribution'] or p_result-array['provider','profile','segments','distanceMeters','durationSeconds','calculatedAt','attribution']<>'{}' or p_result->>'provider'<>'geoapify' or p_result->>'profile'<>cache.request->>'profile' or not ride_private.route_segments(p_result->'segments') or jsonb_array_length(p_result->'segments')=0 or not ride_private.ride_number(p_result->'distanceMeters',0,450000) or not ride_private.ride_number(p_result->'durationSeconds',0,604800) then raise exception 'PROVIDER_UNAVAILABLE' using errcode='22023';end if;
 perform ride_private.ride_utc_stamp(p_result->'calculatedAt');
 finished_result:=p_result||jsonb_build_object('routeToken',gen_random_uuid(),'requestHash',cache.request_hash);
 else
 if not p_result?&array['items','attribution'] or p_result-array['items','attribution']<>'{}' or jsonb_typeof(p_result->'items')<>'array' or jsonb_array_length(p_result->'items')>5 then raise exception 'PROVIDER_UNAVAILABLE' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_result->'items') loop
 if not item?&array['id','label','subtitle','latitude','longitude'] or item-array['id','label','subtitle','latitude','longitude']<>'{}' or not ride_private.garage_text(item->'id',300,false) or not ride_private.garage_text(item->'label',300,false) or jsonb_typeof(item->'subtitle')<>'string' or length(item->>'subtitle')>300 or not ride_private.route_coordinate(jsonb_build_object('latitude',item->'latitude','longitude',item->'longitude')) then raise exception 'PROVIDER_UNAVAILABLE' using errcode='22023';end if;end loop;finished_result:=p_result;
 end if;
 update ride_private.route_service_cache set result=finished_result,route_token=case when cache.request->>'operation'='route' then(finished_result->>'routeToken')::uuid else null end,lease=null,lease_until=null where owner_id=p_owner and request_hash=cache.request_hash;
 return finished_result;
end $$;

revoke all on function ride_private.route_coordinate(jsonb),ride_private.route_segments(jsonb),ride_private.route_decode(text),ride_private.route_distance(jsonb,jsonb),ride_private.route_interpolate(jsonb,jsonb,double precision),ride_private.route_trim(jsonb),ride_private.validate_route_document(jsonb),ride_private.route_ack(uuid,uuid),ride_private.route_snapshot(uuid,uuid),ride_private.route_safe_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.rs_get_route_owner(uuid),public.rs_get_route_operation(uuid),public.rs_list_routes_owner(integer,timestamptz,uuid),public.rs_get_route_projection(uuid),public.rs_save_route_v2(uuid,uuid,integer,jsonb),public.rs_delete_route_v2(uuid,uuid,integer),public.rs_route_service_claim(uuid,jsonb),public.rs_route_service_finish(uuid,uuid,jsonb),public.rs_route_service_reconcile(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.rs_get_route_owner(uuid),public.rs_get_route_operation(uuid),public.rs_list_routes_owner(integer,timestamptz,uuid),public.rs_get_route_projection(uuid),public.rs_save_route_v2(uuid,uuid,integer,jsonb),public.rs_delete_route_v2(uuid,uuid,integer) to authenticated,service_role;
grant execute on function public.rs_route_service_claim(uuid,jsonb),public.rs_route_service_finish(uuid,uuid,jsonb),public.rs_route_service_reconcile(uuid,uuid,numeric) to service_role;

-- Extend binary-first deletion without changing the already deployed M3 definition.
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
 delete from public.rs_profiles where user_id=p_owner;delete from public.rs_account_state where user_id=p_owner;delete from ride_private.daily_quotas where user_id=p_owner;
 update ride_private.account_deletion_jobs set state='auth_pending' where owner_id=p_owner;
end $$;
commit;
