-- READ ONLY and safe before Cron/Vault/pg_net/operator objects are installed.
-- Catalog/ACL/worker presence only. No Vault values/names, request queues,
-- commands, response payloads, paths, participant data or permanent deletion.
select jsonb_build_object(
 'observed_at',clock_timestamp(),
 'current_operator_can_login',(select rolcanlogin from pg_roles where rolname=current_user),
 'extensions',(select coalesce(jsonb_object_agg(extname,extversion),'{}'::jsonb) from pg_extension where extname in('pg_cron','pg_net','supabase_vault')),
 'catalog',jsonb_build_object(
   'community_migration_present',to_regclass('ride_private.community_media_cleanup') is not null,
   'cron_job_present',to_regclass('cron.job') is not null,
   'cron_history_present',to_regclass('cron.job_run_details') is not null,
   'vault_metadata_present',to_regclass('vault.secrets') is not null,
   'vault_decryption_view_present',to_regclass('vault.decrypted_secrets') is not null,
   'http_queue_present',to_regclass('net.http_request_queue') is not null,
   'http_responses_present',to_regclass('net._http_response') is not null,
   'http_post_present',to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null,
   'worker_check_present',to_regprocedure('net.check_worker_is_up()') is not null,
   'operator_schema_present',to_regnamespace('ride_operator') is not null,
   'operator_dispatch_present',to_regclass('ride_operator.community_cleanup_dispatches_v1') is not null,
   'operator_helper_present',to_regprocedure('ride_operator.rs_enqueue_community_cleanup_v1()') is not null
 ),
 'net_worker_visible',exists(select 1 from pg_stat_activity where backend_type ilike '%pg_net%' or backend_type='pg_net_worker'),
 'browser_or_service_acl',(select jsonb_agg(jsonb_build_object(
   'role',r.rolname,
   'vault_usage',has_schema_privilege(r.oid,to_regnamespace('vault'),'USAGE'),
   'net_usage',has_schema_privilege(r.oid,to_regnamespace('net'),'USAGE'),
   'vault_metadata_access',has_table_privilege(r.oid,to_regclass('vault.secrets'),'SELECT,INSERT,UPDATE,DELETE'),
   'vault_decrypted_read',has_table_privilege(r.oid,to_regclass('vault.decrypted_secrets'),'SELECT'),
   'http_queue_access',has_table_privilege(r.oid,to_regclass('net.http_request_queue'),'SELECT,INSERT,UPDATE,DELETE'),
   'http_response_access',has_table_privilege(r.oid,to_regclass('net._http_response'),'SELECT,INSERT,UPDATE,DELETE'),
   'http_post_execute',has_function_privilege(r.oid,to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)'),'EXECUTE'),
   'operator_usage',has_schema_privilege(r.oid,to_regnamespace('ride_operator'),'USAGE'),
   'operator_dispatch_access',has_table_privilege(r.oid,to_regclass('ride_operator.community_cleanup_dispatches_v1'),'SELECT,INSERT,UPDATE,DELETE'),
   'operator_helper_execute',has_function_privilege(r.oid,to_regprocedure('ride_operator.rs_enqueue_community_cleanup_v1()'),'EXECUTE')
 ) order by r.rolname) from pg_roles r where r.rolname in('anon','authenticated','service_role')),
 'worker_functions',(select jsonb_agg(jsonb_build_object(
   'signature',p.oid::regprocedure::text,'definer',p.prosecdef,'search_path',p.proconfig,
   'anonymous_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
   'app_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
   'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')
 ) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in('rs_claim_community_media_cleanup','rs_ack_community_media_cleanup','rs_release_community_media_cleanup'))
) as community_cleanup_preflight;
