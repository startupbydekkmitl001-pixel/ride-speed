-- M7: immutable community content, current-parent ACL, bounded private media.
-- Deployed001–010 remain immutable. Ordinary ride summaries never become proof.
begin;
create table ride_private.community_posts(
 post_id uuid primary key references public.rs_posts(id) on delete cascade,
 content_version integer not null check(content_version in(0,1)),content_revision integer not null default 0 check(content_revision>=0),
 engagement_revision integer not null default 0 check(engagement_revision>=0),document jsonb,
 ride_snapshot jsonb,route_snapshot jsonb,media_ids jsonb not null default '[]',updated_at timestamptz not null default clock_timestamp()
);
create table ride_private.community_media(
 media_id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 post_id uuid not null references public.rs_posts(id) on delete cascade,bucket text not null,path text not null,
 validation text not null check(validation in('legacy_unverified','decoded_jpeg_v1')),
 state text not null check(state in('reserved','committed','obsolete','invalid')),
 declared jsonb,descriptor jsonb not null,expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),committed_at timestamptz,
 processing_token uuid,processing_until timestamptz,unique(bucket,path)
);
create table ride_private.community_operations(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,
 request jsonb not null,result jsonb not null,applied_at timestamptz not null default clock_timestamp(),primary key(owner_id,operation_id)
);
create table ride_private.community_likes(post_id uuid references public.rs_posts(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz not null default clock_timestamp(),primary key(post_id,user_id));
create table ride_private.community_saves(post_id uuid references public.rs_posts(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,primary key(post_id,user_id));
create table ride_private.community_comments(comment_id uuid primary key,post_id uuid not null references public.rs_posts(id) on delete cascade,owner_id uuid not null references auth.users(id) on delete cascade,body text not null check(length(body) between 1 and 1000),created_at timestamptz not null default clock_timestamp(),deleted_at timestamptz);
create table ride_private.community_reports(report_id uuid primary key default gen_random_uuid(),post_id uuid not null references public.rs_posts(id) on delete cascade,comment_id uuid references ride_private.community_comments(comment_id) on delete cascade,reporter_id uuid not null references auth.users(id) on delete cascade,reason text not null,detail text not null,created_at timestamptz not null default clock_timestamp());
create unique index community_report_target on ride_private.community_reports(post_id,reporter_id,coalesce(comment_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table ride_private.community_media_cleanup(bucket text not null,path text not null,owner_id uuid not null,media_id uuid,eligible_at timestamptz not null,token uuid,lease_until timestamptz,primary key(bucket,path));
create index community_comments_page on ride_private.community_comments(post_id,created_at,comment_id);
create index community_media_owner on ride_private.community_media(owner_id,post_id);
create index community_likes_week on ride_private.community_likes(created_at,post_id);
do $$declare t text;begin foreach t in array array['community_posts','community_media','community_operations','community_likes','community_saves','community_comments','community_reports','community_media_cleanup'] loop
 execute format('alter table ride_private.%I enable row level security',t);execute format('revoke all on ride_private.%I from public,anon,authenticated,service_role',t);
end loop;end$$;

-- Only genuine legacy rows are migrated. Legacy image metadata has no invented
-- digest, dimensions, BlurHash or pixel-validation provenance.
insert into ride_private.community_posts(post_id,content_version,content_revision,engagement_revision,updated_at,route_snapshot)
 select id,0,case when moderation_state='draft' then 0 else 1 end,case when moderation_state='draft' then 0 else 1 end,created_at,
 case when route_snapshot is not null and route_snapshot->>'category' in('scooter','motorcycle','car','bicycle') and coalesce(route_snapshot->>'revision','')~'^[1-9][0-9]{0,9}$' and(route_snapshot->>'revision')::numeric<=2147483647 and length(coalesce(route_snapshot->>'title','')) between 1 and 120 and(route_snapshot->>'title')!~'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then
 jsonb_build_object('source','legacy','source_id',null,'source_revision',(route_snapshot->>'revision')::integer,'title',route_snapshot->>'title','category',route_snapshot->>'category','segments','[]'::jsonb,'geometryStatus','unavailable','privacyTrimMeters',null,'geometryHash',null,'provider','unknown','attribution',null) else null end from public.rs_posts;
insert into ride_private.community_media(media_id,owner_id,post_id,bucket,path,validation,state,descriptor,expires_at,committed_at)
 select gen_random_uuid(),owner_id,id,'ride-community',media_path,'legacy_unverified','committed',
 jsonb_build_object('mime',case when lower(media_path)~'\.png$' then 'image/png' when lower(media_path)~'\.webp$' then 'image/webp' else 'image/jpeg' end,'sha256',null,'byte_count',null,'width',null,'height',null,'blurhash',null),'infinity',created_at
 from public.rs_posts where media_path is not null;
update ride_private.community_posts p set media_ids=jsonb_build_array(m.media_id) from ride_private.community_media m where m.post_id=p.post_id;
-- Trusted legacy content produced after upgrade stays readable. Only the
-- explicit canonical reservation changes its new draft to content_version1.
create function ride_private.community_legacy_projection() returns trigger language plpgsql security definer set search_path='' as $$declare route_value jsonb;asset uuid;begin
 if exists(select 1 from ride_private.community_posts where post_id=new.id and content_version=1) then return new;end if;
 if new.route_snapshot is not null and new.route_snapshot->>'category' in('scooter','motorcycle','car','bicycle') and coalesce(new.route_snapshot->>'revision','')~'^[1-9][0-9]{0,9}$' and(new.route_snapshot->>'revision')::numeric<=2147483647 and length(coalesce(new.route_snapshot->>'title','')) between 1 and 120 and(new.route_snapshot->>'title')!~'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then route_value:=jsonb_build_object('source','legacy','source_id',null,'source_revision',(new.route_snapshot->>'revision')::integer,'title',new.route_snapshot->>'title','category',new.route_snapshot->>'category','segments','[]'::jsonb,'geometryStatus','unavailable','privacyTrimMeters',null,'geometryHash',null,'provider','unknown','attribution',null);end if;
 if new.media_path is not null then
  select media_id into asset from ride_private.community_media where bucket='ride-community' and path=new.media_path and owner_id=new.owner_id and post_id=new.id;
  if asset is null then asset:=gen_random_uuid();insert into ride_private.community_media(media_id,owner_id,post_id,bucket,path,validation,state,descriptor,expires_at,committed_at) values(asset,new.owner_id,new.id,'ride-community',new.media_path,'legacy_unverified','committed',jsonb_build_object('mime',case when lower(new.media_path)~'\.png$' then 'image/png' when lower(new.media_path)~'\.webp$' then 'image/webp' else 'image/jpeg' end,'sha256',null,'byte_count',null,'width',null,'height',null,'blurhash',null),'infinity',clock_timestamp());end if;
 end if;
 insert into ride_private.community_posts(post_id,content_version,content_revision,engagement_revision,route_snapshot,media_ids,updated_at) values(new.id,0,case when new.moderation_state='draft' then 0 else 1 end,case when new.moderation_state='draft' then 0 else 1 end,route_value,case when asset is null then '[]'::jsonb else jsonb_build_array(asset) end,clock_timestamp()) on conflict(post_id) do update set content_revision=case when new.moderation_state='draft' then ride_private.community_posts.content_revision else least(2147483647::bigint,ride_private.community_posts.content_revision::bigint+1)::integer end,engagement_revision=greatest(ride_private.community_posts.engagement_revision,1),route_snapshot=excluded.route_snapshot,media_ids=excluded.media_ids,updated_at=excluded.updated_at;
 return new;
end$$;
create trigger rs_community_legacy_projection after insert or update on public.rs_posts for each row execute function ride_private.community_legacy_projection();

create function ride_private.community_reject(code text) returns void language plpgsql immutable set search_path='' as $$begin raise exception '%',code using errcode='CM001';end$$;
create function ride_private.community_error(code text,retry integer default null) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('error',case when code='COMMUNITY_RATE_LIMITED' then jsonb_build_object('code',code,'retry_after_ms',retry) else jsonb_build_object('code',code) end)$$;
create function ride_private.community_actor() returns uuid language plpgsql volatile set search_path='' as $$declare uid uuid:=auth.uid();begin
 if uid is null then perform ride_private.community_reject('COMMUNITY_AUTH_REQUIRED');end if;
 perform ride_private.account_lock(uid);perform ride_private.live_control_lock();
 if not ride_private.account_active(uid) then perform ride_private.community_reject('ACCOUNT_DELETION_PENDING');end if;return uid;
end$$;
create function ride_private.community_text(v jsonb,limit_count integer,nonempty boolean default false) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and length(v#>>'{}')<=limit_count and(not nonempty or length(trim(v#>>'{}'))>0) and(v#>>'{}')!~'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]',false)
$$;
create function ride_private.community_binding(v jsonb,kind text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(v='null'::jsonb or(jsonb_typeof(v)='object' and v?&array[kind||'_id',kind||'_revision'] and v-array[kind||'_id',kind||'_revision']='{}' and ride_private.race_uuid(v->(kind||'_id')) and ride_private.ride_number(v->(kind||'_revision'),1,2147483647,false,true)),false)
$$;
create function ride_private.community_can_view(uid uuid,pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select ride_private.account_active(uid) and exists(select 1 from public.rs_posts p where p.id=pid and ride_private.account_active(p.owner_id) and p.deleted_at is null and p.moderation_state='published' and(p.owner_id=uid or(not ride_private.blocked(p.owner_id,uid) and(p.visibility='community' or(p.visibility='friends' and ride_private.friends(p.owner_id,uid))))) )
$$;
create function ride_private.community_child_visible(uid uuid,post_owner uuid,child_owner uuid) returns boolean language sql stable security definer set search_path='' as $$select ride_private.account_active(child_owner) and not ride_private.blocked(post_owner,child_owner) and not ride_private.blocked(uid,child_owner)$$;
create function ride_private.community_profile(uid uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('name',coalesce(nullif(trim(regexp_replace(display_name,'[[:cntrl:]]','','g')),''),handle),'handle',handle) from public.rs_profiles where user_id=uid
$$;
create function ride_private.community_counts(uid uuid,pid uuid,week_start timestamptz default null,week_end timestamptz default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('likes',(select count(*) from ride_private.community_likes l where l.post_id=p.id and ride_private.community_child_visible(uid,p.owner_id,l.user_id)),
 'comments',(select count(*) from ride_private.community_comments c where c.post_id=p.id and c.deleted_at is null and ride_private.community_child_visible(uid,p.owner_id,c.owner_id)),
 'liked',exists(select 1 from ride_private.community_likes l where l.post_id=p.id and l.user_id=uid and ride_private.community_child_visible(uid,p.owner_id,uid)),
 'saved',exists(select 1 from ride_private.community_saves s where s.post_id=p.id and s.user_id=uid)) from public.rs_posts p where p.id=pid
$$;
create function ride_private.community_post(uid uuid,pid uuid,week_start timestamptz default null,week_end timestamptz default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('post_id',p.id,'owner_id',p.owner_id,'profile',ride_private.community_profile(p.owner_id),'content_version',m.content_version,'content_revision',m.content_revision,'engagement_revision',m.engagement_revision,
 'caption',case when m.content_version=0 then regexp_replace(p.caption,'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]','','g') else p.caption end,'description',case when m.content_version=0 then regexp_replace(p.description,'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]','','g') else p.description end,'visibility',case p.visibility when 'community' then 'public' else p.visibility end,'created_at',ride_private.ranked_utc(p.created_at),'updated_at',ride_private.ranked_utc(m.updated_at),
 'ride',m.ride_snapshot,'route',m.route_snapshot,'legacy_claimed_speed_kmh',case when m.content_version=0 then p.claimed_speed_kmh else null end,
 'media',coalesce((select jsonb_agg(x.descriptor||jsonb_build_object('media_id',x.media_id,'validation',x.validation) order by ids.ord) from jsonb_array_elements_text(m.media_ids) with ordinality ids(media_id,ord) join ride_private.community_media x on x.media_id=ids.media_id::uuid where x.state='committed'),'[]'::jsonb),
 'engagement',ride_private.community_counts(uid,p.id),'week_score',case when week_start is null then null else(select count(*) from ride_private.community_likes l where l.post_id=p.id and l.user_id<>p.owner_id and l.created_at>=week_start and l.created_at<week_end and ride_private.community_child_visible(uid,p.owner_id,l.user_id)) end)
 from public.rs_posts p join public.rs_profiles u on u.user_id=p.owner_id join ride_private.community_posts m on m.post_id=p.id where p.id=pid and ride_private.community_can_view(uid,pid)
$$;

-- Cursor fingerprints carry only bounded current identity/revision/count data.
-- Full descriptions, photo descriptors and route coordinates are materialized
-- only after keyset selection, never for the entire candidate history.
create function ride_private.community_feed_key(uid uuid,pid uuid,week_start timestamptz default null,week_end timestamptz default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('post_id',p.id,'created_at',ride_private.ranked_utc(p.created_at),'content_revision',m.content_revision,'engagement_revision',m.engagement_revision,'visibility',p.visibility,'profile',ride_private.community_profile(p.owner_id),'engagement',ride_private.community_counts(uid,p.id),'week_score',case when week_start is null then null else(select count(*) from ride_private.community_likes l where l.post_id=p.id and l.user_id<>p.owner_id and l.created_at>=week_start and l.created_at<week_end and ride_private.community_child_visible(uid,p.owner_id,l.user_id)) end)
 from public.rs_posts p join public.rs_profiles u on u.user_id=p.owner_id join ride_private.community_posts m on m.post_id=p.id where p.id=pid and ride_private.community_can_view(uid,pid)
$$;

-- Same owner/revision helper is used for review and immutable publication.
create function ride_private.community_attachments(uid uuid,ride_binding jsonb,route_binding jsonb,include_ride boolean) returns jsonb language plpgsql stable set search_path='' as $$
declare r public.rs_rides;route_row public.rs_routes;d ride_private.route_documents;ride_value jsonb;route_value jsonb;parts jsonb:='[]';piece jsonb;fragment jsonb;projection jsonb;outside boolean:=false;
begin
 ride_binding:=coalesce(ride_binding,'null'::jsonb);route_binding:=coalesce(route_binding,'null'::jsonb);
 if not ride_private.community_binding(ride_binding,'ride') or not ride_private.community_binding(route_binding,'route') or include_ride is null or(include_ride and ride_binding='null'::jsonb) then perform ride_private.community_reject('COMMUNITY_INVALID');end if;
 if ride_binding<>'null'::jsonb then
  select * into r from public.rs_rides where id=(ride_binding->>'ride_id')::uuid and owner_id=uid and revision=(ride_binding->>'ride_revision')::integer;
  if not found then perform ride_private.community_reject('COMMUNITY_SOURCE_CHANGED');end if;
  -- A clock-anomalous reversed summary remains privately retained, but cannot
  -- manufacture a chronological community snapshot.
  if r.ended_at<r.started_at or(r.payload->'vehicle'<>'null'::jsonb and(not ride_private.garage_text(r.payload->'vehicle'->'brand',80,false) or not ride_private.garage_text(r.payload->'vehicle'->'model',100,false) or not ride_private.garage_text(r.payload->'vehicle'->'local_id',100,true) or not ride_private.garage_text(r.payload->'vehicle'->'catalog_id',100,true) or not ride_private.garage_text(r.payload->'vehicle'->'variant',100,true) or not ride_private.garage_text(r.payload->'vehicle'->'year',30,true))) then perform ride_private.community_reject('COMMUNITY_SOURCE_CHANGED');end if;
  ride_value:=jsonb_build_object('ride_id',r.id,'ride_revision',r.revision,'summary_hash',encode(sha256(convert_to(r.payload::text,'UTF8')),'hex'),'started_at',ride_private.ranked_utc(r.started_at),'ended_at',ride_private.ranked_utc(r.ended_at),
   'active_duration_ms',r.payload->'active_duration_ms','distance_m',r.payload->'distance_m','max_speed_mps',r.payload->'max_speed_mps','average_speed_mps',r.payload->'average_speed_mps','speed_status','self_reported','vehicle',r.payload->'vehicle');
 end if;
 if route_binding<>'null'::jsonb then
  select * into route_row from public.rs_routes where id=(route_binding->>'route_id')::uuid and owner_id=uid and revision=(route_binding->>'route_revision')::integer;
  if not found then perform ride_private.community_reject('COMMUNITY_SOURCE_CHANGED');end if;
  select * into d from ride_private.route_documents where route_id=route_row.id;projection:=d.projection;
  route_value:=jsonb_build_object('source','route','source_id',route_row.id,'source_revision',route_row.revision,'title',route_row.title,'category',route_row.category,'segments',projection,'geometryStatus',case when jsonb_array_length(projection)=0 then 'hidden' else 'trimmed' end,'privacyTrimMeters',200,'geometryHash',case when jsonb_array_length(projection)>0 then encode(sha256(convert_to(projection::text,'UTF8')),'hex') else null end,'provider',d.provider,'attribution',d.attribution);
 elsif include_ride then
  for fragment in select value from jsonb_array_elements(r.payload->'geometry'->'fragments') loop
   piece:=ride_private.route_decode(fragment->>'polyline');if jsonb_array_length(piece)>1 then parts:=parts||jsonb_build_array(piece);end if;
  end loop;
  -- The display contract holds at most32 disconnected parts. Excess fragments
  -- are hidden as a whole, never connected, selectively dropped or fabricated.
  if jsonb_array_length(parts)<=32 then projection:=ride_private.route_trim(parts);else projection:='[]';end if;
  route_value:=jsonb_build_object('source','ride','source_id',r.id,'source_revision',r.revision,'title',null,'category',r.category,'segments',projection,'geometryStatus',case when jsonb_array_length(projection)=0 then 'hidden' else 'trimmed' end,'privacyTrimMeters',200,'geometryHash',case when jsonb_array_length(projection)>0 then encode(sha256(convert_to(projection::text,'UTF8')),'hex') else null end,'provider','recorded','attribution',null);
 end if;
 if route_value is not null then
  select exists(select 1 from jsonb_array_elements(route_value->'segments') a cross join lateral jsonb_array_elements(a) b where(b->>'latitude')::numeric not between -85.05112878 and 85.05112878) into outside;
  if outside then route_value:=route_value||jsonb_build_object('segments','[]'::jsonb,'geometryStatus','hidden','geometryHash',null);end if;
 end if;
 return jsonb_build_object('ride',ride_value,'route',route_value);
end$$;
create function public.rs_community_attachment_review(p_ride jsonb,p_route jsonb,p_include_ride_route boolean) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;value jsonb;begin
 uid:=ride_private.community_actor();p_ride:=coalesce(p_ride,'null'::jsonb);p_route:=coalesce(p_route,'null'::jsonb);if not ride_private.community_binding(p_ride,'ride') or not ride_private.community_binding(p_route,'route') or p_include_ride_route is null then return ride_private.community_error('COMMUNITY_INVALID');end if;
 retry:=ride_private.race_admit(uid,'community_read',60,5000,50000);if retry is not null then return ride_private.community_error('COMMUNITY_RATE_LIMITED',retry);end if;
 value:=ride_private.community_attachments(uid,p_ride,p_route,p_include_ride_route);return value||jsonb_build_object('owner_id',uid,'server_now',ride_private.ranked_utc(clock_timestamp()));
exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;

create function ride_private.community_validate_document(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare x jsonb;seen text[]:=array[]::text[];begin
 if p is null or jsonb_typeof(p)<>'object' or not p?&array['schema_version','caption','description','visibility','ride','route','include_ride_route','media_ids'] or p-array['schema_version','caption','description','visibility','ride','route','include_ride_route','media_ids']<>'{}' or p->'schema_version'<>'1'::jsonb
 or not ride_private.community_text(p->'caption',150) or not ride_private.community_text(p->'description',4000) or not coalesce(p->>'visibility' in('private','friends','public'),false) or not ride_private.community_binding(p->'ride','ride') or not ride_private.community_binding(p->'route','route') or jsonb_typeof(p->'include_ride_route') is distinct from 'boolean' or(p->'include_ride_route'='true'::jsonb and p->'ride'='null'::jsonb) or jsonb_typeof(p->'media_ids') is distinct from 'array' or jsonb_array_length(p->'media_ids')>6 then perform ride_private.community_reject('COMMUNITY_INVALID');end if;
 for x in select value from jsonb_array_elements(p->'media_ids') loop if not ride_private.race_uuid(x) or x#>>'{}'=any(seen) then perform ride_private.community_reject('COMMUNITY_INVALID');end if;seen:=array_append(seen,x#>>'{}');end loop;
 if trim(p->>'caption')='' and trim(p->>'description')='' and p->'ride'='null'::jsonb and p->'route'='null'::jsonb and jsonb_array_length(p->'media_ids')=0 then perform ride_private.community_reject('COMMUNITY_INVALID');end if;return p;
end$$;
create function ride_private.community_request(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare keys text[]:=array['schema_version','action','post_id','expected_revision'];action_value text:=p->>'action';begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>32768 or jsonb_typeof(p->'action') is distinct from 'string' or not coalesce(action_value in('publish','audience','delete_post','like','save','comment','delete_comment','report'),false) then perform ride_private.community_reject('COMMUNITY_INVALID');end if;
 keys:=keys||case action_value when 'publish' then array['document'] when 'audience' then array['visibility'] when 'like' then array['liked'] when 'save' then array['saved'] when 'comment' then array['comment_id','body'] when 'delete_comment' then array['comment_id'] when 'report' then array['comment_id','reason','detail'] else array[]::text[] end;
 if not p?&keys or p-keys<>'{}' or p->'schema_version'<>'1'::jsonb or not ride_private.race_uuid(p->'post_id') or not ride_private.ride_number(p->'expected_revision',case when action_value='publish' then 0 else 1 end,2147483647,false,true) then perform ride_private.community_reject('COMMUNITY_INVALID');end if;
 if action_value='publish' then perform ride_private.community_validate_document(p->'document');
 elsif action_value='audience' then if not coalesce(p->>'visibility' in('private','friends','public'),false) then perform ride_private.community_reject('COMMUNITY_INVALID');end if;
 elsif action_value in('like','save') then if jsonb_typeof(p->case when action_value='like' then 'liked' else 'saved' end) is distinct from 'boolean' then perform ride_private.community_reject('COMMUNITY_INVALID');end if;
 elsif action_value='comment' then if not ride_private.race_uuid(p->'comment_id') or not ride_private.community_text(p->'body',1000,true) then perform ride_private.community_reject('COMMUNITY_INVALID');end if;
 elsif action_value='delete_comment' then if not ride_private.race_uuid(p->'comment_id') then perform ride_private.community_reject('COMMUNITY_INVALID');end if;
 elsif action_value='report' then if not(p->'comment_id'='null'::jsonb or ride_private.race_uuid(p->'comment_id')) or not coalesce(p->>'reason' in('spam','harassment','privacy','dangerous','other'),false) or not ride_private.community_text(p->'detail',1000) then perform ride_private.community_reject('COMMUNITY_INVALID');end if;
 end if;return p;
end$$;
create function ride_private.community_receipt(uid uuid,operation uuid) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('owner_id',owner_id,'operation_id',operation_id,'request',request,'applied_at',ride_private.ranked_utc(applied_at),'result',result) from ride_private.community_operations where owner_id=uid and operation_id=operation$$;
create function public.rs_community_reserve_post(p_post_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;post public.rs_posts;meta ride_private.community_posts;retry integer;begin
 uid:=ride_private.community_actor();if p_post_id is null then return ride_private.community_error('COMMUNITY_INVALID');end if;
 select * into post from public.rs_posts where id=p_post_id;
 if found then if post.owner_id<>uid or post.deleted_at is not null or post.moderation_state='hidden' then return ride_private.community_error('COMMUNITY_DRAFT_UNAVAILABLE');end if;
 else
  if not exists(select 1 from public.rs_profiles where user_id=uid) then return ride_private.community_error('COMMUNITY_PROFILE_REQUIRED');end if;
  retry:=ride_private.race_admit(uid,'community_draft',20,100,2000);if retry is not null then return ride_private.community_error('COMMUNITY_RATE_LIMITED',retry);end if;
  insert into public.rs_posts(id,owner_id,visibility) values(p_post_id,uid,'friends') returning * into post;
  update ride_private.community_posts set content_version=1 where post_id=p_post_id;
 end if;
 select * into meta from ride_private.community_posts where post_id=p_post_id;return jsonb_build_object('owner_id',uid,'post_id',p_post_id,'revision',meta.content_revision,'state',case when post.moderation_state='draft' then 'draft' else 'published' end);
exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;
create function public.rs_community_operation(p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;begin uid:=ride_private.community_actor();if p_operation_id is null then return ride_private.community_error('COMMUNITY_INVALID');end if;return ride_private.community_receipt(uid,p_operation_id);exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;
create function public.rs_community_mutate(p_operation_id uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;p jsonb;existing jsonb;post public.rs_posts;meta ride_private.community_posts;comment_row ride_private.community_comments;action_value text;pid uuid;result jsonb;stamp timestamptz;retry integer;attach jsonb;counts jsonb;image jsonb;
begin
 uid:=ride_private.community_actor();p:=ride_private.community_request(p_request);if p_operation_id is null then return ride_private.community_error('COMMUNITY_INVALID');end if;
 existing:=ride_private.community_receipt(uid,p_operation_id);if existing is not null then if existing->'request'<>p then return ride_private.community_error('COMMUNITY_OPERATION_CONFLICT');end if;return existing;end if;
 retry:=ride_private.race_admit(uid,'community_control',60,500,10000);if retry is not null then return ride_private.community_error('COMMUNITY_RATE_LIMITED',retry);end if;
 -- Recognized business rejection rolls back its transition but keeps the
 -- outer admission. Unexpected SQL errors are never definitive client ACKs.
 begin
  action_value:=p->>'action';pid:=(p->>'post_id')::uuid;stamp:=clock_timestamp();
  select * into post from public.rs_posts where id=pid for update;select * into meta from ride_private.community_posts where post_id=pid for update;
  if post.id is null or meta.post_id is null or post.deleted_at is not null or not ride_private.account_active(post.owner_id) then perform ride_private.community_reject('COMMUNITY_UNAVAILABLE');end if;
  if action_value in('publish','audience','delete_post') then
   if post.owner_id<>uid then perform ride_private.community_reject('COMMUNITY_UNAVAILABLE');end if;
  elsif not ride_private.community_can_view(uid,pid) then perform ride_private.community_reject('COMMUNITY_UNAVAILABLE');end if;
  if meta.content_revision<>(p->>'expected_revision')::integer then perform ride_private.community_reject('COMMUNITY_REVISION_CONFLICT');end if;
  if action_value in('publish','audience','delete_post') and meta.content_revision=2147483647 then perform ride_private.community_reject('COMMUNITY_CHANGED');end if;
  if action_value='publish' then
   if meta.content_version<>1 or meta.content_revision<>0 or post.moderation_state<>'draft' then perform ride_private.community_reject('COMMUNITY_CHANGED');end if;
   attach:=ride_private.community_attachments(uid,p->'document'->'ride',p->'document'->'route',(p->'document'->>'include_ride_route')::boolean);
   for image in select value from jsonb_array_elements(p->'document'->'media_ids') loop
    if not exists(select 1 from ride_private.community_media m where m.media_id=(image#>>'{}')::uuid and m.owner_id=uid and m.post_id=pid and m.state='committed' and m.validation='decoded_jpeg_v1' and exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.path and o.metadata->>'mimetype'='image/jpeg' and coalesce(o.metadata->>'size','')~'^[0-9]+$' and(o.metadata->>'size')::numeric=(m.descriptor->>'byte_count')::integer)) then perform ride_private.community_reject('COMMUNITY_MEDIA_UNAVAILABLE');end if;
   end loop;
   update public.rs_posts set caption=p->'document'->>'caption',description=p->'document'->>'description',visibility=case p->'document'->>'visibility' when 'public' then 'community' else p->'document'->>'visibility' end,moderation_state='published',created_at=stamp where id=pid;
   update ride_private.community_posts set document=p->'document',ride_snapshot=attach->'ride',route_snapshot=attach->'route',media_ids=p->'document'->'media_ids',content_revision=1,engagement_revision=1,updated_at=stamp where post_id=pid returning * into meta;
   insert into ride_private.community_media_cleanup select m.bucket,m.path,m.owner_id,m.media_id,stamp,null,null from ride_private.community_media m where m.post_id=pid and not(p->'document'->'media_ids')?m.media_id::text on conflict(bucket,path) do update set eligible_at=least(ride_private.community_media_cleanup.eligible_at,excluded.eligible_at);
   update ride_private.community_media set state='obsolete' where post_id=pid and not(p->'document'->'media_ids')?media_id::text;
  elsif action_value='audience' then
   if post.moderation_state='draft' then perform ride_private.community_reject('COMMUNITY_CHANGED');end if;
   update public.rs_posts set visibility=case p->>'visibility' when 'public' then 'community' else p->>'visibility' end where id=pid;
   -- The trusted legacy projection trigger may refresh its version0 row in
   -- this parent UPDATE. CAS applies exactly once from the reviewed base.
   update ride_private.community_posts set content_revision=(p->>'expected_revision')::integer+1,updated_at=stamp where post_id=pid returning * into meta;
  elsif action_value='delete_post' then
   update public.rs_posts set visibility='private',deleted_at=stamp where id=pid;
   update ride_private.community_posts set content_revision=(p->>'expected_revision')::integer+1,updated_at=stamp where post_id=pid returning * into meta;
   insert into ride_private.community_media_cleanup select m.bucket,m.path,m.owner_id,m.media_id,stamp,null,null from ride_private.community_media m where m.post_id=pid on conflict(bucket,path) do update set eligible_at=least(ride_private.community_media_cleanup.eligible_at,excluded.eligible_at);
   update ride_private.community_media set state='obsolete',processing_token=null,processing_until=null where post_id=pid;
  elsif action_value='like' then
   if meta.engagement_revision=2147483647 then perform ride_private.community_reject('COMMUNITY_CHANGED');end if;
   if(p->>'liked')::boolean then insert into ride_private.community_likes values(pid,uid,stamp) on conflict do nothing;else delete from ride_private.community_likes where post_id=pid and user_id=uid;end if;
   update ride_private.community_posts set engagement_revision=engagement_revision+1 where post_id=pid returning * into meta;
  elsif action_value='save' then
   if(p->>'saved')::boolean then insert into ride_private.community_saves values(pid,uid) on conflict do nothing;else delete from ride_private.community_saves where post_id=pid and user_id=uid;end if;
  elsif action_value='comment' then
   if not exists(select 1 from public.rs_profiles where user_id=uid) then perform ride_private.community_reject('COMMUNITY_PROFILE_REQUIRED');end if;
   if meta.engagement_revision=2147483647 then perform ride_private.community_reject('COMMUNITY_CHANGED');end if;
   select * into comment_row from ride_private.community_comments where comment_id=(p->>'comment_id')::uuid;
   if found then perform ride_private.community_reject('COMMUNITY_CHANGED');end if;
   insert into ride_private.community_comments values((p->>'comment_id')::uuid,pid,uid,p->>'body',stamp,null);
   update ride_private.community_posts set engagement_revision=engagement_revision+1 where post_id=pid returning * into meta;
  elsif action_value='delete_comment' then
   select * into comment_row from ride_private.community_comments where comment_id=(p->>'comment_id')::uuid and post_id=pid for update;
   if not found or comment_row.deleted_at is not null or uid<>comment_row.owner_id or not ride_private.community_child_visible(uid,post.owner_id,comment_row.owner_id) then perform ride_private.community_reject('COMMUNITY_UNAVAILABLE');end if;
   if meta.engagement_revision=2147483647 then perform ride_private.community_reject('COMMUNITY_CHANGED');end if;
   update ride_private.community_comments set deleted_at=stamp where comment_id=comment_row.comment_id;
   update ride_private.community_posts set engagement_revision=engagement_revision+1 where post_id=pid returning * into meta;
  else
   if p->'comment_id'<>'null'::jsonb and not exists(select 1 from ride_private.community_comments c where c.comment_id=(p->>'comment_id')::uuid and c.post_id=pid and c.deleted_at is null and ride_private.community_child_visible(uid,post.owner_id,c.owner_id)) then perform ride_private.community_reject('COMMUNITY_UNAVAILABLE');end if;
   insert into ride_private.community_reports(post_id,comment_id,reporter_id,reason,detail,created_at) values(pid,(p->>'comment_id')::uuid,uid,p->>'reason',p->>'detail',stamp) on conflict do nothing;
  end if;
  counts:=ride_private.community_counts(uid,pid);
  result:=case when action_value in('publish','audience','delete_post') then jsonb_build_object('kind','post','post_id',pid,'content_revision',meta.content_revision,'engagement_revision',meta.engagement_revision,'state',case when action_value='delete_post' then 'deleted' else 'published' end,'visibility',case when action_value='publish' then p->'document'->>'visibility' when action_value='audience' then p->>'visibility' else 'private' end)
   when action_value='like' then jsonb_build_object('kind','like','post_id',pid,'content_revision',meta.content_revision,'engagement_revision',meta.engagement_revision,'liked',p->'liked','like_count',counts->'likes')
   when action_value='save' then jsonb_build_object('kind','save','post_id',pid,'content_revision',meta.content_revision,'saved',p->'saved')
   when action_value in('comment','delete_comment') then jsonb_build_object('kind','comment','post_id',pid,'content_revision',meta.content_revision,'engagement_revision',meta.engagement_revision,'comment_id',p->'comment_id','state',case when action_value='comment' then 'published' else 'deleted' end,'comment_count',counts->'comments')
   else jsonb_build_object('kind','report','post_id',pid,'comment_id',p->'comment_id','reported',true) end;
  insert into ride_private.community_operations values(uid,p_operation_id,p,result,stamp);
  return ride_private.community_receipt(uid,p_operation_id);
 exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end;
exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;

create function public.rs_community_post(p_post_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;value jsonb;retry integer;begin
 uid:=ride_private.community_actor();if p_post_id is null then return ride_private.community_error('COMMUNITY_INVALID');end if;retry:=ride_private.race_admit(uid,'community_read',60,5000,50000);if retry is not null then return ride_private.community_error('COMMUNITY_RATE_LIMITED',retry);end if;
 value:=ride_private.community_post(uid,p_post_id);if value is null then return ride_private.community_error('COMMUNITY_UNAVAILABLE');end if;return jsonb_build_object('owner_id',uid,'server_now',ride_private.ranked_utc(clock_timestamp()),'post',value);
exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;

-- Separate owner settings projection permits privacy revocation/deletion of a
-- hidden post without exposing its content through the normal viewer reader.
create function ride_private.community_owner_post(uid uuid,pid uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('post_id',p.id,'content_revision',m.content_revision,'visibility',case p.visibility when 'community' then 'public' else p.visibility end,'state',case when p.deleted_at is not null then 'deleted' else p.moderation_state end,'updated_at',ride_private.ranked_utc(m.updated_at))
 from public.rs_posts p join ride_private.community_posts m on m.post_id=p.id where p.id=pid and p.owner_id=uid
$$;
create function public.rs_community_owner_post(p_post_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;value jsonb;retry integer;begin
 uid:=ride_private.community_actor();if p_post_id is null then return ride_private.community_error('COMMUNITY_INVALID');end if;retry:=ride_private.race_admit(uid,'community_read',60,5000,50000);if retry is not null then return ride_private.community_error('COMMUNITY_RATE_LIMITED',retry);end if;
 value:=ride_private.community_owner_post(uid,p_post_id);if value is null then return ride_private.community_error('COMMUNITY_UNAVAILABLE');end if;return jsonb_build_object('owner_id',uid,'server_now',ride_private.ranked_utc(clock_timestamp()),'post',value);
exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;
create function public.rs_community_owner_posts(p_cursor jsonb default null,p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;items jsonb;next jsonb;retry integer;before_date timestamptz;before_id uuid;begin
 uid:=ride_private.community_actor();if p_limit is null or p_limit not between 1 and 30 then return ride_private.community_error('COMMUNITY_INVALID');end if;
 if p_cursor is not null then
  if jsonb_typeof(p_cursor)<>'object' or not p_cursor?&array['owner_id','updated_at','post_id'] or p_cursor-array['owner_id','updated_at','post_id']<>'{}' or not ride_private.race_uuid(p_cursor->'owner_id') or p_cursor->>'owner_id'<>uid::text or not ride_private.race_uuid(p_cursor->'post_id') then return ride_private.community_error('COMMUNITY_INVALID');end if;
  begin before_date:=ride_private.race_stamp(p_cursor->'updated_at');exception when sqlstate 'RC001' then return ride_private.community_error('COMMUNITY_INVALID');end;before_id:=(p_cursor->>'post_id')::uuid;
 end if;
 retry:=ride_private.race_admit(uid,'community_read',60,5000,50000);if retry is not null then return ride_private.community_error('COMMUNITY_RATE_LIMITED',retry);end if;
 select coalesce(jsonb_agg(value order by updated_at desc,post_id desc),'[]') into items from(select m.updated_at,p.id post_id,ride_private.community_owner_post(uid,p.id) value from public.rs_posts p join ride_private.community_posts m on m.post_id=p.id where p.owner_id=uid and(p.moderation_state<>'draft' or p.deleted_at is not null) and(p_cursor is null or(m.updated_at,p.id)<(before_date,before_id)) order by m.updated_at desc,p.id desc limit p_limit+1)x;
 if jsonb_array_length(items)>p_limit then items:=items-p_limit;next:=jsonb_build_object('owner_id',uid,'updated_at',items->(p_limit-1)->'updated_at','post_id',items->(p_limit-1)->'post_id');end if;
 return jsonb_build_object('owner_id',uid,'server_now',ride_private.ranked_utc(clock_timestamp()),'items',items,'next_cursor',next);
exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;
create function public.rs_community_feed(p_filter jsonb,p_cursor jsonb default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;mode_value text;stamp timestamptz;start_week timestamptz;end_week timestamptz;window_value jsonb;all_keys jsonb;items jsonb;revision text;next jsonb;retry integer;after_date timestamptz;after_id uuid;after_score bigint;rows_count integer;
begin
 uid:=ride_private.community_actor();mode_value:=p_filter->>'mode';stamp:=clock_timestamp();
 if p_filter is null or jsonb_typeof(p_filter)<>'object' or not p_filter?&array['schema_version','mode'] or p_filter-array['schema_version','mode']<>'{}' or p_filter->'schema_version'<>'1'::jsonb or not coalesce(mode_value in('latest','top_week','friends'),false) or p_limit is null or p_limit not between 1 and 30 then return ride_private.community_error('COMMUNITY_INVALID');end if;
 if mode_value='top_week' then start_week:=date_trunc('week',stamp at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';end_week:=start_week+interval '1 week';end if;
 if p_cursor is not null then
  if jsonb_typeof(p_cursor)<>'object' or not p_cursor?&array['owner_id','mode','feed_revision','starts_at','ends_at','as_of','after'] or p_cursor-array['owner_id','mode','feed_revision','starts_at','ends_at','as_of','after']<>'{}' or not ride_private.race_uuid(p_cursor->'owner_id') or p_cursor->>'owner_id'<>uid::text or p_cursor->>'mode'<>mode_value or coalesce(p_cursor->>'feed_revision','')!~'^[a-f0-9]{64}$' or not(p_cursor->'after')?&array['created_at','post_id','week_score'] or(p_cursor->'after')-array['created_at','post_id','week_score']<>'{}' or not ride_private.race_uuid(p_cursor->'after'->'post_id') then return ride_private.community_error('COMMUNITY_INVALID');end if;
  begin stamp:=ride_private.race_stamp(p_cursor->'as_of');after_date:=ride_private.race_stamp(p_cursor->'after'->'created_at');exception when sqlstate 'RC001' then return ride_private.community_error('COMMUNITY_INVALID');end;
  if stamp>clock_timestamp() or stamp<clock_timestamp()-interval '10 minutes' then return ride_private.community_error('COMMUNITY_CHANGED');end if;
  if p_cursor->'starts_at' is distinct from coalesce(to_jsonb(ride_private.ranked_utc(start_week)),'null'::jsonb) or p_cursor->'ends_at' is distinct from coalesce(to_jsonb(ride_private.ranked_utc(end_week)),'null'::jsonb) then return ride_private.community_error('COMMUNITY_CHANGED');end if;
  after_id:=(p_cursor->'after'->>'post_id')::uuid;
  if mode_value='top_week' then if not ride_private.ride_number(p_cursor->'after'->'week_score',0,2147483647,false,true) then return ride_private.community_error('COMMUNITY_INVALID');end if;after_score:=(p_cursor->'after'->>'week_score')::bigint;elsif p_cursor->'after'->'week_score'<>'null'::jsonb then return ride_private.community_error('COMMUNITY_INVALID');end if;
 end if;
 retry:=ride_private.race_admit(uid,'community_read',60,5000,50000);if retry is not null then return ride_private.community_error('COMMUNITY_RATE_LIMITED',retry);end if;
 select count(*) into rows_count from public.rs_posts p join public.rs_profiles u on u.user_id=p.owner_id join ride_private.community_posts m on m.post_id=p.id where p.created_at<=stamp and ride_private.community_can_view(uid,p.id) and(mode_value<>'friends' or p.owner_id=uid or ride_private.friends(uid,p.owner_id)) and(mode_value<>'top_week' or(p.created_at>=start_week and p.created_at<end_week and p.visibility<>'private'));
 if rows_count>10000 then return ride_private.community_error('COMMUNITY_UNAVAILABLE');end if;
 select coalesce(jsonb_agg(value order by coalesce((value->>'week_score')::bigint,0) desc,(value->>'created_at')::timestamptz desc,value->>'post_id' desc),'[]') into all_keys from(select ride_private.community_feed_key(uid,p.id,start_week,end_week) value from public.rs_posts p join public.rs_profiles u on u.user_id=p.owner_id join ride_private.community_posts m on m.post_id=p.id where p.created_at<=stamp and ride_private.community_can_view(uid,p.id) and(mode_value<>'friends' or p.owner_id=uid or ride_private.friends(uid,p.owner_id)) and(mode_value<>'top_week' or(p.created_at>=start_week and p.created_at<end_week and p.visibility<>'private')))x;
 revision:=encode(sha256(convert_to(all_keys::text,'UTF8')),'hex');if p_cursor is not null and p_cursor->>'feed_revision'<>revision then return ride_private.community_error('COMMUNITY_CHANGED');end if;
 select coalesce(jsonb_agg(ride_private.community_post(uid,(value->>'post_id')::uuid,start_week,end_week) order by ord),'[]') into items from(select value,ord from jsonb_array_elements(all_keys) with ordinality x(value,ord) where p_cursor is null or(coalesce((value->>'week_score')::bigint,0),(value->>'created_at')::timestamptz,(value->>'post_id')::uuid)<(coalesce(after_score,0),after_date,after_id) order by ord limit p_limit+1)x;
 if jsonb_array_length(items)>p_limit then items:=items-p_limit;next:=jsonb_build_object('owner_id',uid,'mode',mode_value,'feed_revision',revision,'starts_at',ride_private.ranked_utc(start_week),'ends_at',ride_private.ranked_utc(end_week),'as_of',ride_private.ranked_utc(stamp),'after',jsonb_build_object('created_at',items->(p_limit-1)->'created_at','post_id',items->(p_limit-1)->'post_id','week_score',items->(p_limit-1)->'week_score'));end if;
 window_value:=jsonb_build_object('timezone','Asia/Bangkok','starts_at',ride_private.ranked_utc(start_week),'ends_at',ride_private.ranked_utc(end_week),'as_of',ride_private.ranked_utc(stamp));return jsonb_build_object('owner_id',uid,'server_now',ride_private.ranked_utc(clock_timestamp()),'filter',p_filter,'window',window_value,'feed_revision',revision,'items',items,'next_cursor',next);
exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;
create function public.rs_community_comments(p_post_id uuid,p_cursor jsonb default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;post public.rs_posts;meta ride_private.community_posts;items jsonb;next jsonb;retry integer;before_date timestamptz;before_id uuid;begin
 uid:=ride_private.community_actor();if p_post_id is null or p_limit is null or p_limit not between 1 and 30 then return ride_private.community_error('COMMUNITY_INVALID');end if;
 if p_cursor is not null then if jsonb_typeof(p_cursor)<>'object' or not p_cursor?&array['created_at','id'] or p_cursor-array['created_at','id']<>'{}' or not ride_private.race_uuid(p_cursor->'id') then return ride_private.community_error('COMMUNITY_INVALID');end if;begin before_date:=ride_private.race_stamp(p_cursor->'created_at');exception when sqlstate 'RC001' then return ride_private.community_error('COMMUNITY_INVALID');end;before_id:=(p_cursor->>'id')::uuid;end if;
 retry:=ride_private.race_admit(uid,'community_read',60,5000,50000);if retry is not null then return ride_private.community_error('COMMUNITY_RATE_LIMITED',retry);end if;
 if not ride_private.community_can_view(uid,p_post_id) then return ride_private.community_error('COMMUNITY_UNAVAILABLE');end if;select * into post from public.rs_posts where id=p_post_id;select * into meta from ride_private.community_posts where post_id=p_post_id;
 select coalesce(jsonb_agg(value order by created_at,comment_id),'[]') into items from(select c.created_at,c.comment_id,jsonb_build_object('comment_id',c.comment_id,'post_id',c.post_id,'owner_id',c.owner_id,'profile',ride_private.community_profile(c.owner_id),'body',c.body,'created_at',ride_private.ranked_utc(c.created_at),'can_delete',uid=c.owner_id) value from ride_private.community_comments c join public.rs_profiles u on u.user_id=c.owner_id where c.post_id=p_post_id and c.deleted_at is null and ride_private.community_child_visible(uid,post.owner_id,c.owner_id) and(p_cursor is null or(c.created_at,c.comment_id)>(before_date,before_id)) order by c.created_at,c.comment_id limit p_limit+1)x;
 if jsonb_array_length(items)>p_limit then items:=items-p_limit;next:=jsonb_build_object('created_at',items->(p_limit-1)->'created_at','id',items->(p_limit-1)->'comment_id');end if;return jsonb_build_object('owner_id',uid,'server_now',ride_private.ranked_utc(clock_timestamp()),'post_id',p_post_id,'content_revision',meta.content_revision,'items',items,'next_cursor',next);
exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;

-- Reserved and actual bytes count once per immutable object path. Unknown
-- Storage sizes consume the entire budget, failing closed. This is application
-- admission headroom, not billing authority or an unrelated-bucket guarantee.
create function ride_private.community_storage_bytes(bucket_filter text default null) returns numeric language sql stable security definer set search_path='' as $$
 with sizes as(
  select bucket_id bucket,name path,case when coalesce(metadata->>'size','')~'^[0-9]{1,18}$' then(metadata->>'size')::numeric else 805306368::numeric end bytes from storage.objects where bucket_id in('ride-avatars','vehicle-photos','ride-evidence','ride-race-evidence','ride-community','ride-post-media')
  union all select 'ride-avatars',path,1048576::numeric from public.rs_avatar_uploads where state='reserved' and expires_at>clock_timestamp()
  union all select 'vehicle-photos',path,1048576::numeric from public.rs_vehicle_photo_uploads where state='reserved' and expires_at>clock_timestamp()
  union all select 'ride-evidence',evidence_path,2097152::numeric from public.rs_submissions where state in('pending_upload','queued','verifying')
  union all select 'ride-race-evidence',a.evidence_path,case when a.state='upload_pending' then 2097152::numeric else a.byte_length::numeric end from ride_private.race_attempts a join ride_private.race_evidence_cleanup q on q.path=a.evidence_path
  union all select bucket,path,1048576::numeric from ride_private.community_media where validation='decoded_jpeg_v1' and state='reserved' and expires_at>clock_timestamp()
 ),paths as(select bucket,path,max(bytes) bytes from sizes where bucket_filter is null or bucket=bucket_filter group by bucket,path)
 select coalesce(sum(bytes),0) from paths
$$;
create function ride_private.community_descriptor(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare alphabet text:='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';size integer;x text;begin
 if p is null or jsonb_typeof(p)<>'object' or not p?&array['mime','sha256','byte_count','width','height','blurhash'] or p-array['mime','sha256','byte_count','width','height','blurhash']<>'{}' or jsonb_typeof(p->'mime') is distinct from 'string' or p->>'mime'<>'image/jpeg' or jsonb_typeof(p->'sha256') is distinct from 'string' or p->>'sha256'!~'^[a-f0-9]{64}$' or not ride_private.ride_number(p->'byte_count',1,1048576,false,true) or not ride_private.ride_number(p->'width',1,1600,false,true) or not ride_private.ride_number(p->'height',1,1600,false,true) then return false;end if;
 if p->'blurhash'='null'::jsonb then return true;end if;if jsonb_typeof(p->'blurhash') is distinct from 'string' or length(p->>'blurhash') not between 6 and 166 then return false;end if;
 for x in select regexp_split_to_table(p->>'blurhash','') loop if strpos(alphabet,x)=0 then return false;end if;end loop;
 size:=strpos(alphabet,left(p->>'blurhash',1))-1;return size<=80 and length(p->>'blurhash')=4+2*((size%9)+1)*((size/9)+1);
end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ride-post-media','ride-post-media',false,1048576,array['image/jpeg']);
create function public.rs_community_reserve_media(p_post_id uuid,p_media_id uuid,p_descriptor jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;m ride_private.community_media;post public.rs_posts;retry integer;begin
 uid:=ride_private.community_actor();if p_post_id is null or p_media_id is null or not ride_private.community_descriptor(p_descriptor) then return ride_private.community_error('COMMUNITY_INVALID');end if;
 select * into m from ride_private.community_media where media_id=p_media_id;
 if found then
  if m.owner_id<>uid or m.post_id<>p_post_id or m.validation<>'decoded_jpeg_v1' or m.declared<>p_descriptor or m.state not in('reserved','committed') then return ride_private.community_error('COMMUNITY_MEDIA_UNAVAILABLE');end if;
  select * into post from public.rs_posts where id=p_post_id and owner_id=uid and deleted_at is null and moderation_state<>'hidden';if not found then return ride_private.community_error('COMMUNITY_DRAFT_UNAVAILABLE');end if;
  if m.state='reserved' and m.expires_at<=clock_timestamp() then return ride_private.community_error('COMMUNITY_MEDIA_EXPIRED');end if;
 else
  select * into post from public.rs_posts where id=p_post_id and owner_id=uid and deleted_at is null and moderation_state='draft' for update;
  if not found or not exists(select 1 from ride_private.community_posts where post_id=p_post_id and content_version=1 and content_revision=0) then return ride_private.community_error('COMMUNITY_DRAFT_UNAVAILABLE');end if;
  -- Draft edits can replace previously prepared images after a definitive
  -- rejection. Candidates are separately capped24; published manifest max6.
  if(select count(*) from ride_private.community_media where post_id=p_post_id and state in('reserved','committed') and(validation='legacy_unverified' or expires_at>clock_timestamp() or committed_at is not null))>=24 then return ride_private.community_error('COMMUNITY_CAPACITY');end if;
  if ride_private.community_storage_bytes('ride-post-media')+1048576>268435456 or ride_private.community_storage_bytes()+1048576>805306368 then return ride_private.community_error('COMMUNITY_CAPACITY');end if;
  retry:=ride_private.race_admit(uid,'community_photo',30,120,2000);if retry is not null then return ride_private.community_error('COMMUNITY_RATE_LIMITED',retry);end if;
  insert into ride_private.community_media(media_id,owner_id,post_id,bucket,path,validation,state,declared,descriptor,expires_at) values(p_media_id,uid,p_post_id,'ride-post-media',uid::text||'/'||p_post_id::text||'/'||p_media_id::text||'.jpg','decoded_jpeg_v1','reserved',p_descriptor,p_descriptor,clock_timestamp()+interval '24 hours') returning * into m;
 end if;
 return jsonb_build_object('post_id',m.post_id,'media_id',m.media_id,'bucket',m.bucket,'path',m.path,'expires_at',ride_private.ranked_utc(m.expires_at),'state',m.state);
exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;
create function ride_private.community_can_upload(path_value text) returns boolean language plpgsql volatile security definer set search_path='' as $$declare uid uuid:=auth.uid();begin
 if uid is null then return false;end if;perform ride_private.account_lock(uid);perform ride_private.live_control_lock();
 return ride_private.account_active(uid) and exists(select 1 from ride_private.community_media m join public.rs_posts p on p.id=m.post_id where m.path=path_value and m.owner_id=uid and m.bucket='ride-post-media' and m.state='reserved' and m.expires_at>clock_timestamp() and m.processing_token is null and p.deleted_at is null and p.moderation_state='draft');
end$$;
create function ride_private.community_can_read_upload(path_value text) returns boolean language sql stable security definer set search_path='' as $$select ride_private.account_active(auth.uid()) and exists(select 1 from ride_private.community_media where bucket='ride-post-media' and path=path_value and owner_id=auth.uid() and state in('reserved','committed'))$$;
create policy rs_community_media_insert on storage.objects for insert to authenticated with check(bucket_id='ride-post-media' and ride_private.community_can_upload(name));
create policy rs_community_media_owner_read on storage.objects for select to authenticated using(bucket_id='ride-post-media' and ride_private.community_can_read_upload(name));
-- No UPDATE/upsert/DELETE policy. Shared delivery always re-authorizes parent.
create function public.rs_claim_community_media(p_owner uuid,p_post uuid,p_media uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare m ride_private.community_media;post public.rs_posts;begin
 if p_owner is null or p_post is null or p_media is null or p_token is null then perform ride_private.community_reject('COMMUNITY_INVALID');end if;perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();
 if not ride_private.account_active(p_owner) then perform ride_private.community_reject('ACCOUNT_DELETION_PENDING');end if;
 select * into post from public.rs_posts where id=p_post and owner_id=p_owner and deleted_at is null and moderation_state<>'hidden';if not found then perform ride_private.community_reject('COMMUNITY_DRAFT_UNAVAILABLE');end if;
 select * into m from ride_private.community_media where media_id=p_media and owner_id=p_owner and post_id=p_post and validation='decoded_jpeg_v1' for update;
 if not found or m.state not in('reserved','committed') then perform ride_private.community_reject('COMMUNITY_MEDIA_UNAVAILABLE');end if;
 if m.state='committed' then
  if not exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.path and o.metadata->>'mimetype'='image/jpeg' and coalesce(o.metadata->>'size','')~'^[0-9]+$' and(o.metadata->>'size')::numeric=(m.descriptor->>'byte_count')::integer) then perform ride_private.community_reject('COMMUNITY_MEDIA_UNAVAILABLE');end if;
  return jsonb_build_object('state','committed','post_id',m.post_id,'media_id',m.media_id,'descriptor',m.descriptor);
 end if;
 if m.expires_at<=clock_timestamp() then perform ride_private.community_reject('COMMUNITY_MEDIA_EXPIRED');end if;
 if post.moderation_state<>'draft' or(m.processing_token is not null and m.processing_token<>p_token and m.processing_until>clock_timestamp()) then perform ride_private.community_reject('COMMUNITY_MEDIA_UNAVAILABLE');end if;
 if not exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.path and o.metadata->>'mimetype'='image/jpeg' and coalesce(o.metadata->>'size','')~'^[0-9]+$' and(o.metadata->>'size')::numeric=(m.declared->>'byte_count')::integer) then perform ride_private.community_reject('COMMUNITY_MEDIA_UNAVAILABLE');end if;
 update ride_private.community_media set processing_token=p_token,processing_until=clock_timestamp()+interval '2 minutes' where media_id=p_media;
 return jsonb_build_object('state','reserved','post_id',m.post_id,'media_id',m.media_id,'bucket',m.bucket,'path',m.path,'declared',m.declared,'token',p_token);
end$$;
create function public.rs_finish_community_media(p_owner uuid,p_post uuid,p_media uuid,p_token uuid,p_descriptor jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare m ride_private.community_media;begin
 perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();if not ride_private.account_active(p_owner) then perform ride_private.community_reject('ACCOUNT_DELETION_PENDING');end if;
 select * into m from ride_private.community_media where media_id=p_media and owner_id=p_owner and post_id=p_post for update;
 if not found or m.validation<>'decoded_jpeg_v1' or m.state<>'reserved' or m.processing_token is distinct from p_token or m.processing_until<=clock_timestamp() or m.expires_at<=clock_timestamp() or not exists(select 1 from public.rs_posts where id=p_post and owner_id=p_owner and deleted_at is null and moderation_state='draft') then perform ride_private.community_reject('COMMUNITY_MEDIA_UNAVAILABLE');end if;
 if not ride_private.community_descriptor(p_descriptor) or p_descriptor->'blurhash'='null'::jsonb or p_descriptor-array['blurhash']<>m.declared-array['blurhash'] then perform ride_private.community_reject('COMMUNITY_MEDIA_INVALID');end if;
 if not exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.path and o.metadata->>'mimetype'='image/jpeg' and coalesce(o.metadata->>'size','')~'^[0-9]+$' and(o.metadata->>'size')::numeric=(p_descriptor->>'byte_count')::integer) then perform ride_private.community_reject('COMMUNITY_MEDIA_UNAVAILABLE');end if;
 update ride_private.community_media set state='committed',descriptor=p_descriptor,committed_at=clock_timestamp(),processing_token=null,processing_until=null where media_id=p_media;
 return jsonb_build_object('post_id',p_post,'media_id',p_media,'descriptor',p_descriptor);
end$$;
create function public.rs_release_community_media(p_owner uuid,p_post uuid,p_media uuid,p_token uuid,p_invalid boolean default false) returns void language plpgsql security definer set search_path='' as $$begin
 perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();
 update ride_private.community_media set processing_token=null,processing_until=null,state=case when p_invalid then 'invalid' else state end where media_id=p_media and owner_id=p_owner and post_id=p_post and state='reserved' and processing_token=p_token;
 if p_invalid and found then insert into ride_private.community_media_cleanup select bucket,path,owner_id,media_id,clock_timestamp(),null,null from ride_private.community_media where media_id=p_media on conflict do nothing;end if;
end$$;
create function public.rs_community_media_for_view(p_post_id uuid,p_media_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;result jsonb;retry integer;begin
 uid:=ride_private.community_actor();if p_post_id is null or p_media_id is null then return ride_private.community_error('COMMUNITY_INVALID');end if;
 retry:=ride_private.race_admit(uid,'community_sign',60,3000,30000);if retry is not null then return ride_private.community_error('COMMUNITY_RATE_LIMITED',retry);end if;
 if not ride_private.community_can_view(uid,p_post_id) then return ride_private.community_error('COMMUNITY_UNAVAILABLE');end if;
 select jsonb_build_object('post_id',m.post_id,'media_id',m.media_id,'bucket',m.bucket,'path',m.path,'sha256',m.descriptor->'sha256') into result from ride_private.community_media m join ride_private.community_posts p on p.post_id=m.post_id where m.media_id=p_media_id and m.post_id=p_post_id and m.state='committed' and p.media_ids?m.media_id::text and exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.path);
 if result is null then return ride_private.community_error('COMMUNITY_MEDIA_UNAVAILABLE');end if;return result;
exception when sqlstate 'CM001' then return ride_private.community_error(sqlerrm);end$$;
-- Service-only janitor takes the global fence without subsequently acquiring
-- any owner-account fence. Publication/deletion already enter account->global.
create function public.rs_claim_community_media_cleanup(p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;stamp timestamptz:=clock_timestamp();begin
 if p_limit is null or p_limit not between 1 and 20 then perform ride_private.community_reject('COMMUNITY_INVALID');end if;perform ride_private.live_control_lock();
 insert into ride_private.community_media_cleanup(bucket,path,owner_id,media_id,eligible_at)
 select m.bucket,m.path,m.owner_id,m.media_id,stamp from ride_private.community_media m join public.rs_posts p on p.id=m.post_id where exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.path) and(m.state in('invalid','obsolete') or(m.state='reserved' and m.expires_at<=stamp) or(m.state='committed' and p.moderation_state='draft' and m.committed_at<=stamp-interval '7 days') or p.deleted_at is not null) on conflict(bucket,path) do update set eligible_at=least(ride_private.community_media_cleanup.eligible_at,excluded.eligible_at);
 update ride_private.community_media m set state='obsolete',processing_token=null,processing_until=null from ride_private.community_media_cleanup q where q.media_id=m.media_id and q.eligible_at<=stamp and not exists(select 1 from public.rs_posts p join ride_private.community_posts cp on cp.post_id=p.id where p.id=m.post_id and p.deleted_at is null and p.moderation_state='published' and cp.media_ids?m.media_id::text);
 with pending as(select q.bucket,q.path from ride_private.community_media_cleanup q where q.eligible_at<=stamp and(q.token is null or q.lease_until<=stamp) and not exists(select 1 from ride_private.community_media m join public.rs_posts p on p.id=m.post_id join ride_private.community_posts cp on cp.post_id=p.id where m.bucket=q.bucket and m.path=q.path and p.deleted_at is null and p.moderation_state='published' and cp.media_ids?m.media_id::text) order by q.eligible_at,q.bucket,q.path limit p_limit for update),leased as(update ride_private.community_media_cleanup q set token=gen_random_uuid(),lease_until=stamp+interval '2 minutes' from pending p where q.bucket=p.bucket and q.path=p.path returning q.*)
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'path',path,'token',token) order by bucket,path),'[]') into items from leased;return items;
end$$;
create function public.rs_ack_community_media_cleanup(p_bucket text,p_path text,p_token uuid) returns void language plpgsql security definer set search_path='' as $$declare q ride_private.community_media_cleanup;begin
 perform ride_private.live_control_lock();select * into q from ride_private.community_media_cleanup where bucket=p_bucket and path=p_path and token=p_token and lease_until>clock_timestamp() for update;if not found then perform ride_private.community_reject('COMMUNITY_MEDIA_UNAVAILABLE');end if;
 if exists(select 1 from storage.objects where bucket_id=q.bucket and name=q.path) then perform ride_private.community_reject('COMMUNITY_MEDIA_UNAVAILABLE');end if;
 if exists(select 1 from ride_private.community_media m join public.rs_posts p on p.id=m.post_id join ride_private.community_posts cp on cp.post_id=p.id where m.media_id=q.media_id and p.deleted_at is null and p.moderation_state='published' and cp.media_ids?m.media_id::text) then perform ride_private.community_reject('COMMUNITY_MEDIA_UNAVAILABLE');end if;
 -- Retain immutable reservation identity after binary GC. Reusing the UUID
 -- must never rebind another owner/post/descriptor or recreate a retired path.
 delete from ride_private.community_media_cleanup where bucket=q.bucket and path=q.path;
end$$;
create function public.rs_release_community_media_cleanup(p_bucket text,p_path text,p_token uuid) returns void language plpgsql security definer set search_path='' as $$begin perform ride_private.live_control_lock();update ride_private.community_media_cleanup set token=null,lease_until=null where bucket=p_bucket and path=p_path and token=p_token;end$$;
create function public.rs_community_reports(p_cursor jsonb default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;next jsonb;before_date timestamptz;before_id uuid;begin
 if p_limit is null or p_limit not between 1 and 30 then perform ride_private.community_reject('COMMUNITY_INVALID');end if;
 if p_cursor is not null then if jsonb_typeof(p_cursor)<>'object' or not p_cursor?&array['created_at','report_id'] or p_cursor-array['created_at','report_id']<>'{}' or not ride_private.race_uuid(p_cursor->'report_id') then perform ride_private.community_reject('COMMUNITY_INVALID');end if;before_date:=ride_private.race_stamp(p_cursor->'created_at');before_id:=(p_cursor->>'report_id')::uuid;end if;
 select coalesce(jsonb_agg(to_jsonb(x)-array['created_at']||jsonb_build_object('created_at',ride_private.ranked_utc(created_at)) order by created_at,report_id),'[]') into items from(select * from ride_private.community_reports where p_cursor is null or(created_at,report_id)>(before_date,before_id) order by created_at,report_id limit p_limit+1)x;
 if jsonb_array_length(items)>p_limit then items:=items-p_limit;next:=jsonb_build_object('created_at',items->(p_limit-1)->'created_at','report_id',items->(p_limit-1)->'report_id');end if;return jsonb_build_object('items',items,'next_cursor',next);
end$$;
create function public.rs_moderate_community_post(p_post uuid,p_hidden boolean) returns void language plpgsql security definer set search_path='' as $$declare owner_value uuid;begin
 select owner_id into owner_value from public.rs_posts where id=p_post;if owner_value is null or p_hidden is null then perform ride_private.community_reject('COMMUNITY_UNAVAILABLE');end if;perform ride_private.account_lock(owner_value);perform ride_private.live_control_lock();
 if not exists(select 1 from public.rs_posts where id=p_post and owner_id=owner_value and moderation_state in('published','hidden') and deleted_at is null) then perform ride_private.community_reject('COMMUNITY_UNAVAILABLE');end if;
 update public.rs_posts set moderation_state=case when p_hidden then 'hidden' else 'published' end where id=p_post;
 update ride_private.community_posts set content_revision=least(2147483647::bigint,content_revision::bigint+1)::integer,updated_at=clock_timestamp() where post_id=p_post;
end$$;

-- Every existing browser allocation entrypoint shares account -> global fence.
-- Replay/collision handling stays ahead of capacity admission; original bodies
-- remain byte-identical private predecessors with no direct grants.
alter function public.rs_reserve_avatar(uuid,text) rename to rs_reserve_avatar_pre_community_v1;
alter function public.rs_reserve_avatar_pre_community_v1(uuid,text) set schema ride_private;
create function public.rs_reserve_avatar(p_id uuid,p_mime text) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();begin
 perform ride_private.live_control_lock();if p_id is null or p_mime is null or p_mime not in('image/jpeg','image/png','image/webp') or exists(select 1 from public.rs_avatar_uploads where upload_id=p_id) then return ride_private.rs_reserve_avatar_pre_community_v1(p_id,p_mime);end if;
 if ride_private.community_storage_bytes()+1048576>805306368 then raise exception 'AVATAR_UNAVAILABLE' using errcode='42501';end if;return ride_private.rs_reserve_avatar_pre_community_v1(p_id,p_mime);
end$$;
alter function public.rs_reserve_vehicle_photo(uuid,text,text) rename to rs_reserve_vehicle_photo_pre_community_v1;
alter function public.rs_reserve_vehicle_photo_pre_community_v1(uuid,text,text) set schema ride_private;
create function public.rs_reserve_vehicle_photo(p_id uuid,p_vehicle_id text,p_mime text) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();begin
 perform ride_private.live_control_lock();if p_id is null or not ride_private.garage_text(to_jsonb(p_vehicle_id),100) or p_mime is null or p_mime not in('image/jpeg','image/png','image/webp') or exists(select 1 from public.rs_vehicle_photo_uploads where upload_id=p_id) then return ride_private.rs_reserve_vehicle_photo_pre_community_v1(p_id,p_vehicle_id,p_mime);end if;
 if ride_private.community_storage_bytes()+1048576>805306368 then raise exception 'GARAGE_PHOTO_UNAVAILABLE' using errcode='42501';end if;return ride_private.rs_reserve_vehicle_photo_pre_community_v1(p_id,p_vehicle_id,p_mime);
end$$;
alter function public.rs_reserve_submission(uuid,uuid,text) rename to rs_reserve_submission_pre_community_v1;
alter function public.rs_reserve_submission_pre_community_v1(uuid,uuid,text) set schema ride_private;
create function public.rs_reserve_submission(p_id uuid,p_challenge uuid,p_visibility text) returns text language plpgsql security definer set search_path='' as $$declare uid uuid:=ride_private.actor();s public.rs_submissions;begin
 perform ride_private.live_control_lock();select * into s from public.rs_submissions where id=p_id;
 if found then if s.owner_id<>uid or s.challenge_id is distinct from p_challenge or s.visibility is distinct from p_visibility then raise exception 'Submission unavailable' using errcode='42501';end if;return s.evidence_path;end if;
 if p_id is not null and p_challenge is not null and p_visibility in('private','friends','community') and ride_private.community_storage_bytes()+2097152>805306368 then raise exception 'Submission unavailable' using errcode='42501';end if;
 return ride_private.rs_reserve_submission_pre_community_v1(p_id,p_challenge,p_visibility);
end$$;
alter function public.rs_race_mutate(uuid,jsonb) rename to rs_race_mutate_pre_community_v1;
alter function public.rs_race_mutate_pre_community_v1(uuid,jsonb) set schema ride_private;
create function public.rs_race_mutate(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;p jsonb;begin
 begin uid:=ride_private.race_actor();p:=ride_private.race_request(p_request);exception when sqlstate 'RC001' then return ride_private.race_error(sqlerrm);end;
 if p_operation is null or p->>'action'<>'evidence_bind' or ride_private.race_receipt(uid,p_operation) is not null or exists(select 1 from ride_private.race_activation_cancellations where owner_id=uid and operation_id=p_operation) or exists(select 1 from ride_private.race_attempts where id=(p->>'attempt_id')::uuid and owner_id=uid and evidence_path is not null) then return ride_private.rs_race_mutate_pre_community_v1(p_operation,p_request);end if;
 if ride_private.community_storage_bytes('ride-race-evidence')+2097152>268435456 or ride_private.community_storage_bytes()+2097152>805306368 then return ride_private.race_error('RACE_CAPACITY');end if;return ride_private.rs_race_mutate_pre_community_v1(p_operation,p_request);
end$$;

-- Superseded writers and the unrestricted per-post upload policy cannot bypass
-- the six-photo manifest, privacy projection or aggregate reservation budget.
revoke execute on function public.rs_create_post(uuid),public.rs_publish_post(uuid,text,text,numeric,uuid,integer,text,text),public.rs_delete_post(uuid),public.rs_report_post(uuid,text,text),public.rs_feed(integer,timestamptz,uuid) from public,anon,authenticated;
drop policy rs_media_insert on storage.objects;
drop policy rs_media_read on storage.objects;
create policy rs_media_read on storage.objects for select to authenticated using(bucket_id='ride-community' and ride_private.account_active(auth.uid()) and split_part(name,'/',1)=auth.uid()::text);
create or replace function ride_private.can_view_post(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select ride_private.community_can_view(auth.uid(),pid)$$;

-- Binary-first account deletion extends the existing token-fenced worker.
alter function public.rs_account_deletion_objects(uuid,uuid,uuid) rename to rs_account_deletion_objects_pre_community_v1;
alter function public.rs_account_deletion_objects_pre_community_v1(uuid,uuid,uuid) set schema ride_private;
create function public.rs_account_deletion_objects(p_owner uuid,p_request uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();perform ride_private.deletion_lease(p_owner,p_request,p_token);
 insert into ride_private.account_deletion_objects(owner_id,bucket,path) select p_owner,bucket_id,name from storage.objects where bucket_id='ride-post-media' and starts_with(name,p_owner::text||'/') on conflict do nothing;
 insert into ride_private.account_deletion_objects(owner_id,bucket,path) select p_owner,bucket,path from ride_private.community_media where owner_id=p_owner on conflict do nothing;
 return ride_private.rs_account_deletion_objects_pre_community_v1(p_owner,p_request,p_token);
end$$;
alter function public.rs_purge_account_data(uuid,uuid,uuid) rename to rs_purge_account_data_pre_community_v1;
alter function public.rs_purge_account_data_pre_community_v1(uuid,uuid,uuid) set schema ride_private;
create function public.rs_purge_account_data(p_owner uuid,p_request uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();perform ride_private.deletion_lease(p_owner,p_request,p_token);
 if exists(select 1 from storage.objects o where(o.bucket_id='ride-post-media' and starts_with(o.name,p_owner::text||'/')) or exists(select 1 from ride_private.community_media m where m.owner_id=p_owner and m.bucket=o.bucket_id and m.path=o.name)) then raise exception 'DELETION_ASSETS_REMAIN';end if;
 delete from ride_private.community_operations where owner_id=p_owner or request->>'post_id' in(select id::text from public.rs_posts where owner_id=p_owner);
 delete from ride_private.community_media_cleanup q where owner_id=p_owner and not exists(select 1 from storage.objects o where o.bucket_id=q.bucket and o.name=q.path);
 delete from ride_private.community_reports where reporter_id=p_owner;delete from ride_private.community_comments where owner_id=p_owner;delete from ride_private.community_likes where user_id=p_owner;delete from ride_private.community_saves where user_id=p_owner;
 perform ride_private.rs_purge_account_data_pre_community_v1(p_owner,p_request,p_token);
end$$;
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and(p.proname like 'community_%' or p.proname like '%_pre_community_v1') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;end$$;
grant execute on function ride_private.community_can_upload(text),ride_private.community_can_read_upload(text) to authenticated;
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and(p.proname like 'rs_community_%' or p.proname in('rs_claim_community_media','rs_finish_community_media','rs_release_community_media','rs_claim_community_media_cleanup','rs_ack_community_media_cleanup','rs_release_community_media_cleanup','rs_moderate_community_post','rs_reserve_avatar','rs_reserve_vehicle_photo','rs_reserve_submission','rs_race_mutate','rs_account_deletion_objects','rs_purge_account_data')) loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;end$$;
grant execute on function public.rs_community_reserve_post(uuid),public.rs_community_reserve_media(uuid,uuid,jsonb),public.rs_community_mutate(uuid,jsonb),public.rs_community_operation(uuid),public.rs_community_attachment_review(jsonb,jsonb,boolean),public.rs_community_feed(jsonb,jsonb,integer),public.rs_community_post(uuid),public.rs_community_owner_post(uuid),public.rs_community_owner_posts(jsonb,integer),public.rs_community_comments(uuid,jsonb,integer),public.rs_community_media_for_view(uuid,uuid),public.rs_reserve_avatar(uuid,text),public.rs_reserve_vehicle_photo(uuid,text,text),public.rs_reserve_submission(uuid,uuid,text),public.rs_race_mutate(uuid,jsonb) to authenticated,service_role;
grant execute on function public.rs_claim_community_media(uuid,uuid,uuid,uuid),public.rs_finish_community_media(uuid,uuid,uuid,uuid,jsonb),public.rs_release_community_media(uuid,uuid,uuid,uuid,boolean),public.rs_claim_community_media_cleanup(integer),public.rs_ack_community_media_cleanup(text,text,uuid),public.rs_release_community_media_cleanup(text,text,uuid),public.rs_community_reports(jsonb,integer),public.rs_moderate_community_post(uuid,boolean),public.rs_account_deletion_objects(uuid,uuid,uuid),public.rs_purge_account_data(uuid,uuid,uuid) to service_role;
commit;
