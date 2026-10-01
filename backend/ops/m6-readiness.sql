-- Read-only hosted proof. No authentication impersonation, seed or test writes.
select jsonb_build_object(
 'observed_at',clock_timestamp(),
 'private_tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'anon_read',has_table_privilege('anon',c.oid,'SELECT'),'app_read',has_table_privilege('authenticated',c.oid,'SELECT'),'app_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ride_private' and c.relname in('ranked_publications','ranked_operations','ranked_reports','ranked_course_discovery','ranked_hidden_records','ranked_speed_claims')),
 'public_functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definer',p.prosecdef,'search_path',p.proconfig,'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'app_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and(p.proname like 'rs_ranked_%' or p.proname in('rs_get_result_publication','rs_set_ranked_course','rs_moderate_ranked_record','rs_purge_account_data','rs_claim_submission','rs_release_submission','rs_finalize_submission','rs_reject_submission'))),
 'predecessor_helpers',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'app_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and p.proname in('rs_purge_account_data_pre_ranked_v1','rs_claim_submission_pre_ranked_v1','rs_release_submission_pre_ranked_v1','rs_finalize_submission_pre_ranked_v1','rs_reject_submission_pre_ranked_v1')),
 'old_leaderboard_app_execute',has_function_privilege('authenticated','public.rs_leaderboard(text,text,text,uuid)','EXECUTE'),
 'publications',(select count(*) from ride_private.ranked_publications),
 'operations',(select count(*) from ride_private.ranked_operations),
 'reports',(select count(*) from ride_private.ranked_reports),
 'public_courses',(select count(*) from ride_private.ranked_course_discovery),
 'race_policy_enabled',(select enabled from ride_private.race_policy)
) as readiness;
