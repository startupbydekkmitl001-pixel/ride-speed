# M2 ride-summary sync contract — V5

Checked **1 October 2026** against the current recorder, account-scoped storage, M1 lifecycle migrations and [M2 map/journal contract](m2-implementation-contract-v5.md). M1 is committed as `79928c6`; the reviewed contract now has additive source in `202610010004_private_ride_summaries.sql`, pure client conversion/types and a fixed-owner service. Local verification is recorded below. Hosted deployment and native device acceptance remain separate gates; this document does not claim either.

## Existing boundaries to preserve

| Current source | Established behavior / M2 implication |
| --- | --- |
| `ExpoRideSpeed/src/useRideSession.ts` | One shared `ExclusiveLocationCapture`; generation checks reject stale callbacks. Raw samples append before display filtering. Starts require permission and usable provider startup. `stop():void` currently does not await release; durable finalization needs an awaited provider/journal boundary. |
| `ExpoRideSpeed/modules/ride-location/src/sessionSupport.ts` | Provider starts/stops are serialized; failed cleanup retains ownership. Current evidence buffer is memory-only and capped at 8,000 samples/2 MiB. Preserve truncation/provenance and raw delivered values; a journal is additive, not permission to fabricate missing samples. |
| `ExpoRideSpeed/src/speedEngine.ts` | Confirmed speed/max use conservative accepted fixes; loss yields unavailable speed. Display interpolation is not a measurement or evidence sample. |
| `ExpoRideSpeed/src/lib/rideSubmission.ts` | Native challenge evidence is bound to owner + continuous capture + challenge; immutable bytes, reserved path and retry ID survive response loss. Upload/queue/verify are explicit. Ordinary summary sync must never call this pipeline. |
| `ExpoRideSpeed/src/state/AuthState.tsx` | `accountClient`, `accountRpc` and `isAccountCurrent` preserve initiating UID/JWT and account generation. Use these for requests; do not use global mutable-session `lib/supabase.ts:rpc` for a delayed outbox. |
| `ExpoRideSpeed/src/lib/accountLocalStore.ts` | Device preferences and guest/owner data are separate; legacy data is quarantined as guest until an explicit import. Ride journals/outboxes must follow the same owner boundary, without storing high-frequency sample rows in this JSON record. |
| `backend/migrations/202610010002_profile_account_lifecycle.sql` | `ride_private.actor()` fences writes during deletion; Storage→DB→Auth deletion ordering is established. Extend its purge phase additively for new rides/receipts. Never change an already-deployed migration. |
| Foundation verifier/leaderboard | Only `rs_verified_records` can rank. New summaries remain **self-reported** regardless of platform, GPS quality or the selected vehicle. |

## Separation of data and consent

There are three independent records:

1. **Local journal:** owner/guest scope, logical ride ID, acquisition/capture IDs, active intervals, unfiltered raw observations and accepted geometry checkpoints. Durable native SQLite/web IndexedDB belongs to the provider contract. No raw journal export runs automatically.
2. **Cloud summary:** the finalized ride's bounded statistics, immutable start-vehicle snapshot and compressed accepted geometry. Stored privately for the owner; it is not proof and grants no friend, community, location or leaderboard access.
3. **Competition submission:** the existing explicit native-evidence flow and server verifier. Its IDs, immutable bytes and source/accuracy/course/lease checks stay independent of summary revisions and upload retries.

Private compressed geometry still contains sensitive locations. M2 never sends raw `{timestamp,latitude,longitude,speed,accuracy,source flags}` arrays, raw evidence JSON or evidence Storage objects as ordinary summary synchronization. Friend/community sharing waits for M4/M7 explicit projection/consent; public projections must apply server endpoint privacy trimming. M1 `route_audience:'friends'` is a composer default, not permission to expose every cloud ride.

## Proposed owner RPC and response

```ts
rs_sync_ride_summary({
  p_operation: UUID,       // immutable outbox operation ID, reused on retry
  p_ride: UUID,            // logical journal ride ID, not one capture ID
  p_expected_revision: number, // 0=create; otherwise exact current cloud revision
  p_payload: RideSummaryV1
}): Promise<RideSyncAck>

rs_get_ride_sync_status({p_operation: UUID}): Promise<RideSyncAck | null>

type RideSyncAck = {
  operation_id: UUID;
  ride_id: UUID;
  applied_revision: number; // revision this operation originally committed
  current_revision: number; // latest server revision, possibly newer on replay
  payload_sha256: string;    // server-calculated canonical payload hash
  speed_status: 'self_reported';
  visibility: 'private';
  synced_at: string;         // original server receipt time, UTC ISO
};
```

Both RPCs derive the owner from `ride_private.actor()`. An Auth-only user who skipped profile setup can sync a private summary: the new ride table references `auth.users`, not `rs_profiles`. The existing profile gate remains required for online social features.

The implemented owner history RPC is `rs_list_ride_summaries({p_limit:20,p_before_end:null|UTC_ISO,p_before_id:null|UUID})`, limit 1–50. It returns `{items:[{ride_id,revision,payload,category,class_key,class_scheme_version,metadata_authority:'self_reported',speed_status:'self_reported',visibility:'private',created_at,updated_at}],next_cursor:null|{ended_at,ride_id}}`. Sort by ended UTC instant descending, then UUID descending. Use both exact returned cursor fields. This enables a second installation to read private synced history without reconstructing raw native proof or exposing operation IDs.

The first save creates revision 1. A new operation with matching expected revision can replace derived summary/geometry after an explicit local correction, but cannot change the original start vehicle, ride identity/start time or schema identity. M2 does not stream live ride writes, auto-recalculate history after a vehicle edit, or offer a cloud-delete UI without a separate tombstone/CAS contract. Discarding an unsaved local attempt must cancel its pending operation before transmission.

## Bounded payload and canonical units

```ts
type RideSummaryV1 = {
  schema_version: 1;
  started_at: string; ended_at: string; // actual device UTC ISO instants
  active_duration_ms: number;         // sum of durable active intervals
  elapsed_duration_ms: number | null; // unavailable when the clock changed
  clock_anomaly: boolean;
  distance_m: number | null;          // accepted-fix distance, not straight pins
  max_speed_mps: number | null;       // confirmed readout, not animated digits
  average_speed_mps: number | null;   // distance_m / active_duration seconds
  reported_provider: 'corelocation' | 'expo_ios' | 'expo_android' | 'web' | 'mixed';
  capture_count: number;
  accepted_fix_count: number;
  rejected_fix_count: number;
  geometry_status: 'complete' | 'simplified' | 'unavailable';
  vehicle: StartVehicleSnapshot | null;
  geometry: {
    encoding: 'polyline5';
    fragments: {
      segment_id: UUID;
      capture_id: UUID;
      part_index: number; // multiple disconnected geometry parts in one interval
      polyline: string;
      point_count: number;
    }[];
  };
};
type StartVehicleSnapshot = {
  local_id: string | null; catalog_id: string | null;
  category: 'scooter' | 'motorcycle' | 'car';
  brand: string; model: string;
  variant: string | null; year: string | null;
  powertrain: 'petrol' | 'hybrid' | 'electric' | 'unknown';
  engine_cc: number | null; motor_kw: number | null;
};
```

Transport speed is **metres/second**, distance **metres**, durations **integer milliseconds**. km/h/mph and Thai/English date labels are presentation conversions. Persist `timestamptz` in UTC plus server receipt/update timestamps; no local Bangkok date strings become authoritative times. This summary is not inserted into Bangkok competition windows.

Null means unavailable; no usable fixes must not become a fake zero speed/path/distance. Confirmed stationary fixes may legitimately yield zero. Average uses accepted distance over active time, including stationary active intervals; GPS gaps make it incomplete and must remain labeled self-reported. Never divide by zero or create a value from unavailable distance. Client/server rounding tolerances must be documented and tested; no rounding occurs in native proof bytes.

Use monotonic elapsed measurements for active intervals, checkpointed to disk. On UTC clock changes, retain actual observed start/end values, flag the anomaly and withhold wall elapsed time; do not rewrite raw observations or fabricate an ordered route. Restart recovery pauses at the last persisted checkpoint, without extrapolating movement or active time while the process was dead.

Implemented storage caps: 128 geometry fragments, 4,096 decoded coordinates, 64 KiB aggregate encoded strings, 128 KiB canonical JSON; active/available elapsed time ≤7 days and distance ≤10,000 km; finite nonnegative speeds ≤500/3.6 m/s, counts ≤10 million. These are input/storage bounds, **not anti-cheat verification**. Reject unknown keys, unsafe/nonfinite numbers, wrong UUIDs/types and malformed dates. UTC date/clock-anomaly consistency must be validated rather than silently repaired. Limits live in the versioned client contract and corresponding SQL/server tests. Average tolerance is 0.001 m/s; UTC/elapsed/active tolerance is 1 s. Confirmed no-movement pairs retain 0; no accepted same-part pair leaves distance/average null.

## Segmented geometry and validation

Polyline5 uses E5 latitude/longitude integer deltas. JSON serialization must escape backslashes normally; do not escape the stored value twice. This is a coordinate codec, not a dependency on Google's map service. [Published encoded-polyline format](https://developers.google.com/maps/documentation/utilities/polylinealgorithm).

- Each fragment restarts decoding at its own origin. Preserve capture/acquisition, pause, crash, rejected-jump and lost-fix boundaries. Never concatenate fragments into a single connected route.
- `segment_id` identifies the durable active interval; ordered `part_index` identifies disconnected geometry within it. Same capture may have multiple parts. Validate unique `(segment_id,part_index)`, consistent capture identity per segment and declared point counts against decoding.
- SQL validation must bound bytes/points and terminate malformed/overlong varints, reject non-ASCII encoding characters, incomplete coordinate pairs and decoded latitude/longitude outside ±90/±180. Use checked integer arithmetic; a small encoded input must not overflow a decoder or produce unlimited work.
- Empty fragments are valid only with unavailable geometry. A one-point fragment is not a line or a completed route; render a position without inventing a second point. For long rides, simplify accepted geometry per fragment while retaining endpoints and boundaries, mark `simplified`, and preserve the private raw journal. Never silently truncate a displayed route as complete.
- Distance is accumulated from accepted fixes before optional geometry simplification. A simplified line's chord length cannot be used as proof that the reported distance is exact. Road-snapped M4 navigation geometry is separate and never overwrites the recorded observations/proof path.

## Vehicle/category/class metadata

Deep-copy the active vehicle **at logical ride start**; changing the Garage selection or editing a model while paused applies to the next ride. The journal and first cloud insert bind the same snapshot. `vehicle:null` means no vehicle was selected; do not invent PCX160/S1000RR/Civic data for new users.

Current local `Category='bigbike'` maps to existing backend `'motorcycle'` only at this boundary. A maxi-scooter remains `'scooter'` regardless of cc. Current GarageVehicle lacks kW/cloud vehicle revisions; nullable `motor_kw` is unknown until M3 actually supplies it. Never derive EV cc or assume a model year/variant.

Server columns derive `category`, `powertrain`, `class_scheme_version` and `class_key` from the bound snapshot. For example, version 1 can use scooter boundaries ≤125, >125–160, >160; motorcycle ≤500, >500–900, >900; EVs separate; cars `unknown` until a defined class catalog exists. Preserve decimal displacement and define class boundaries precisely. Empty/unknown specs remain `unknown`, not a convenient competitive class.

All M2 snapshot/spec/class metadata has authority **self_reported**; clients cannot send `verified`, approved catalog status or an authoritative class. M3's server-owned vehicles/catalog can add a nullable validated cloud vehicle reference for new captures later; it must not rewrite existing snapshots. M6 verified competition classes require their own server-authoritative vehicle binding. Summary class hints must never be consumed as rank eligibility.

## Additive schema, idempotence and RLS

Propose `public.rs_rides` with UUID primary key, owner Auth FK, revision, payload/schema version, immutable start snapshot/metadata, private segmented geometry/statistics, server-fixed `speed_status='self_reported'` and `visibility='private'`, created/updated receipt times. Index `(owner_id,ended_at desc,id)` for bounded owner history. Keep derived scalar columns needed for display; do not create raw GPS-row tables in the cloud.

Propose `ride_private.ride_summary_operations`, primary key `(owner_id,operation_id)`, owner Auth FK, ride ID, expected/applied revision, canonical payload/hash and original receipt time. It is outside exposed schemas with no browser table privileges. Store the exact normalized payload or comparison material so one UUID cannot be reused for a different request; hashes are calculated server-side, never trusted from the client. Reject extra evidence/source attestation fields during normalization. Canonical equality must handle object-key order/numeric normalization deliberately.

Within one transaction:

1. Obtain actor/account-deletion fence, validate bounded payload, look up the owner-scoped operation.
2. An existing operation with the same ride/expected revision/canonical payload returns its original acknowledgement plus the current revision. A changed request under that UUID fails `RIDE_OPERATION_CONFLICT`; a response-loss retry is never a second ride or extra revision.
3. For a new operation, lock/read the ride. A foreign-owner UUID fails `RIDE_UNAVAILABLE` without exposing that row. Create only with expected revision 0; update only with exact revision and immutable metadata match. Concurrent same-base updates cannot silently overwrite each other.
4. Write ride and operation receipt atomically; return only server-controlled acknowledgement fields. Do not send a success before commit. An old operation replay acknowledges that operation without reverting a newer row or lowering local cached cloud revision.

RLS on public ride rows: authenticated owner **and active account only**. Grant owner SELECT; revoke direct INSERT/UPDATE/DELETE from anon/authenticated. New sync/status RPCs get exact authenticated EXECUTE grants; helpers and private receipt tables remain closed. No broad `grant every rs_* function` loop: preserve verifier/moderator/delete service-only grants. Proposed stable errors: `RIDE_SUMMARY_INVALID`, `RIDE_SUMMARY_TOO_LARGE`, `RIDE_OPERATION_CONFLICT`, `RIDE_REVISION_CONFLICT`, `RIDE_SNAPSHOT_CONFLICT`, `RIDE_UNAVAILABLE`, plus existing `ACCOUNT_DELETION_PENDING`.

Extend `rs_purge_account_data` in the **new** M2 migration to remove ride operations and rides before Auth removal, including Auth-only users without profiles. Keep its token fence, cross-owner challenge cleanup and binary-first checks unchanged. Direct Auth FK cascade is a fallback, not the deliberate DB purge phase. Account-deletion receipt lookup must remain read-only and must never authorize outbox mutations.

The implemented sync quota uses existing `ride_private.quota`: 100 new mutations per owner/UTC day. Replay/status/history reads do not consume it. Private receipts retain exact validated JSONB plus a server-calculated SHA-256; define a retention/compaction policy and observe database growth before broad release, preserving the documented operation retry window. No arbitrary receipt expiry is implemented.

## Durable outbox and UI states

At awaited Stop/save: invalidate callbacks → await exclusive provider release → drain journal writes → atomically commit finalized summary + immutable operation UUID/payload/expected revision. Show **saved on this device** only after that transaction. Pending sync does not invalidate an already saved ride.

One serialized worker per active owner reads only that owner's unsynced finalized rows, captures current auth scope/JWT for each request, and checks owner/generation after every await before applying local results. No tokens belong in the journal/outbox. Guest rides never upload; importing them requires an explicit owner action and new ownership/IDs, with cloud/evidence bindings removed. A→B→A transitions cannot reattribute A's operation to B.

States: `local_saved`, `pending`, `syncing`, `synced`, `retryable_error`, `conflict`, `blocked_account`. Persist attempts/next retry time, acknowledge receipt+payload identity atomically and keep original operation on network timeout/response loss. Coalesce retries with bounded exponential backoff/jitter; foreground/reconnect/manual retry triggers suffice for M2. Do not network-sync at GPS or animation frequency. On a stale revision, fetch owner history and retain the local conflicting payload for deliberate reconciliation; never mint a new UUID to hide a conflict.

Account sign-out invalidates/drains capture work and stops retries, but preserves the former owner's private journal for an explicit later login. Confirmed account deletion closes that owner's writer, cancels outbox tasks and removes only that owner's local rows after server completion. A timed-out delete remains quarantined rather than being imported into guest/another user's history.

## Android, platform and verification limits

Android's real foreground `expo-location` fixes can drive recording, accepted geometry, distance and private summaries. Expo does not supply native iOS speed uncertainty; keep missing fields null and preserve Android's reported mocked flag locally. No generated accuracy, interpolated position or `mocked:false` substitute qualifies it for the existing CoreLocation verifier. iOS Expo fallback and browser captures have the same honest self-reported boundary.

The existing Swift provider explicitly disables background capture; `watchPositionAsync` is not a background task. M2 foreground/background/lock-screen interruption follows the map/journal contract. Background location is a later opt-in lifecycle/permission/device acceptance task, not inferred from adding an online outbox. Android build/runtime and physical GPS/performance acceptance remain required; this design promises neither native compilation nor measured smoothness.

## Meaningful implementation checks after the M1 gate

- PGlite, all migrations in order: owner/Auth-only save, foreign read/write/UUID denial, private-only RLS, exact function grants/fixed search paths, duplicate operation response loss, changed operation rejection, same-base CAS race, immutable vehicle/start snapshot, stale replay after newer revision, and deletion of rides/receipts before Auth.
- Shared codec/validation: coordinate order, E5 negative/±180 boundaries, escaped backslashes, malformed/overlong varints, bounded work/point counts, one-point/empty tracks, duplicate fragments and zero connection across pause/lost-fix gaps. Validate caps before SQL work grows.
- Journal/outbox: transaction failure leaves no success/phantom operation; release/flush failure preserves recoverable data; crash restore pauses at checkpoints; denied starts retain older evidence; old A responses cannot mutate B; same logical ride/vehicle across resume; guest stays offline; expired token retries use a fresh same-owner request; deletion closes writers.
- Evidence regression: preserve unfiltered delivered timestamps/accuracy/simulation flags, owner/challenge/capture binding, immutable proof bytes, native-only eligibility and existing lease/rejection tests. Spy on actual transport boundaries to prove ordinary summary sync never uploads raw proof or invokes reserve/queue/verify.
- Real acceptance: save offline → restart → reconnect → one private cloud row; authenticated unrelated account sees none; foreground Android route is real but labeled self-reported; existing iPhone approved-course evidence still follows its explicit separate flow. Device capture/performance and hosted RLS are measured gates, not outcomes asserted by this document.

## Local implementation evidence

`backend/tests/ride-summary.test.mjs` executes all migrations in PGlite with real RLS/grants: Auth-only owner save, foreign denial, semantic replay, quota conservation, stale CAS, immutable snapshot/start, null/stationary/clock-anomaly semantics, raw-field rejection, malformed/bounded decoding, signed geographic edges, exact 4,096-point bound, tied-time keyset history and deletion purge/fences. The decoder reads a precomputed UTF-8 byte buffer; it does not rescan text from the beginning for each character. Local timing is test-environment evidence only, not hosted latency or frame-rate acceptance.

`ExpoRideSpeed/tests/rideSync.test.mjs` exercises actual encoder output and deterministic endpoint-preserving part simplification, detached frozen snapshots, honest unavailable stats, actual SDK request bodies/paths/JWT, loss recovery, operation/revision response identity, before-egress raw-field rejection and A→B→A discard. Extensionless native imports are exercised through the established TypeScript transpile harness; no native tsconfig change is required. `toRideSummary(ride,platform)` must run once after durable finalization, and its exact JSON payload/revision/operation must be persisted for every retry. `syncRideSummary`, `getRideSyncStatus` and `listRideSummaries` use the account-scoped fixed-token transport. They never access Storage or competition RPCs.
