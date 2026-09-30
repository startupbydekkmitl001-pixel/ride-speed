-- Read-only recovery after successful Auth deletion and a lost HTTP response.
-- Keep already-deployed 002 immutable. This is never a deletion authorization.
begin;
create function public.rs_completed_account_deletion(p_owner uuid,p_request uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from ride_private.account_deletion_jobs
    where owner_id=p_owner and request_id=p_request and state='deleted' and completed_at is not null)
$$;
revoke all on function public.rs_completed_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rs_completed_account_deletion(uuid,uuid) to service_role;
commit;
