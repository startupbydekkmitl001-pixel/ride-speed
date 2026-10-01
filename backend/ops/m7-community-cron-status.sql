-- READ ONLY after the reviewed installer exists. Run preflight first when
-- extensions/objects may be absent. Never return commands, Vault values, request
-- headers/URLs, raw response bodies/error messages or binary paths.
-- HTTP observations are limited by pg_net's own response retention (normally
-- six hours), independently from our seven-day dispatch/Cron metadata.
with own_job as(
 select * from cron.job where jobname='ride-community-media-cleanup-v1'
   and username=current_user and database=current_database()
), own_dispatch as(
 select d.*,q.id is not null as still_queued,r.status_code,r.timed_out,
   r.error_msg is not null as transport_error,r.created as response_at,
   case when length(r.content)<=128 and r.content~
     '^\s*\{\s*"removed"\s*:\s*(0|[1-9][0-9]?)\s*,\s*"failed"\s*:\s*(0|[1-9][0-9]?)\s*\}\s*$|^\s*\{\s*"failed"\s*:\s*(0|[1-9][0-9]?)\s*,\s*"removed"\s*:\s*(0|[1-9][0-9]?)\s*\}\s*$'
     then r.content::jsonb else null end as counts
 from ride_operator.community_cleanup_dispatches_v1 d
 left join net.http_request_queue q on q.id=d.request_id
 left join lateral(select * from net._http_response r where r.id=d.request_id
   order by r.created desc limit 1) r on true
 where d.operator_role=current_user and d.database_name=current_database()
), safe_dispatch as(
 select *,case when(counts->>'removed')::integer between 0 and 20
   and(counts->>'failed')::integer between 0 and 20
   and(counts->>'removed')::integer+(counts->>'failed')::integer<=20
   and not coalesce(timed_out,false) and not transport_error
   and((status_code=200 and(counts->>'failed')::integer=0)
     or(status_code=503 and(counts->>'failed')::integer>0))
   then counts else null end as worker_counts
 from own_dispatch
), own_runs as(
 select d.status,d.start_time,d.end_time from cron.job_run_details d join own_job j using(jobid)
)
select jsonb_build_object(
 'observed_at',clock_timestamp(),
 'cron',jsonb_build_object(
   'own_job_count',(select count(*) from own_job),
   'active',(select bool_and(active) from own_job),
   'schedule',(select min(schedule) from own_job),
   'command_sha256',(select min(encode(sha256(convert_to(command,'UTF8')),'hex')) from own_job),
   'retained_runs',(select count(*) from own_runs),
   'succeeded_runs',(select count(*) from own_runs where status='succeeded'),
   'failed_runs',(select count(*) from own_runs where status='failed'),
   'old_runs_pending_bounded_cleanup',(select count(*) from own_runs where coalesce(end_time,start_time)<clock_timestamp()-interval '7 days'),
   'last_started_at',(select max(start_time) from own_runs),
   'last_finished_at',(select max(end_time) from own_runs)
 ),
 'dispatch',jsonb_build_object(
   'retained',(select count(*) from safe_dispatch),
   'queued',(select count(*) from safe_dispatch where still_queued),
   'http_succeeded',(select count(*) from safe_dispatch where status_code=200 and not coalesce(timed_out,false) and not transport_error),
   'http_failed',(select count(*) from safe_dispatch where(status_code is not null and status_code<>200) or timed_out or transport_error),
   'response_missing_or_expired',(select count(*) from safe_dispatch where response_at is null and not still_queued),
   'worker_acknowledged',(select count(*) from safe_dispatch where status_code=200 and not coalesce(timed_out,false) and not transport_error and worker_counts is not null and(worker_counts->>'failed')::integer=0),
   'removed',(select coalesce(sum((worker_counts->>'removed')::integer),0) from safe_dispatch where status_code in(200,503)),
   'failed',(select coalesce(sum((worker_counts->>'failed')::integer),0) from safe_dispatch where status_code in(200,503)),
   'last_queued_at',(select max(queued_at) from safe_dispatch),
   'last_response_at',(select max(response_at) from safe_dispatch)
 ),
 'bounds',jsonb_build_object('worker_items_per_request',20,'http_timeout_ms',55000,
   'unknown_request_wait_seconds',180,'dispatches_per_24_hours',1440,
   'dispatch_metadata_rows',11000,'own_retention_days',7,'own_retention_delete_per_tick',1000),
 'community_cleanup_pending',(select count(*) from ride_private.community_media_cleanup),
 'race_policy_enabled',(select enabled from ride_private.race_policy),
 'live_policy_enabled',(select live_enabled from ride_private.live_policy)
) as community_cleanup_status;
