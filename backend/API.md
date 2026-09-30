# Native client contract (v4)

Status: SQL foundation is locally executable; deployment and live integration are separate. Use the project URL + **publishable** key in the app. Keep secret/service credentials only in Edge Functions. All RPCs derive the acting UID from the authenticated session.

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
