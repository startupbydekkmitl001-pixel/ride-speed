-- REVIEW BEFORE EXECUTION. Operator setup separate from immutable migrations.
-- Installs/activates one minute job; after commit it invokes PERMANENT expired
-- Community binary cleanup. Requires separate human operator authorization.
-- No secret literal is accepted/stored here or in cron.job.command. User must
-- enter project_url + the exact canonical worker credential as service_role_key
-- in Vault. Fixed reviewed project origin; no client-selected URL/path/body.
-- Setup itself does NOT invoke HTTP/cleanup and never enables a pilot policy.
begin;
do $setup$
declare
  selected_job bigint;
  own_count integer;
  helper_oid oid;
  operator_oid oid;
  object_count integer;
  helper_body text := $enqueue_body$
declare
  stamp timestamptz;
  project_origin text;
  worker_key text;
  dispatched_request_id bigint;
  current_operator oid;
begin
  select oid into current_operator from pg_catalog.pg_roles
    where rolname=current_user and rolcanlogin;
  if current_operator is null or not exists(
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ride_operator' and p.proname='rs_enqueue_community_cleanup_v1'
      and p.pronargs=0 and p.proowner=current_operator and not p.prosecdef
  ) then raise exception 'COMMUNITY_CRON_OPERATOR_REQUIRED';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ride-community-cron-dispatch-v1',0));
  stamp:=pg_catalog.clock_timestamp();
  if exists(select 1 from pg_catalog.pg_roles r where r.rolname in('anon','authenticated','service_role')
    and (pg_catalog.has_schema_privilege(r.oid,'vault','USAGE')
      or pg_catalog.has_schema_privilege(r.oid,'net','USAGE')
      or pg_catalog.has_table_privilege(r.oid,'vault.secrets','SELECT,INSERT,UPDATE,DELETE')
      or pg_catalog.has_table_privilege(r.oid,'vault.decrypted_secrets','SELECT')
      or pg_catalog.has_table_privilege(r.oid,'net.http_request_queue','SELECT,INSERT,UPDATE,DELETE')
      or pg_catalog.has_table_privilege(r.oid,'net._http_response','SELECT,INSERT,UPDATE,DELETE')
      or pg_catalog.has_function_privilege(r.oid,'net.http_post(text,jsonb,jsonb,jsonb,integer)','EXECUTE'))
  ) then raise exception 'COMMUNITY_CRON_UNSAFE_EXTENSION_ACL';end if;
  begin perform net.check_worker_is_up();
    exception when others then raise exception 'COMMUNITY_CRON_WORKER_UNAVAILABLE';end;
  if (select count(*) from vault.secrets where name='project_url')<>1
    or (select count(*) from vault.secrets where name='service_role_key')<>1 then
    raise exception 'COMMUNITY_CRON_VAULT_REQUIRED';
  end if;
  select decrypted_secret into project_origin from vault.decrypted_secrets where name='project_url';
  if project_origin is distinct from 'https://mzjmhvwixptrmnaalijt.supabase.co' then
    raise exception 'COMMUNITY_CRON_PROJECT_MISMATCH';
  end if;
  select decrypted_secret into worker_key from vault.decrypted_secrets where name='service_role_key';
  if worker_key is null or length(worker_key) not between 20 and 8192
    or worker_key!~'^[A-Za-z0-9_.-]+$' then raise exception 'COMMUNITY_CRON_KEY_INVALID';end if;

  -- First observed queue absence, not enqueue time, bounds an unknown running
  -- request. A delayed queue can be consumed long after it was enqueued.
  update ride_operator.community_cleanup_dispatches_v1 d set queue_absent_at=stamp
  where d.request_id in(
    select observed.request_id from ride_operator.community_cleanup_dispatches_v1 observed
    where observed.operator_role=current_user and observed.database_name=current_database()
      and observed.queue_absent_at is null
      and not exists(select 1 from net.http_request_queue q where q.id=observed.request_id)
    order by observed.queued_at,observed.request_id limit 1000
  );
  -- Keep own seven-day request metadata, at most1000 expired rows per tick.
  -- A request still in pg_net's queue is retained and blocks new dispatch.
  delete from ride_operator.community_cleanup_dispatches_v1 where request_id in(
    select d.request_id from ride_operator.community_cleanup_dispatches_v1 d
    where d.operator_role=current_user and d.database_name=current_database()
      and d.queued_at<stamp-interval '7 days'
      and not exists(select 1 from net.http_request_queue q where q.id=d.request_id)
      and d.queue_absent_at<=stamp-interval '3 minutes'
    order by d.queued_at,d.request_id limit 1000
  );
  if exists(select 1 from ride_operator.community_cleanup_dispatches_v1
    where operator_role=current_user and database_name=current_database() and queued_at>stamp-interval '1 minute') then
    return jsonb_build_object('enqueued',false,'reason','interval');
  end if;
  if exists(select 1 from ride_operator.community_cleanup_dispatches_v1 d join net.http_request_queue q on q.id=d.request_id
    where d.operator_role=current_user and d.database_name=current_database()) then
    return jsonb_build_object('enqueued',false,'reason','queue_pending');
  end if;
  -- A request consumed by pg_net but without a response waits three minutes
  -- from first observed queue absence, exceeding the free-tier150s limit.
  if exists(select 1 from ride_operator.community_cleanup_dispatches_v1 d
    where d.operator_role=current_user and d.database_name=current_database()
      and coalesce(d.queue_absent_at,stamp)>stamp-interval '3 minutes'
      and not exists(select 1 from net._http_response r where r.id=d.request_id
        and r.status_code in(200,503) and not coalesce(r.timed_out,false) and r.error_msg is null
        and case when length(r.content)<=128 and r.content~
          '^\s*\{\s*"removed"\s*:\s*(0|[1-9][0-9]?)\s*,\s*"failed"\s*:\s*(0|[1-9][0-9]?)\s*\}\s*$|^\s*\{\s*"failed"\s*:\s*(0|[1-9][0-9]?)\s*,\s*"removed"\s*:\s*(0|[1-9][0-9]?)\s*\}\s*$'
          then(r.content::jsonb->>'removed')::integer between 0 and 20
            and(r.content::jsonb->>'failed')::integer between 0 and 20
            and(r.content::jsonb->>'removed')::integer+(r.content::jsonb->>'failed')::integer<=20
            and((r.status_code=200 and(r.content::jsonb->>'failed')::integer=0)
              or(r.status_code=503 and(r.content::jsonb->>'failed')::integer>0))
          else false end
      )) then
    return jsonb_build_object('enqueued',false,'reason','request_unconfirmed');
  end if;
  if (select count(*) from ride_operator.community_cleanup_dispatches_v1
    where operator_role=current_user and database_name=current_database())>=11000 then
    return jsonb_build_object('enqueued',false,'reason','capacity');
  end if;
  if (select count(*) from ride_operator.community_cleanup_dispatches_v1
    where operator_role=current_user and database_name=current_database() and queued_at>stamp-interval '24 hours')>=1440 then
    return jsonb_build_object('enqueued',false,'reason','daily_limit');
  end if;
  begin
    dispatched_request_id:=net.http_post(
      url:='https://mzjmhvwixptrmnaalijt.supabase.co/functions/v1/community-media-cleanup',
      body:='{}'::jsonb,params:='{}'::jsonb,
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_key),
      timeout_milliseconds:=55000
    );
    if dispatched_request_id is null or dispatched_request_id<=0 then raise exception 'invalid dispatch';end if;
    insert into ride_operator.community_cleanup_dispatches_v1(request_id,operator_role,database_name,queued_at)
      values(dispatched_request_id,current_user,current_database(),stamp);
  exception when others then
    -- Never echo an extension error/context that may contain request headers.
    raise exception 'COMMUNITY_CRON_DISPATCH_UNAVAILABLE';
  end;
  return jsonb_build_object('enqueued',true,'reason','queued');
end;
$enqueue_body$;
  job_command text := $job$
set local statement_timeout='5s';
select ride_operator.rs_enqueue_community_cleanup_v1();
delete from cron.job_run_details where runid in (
  select d.runid from cron.job_run_details d join cron.job j using(jobid)
  where j.jobname='ride-community-media-cleanup-v1' and j.username=current_user
    and j.database=current_database()
    and coalesce(d.end_time,d.start_time)<clock_timestamp()-interval '7 days'
  order by coalesce(d.end_time,d.start_time),d.runid limit 1000
);
$job$;
begin
  perform pg_advisory_xact_lock(hashtextextended('ride-community-cron-setup-v1',0));
  if to_regclass('ride_private.community_media_cleanup') is null
    or to_regprocedure('public.rs_claim_community_media_cleanup(integer)') is null
    or to_regprocedure('public.rs_ack_community_media_cleanup(text,text,uuid)') is null
    or to_regprocedure('public.rs_release_community_media_cleanup(text,text,uuid)') is null then
    raise exception 'COMMUNITY_CRON_MIGRATION_REQUIRED';
  end if;
  if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null
    or to_regprocedure('cron.schedule(text,text,text)') is null
    or to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is null
    or to_regclass('vault.secrets') is null or to_regclass('vault.decrypted_secrets') is null
    or to_regclass('net.http_request_queue') is null or to_regclass('net._http_response') is null
    or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
    or to_regprocedure('net.check_worker_is_up()') is null then
    raise exception 'COMMUNITY_CRON_EXTENSION_REQUIRED';
  end if;
  select oid into operator_oid from pg_roles where rolname=current_user and rolcanlogin;
  if operator_oid is null or not has_function_privilege(current_user,'cron.schedule(text,text,text)','EXECUTE')
    or not has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE')
    or not has_function_privilege(current_user,'net.http_post(text,jsonb,jsonb,jsonb,integer)','EXECUTE')
    or not has_table_privilege(current_user,'vault.secrets','SELECT')
    or not has_table_privilege(current_user,'vault.decrypted_secrets','SELECT') then
    raise exception 'COMMUNITY_CRON_OPERATOR_REQUIRED';
  end if;
  if exists(select 1 from pg_roles r where r.rolname in('anon','authenticated','service_role')
    and (has_schema_privilege(r.oid,'vault','USAGE') or has_schema_privilege(r.oid,'net','USAGE')
      or has_table_privilege(r.oid,'vault.secrets','SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege(r.oid,'vault.decrypted_secrets','SELECT')
      or has_table_privilege(r.oid,'net.http_request_queue','SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege(r.oid,'net._http_response','SELECT,INSERT,UPDATE,DELETE')
      or has_function_privilege(r.oid,'net.http_post(text,jsonb,jsonb,jsonb,integer)','EXECUTE'))
  ) then raise exception 'COMMUNITY_CRON_UNSAFE_EXTENSION_ACL';end if;
  if exists(select 1 from pg_proc where oid in(
    'public.rs_claim_community_media_cleanup(integer)'::regprocedure,
    'public.rs_ack_community_media_cleanup(text,text,uuid)'::regprocedure,
    'public.rs_release_community_media_cleanup(text,text,uuid)'::regprocedure)
    and (has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE')
      or not has_function_privilege('service_role',oid,'EXECUTE'))
  ) then raise exception 'COMMUNITY_CRON_WORKER_ACL_REQUIRED';end if;
  begin perform net.check_worker_is_up();
    exception when others then raise exception 'COMMUNITY_CRON_WORKER_UNAVAILABLE';end;
  -- Check named metadata only; setup never selects the service credential.
  if (select count(*) from vault.secrets where name='project_url')<>1
    or (select count(*) from vault.secrets where name='service_role_key')<>1 then
    raise exception 'COMMUNITY_CRON_VAULT_REQUIRED';
  end if;
  if (select decrypted_secret from vault.decrypted_secrets where name='project_url')
    is distinct from 'https://mzjmhvwixptrmnaalijt.supabase.co' then
    raise exception 'COMMUNITY_CRON_PROJECT_MISMATCH';
  end if;
  if exists(select 1 from cron.job where jobname='ride-community-media-cleanup-v1'
    and (username<>current_user or database<>current_database() or schedule<>'* * * * *' or command<>job_command)) then
    raise exception 'COMMUNITY_CRON_JOB_REQUIRES_REVIEW';
  end if;
  select count(*),min(jobid) into own_count,selected_job from cron.job
    where jobname='ride-community-media-cleanup-v1' and username=current_user and database=current_database();
  if own_count>1 then raise exception 'COMMUNITY_CRON_JOB_REQUIRES_REVIEW';end if;

  helper_oid:=to_regprocedure('ride_operator.rs_enqueue_community_cleanup_v1()');
  object_count:=(case when to_regnamespace('ride_operator') is not null then 1 else 0 end)
    +(case when to_regclass('ride_operator.community_cleanup_dispatches_v1') is not null then 1 else 0 end)
    +(case when helper_oid is not null then 1 else 0 end);
  if object_count=0 and own_count=0 then
    execute 'create schema ride_operator';
    execute 'revoke all on schema ride_operator from public,anon,authenticated,service_role';
    execute 'create table ride_operator.community_cleanup_dispatches_v1(request_id bigint primary key check(request_id>0),operator_role name not null,database_name name not null,queued_at timestamptz not null,queue_absent_at timestamptz)';
    execute 'create index community_cleanup_dispatches_v1_time on ride_operator.community_cleanup_dispatches_v1(operator_role,database_name,queued_at,request_id)';
    execute 'alter table ride_operator.community_cleanup_dispatches_v1 enable row level security';
    execute 'revoke all on ride_operator.community_cleanup_dispatches_v1 from public,anon,authenticated,service_role';
    execute format('create function ride_operator.rs_enqueue_community_cleanup_v1() returns jsonb language plpgsql security invoker set search_path='''' as %L',helper_body);
    execute 'revoke all on function ride_operator.rs_enqueue_community_cleanup_v1() from public,anon,authenticated,service_role';
  elsif object_count<>3 or own_count<>1 or not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.oid=helper_oid and p.proowner=operator_oid and n.nspowner=operator_oid
      and p.prosrc=helper_body and not p.prosecdef and p.proconfig=array['search_path=""']::text[]
  ) or not exists(select 1 from pg_class where oid=to_regclass('ride_operator.community_cleanup_dispatches_v1')
    and relowner=operator_oid and relrowsecurity and relkind='r')
    or exists(select 1 from pg_trigger where tgrelid=to_regclass('ride_operator.community_cleanup_dispatches_v1') and not tgisinternal)
    or (select array_agg(attname::text||':'||format_type(atttypid,atttypmod) order by attnum) from pg_attribute
      where attrelid=to_regclass('ride_operator.community_cleanup_dispatches_v1') and attnum>0 and not attisdropped)
      is distinct from array['request_id:bigint','operator_role:name','database_name:name','queued_at:timestamp with time zone','queue_absent_at:timestamp with time zone']::text[]
    or exists(select 1 from pg_policies where schemaname='ride_operator')
    or exists(select 1 from pg_roles r where r.rolname in('anon','authenticated','service_role')
      and (has_schema_privilege(r.oid,'ride_operator','USAGE')
        or has_table_privilege(r.oid,'ride_operator.community_cleanup_dispatches_v1','SELECT,INSERT,UPDATE,DELETE')
        or has_function_privilege(r.oid,helper_oid,'EXECUTE'))) then
    raise exception 'COMMUNITY_CRON_OBJECT_REQUIRES_REVIEW';
  end if;
  if own_count=0 then
    selected_job:=cron.schedule('ride-community-media-cleanup-v1','* * * * *',job_command);
  end if;
  perform cron.alter_job(selected_job,active:=true);
end;
$setup$;
commit;
-- Public metadata only. A scheduled request is not proof of Storage deletion.
select jobname,schedule,active,username,database,
  encode(sha256(convert_to(command,'UTF8')),'hex') as command_sha256
from cron.job where jobname='ride-community-media-cleanup-v1'
  and username=current_user and database=current_database();
