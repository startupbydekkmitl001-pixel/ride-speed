# M5C — private route-time trials and live race contract

2026-10-01. **Root-approved implementation contract; additive009 and worker source are under local verification and are not deployed. No hosted approval or race has been created.** This is the implementation contract for M5C1 multi-friend asynchronous time trials followed by M5C2 live races. Root accepted four competitors, native-only qualification, one continuous capture, 8,000 samples/2MiB, positive accuracy at most15m, gaps at most1.5s, directed ordered gates, whole-segment corridor/boundary checks, rejection of progress ambiguity, conservative clock intervals with at most100ms half-width, and interval-overlap ties. Root also approved clock burst caps:40/min and1,200/day per actor,20,000/day per project, maximum24 probes per countdown attempt, foreground countdown preparation/countdown only, no idle polling. Exact timing, configuration and consent clarifications below were frozen before source implementation.

## 1. Existing contracts and additive boundary

| Maintained source | What must remain intact | Addition |
| --- | --- | --- |
| `backend/migrations/202609300001_online_foundation.sql`, courses/sessions/challenges/submissions/records | Existing `timed_race` has metric `sustained_speed_3s`; `rs_verified_records.method` is `sustained_min_3s_v1`. Original course/session approval and current friend-generation checks remain valid for that path. | Separate private route-time approval, race, attempt and result tables. Never store elapsed milliseconds in an old speed record or reinterpret an old invitation. |
| `backend/functions/verify-submission/index.ts`, `_shared/verify-evidence.mjs` | Current Core Location schema, immutable Storage upload, claim/release/finalize token and conservative three-second minimum-speed calculation. | New `verify-race-attempt` handler and `_shared/verify-route-time.mjs`; own versioned schema and `route_time_v1` result. |
| Additive006 private routes | Exact owner geometry lives in `ride_private.route_documents`; shared projections trim the first/last200m. A saved revision, source proof or catalog selection is not competitive approval. | Operator approval freezes the exact owner route/revision/geometry hash. Invitees see the safe projection; accepted competitors separately consent to private course evidence/geometry. |
| Additive007 social operations | Exact actor-derived immutable operation receipt, committed failed-probe admission, typed business errors, retired legacy mutation grants. | New race controls use the same durable recovery discipline, with dedicated requests/status/cancellation. No new direct browser table writes. |
| Additive008 foreground convoys | Own-account fence before the common `ride_private.live_control_lock()`, then lower rows; private hints have no GPS; current reads re-authorize; location consent is separate/default none. | Race control uses that same global fence. Competitive readiness does not turn on M5B position sharing. |
| `features/rides/journalModel.ts`, journal ports, `RideState.tsx`, `captureTypes.ts` | Original owner/capture receipts, actual samples, immutable vehicle snapshot, one watcher, disconnected capture history and closed-account disk fence. | Persist truthful per-receipt arrival monotonic metadata and lifecycle continuity for a race export. The existing runtime clock flag is insufficient by itself. |

All001–008 bytes stay unchanged. New009 may move an existing helper's OID/body into a revoked private predecessor and expose an additive wrapper, preserving its signature and narrower grants. No broad service grants, restored legacy browser grants or mutation of Supabase-managed Realtime tables.

The existing `ride_private.can_upload_evidence` acquires *both* evidence owner and challenge creator account locks in sorted UUID order. The new path therefore uses a distinct private bucket `ride-race-evidence`; extending that old helper after acquiring the global lock would introduce a foreign-account lock inversion. Old sustained-speed upload/verifier helpers continue to operate without a new global lock acquired after their submission rows.

## 2. Safety, trust and deployment state

The new metric is `route_time`, method `route_time_v1`; its honest quality label is **server-checked route time / เวลาเส้นทางที่ตรวจสอบบนเซิร์ฟเวอร์**. It checks supplied evidence for the approved traversal and continuity rules. It does not establish hardware sensor attestation. Platform, foreground state, capture identity, nullable source flags and JavaScript monotonic arrivals are client claims. Missing simulation/accessory/mock fields remain null, never become false. Known mocked/simulated data rejects the complete attempt. Browser/manual/demo captures cannot qualify; iOS and Android original captures may qualify with unknown fields recorded explicitly.

A one-time closed-course acknowledgement is required by the app before creation/readiness and is recorded as an acknowledgement version; it never creates an operator approval. No approval, course, session, result, peer or evidence is seeded for UI QA. Without a genuine operator-approved course/session the flow shows the unavailable state. No personal approval is created through hosted QA.

Initial race pilot is disabled in a new singleton policy, independently of008's location pilot. Approved read-only metadata may be shown while disabled; creation/arming/scheduling requires enabled policy. Source tests use disposable local accounts/fixtures only. Hosted enablement requires approved operations, cleanup, private-channel settings, quota monitoring and paired installed-device checks. App foreground race operation is the initial scope; background/pause/restart ends attempt authority even when ordinary ride recording can continue.

## 3. Initial method bounds

Root accepted these compile/runtime caps; measured CPU and device acceptance still gate release:

| Item | Bound/meaning |
| --- | --- |
| Competitors | Creator plus1–3 accepted friends; all pairs must be unblocked; non-host competitors need not be friends with one another. |
| Course | One connected ordered exact stored segment, 2–512 points; total route distance100m–15km; latitudes within±80°, no date-line crossing; one finite simple boundary polygon3–128 vertices. No silent simplification for approval. |
| Directed gates | Start,0–14 checkpoints, finish:2–16 total. Each finite gate has nonzero endpoints/forward vector, fixed ordered route progress, maximum physical width100m; a staging polygon has3–32 vertices. |
| Corridor | Approval-specific half-width10–30m, positive; all consecutive motion segments and their15m maximum uncertainty allowance must remain in the boundary/corridor. Gate/staging regions must also satisfy approved geometry checks. |
| Time | Race window at most24h and wholly within the approved session. Competitive attempt duration10–1,800s; upload grace24h from attempt terminal time, including verification retries. |
| Evidence | Exact original continuous capture range: at least4 samples, at most8,000; UTF-8 JSON bytes at most2,097,152. No downsampling, stitched captures, omitted bad fixes or truncation. |
| Evidence storage admission | Dedicated race bucket's unresolved reservations plus actual stored bytes≤268,435,456 (256MiB), counted once per path under the common global fence. Unknown object size consumes the cap conservatively. Exact receipt replay costs no new reservation; new binding returns `RACE_CAPACITY` when full. Owner keeps local bytes and retries after verified cleanup/capacity recovery; no paid fallback. Organization Storage usage still must be monitored. |
| Quality | Accuracy finite, strictly positive and≤15m; strictly increasing fix timestamps, consecutive fix gap≤1,500ms; finite coordinates; known mocked/simulated flag anywhere rejects. Source speed remains nullable and cannot be invented. |
| Plausibility | Approval's maximum speed must be positive and≤138.888889m/s; derived segment motion and uncertainty-adjusted acceleration limit15m/s². These are rejection ceilings, not rewards or proof of vehicle power. |
| Arrival continuity | Received monotonic time finite/nondecreasing; fix age within[-500,3,000]ms at arrival; discrepancy between arrival wall delta and monotonic delta≤250ms. Any recorded pause/background/source/storage/gap/capture-change event aborts. |
| Gate interval | Stable observations bracketing a crossing span≤3,000ms; consecutive observations still respect1,500ms gap. Wider/ambiguous crossing is rejected rather than assigned an interpolated timestamp. |
| Readiness | Fresh stage proof3s; ready lease15s with renewal every3s while foreground/valid; host lease45s, renewal every10s; no ready renewal from stale fix. |
| Live schedule | Immutable common UTC epoch chosen by server at least10s after scheduling; admission also requires room/session/deadline headroom for the maximum attempt duration. One epoch per race; retry/recovery never chooses a new one. |
| Clock | Root-approved most recent5 probes, minimum3, conservative request-start age≤5s, intersection half-width≤100ms. No symmetric RTT assumption; no continuous idle polling. |

Boundary/corridor uncertainty rules may make a narrow or noisy course unavailable. Operator must approve a usable course rather than weakening limits to produce a result. The512-point exact-source cap can exclude large saved routes; a separately reviewed smaller course route is a new revision/approval. No existing saved ride or user route is discarded.

## 4. Private database resources

All tables below live in `ride_private`, RLS enabled, no anon/authenticated direct table privileges. Narrow definer APIs have fixed empty search paths, schema-qualified calls and explicit EXECUTE grants. Application owner IDs refer to Auth users so a profile is not manufactured; creating/joining races requires an existing real profile for readable invitations.

| Table | Keys and immutable/mutable columns |
| --- | --- |
| `race_policy` | Singleton: enabledfalse, max_live_races2, method_version1, admission caps. Changes service/operator only. |
| `race_course_approvals` | UUID, route_id/owner_id/revision/full_geometry_hash, course_id/session_id, method`route_time_v1`, immutable canonical geometry/config JSON and their hashes, category` scooter\|motorcycle\|car`, reviewer_ref≤120, created_at; revoked_at/revocation_code nullable. Approval UUID is never reused or edited. |
| `races` | UUID, creator_id, revision≥1, mode`async\|live`, approval_id/config_hash, exact safe display projection and summary, UTC window, acknowledgement_version1, state, topic UUID/generation, lobby_epochUUID, common_start_at nullable, host_lease_until, terminal_at/reason. Route edits/revocation do not mutate the frozen approval. |
| `race_members` | PK(race_id,user_id), role`host\|member`, state`invited\|accepted\|declined\|withdrawn`, member_generation≥1; host_friendship_generation nullable onlyhost; accepted_at; ready_revision≥0, ready_leaseUUID, ready_attemptUUID, ready_until. Ready authority is bound to the current lobby epoch/member/capture, not to display topic generation. |
| `race_attempts` | UUID, owner/race/member generation, approval/config/session, ordinal1–3, revision≥1, native platform/provider, capture/ride IDs, immutable start vehicle snapshot, state, armed_at, schedule_epoch nullable, evidence digest/bytes/range/path nullable, worker token/lease/attempts, terminal reason/time. One active attempt per owner across races. |
| `race_stage_slots` | Latest own stage sample/proof only, boundrace/member/attempt/capture/lobby_epoch, monotone sequence, quality fields and native platform claim, received_at/expires_at≤3s. Coordinates are private and never included in control receipts/shared snapshots/Realtime. |
| `race_clock_probes` | PK(owner_id,probe_id), race/capture/clock_generation, server_received_at/server_sent_at, created_at; no coordinates. Immutable returned stamp on retry; expire unbound probes after2min, retain explicitly bound attempt probes through upload grace/worker completion. |
| `race_results` | attempt PK, owner/race/approval/config hashes/method; gate crossing intervals, start/end interval, elapsed_lower_ms/upper_ms, distance/top/average stats, raw_count, quality flags, evidence_sha256, verified_at. No raw coordinates; server-only write. |
| `race_operations` | PK(owner_id,operation_id), canonical request JSON/hash, applied_at, exact typed result. Owner-only status/replay. No raw GPS or arbitrary provider URLs. Retain replay identity until account deletion; do not expire unresolved identities into reusable IDs. |
| `race_activation_cancellations` | PK(owner_id,original_operation_id), exact activation request/hash, cancelled_at. An immutable cancellation fence prevents a delayed arm/ready/schedule operation. |
| `race_admission`, `race_poll_slots` | Bounded actor/project admission windows and lower-frequency poll floors. Admission remains committed for known failed business probes. |
| `race_evidence_cleanup` | Immutable bucket/path/digest cleanup jobs, reason/lease/attempts. Service Storage API removes binaries before SQL reservation/reference cleanup. No direct SQL Storage deletion. |

FKs preserve exact approval/results while owned races exist, but explicit deletion handles creator races and other owners' dependent attempts before deleting profiles/Auth. Results do not outlive the account/race deletion policy through a public orphan. Performance indexes: owner/race terminal times, member owner updated_at/id keyset, attempt owner/race created_at/id, activeattempt owner partial unique, cleanup queued/time, current approvals route/revision/session. All timestamps are UTC; eventual M6 ranking periods remain Asia/Bangkok.

## 5. Exact wire conventions

Snake_case JSON matches007/008. UUIDs canonical lowercase; integer revisions1…2,147,483,647; incrementing requests require headroom, terminal deletion may consume the maximum current revision. UTC instants use strict ISO offsets and preserve microseconds during ordering/cursor comparisons. Decimal coordinates are finite WGS84; no coercion, extra keys or unknown enum values. Input max16KiB for controls; operator config max128KiB, evidence upload separately bounded. Actor comes exclusively from the verified JWT; no owner field in a control request.

```ts
type NativeRacePlatform = 'ios' | 'android';
type RaceMode = 'async' | 'live';
type RaceState = 'open' | 'lobby' | 'countdown' | 'running' |
  'finished' | 'cancelled' | 'expired';
type AttemptState = 'reserved' | 'armed' | 'upload_pending' | 'queued' |
  'verifying' | 'verified' | 'rejected' | 'aborted' | 'dnf';
type RaceOperation = {operation_id:string; request:RaceRequest};
type RaceReceipt = {owner_id:string; operation_id:string; request:RaceRequest;
  applied_at:string; result:RaceControlResult};
type RaceErrorEnvelope =
  | {error:{code:Exclude<RaceErrorCode,'RACE_RATE_LIMITED'>}}
  | {error:{code:'RACE_RATE_LIMITED'; retry_after_ms:number}};
type FriendBinding = {user_id:string; friendship_generation:number};
type RaceCreate = {schema_version:1; action:'race_create'; race_id:string;
  mode:RaceMode; approval_id:string; route_id:string; route_revision:number;
  reviewed_projection_hash:string; starts_at:string; ends_at:string;
  friends:FriendBinding[]; acknowledgement_version:1; evidence_consent_version:1};
type RaceMemberActionBase = {schema_version:1; action:'member_action'; race_id:string;
  expected_revision:number; expected_member_generation:number;
  expected_friendship_generation:number};
type RaceMemberAction =
  | (RaceMemberActionBase & {decision:'accept'; acknowledgement_version:1;
      evidence_consent_version:1})
  | (RaceMemberActionBase & {decision:'decline'|'withdraw'});
type AttemptReserve = {schema_version:1; action:'attempt_reserve'; race_id:string;
  expected_revision:number; expected_member_generation:number; attempt_id:string;
  ride_id:string; capture_id:string; platform:NativeRacePlatform;
  provider:'ios_core_location'|'expo_location'; vehicle_local_id:string|null};
type AttemptArm = {schema_version:1; action:'attempt_arm'; attempt_id:string;
  expected_revision:number; stage_proof_id:string; capture_id:string;
  clock_probe_ids:string[]};
type AttemptAbort = {schema_version:1; action:'attempt_abort'; attempt_id:string;
  expected_revision:number; reason:'user_stop'|'background'|'capture_changed'|
  'quality'|'storage_error'|'clock_invalid'|'late_start'};
type RaceReady = {schema_version:1; action:'race_ready'; race_id:string;
  expected_revision:number; expected_member_generation:number;
  expected_ready_revision:number; lobby_epoch:string; attempt_id:string;
  capture_id:string; stage_proof_id:string; clock_probe_ids:string[]};
type RaceUnready = {schema_version:1; action:'race_unready'; race_id:string;
  expected_member_generation:number; expected_ready_revision:number;
  expected_ready_lease_id:string};
type ReadyBinding = {user_id:string; member_generation:number; ready_revision:number;
  ready_lease_id:string; attempt_id:string};
type RaceSchedule = {schema_version:1; action:'race_schedule'; race_id:string;
  expected_revision:number; lobby_epoch:string; ready:ReadyBinding[]};
type RaceCancel = {schema_version:1; action:'race_cancel'; race_id:string;
  expected_revision:number; reason:'user_cancel'};
type EvidenceBind = {schema_version:1; action:'evidence_bind'; attempt_id:string;
  expected_revision:number; capture_id:string; first_sequence:number;
  last_sequence:number; sample_count:number; byte_length:number; sha256:string};
type EvidenceQueue = {schema_version:1; action:'evidence_queue'; attempt_id:string;
  expected_revision:number; sha256:string};
type RaceRequest = RaceCreate|RaceMemberAction|AttemptReserve|AttemptArm|
  AttemptAbort|RaceReady|RaceUnready|RaceSchedule|RaceCancel|EvidenceBind|EvidenceQueue;
```

`race_create.friends` has1–3 distinct friends sorted by UUID. The creator's safe projection is read and hashed on the server; input only acknowledges its hash. Exact approval/current route/session and each friendship are checked atomically. Any invalid friend/block rejects the whole creation, without a partial race. All-pair blocks apply. No later invite/add/remove into an existing race in this slice: rematch or a changed competitor set creates a fresh race. This keeps the selected ready set exact and bounded. Creation and accepting membership explicitly consent to private competitive course geometry/evidence version1; store version and server timestamp per member. Decline/withdraw never carry consent. Friendship, safety acknowledgement and M5B position consent cannot imply competitive evidence consent.

`attempt_reserve` requires an accepted current member, native matching provider/platform, unused attempt UUID and no active owner attempt. The server freezes the selected vehicle from the owner's saved garage (or null); the passed local ID only selects an own row. Snapshot includes category/powertrain/engineCc/motorPowerKw/catalog provenance, still self-reported, never establishes competitive class. Category must match approval; a null vehicle remains unrated for class boards. Do not infer or overwrite old ride vehicle metadata.

`expected_revision` on a race is structural CAS. Accept/decline/withdraw/schedule/cancel increments it; stage/heartbeats/ready changes do not. Member generation changes on membership transition. Ready revision is independent and increments on grant/revoke; structural membership changes clear every ready lease, rotate lobby epoch/topic and prevent stale scheduling. Attempt revisions independently fence transitions. No last-write-wins.

The result discriminator equals the request action:

```ts
type RaceControlResult =
 | {action:'race_create'|'member_action'|'race_cancel'; race:RaceSnapshot}
 | {action:'attempt_reserve'|'attempt_arm'|'attempt_abort'; attempt:AttemptSnapshot}
 | {action:'race_ready'|'race_unready'; race_id:string; member_generation:number;
    ready_revision:number; ready_lease_id:string|null; ready_until:string|null;
    lobby_epoch:string; attempt_id:string|null}
 | {action:'race_schedule'; race:RaceSnapshot; common_start_at:string;
    schedule_epoch:string; scheduled_members:ReadyBinding[]}
 | {action:'evidence_bind'; attempt:AttemptSnapshot; reservation:EvidenceReservation}
 | {action:'evidence_queue'; attempt:AttemptSnapshot};
```

Decoder cross-checks action/result, resource IDs, generations, frozen input, own attempt owner and nullable relations. Replay returns the original applied result, which may be older than current state; clients settle the operation then fetch/adopt canonical state. An old ACK never replaces later local intent or arms restored authority.

### Public authenticated RPCs

| RPC/parameters | Return and authorization |
| --- | --- |
| `rs_race_mutate(p_operation uuid,p_request jsonb)` | Exact `RaceReceipt` or fixed `RaceErrorEnvelope`. Actor-only own control; member/host role checked under lock. |
| `rs_race_operation(p_operation uuid)` | Own exact receipt or null; current active actor only. A foreign UUID returns null, not a receipt existence oracle. |
| `rs_cancel_race_activation(p_operation uuid,p_request jsonb)` | Only original `attempt_arm`, `race_ready`, `race_schedule`; exact receipt, exact cancellation proof or fixed typed error. |
| `rs_list_races(p_limit int=30,p_before timestamptz=null,p_before_id uuid=null)` | `{owner_id,server_now,items:RaceSnapshot[],next_cursor:{before,before_id}|null}`; actor member/creator only, descending exactupdated_at/id, max30. |
| `rs_get_race(p_race uuid)` | Own/current member snapshot or null. Former accepted/withdrawn participants may read sanitized terminal metadata only; never private course or peers' pending evidence. Invited peers get invitation-safe projection. |
| `rs_list_race_approvals(p_route uuid,p_revision int)` | `{owner_id,server_now,items:ApprovalSummary[]}` for owner route, max20 active current session approvals; no raw polygon/coordinates. |
| `rs_get_race_course(p_race uuid)` | Accepted active member with valid approval; full frozen course/config and hashes. Separate consented private read, never inserted into shared route/feed/profile JSON. |
| `rs_get_race_attempt(p_attempt uuid)` | Own `AttemptSnapshot` or null, including bounded reservation/rejection state; no other owner's pending evidence. |
| `rs_list_race_attempts(p_race uuid)` | `{owner_id,race_id,items:AttemptSnapshot[]}`; current race membership required, own rows only, maximum3 ordered by ordinal ascending. Restores active/history attempt IDs on restart or another device; never returns peers' reservations or samples. |
| `rs_race_results(p_race uuid)` | `{owner_id,race_id,server_now,items:RaceResult[],statuses:RaceResultStatus[]}`; current accepted/creator and sanitized terminal former-member access only. No raw GPS or another owner's pending evidence metadata. |
| `rs_race_clock(p_probe uuid,p_race uuid,p_capture uuid,p_generation uuid)` | Own scoped `RaceClockProbe` or error; server times captured inside the RPC. |
| `rs_race_stage(p_sample jsonb)` | Latest own ephemeral stage proof or fixed error; exact current reserved/armed attempt/capture/native claim and quality,1Hz max. |
| `rs_race_heartbeat(p_race uuid,p_member_generation int,p_ready_lease uuid=null,p_attempt uuid=null,p_stage_proof uuid=null,p_clock_probe_ids uuid[]=null)` | Own lease renewal/current race clock envelope or fixed error. Ready renewal requires a fresh stage proof and3–5 recent own probes in the same capture/clock generation; host renewal never implicitly renews ready. |

No general anonymous race lookup. Feed/public ranking will use a later sanitized projection with deliberate visibility/report/privacy rules, not these private readers. Race Results page may present old sustained-speed invitations beside route-time rows only with distinct metric labels/resource types.

### Snapshot DTOs

```ts
type ApprovalSummary = {id:string; route_id:string; route_revision:number;
  route_geometry_hash:string; config_hash:string; course_id:string; session_id:string;
  method:'route_time_v1'; category:'scooter'|'motorcycle'|'car';
  starts_at:string; ends_at:string; distance_m:number; maximum_duration_s:number};
type RaceMember = {user_id:string; role:'host'|'member';
  state:'invited'|'accepted'|'declined'|'withdrawn'; member_generation:number;
  friendship_generation:number|null; profile:{name:string;handle:string;avatar_id:string|null};
  evidence_consent_version:1|null; consented_at:string|null;
  ready_revision:number; ready:boolean; ready_until:string|null};
type SelfReady = {revision:number; lease_id:string; attempt_id:string; until:string};
type RaceSnapshot = {id:string; creator_id:string; revision:number; mode:RaceMode;
  metric:'route_time'; method:'route_time_v1'; state:RaceState;
  approval:ApprovalSummary; route_summary:{title:string;revision:number;category:string};
  route_snapshot:SafeRouteSnapshot; starts_at:string; ends_at:string;
  lobby_epoch:string; common_start_at:string|null; schedule_epoch:string|null;
  topic:string|null; topic_generation:number; host_lease_until:string|null;
  self_member:RaceMember; members:RaceMember[]; self_ready:SelfReady|null;
  schedule_ready:ReadyBinding[]|null; updated_at:string;
  terminal_reason:RaceTerminalReason|null};
type AttemptSnapshot = {id:string; owner_id:string; race_id:string; revision:number;
  ordinal:number; member_generation:number; approval_id:string; config_hash:string;
  platform:NativeRacePlatform; provider:'ios_core_location'|'expo_location';
  ride_id:string; capture_id:string; state:AttemptState; armed_at:string|null;
  schedule_epoch:string|null; common_start_at:string|null;
  vehicle:ImmutableVehicleSnapshot|null; evidence:EvidenceReservation|null;
  rejection_code:RaceEvidenceCode|null; terminal_reason:AttemptTerminalReason|null;
  terminal_at:string|null; updated_at:string};
type EvidenceReservation = {bucket:'ride-race-evidence'; path:string; attempt_id:string;
  capture_id:string; sha256:string; byte_length:number; first_sequence:number;
  last_sequence:number; sample_count:number; upload_deadline:string};
type ImmutableVehicleSnapshot = StartVehicleSnapshot; // existing rides/syncTypes.ts
type RaceClockProbe = {owner_id:string; probe_id:string; race_id:string; capture_id:string;
  clock_generation:string; server_received_at:string; server_sent_at:string};
type RaceActivationCancellation = {kind:'cancelled'; owner_id:string;
  operation_id:string; request:AttemptArm|RaceReady|RaceSchedule; cancelled_at:string};
type RaceTerminalReason = 'host_cancelled'|'host_expired'|'membership_changed'|
  'blocked'|'approval_revoked'|'session_ended'|'account_deleted'|'deadline';
type AttemptTerminalReason = RaceTerminalReason|'user_stop'|'background'|
  'capture_changed'|'quality'|'storage_error'|'clock_invalid'|'late_start';
type RaceResultStatus = {user_id:string;
  state:'not_started'|'in_progress'|'processing'|'verified'|'rejected'|'dnf';
  terminal_reason:AttemptTerminalReason|null};
```

`SafeRouteSnapshot` is the existing validated M4 sanitized compatibility shape, including trimmed/hidden geometry and200m privacy setting. `topic` is an unpredictable `rs-race:<UUID>` only for currently accepted members with active private channel eligibility; terminal/invited reads use null. `self_ready` contains only the caller's binding. `schedule_ready` contains the exact accepted ready set only for the host during lobby/countdown; for everyone else it is null. The schedule receipt returns that set only to its owner/host. Other members receive the immutable epoch through their canonical snapshot; they do not need other owners' attempt IDs or ready lease IDs to arm.

`RaceEvidenceCode` is the fixed verifier rejection enum in section10. DNF/abort uses `terminal_reason` rather than inventing a quality rejection. Results status has at mostfour competitor rows, and no pending attempt path/digest/capture/range. Native provider compatibility is iOS Core Location or original Expo Location, Android original Expo Location only; every missing source flag remains null. Provider/platform claims cannot attest hardware origin.

`ImmutableVehicleSnapshot` reuses the exact existing `StartVehicleSnapshot` keys: nullable local_id/catalog_id, category, brand/model, nullable variant/year, powertrain petrol/diesel/hybrid/electric/unknown, nullable engine_cc/motor_kw. No extra catalog provenance payload is implied; the selected catalog ID remains metadata rather than evidence. Local pending race outbox is bounded32 rows/128KiB, preserves exact operation_id/request/queued_at/last_error, and refuses overflow rather than discarding unknown work.

## 6. Durable controls, error discipline and activation cancellation

Mutation order: (1) own actor/account fence; (2) global fence; (3) active account, exact bounded canonical schema; (4) existing exact receipt, then exact cancellation fence; (5) fresh committed admission; (6) inner transition subtransaction locking race/member/attempt rows; (7) immutable receipt plus result. An operation UUID reused with a different canonical request gives `RACE_OPERATION_CONFLICT`. Receipts precede time/session/source/membership tests so response-loss replay is stable. Known business rejection rolls back inner writes and returns a fixed envelope while outer admission survives. Unrecognized SQL/runtime failures are not mapped to a definitive rejection: transport uncertainty retains the exact operation.

```ts
type RaceErrorCode = 'RACE_INVALID'|'RACE_TOO_LARGE'|'RACE_AUTH_REQUIRED'|
 'RACE_PROFILE_REQUIRED'|'RACE_DISABLED'|'RACE_RATE_LIMITED'|'RACE_UNAVAILABLE'|
 'RACE_OPERATION_CONFLICT'|'RACE_OPERATION_CANCELLED'|'RACE_CHANGED'|
 'RACE_MEMBER_CHANGED'|'RACE_FRIEND_CHANGED'|'RACE_BLOCKED'|
 'RACE_APPROVAL_UNAVAILABLE'|'RACE_SESSION_UNAVAILABLE'|'RACE_CAPACITY'|
 'RACE_ATTEMPT_ACTIVE'|'RACE_ATTEMPT_LIMIT'|'RACE_ATTEMPT_CHANGED'|
 'RACE_CAPTURE_MISMATCH'|'RACE_STAGE_UNAVAILABLE'|'RACE_CLOCK_UNAVAILABLE'|
 'RACE_READY_CHANGED'|'RACE_NOT_READY'|'RACE_TOO_LATE'|
 'RACE_EVIDENCE_BOUND'|'RACE_EVIDENCE_UNAVAILABLE'|'RACE_UPLOAD_EXPIRED'|
 'ACCOUNT_DELETION_PENDING';
```

Owner client stores `{operation_id,request,queued_at,last_error}` immutably before sending; no persisted boolean pretends a restored start was reviewed. Enable-sensitive restored controls require status-first recovery and explicit same-operation review while foreground. A typed business envelope retires only after matching status is null; unknown HTTP/SDK/database errors retain the request. Generation/AuthScope identity gates before and after every request, including A→B→A. Durable valid late ACK can be adopted only by the owning scope; closed/deleted disk refuses writes. Coalesce competing terminal responses/removal/flush exactly as the M5B fixed coordinator does.

`RACE_RATE_LIMITED.retry_after_ms` is a bounded positive integer1…86,400,000 derived from the first denied authoritative bucket boundary. It is never inferred from an SDK message. The client waits for that interval before explicit retry or next permitted foreground probe; it does not spin a countdown probe loop against a rejected bucket. Exact successful receipt replay remains free even while new work is limited. HTTP/transport429 without the validated envelope is uncertain, not a definitive SQL business rejection.

OFF cannot bypass an unresolved activation with a no-op revoke. `rs_cancel_race_activation` uses the exact original owner/operation/canonical request under the same own-account/global fences:

1. If already applied, return that immutable receipt. Client durably settles it without arming, fetches fresh canonical attempt/ready/race, then queues the appropriate abort/unready/cancel with its exact current CAS.
2. If not applied, admit fresh cancellation once and persist an immutable cancellation tombstone. Return the exact proof. A delayed original mutation returns `RACE_OPERATION_CANCELLED` and can never apply.
3. If proof exists, exact replay is free; mismatched request is conflict. No arbitrary blanket cancellation by another owner or mutation of an existing receipt.

Applied host schedule cancellation is race cancellation, which ends the epoch for all selected competitors. Readiness revocation after a schedule but before epoch makes the scheduled set invalid: cancel the live race before start; after epoch that competitor becomes DNF and remaining eligible competitors may finish. Immediate local disarm always precedes network reconciliation; local UI never awaits a remote ACK to stop sensing/sharing/countdown authority.

## 7. State machines and live timing

### Async

Create→`open`, with the host accepted and friends invited. Members accept/decline before the window ends under exact generations. Accepted users attempt separately during the window, at mostthree attempts per race/member generation; one active attempt per owner. Reserve→fresh stage proof→explicit arm. `armed` authorizes original-sample collection. Server verification later establishes the first valid directed start crossing after armed_at and inside the approved window. A provisional finish freezes evidence after journal drain, binds one immutable byte range/digest, uploads, then queues. Verification yields verified/rejected. No local finish, top speed, route pin or accepted journal filter sets verified.

An unfinished async race expires at ends_at. Eligible already-armed attempts with genuine start/finish crossings before ends_at may upload through24h grace; expiry is not cancellation. Race becomes `finished` once the window is over and every selected accepted member has a terminal attempt, including rejected/aborted; otherwise it is `expired` after grace. Declined/withdrawn invitees do not create missing results. Ranking will later choose the best qualifying interval per owner; private history shows all bounded attempts. A lease-free `armed` attempt becomes DNF at its maximum duration/window bound, so it cannot block that owner's next attempt forever.

### Live

Create→`lobby`. Structural membership CAS/epoch binds a fixed competitor set. Host and each accepted competitor reserve/arm a native capture, remain physically in the staging area on the start gate's pre-start side, obtain fresh clock intersection and explicitly grant readiness. Ready does not grant position sharing. Stage proof/ready renewals are foreground-only; no backlog and no sample copied from smoothed speed/route rendering. Stage proof admission/reference is distinct from raw evidence upload.

Host schedules only the exact accepted ready set in the same lobby epoch, with valid host/ready leases, stage proofs and clock-probe bindings. The server freezes `schedule_epoch`, competitor bindings, and `common_start_at=server schedule time+10s`; it increments the race revision and enters `countdown`. A retry returns exactly that epoch. Response loss recovers through operation status, never a replacement timestamp. The entire current clock interval must be earlier than the confirmed epoch when the client issues its one-use arm ticket. A hint is insufficient authority.

At the epoch, timing begins for *everyone* from that common epoch. Live start is not async gate-crossing time. Evidence must prove staging/start-side continuity up to the epoch uncertainty and then a correctly directed start crossing between epoch and epoch+10s, followed by all ordered checkpoints/finish. Starting ahead of the gate or crossing early rejects/DNFs. Server checks the common epoch, stage/ready/member bindings and evidence; it does not accept a client-supplied backdated start timestamp.

A retained canonical ticket issued while the entire interval was before the epoch may present its first due tick while the conservative interval straddles the epoch, or while its upper bound is at most epoch+300ms. A later first tick is missed. This bounded scheduling allowance changes presentation only; it never permits a new or late arm ticket, and directed start evidence still lies wholly within [epoch,epoch+10s]. If the interval upper bound is beyond epoch+300ms before its first due event, the ticket is missed; disjoint/rewind/background/stale generation invalidates it. A fresh resync after the epoch cannot arm anew. Display/haptic midpoint is presentation only. The result elapsed interval is finish-crossing interval minus the common epoch, not the user's reaction time or local animation callback.

Race state lazily becomes `running` once the epoch has passed and the readiness set was valid at schedule/start checks. Reads/worker/cleanup apply the same state repair, so an absent Cron tick cannot make expired authority valid. Ready heartbeat renews every3s using the latest actual stage sample. Capture, foreground, quality, member or clock failure before the epoch disarms immediately; the client submits abort/unready. No invisible countdown continues in background.

After epoch, participant interruption→DNF; host expiry does not invalidate a competitor's already captured legitimate elapsed evidence by itself, but it ends optional live display/lobby authority. Root accepted preserving valid in-progress results after post-start host network loss and cancelling before start on host expiry. Host explicit cancellation, operator revocation, account deletion or blocking can invalidate competitive visibility/finalization at any time; none leaves an apparently live private room.

No association auto-creates a convoy or location grant. A host may later attach an existing consented M5B convoy with exact ID/generation after explicit review; location lifecycle remains independent and defaults to none. M5C1/M5C2 work without that association; finish/results never depend on a peer map update.

## 8. Clock, stage, heartbeat and admission

`rs_race_clock` captures `server_received_at` near entry and `server_sent_at` immediately before returning. Both occur inside the original request; received must not exceed sent. The probe is immutable and owner/race/capture/clock-generation bound. Exact UUID replay returns the original stamp, which **did not occur inside a later retry RTT**. The client must retain the original request-start monotonic reference or discard the replay as a measurement. Never pass an old replay stamp to `observe()` with a newly created probe ticket.

For original request start `m0`, receive `m1`, and current monotonic `m`, the conservative server interval is `[server_sent_at + m - m1, server_sent_at + m - m0]`. Intersect at least3 recent valid probes, retain at most5, and require request-start age at most5s and half-width at most100ms. No symmetric RTT assumption. The pure `CompetitiveRaceClock` exports `beginProbe`, `observe`, `read`, `reset`, `invalidate`; `armRaceSchedule` and `raceScheduleDecision` bind a one-use generation/schedule ticket. Disjoint intervals, rewind, background or stale reference invalidate authority. A previously scheduled attempt cannot silently obtain a replacement ticket after invalidation: disarm, reconcile abort/unready, then explicitly start a new attempt/race.

A server stamp binds a real RPC time; it does not attest the client's clocks or network delivery claims. Exact clock replay should be status recovery, not another fresh measurement. Store the original start/receive monotonic references in the immutable attempt evidence, and reject missing legacy references instead of inventing them.

```ts
type StageSample = {schema_version:1; race_id:string; member_generation:number;
  attempt_id:string; capture_id:string; lobby_epoch:string; sequence:number;
  platform:NativeRacePlatform; provider:'ios_core_location'|'expo_location';
  timestamp_ms:number; received_wall_ms:number; received_monotonic_ms:number;
  latitude:number; longitude:number; horizontal_accuracy_m:number;
  is_simulated_by_software:boolean|null; is_produced_by_accessory:boolean|null;
  mocked:boolean|null};
type StageProof = {owner_id:string; race_id:string; attempt_id:string; capture_id:string;
  lobby_epoch:string; member_generation:number; sequence:number; proof_id:string;
  received_at:string; expires_at:string};
type RaceHeartbeat = {owner_id:string; race_id:string; member_generation:number;
  server_received_at:string; server_sent_at:string; host_lease_until:string|null;
  ready_revision:number; ready_lease_id:string|null; ready_until:string|null};
```

Stage input re-authorizes current owner/member/approval and exact native capture. Reject known mocked, poor-quality or stale samples without storing coordinates. Invalid phase/capture removes the own stage slot and ready authority. Proof expiry is at most min(received+3s, race/session end, applicable host lease). Coordinates never appear in the returned proof. A failed quality sample cannot prolong readiness using a previous good proof. Sequence strictly advances per attempt; exact latest payload replay returns the same proof only while valid. Same sequence with different payload fails.

Ready grants store a current3–5 probe-ID set. `rs_race_heartbeat` ready renewal supplies fresh stage proof and fresh3–5 probe IDs, same owner/capture/clock generation; replace that private set only on successful renewal. Schedule validates the **current** set, not the older initial grant. Server can require probes issued within5s and correctly bound; the server cannot prove the client's100ms RTT claim. The client independently enforces its clock intersection. Host-only heartbeat can renew host lease without renewing readiness. After the epoch, heartbeat is optional display/lobby maintenance; evidence continuity is independent.

The approved clock admission is40/min and1,200/day per actor,20,000/day per project, maximum24 probes per live countdown attempt. It permits the initial three-probe burst plus roughlyone probe every1.5–2s during countdown. Root additionally approved an explicit initial three-probe burst for async arming, same actor/project budget and native foreground only. No clock polling on idle map/feed, in background or after race timing no longer needs a fresh countdown anchor.

Other proposed caps:

| Call class | Actor | Project | Additional cap |
| --- | --- | --- | --- |
| Fresh durable controls/cancellation |60/min,500/day |10,000/day | Exact applied receipt/cancellation replay free; failed valid business probes consume admission. |
| New races |10/day |100/day | Max2 active live races and10 active async races per creator. |
| Attempt reserves |10/day |1,000/day | Max3 per race/member; one active attempt per owner. |
| Stage samples |1/s,1,200 per live attempt |20,000/day | Max8 current competitors; lobby/countdown only; stop after directed start. Async needs only fresh arming samples. |
| Heartbeats |1/s hard ceiling; intended3s ready/10s host |20,000/day | No idle room loop. |
| Canonical reads/results |30/min,5,000/day |50,000/day | Hint refresh debounce500ms; countdown at most1Hz; idle15s/explicit refresh. |
| Worker requests |10/day |1,000/day | Max3 claims; terminal status read remains inexpensive. |

These are logical ceilings, not a guarantee against platform quotas. Return `RACE_RATE_LIMITED` with authoritative bounded `retry_after_ms` derived from the first denied bucket. Unknown HTTP/SDK429 remains uncertain. Admission is serialized by the common global fence and occurs outside the inner transition subtransaction, so known failed probes consume admission. Retain bounded admission windows35days.

Realtime invalidation consumes008's shared project headroom. Only `{resource_id,topic_generation,event:'changed'|'ended'}` enters a private hint; no GPS, private gates, names, speed, evidence hash, token or raw route. Topic rotates after membership, cancellation, approval/privacy boundaries. Fresh RPC reads are authoritative because channel authorization is cached at join/JWT refresh. [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

## 9. Immutable evidence and worker contract

Competitive evidence consent is separate from ordinary ride summary sync and M5B location sharing. Export once from the owning durable journal after writes drain, over one exact continuous capture/range. Persist journal reference plus immutable blob/digest metadata in owner scope. Include **all original receipts**, including bad fixes/null flags; local accepted status is diagnostic. The bus's filtered good-fix stream is not a complete evidence export. Missing receipts, legacy receipts without originally recorded monotonic metadata, truncated capture or continuity error prevent qualification. A restart can recover the original bytes for upload; it cannot resume or rebuild an interrupted capture as continuous.

```ts
type RaceEvidenceV1 = {schema_version:1; method:'route_time_v1';
  race_id:string; attempt_id:string; approval_id:string; config_hash:string;
  mode:RaceMode; schedule_epoch:string|null; common_start_at:string|null;
  source:'ride_journal_v1'; platform:NativeRacePlatform;
  provider:'ios_core_location'|'expo_location'; ride_id:string; capture_id:string;
  first_sequence:number; last_sequence:number; capture_truncated:false;
  foreground_continuous:true; clock_anomaly:false; clock_generation:string;
  arm_clock_probe_ids:string[];
  lifecycle:{kind:'armed'|'finish_observed'; received_monotonic_ms:number;
    received_wall_ms:number}[];
  clock_probes:{probe_id:string; clock_generation:string;
    request_started_monotonic_ms:number; request_started_wall_ms:number;
    received_monotonic_ms:number; received_wall_ms:number}[];
  samples:{sequence:number; received_wall_ms:number; received_monotonic_ms:number;
    timestamp_ms:number; latitude:number; longitude:number; speed_mps:number|null;
    horizontal_accuracy_m:number|null; speed_accuracy_mps:number|null;
    is_simulated_by_software:boolean|null; is_produced_by_accessory:boolean|null;
    mocked:boolean|null}[]};
```

Lifecycle is exactly armed then finish_observed for a normal candidate. Interruption sends abort instead of qualifying evidence. The selected competitive range begins at the first original raw receipt after the actual arm ACK; its `first_sequence` may exceed1. Every original receipt through the selected finish is included, including bad/null fixes. The earlier genuine staging sample is separately server-bound and is not silently prepended. Preserve actual earlier capture start metadata; do not claim the capture began at arm. Lifecycle requires armed≤first selected receipt and finish_observed≥last selected receipt. Initial arm requires3–5 exact original probes; live evidence may include up to24, same generation. Async uses its initial three-probe anchor. Each probe request/response records wall and monotonic readings together at the original event; never reconstruct those wall readings from a later response or offset estimate. The server correlates IDs/stamps to its private probe records. Client arrival/source claims remain unattested; never name JavaScript arrival time native Android elapsed realtime.

Fix the offset reference once per capture: at initial valid arrival `(w_ref,m_ref)`, require `abs((w_i-w_ref)-(m_i-m_ref)) <=250ms` for **every** original receipt and probe reference. This is a whole-capture bound, not a sum of per-gap allowances. A stable device wall offset is allowed; a jump/drift beyond the bound is rejected. Missing, rewind or discontinuous monotonic input invalidates the attempt. Fix timestamps remain strictly ordered, and relative arrival age stays[-500,3,000]ms. The platform's physical monotonic-clock drift must be measured on installed devices; a consistency bound is not sensor attestation.

For arrival `(m_i,w_i)` and fix timestamp `t_i`, the fix age is `a_i=w_i-t_i`. Project the original probe intersection to `m_i`; if server-at-arrival interval is `[L_i,U_i]`, conservative fix time is `[L_i-a_i-D,U_i-a_i+D]`, with method drift/computational allowance `D=250ms`. This handles a stable device wall offset: raw `t_i-serverEpoch` is never a score. The5s/100ms freshness gate is required while arming/counting down; later evidence may project the immutable original anchor for at most30min with the fixed drift allowance and whole-capture residual check. Any stricter physical device limit discovered by tests becomes a method revision, not an undocumented adjustment.

`evidence_bind` freezes metadata into the own active attempt and returns `<owner UUID>/<attempt UUID>/route-time-v1.json`. MIME `application/json`, maximum2MiB, private `ride-race-evidence`. The INSERT policy obtains own account→global, rechecks exact reservation, native binding, active race creator/owner and deadline, and does not acquire the creator's account lock. No UPDATE/upsert. Authenticated SELECT is exact-own-reservation only to recover lost upload metadata. Different digest/range for an already bound attempt gives `RACE_EVIDENCE_BOUND`; do not replace ambiguous bytes.

`evidence_queue` checks actual object size/MIME plus reservation/digest binding, moves upload_pending→queued, and returns an immutable control receipt. SQL cannot compare binary digest; the worker does. Exact queue replay precedes deadline checks. Metadata lookup and queue recover a lost upload response; no arbitrary path, duplicate rotation or upsert.

New `verify-race-attempt` Edge request is `{attempt_id:UUID}`. Use current JWT `getUser` and own attempt lookup, never caller-supplied owner/course authority. Browser may read a terminal result but cannot supply browser evidence as native qualification.

Service-only RPCs:

- `rs_claim_race_attempt(p_attempt uuid,p_owner uuid)`: account(owner)→global→race/attempt; queued or verifier lease expired after2min; maximum3 claims. Returns `{token,server_now,attempt,approval,clock_probes,evidence}` or null. `server_now` is captured authoritatively inside this request. User handler already bound the owner.
- `rs_release_race_attempt(p_attempt uuid,p_token uuid)`: same owner/global/token gates; transient failure returns queued only while eligible. Stale worker cannot clear a new lease.
- `rs_reject_race_attempt(p_attempt uuid,p_token uuid,p_code text)`: fixed quality enum, token-fenced terminal rejection, no raw exception/coordinates.
- `rs_finalize_race_attempt(p_attempt uuid,p_token uuid,p_result jsonb)`: recheck active owner/creator, accepted current member/friend generations/all-pair blocks, exact approval/course/session/config, race state/schedule/window/evidence hash and current lease. Insert result+verified state atomically. Stale lease or revocation never becomes a verified result.

Worker privately downloads the immutable object, bounds allocation/byte length, strictly decodes UTF-8 JSON/schema, verifies actual SHA256, runs the bounded pure algorithm, then finalizes with the claim token. Missing/nonfinite authoritative `server_now` is rejected; last sample and finish upper bounds must be≤server_now+500ms. SQL finalization independently recomputes `clock_timestamp()` and repeats finish.upper≤now+500ms, so a forged worker-time argument cannot grant future qualification. Known evidence errors reject; unknown runtime/SQL failure releases/retries with a coarse code. Successful HTTP envelope is `{attempt:AttemptSnapshot,result:RaceResult|null}`; terminal200, busy/not-queued409. Fixed401/403/409/422/503 errors contain no coordinates/path/token. HTTP success does not imply verification before SQL finalization. Expired upload reservations become deadline DNF; expired verifier leases return queued unless the three-claim processing budget is exhausted, then become storage_error DNF. Processing failure never becomes a quality verdict.

## 10. Exact operator configuration and directed traversal

Operator request has no arbitrary replacement route geometry. The server reads the exact stored source route and foundation course boundary. The trusted compiler validates bounds/geometric consistency before the service-only approval transaction; SQL independently validates shape, exact hashes, fixed method constants and ownership/session bindings. A compiler result is not a browser approval.

```ts
type RaceCoordinate = {latitude:number;longitude:number};
type DirectedGate = {index:number;kind:'start'|'checkpoint'|'finish';
  a:RaceCoordinate;b:RaceCoordinate;forward_point:RaceCoordinate;
  progress_min_m:number;progress_max_m:number};
type RaceOperatorConfig = {schema_version:1;method:'route_time_v1';
  staging_polygon:RaceCoordinate[];gates:DirectedGate[];
  corridor_half_width_m:number;maximum_speed_mps:number};
type RaceApprovalRequest = {schema_version:1;route_owner_id:string;route_id:string;
  route_revision:number;route_geometry_hash:string;course_id:string;session_id:string;
  reviewer_ref:string;config:RaceOperatorConfig};
type RaceCourseConfiguration = {schema_version:1;method:'route_time_v1';
  origin:RaceCoordinate;route_geometry:RaceCoordinate[];
  boundary_polygon:RaceCoordinate[];staging_polygon:RaceCoordinate[];
  gates:DirectedGate[];corridor_half_width_m:number;maximum_speed_mps:number;
  projection:'wgs84_ecef_enu_v1';geometry_error_margin_m:0.25;
  maximum_accuracy_m:15;maximum_gap_ms:1500;maximum_crossing_span_ms:3000;
  maximum_duration_ms:1800000;minimum_duration_ms:10000;
  maximum_acceleration_mps2:15;maximum_backtrack_m:5;
  whole_capture_residual_ms:250;server_time_drift_allowance_ms:250;
  live_start_gate_window_ms:10000};
type RaceCourseSnapshot = {race_id:string;approval_id:string;config_hash:string;
  route_geometry_hash:string;configuration:RaceCourseConfiguration};
```

Approval input config has no tolerance override. Method constants in returned configuration are literals; a change creates a new version/hash, never silently loosens old approval. `progress_min_m/progress_max_m` are finite, bounded to course distance and strictly ordered non-overlapping gate windows. Indices are contiguous0…N-1; first is start, last finish, others checkpoint. Forward point is separate from the gate, its ENU forward normal agrees with local route direction; no zero gate/vector. Staging is on the pre-start side and inside the boundary/corridor; it cannot overlap the finish/checkpoint area.

Use WGS84 ECEF→local east/north/up with origin at the first source point (semi-major axis6378137m, flattening1/298.257223563). Every route/boundary/staging/gate vertex must be within15km of origin. Geodesic checks bound the source course and local projection fixtures; require numeric/projection deviation at most0.25m. Add0.25m outward to uncertainty tubes and inward to finite gate width/containment tests. If error exceeds that bound, reject compilation; do not pretend a larger course has the same error. Keep exact source numbers/hash, no coordinate rounding/simplification during verification. These computational margins add to, rather than replace, GPS accuracy. The WGS84 constants and geocentric/local conversion are supported by the primary [GeographicLib constants](https://raw.githubusercontent.com/geographiclib/geographiclib/main/include/GeographicLib/Constants.hpp) and [LocalCartesian implementation](https://raw.githubusercontent.com/geographiclib/geographiclib/main/src/LocalCartesian.cpp); the0.25m acceptance margin is our method bound to test, not a claim already measured in this app.

Compile finite/simple boundary, connected route, ordered gates and unique progress matching before approval. Self-intersections or near-parallel branches ambiguous within the maximum uncertainty require uniquely separated ordered windows; otherwise the initial method rejects the course. Operator discretion cannot override ambiguity after the fact. A measured worst-case compiler/verifier benchmark is a release gate.

For every original observation, validate source/quality/time/arrival/lifecycle. Known mock anywhere rejects. Every consecutive motion segment and its accuracy+0.25m uncertainty tube must remain inside approved boundary and corridor. A concave polygon can contain both endpoints while the segment leaves it; intersection/whole-segment tests must catch this. Invalid points cannot be omitted to connect two valid fixes.

Resolve unique ordered route progress; allow at most5m backward noise, not skipped branches/checkpoints. Progress jumps must fit motion plausibility and corridor traversal. A straight shortcut inside a broad boundary still fails the route corridor. Require every gate exactly in order and direction. No nearest-fastest branch selection. A short time gap alone does not establish unique path through a self-intersection.

Gate crossings use stable observations wholly on pre/post sides after horizontal-accuracy erosion. Intervening ambiguous observations may bridge only a3s total bracket while each consecutive gap is at most1.5s. Record the complete before/after **server-time interval**. Reject reverse, skipped, repeated or multiple gates in one uncertain bracket; never assign an optimistic interpolated timestamp.

Async uses monotonic fix-time brackets to compute elapsed intervals (fixed offset cancels), while converted server intervals conservatively establish arm/session/start/end eligibility. For start `[s0,s1]` and finish `[f0,f1]` in the same monotonic time domain, elapsed is `[f0-s1,f1-s0]`, widened by the fixed method drift allowance on both ends. Require lower≥10s and upper≤1800s. Entire server start/finish intervals must lie in the approved arm/window/session bounds.

Live uses the fixed server epoch `E`. Convert finish to server interval `[F0,F1]` before elapsed `[F0-E,F1-E]`. Its directed start bracket must be wholly within `[E,E+10s]`; a bracket straddling E cannot prove an after-epoch start. Require original staging/start-side evidence through the epoch uncertainty and full-capture continuity. A fresh clock after missed/invalidated ticket cannot backdate/rearm that epoch.

```ts
type RaceResult = {attempt_id:string;owner_id:string;race_id:string;
  approval_id:string;config_hash:string;method:'route_time_v1';
  quality:'native_evidence_consistency';platform:NativeRacePlatform;
  provenance_unknown:boolean;elapsed_lower_ms:number;elapsed_upper_ms:number;
  start_interval:{lower_ms:number;upper_ms:number};
  finish_interval:{lower_ms:number;upper_ms:number};
  gate_intervals:{index:number;lower_ms:number;upper_ms:number}[];
  distance_m:number;maximum_speed_mps:number|null;average_speed_mps:number;
  sample_count:number;max_gap_ms:number;evidence_sha256:string;verified_at:string};
```

Stored gate/start/finish intervals are server UTC epoch milliseconds; async elapsed is calculated in the monotonic domain with its allowance. Speed stats never enter old sustained-speed records. Display interval/rounded seconds with honest uncertainty; do not claim millisecond timing from1Hz observations.

The approved tie rule is connected components of overlapping closed elapsed intervals. Sort lower, upper, verified time and UUID for stable presentation, then use a running maximum upper bound to form clusters. A overlapsB, B overlapsC but A does not overlapC still forms one conservative tie cluster. Competition rank is shared; the next rank advances by cluster size. Never break overlap with midpoint. M6 must compare exact approval/config/method/course and fair category/class, not unrelated courses.

Fixed rejection codes: `EVIDENCE_SCHEMA`, `EVIDENCE_DIGEST`, `EVIDENCE_SIZE`, `EVIDENCE_SOURCE`, `EVIDENCE_MOCKED`, `EVIDENCE_ACCURACY`, `EVIDENCE_TIMESTAMP`, `EVIDENCE_CLOCK`, `EVIDENCE_CLOCK_PRECISION`, `EVIDENCE_CLOCK_STALE`, `EVIDENCE_GAP`, `EVIDENCE_TRUNCATED`, `EVIDENCE_CAPTURE`, `EVIDENCE_FOREGROUND`, `EVIDENCE_TELEPORT`, `EVIDENCE_ACCELERATION`, `EVIDENCE_BOUNDARY`, `EVIDENCE_CORRIDOR`, `EVIDENCE_PROGRESS`, `EVIDENCE_GATE_DIRECTION`, `EVIDENCE_GATE_ORDER`, `EVIDENCE_GATE_AMBIGUOUS`, `EVIDENCE_STAGING`, `EVIDENCE_LATE_START`, `EVIDENCE_WINDOW`, `EVIDENCE_DURATION`, `APPROVAL_REVOKED`, `MEMBERSHIP_CHANGED`, `ACCOUNT_DELETION`.

Observed result `distance_m` is the sum of all qualified original motion segments, bounded100–20,000m. Approved course geometry remains bounded100–15,000m. The observed sum includes bounded GNSS noise and travel inside the corridor; it is not silently capped to route length. More than20,000m rejects with `EVIDENCE_DURATION`. This DTO clarification does not alter geometry authority or privacy limits.

## 11. Approval and writer/lock audit

Service-only `rs_approve_race_course(p_approval uuid,p_request jsonb)` takes `RaceApprovalRequest`, acquires route-owner account→global **before** route/course/session rows, and checks exact source revision/hash, current course/session approval, compiler configuration/hash and literal constants. Insert an immutable approval or return exact ID/request replay; changed config on the same ID is conflict. Reviewer reference is an audit identity, not proof of real authorization. No authenticated EXECUTE/UI operation creates approval.

`rs_revoke_race_course(p_approval uuid,p_reason text)` takes route-owner account→global, marks revocation, invalidates related authority/worker tokens, rotates private topics and queues cleanup. Existing course/session approvalfalse also invalidates every new read/finalization. Trusted operator course/session update recipes must acquire global before those rows. Foundation service_role direct UPDATE is an existing trusted capability; do not silently remove its grants or add an after-row global hook. Document the operational lock requirement and test concurrent revoke/finalization.

| Entry | Order and hook |
| --- | --- |
| New authenticated controls/clock/stage/heartbeat/repair/Storage insert | Own account→008 global→race/member/attempt/probe rows. Never acquire another owner's account under global. |
| New verifier claim/finalize/reject | Attempt-owner account→global→race/attempt→approval/course/session; exact owner from attempt, no foreign-account loop. |
| New operator approval/revoke | Route-owner account→global→route/course/session→approval/race rows. No competitor account locks. |
|008 social/internal friend/account preference writers | Existing account→global wrappers precede old pair/profile/account-state locks. Add `race_privacy(uid)` under that held global fence after the predecessor transition. |
| `rs_save_route_v2` / `rs_delete_route_v2` | Add009 wrappers that acquire own account→global **before** invoking the unchanged predecessor route-row/CAS/receipt logic; then invalidate exact related approvals/readiness. Never acquire global only after save's row lock. Preserve signatures/grants/receipts. |
|008 account deletion begin | Own account→global→existing begin→queue new foreign-owner hosted-race paths and quarantine/token revoke→return same job lease. Snapshot before dependent removal. |
|008 purge | Own account→global→existing deletion lease and all binary absence checks→new race dependent purge→existing008 purge/profile/Auth preparation. |
| Race cleanup/repair | Global only→bounded rows; never call actor/account helpers under it. |
| Old sustained-speed worker/upload | Original submission/foreign-account lock order preserved; no new global acquired after those locks; no new race-table writes. |

Use actual two-connection PostgreSQL tests, not single-connection PGlite, for deadlock/order proof. The authorized disposable loopback PostgreSQL17.11 runtime requires no private credentials or provisioning.

`race_privacy(uid)` rechecks host friendship generations, all-pair blocks, accounts, exact route approval/revision/session. Block/remove/deletion removes current invitation/private-course/result access. Ghost/presence changes revoke optional008 display only; they do not silently withdraw an async competitor. Before live epoch a changed selected member cancels that schedule; after epoch it becomes DNF and loses private access. Terminal former members may retain own sanitized history, never active peer/course authority. Operator revocation invalidates qualification regardless of a client result badge.

## 12. Deletion, retention and cleanup

Preserve typed confirmation, binary-first deletion, leased retries and Auth-admin-last. New begin hook queues `ride-race-evidence` paths owned by the user **and other owners' attempts in races created by that user** before dependent rows can vanish. Null worker tokens, disarm readiness/staging and hide course/result authority immediately. Include new bucket owner-prefix orphans in `rs_account_deletion_objects` and purge's binary absence check, including missing Storage owner metadata. Existing delete-account Edge already consumes bucket/path lists through Storage API; it needs no new fixed-bucket assumption. Never delete `storage.objects` with SQL.

Purge foreign dependent results/attempts for creator races, own results/attempts, stage/probe references, receipts/cancellation identities, races and owned approvals after references clear, then invoke prior profile/Auth preparation. A foreign host race remains with the deleted member withdrawn. Exact FK/concurrency tests prove this ordering; computing workers cannot finalize after quarantine. Keep003 signed-claim deletion receipt recovery for a lost final Auth response, without treating arbitrary401 as success.

Raw evidence cleanup is scheduled no later than seven days after immutable reservation binding; verification/rejection/abort do not extend that privacy cap. Results retain digest/method/intervals until account/race deletion. Terminal replay does not require keeping old bytes. Unused reserved-attempt probes expire2min. Every original probe issued for an armed/upload-pending/queued/verifying attempt remains through upload/verification grace, including a last countdown probe that was not bound by ready renewal; otherwise a genuine long-running candidate would lose a required original reference. Terminal bound probes expire7days and terminal unbound probes expire2min. Stage coordinates are logically valid at most3s and physically removed by minute cleanup. Compact immutable operation/cancellation identities remain until deletion so an unknown old operation cannot become reusable. State backup/provider retention honestly; logical expiry does not erase provider backups immediately.

`rs_race_cleanup()` is service-only, global-only, bounded state/probe/stage expiry plus queued cleanup work. A database job cannot erase Storage binaries with SQL. New `race-evidence-cleanup` Edge drains at most20 paths per invocation, removes via Storage API, then acknowledges exact lease jobs only after binary absence; response-loss retries are idempotent. Scheduling needs an operator-configured service invocation or Vault secret. No public anon worker or secret literal in Cron SQL. Review changes to the owned M5B minute job after actual installation; preserve unrelated jobs. Separate pilot enablement from installing cleanup.

## 13. Push adapter slice and credential gates

Push is distinct from race Realtime. A live socket cannot deliver a background push. A source-only adapter/outbox can be implemented separately without paid provisioning, but native delivery still needs project signing/APNs/FCM setup:

- `notification_installs`: owner UUID/install generation, platform/project ID, protected server token, permission/opt-in state, revoked/updated times. Current JWT register/revoke, default notificationsfalse. A reused token revokes its old install generation atomically; never expose another owner's token.
- `notification_outbox`: unique event/recipient/install generation, generic friend request/race invitation/ready/result type, opaque resource/deep link, expiry, lease/retries/delivery state. Atomically check current preferences/member/block before inserting; re-authorize again at delivery. No GPS, private gates, speed, caption or access credential in notification content.
- Service-only delivery adapter returns bounded per-install ticket/error. Disabled delivery while signing is absent; UI shows actual in-app invitations. No external messages sent during QA.
- Verify Expo/APNs/FCM limits and primary docs when that slice starts. Stored outbox alone is not completed push; installed consenting devices must receive actual safe notifications. Credentials belong in trusted setup, never chat/repository.

## 14. Tests and rollout gates

Implement async then live on the same distinct approval/evidence path. Preserve all prior tests and old method behavior.

1. **SQL/ACL:** actual authenticated table/service denial, exact replay before time/member tests, changed-request conflict, committed failed probes and retry-after, atomic creator+three-friend rejection, consent versions, generations/block ABA, safe route projection, foreign Storage paths, native provider bounds and maximum revision.
2. **Concurrent PostgreSQL:** competing one-active attempt reserves; delayed arm/ready/schedule versus exact cancellation both orders; schedule versus unready/member withdrawal/host expiry; block/deletion/revoke versus claim/finalize; paused Storage INSERT versus creator quarantine; route save/delete versus approval; global cleanup versus account preferences/social mutation. Assert bounded completion and intended winner.
3. **Verifier:** reverse/skipped/repeated gates, start inside finish, concave inside endpoints/outside segment, shortcut outside corridor, ambiguous branches, uncertainty tube/0.25m margin; accuracy0/15/15.001, gap1.5/1.501s, missing/bad/truncated/stitched receipts, null flags/known mock, whole-capture drift staircase, stable±5s device wall offset, late/early server start brackets, live epoch and overlap-chain ties. Old `sustained_min_3s_v1` unchanged.
4. **Client/journal:** original newly recorded monotonic arrivals, drained receipt export, no second watcher, bus filtered stream not evidence, capture/lifecycle disarm, startup callbacks, A→B→A/deleted disk, exact frozen retry bytes/requests, status-first restore review, applied ACK/cancellation proof races and held/failed durable flush. Invalidated schedule never rearms.
5. **Actual decoder fixtures:** all SQL receipt/cancellation/clock/stage/snapshot/result shapes fed into maintained decoders; extra/foreign keys rejected, microsecond cursors, host-only ready bindings, exact consent and nullable unknown flags.
6. **CPU/error budget:** Deno worst-case8,000 samples,512 course vertices,128 boundary vertices,16 gates, including adversarial ambiguity. Target≤1.0s local CPU/64MiB incremental memory and≤1.5s hosted CPU margin. If it fails, reduce approved bounds or optimize before deployment. Test WGS84 projection against geodesic fixtures≤0.25m. Hosted limits are256MB memory,2s CPU/request,150s Free wall time. [Supabase Edge limits](https://supabase.com/docs/guides/functions/limits).
7. **Installed devices:** real iPhone14Plus/iOS26 and mid-range Android, approved closed course/session, consenting accounts; actual source flags, foreground/lifecycle/gates, clock drift and haptic timing, independent approximately300ms paired epoch measurement, asymmetric network/offline/host loss/low power. Pure tests and100ms clock gate alone do not prove the300ms target.
8. **Operations:** exact reviewed009/Edge hashes, disabled pilot initially, minute state expiry and binary cleanup, private Realtime settings/opaque hint grants, quota dashboard headroom and no GPS/key logs. Organisation/project usage is authoritative, not a local estimated ceiling.

Expo57 exposes epoch fix data and Android mocked status but not every native quality/elapsed-realtime field. Preserve missing fields as null; JavaScript arrival time cannot be renamed native elapsed realtime. [Expo57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [Android Location](https://developer.android.com/reference/android/location/Location#getElapsedRealtimeNanos()), [Apple CLLocation](https://developer.apple.com/documentation/corelocation/cllocation).

## 15. Freeze and ownership

Root accepted the distinct metric, four native competitors, quality/corridor/gap principles,512/128/16 geometry caps,15km/30min bounds,3s crossing brackets,10s countdown/start window, post-epoch legitimate evidence preservation after host network loss, seven-day raw retention/binary-first worker, overlap connected tie clusters, separate private evidence bucket, clock burst caps and explicit async arm burst. Timing/configuration/consent and original probe wall-pair clarifications were frozen before additive009 implementation. No new user API key is needed for source implementation. Real operator authorization, managed cleanup readiness, installed-device acceptance and optional push signing remain gates to truthful release claims.

Backend agent: additive009/tests, separate verifier/cleanup Edge, operator recipe/backend API/deployment hashes. Pure agent: race types/model/service/coordinators/clock/preview. Root: RaceProvider/durable owner metadata/journal continuity/export/deletion integration. UI agent: async detail/results, live lobby/countdown/rematch and natural Thai/English. This document creates no hosted approval/race and does not claim deployed or physical-device acceptance.
