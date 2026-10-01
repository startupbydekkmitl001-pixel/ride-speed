# Native client contract (v5)

Status: the foundation and additive M1 account/avatar lifecycle are deployed; hosted acceptance is recorded separately in DEPLOYMENT.md. Additive M2 private-summary source is locally verified and awaits its separate hosted review/deployment. Use the project URL + **publishable** key in the app. Keep secret/service credentials only in Edge Functions. All owner RPCs derive the acting UID from the authenticated session.

## M2 private ride summaries

The journal/outbox is separate from native competition evidence. `202610010004_private_ride_summaries.sql` adds `rs_rides` and private operation receipts. Auth-only users can sync without creating a profile. Every summary, vehicle/class hint and statistic remains **self-reported and private**. These rows cannot populate ranks, friend presence or community posts. No raw GPS sample arrays, accuracy/source evidence or Storage upload is part of summary sync.

```ts
rs_sync_ride_summary({
  p_operation: UUID, // persist once; reuse after timeout/restart
  p_ride: UUID,      // logical ride, independent of capture IDs
  p_expected_revision: 0 | number,
  p_payload: RideSummaryV1
}) -> {
  operation_id: UUID, ride_id: UUID,
  applied_revision: number, current_revision: number,
  payload_sha256: string, // SHA-256 of PostgreSQL jsonb text, computed by server
  speed_status: 'self_reported', visibility: 'private', synced_at: UTC_ISO
}
rs_get_ride_sync_status({p_operation: UUID}) -> same acknowledgement | null
```

Create uses expected revision 0 and returns revision 1. A later correction needs the exact current revision and a new persisted operation; original start UTC instant, schema identity and vehicle snapshot cannot change. Replaying the same operation/ride/revision/payload returns its original receipt and current row revision, without a new write or quota hit. Changed data under the same operation fails `RIDE_OPERATION_CONFLICT`. An old successful operation never rewrites a later row. JSON object-key order/numeric representation uses PostgreSQL JSONB semantic equality. The hash is an audit field; clients must preserve the immutable request rather than hash a differently formatted JSON string.

Payload type lives in `ExpoRideSpeed/src/features/rides/syncTypes.ts` and the full [M2 contract](../docs/research/m2-ride-sync-contract-v5.md). Required fields: schema version 1; actual UTC start/end strings ending in `Z`; active/elapsed integer milliseconds; clock anomaly; nullable distance metres/max/average metres per second; reported provider; capture/accepted/rejected counts; geometry status; nullable immutable vehicle snapshot; `{encoding:'polyline5',fragments:[{segment_id,capture_id,part_index,polyline,point_count}]}`. All keys are explicit and unknown fields are rejected. No-fix measurements stay null; a confirmed stationary measurement can be 0. Average, when present, must equal distance/active seconds within 0.001 m/s. Without a clock anomaly, elapsed must match end minus start within 1 s and active cannot exceed elapsed by more than 1 s. With an anomaly, elapsed is null and actual observed UTC values remain intact.

Limits: 128 fragments, 4,096 decoded coordinates, 64 KiB total encoded strings, 128 KiB JSONB text, active/elapsed durations up to 7 days, distance up to 10,000 km, speed up to 500/3.6 m/s, and integer counts up to 10 million. Storage bounds do not verify the ride. Polyline decoding validates E5 coordinate range, matching point counts, unique segment/part identity and capture association with bounded byte/varint work. Parts never connect across pause, lost fixes or crash. Client conversion simplifies each part independently and retains endpoints; it marks `simplified` and retains the local raw journal. More than 128 parts remain locally saved with a sync error until explicitly reconciled; they are never merged silently.

Vehicle category `bigbike` maps to `motorcycle`; decimal cc remains intact, unknown fields remain null, and EVs use kW without invented cc. Class scheme 1 uses scooter ≤125 / >125–160 / >160; motorcycle ≤500 / >500–900 / >900; electric vehicles are separate and cars/unknown displacement stay unknown. These labels are display hints, not competitive eligibility.

Owner history on another device:

```ts
rs_list_ride_summaries({p_limit:20, p_before_end:null|UTC_ISO, p_before_id:null|UUID})
  -> {items:[{
    ride_id, revision, payload, category, class_key, class_scheme_version:1,
    metadata_authority:'self_reported', speed_status:'self_reported', visibility:'private',
    created_at, updated_at
  }], next_cursor:null|{ended_at,ride_id}}
```

Use both cursor fields returned by the server; limit is 1–50. Ordering is ended UTC instant descending, then ride UUID descending, including tied timestamps and anomalous device clocks. Only the active authenticated owner is read; no profile is required, and no evidence bytes or private operation IDs are returned. Reading this history does not recreate native proof or silently import it into another owner's local journal.

The client entry points are `syncRideSummary(scope,session,draft)`, `getRideSyncStatus(scope,session,operationId)` and `listRideSummaries(scope,session,{limit,cursor})`. `toRideSummary(ride,platform)` runs once after finalization; persist its immutable payload with the operation/revision before scheduling network work. The initiating JWT is fixed for every request; UID/generation checks reject completion after sign-out or A→B→A. A response-loss status lookup is read-only and never changes the operation. Retry after token refresh uses a fresh same-owner request. Guest journals never sync automatically.

New mutations have a 100-operation/day/owner limit using the existing UTC quota bucket; receipt replays/read history do not consume it. Stable server errors: `RIDE_SUMMARY_INVALID`, `RIDE_SUMMARY_TOO_LARGE`, `RIDE_OPERATION_CONFLICT`, `RIDE_REVISION_CONFLICT`, `RIDE_SNAPSHOT_CONFLICT`, `RIDE_UNAVAILABLE`, plus `ACCOUNT_DELETION_PENDING`. Client transport additionally maps failures to `RIDE_SYNC_UNAVAILABLE`, `RIDE_SYNC_AUTH_REQUIRED`, `RIDE_SYNC_RATE_LIMITED`, `RIDE_SYNC_INVALID_RESPONSE` and `ACCOUNT_CHANGED`; localize them instead of showing arbitrary backend text. A conflict retains the original local payload for deliberate reconciliation.

RLS allows active owners SELECT only; direct INSERT/UPDATE/DELETE is denied. Only exact sync/status/history RPCs receive client EXECUTE. The new migration extends the token-fenced, binary-first deletion phase to purge summaries and private receipts before Auth removal, retaining established cross-owner challenge/evidence cleanup. Existing verifier grants and native evidence contracts remain unchanged.

## M1 onboarding, privacy and profile avatar

Account state and profile existence are separate. `rs_get_account_state()` creates an owner-only state if absent and returns:

```ts
{
  revision: number,
  onboarding_version: 1,
  onboarding_step: 'language' | 'location' | 'profile' | 'vehicle' | 'complete',
  location_choice: 'unknown' | 'granted' | 'denied',
  preferences: {
    ghost_mode: boolean,
    route_audience: 'friends' | 'private',
    notifications_enabled: boolean
  },
  updated_at: string // UTC ISO timestamp
}
```

Fresh defaults: `language`, `unknown`, `{ghost_mode:true, route_audience:'friends', notifications_enabled:false}`. Only profiles present when the additive migration executes receive completed onboarding version 1; existing explicit presence opt-in is preserved. Creating a profile later does not complete onboarding. Location/profile/vehicle may be skipped: completion describes the wizard, not online sharing authorization. Native permission checks and the existing profile gate still apply. Offline completion is a local pending draft until synced.

`rs_update_account_state({p_expected_revision,p_onboarding_step,p_location_choice,p_preferences})` returns the same object. Preferences is a partial object containing only the three keys above; types and unknown keys are validated. Revision conflicts require fetching and reconciling current state. Language, theme, units and accessibility overrides remain device-local.

Saving `ghost_mode:true` immediately disables server presence, removes the heartbeat session and rotates friend topics. Saving `ghost_mode:false` is explicit presence opt-in; the next foreground heartbeat publishes online status. No location is broadcast. Existing `rs_set_presence(true|false)` remains compatible and synchronizes ghost mode; it may advance the account-state revision, so refresh state afterward. Notifications false is a preference; push delivery is a later milestone. Route audience is a composer default, not retroactive modification of explicitly shared routes/posts.

Avatar flow (saved profile required):

1. Read `rs_get_avatar()` → `{revision:0,avatar_id:null}` or current `{revision,avatar_id}`. Persist an upload UUID for response-loss retries.
2. `rs_reserve_avatar({p_id:<UUID>,p_mime:'image/jpeg'|'image/png'|'image/webp'})` → `{upload_id,bucket:'ride-avatars',path,expires_at}`. Server path: `<authenticated UID>/<upload UUID>.jpg` (`.png`/`.webp` for matching MIME). Reservation expires after one hour; same UUID/MIME returns the original path/expiry without extending it. Up to 20 new reservations/day. Use a new UUID after expiry.
3. Resize/compress/strip EXIF locally; upload to that private bucket/path, maximum **1 MiB**, `upsert:false`. Only a live owner reservation can insert. Client UPDATE/DELETE are denied; owner Storage `info(path)` supports ambiguous upload recovery.
4. `rs_commit_avatar({p_id,p_expected_revision})` checks actual object size/MIME and returns `{revision,avatar_id}`. Repeating the current committed UUID is idempotent even with its old revision. A different upload requires the latest revision. Old avatars become obsolete.
5. `profile-avatar-url` POST `{}` for self or `{userId:<UUID>}` for an accepted, unblocked friend → `{url:null|string,expiresIn:60,avatarId:null|UUID}`. The request never supplies a path. URLs use the project's HTTPS `/storage/v1/object/sign/ride-avatars/` prefix, valid for 60 seconds. Blocking cannot revoke an already-issued URL before expiry. Self-refresh opportunistically removes at most 20 obsolete/expired objects through Storage API. Periodic off-device cleanup remains an operational gate.

Stable RPC errors: `ACCOUNT_STATE_INVALID`, `ACCOUNT_STATE_CONFLICT`, `ACCOUNT_DELETION_PENDING`, `AVATAR_PROFILE_REQUIRED`, `AVATAR_UNAVAILABLE`, `AVATAR_UPLOAD_REQUIRED`, `AVATAR_INVALID_OBJECT`, `AVATAR_REVISION_CONFLICT`. Profile handle collision remains SQLSTATE `23505`. Signer errors: `AVATAR_LOOKUP_FAILED` (503), `AVATAR_UNAVAILABLE` (404 denied/no profile; 503 signing outage). Map these to localized client messages, never raw backend text.

## M1 account deletion

Require typing **DELETE** in the destructive confirmation sheet, then invoke `delete-account` POST `{confirmation:'DELETE',requestId:<persisted UUID>}` with the access token. Reject all extra fields, especially owner ID. Keep the same UUID through retry/restart.

Success: `{state:'deleted',requestId}`. Retry failures: `{error,requestId,retryable:true}` with `DELETION_IN_PROGRESS` (409), `DELETION_STORAGE_FAILED`, `DELETION_DATABASE_FAILED`, `DELETION_AUTH_FAILED` or `DELETION_STATUS_UNAVAILABLE` (503). An existing job with a different UUID returns `DELETION_REQUEST_CONFLICT` (409, `retryable:false`): recover the original UUID. Invalid schema/confirmation: `INVALID_REQUEST` (400); oversized body: `REQUEST_TOO_LARGE` (413); invalid session: `AUTH_REQUIRED` (401).

The service quarantines the account, hides sharing/presence/posts, cancels creator challenges and fences verification jobs. It snapshots **other owners' evidence** referenced by those challenges, all owned Storage objects and owner-prefix orphans in app buckets. Storage API removes binaries first; production SQL never deletes Storage metadata alone. After proving no queued/owned objects remain, SQL removes other-owner challenge-dependent records/submissions and the owner's profile data. Auth admin deletion is last. Other accounts and unrelated submissions remain intact. An Auth DELETE trigger completes the minimal private receipt in the same transaction, even if the final HTTP response is lost.

After success, clear this account's session and local namespace. A lost final response can be recovered by repeating the POST with the **original unexpired access token** and saved request UUID. After `getUser` fails, the narrow read-only fallback verifies that JWT's signature, project issuer, authenticated audience/role, expiry and UUID subject, then checks only the exact completed receipt. It cannot begin, purge or resume deletion. Supabase `getClaims` uses project JWKS for asymmetric signatures; symmetric signing falls back to Auth. Recovery therefore requires an available asymmetric key and unexpired token. Current project's public JWKS reported ES256/EC on 1 October; no key material is stored in our sources. [Supabase getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims), [JWT verification and expiry](https://supabase.com/docs/guides/auth/jwts).

Do not save an access token in the deletion-request record; the existing secure Auth session owns it. If no valid token remains, 401 is not proof of completion: sign out/quarantine that pending identity and offer truthful recovery guidance. Operators can inspect the receipt. Storage/DB/Auth failures retain a retryable job with a five-minute lease. Each invocation allows five 100-object batches and requests retry if no empty batch was observed. Completed receipts contain UID, request UUID, timestamps and status/error codes only; operate a seven-day receipt purge policy before broad release. Automated/live QA must not delete the real user's account.

`rs_begin_account_deletion`, `rs_account_deletion_objects`, `rs_release_account_deletion`, `rs_purge_account_data`, `rs_completed_account_deletion` and `rs_avatar_cleanup_objects` are **service-only**. The receipt RPC returns a boolean only for exact owner/request + completed/deleted state. Never call Auth deletion directly or expose a service key in the app.

## Account and friends

Use `supabase.auth.signUp({email,password})`, `signInWithPassword`, `resetPasswordForEmail`, `updateUser({password})`, and `signOut`. Confirmation/recovery emails require the project's configured sender and correct redirect allowlist. Never store passwords in our tables or logs. After confirmed sign-in, call:

| RPC | Named arguments / result |
|---|---|
| `rs_upsert_profile` | `p_handle` lowercase ASCII letters/digits/underscore, 3–24; `p_display_name` Thai/English 1–40. Returns profile. |
| `rs_my_friends` | No args. Returns other `user_id,handle,display_name,state,direction` (`incoming`/`outgoing`), and `generation`. |
| `rs_request_friend` | `p_handle`. Returns `incoming`, `outgoing` or `accepted`. Sending a crossed request does not silently accept. |
| `rs_friend_action` | `p_other` UUID; `p_action`: `accept`, `decline`, `cancel`, `remove`, `block`, `unblock`. |
| `rs_set_presence` | `p_enabled` boolean, explicit opt-in. |
| `rs_heartbeat` | No args; foreground only, every 30s. Returns server expiry (~70s). |
| `rs_friend_presence` | No args. Returns `user_id,topic,online,expires_at`. Ignore expired status, including cached payloads. |

Read self with `.from('rs_profiles').select('*').eq('user_id', session.user.id).single()`. Others' private profiles are not a directory. For presence, join returned topics using `channel(topic,{config:{private:true}}).on('broadcast',{event:'presence'},...)`. Only server RPCs publish status. Payload: `{user_id, online, expires_at}`; never location. Refresh channel memberships on friend changes and on reconnect. Unsubscribe on sign-out/background; expired or unavailable state becomes unknown/offline, not permanently online.

## Saved routes and invitations

`rs_save_route({p_id:null,p_expected_revision:0,p_title,p_category,p_stops})` creates a cloud UUID. Keep the returned `id` separately as `cloudId`; do not send a local string ID as UUID. Later updates pass that UUID plus the last returned revision. A revision conflict requires refresh, not silent overwrite. Categories: `scooter` (PCX160), `motorcycle` (S1000RR), `car` (Civic RS), `bicycle`. Stops: 2–12 `{label,lat,lng,place_id?}` objects. No Google response cache. Apple Maps can use these user-selected coordinates without backend map credentials.

- List `.from('rs_routes').select('*').order('updated_at',{ascending:false})`; RLS returns own/explicitly shared routes.
- Delete `rs_delete_route({p_id:<cloudId>,p_expected_revision:<cloudRevision>})` returns true. Existing challenge snapshots remain immutable even when the source route is deleted.
- Share/revoke `rs_share_route({p_route,p_friend,p_share:true|false})` with an accepted friend.
- Create `rs_create_challenge({p_id:<new UUID>,p_route:<cloudId>,p_revision,p_mode:'group_ride'|'timed_race',p_session:null|<approved session UUID>,p_starts:<ISO UTC>,p_ends:<ISO UTC>})`. Window must be future and at most 24h. It stores an immutable copy of that exact saved revision.
- Invite `rs_invite_challenge({p_challenge,p_friend})`; decisions `rs_challenge_action({p_challenge,p_action:'accept'|'decline'|'withdraw'|'cancel'})`. Only the creator cancels; only invited recipients decide.
- Invitations bind to the accepted friendship generation. Reconnecting after removal/block does not revive old access; the creator must explicitly invite again and the recipient accepts again.
- Read `.from('rs_challenges').select('*')` and `.from('rs_challenge_members').select('*').eq('challenge_id',id)` under RLS.

Normal routes support group-ride invitations. **Timed races require an operator-approved closed course, an approved route revision and approved session**; clients cannot approve these. `rs_courses`/`rs_course_sessions` list approved entries. A new project has none; don't offer fake eligible races.

## Community posts and images

1. Generate UUID, `rs_create_post({p_id})` creates a private draft.
2. Optional image upload: bucket `ride-community`, path `<UID>/<post UUID>/<random UUID>.jpg` (also jpeg/png/webp), maximum 3 MiB, `upsert:false`. Strip EXIF/location metadata and resize on-device before upload. Bucket is private.
3. Explicitly preview the actual saved cloud route/picture and choose audience. Call `rs_publish_post({p_id,p_caption,p_description,p_speed:null|number,p_route:null|<own cloud route UUID>,p_route_revision:null|<previewed cloud revision>,p_visibility:'private'|'friends'|'community',p_media_path:null|<uploaded path>})`. Both route fields are required arguments (use null for both when absent). The server rejects a changed revision so the client can fetch and preview again; never preview an unsynced local route as if it were the shared snapshot. Speed here is **self-reported, never a ranked result**. Caption max280, description max4000.
4. Feed: `rs_feed({p_limit:30,p_before:null|<last created_at ISO>,p_before_id:null|<last post UUID>})`. Returns `id,owner_id,caption,description,claimed_speed_kmh,route_snapshot,media_path,visibility,created_at,display_name,handle,speed_status:'self_reported'`. Use both cursor fields when loading more. Use `media-url` Edge Function with `{postId}` to obtain a URL valid for 60s; do not save it to the post.
5. Delete `rs_delete_post({p_id})`; delete the owned Storage object via Storage API after deletion. Already issued signed links last until expiry. Report `rs_report_post({p_id,p_reason:'spam'|'harassment'|'privacy'|'dangerous'|'other',p_detail})`. Blocking uses the friend action RPC and hides both directions of post visibility.

## Measurement submissions and ranks

`rs_reserve_submission({p_id:<UUID>,p_challenge:<accepted timed challenge>,p_visibility:'private'|'friends'|'community'})` returns evidence path. Upload a **UTF-8 JSON** v1 envelope as `application/octet-stream` to `ride-evidence` at that exact path (2 MiB maximum, no overwrite), then `rs_queue_submission({p_id})`. Invoke `verify-submission` with `{submissionId}`. `.from('rs_submissions').select('*')` exposes only the user's statuses/reasons.

Envelope schema (timestamps are epoch milliseconds, units explicitly SI):

```json
{
  "schemaVersion": 1,
  "challengeId": "UUID",
  "source": "corelocation",
  "samples": [
    {"timestampMs": 1790000000000, "latitude": 13.7, "longitude": 100.5,
     "speedMps": 10.0, "horizontalAccuracyM": 4.0, "speedAccuracyMps": 0.4,
     "isSimulatedBySoftware": false, "isProducedByAccessory": false, "mocked": null}
  ]
}
```

Capture actual delivered timestamps and native accuracy fields. Never fill missing accuracy, duplicate timestamps, densify samples or send an existing “3-sample max” as a 3-second measurement. At least four valid ordered observations supporting a complete three-second window are required. The verifier rejects missing accuracy, gaps and malformed evidence. Existing foreground Expo samples without native speed accuracy do **not** become ranked automatically.

Source flags are optional boolean-or-null fields; preserve actual values. Omission/null means unknown, and false is only a reported flag, not sensor attestation. Any sample with `isSimulatedBySoftware:true` or `mocked:true` rejects the **whole submission** as `SIMULATED_LOCATION`, including samples outside the selected speed window. Other flag types reject as `SAMPLE_MALFORMED`. `isProducedByAccessory:true` is allowed because a real GPS accessory or CarPlay can supply location; all accuracy/course/time checks still apply. The Edge worker records these as terminal rejections using its current lease. [Apple source information](https://developer.apple.com/documentation/corelocation/cllocationsourceinformation), [external accessory flag](https://developer.apple.com/documentation/corelocation/cllocationsourceinformation/isproducedbyaccessory).

`rs_leaderboard({p_period:'today'|'week'|'month',p_category,p_scope:'community'|'friends',p_course:null|<course UUID>})` returns `rank,user_id,display_name,sustained_kmh,recorded_at,method`; one best record per rider. Period boundaries use **Asia/Bangkok**: midnight each day, Monday midnight each week, first-day midnight each month. Database timestamps remain UTC instants. Only server-derived eligible records appear. Pending/rejected/self-reported data never appear. Ties share rank.

Server-only RPCs: `rs_finalize_submission`, `rs_reject_submission`, `rs_moderate_post`, `rs_claim_submission`, `rs_release_submission`. Their execute permissions are denied to browser/native authenticated roles. Verification jobs have an atomic two-minute lease and a maximum of three attempts. A calculated verification checks the submitted evidence; it is not cryptographic proof of authentic GNSS or an anti-cheat guarantee.

## M3 — owner Garage, catalog and vehicle photos

`202610010005_garage_catalog.sql` is additive after the deployed 001–004 sources. It does not seed user vehicles or alter existing ride snapshots. `rs_garages` stores one entire private owner document, with no profile prerequisite. Direct writes are denied; the authenticated actor, account lock and pending-deletion fence are required by every owner RPC.

```ts
type GarageDocumentV1 = {
  schema_version: 1;
  vehicles: readonly {
    id: string; catalogId: string | null; category: 'scooter' | 'bigbike' | 'car';
    brand: string; model: string; variant: string | null; year: string | null;
    engineCc: number | null; motorPowerKw: number | null;
    powertrain: 'petrol' | 'diesel' | 'hybrid' | 'electric' | null;
    nickname: string | null; color: string | null; photoPath: string | null;
  }[];
  selectedVehicleId: string | null;
};
```

Preserve stable local IDs and vehicle order; there is no UUID requirement for a vehicle ID. IDs/catalog IDs allow 1–100 characters; brand 80, model/variant 100, year 30, nickname 80. Fields are explicit, nullable where shown; unknown keys and control characters are rejected. `selectedVehicleId` must match an entry or be null. The complete document is limited to 200 vehicles and 512 KiB of PostgreSQL JSONB text. Displacement preserves decimal cc, within 0.01–10,000; motor power within 0.01–2,000 kW. Electric vehicles have null cc. Hex colors use six digits. Garage uses `bigbike`; the ride-summary boundary uses `motorcycle`. All user/catalog references and specs remain self-reported metadata, never competitive classification or verification.

- `rs_get_garage()` → `{revision,document,updated_at}`. A never-published owner returns revision 0, an actual empty document and null update time, without inserting data.
- `rs_sync_garage({p_operation:<UUID>,p_expected_revision:<integer>,p_document:<GarageDocumentV1>})` → `{operation_id,applied_revision,current_revision,document_sha256,synced_at}`. Initial publication requires expected revision 0. New mutations are capped at 100 per owner/UTC day.
- `rs_get_garage_sync_status({p_operation:<UUID>})` → the same receipt or null, only for this owner. Reads/replays have no mutation-quota hit.

Persist the UUID, expected revision and complete immutable document before egress. Exact response-loss retries return the original applied revision and latest current revision; they cannot rewrite a newer garage. Changed content under one UUID fails `GARAGE_OPERATION_CONFLICT`. A stale base fails `GARAGE_REVISION_CONFLICT`; fetch the owner snapshot and ask the owner which version to keep. No automatic last-write-wins/rebase is performed. JSONB semantic equality defines server replay identity; SHA-256 is server audit metadata, not a client JSON fingerprint. ACK persistence must preserve newer local edits. A valid ACK whose local write fails remains the authoritative queued receipt; never enqueue an older pending replacement behind it.

`rs_reserve_vehicle_photo({p_id:<upload UUID>,p_vehicle_id:<local vehicle ID>,p_mime:'image/jpeg'|'image/png'|'image/webp'})` → `{upload_id,vehicle_id,state:'reserved'|'committed',bucket:'vehicle-photos',path,expires_at}`. The one-hour reservation binds owner, local vehicle, MIME and immutable `${owner}/${uploadUUID}.{jpg|png|webp}` path. Reuse the same UUID after ambiguous responses; changing the owner/vehicle/MIME or retrying an obsolete/expired reserved upload fails. A committed upload replays with its original timestamp even after the reservation hour; only `state:'reserved'` can expire locally. A missing committed object is unavailable, not permission to overwrite or rotate an applied photo. At most 20 new reservations per owner/UTC day. New local vehicles may reserve before their first garage publication; no profile or existing cloud vehicle is invented.

Upload compressed, EXIF-stripped bytes to the private `vehicle-photos` bucket with `upsert:false`; cap 1 MiB and the reserved MIME. The owner may read reserved/committed objects for `info(path)` recovery. Client UPDATE/upsert/DELETE is denied. Whole-document `rs_sync_garage` is the photo commit: every referenced path must match this actor's reservation for that exact vehicle and have an existing Storage object with the reserved MIME and actual metadata size 1–1,048,576 bytes. Arbitrary owner-prefix paths, local files and URLs do not authorize a photo. Removed/replaced committed paths become obsolete and cannot be attached again. Replays recover a prior receipt without restoring obsolete media or a prior document.

`vehicle-photo-url` Edge Function accepts only `{vehicleId:<local ID>}` with a 4 KiB streaming request cap. Validated JWT/getUser + `rs_vehicle_photo_for_view` derive a path from the caller's **currently saved own vehicle** and committed reservation. Response: `{url,expiresIn:60,uploadId}`. Unrelated/friend accounts cannot sign this private vehicle photo. The request cannot supply owner, path or URL. Signed links expire within 60 seconds; a previously issued link lasts until its expiry. Pending local photo previews are not cloud photos.

`rs_vehicle_photo_cleanup_objects(p_owner)` is service-only and lists at most 20 unreferenced obsolete/expired paths. The signer attempts bounded best-effort Storage cleanup. Operate a periodic cleanup before broad release so abandoned uploads are drained even without subsequent photo reads. Account deletion's existing bucket-independent Edge flow now receives vehicle-photo paths; binaries must be gone before SQL purges garages, private operation receipts and reservations and then removes Auth. This includes known owner paths even when Storage owner metadata is absent. The original foreign-owner challenge/evidence cleanup, lease/receipt semantics and old owner fences remain intact.

`rs_vehicle_catalog` is authenticated read-only/service-managed, `{id,category,metadata,updated_at}`. Generate its reviewable seed with `node backend/scripts/garage-catalog-seed.mjs`; the editable source is `ExpoRideSpeed/src/data/vehicleCatalog.json`. Metadata preserves exact primary source URLs, edition/year verification, historical flags, reviewed specs, aliases/search terms and expressly unverified reference outputs. Seed statements create catalog rows only. They never change saved owner metadata or create rank eligibility. M3 also extends the existing ride-summary validator to allow actual diesel metadata, through an additive replacement identical in every other rule to deployed004; old summaries and all evidence/verification behavior remain unchanged.

An exact bound, still-reserved expired upload returns `GARAGE_PHOTO_EXPIRED`; foreign/changed/obsolete identities remain `GARAGE_PHOTO_UNAVAILABLE`. Persist a fresh upload UUID copy before retiring an expired photo draft; never extend the old reservation, reuse its path or mutate a pending garage operation. The sync RPC checks immutable applied receipts before expiry, so a successful operation's lost response still recovers its original ACK. Only a definite `GARAGE_PHOTO_EXPIRED` rejection can justify retiring that exact unapplied garage operation and creating a new operation against the current base; unknown responses must be retried unchanged. Concurrent remote edits still require explicit conflict resolution.

Stable errors: `GARAGE_INVALID`, `GARAGE_TOO_LARGE`, `GARAGE_OPERATION_CONFLICT`, `GARAGE_REVISION_CONFLICT`, `GARAGE_PHOTO_UNAVAILABLE`, `GARAGE_PHOTO_EXPIRED`, `GARAGE_PHOTO_UPLOAD_REQUIRED`, `GARAGE_PHOTO_INVALID_OBJECT`, and `ACCOUNT_DELETION_PENDING`. Transport maps quotas/auth/outages to bounded `GARAGE_SYNC_RATE_LIMITED`, `GARAGE_SYNC_AUTH_REQUIRED`, `GARAGE_SYNC_UNAVAILABLE` and rejects malformed ACK/snapshot envelopes as `GARAGE_SYNC_INVALID_RESPONSE`. Do not display arbitrary backend text.

## M4 private route documents and provider service

Exact TypeScript contracts and migration distinctions are in [m4-route-contract-v5.md](../docs/research/m4-route-contract-v5.md); maintained client types are `ExpoRideSpeed/src/features/routes/syncTypes.ts`. Apply additive006 only after deployed001–005. Full owner stops and geometry move to `ride_private.route_documents`; `public.rs_routes.stops` becomes an endpoint-trimmed projection (or an empty array). Existing owner readers must use `rs_get_route_owner`, rather than infer full private data from that public table. Existing raw stops are preserved privately before the public mutation; historical post/challenge snapshots keep nongeographic title/category/revision context and drop raw stop/geometry/bounds content. Existing course/session/anti-cheat gates remain intact.

`route-service` accepts only an authenticated current JWT and either `{operation:'search',query,language:'th'|'en',consent:true,proximity?:{latitude,longitude}}` or `{operation:'route',stops:[{latitude,longitude}],profile:'scooter'|'motorcycle'|'drive',consent:true}`. Requests cap at16KiB streamed UTF-8; queries normalize NFC/whitespace to3–120 Unicode codepoints. Proximity is rounded to0.01° before provider/cache use. Road pins preserve exact supplied coordinates and order. Search is Thailand-filtered with at most5 real results; debounce400ms. Route work starts after an explicit route action or completed pin drag, never on every animation frame. There is no automatic launch search/location egress.

Search returns `{items:[{id,label,subtitle,latitude,longitude}],attribution,cached}`. Routing returns `{routeToken,requestHash,provider:'geoapify',profile,segments:[[{latitude,longitude}]],distanceMeters,durationSeconds,calculatedAt,attribution,cached}`. Parts preserve GeoJSON MultiLineString leg boundaries. Token and hash are owner-bound server results, not client verification. Basic metric/free-flow routing does not expose live traffic, Thai maneuver instructions or any paid extra option. Never return/log key-bearing URLs or unfiltered provider request properties.

The Thailand pilot caps summed straight-line pin distance at200km and returned road distance at450km. Exceeding either returns `ROUTE_DISTANCE_LIMIT`; the UI must disclose these app limits. Route credits reserve3× the basic waypoint estimate; each owner is capped at150 reserved credits per rolling24hours, the shared project at2700 and four reservations per rolling second. Global budgets are serialized before upstream egress, not stored in process memory. Failed/timeout provider work retains its reservation. Same-request misses coalesce under a30s lease; the Edge timeout is8s and provider response cap is1MiB. Search cache lasts24hours, routes7days; every cache is private to its owner with account deletion fences. Cache hits retain Auth checks but consume no provider credits. Budgets are conservative app policy, not a guarantee of provider cost/access correctness or uptime.

Save: `rs_save_route_v2(p_operation UUID,p_id UUID,p_expected_revision integer,p_document RouteDocumentV1)`; delete: `rs_delete_route_v2(p_operation UUID,p_id UUID,p_expected_revision integer)`. ACK: `{operation_id,route_id,action:'save'|'delete',applied_revision,current_revision:number|null,document_sha256:string|null,synced_at}`. `rs_get_route_operation(p_operation)` returns the exact owner receipt or null. New routes use base0; metadata edits use explicit CAS and clear prior approval. Same operation/action/route/base/semantic document recovers its original receipt before source expiry; changed UUID content fails `ROUTE_OPERATION_CONFLICT`. Deleted IDs have durable tombstones; a late create cannot resurrect them. An explicit local copy after remote deletion needs a new cloud UUID. Private saves work without a profile.

Sources are `{kind:'road',routeToken}` (exact owner token/pins/profile required), `{kind:'recorded',segments:[independent polyline5 strings]}` (self-reported geometry only), or `{kind:'draft'}` (no geometry/road ETA). Title≤80,2–12 road/recorded stops,0–12 incomplete draft stops, labels≤80/place IDs≤300,32 parts/4096 points per part/10000 total,512KiB document and200 live routes/owner. The default is private until explicit audience choice. An unchanged saved server source can support metadata/audience edits after original cache expiry because its full geometry was copied at save; a new expired token returns `ROUTE_SOURCE_EXPIRED`, foreign/missing tokens `ROUTE_SOURCE_UNAVAILABLE`, mismatched pins/type `ROUTE_SOURCE_MISMATCH`. None grants competitive verification or course approval.

`rs_get_route_owner(p_id)` returns the full owner snapshot or null. `rs_list_routes_owner(p_limit=30,p_before=null,p_before_id=null)` caps50 and returns `{items,next_cursor:{updated_at,id}|null}` in descending timestamp/UUID order. Cursor comparisons preserve PostgreSQL microseconds and timezone offsets. `rs_get_route_projection(p_id)` authorizes current owner/friend/public/explicit generation-bound share and returns only safe metadata plus clipped segments. It omits original pins/place IDs/labels/bounds/full distance/time/provider timestamps. Geodesic clipping removes at least200m at each end, never bridges a recording gap, and fully hides geometry≤400m. Derive thumbnails, bounds and exports solely from this projection. Endpoint trimming does not promise anonymity; preview before sharing or keep the route private.

Stable save codes: `ROUTE_INVALID`, `ROUTE_TOO_LARGE`, `ROUTE_OPERATION_CONFLICT`, `ROUTE_REVISION_CONFLICT`, `ROUTE_DELETED`, `ROUTE_SOURCE_UNAVAILABLE`, `ROUTE_SOURCE_MISMATCH`, `ROUTE_SOURCE_EXPIRED`, `ACCOUNT_DELETION_PENDING`; client maps quota/auth/outage/invalid envelopes to `ROUTE_SYNC_RATE_LIMITED`, `ROUTE_SYNC_AUTH_REQUIRED`, `ROUTE_SYNC_UNAVAILABLE`, `ROUTE_SYNC_INVALID_RESPONSE`. Provider codes: `AUTH_REQUIRED`, `INVALID_REQUEST`, `REQUEST_TOO_LARGE`, `NO_ROUTE`, `ROUTE_DISTANCE_LIMIT`, `QUOTA_EXCEEDED`, `THROTTLED`, `PROVIDER_UNAVAILABLE`, `SERVER_CONFIGURATION`, `ACCOUNT_DELETION_PENDING`. Only definitive source rejection may retire an unapplied pending request; unknown responses retain the complete immutable request. CAS/deletion conflicts require explicit resolution.

Service-only `rs_route_service_claim(p_owner,p_request)` and `rs_route_service_finish(p_owner,p_lease,p_result)` are unavailable to browser roles. They bind validated Auth owner, fixed request hash, lease and bounded normalized result. Deletion's binary-first purge removes owner provider requests/results/call metadata, route receipts/tombstones/documents before Auth removal. Ordinary route sync makes no evidence upload or rank write.

Service-only `rs_route_service_reconcile(p_owner,p_lease,p_distance_m)` conservatively raises that exact active route call’s reserved units using known returned metric distance before a too-long result is rejected. It never lowers reservations. Large detours, timeouts or unreadable responses mean estimated counters cannot guarantee actual provider credits; observe dashboard consumption and retain the Free plan/headroom. No client can supply a billed distance or call identity.

## M5A friends, status and invitations

Additive007 implements the frozen wire in `docs/research/m5a-social-contract-v5.md`. Every request derives its owner from the signed Auth actor, acquires the existing account lock and rejects pending deletion. New mutations require an actual profile. Reads for an Auth-only account return `self:{profile_ready:false,presence_opt_in:false,account_revision:0}` when no account state exists; they do not invent a profile or create account state.

| RPC | Arguments | Response |
| --- | --- | --- |
| `rs_social_snapshot` | `p_limit=30,p_before=null,p_before_user=null` | `{owner_id,server_now,self:{profile_ready,presence_opt_in,account_revision},items,statuses,next_cursor:{updated_at,user_id}\|null}` |
| `rs_blocked_people` | `p_limit=30,p_before_user=null` | `{owner_id,items,next_cursor:{user_id}\|null}` |
| `rs_invitation_inbox` | `p_limit=30,p_before=null,p_before_id=null` | `{owner_id,server_now,items,next_cursor:{created_at,id}\|null}` |
| `rs_social_mutate` | `p_operation:<UUID>,p_request:<SocialRequest>` | Exact `SocialReceipt` or only `{error:{code:<fixed business code>}}` |
| `rs_social_operation` | `p_operation:<UUID>` | This actor's original receipt or null; no admission or state mutation |

Pages cap30. Friend/invitation keysets sort timestamp then UUID descending and preserve PostgreSQL microseconds; both timestamp/cursor-ID arguments are supplied together. Blocks sort UUID ascending. Friend rows contain `user_id,handle,display_name,state,direction,generation,updated_at`; statuses contain only accepted IDs in that returned page, with `user_id,topic,online,expires_at`. An offline/expired status has null expiry. Topic format remains `rs-presence:<opaque UUID>`; no GPS or client-origin presence is accepted. Invalid legacy display names use the person's real unique handle in summaries without changing the stored profile. Own blocked rows include a fresh `block_token`; they expose no other person's blocks.

Every request has `schema_version:1`, one `action` and exactly the following action fields. Requests cap16KiB JSONB text; IDs/handles are canonical lowercase, generations≥1, revisions≥0, all integer values≤2147483647. Unknown fields—including owner, geometry and raw GPS—are rejected.

| Action | Exact action fields |
| --- | --- |
| `request_friend` | `handle` (3–24 ASCII letters/digits/underscores) |
| `friend_action` | `other_id,verb:accept\|decline\|cancel\|remove\|block,expected_generation` (null only for block of a currently absent pair) |
| `unblock` | `other_id,block_token` (exact current own token) |
| `set_presence` | `enabled,expected_account_revision` |
| `create_invitation` | `challenge_id,route_id,route_revision,reviewed_geometry_hash,mode:group_ride\|timed_race,session_id,starts_at,ends_at,recipient_id,friendship_generation` |
| `invitation_action` | `challenge_id,verb:accept\|decline\|withdraw\|cancel,expected_member_state,friendship_generation` (creator cancel requires both expectation fields null) |

A successful receipt is `{owner_id,operation_id,request,applied_at,result}`. Its exact normalized request, original result and time are stored atomically in a closed private table keyed by owner+operation UUID. JSONB equality defines retry identity. Exact replay occurs before current profile/relationship/window/admission checks and never reapplies or consumes quota. Reuse with changed content returns `SOCIAL_OPERATION_CONFLICT`. A receipt describes what applied then; refresh canonical pages rather than granting old friendship/presence rights from replay. Persist the full immutable operation before egress and retain it after an ambiguous response. A fixed error envelope may retire it only after scoped exact receipt lookup confirms null; unknown SQL/network failures are uncertainty, never definitive business rejection.

Each unapplied exact-handle probe consumes one committed `social_friend_probe` admission, capped40 per owner/UTC day measured after the account lock with wall time. Missing/self/blocked/cooldown targets return generic `SOCIAL_UNAVAILABLE` and still consume admission. The transition and successful receipt run in an inner PostgreSQL subtransaction; recognized rejection rolls back only that transition. The outer admission commits because the typed envelope returns normally. The existing independent40-successful-lookup/day and20-challenge-create/day quotas remain. Exact successful replays and receipt/page reads do not consume admission. Six superseded direct mutation RPCs lose browser/public EXECUTE access: `rs_request_friend`, `rs_friend_action`, `rs_set_presence`, `rs_create_challenge`, `rs_invite_challenge`, `rs_challenge_action`. Existing definer/account-preference callers and trusted service grants remain; old app clients must update these actions. This closes the old failed-exception quota bypass.

Friend actions pin the current pair generation and recipient/requester rights. Meaningful transitions rotate the opaque presence topic; stale intent fails without changing it. Unblock pins the exact own block token, so a delayed unblock cannot undo a later re-block and never restores friendships. Presence pins the account revision, preserves onboarding/location/other preferences and returns the actual resulting revision; opt-out removes the lease and rotates topics. Receiving status does not require publishing your own status. The unchanged heartbeat is server-origin, throttled20s, with70s expiry and no GPS grant.

Invitation creation is atomic create+one-recipient invite+receipt. It pins current accepted/unblocked friendship generation, own saved route revision and reviewed safe projection hash (including legitimate hidden/null), then checks fresh future wall time and≤24h duration. Timed mode retains exact approved closed-course route/session/operator gates and the legacy sustained-speed metric; group mode has null session/metricnone. An existing challenge UUID is never adopted. The stored006 snapshot contains only trimmed independent segments or hidden geometry, never owner pins/labels/place IDs/bounds/full metrics. Inbox rows expose only authorized creator/own member metadata; creators have `member:null`, and only an own open row has `can_cancel:true`. `route_summary:{title,revision,category}` retains valid nongeographic history. Invalid/historical `route_snapshot` is null and cannot be accepted; no raw-pin fallback exists. Participant mutations pin own member state and exact current friendship generation; removed/re-added friendships cannot revive old invitations. Existing max11 stored members and evidence/verification rules remain unchanged.

Fixed codes: `SOCIAL_INVALID`, `SOCIAL_TOO_LARGE`, `SOCIAL_OPERATION_CONFLICT`, `SOCIAL_UNAVAILABLE`, `SOCIAL_RATE_LIMITED`, `SOCIAL_AUTH_REQUIRED`, `PROFILE_REQUIRED`, `FRIEND_CHANGED`, `BLOCK_CHANGED`, `PRESENCE_CHANGED`, `INVITATION_CHANGED`, `INVITATION_UNAVAILABLE`, `ACCOUNT_DELETION_PENDING`. Only reserved known business rejections, the exact legacy quota error and exact challenge primary-key collision map to an envelope; unrelated SQL exceptions propagate as uncertain transport failures and must never appear as raw UI copy. Binary-first deletion purges owner social receipts and probe counters before Auth removal, while retaining all earlier foreign challenge/evidence, garage, summary and route cleanup. M5A requires no new Edge function, key or paid service; live convoy/race/GPS, push and QR/link invitations remain later M5 stages.

## M5B private foreground convoy pilot

Additive008 follows immutable001–007. Exact request/result/position DTOs are maintained in `docs/research/m5b-live-contract-v5.md` and `ExpoRideSpeed/src/features/live/types.ts`. Client RPCs derive the signed actor; control, room and position operations fence the existing own account before one pilot-wide control lock. Receipt lookup remains owner-only and has no room mutation. New tables are private, RLS-enabled and inaccessible directly to browser roles. Friend-link preview/request does not accept friendship or grant location. The convoy pilot starts disabled; enabling it requires operated minute cleanup and the gates in README.

| RPC | Arguments | Response |
| --- | --- | --- |
| `rs_live_mutate` | `p_operation UUID,p_request LiveRequest` | Exact owner `LiveReceipt` or fixed `{error:{code}}` |
| `rs_live_operation` | `p_operation UUID` | Exact own original receipt/null |
| `rs_cancel_live_grant` | Original `p_operation UUID,p_request location_grant` | Applied original receipt, or exact `{owner_id,operation_id,request,state:'cancelled',cancelled_at}`, or fixed error |
| `rs_friend_links` | none | `{owner_id,server_now,items}`; own active links,≤8, no token/hash |
| `rs_resolve_friend_link` | `p_link UUID,p_token TEXT` | `{owner_id,server_now,preview}` or fixed error |
| `rs_resolve_convoy_code` | `p_code TEXT` | `{owner_id,server_now,preview}` or fixed error |
| `rs_list_convoys` | none | `{owner_id,server_now,items}`;≤1 own nonterminal membership |
| `rs_get_convoy` | `p_convoy UUID` | Exact owner `ConvoySnapshot`/null |
| `rs_convoy_heartbeat` | `p_convoy UUID,p_member_generation INTEGER` | `{owner_id,convoy_id,server_now,host_lease_until}` or fixed error |
| `rs_publish_live_position` | `p_sample LiveSample` | `{owner_id,convoy_id,lease_id,sequence,received_at,expires_at}` or fixed error |
| `rs_convoy_positions` | `p_convoy UUID,p_topic_generation INTEGER` | `{owner_id,convoy_id,server_now,topic_generation,change_revision,items}` or fixed error |

The owner outbox stores immutable scalar control operations only. Same UUID/request replays before present expiry, CAS, profile, enablement and admission checks; altered content conflicts. A receipt never reactivates local capture or overwrites newer OFF intent. Unknown outcomes remain durable. Explicit OFF resolves an unknown grant through `rs_cancel_live_grant`: an exact applied receipt can be followed by a fresh canonical lease revoke; otherwise an immutable owner/request-bound tombstone prevents the delayed original from applying. `rs_live_mutate` then returns `LIVE_OPERATION_CANCELLED`. Statusnull alone does not prove cancellation; recover and durably record the exact cancellation proof before retiring that enabling request. Cancellation replay consumes no admission. No arbitrary action or foreign owner's operation can be cancelled by this API.

Canonical QR tokens are32random bytes/43base64url characters, hashed as UTF-8 `ride-speed:friend-link:v1:`+token. Eight-character uppercase Crockford room codes use `ride-speed:convoy-code:v1:`+code. The server stores hashes only, and resolver POSTs never enter receipts or logs. Resolvers consume committed10/minute and100/UTC-day actor/1000-project-day budgets even for unavailable outcomes. Unavailable resources all return null preview; exact owner/resource/generation-bound proof lasts at most5minutes. Link requests share007's committed40/day handle-probe admission. Store raw issuer tokens/codes only in owner-scoped versioned SecureStore; host-only current `self_code:{generation,hash,expires_at}` selects the display secret and prevents an old rotation ACK from selecting an obsolete code. Another device cannot recover plaintext from the server.

Rooms last≤1hour, host lease≤45seconds renewed at most once/15seconds, accepted participants≤4, requested≤12, historic unique members≤24, project nonterminal rooms≤2 and current memberships≤1/account. Every nonhost must remain an accepted unblocked friend of the host with the exact frozen generation. A block between any requested/accepted peers, host friendship-generation change, host lease expiry or deletion quarantine cancels the room; unblock/re-friend never revives it. Normal nonhost leave removes that member only. Host-approved requested membership sees host+self and no topic/peers/grant. Creation pins the owner's current revision and reviewed immutable200m-trimmed/hidden safe route; a draft or metadata-only history cannot become a trip route. No course, verified metric or race timing is implied.

Location defaults none and requires separate explicit15/60minute room/capture-bound consent, ghostfalse and actual current profile presence opt-in. Granted expiry is capped by room expiry. Server provenance/capture/foreground fields are client claims, **not sensor attestation**; nullable unknown source flags remain unknown, while known mocked/simulated samples are refused. Positions are self-reported live points and never enter verifier, ranking, ordinary summary or archived GPS history. Use one existing accepted capture bus, one in-flight publish and one replaceable memory-only fresh sample,≤1Hz, no offline sample queue or old-body replay after response loss. Accuracy must be positive≤20m; capture wall time within−3/+2seconds; canonical lease/member/consent/capture/topic fences and increasing int32 sequence are checked on each publish. Unchanged duplicate may recover the same live ACK. Retained lease sequence survives point removal/rotation; a new explicit lease resets it.

Every accepted position expires at min(received+15seconds, sender consent, room expiry, current host lease). Every read rechecks current accepted membership, all room blocks/friend generations, active accounts, sender ghost/consent/lease/TTL and exact topic. Returned peer data caps3 and labels authority `unverified_live`; no own duplicate. Application expiry is separate from delivered memory and provider backups/WAL. A private Realtime event contains only schema/room/epoch/change/kind and uses `rs-convoy:<unpredictable UUID>`; no coordinates, names, codes or tokens. Rotation clears positions, emits one final opaque hint on the retired topic and never emits future traffic there. No client Broadcast INSERT, Presence GPS, Postgres Changes subscription or raw table read is allowed. Current-topic RLS and a bounded≤1Hz foreground poll repair cached/dropped channel hints.

Eight predecessor entries move unchanged into revoked private helpers, and the public signature/grants remain: social mutate, trusted friend request/action, presence opt-in, status heartbeat, account preferences, deletion begin and purge. Every entry now takes account→global before its former profile/account-state/pair rows; nested calls are reentrant for the same owner and never acquire a foreign account under global. Six retired007 browser writes stay denied. Deletion begin cancels affected rooms/revokes links and grants before quarantine commits; binary-first purge retains all earlier cleanup and removes new owner receipts/cancellation proofs/rows before Auth deletion.

Fixed codes add `LIVE_INVALID`, `LIVE_TOO_LARGE`, `LIVE_OPERATION_CONFLICT`, `LIVE_OPERATION_CANCELLED`, `LIVE_UNAVAILABLE`, `LIVE_RATE_LIMITED`, `LIVE_AUTH_REQUIRED`, `LIVE_DISABLED`, `LIVE_CAPACITY`, `FRIEND_LINK_UNAVAILABLE`, `CONVOY_UNAVAILABLE`, `CONVOY_CHANGED`, `CONVOY_FULL`, `LOCATION_CONSENT_REQUIRED`, `LOCATION_CONSENT_CHANGED`, `LOCATION_STALE`, `LOCATION_QUALITY`, `POSITION_SEQUENCE`, alongside existing `PROFILE_REQUIRED`, `FRIEND_CHANGED`, `ACCOUNT_DELETION_PENDING`. Unknown SQL failures remain uncertain and are never mapped from arbitrary raw messages. Service-only `rs_live_cleanup()` bounds room/proof/link cleanup, clears expired points/consents and releases capacity; operator cron run history needs separate seven-day retention.
