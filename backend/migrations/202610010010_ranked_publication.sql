-- M6: bounded boards and distinct explicit result publication. Existing speed
-- consistency semantics and deployed001–009 source remain unchanged.
begin;
create table ride_private.ranked_publications(
 owner_id uuid not null references auth.users(id) on delete cascade,
 metric text not null check(metric in('sustained_speed','route_time')),record_id uuid not null,
 revision integer not null check(revision>0),audience text not null check(audience in('private','friends','global')),
 updated_at timestamptz not null default clock_timestamp(),primary key(metric,record_id)
);
create table ride_private.ranked_operations(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,
 request jsonb not null,applied_at timestamptz not null default clock_timestamp(),result jsonb not null,
 primary key(owner_id,operation_id)
);
create table ride_private.ranked_reports(
 id uuid primary key default gen_random_uuid(),reporter_id uuid not null references auth.users(id) on delete cascade,
 record_owner_id uuid not null references auth.users(id) on delete cascade,metric text not null,record_id uuid not null,
 reason text not null check(reason in('suspected_cheating','unsafe_activity','harassment','other')),
 detail text not null check(length(detail)<=500),created_at timestamptz not null default clock_timestamp(),
 unique(reporter_id,metric,record_id)
);
create table ride_private.ranked_course_discovery(
 approval_id uuid not null references ride_private.race_course_approvals(id) on delete cascade,
 mode text not null check(mode in('async','live')),config_hash text not null,title text not null check(length(title) between 1 and 120),
 category text not null check(category in('scooter','motorcycle','car')),route_revision integer not null,
 enabled boolean not null,updated_at timestamptz not null default clock_timestamp(),primary key(approval_id,mode)
);
create table ride_private.ranked_hidden_records(
 metric text not null,record_id uuid not null,owner_id uuid not null references auth.users(id) on delete cascade,
 hidden boolean not null,reason text not null check(length(reason) between 1 and 120),
 updated_at timestamptz not null default clock_timestamp(),primary key(metric,record_id)
);
-- A service lease can never follow a trusted submission owner reassignment.
-- Only existing genuinely claimed verifying rows are backfilled; no user,
-- result, approval, or evidence is created by this migration.
create table ride_private.ranked_speed_claims(
 submission_id uuid not null references public.rs_submissions(id) on delete cascade,
 verification_token uuid not null,owner_id uuid not null references auth.users(id) on delete cascade,
 claimed_at timestamptz not null,primary key(submission_id,verification_token)
);
insert into ride_private.ranked_speed_claims
 select id,verification_token,owner_id,verification_started_at from public.rs_submissions
 where state='verifying' and verification_token is not null and verification_started_at is not null and verification_attempts between 1 and 3;
create index ranked_publication_owner on ride_private.ranked_publications(owner_id,updated_at desc);
create index ranked_report_queue on ride_private.ranked_reports(created_at,id);
create index race_result_ranked on ride_private.race_results(approval_id,config_hash,verified_at,owner_id);
do $$declare t text;begin foreach t in array array['ranked_publications','ranked_operations','ranked_reports','ranked_course_discovery','ranked_hidden_records','ranked_speed_claims'] loop
 execute format('alter table ride_private.%I enable row level security',t);
 execute format('revoke all on ride_private.%I from public,anon,authenticated,service_role',t);
end loop;end$$;

-- The original sustained-minimum producer bodies remain unchanged and private.
-- Public service entry points fence own account -> global BEFORE submission,
-- challenge, friendship or course rows. No foreign account fence is acquired.
alter function public.rs_claim_submission(uuid,uuid) rename to rs_claim_submission_pre_ranked_v1;
alter function public.rs_claim_submission_pre_ranked_v1(uuid,uuid) set schema ride_private;
alter function public.rs_release_submission(uuid,uuid) rename to rs_release_submission_pre_ranked_v1;
alter function public.rs_release_submission_pre_ranked_v1(uuid,uuid) set schema ride_private;
alter function public.rs_finalize_submission(uuid,numeric,timestamptz,timestamptz,integer,numeric,text,uuid) rename to rs_finalize_submission_pre_ranked_v1;
alter function public.rs_finalize_submission_pre_ranked_v1(uuid,numeric,timestamptz,timestamptz,integer,numeric,text,uuid) set schema ride_private;
alter function public.rs_reject_submission(uuid,text,uuid) rename to rs_reject_submission_pre_ranked_v1;
alter function public.rs_reject_submission_pre_ranked_v1(uuid,text,uuid) set schema ride_private;
create function ride_private.ranked_speed_owner(p_id uuid,p_expected_owner uuid default null,p_token uuid default null,p_require_token boolean default false) returns uuid language plpgsql volatile security definer set search_path='' as $$declare owner_value uuid;current_owner uuid;current_token uuid;begin
 select owner_id into owner_value from public.rs_submissions where id=p_id;
 if not found then if p_require_token then raise exception 'SPEED_LEASE_INVALID' using errcode='42501';end if;return null;end if;
 if p_expected_owner is not null and owner_value<>p_expected_owner then raise exception 'SPEED_LEASE_INVALID' using errcode='42501';end if;
 perform ride_private.account_lock(owner_value);perform ride_private.live_control_lock();
 select owner_id,verification_token into current_owner,current_token from public.rs_submissions where id=p_id for update;
 if not found or current_owner is distinct from owner_value then raise exception 'SPEED_LEASE_INVALID' using errcode='42501';end if;
 if p_require_token and(p_token is null or current_token is distinct from p_token or not exists(select 1 from ride_private.ranked_speed_claims l where l.submission_id=p_id and l.verification_token=p_token and l.owner_id=owner_value)) then raise exception 'SPEED_LEASE_INVALID' using errcode='42501';end if;
 return owner_value;
end$$;
create function public.rs_claim_submission(p_id uuid,p_owner uuid) returns uuid language plpgsql security definer set search_path='' as $$declare owner_value uuid;token uuid;bound_owner uuid;begin
 owner_value:=ride_private.ranked_speed_owner(p_id,p_owner);
 if owner_value is null or p_owner is null or not ride_private.account_active(owner_value) then return null;end if;
 token:=ride_private.rs_claim_submission_pre_ranked_v1(p_id,p_owner);if token is null then return null;end if;
 select owner_id into bound_owner from ride_private.ranked_speed_claims where submission_id=p_id and verification_token=token;
 if found and bound_owner<>owner_value then raise exception 'SPEED_LEASE_INVALID' using errcode='42501';end if;
 insert into ride_private.ranked_speed_claims values(p_id,token,owner_value,clock_timestamp()) on conflict(submission_id,verification_token) do nothing;return token;
end$$;
create function public.rs_release_submission(p_id uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform ride_private.ranked_speed_owner(p_id,null,p_token,true);perform ride_private.rs_release_submission_pre_ranked_v1(p_id,p_token);
 delete from ride_private.ranked_speed_claims where submission_id=p_id and verification_token=p_token;
end$$;
create function public.rs_finalize_submission(p_id uuid,p_speed numeric,p_start timestamptz,p_end timestamptz,p_samples integer,p_max_gap numeric,p_sha256 text,p_token uuid default null) returns void language plpgsql security definer set search_path='' as $$begin
 perform ride_private.ranked_speed_owner(p_id,null,p_token,true);
 perform ride_private.rs_finalize_submission_pre_ranked_v1(p_id,p_speed,p_start,p_end,p_samples,p_max_gap,p_sha256,p_token);
 delete from ride_private.ranked_speed_claims where submission_id=p_id;
end$$;
create function public.rs_reject_submission(p_id uuid,p_reason text,p_token uuid default null) returns boolean language plpgsql security definer set search_path='' as $$declare owner_value uuid;rejected boolean;begin
 owner_value:=ride_private.ranked_speed_owner(p_id,null,p_token,p_token is not null);if owner_value is null then return false;end if;
 rejected:=ride_private.rs_reject_submission_pre_ranked_v1(p_id,p_reason,p_token);if rejected then delete from ride_private.ranked_speed_claims where submission_id=p_id;end if;return rejected;
end$$;

create function ride_private.ranked_reject(code text) returns void language plpgsql immutable set search_path='' as $$begin raise exception '%',code using errcode='RK001';end$$;
create function ride_private.ranked_error(code text,retry integer default null) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('error',case when code='RANKED_RATE_LIMITED' then jsonb_build_object('code',code,'retry_after_ms',retry) else jsonb_build_object('code',code) end)$$;
create function ride_private.ranked_utc(stamp timestamptz) returns text language sql immutable set search_path='' as $$select to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')$$;
create function ride_private.ranked_actor() returns uuid language plpgsql volatile set search_path='' as $$declare uid uuid:=auth.uid();begin
 if uid is null then perform ride_private.ranked_reject('RANKED_AUTH_REQUIRED');end if;
 perform ride_private.account_lock(uid);perform ride_private.live_control_lock();
 if not ride_private.account_active(uid) then perform ride_private.ranked_reject('ACCOUNT_DELETION_PENDING');end if;return uid;
end$$;
create function ride_private.ranked_window(stamp timestamptz,period text) returns jsonb language plpgsql immutable set search_path='' as $$declare lo timestamptz;hi timestamptz;begin
 if stamp is null or not coalesce(period in('today','week','month'),false) then perform ride_private.ranked_reject('RANKED_INVALID');end if;
 lo:=date_trunc(case when period='today' then 'day' else period end,stamp at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
 hi:=((lo at time zone 'Asia/Bangkok')+case period when 'today' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end) at time zone 'Asia/Bangkok';
 return jsonb_build_object('timezone','Asia/Bangkok','starts_at',ride_private.ranked_utc(lo),'ends_at',ride_private.ranked_utc(hi),'as_of',ride_private.ranked_utc(stamp));
end$$;
create function ride_private.ranked_class(category text,vehicle jsonb) returns text language plpgsql immutable set search_path='' as $$declare cc numeric;begin
 if category not in('scooter','motorcycle','car') then return null;end if;
 if vehicle->>'powertrain'='electric' then return category||':ev';end if;
 if category='car' or jsonb_typeof(vehicle->'engine_cc') is distinct from 'number' then return category||':unknown';end if;
 cc:=(vehicle->>'engine_cc')::numeric;if cc<=0 or cc>100000 then return category||':unknown';end if;
 return category||case when category='scooter' then case when cc<=125 then ':le125' when cc<=160 then ':gt125_le160' else ':gt160' end else case when cc<=500 then ':le500' when cc<=900 then ':gt500_le900' else ':gt900' end end;
end$$;
create function ride_private.ranked_filter(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare required text[]:=array['schema_version','period','metric','category','class_key','scope','course'];category text:=p->>'category';classes text[];key text;begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>2048 or not p?&required or p-required<>'{}' or p->'schema_version'<>'1'::jsonb then perform ride_private.ranked_reject('RANKED_INVALID');end if;
 foreach key in array array['period','metric','category','class_key','scope'] loop if jsonb_typeof(p->key) is distinct from 'string' then perform ride_private.ranked_reject('RANKED_INVALID');end if;end loop;
 if p->>'period' not in('today','week','month') or p->>'metric' not in('sustained_speed','route_time') or category not in('scooter','motorcycle','car') or p->>'scope' not in('global','friends') then perform ride_private.ranked_reject('RANKED_INVALID');end if;
 classes:=array['all',category||':unknown',category||':ev']||case category when 'scooter' then array['scooter:le125','scooter:gt125_le160','scooter:gt160'] when 'motorcycle' then array['motorcycle:le500','motorcycle:gt500_le900','motorcycle:gt900'] else array[]::text[] end;
 if not coalesce(p->>'class_key'=any(classes),false) then perform ride_private.ranked_reject('RANKED_INVALID');end if;
 if p->'course'<>'null'::jsonb then
  if p->>'metric'<>'route_time' or jsonb_typeof(p->'course')<>'object' or not(p->'course')?&array['approval_id','config_hash','mode'] or(p->'course')-array['approval_id','config_hash','mode']<>'{}' or not ride_private.race_uuid(p->'course'->'approval_id') or jsonb_typeof(p->'course'->'config_hash')<>'string' or p->'course'->>'config_hash'!~'^[a-f0-9]{64}$' or not coalesce(p->'course'->>'mode' in('async','live'),false) then perform ride_private.ranked_reject('RANKED_INVALID');end if;
 end if;return p;
end$$;
-- Only sanitized canonical qualified results. No route pins, source evidence,
-- instantaneous ride/race maxima, present Garage edits or attestation claims.
create function ride_private.ranked_records() returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('owner_id',v.owner_id,'record_id',v.submission_id,'metric','sustained_speed','method','sustained_min_3s_v1','quality','submitted_evidence_consistency','category',v.category,'class_key',v.category||':unknown','class_scheme_version',1,'metadata_authority','unknown','completed_at',ride_private.ranked_utc(v.window_end),'verified_at',ride_private.ranked_utc(v.verified_at),'provenance_unknown',true,'sustained_kmh',v.sustained_kmh)
 from public.rs_verified_records v join public.rs_submissions s on s.id=v.submission_id join public.rs_challenges c on c.id=v.challenge_id join public.rs_course_sessions cs on cs.id=c.course_session_id join public.rs_courses co on co.id=v.course_id
 where s.state='verified' and v.method='sustained_min_3s_v1' and c.state='open' and cs.approved and co.closed_course_approved and v.category in('scooter','motorcycle','car') and ride_private.account_active(v.owner_id) and ride_private.account_active(c.creator_id)
 union all
 select jsonb_build_object('owner_id',v.owner_id,'record_id',v.attempt_id,'metric','route_time','method','route_time_v1','quality','native_evidence_consistency','category',ap.category,'class_key',ride_private.ranked_class(ap.category,a.vehicle),'class_scheme_version',1,'metadata_authority',case when a.vehicle is null then 'unknown' else 'self_reported' end,'completed_at',ride_private.ranked_utc(to_timestamp((v.result->'finish_interval'->>'upper_ms')::numeric/1000)),'verified_at',ride_private.ranked_utc(v.verified_at),'provenance_unknown',v.result->'provenance_unknown','elapsed_lower_ms',v.result->'elapsed_lower_ms','elapsed_upper_ms',v.result->'elapsed_upper_ms','course',jsonb_build_object('approval_id',v.approval_id,'config_hash',v.config_hash,'mode',r.mode),'finish_lower_ms',v.result->'finish_interval'->'lower_ms','finish_upper_ms',v.result->'finish_interval'->'upper_ms')
 from ride_private.race_results v join ride_private.race_attempts a on a.id=v.attempt_id join ride_private.races r on r.id=v.race_id join ride_private.race_course_approvals ap on ap.id=v.approval_id
 where a.state='verified' and v.result->>'method'='route_time_v1' and v.result->>'quality'='native_evidence_consistency' and ride_private.race_approval_valid(ap.id) and ride_private.account_active(v.owner_id)
$$;
create function ride_private.ranked_record(metric_value text,record_value uuid) returns jsonb language sql stable security definer set search_path='' as $$select value from ride_private.ranked_records() value where value->>'metric'=metric_value and(value->>'record_id')::uuid=record_value$$;
create function ride_private.ranked_publication(uid uuid,metric_value text,record_value uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('owner_id',uid,'metric',metric_value,'record_id',record_value,'revision',coalesce(p.revision,0),'audience',coalesce(p.audience,'private'),'updated_at',ride_private.ranked_utc(p.updated_at)) from (values(1)) base(n) left join ride_private.ranked_publications p on p.metric=metric_value and p.record_id=record_value and p.owner_id=uid
$$;
create function ride_private.ranked_course_enabled(course jsonb) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from ride_private.ranked_course_discovery d where d.approval_id=(course->>'approval_id')::uuid and d.config_hash=course->>'config_hash' and d.mode=course->>'mode' and d.enabled and ride_private.race_approval_valid(d.approval_id))$$;
create function ride_private.ranked_visible(uid uuid,record jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select not ride_private.blocked(uid,(record->>'owner_id')::uuid) and not exists(select 1 from ride_private.ranked_hidden_records h where h.metric=record->>'metric' and h.record_id=(record->>'record_id')::uuid and h.hidden) and exists(select 1 from ride_private.ranked_publications p where p.metric=record->>'metric' and p.record_id=(record->>'record_id')::uuid and p.owner_id=(record->>'owner_id')::uuid and(p.owner_id=uid or p.audience='global' or(p.audience='friends' and ride_private.friends(uid,p.owner_id))))
$$;
create function ride_private.ranked_receipt(uid uuid,operation uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('owner_id',owner_id,'operation_id',operation_id,'request',request,'applied_at',ride_private.ranked_utc(applied_at),'result',result) from ride_private.ranked_operations where owner_id=uid and operation_id=operation$$;

create function public.rs_ranked_operation(p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;begin uid:=ride_private.ranked_actor();if p_operation is null then return ride_private.ranked_error('RANKED_INVALID');end if;return ride_private.ranked_receipt(uid,p_operation);exception when sqlstate 'RK001' then return ride_private.ranked_error(sqlerrm);end$$;
create function public.rs_get_result_publication(p_metric text,p_record uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;r jsonb;retry integer;begin
 uid:=ride_private.ranked_actor();if p_metric is null or p_metric not in('sustained_speed','route_time') or p_record is null then return ride_private.ranked_error('RANKED_INVALID');end if;
 retry:=ride_private.race_admit(uid,'ranked_read',60,5000,50000);if retry is not null then return ride_private.ranked_error('RANKED_RATE_LIMITED',retry);end if;r:=ride_private.ranked_record(p_metric,p_record);
 if not coalesce((r->>'owner_id')::uuid=uid,false) and not exists(select 1 from ride_private.ranked_publications where metric=p_metric and record_id=p_record and owner_id=uid) then return ride_private.ranked_error('RANKED_RECORD_UNAVAILABLE');end if;return ride_private.ranked_publication(uid,p_metric,p_record);
exception when sqlstate 'RK001' then return ride_private.ranked_error(sqlerrm);end$$;
create function public.rs_ranked_mutate(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;p jsonb:=p_request;required text[];previous ride_private.ranked_operations;record jsonb;publication jsonb;result jsonb;retry integer;report ride_private.ranked_reports;metric_value text;record_value uuid;action_value text;applied timestamptz;
begin
 uid:=ride_private.ranked_actor();action_value:=p->>'action';
 if jsonb_typeof(p->'action') is distinct from 'string' or not coalesce(action_value in('publication_set','report_record'),false) then return ride_private.ranked_error('RANKED_INVALID');end if;
 required:=array['schema_version','action','metric','record_id']||case action_value when 'publication_set' then array['expected_revision','audience'] when 'report_record' then array['reason','detail'] else null end;
 if p_operation is null or p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>4096 or required is null or not p?&required or p-required<>'{}' or p->'schema_version'<>'1'::jsonb or not ride_private.race_uuid(p->'record_id') or not coalesce(p->>'metric' in('sustained_speed','route_time'),false) then return ride_private.ranked_error('RANKED_INVALID');end if;
 if action_value='publication_set' and(not ride_private.ride_number(p->'expected_revision',0,2147483647,false,true) or not coalesce(p->>'audience' in('private','friends','global'),false)) then return ride_private.ranked_error('RANKED_INVALID');end if;
 if action_value='report_record' and(not coalesce(p->>'reason' in('suspected_cheating','unsafe_activity','harassment','other'),false) or jsonb_typeof(p->'detail')<>'string' or length(p->>'detail')>500 or p->>'detail'~'[[:cntrl:]]') then return ride_private.ranked_error('RANKED_INVALID');end if;
 select * into previous from ride_private.ranked_operations where owner_id=uid and operation_id=p_operation;
 if found then if previous.request<>p then return ride_private.ranked_error('RANKED_OPERATION_CONFLICT');end if;return ride_private.ranked_receipt(uid,p_operation);end if;
 retry:=ride_private.race_admit(uid,'ranked_control',60,100,5000);if retry is not null then return ride_private.ranked_error('RANKED_RATE_LIMITED',retry);end if;
 -- Admission remains outside recognized business rejection rollback. Unknown
 -- SQL errors propagate as transport uncertainty, never definitive rejection.
 begin
  applied:=clock_timestamp();metric_value:=p->>'metric';record_value:=(p->>'record_id')::uuid;record:=ride_private.ranked_record(metric_value,record_value);
  -- Revocation remains possible if approval/verification has become ineligible;
  -- an existing own publication proves only this owner-bound setting, never
  -- qualification. Re-sharing still requires a current genuine record.
  if record is null and action_value='publication_set' and p->>'audience'='private' and exists(select 1 from ride_private.ranked_publications where metric=metric_value and record_id=record_value and owner_id=uid) then record:=jsonb_build_object('owner_id',uid);end if;
  if record is null then perform ride_private.ranked_reject('RANKED_RECORD_UNAVAILABLE');end if;
  if action_value='publication_set' then
   if(record->>'owner_id')::uuid<>uid then perform ride_private.ranked_reject('RANKED_RECORD_UNAVAILABLE');end if;
   publication:=ride_private.ranked_publication(uid,metric_value,record_value);
   if(publication->>'revision')::integer<>(p->>'expected_revision')::integer then perform ride_private.ranked_reject('RANKED_PUBLICATION_CHANGED');end if;
   if(publication->>'revision')::integer=2147483647 then perform ride_private.ranked_reject('RANKED_PUBLICATION_CHANGED');end if;
   if p->>'audience'<>'private' then
    if not exists(select 1 from public.rs_profiles where user_id=uid) then perform ride_private.ranked_reject('RANKED_PROFILE_REQUIRED');end if;
    if exists(select 1 from ride_private.ranked_hidden_records where metric=metric_value and record_id=record_value and hidden) then perform ride_private.ranked_reject('RANKED_RECORD_UNAVAILABLE');end if;
    if metric_value='route_time' and not ride_private.ranked_course_enabled(record->'course') then perform ride_private.ranked_reject('RANKED_COURSE_UNAVAILABLE');end if;
   end if;
   insert into ride_private.ranked_publications(owner_id,metric,record_id,revision,audience,updated_at) values(uid,metric_value,record_value,(publication->>'revision')::integer+1,p->>'audience',applied) on conflict(metric,record_id) do update set revision=excluded.revision,audience=excluded.audience,updated_at=excluded.updated_at;
   result:=ride_private.ranked_publication(uid,metric_value,record_value);
  else
   if(record->>'owner_id')::uuid<>uid and not ride_private.ranked_visible(uid,record) then perform ride_private.ranked_reject('RANKED_RECORD_UNAVAILABLE');end if;
   if metric_value='route_time' and not ride_private.ranked_course_enabled(record->'course') then perform ride_private.ranked_reject('RANKED_RECORD_UNAVAILABLE');end if;
   insert into ride_private.ranked_reports(reporter_id,record_owner_id,metric,record_id,reason,detail) values(uid,(record->>'owner_id')::uuid,metric_value,record_value,p->>'reason',p->>'detail') on conflict(reporter_id,metric,record_id) do nothing;
   select * into report from ride_private.ranked_reports where reporter_id=uid and metric=metric_value and record_id=record_value;
   result:=jsonb_build_object('report_id',report.id,'metric',metric_value,'record_id',record_value,'state','received','created_at',ride_private.ranked_utc(report.created_at));
  end if;
  insert into ride_private.ranked_operations(owner_id,operation_id,request,result,applied_at) values(uid,p_operation,p,result,applied);return ride_private.ranked_receipt(uid,p_operation);
 exception when sqlstate 'RK001' then return ride_private.ranked_error(sqlerrm);end;
exception when sqlstate 'RK001' then return ride_private.ranked_error(sqlerrm);end$$;

create function public.rs_set_ranked_course(p_approval uuid,p_mode text,p_title text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$declare approval ride_private.race_course_approvals;begin
 if p_approval is null or p_mode is null or p_mode not in('async','live') or p_enabled is null or p_title is null or length(trim(p_title)) not between 1 and 120 or p_title~'[[:cntrl:]]' then perform ride_private.ranked_reject('RANKED_INVALID');end if;
 select * into approval from ride_private.race_course_approvals where id=p_approval;if not found then perform ride_private.ranked_reject('RANKED_COURSE_UNAVAILABLE');end if;
 perform ride_private.account_lock(approval.owner_id);perform ride_private.live_control_lock();
 if p_enabled and not ride_private.race_approval_valid(p_approval) then perform ride_private.ranked_reject('RANKED_COURSE_UNAVAILABLE');end if;
 insert into ride_private.ranked_course_discovery values(p_approval,p_mode,approval.config_hash,trim(p_title),approval.category,approval.route_revision,p_enabled,clock_timestamp()) on conflict(approval_id,mode) do update set title=excluded.title,enabled=excluded.enabled,updated_at=excluded.updated_at;
end$$;
create function public.rs_moderate_ranked_record(p_metric text,p_record uuid,p_hidden boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare record jsonb;begin
 if p_metric is null or p_metric not in('sustained_speed','route_time') or p_record is null or p_hidden is null or p_reason is null or length(trim(p_reason)) not between 1 and 120 or p_reason~'[[:cntrl:]]' then perform ride_private.ranked_reject('RANKED_INVALID');end if;
 record:=ride_private.ranked_record(p_metric,p_record);if record is null then perform ride_private.ranked_reject('RANKED_RECORD_UNAVAILABLE');end if;
 perform ride_private.account_lock((record->>'owner_id')::uuid);perform ride_private.live_control_lock();
 insert into ride_private.ranked_hidden_records values(p_metric,p_record,(record->>'owner_id')::uuid,p_hidden,trim(p_reason),clock_timestamp()) on conflict(metric,record_id) do update set hidden=excluded.hidden,reason=excluded.reason,updated_at=excluded.updated_at;
end$$;
create function public.rs_ranked_reports(p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;next jsonb;begin
 if p_limit is null or p_limit not between 1 and 30 or(p_before is null)<>(p_before_id is null) then perform ride_private.ranked_reject('RANKED_INVALID');end if;
 select coalesce(jsonb_agg(jsonb_build_object('report_id',id,'reporter_id',reporter_id,'record_owner_id',record_owner_id,'metric',metric,'record_id',record_id,'reason',reason,'detail',detail,'created_at',ride_private.ranked_utc(created_at)) order by created_at desc,id desc),'[]') into items from(select * from ride_private.ranked_reports where p_before is null or(created_at,id)<(p_before,p_before_id) order by created_at desc,id desc limit p_limit+1)x;
 if jsonb_array_length(items)>p_limit then items:=items-p_limit;next:=jsonb_build_object('created_at',items->(p_limit-1)->'created_at','report_id',items->(p_limit-1)->'report_id');end if;
 return jsonb_build_object('items',items,'next_cursor',next);
end$$;

create function public.rs_ranked_courses(p_cursor jsonb default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;items jsonb;next jsonb;begin
 uid:=ride_private.ranked_actor();if p_limit is null or p_limit not between 1 and 30 then return ride_private.ranked_error('RANKED_INVALID');end if;
 if p_cursor is not null and(jsonb_typeof(p_cursor)<>'object' or not p_cursor?&array['approval_id','mode'] or p_cursor-array['approval_id','mode']<>'{}' or not ride_private.race_uuid(p_cursor->'approval_id') or not coalesce(p_cursor->>'mode' in('async','live'),false)) then return ride_private.ranked_error('RANKED_INVALID');end if;
 retry:=ride_private.race_admit(uid,'ranked_read',60,5000,50000);if retry is not null then return ride_private.ranked_error('RANKED_RATE_LIMITED',retry);end if;
 select coalesce(jsonb_agg(jsonb_build_object('approval_id',approval_id,'config_hash',config_hash,'mode',mode,'title',title,'category',category,'route_revision',route_revision) order by approval_id,mode),'[]') into items from(select d.* from ride_private.ranked_course_discovery d where enabled and ride_private.race_approval_valid(approval_id) and not exists(select 1 from ride_private.race_course_approvals a where a.id=d.approval_id and ride_private.blocked(uid,a.owner_id)) and(p_cursor is null or(d.approval_id,d.mode)>((p_cursor->>'approval_id')::uuid,p_cursor->>'mode')) order by approval_id,mode limit p_limit+1)x;
 if jsonb_array_length(items)>p_limit then items:=items-(p_limit);next:=jsonb_build_object('approval_id',items->(p_limit-1)->'approval_id','mode',items->(p_limit-1)->'mode');end if;
 return jsonb_build_object('owner_id',uid,'server_now',ride_private.ranked_utc(clock_timestamp()),'items',items,'next_cursor',next);
exception when sqlstate 'RK001' then return ride_private.ranked_error(sqlerrm);end$$;

create function public.rs_ranked_own_records(p_cursor jsonb default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;items jsonb;next jsonb;stamp timestamptz;begin
 uid:=ride_private.ranked_actor();stamp:=clock_timestamp();if p_limit is null or p_limit not between 1 and 30 then return ride_private.ranked_error('RANKED_INVALID');end if;
 if p_cursor is not null then
  if jsonb_typeof(p_cursor)<>'object' or not p_cursor?&array['completed_at','record_id','metric'] or p_cursor-array['completed_at','record_id','metric']<>'{}' or not ride_private.race_uuid(p_cursor->'record_id') or not coalesce(p_cursor->>'metric' in('sustained_speed','route_time'),false) or jsonb_typeof(p_cursor->'completed_at') is distinct from 'string' then return ride_private.ranked_error('RANKED_INVALID');end if;
  begin perform ride_private.race_stamp(p_cursor->'completed_at');exception when sqlstate 'RC001' then return ride_private.ranked_error('RANKED_INVALID');end;
 end if;
 retry:=ride_private.race_admit(uid,'ranked_read',60,5000,50000);if retry is not null then return ride_private.ranked_error('RANKED_RATE_LIMITED',retry);end if;
 select coalesce(jsonb_agg((value-array['owner_id','finish_lower_ms','finish_upper_ms'])||jsonb_build_object('publication',ride_private.ranked_publication(uid,value->>'metric',(value->>'record_id')::uuid)-array['owner_id','metric','record_id']) order by(value->>'completed_at')::timestamptz desc,value->>'record_id' desc,value->>'metric' desc),'[]') into items from(select value from ride_private.ranked_records() value where(value->>'owner_id')::uuid=uid and(value->>'completed_at')::timestamptz<=stamp and(value->>'verified_at')::timestamptz<=stamp and(p_cursor is null or((value->>'completed_at')::timestamptz,(value->>'record_id')::uuid,value->>'metric')<(ride_private.race_stamp(p_cursor->'completed_at'),(p_cursor->>'record_id')::uuid,p_cursor->>'metric')) order by(value->>'completed_at')::timestamptz desc,value->>'record_id' desc,value->>'metric' desc limit p_limit+1)x;
 if jsonb_array_length(items)>p_limit then items:=items-p_limit;next:=jsonb_build_object('completed_at',items->(p_limit-1)->'completed_at','record_id',items->(p_limit-1)->'record_id','metric',items->(p_limit-1)->'metric');end if;
 return jsonb_build_object('owner_id',uid,'server_now',ride_private.ranked_utc(stamp),'items',items,'next_cursor',next);
exception when sqlstate 'RK001' then return ride_private.ranked_error(sqlerrm);end$$;

-- Sharing settings are independent of current qualification. Owners must be
-- able to discover and revoke a prior share after an approval expires.
create function public.rs_ranked_publications(p_cursor jsonb default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$declare uid uuid;retry integer;items jsonb;next jsonb;stamp timestamptz;begin
 uid:=ride_private.ranked_actor();stamp:=clock_timestamp();if p_limit is null or p_limit not between 1 and 30 then return ride_private.ranked_error('RANKED_INVALID');end if;
 if p_cursor is not null then
  if jsonb_typeof(p_cursor)<>'object' or not p_cursor?&array['updated_at','record_id','metric'] or p_cursor-array['updated_at','record_id','metric']<>'{}' or not ride_private.race_uuid(p_cursor->'record_id') or not coalesce(p_cursor->>'metric' in('sustained_speed','route_time'),false) or jsonb_typeof(p_cursor->'updated_at') is distinct from 'string' then return ride_private.ranked_error('RANKED_INVALID');end if;
  begin perform ride_private.race_stamp(p_cursor->'updated_at');exception when sqlstate 'RC001' then return ride_private.ranked_error('RANKED_INVALID');end;
 end if;
 retry:=ride_private.race_admit(uid,'ranked_read',60,5000,50000);if retry is not null then return ride_private.ranked_error('RANKED_RATE_LIMITED',retry);end if;
 select coalesce(jsonb_agg(ride_private.ranked_publication(uid,metric,record_id) order by updated_at desc,record_id desc,metric desc),'[]') into items from(select * from ride_private.ranked_publications where owner_id=uid and updated_at<=stamp and(p_cursor is null or(updated_at,record_id,metric)<(ride_private.race_stamp(p_cursor->'updated_at'),(p_cursor->>'record_id')::uuid,p_cursor->>'metric')) order by updated_at desc,record_id desc,metric desc limit p_limit+1)x;
 if jsonb_array_length(items)>p_limit then items:=items-p_limit;next:=jsonb_build_object('updated_at',items->(p_limit-1)->'updated_at','record_id',items->(p_limit-1)->'record_id','metric',items->(p_limit-1)->'metric');end if;
 return jsonb_build_object('owner_id',uid,'server_now',ride_private.ranked_utc(stamp),'items',items,'next_cursor',next);
exception when sqlstate 'RK001' then return ride_private.ranked_error(sqlerrm);end$$;

create function public.rs_ranked_page(p_filter jsonb,p_cursor jsonb default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;f jsonb;retry integer;stamp timestamptz;as_of timestamptz;period jsonb;start_at timestamptz;end_at timestamptz;filter_hash text;revision text;candidates jsonb;rows jsonb;items jsonb;podium jsonb;self jsonb;status text;next jsonb;after_position integer:=0;
begin
 uid:=ride_private.ranked_actor();f:=ride_private.ranked_filter(p_filter);stamp:=clock_timestamp();as_of:=stamp;period:=ride_private.ranked_window(stamp,f->>'period');start_at:=(period->>'starts_at')::timestamptz;end_at:=(period->>'ends_at')::timestamptz;filter_hash:=encode(sha256(convert_to(f::text,'UTF8')),'hex');
 if p_limit is null or p_limit not between 1 and 30 then return ride_private.ranked_error('RANKED_INVALID');end if;
 if p_cursor is not null then
  if jsonb_typeof(p_cursor)<>'object' or not p_cursor?&array['owner_id','filter_hash','board_revision','starts_at','ends_at','as_of','after_position'] or p_cursor-array['owner_id','filter_hash','board_revision','starts_at','ends_at','as_of','after_position']<>'{}' or not ride_private.race_uuid(p_cursor->'owner_id') or not ride_private.ride_number(p_cursor->'after_position',1,10000,false,true) or not coalesce(p_cursor->>'board_revision'~'^[a-f0-9]{64}$',false) or not coalesce(p_cursor->>'filter_hash'~'^[a-f0-9]{64}$',false) or jsonb_typeof(p_cursor->'starts_at') is distinct from 'string' or jsonb_typeof(p_cursor->'ends_at') is distinct from 'string' or jsonb_typeof(p_cursor->'as_of') is distinct from 'string' then return ride_private.ranked_error('RANKED_INVALID');end if;
  begin as_of:=ride_private.race_stamp(p_cursor->'as_of');if ride_private.race_stamp(p_cursor->'starts_at')<>start_at or ride_private.race_stamp(p_cursor->'ends_at')<>end_at or as_of>stamp or(p_cursor->>'owner_id')::uuid<>uid or p_cursor->>'filter_hash'<>filter_hash then return ride_private.ranked_error('RANKED_CHANGED');end if;exception when sqlstate 'RC001' then return ride_private.ranked_error('RANKED_INVALID');end;
  after_position:=(p_cursor->>'after_position')::integer;period:=ride_private.ranked_window(as_of,f->>'period');
 end if;
 retry:=ride_private.race_admit(uid,'ranked_read',60,5000,50000);if retry is not null then return ride_private.ranked_error('RANKED_RATE_LIMITED',retry);end if;
 if f->'course'<>'null'::jsonb and not ride_private.ranked_course_enabled(f->'course') then return ride_private.ranked_error('RANKED_COURSE_UNAVAILABLE');end if;
 -- Freeze one canonical eligible snapshot, including own private/class-missing
 -- status. Hash it before pagination; no private peer rows or persisted board.
 select coalesce(jsonb_agg(value order by value->>'record_id'),'[]') into candidates from(
  select value||jsonb_build_object('audience',coalesce(pub.audience,'private'),'publication_revision',coalesce(pub.revision,0),'friend_generation',case when f->>'scope'='friends' then ride_private.live_friend_generation(uid,(value->>'owner_id')::uuid) else null end,'profile',jsonb_build_object('name',case when length(trim(regexp_replace(pr.display_name,'[[:cntrl:]]','','g'))) between 1 and 80 then trim(regexp_replace(pr.display_name,'[[:cntrl:]]','','g')) else pr.handle end,'handle',pr.handle)) value
  from ride_private.ranked_records() value join public.rs_profiles pr on pr.user_id=(value->>'owner_id')::uuid left join ride_private.ranked_publications pub on pub.metric=value->>'metric' and pub.record_id=(value->>'record_id')::uuid
  where value->>'metric'=f->>'metric' and value->>'category'=f->>'category' and(f->>'metric'='sustained_speed' or(f->'course'<>'null'::jsonb and value->'course'=f->'course')) and(value->>'completed_at')::timestamptz>=start_at and(value->>'completed_at')::timestamptz<end_at and(value->>'completed_at')::timestamptz<=stamp and(value->>'verified_at')::timestamptz<=stamp
  and(f->>'metric'='sustained_speed' or((value->>'finish_lower_ms')::numeric>=extract(epoch from start_at)*1000 and(value->>'finish_upper_ms')::numeric<extract(epoch from end_at)*1000))
  and not ride_private.blocked(uid,(value->>'owner_id')::uuid) and not exists(select 1 from ride_private.ranked_hidden_records h where h.metric=value->>'metric' and h.record_id=(value->>'record_id')::uuid and h.hidden)
  and((value->>'owner_id')::uuid=uid or(f->>'scope'='global' and pub.audience='global') or(f->>'scope'='friends' and pub.audience in('friends','global') and ride_private.friends(uid,(value->>'owner_id')::uuid))) limit 10001
 )x;
 if jsonb_array_length(candidates)>10000 then return ride_private.ranked_error('RANKED_UNAVAILABLE');end if;
 revision:=encode(sha256(convert_to(jsonb_build_object('filter',f,'starts_at',period->'starts_at','ends_at',period->'ends_at','records',candidates)::text,'UTF8')),'hex');
 if p_cursor is not null and p_cursor->>'board_revision'<>revision then return ride_private.ranked_error('RANKED_CHANGED');end if;
 if f->>'metric'='sustained_speed' then
  with available as(select value from jsonb_array_elements(candidates) where(f->>'class_key'='all' or value->>'class_key'=f->>'class_key') and(value->>'completed_at')::timestamptz<=as_of and(value->>'verified_at')::timestamptz<=as_of and((f->>'scope'='global' and value->>'audience'='global') or(f->>'scope'='friends' and value->>'audience' in('friends','global')))),best as(select value,row_number() over(partition by value->>'owner_id' order by(value->>'sustained_kmh')::numeric desc,(value->>'completed_at')::timestamptz,value->>'record_id') own from available),numbered as(select value,dense_rank() over(order by(value->>'sustained_kmh')::numeric desc) rank,row_number() over(order by(value->>'sustained_kmh')::numeric desc,(value->>'completed_at')::timestamptz,value->>'owner_id',value->>'record_id') position,count(*) over(partition by(value->>'sustained_kmh')::numeric)>1 tied from best where own=1)
  select coalesce(jsonb_agg((value-array['owner_id','audience','publication_revision','friend_generation','finish_lower_ms','finish_upper_ms'])||jsonb_build_object('user_id',value->'owner_id','rank',rank,'position',position,'tied',tied) order by position),'[]') into rows from numbered;
 else
  with available as(select value from jsonb_array_elements(candidates) where(f->>'class_key'='all' or value->>'class_key'=f->>'class_key') and(value->>'completed_at')::timestamptz<=as_of and(value->>'verified_at')::timestamptz<=as_of and((f->>'scope'='global' and value->>'audience'='global') or(f->>'scope'='friends' and value->>'audience' in('friends','global')))),best as(select value,row_number() over(partition by value->>'owner_id' order by(value->>'elapsed_upper_ms')::numeric,(value->>'elapsed_lower_ms')::numeric,(value->>'completed_at')::timestamptz,value->>'record_id') own from available),ordered as(select value,row_number() over(order by(value->>'elapsed_lower_ms')::numeric,(value->>'elapsed_upper_ms')::numeric,(value->>'completed_at')::timestamptz,value->>'owner_id',value->>'record_id') position,max((value->>'elapsed_upper_ms')::numeric) over(order by(value->>'elapsed_lower_ms')::numeric,(value->>'elapsed_upper_ms')::numeric,(value->>'completed_at')::timestamptz,value->>'owner_id',value->>'record_id' rows between unbounded preceding and 1 preceding) previous_max from best where own=1),clusters as(select value,position,sum(case when previous_max is null or(value->>'elapsed_lower_ms')::numeric>previous_max then 1 else 0 end) over(order by position) cluster from ordered),numbered as(select value,position,min(position) over(partition by cluster) rank,count(*) over(partition by cluster)>1 tied from clusters)
  select coalesce(jsonb_agg((value-array['owner_id','audience','publication_revision','friend_generation','finish_lower_ms','finish_upper_ms'])||jsonb_build_object('user_id',value->'owner_id','rank',rank,'position',position,'tied',tied) order by position),'[]') into rows from numbered;
 end if;
 select value into self from jsonb_array_elements(rows) where(value->>'user_id')::uuid=uid;
 status:=case when self is not null then 'ranked' when exists(select 1 from jsonb_array_elements(candidates) where(value->>'owner_id')::uuid=uid and(value->>'completed_at')::timestamptz<=as_of and(value->>'verified_at')::timestamptz<=as_of and(f->>'class_key'='all' or value->>'class_key'=f->>'class_key')) then 'private' when exists(select 1 from jsonb_array_elements(candidates) where(value->>'owner_id')::uuid=uid and(value->>'completed_at')::timestamptz<=as_of and(value->>'verified_at')::timestamptz<=as_of) then 'unclassified' else 'no_record' end;
 select coalesce(jsonb_agg(value order by(value->>'position')::integer),'[]') into podium from jsonb_array_elements(rows) where(value->>'position')::integer<=3;
 select coalesce(jsonb_agg(value order by(value->>'position')::integer),'[]') into items from(select value from jsonb_array_elements(rows) where(value->>'position')::integer>after_position order by(value->>'position')::integer limit p_limit)x;
 if jsonb_array_length(items)>0 and after_position+jsonb_array_length(items)<jsonb_array_length(rows) then next:=jsonb_build_object('owner_id',uid,'filter_hash',filter_hash,'board_revision',revision,'starts_at',period->'starts_at','ends_at',period->'ends_at','as_of',period->'as_of','after_position',items->(jsonb_array_length(items)-1)->'position');end if;
 return jsonb_build_object('owner_id',uid,'server_now',ride_private.ranked_utc(stamp),'filter',f,'period',period,'board_revision',revision,'capabilities',jsonb_build_object('speed',true,'route_time',true,'publication',true),'items',items,'podium',podium,'self',self,'self_status',status,'next_cursor',next);
exception when sqlstate 'RK001' then return ride_private.ranked_error(sqlerrm);end$$;

-- Binary-first predecessor remains authoritative. Remove compact owner and
-- foreign dependent publication metadata before009 clears canonical results.
alter function public.rs_purge_account_data(uuid,uuid,uuid) rename to rs_purge_account_data_pre_ranked_v1;
alter function public.rs_purge_account_data_pre_ranked_v1(uuid,uuid,uuid) set schema ride_private;
create function public.rs_purge_account_data(p_owner uuid,p_request uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$declare refs jsonb;begin
 perform ride_private.account_lock(p_owner);perform ride_private.live_control_lock();perform ride_private.deletion_lease(p_owner,p_request,p_token);
 -- No new metadata can be purged ahead of existing binary absence checks.
 if exists(select 1 from storage.objects o join ride_private.account_deletion_objects q on q.bucket=o.bucket_id and q.path=o.name where q.owner_id=p_owner) then raise exception 'DELETION_ASSETS_REMAIN';end if;
 select coalesce(jsonb_agg(ref),'[]') into refs from(
  -- Quarantine already removes legacy verified rows; original submission and
  -- attempt identities survive until purge and retain all dependent references.
  select jsonb_build_object('metric','sustained_speed','record_id',v.id) ref from public.rs_submissions v join public.rs_challenges c on c.id=v.challenge_id where v.owner_id=p_owner or c.creator_id=p_owner
  union all select jsonb_build_object('metric','route_time','record_id',v.id) from ride_private.race_attempts v join ride_private.races r on r.id=v.race_id where v.owner_id=p_owner or r.creator_id=p_owner
 )x;
 delete from ride_private.ranked_operations o where o.owner_id=p_owner or exists(select 1 from jsonb_array_elements(refs) ref where ref->>'metric'=o.request->>'metric' and ref->>'record_id'=o.request->>'record_id');
 delete from ride_private.ranked_publications p where p.owner_id=p_owner or exists(select 1 from jsonb_array_elements(refs) ref where ref->>'metric'=p.metric and(ref->>'record_id')::uuid=p.record_id);
 delete from ride_private.ranked_reports p where p.reporter_id=p_owner or p.record_owner_id=p_owner or exists(select 1 from jsonb_array_elements(refs) ref where ref->>'metric'=p.metric and(ref->>'record_id')::uuid=p.record_id);
 delete from ride_private.ranked_hidden_records p where p.owner_id=p_owner or exists(select 1 from jsonb_array_elements(refs) ref where ref->>'metric'=p.metric and(ref->>'record_id')::uuid=p.record_id);
 delete from ride_private.ranked_course_discovery d using ride_private.race_course_approvals a where d.approval_id=a.id and a.owner_id=p_owner;
 delete from ride_private.ranked_speed_claims l where l.owner_id=p_owner or exists(select 1 from jsonb_array_elements(refs) ref where ref->>'metric'='sustained_speed' and(ref->>'record_id')::uuid=l.submission_id);
 perform ride_private.rs_purge_account_data_pre_ranked_v1(p_owner,p_request,p_token);
end$$;
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and(p.proname like 'ranked_%' or p.proname in('rs_purge_account_data_pre_ranked_v1','rs_claim_submission_pre_ranked_v1','rs_release_submission_pre_ranked_v1','rs_finalize_submission_pre_ranked_v1','rs_reject_submission_pre_ranked_v1')) loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;end$$;
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and(p.proname like 'rs_ranked_%' or p.proname in('rs_get_result_publication','rs_set_ranked_course','rs_moderate_ranked_record','rs_purge_account_data')) loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;end$$;
grant execute on function public.rs_ranked_page(jsonb,jsonb,integer),public.rs_ranked_courses(jsonb,integer),public.rs_ranked_own_records(jsonb,integer),public.rs_ranked_publications(jsonb,integer),public.rs_ranked_operation(uuid),public.rs_ranked_mutate(uuid,jsonb),public.rs_get_result_publication(text,uuid) to authenticated,service_role;
grant execute on function public.rs_set_ranked_course(uuid,text,text,boolean),public.rs_moderate_ranked_record(text,uuid,boolean,text),public.rs_ranked_reports(timestamptz,uuid,integer),public.rs_purge_account_data(uuid,uuid,uuid) to service_role;
revoke all on function public.rs_claim_submission(uuid,uuid),public.rs_release_submission(uuid,uuid),public.rs_finalize_submission(uuid,numeric,timestamptz,timestamptz,integer,numeric,text,uuid),public.rs_reject_submission(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rs_claim_submission(uuid,uuid),public.rs_release_submission(uuid,uuid),public.rs_finalize_submission(uuid,numeric,timestamptz,timestamptz,integer,numeric,text,uuid),public.rs_reject_submission(uuid,text,uuid) to service_role;
-- Superseded audience-based read would bypass separate explicit publication.
revoke all on function public.rs_leaderboard(text,text,text,uuid) from public,anon,authenticated;
commit;
