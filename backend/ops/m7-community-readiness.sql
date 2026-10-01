-- Read-only aggregate catalog proof. No impersonation, media, IDs or seed writes.
select jsonb_build_object(
 'observed_at',clock_timestamp(),
 'private_tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'anon_read',has_table_privilege('anon',c.oid,'SELECT'),'app_read',has_table_privilege('authenticated',c.oid,'SELECT'),'app_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ride_private' and c.relkind in('r','p') and c.relname like 'community_%'),
 'public_functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definer',p.prosecdef,'search_path',p.proconfig,'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'app_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and(p.proname like 'rs_community_%' or p.proname in('rs_claim_community_media','rs_finish_community_media','rs_release_community_media','rs_claim_community_media_cleanup','rs_ack_community_media_cleanup','rs_release_community_media_cleanup','rs_moderate_community_post','rs_reserve_avatar','rs_reserve_vehicle_photo','rs_reserve_submission','rs_race_mutate','rs_account_deletion_objects','rs_purge_account_data'))),
 'predecessor_helpers',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'app_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and p.proname like '%_pre_community_v1'),
 'retired_app_functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'app_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('rs_create_post','rs_publish_post','rs_delete_post','rs_report_post','rs_feed')),
 'media_bucket',(select jsonb_build_object('public',public,'max_bytes',file_size_limit,'mime_types',allowed_mime_types) from storage.buckets where id='ride-post-media'),
 'storage_policies',(select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles) order by policyname) from pg_policies where schemaname='storage' and tablename='objects' and policyname in('rs_media_insert','rs_media_read','rs_community_media_insert','rs_community_media_owner_read')),
 'posts',(select count(*) from ride_private.community_posts),
 'media',(select count(*) from ride_private.community_media),
 'operations',(select count(*) from ride_private.community_operations),
 'reports',(select count(*) from ride_private.community_reports),
 'cleanup_pending',(select count(*) from ride_private.community_media_cleanup),
 'app_reserved_actual_bytes',ride_private.community_storage_bytes(),
 'post_reserved_actual_bytes',ride_private.community_storage_bytes('ride-post-media'),
 'app_capacity_bytes',805306368,
 'post_capacity_bytes',268435456,
 'race_policy_enabled',(select enabled from ride_private.race_policy)
) as readiness;
