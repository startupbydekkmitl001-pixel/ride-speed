-- Reviewed operator setup, separately from immutable008. Requires enabled Cron.
-- Updates only the current operator's exact named job in this database; repeated
-- execution reuses its job ID. It never enables live_policy or edits other jobs.
begin;
do $setup$
declare
  selected_job bigint;
  own_count integer;
  job_command text := $job$
set local statement_timeout='5s';
select public.rs_live_cleanup();
delete from cron.job_run_details where runid in (
  select d.runid from cron.job_run_details d join cron.job j using(jobid)
  where j.jobname='ride-live-cleanup-v1' and j.username=current_user
    and j.database=current_database()
    and coalesce(d.end_time,d.start_time)<clock_timestamp()-interval '7 days'
  order by coalesce(d.end_time,d.start_time),d.runid limit 1000
);
$job$;
begin
  perform pg_advisory_xact_lock(hashtextextended('ride-live-cron-setup-v1',0));
  if to_regclass('ride_private.live_policy') is null
    or to_regprocedure('public.rs_live_cleanup()') is null then
    raise exception 'LIVE_CRON_MIGRATION_REQUIRED';
  end if;
  if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null
    or to_regprocedure('cron.schedule(text,text,text)') is null
    or to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is null then
    raise exception 'LIVE_CRON_EXTENSION_REQUIRED';
  end if;
  if not has_function_privilege(current_user,'public.rs_live_cleanup()','execute')
    or not coalesce((select rolcanlogin from pg_roles where rolname=current_user),false) then
    raise exception 'LIVE_CRON_OPERATOR_REQUIRED';
  end if;
  if exists(select 1 from cron.job where jobname='ride-live-cleanup-v1'
    and (username<>current_user or database<>current_database())) then
    raise exception 'LIVE_CRON_OWNER_OR_DATABASE_MISMATCH';
  end if;
  select count(*),min(jobid) into own_count,selected_job from cron.job
    where jobname='ride-live-cleanup-v1' and username=current_user and database=current_database();
  if own_count>1 then raise exception 'LIVE_CRON_DUPLICATE_REQUIRES_REVIEW';end if;
  if own_count=0 then
    selected_job:=cron.schedule('ride-live-cleanup-v1','* * * * *',job_command);
  end if;
  perform cron.alter_job(selected_job,schedule:='* * * * *',command:=job_command,active:=true);
end;
$setup$;
commit;
-- No manual cleanup run or participant/GPS mutation is used as readiness QA.
select jobid,jobname,schedule,active,username,database,
  encode(sha256(convert_to(command,'UTF8')),'hex') as command_sha256
from cron.job where jobname='ride-live-cleanup-v1'
  and username=current_user and database=current_database();
