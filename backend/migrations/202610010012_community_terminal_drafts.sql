-- Additive M7 compatibility repair. Deployed 001-011 stay byte-for-byte intact.
-- The original delete API retained moderation_state='draft' and set deleted_at.
-- Terminal owner metadata needs a positive revision; live drafts stay revision0.
begin;
update ride_private.community_posts m
 set content_revision=1,engagement_revision=greatest(m.engagement_revision,1),
     updated_at=greatest(m.updated_at,p.deleted_at)
 from public.rs_posts p
 where p.id=m.post_id and m.content_version=0 and m.content_revision=0
   and p.deleted_at is not null;

-- Preserve the trusted legacy trigger's exact ABI, grants and fixed search path.
-- Draft-state decisions also require that the draft is not deleted.
create or replace function ride_private.community_legacy_projection() returns trigger language plpgsql security definer set search_path='' as $$declare route_value jsonb;asset uuid;begin
 if exists(select 1 from ride_private.community_posts where post_id=new.id and content_version=1) then return new;end if;
 if new.route_snapshot is not null and new.route_snapshot->>'category' in('scooter','motorcycle','car','bicycle') and coalesce(new.route_snapshot->>'revision','')~'^[1-9][0-9]{0,9}$' and(new.route_snapshot->>'revision')::numeric<=2147483647 and length(coalesce(new.route_snapshot->>'title','')) between 1 and 120 and(new.route_snapshot->>'title')!~'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then route_value:=jsonb_build_object('source','legacy','source_id',null,'source_revision',(new.route_snapshot->>'revision')::integer,'title',new.route_snapshot->>'title','category',new.route_snapshot->>'category','segments','[]'::jsonb,'geometryStatus','unavailable','privacyTrimMeters',null,'geometryHash',null,'provider','unknown','attribution',null);end if;
 if new.media_path is not null then
  select media_id into asset from ride_private.community_media where bucket='ride-community' and path=new.media_path and owner_id=new.owner_id and post_id=new.id;
  if asset is null then asset:=gen_random_uuid();insert into ride_private.community_media(media_id,owner_id,post_id,bucket,path,validation,state,descriptor,expires_at,committed_at) values(asset,new.owner_id,new.id,'ride-community',new.media_path,'legacy_unverified','committed',jsonb_build_object('mime',case when lower(new.media_path)~'\.png$' then 'image/png' when lower(new.media_path)~'\.webp$' then 'image/webp' else 'image/jpeg' end,'sha256',null,'byte_count',null,'width',null,'height',null,'blurhash',null),'infinity',clock_timestamp());end if;
 end if;
 insert into ride_private.community_posts(post_id,content_version,content_revision,engagement_revision,route_snapshot,media_ids,updated_at) values(new.id,0,case when new.moderation_state='draft' and new.deleted_at is null then 0 else 1 end,case when new.moderation_state='draft' and new.deleted_at is null then 0 else 1 end,route_value,case when asset is null then '[]'::jsonb else jsonb_build_array(asset) end,clock_timestamp()) on conflict(post_id) do update set content_revision=case when new.moderation_state='draft' and new.deleted_at is null then ride_private.community_posts.content_revision else least(2147483647::bigint,ride_private.community_posts.content_revision::bigint+1)::integer end,engagement_revision=greatest(ride_private.community_posts.engagement_revision,1),route_snapshot=excluded.route_snapshot,media_ids=excluded.media_ids,updated_at=excluded.updated_at;
 return new;
end$$;
commit;
