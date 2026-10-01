-- REVIEW/APPROVAL REQUIRED. Fresh-only extension/ACL bootstrap, separate from
-- scheduler installation and immutable migrations. Based on actual read-only
-- preflight: Cron/pg_net absent, Vault present. It NEVER schedules/invokes HTTP,
-- reads a credential, deletes a binary or enables a live/race pilot.
-- PUBLIC-derived and explicit browser/service grants are restricted only on
-- Cron/net/Vault. Explicit grants to other trusted roles are preserved. Review
-- any other automation depending on PUBLIC grants before authorizing this step.
-- Existing extension/namespaces require a new review; never replay blindly.
begin;
do $bootstrap$
declare
  schema_name text;
  operator_oid oid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ride-community-extension-bootstrap-v1',0));
  select oid into operator_oid from pg_roles where rolname=current_user and rolcanlogin;
  if operator_oid is null then raise exception 'COMMUNITY_BOOTSTRAP_OPERATOR_REQUIRED';end if;
  if to_regclass('ride_private.community_media_cleanup') is null then
    raise exception 'COMMUNITY_BOOTSTRAP_MIGRATION_REQUIRED';
  end if;
  if to_regclass('vault.secrets') is null or to_regclass('vault.decrypted_secrets') is null
    or not has_table_privilege(current_user,'vault.secrets','SELECT') then
    raise exception 'COMMUNITY_BOOTSTRAP_VAULT_REQUIRED';
  end if;
  if exists(select 1 from pg_extension where extname in('pg_cron','pg_net'))
    or to_regnamespace('cron') is not null or to_regnamespace('net') is not null then
    raise exception 'COMMUNITY_BOOTSTRAP_EXISTING_EXTENSION_REQUIRES_REVIEW';
  end if;
  if (select count(*) from pg_available_extensions where name in('pg_cron','pg_net')
    and default_version is not null)<>2 then
    raise exception 'COMMUNITY_BOOTSTRAP_EXTENSION_UNAVAILABLE';
  end if;
  -- These are the only extension creation statements. Managed availability,
  -- ownership and API checks are gates; no substitute HTTP client is installed.
  execute 'create extension pg_cron';
  execute 'create extension pg_net';
  if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null
    or to_regprocedure('cron.schedule(text,text,text)') is null
    or to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is null
    or to_regclass('net.http_request_queue') is null or to_regclass('net._http_response') is null
    or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
    or to_regprocedure('net.check_worker_is_up()') is null then
    raise exception 'COMMUNITY_BOOTSTRAP_API_REQUIRED';
  end if;
  foreach schema_name in array array['cron','net','vault'] loop
    execute format('revoke all on schema %I from public,anon,authenticated,service_role',schema_name);
    execute format('revoke all on all tables in schema %I from public,anon,authenticated,service_role',schema_name);
    execute format('revoke all on all sequences in schema %I from public,anon,authenticated,service_role',schema_name);
    execute format('revoke all on all functions in schema %I from public,anon,authenticated,service_role',schema_name);
  end loop;
  -- Effective privileges include inherited roles. If they remain unsafe, abort
  -- atomically; do not alter role membership or unrelated explicit grants.
  if exists(select 1 from pg_roles r where r.rolname in('anon','authenticated','service_role')
    and (has_schema_privilege(r.oid,'cron','USAGE')
      or has_schema_privilege(r.oid,'net','USAGE') or has_schema_privilege(r.oid,'vault','USAGE')
      or has_table_privilege(r.oid,'vault.secrets','SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege(r.oid,'vault.decrypted_secrets','SELECT')
      or has_table_privilege(r.oid,'net.http_request_queue','SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege(r.oid,'net._http_response','SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege(r.oid,'cron.job','SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege(r.oid,'cron.job_run_details','SELECT,INSERT,UPDATE,DELETE')
      or has_function_privilege(r.oid,'net.http_post(text,jsonb,jsonb,jsonb,integer)','EXECUTE')
      or has_function_privilege(r.oid,'cron.schedule(text,text,text)','EXECUTE')
      or has_function_privilege(r.oid,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE'))
  ) then raise exception 'COMMUNITY_BOOTSTRAP_UNSAFE_ACL';end if;
  if not has_schema_privilege(current_user,'cron','USAGE') or not has_schema_privilege(current_user,'net','USAGE')
    or not has_schema_privilege(current_user,'vault','USAGE')
    or not has_table_privilege(current_user,'vault.secrets','SELECT')
    or not has_table_privilege(current_user,'vault.decrypted_secrets','SELECT')
    or not has_table_privilege(current_user,'net.http_request_queue','SELECT')
    or not has_table_privilege(current_user,'net._http_response','SELECT')
    or not has_table_privilege(current_user,'cron.job','SELECT')
    or not has_table_privilege(current_user,'cron.job_run_details','SELECT,DELETE')
    or not has_function_privilege(current_user,'net.http_post(text,jsonb,jsonb,jsonb,integer)','EXECUTE')
    or not has_function_privilege(current_user,'cron.schedule(text,text,text)','EXECUTE')
    or not has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE') then
    raise exception 'COMMUNITY_BOOTSTRAP_OPERATOR_REQUIRED';
  end if;
end;
$bootstrap$;
commit;
-- Metadata only. Follow with frozen read-only catalog preflight, then wait for
-- user-entered Vault values and separately authorized installer. No job exists
-- merely because extensions/ACLs are ready; no worker invocation occurs here.
select extname,extversion from pg_extension where extname in('pg_cron','pg_net','supabase_vault') order by extname;
