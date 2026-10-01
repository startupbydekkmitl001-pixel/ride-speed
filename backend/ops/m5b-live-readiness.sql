-- Operator-only, read-only catalog/aggregate readiness after008. No participant,
-- profile, secret, link/code hash, route or coordinate values are returned.
-- Realtime's Allow public access setting lives in middleware: inspect Dashboard
-- separately. SQL policy existence alone cannot prove private socket acceptance.
select jsonb_build_object(
  'observed_at',clock_timestamp(),
  'policy',(select jsonb_build_object('enabled',live_enabled,'room_cap',room_cap) from ride_private.live_policy where singleton),
  'database_bytes',pg_database_size(current_database()),
  'private_tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
    'anon_select',has_table_privilege('anon',c.oid,'select'),
    'authenticated_select',has_table_privilege('authenticated',c.oid,'select'),
    'authenticated_write',has_table_privilege('authenticated',c.oid,'insert,update,delete')) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='ride_private' and c.relkind='r' and c.relname=any(array[
      'friend_links','convoys','convoy_codes','convoy_members','location_consents','live_positions',
      'live_proofs','live_operations','live_grant_cancellations','live_admission','live_poll_slots','live_policy'])),
  'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
    'definer',p.prosecdef,'settings',p.proconfig,'anon_execute',has_function_privilege('anon',p.oid,'execute'),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'),
    'service_execute',has_function_privilege('service_role',p.oid,'execute')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'rs_live_mutate','rs_live_operation','rs_cancel_live_grant','rs_friend_links','rs_resolve_friend_link',
      'rs_resolve_convoy_code','rs_list_convoys','rs_get_convoy','rs_convoy_heartbeat',
      'rs_publish_live_position','rs_convoy_positions','rs_live_cleanup'])),
  'predecessor_helpers',(select jsonb_build_object('count',count(*),
    'browser_or_service_execute',coalesce(bool_or(has_function_privilege('anon',p.oid,'execute')
      or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute')),false))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ride_private' and p.proname like '%_pre_live_v1'),
  'realtime_policy',(select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'qual',qual))
    from pg_policies where schemaname='realtime' and tablename='messages' and policyname='rs_convoy_receive'),
  'retained_counts',jsonb_build_object(
    'rooms',(select count(*) from ride_private.convoys),
    'members',(select count(*) from ride_private.convoy_members),
    'points',(select count(*) from ride_private.live_positions),
    'precise_consents',(select count(*) from ride_private.location_consents where precision='precise'),
    'links',(select count(*) from ride_private.friend_links)),
  'cron',jsonb_build_object(
    'extension_version',(select extversion from pg_extension where extname='pg_cron'),
    'jobs_table_present',to_regclass('cron.job') is not null,
    'runs_table_present',to_regclass('cron.job_run_details') is not null,
    'named_schedule_present',to_regprocedure('cron.schedule(text,text,text)') is not null,
    'alter_job_present',to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is not null)
) as live_readiness;
