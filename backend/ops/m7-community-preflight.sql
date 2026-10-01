-- Catalog-only, read-only preflight. Safe before 011: no new relation or helper
-- is referenced as a query source. Do not reapply 001-010 or a partial 011.
-- Proceed only when prior_schema_present values are true, every new table is
-- absent, and the three new-function/policy arrays are empty. Otherwise stop
-- and inspect the deployment history; this query never repairs or seeds data.
select jsonb_build_object(
  'observed_at', clock_timestamp(),
  'prior_schema_present', jsonb_build_object(
    'ranked_publications', to_regclass('ride_private.ranked_publications') is not null,
    'ranked_mutate', to_regprocedure('public.rs_ranked_mutate(uuid,jsonb)') is not null,
    'race_policy', to_regclass('ride_private.race_policy') is not null,
    'race_mutate', to_regprocedure('public.rs_race_mutate(uuid,jsonb)') is not null,
    'storage_objects', to_regclass('storage.objects') is not null,
    'storage_buckets', to_regclass('storage.buckets') is not null
  ),
  'new_tables', (
    select jsonb_agg(jsonb_build_object('name', name, 'present',
      to_regclass('ride_private.' || name) is not null) order by name)
    from unnest(array[
      'community_posts', 'community_media', 'community_operations',
      'community_likes', 'community_saves', 'community_comments',
      'community_reports', 'community_media_cleanup'
    ]) as names(name)
  ),
  'new_public_functions', coalesce((
    select jsonb_agg(p.oid::regprocedure::text order by p.proname, p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (
      p.proname like 'rs_community_%' or p.proname in (
        'rs_claim_community_media', 'rs_finish_community_media',
        'rs_release_community_media', 'rs_claim_community_media_cleanup',
        'rs_ack_community_media_cleanup', 'rs_release_community_media_cleanup',
        'rs_moderate_community_post'
      )
    )
  ), '[]'::jsonb),
  'new_private_functions', coalesce((
    select jsonb_agg(p.oid::regprocedure::text order by p.proname, p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ride_private' and (
      p.proname like 'community_%' or p.proname like '%_pre_community_v1'
    )
  ), '[]'::jsonb),
  'new_storage_policies', coalesce((
    select jsonb_agg(policyname order by policyname)
    from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('rs_community_media_insert', 'rs_community_media_owner_read')
  ), '[]'::jsonb),
  'existing_replacement_functions', coalesce((
    select jsonb_agg(p.oid::regprocedure::text order by p.proname, p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'rs_reserve_avatar', 'rs_reserve_vehicle_photo', 'rs_reserve_submission',
      'rs_race_mutate', 'rs_account_deletion_objects', 'rs_purge_account_data'
    )
  ), '[]'::jsonb),
  'legacy_storage_policies', coalesce((
    select jsonb_agg(policyname order by policyname)
    from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('rs_media_insert', 'rs_media_read')
  ), '[]'::jsonb)
) as preflight;
