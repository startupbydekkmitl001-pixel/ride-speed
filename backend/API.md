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
