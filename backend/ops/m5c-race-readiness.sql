-- Read-only catalogs/aggregates; no identity, route, course, GPS, path or secret.
select jsonb_build_object(
 'observed_at',clock_timestamp(),
 'policy',(select jsonb_build_object('enabled',enabled,'live_cap',max_live_races,'evidence_budget_bytes',268435456) from ride_private.race_policy where singleton),
 'reserved_or_stored_evidence_bytes',ride_private.race_reserved_evidence_bytes(),
 'private_tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
  'anon_select',has_table_privilege('anon',c.oid,'select'),'authenticated_select',has_table_privilege('authenticated',c.oid,'select'),
  'authenticated_write',has_table_privilege('authenticated',c.oid,'insert,update,delete')) order by c.relname)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ride_private' and c.relkind='r' and c.relname=any(array[
  'race_policy','race_course_approvals','races','race_members','race_attempts','race_stage_slots','race_clock_probes','race_results',
  'race_operations','race_activation_cancellations','race_admission','race_poll_slots','race_evidence_cleanup'])),
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definer',p.prosecdef,'settings',p.proconfig,
  'anon_execute',has_function_privilege('anon',p.oid,'execute'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'),
  'service_execute',has_function_privilege('service_role',p.oid,'execute')) order by p.proname)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
  'rs_race_mutate','rs_race_operation','rs_cancel_race_activation','rs_list_races','rs_get_race','rs_list_race_approvals','rs_get_race_course',
  'rs_get_race_attempt','rs_list_race_attempts','rs_race_results','rs_race_clock','rs_race_stage','rs_race_heartbeat','rs_approve_race_course',
  'rs_revoke_race_course','rs_claim_race_attempt','rs_release_race_attempt','rs_reject_race_attempt','rs_finalize_race_attempt',
  'rs_race_cleanup','rs_claim_race_evidence_cleanup','rs_ack_race_evidence_cleanup','rs_release_race_evidence_cleanup'])),
 'predecessor_helpers',(select jsonb_build_object('count',count(*),'browser_or_service_execute',coalesce(bool_or(
  has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute')),false))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and p.proname like '%_pre_race_v1'),
 'bucket',(select jsonb_build_object('private',not public,'file_size_limit',file_size_limit,'mime_types',allowed_mime_types) from storage.buckets where id='ride-race-evidence'),
 'retained_counts',jsonb_build_object('approvals',(select count(*) from ride_private.race_course_approvals),'races',(select count(*) from ride_private.races),
  'attempts',(select count(*) from ride_private.race_attempts),'results',(select count(*) from ride_private.race_results),
  'stage_rows',(select count(*) from ride_private.race_stage_slots),'cleanup_due',(select count(*) from ride_private.race_evidence_cleanup where eligible_at<=clock_timestamp())),
 'cron',jsonb_build_object('extension_version',(select extversion from pg_extension where extname='pg_cron'),
  'jobs_table_present',to_regclass('cron.job') is not null,'runs_table_present',to_regclass('cron.job_run_details') is not null,
  'named_schedule_present',to_regprocedure('cron.schedule(text,text,text)') is not null,
  'alter_job_present',to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is not null)
) as race_readiness;
-- Separately inspect private-only Realtime, managed Edge deploys, observed Cron
-- runs and service-authenticated Storage cleanup. This query enables nothing.
