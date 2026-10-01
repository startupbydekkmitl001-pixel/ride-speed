-- Read-only additive012 proof. Run only after011 exists.
-- Before012: guard_count=0. After012: guard_count=3 and repairable_count=0.
-- A guard_count other than0 before deployment requires investigation; never
-- rerun011. No IDs, content, owner details or raw function body are returned.
select jsonb_build_object(
  'observed_at',clock_timestamp(),
  'repairable_count',(
    select count(*) from ride_private.community_posts m join public.rs_posts p on p.id=m.post_id
    where m.content_version=0 and m.content_revision=0 and p.deleted_at is not null
  ),
  'projection',(
    select jsonb_build_object(
      'guard_count',(
        length(p.prosrc)-length(replace(p.prosrc,
          'new.moderation_state=''draft'' and new.deleted_at is null then',''))
      )/length('new.moderation_state=''draft'' and new.deleted_at is null then'),
      'definer',p.prosecdef,'search_path',p.proconfig,
      'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
      'app_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')
    ) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ride_private' and p.proname='community_legacy_projection'
  )
) as readiness;
