-- Read-only after Cron exists. Metadata only, restricted to our exact own job.
select jobid,jobname,schedule,active,username,database,
  encode(sha256(convert_to(command,'UTF8')),'hex') as command_sha256
from cron.job where jobname='ride-live-cleanup-v1'
  and username=current_user and database=current_database();
select d.runid,d.status,d.start_time,d.end_time,
  extract(epoch from d.end_time-d.start_time) as duration_seconds
from cron.job_run_details d join cron.job j using(jobid)
where j.jobname='ride-live-cleanup-v1' and j.username=current_user and j.database=current_database()
order by d.runid desc limit 10;
select count(*) as retained_runs,count(*) filter(where coalesce(d.end_time,d.start_time)
  <clock_timestamp()-interval '7 days') as old_runs_pending_bounded_cleanup
from cron.job_run_details d join cron.job j using(jobid)
where j.jobname='ride-live-cleanup-v1' and j.username=current_user and j.database=current_database();
