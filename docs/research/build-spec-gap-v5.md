# BUILD SPEC v5: source gap audit and additive implementation plan

Audit date: 1 October 2026, Asia/Bangkok. Scope: the latest user BUILD SPEC against the canonical `ExpoRideSpeed/src`, native location module, backend migration/handlers/tests, package/configuration files and iOS workflow. This is a source audit, not a new hosted-service or physical-device acceptance run. No credentials were read, no backend was changed, and no product code was edited for this audit.

The current app is a working iPhone preview with real accounts and carefully restricted backend operations. The new spec is a substantial expansion. A fullscreen map, bilingual screens, durable recording, Android parity, live race timing, vehicle-class rankings and social interactions are not supplied merely by rearranging the current screens. Keep the proven authorization and measurement contracts while adding those capabilities in separate migrations.

## 1. Inventory and constraints to preserve

| Capability already present | Exact source | What it establishes / boundary |
|---|---|---|
| Expo Router shell, bundled fonts and themes | `ExpoRideSpeed/src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`, `src/state/AppState.tsx` | Five floating tabs; Anuphan UI/Manrope numbers; native iOS Liquid Glass where available; solid fallback; dark/light/system selection. It currently opens a speed screen, and Garage is a modal. |
| Auth and secure session | `src/lib/supabase.ts`, `src/state/AuthState.tsx`, `src/app/auth/index.tsx`, `src/app/auth/callback.tsx` | Google browser PKCE; existing-email login/recovery; chunked SecureStore session; refresh tied to app lifecycle; deduplicated callback code exchange. Public email signup/reset delivery is gated by the existing sender configuration. |
| Account-scoped requests | `src/state/AuthState.tsx`, `tests/accountLifecycle.test.mjs` | A scope generation rejects delayed A→B→A work; `accountClient` captures the initiating JWT for Database/Storage/Edge requests; `accountRpc` sets the initiating Authorization header. Keep these when introducing query caches and upload queues. |
| Foreground iOS GNSS | `src/useRideSession.ts`, `modules/ride-location/ios/RideLocationModule.swift`, `modules/ride-location/src/sessionSupport.ts` | Serialized ownership, fresh manager per capture, real delivered sample timestamps/accuracy/source flags, explicit background stop, bounded raw evidence. No Android native adapter or background recording. |
| Conservative live speed | `src/speedEngine.ts`, `src/useRideSession.ts` | Freshness/ordering/accuracy checks, three-fix median, conservative filtered maximum, blank during unreliable fixes; native speed uncertainty and simulated/mock inputs cannot confirm a good speed. |
| Ride submission | `src/lib/rideSubmission.ts`, `src/components/RideControls.tsx` | Explicit accepted-challenge binding, explicit evidence/audience consent, unchanged raw bytes, immutable object, same UUID across retries, reconciliation after a lost response. Draft/review evidence remains in component memory. |
| Local garage | `src/app/garage.tsx`, `src/data/vehicleCatalog.ts`, `src/lib/domain.ts` | Category/brand/model search, year/variant details, manual unknown model/cc, active vehicle; 32 curated entries total, not 20–30 per category. Vehicle category is independent of cc. |
| Local/cloud stops | `src/app/(tabs)/routes.tsx`, `src/components/RouteMap.tsx`, `src/lib/domain.ts` | 2–12 named coordinates; iOS Apple Maps long-press; local save/reorder/edit; manual cloud sync and optimistic revisions. Dashed straight connectors and straight-line distance are correctly labelled. |
| Friends and online status | `src/state/OnlineState.tsx`, `src/app/(tabs)/community.tsx`, foundation SQL | Exact-handle requests, explicit recipient acceptance, decline/cancel/remove/block; opt-in server heartbeat, 70-second expiry, private opaque friend-pair topics. There is no position sharing. |
| Invitations | `src/components/Challenges.tsx`, foundation SQL | Group ride or operator-approved closed-course sustained-speed challenge; exact immutable route revision; create/invite/accept/decline/withdraw/cancel; same UUID on creation retries. It is not a live lobby/convoy/race engine. |
| Community baseline | `src/app/compose.tsx`, `src/app/(tabs)/community.tsx`, `src/lib/photos.ts` | One compressed image; caption/description; actual cloud route preview; audience choice; private upload; cursor feed; report/delete. Claimed speed is labelled self-reported and cannot create ranks. |
| Ranking baseline | `src/app/(tabs)/rankings.tsx`, `rs_leaderboard` in foundation SQL | Today/week/month, category, community/friends; server-derived sustained-speed results; one best per rider; dense-rank ties. Bangkok midnight/Monday/first-of-month boundaries already use UTC instants. |
| Motion baseline | `src/components/RiderCard.tsx`, `videos/card-loop-v4/README.md` | Two original 720×450 muted 12-second Remotion loops with posters; pause on Reduce Motion, lost focus, background and scroll visibility. These are profile materials only. |
| Backend security | `backend/migrations/202609300001_online_foundation.sql`, `backend/functions/*` | RLS on every `rs_*` table, RPC-only writes, empty SECURITY DEFINER search paths, explicit grants, private Storage, server-only verifier/finalizer/moderator, caller JWT validated with Auth `getUser`. |

### Non-negotiable existing invariants

1. Preserve real raw samples separately from smoothed/interpolated display values. Never create accuracy, timestamps or points for verification from a display animation, route snapping or replay.
2. Preserve `ExclusiveLocationCapture` ownership and serialized cleanup. Failed cleanup retains ownership; a new screen must not create a second watcher or fall back after a native failure.
3. Preserve capture identity and owner/challenge/audience binding. A failed start cannot relabel older evidence. Starting a new ride cannot silently overwrite an unsent durable draft.
4. Preserve immutable evidence objects and same-ID retry reconciliation. Add persistence around that transport, rather than rewriting its behavior as an unbounded background retry timer.
5. Preserve service-only `rs_claim_submission`, `rs_release_submission`, `rs_finalize_submission`, `rs_reject_submission`, `rs_moderate_post` grants. The current two-minute lease token fences stale workers and limits attempts to three.
6. Preserve explicit simulated/mock rejection anywhere in the submitted stream. Unknown/null source flags stay unknown. A genuine accessory source is not automatically simulated.
7. Preserve relationship generations and topic rotation after revocation. Removing/blocking then re-adding a friend must not revive old route shares, invitations or cached channels.
8. Preserve the operator-approved course, reviewed route revision and authorized time-session gates. A user's “closed course” checkbox or acknowledgment cannot grant competitive eligibility.
9. Preserve signed-media authorization through the caller's post RLS and short expiry. Do not replace private media with a public bucket for convenience.
10. Preserve the distinction between local filtered max, user-entered post speed and server-verified `sustained_min_3s_v1`. They are different metrics.

## 2. Conflicts and migration-sensitive decisions

| Topic | Current behavior | v5 resolution to record in `DECISIONS.md` / `DESIGN_BRIEF.md` |
|---|---|---|
| Map provider | User previously selected free embedded Apple Maps; iOS implementation follows that choice. Android/web currently show coordinate fallback. | Follow-up decision: the user selected MapLibre/OpenFreeMap + Geoapify after the initial source audit. Implement the provider boundary around that choice; preserve embedded maps and attribution. Native compatibility, routing credentials and provider-specific caching/quotas still need their own verification. Google billing is not a prerequisite for this chosen path. |
| Map UI | Separate speed screen and 336-point map frame on Routes. | v5 makes the native map the persistent home surface with HUD overlays. Move route authoring into a sheet/detail flow; remove scroll/padding from the map host. |
| Navigation | Speed / Routes / Community / Ranked / Profile. Garage modal. | New tab contract is Map / Garage / Community / Ranked / Me. Existing saved-route operations remain reachable from Map. |
| Dark tokens | Black background, `surface #111111`, `raised #1D1D1D`, blue accent. | Reference documents decide look-and-feel; v5 requires raised material ≤#111111 and a single theme source. Remove unsupported raised colors and record final accent/font choice after reference study. |
| Theme default | Local `theme: 'dark'`. | v5 requests system default plus manual override. Migrate existing explicit selections without treating them as new defaults. |
| Fonts | Anuphan/Manrope, with Thai line-height 1.55 and numeric tabular hint. | Validate candidate fonts on devices; preserve readable Anuphan until the decision is made. Verify actual font tabular glyph behavior rather than assuming the hint prevents digit movement. |
| Categories | UI `bigbike`; DB `motorcycle`; backend also supports bicycle. | Use one explicit mapping module. Do not silently change stored `motorcycle` values or derive scooter/big-bike from cc. |
| Captions | Current UI and SQL allow 280 characters. | v5 is 150. A new versioned publish RPC enforces 150 for new content; retain existing long posts, or define an explicit migration policy instead of truncating user data. |
| Race semantics | Existing `timed_race` means a sustained three-second speed challenge within an approved window. | Add distinct `route_time_v1` / live-race types. Do not rename old records as route times or overwrite the meaning of `sustained_min_3s_v1`. |
| Privacy zones | Every selected stop is currently shown in share preview, then snapshotted in the post/invitation. | Public v5 route geometry must be server-trimmed by at least 200 m at both ends. Evidence can remain private for verification. Existing public snapshots need a reviewed backfill/hide policy; a new UI-only trim does not fix old disclosures. |
| Raw storage | Current competition evidence is raw private JSON ≤2 MiB; normal ride history does not exist. | Keep raw only where required for verification; add summarized/compressed private ride geometry and explicit retention. Do not lose evidence by converting it into road-snapped geometry. |
| Folder layout | `ExpoRideSpeed/src/app`, `src/components`, `backend`, `videos`. | Add feature boundaries incrementally; the requested `/supabase` layout can be staged from maintained backend sources. Avoid a wholesale move that breaks the live foundation and CI while building the map. |

**Local account isolation must be resolved before cloud garage/history sync.** `AppState.tsx` stores garage/routes in one device-wide key, `ridespeed.local.v4`; the profile provider already uses `ride.profile.<UID>`. Cloud operations are actor guarded, but another account can still see the same local routes and vehicles in the current device UI. Introduce `guest` and per-owner namespaces, and an explicit guest import decision; keep cloud route ownership alongside the cached object. Never silently reassign A's local objects or cloud IDs to B.

## 3. M0 — foundation, i18n, glass and performance shell

Keep `src/app` as Expo Router route files and put reusable feature logic outside it. Suggested feature boundaries are `features/map`, `features/ride`, `features/garage`, `features/friends`, `features/challenges`, `features/ranked`, `features/community`, and `features/onboarding`. Centralize visual tokens in `lib/theme.ts` and translated copy in `lib/i18n` resources.

Add a validated persisted preference schema: `language: 'system'|'th'|'en'`, units, explicit theme, reduced motion/transparency settings, onboarding version, privacy settings. Resolve device locale at launch, subscribe to changes while foregrounded, and let the manual selection override it. Convert every screen label, input placeholder, accessibility label, error and empty/offline state to a key; permission localization in `locales/en.json` and `th.json` is not screen bilingual support. Current `toLocaleString('th-TH')` calls and raw SQL error strings must also use the selected locale. Prefer stable server error codes plus localized client mapping over English substring parsing.

Turn the existing `Glass` primitive into a constrained kit: grouped native glass on supported iOS, a tested blur/tint/specular fallback when available, and an opaque accessible fallback under Reduce Transparency or low-end Android. Do not add nested blur layers. Keep map controls at safe-area offsets without obscuring provider attribution. Text/input baselines need Dynamic Type and Thai tone-mark tests; segmented controls currently have 42-point minimum height and need a 44-point floor.

Install only SDK-compatible dependencies after checking Expo 57 documentation and the local Expo instructions. Reanimated is already installed but the existing gauge does not use it. Gesture Handler, Skia, localization/i18n, durable storage, notifications, efficient list and image components are not current direct dependencies. Add only those required by the next verified milestone. Query keys must include owner UID/scope generation; queued mutations must use an initiating token, never whichever account is now signed in.

Add a checked-in `.env.example` containing placeholders only and document client-safe Supabase URL/publishable key, optional platform-restricted map SDK keys and server-only route/push secrets separately. The production public project configuration is not a service secret; retaining a publishable key never justifies putting a secret/service key into `EXPO_PUBLIC_*`.

**Exit tests:** Thai/English resource-key parity; device locale and manual override; persisted preference migration; Dynamic Type/Thai clipping; no Thai letter spacing; numeric digit widths; 44-point targets; reduced motion/transparency; <4 live blur surfaces on a representative screen. Measure release cold start and real frame cadence; the requested 60/120 Hz goals are acceptance targets, not source-code guarantees.

## 4. M1 — accounts, onboarding, profile and deletion

Retain the existing Google flow and `AuthProvider`/secure storage. Add a route guard that waits for local + auth hydration, then sends an authenticated completed user directly to Map. New-user flow is language → location rationale/permission → unique handle/profile → optional first vehicle → Map. Persist per-user onboarding progress, allow location denial with a usable map planning mode, and never re-prompt a completed user just because the app updates.

Add private cloud avatar metadata and upload flow; current rider photo is local only. An avatar bucket needs MIME/size limits, owner upload/delete policies and a deliberate visibility policy. Reserve/version a path before upload; save the profile's new avatar path only after successful upload; clean abandoned/old objects asynchronously. Do not store base64 photo data in profile rows.

Proposed additive migration `202610010002_profile_preferences.sql`:

- `rs_profiles`: versioned preferences/onboarding columns or a separate owner-only `rs_profile_preferences` table; avatar reference; avoid exposing email or privacy settings through friend/community profile summaries.
- `rs_upsert_profile_v2`: actor-derived identity, unique normalized handle, display name, optimistic revision, explicitly supported preference fields.
- Storage avatar ownership policies; narrow profile summary RPC for authorized feed/friend rendering.
- Deletion state and retryable cleanup job metadata in private schema, not client-admin credentials.

Account deletion requires an authenticated Edge endpoint that validates current caller with Auth `getUser`, records an idempotent deletion request, revokes privacy/location sharing, removes Storage binaries, then removes the Auth user and cascading application rows. Use a cleanup worker/transactional outbox so a Storage failure does not leave a supposedly deleted account's images available. Define references from immutable challenges/ranks/posts before deletion: remove/redact personal data and revoke results as needed. Existing foreign keys do not mean complete account deletion is implemented.

Specifically, another rider's `rs_submissions.challenge_id` and verified record references can prevent deletion of a creator's challenge: those references are not all `ON DELETE CASCADE`. A deletion migration must deliberately resolve cross-owner competition history and the creator's location-bearing snapshot, rather than assuming Auth user deletion will cascade successfully.

Email verification/recovery for arbitrary users is an SMTP dependency gate. Keep current public-email flags off until the sender is configured and delivery is tested. Add Sign in with Apple with provider/native capability/redirect configuration and real-device credential tests before store submission; the required provider account/capability is an external setup gate. Optional LINE can follow as a separate auth adapter; it is not a prerequisite for the map upgrade. Legal policy/terms need actual app behavior, operator contact and a published in-app destination.

**Exit tests:** restart session persistence, denied/approximate location onboarding, handle collision, interrupted onboarding, expired/duplicate PKCE callback, token refresh and A→B→A cache/mutation isolation, avatar path forgery, real email/Apple callback acceptance, interrupted deletion/storage retry, no user rows/media accessible after deletion. Time the <60-second first-user goal on both platforms with network latency recorded.

## 5. M2 — fullscreen map, shared-value HUD and durable recording

Replace `src/app/(tabs)/index.tsx`'s ScrollView speed layout with a full-height map host. Keep the map instance mounted independently of GPS/HUD values. Overlay search, friends toggle, recenter/layers, compact speed, ride controls and challenge access in a small number of glass groups. Native map provider and route services should be adapters so an Android implementation does not become a false “Apple Maps available” screen.

Use display shared values for needle/arc/digit interpolation, fed only when a new validated fix arrives. Keep `SpeedEngine` quality/maximum semantics, while native animations approach the next accepted value and expire to a no-fix state at the quality deadline. Do not call React setState per display frame. Support compact and expanded HUD; change fixed `orientation: 'portrait'` only alongside an intentionally tested landscape design. Keep `expo-keep-awake` scoped to active ride.

Lift recording into one long-lived ride service/provider instead of a route component's hook lifetime. Introduce an explicit state machine: `idle → starting → recording ↔ paused → stopping → saved`, plus `recoverable/interrupted` and fatal stop. Pause creates a segment boundary; resume cannot bridge the pause with a fake distance, elapsed time or eligible speed window.

Suggested local contract:

```ts
type JournalRide = {
  id: string; ownerId: string | 'guest'; captureId: string;
  source: 'corelocation' | 'android-native' | 'expo-fallback';
  schemaVersion: number; activeVehicleSnapshot: VehicleSnapshot | null;
  state: 'recording' | 'paused' | 'saved' | 'interrupted';
  startedAt: string; endedAt: string | null;
  lastCommittedSequence: number; routeRevision: number | null;
  summary: RideSummary; syncState: 'local' | 'pending' | 'synced' | 'error';
};
```

Use a transactional SQLite journal or equally durable append log. Persist raw batches/checkpoints before exposing them as safely saved. Save pause/no-fix/background gaps, original timestamps, provider capabilities, summary coverage and immutable submission draft metadata. Keep normal compressed ride geometry separate from raw competition evidence. On process restart show a recoverable interrupted ride; never claim continuous data through the gap. Reconnect sync uses an outbox with fixed UUID/content hash and owner scope. A local ride can continue when cloud quota/offline sync fails.

Add `rs_rides`, owner-only reads, actor-scoped save/finalize/delete RPCs and summary/geometry validation in `202610010003_ride_journal.sql`. Normal ride summaries are not ranked records. Store a vehicle snapshot and route reference/revision at start. Unknown/manual vehicle properties stay unknown and affect ranking eligibility later. Bound geometry/sample storage and retention before longer sessions.

Android fallback currently has no speed uncertainty and cannot satisfy the CoreLocation-only verifier. Add a real Android location adapter returning actual provider accuracy/source fields and a separately versioned evidence schema. Until that is implemented and reviewed, keep Android fallback explicitly unranked. Do not substitute horizontal accuracy for speed accuracy.

Background recording is a native/lifecycle change: current Swift, hook and app config intentionally stop in background. Implement optional user-started recording with purpose strings, entitlement/configuration, task/service ownership and durable writes on both platforms. Background permissions must be justified by recording; opening the map alone does not need them. Test OS termination, locked screen, interrupted app, denied background grant, native error and restart recovery. Do not just remove the stop guards.

Add one shared safety lock reading validated motion state, with hysteresis around ~10 km/h and a short stationary delay before unlocking. Lock typing, feed scrolling, editing and dangerous menu work across all screens, not only the map sheet. Leave Stop, recenter and glance-only HUD reachable. Passenger override is explicit, temporary and visibly labelled; log the decision, not location. Bad/no-fix state must not silently unlock an active ride's editing.

**Exit tests:** retain all current speed/capture/submission regressions; stationary zero stability; signal expiry; pause/resume segment totals; process death during journal write; disk failure visible state; account ownership; exactly-once outbox; missing GPS never creates tunnel chord distance; route/map does not rerender per animation frame; 50 authorized markers plus route pan/zoom cadence; 30-minute memory and battery; real foreground/background device matrix.

## 6. M3 — garage and verified class assignment

The current 32 entries comprise 9 scooters, 10 big bikes and 13 cars. Expand to 20–30 per category from official manufacturer specifications, recording market/model year/source date and unverified/null values. Source verification can be per field; an official model page without a numerical output is not proof of kW. Keep maxi-scooters in scooter regardless of displacement.

Add nickname/photo/color, motor kW, editable selected year/variant, edit/remove vehicle and cloud owner storage. `GarageVehicle` currently has no nickname/photo/color/kW; `AppState` only stores the list locally. Create `rs_vehicle_catalog`, `rs_user_vehicles`, `rs_vehicle_classes`, with owner-only vehicles, readable approved catalog, server-managed class definitions and versioned catalog/class snapshots. Client can save manual vehicles but cannot set `catalog_verified=true`, class eligibility or implausible-speed caps. Decide how unknown/manual class is displayed without granting a falsely verified rank.

Use one explicit four-press happy path (Add → Category → Model, with brand/search filter on that screen → Save). Extra year/variant/nickname/photo are optional editing unless ambiguity affects class. The empty Garage tab gets the reference-informed animated Add control and category loop; no model is auto-added just because the user mentioned it earlier.

**Exit tests:** scooter type independent of cc; cc boundary values and decimal precision; EV kW/null handling; missing-model flag; catalog version migration; owner RPC/RLS; active-vehicle selection and removal; immutable ride vehicle snapshot after garage edit; four-press path measured; 60–90 audited catalog entries without invented values.

## 7. M4 — road route builder, detail and privacy geometry

Reuse local/cloud IDs, revisions, dirty-draft protection and route snapshot consent in `routes.tsx`. Add draggable pins, undo/redo command history, typed place search, route options and in-map route detail. Keep ordered stops distinct from computed driving geometry. A straight-line connector must never become an ETA or claimed drivable route.

Define provider-neutral route request/result contracts: ordered validated stops, vehicle profile, locale, avoidance options, requested provider; result geometry, road distance, duration, leg/step metadata, provider/time/license metadata, attribution and expiry. Debounce search and stop changes; cancel/ignore stale responses with request revisions; memoize within permitted provider terms. A Google Routes/Places response must obey its caching/display restrictions; do not assume every provider response can be saved permanently. Keys for native map SDKs use platform restrictions; server routing credentials belong in Edge/environment, never app public variables.

Add route geometry/summary/visibility with a versioned save RPC in `202610010004_route_geometry.sql`. Existing `rs_routes.stops` and approved revision linkage continue to work. An edit that changes competitive geometry still clears approval. Challenge snapshots must include exact geometry version and privacy/permission meaning. Add owner/private vs explicitly shared public projection, saved-route bookmarking/deep links, and route-to-community attachment from the actual displayed server revision.

For public sharing, implement geometric 200 m trim at each end using arc length and interpolate exact cut points. Remove hidden pins, step instructions, timestamps, chart points, bounding-box endpoints and metadata that disclose the original edges. Routes shorter than 400 m can have no public geometry; explain this instead of shrinking the trim. A loop that revisits a home point needs additional privacy-zone clipping, not only endpoint trimming. Apply the same projection to feed snapshots, exports, previews and signed downloads on the server. Preserve private original/evidence for owner and verification according to consent/retention.

Do not send real sample streams through road snapping to make them look trustworthy. Recording-derived route geometry can be simplified for display, but original evidence stays unchanged. “Navigate to start” and route following must stay in-app under the user's map-first rule, with clear degraded/offline behavior if directions cannot be fetched.

**Exit tests:** stop add/drag/order/undo; request cancellation and debounce; route revision conflict; provider errors/quota/offline; road distance distinct from straight distance; legal vehicle-route profiles; trim endpoints including exact 200 m cuts, short routes, loops, dateline/degenerate geometry; unauthorized full geometry; public snapshot and export leakage; existing approval invalidation and immutable invitations.

## 8. M5 — friends, convoy and closed-course races

Keep exact-handle lookup private/rate bounded. Add friend QR/invite links with expiring random tokens and explicit recipient acceptance; do not expose a public full profile directory as a convenience. Push requests/invites need authenticated token registration per device, private notification preferences, an event outbox, delivery retries, token rotation/removal and deep-link verification. Never include precise route/location in a lock-screen push.

Separate online presence, riding status and position-sharing consent. Existing `presence_opt_in` only controls status, and no location is currently shared. Add `location_share_opt_in`, recipient/session scope, coarse/precise preference if offered, expiry and ghost mode. Positions should be short-lived private session data, not public rows. Hide stale markers visibly and stop sending immediately on opt-out/background as appropriate to active recording consent. Block/removal must revoke map/location access and rotate live-session topics; cached Realtime authorization makes a policy edit alone insufficient.

Convoy can support regular trips with a host and code join, without creating competitive results. Proposed `rs_group_sessions`, `rs_group_members` and private `ride_private.live_positions` plus actor-scoped create/join/leave/share RPCs in `202610010005_live_groups.sql`. Hash/expire join codes, rate-limit failed attempts and cap membership; a code joins only the approved membership/consent flow. Use server-created private Broadcast topics. Limit live position publication to 1–2 Hz, coalesce movement and subscribe only to visible/active session markers. Reassess message/channel quotas before choosing a single all-friends presence channel; the existing friend-pair topics solve revocation but fan out with friend count.

Add async route-time trials first, then live race as a separately versioned metric and session state machine. Suggested additional state: `draft/lobby/countdown/running/completed/cancelled`; version; approved course session; immutable course/route geometry hash; member readiness; server `start_at`; deadline; member result state. Only server RPC transitions may schedule/start/finish. Private race channels carry versioned authorized events. Joining a lobby or receiving an invite is not consent to live position sharing.

A server-scheduled future start and measured time-offset/RTT can render a synchronized local haptic/audio countdown. Record clock uncertainty and retry when the sync budget cannot meet ~300 ms. The server cannot guarantee device display alignment from a timestamp alone; confirm with two physical devices. Prevent duplicate countdowns, late joins, stale events and host disconnect from rewriting the start.

Route-time verification must check directed start/finish gates, ordered checkpoints/course corridor, evidence continuity, accepted membership/window, route version and explicit mock/accuracy/physics limits. A finish-radius hit alone cannot prove route completion or prevent shortcutting. GPS loss near a gate means uncertain/no result; do not interpolate across an unsupported gap. Pauses, reversals and multiple laps need explicit metric policy. Verified results remain service-only and lease fenced. Keep `sustained_min_3s_v1` intact; add a new result table/verifier or an explicit versioned metric column and server sink.

**Exit tests:** multi-recipient invitations, ghost/location consent, code brute-force/expiry, outsider channel join, blocked participant/history, late/stale positions, disconnected TTL, foreground/background policy, token outbox idempotency, async replay fixtures permanently labelled ineligible, all race state transitions/reconnects, stale-worker leases, shortcut/reverse/gap rejection; then real two-device closed-course countdown/finish test. Operator-approved real course and consenting second device are gates; never seed a fake approval into production.

## 9. M6 — fair rankings and verifiable results

Bangkok period logic is already correct in `rs_leaderboard`: `date_trunc(..., now() at time zone 'Asia/Bangkok')`, Monday week, UTC instants, inclusive start/exclusive end, shared ties. Existing tests cover daily boundary inclusion/exclusion. Expand tests to Monday/week, month/year transitions, leap day, UTC-to-Bangkok 17:00 rollover and the same query under different connection timezones. Do not regress to UTC calendar windows.

Add separate Top Speed and Route Time board contracts. The speed board should state its supported measurement semantics; a verified sustained minimum is not an arbitrary instantaneous peak. Preserve old method/version records and display clear method labels. Add immutable server-derived vehicle/class snapshot, policy version, route/course version, verification status/reason and revocation provenance. Do not trust a client-supplied cc class or current garage editing.

Proposed `202610010006_rank_classes_metrics.sql`: reviewed class configuration; verified result metric table or versioned extensions; indexes on period/filter/metric/class/course; `rs_leaderboard_v2` with typed class/metric/scope/course filters and per-user best; explicit `rs_my_rank` so the current user can be retrieved outside the top 100. Default to the active verified vehicle class, with an All filter. Separate EV and car classes according to the published policy. Missing/ambiguous specs must remain unclassified until resolved.

Retain server-side rejection for poor uncertainty, teleports/coordinate-speed disagreement, acceleration, too few points, unsupported evidence and mock flags. Add class plausibility limits only from a reviewed policy; guessing factory top speed from model names is inappropriate. Reports can target a record and create an operator queue. A “verified” badge means the configured evidence checks passed, not GNSS attestation or an anti-cheat guarantee.

Add top-three presentation, sticky current-user row, animated rank movement, pull-to-refresh, virtualized lists and coalesced realtime invalidation. Avoid subscribing to every result row or refetching after every sample. Permission-sensitive boards should refresh after block/friend/visibility/revocation changes; stale public/private caches must not cross accounts.

**Exit tests:** retained lease/rejection/audience invariants; time boundary matrix; cc boundary and powertrain classes; manual class forgery; edit-after-ride snapshot; metric/version separation; route-time gate checks; ties/deterministic ordering; own rank beyond top 100; deleted/revoked/cancelled eligibility; blocked/global/friends visibility; realtime cache invalidation; podium with 0/1/2/3 actual rows only.

## 10. M7 — community, six photos and moderation

Reuse the existing explicit preview and same-attempt post transport, then persist drafts/outbox per owner. Add ride attachment with derived max/average/distance/duration/vehicle snapshot and verification label. Only trusted server result references grant a verified badge; arbitrary summary fields stay self-reported. Attach route projection from the reviewed saved revision. Default audience remains friends; a public choice must preview the trimmed projection.

Proposed `202610010007_community_interactions.sql`:

- `rs_post_media`: ≤6 ordered immutable object references with per-object type/size/dimensions/blurhash, upload reservation/state and post ownership. Keep compatibility with the existing one-image `media_path` during client upgrade.
- Versioned publish RPC enforcing caption ≤150 for new posts, media cap and owned completed reservations, route projection, optional ride reference and explicit visibility. All content/attachment ownership is rechecked on publish.
- `rs_comments`, `rs_likes`, `rs_saved_posts`, `rs_reports` plus actor-scoped add/edit/delete/toggle/report RPCs; unique like/save pairs, bounded comments and quotas. Reuse `can_view_post`, block semantics, deleted/hidden visibility for all interaction reads/writes and counts.
- Latest/Friends/Top-this-week cursor RPCs. Define the Top score, period and tie-break; prevent private/block-filtered likes/comments from leaking identities through counts. Keep stable composite cursors, not offset pagination.
- Private moderation queue/job/audit metadata; operator-only review, hide/restore and record revoke transitions. The current `rs_moderate_post` sink exists, but a queue/operator UI/service is not implemented.

Extend `media-url` to sign only media IDs belonging to a currently viewable post; caller cannot provide arbitrary paths. Enforce limits even if a native client is modified. Resize/compress to ≤1600 px, strip metadata, calculate blurhash, and use efficient image placeholders; current helper resizes to ≤1440 px and supports one picture. Clean orphaned reservations after a retention window, and all binaries on deletion; soft-deleting a row alone is insufficient.

Use a virtualized feed (current feed maps an array inside a ScrollView), real skeleton/loading/error/offline states, bounded optimistic interactions with rollback, pull-to-refresh and automatic next-page fetch. Add in-app route detail and verified deep-link share/save. Keep reports accessible from community authors even if they are not friends; current block UI is only on accepted friends, so add author blocking directly to the post menu. Report reason/details need a real localized form rather than the current fixed `other` message.

**Exit tests:** six-image cap/order, seven-image/foreign-object rejection, upload lost response and restart, caption migration, malicious untrimmed route attachment, verified/self-reported separation, RLS on every child table, block/delete/hide cascades for comments/counts/media, like idempotency/optimistic rollback, stable cursors under concurrent inserts, report duplicates and moderator permission, orphan retention, deletion and expired signed media, real two-account post acceptance.

## 11. M8 — motion, performance, accessibility and release gates

Move/alias maintained render projects under `/motion` without losing existing reproducibility. Add a manifest mapping component/theme/category to MP4 and poster, dimensions/fps/duration/hash/size/license. Current loops are 12 seconds; the new assets need 4–8 seconds with periodic motion and a seam proof that samples the continuation frame without adding a duplicate hold frame to the video. Required targets: three garage categories, actual podium positions/period headers, auth/onboarding hero, empty states, challenge lobby/countdown ambience and soft HUD glow. Keep text/photo native above material loops.

Create a global video-budget manager with at most two visible players, preload-next policy and reference-counted pause/dispose behavior. Feed viewability controls playback; navigation blur, app background, Reduce Motion and Low Power mode show a poster. Low Power is not currently read. Muted video starts must not disturb other audio. Do not let a countdown video determine race start time; native server-timed countdown drives it.

Use UI-thread native motion for digits/needle/route effects/rank changes/presence and press response. Map rendering remains native; animated route glow needs an implementation proven to keep its projected geometry aligned during camera movement and to preserve attribution. Test multiple blur/glow/video overlays together before introducing them broadly.

Store readiness also needs actual Android package/build/signing, iOS distribution account/provider capability setup, appropriate location descriptions/background rationale, in-app deletion, published legal links, UGC moderation operation and push entitlement/provider setup. Current `.github/workflows/ios-unsigned.yml` builds verified iPhone Release/development IPAs; it does not produce Android output or signed store distributions.

**Exit evidence:** physical iPhone 14 Plus/iOS 26 and mid-range Android cold launch; 50-marker map pan/zoom; 30-minute memory/battery/background trace; measured display cadence and thermal/power condition; voice/screen-reader labels, focus and sheet dismissal; large text/Thai tone marks; reduced motion/transparency; <=2 visible video players; loop seam/size/hash; offline/error/loading/empty on every screen; real signup→garage→ride→post→verified-rank flow only on an approved course. CI/typecheck/lint prove source/build health, not these device goals.

## 12. Proposed backend migration order and contracts

These filenames are proposals; use new migrations after the already-deployed foundation. Do not edit/reapply the foundation as an upgrade. Reconcile its hosted migration history before CLI pushes because the prior dashboard application can exist without CLI history.

| Proposed migration | Minimal dependency / contract |
|---|---|
| `202610010002_profile_preferences.sql` | Profile preferences/onboarding/avatar/deletion jobs; retain handle uniqueness/private profile access. |
| `202610010003_ride_journal.sql` | Owner-only ride summary/geometry and sync ID/content hash; no direct ranked-result path. |
| `202610010004_route_geometry.sql` | Route provider geometry/revision/visibility and private/public trimmed projections; compatibility with stops and approval reset. |
| `202610010005_live_groups.sql` | Group membership/join code/location consent/private live positions and authorized event topics; race lifecycle can be a following migration. |
| `202610010006_rank_classes_metrics.sql` | Reviewed vehicle/class snapshot and separately versioned speed/route-time metrics, own-rank and filter RPCs. |
| `202610010007_community_interactions.sql` | Multi-media reservations, v2 publish, comments/likes/saves/reports/moderation queue with post visibility reused. |

Every migration must explicitly enable RLS/revoke direct grants on each new table, revoke default PUBLIC function execute, grant only reviewed actor-facing RPCs, use fixed search paths and keep private schemas unexposed. Add indexes after measuring intended filter paths. Old and new clients should coexist until a minimum supported app version is enforced; version new RPCs when returning shapes or arguments change. Prefer one invariant-focused feature migration over trying to deploy all six at once.

The source tests currently execute only the foundation SQL. Update `backend/tests/authorization.test.mjs` test setup to apply new migrations in timestamp order; otherwise a passing test run says nothing about their RLS. Extend real PostgreSQL tests for new child tables/functions and permissions, and add hosted acceptance for Storage/Realtime/Auth, which local stubs do not prove.

## 13. Dependency gates and honest acceptance status

| Gate | Work that can proceed now | Work that needs the gate |
|---|---|---|
| Selected MapLibre/OpenFreeMap + Geoapify setup | Map-first shell/provider adapter, local pins/editor, HUD, geometry contracts; provider selection is now resolved | Geoapify project/key handoff, road routing/search, allowed persistent cache and verified MapLibre native builds. Existing Apple Maps remains available until replacement acceptance passes. |
| Custom SMTP | Bilingual Google auth/onboarding, existing-account flow | Public email signup/verification/reset claims and real delivery tests. |
| Apple auth/distribution capability | Provider interfaces/UI, account deletion/legal screens | Real Apple login and signed store distribution/device provider acceptance. |
| Push credentials/capabilities | Device token schema/outbox/preferences, localized notification content | Real request/invite pushes and tap-through tests. |
| Second consenting account/device | Fixture/state/RLS tests, real empty states | End-to-end friendship/media/location privacy and <=300 ms live countdown measurements. |
| Real approved private course/session | Group convoy, async metric/verifier implementation, clearly labelled local fixtures | Competitive live/async result acceptance and visible real ranks. |
| Physical mid-range Android and iPhone | CI/source tests, instrumented builds, documented device matrix | 60 fps/cold start/memory/battery/native gestures/background data and comparative font decision. |

Retain current app/core/backend test suites before and after every milestone. Run lint/typecheck on all product changes and add only meaningful state/authorization/measurement regressions. Keep fixtures out of production. After each milestone report exactly: done / how to test / known issues / what the owner must provide / next, with measured acceptance separated from pending device/account gates.

Recommended first delivery is M0 + the foreground portion of M2: bilingual map-first shell, fullscreen selected map, compact/expanded smooth HUD and a durable local ride journal with pause/save. It creates a real improvement the owner can use immediately while preserving existing Google/profile/friend/post/rank functionality. M1 deletion/avatar and M3/M4 can then ship as compatible additions. Background capture, live race timing and store distribution require their own verified native/backend milestones; they should not be claimed complete through a visual preview.

## 14. Current primary docs, compatibility and free-tier operating caps

Verified against official public documentation on 1 October 2026. These are documented plan limits and supported version families, not measurements from the owner's hosted project or phone. The MapLibre/OpenFreeMap + Geoapify decision above supersedes the earlier Apple/Google selection gate; maps pricing and native compatibility are covered by the separate map research.

### Expo 57 and animation/list compatibility

| Package/tool | Installed source audit / SDK 57 recommendation | Primary source and implication |
|---|---|---|
| Expo / React Native / React | `~57.0.26` / `0.86.3` / `19.2.3`; Expo 57 targets RN `0.86` and React `19.2.3` | [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/): minimum Node `22.13.x`, iOS `16.4+`, Android `7+`, Xcode `26.4+`, Android compile/target SDK `36`. The app's iOS minimum is deliberately higher. |
| Reanimated / Worklets | Installed `4.5.1` / `0.10.1` | [Expo 57 Reanimated](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/) recommends `4.5.1` and installation together with Worklets. [Upstream compatibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/) confirms Reanimated `4.5.x` supports RN `0.86` and Worklets `0.10.x`/`0.11.x`, on New Architecture only; support tables assume the latest patch. Retain Expo's paired recommendation rather than independently upgrading these packages. |
| Skia | Not yet a direct dependency; SDK recommendation `2.6.2` | [Expo 57 Skia](https://docs.expo.dev/versions/v57.0.0/sdk/skia/) supplies the version. [Skia installation](https://shopify.github.io/react-native-skia/docs/getting-started/installation/) requires RN `>=0.79`, React `>=19`; native animation integration requires Reanimated `>=4.0.0` and Worklets `>=0.7.0`. Web additionally needs CanvasKit. |
| Gesture Handler | Not yet a direct dependency; SDK recommendation `~2.32.0` | [Expo 57 Gesture Handler](https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/). Add for native sheet/gesture composition only when that milestone uses it. |
| FlashList | Not yet a direct dependency; SDK recommendation `2.0.2` | [Expo 57 FlashList](https://docs.expo.dev/versions/v57.0.0/sdk/flash-list/) and [FlashList v2 docs](https://shopify.github.io/flash-list/docs/): use v2 with New Architecture and Expo-compatible resolution. |

The local `ExpoRideSpeed/node_modules/expo/bundledNativeModules.json` independently matches those recommendations, including Worklets `0.10.1`. Resolve additions with `npx expo install`, retain the lockfile, run `expo install --check`/Expo Doctor and existing lint/typecheck/tests, then build actual iOS and Android native clients. A compatibility table does not prove the custom location module, map renderer, blur, video and shaders work together at the requested cadence.

[FlashList v2 changes](https://shopify.github.io/flash-list/docs/v2-changes/) remove the need for size estimates (`estimatedItemSize` is no longer used), add `useRecyclingState` for resetting item-local state when identity changes, and enable visible-content maintenance by default. Preserve stable entity keys at the list boundary; reset image/video/expanded state during recycling so one rider's content cannot appear in another cell. [FlashList performance guidance](https://shopify.github.io/flash-list/docs/fundamentals/performance/) requires release-mode profiling, emphasizes memoized props and `getItemType` for different row shapes, and warns against changing nested keys that defeat recycling. Apply this to Community and Ranked, not a new ScrollView containing mapped cards.

### Supabase Free plan and realtime budget

| Resource | Documented Free allowance |
|---|---|
| Auth | 50,000 monthly active users; social OAuth and custom SMTP integration included |
| Database | 500 MB per project; shared CPU / 500 MB RAM |
| Storage / transfer | 1 GB stored files; 5 GB egress plus 5 GB cached egress; 50 MB maximum upload; image transformations excluded |
| Realtime | 2 million messages per month; 200 concurrent peak connections |
| Edge Functions | 500,000 invocations per billing cycle |
| Operations | Two active free projects; pause after one week inactive; no included automatic database backups/PITR; API/database logs retained one day |

Source: [Supabase pricing](https://supabase.com/pricing). Most usage allowances are organization-wide and summed across projects; database size is explicitly per project. The two-free-project limit spans organizations where the owner is Owner/Admin, and paused projects do not count. [Organization billing and quota scope](https://supabase.com/docs/guides/platform/billing-on-supabase). These are allowances, not evidence that a free instance sustains 50,000 concurrently active riders. Continued excess can trigger restrictions, including read-only/paused projects or API `402` responses; the grace period is not a recurring capacity buffer. [Fair Use policy](https://supabase.com/docs/guides/platform/billing-faq).

[Realtime limits](https://supabase.com/docs/guides/realtime/limits) additionally cap Free projects at 100 events/second, 100 channel joins/second, 100 channels/connection, 20 Presence messages/second and five Presence calls/client per 30 seconds; Broadcast payloads are limited to 256 KB. Do not send GPS at 1–2 Hz using Presence. Keep Presence for state transitions and use bounded Broadcast events for opted-in live positions. Reconnect with jitter/backoff and preserve a useful disconnected/offline UI.

Broadcast accounting includes one sent message plus one for each receiving subscriber; Postgres changes count once per receiving client. [Message accounting](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages). **Budget inference:** ten participants each sending at 1 Hz to nine peers, with no self-echo, create about 100 counted events/second and 360,000 messages/hour; 2 Hz doubles that. One such group reaches the documented per-second ceiling before presence, joins, other groups or feed updates. Roughly 5.6 hours would consume the entire two-million monthly allowance if no other traffic existed. This arithmetic is a sizing warning, not a hosted throughput result.

**Proposed product caps, not provider limits:** start live acceptance with four participants at 1 Hz; enforce a project-wide admission/rate budget with headroom, broadcast only during an active opted-in session, stop on exit/background/ghost mode, and record actual counted usage before expanding. A four-rider no-self-echo group still costs about 57,600 messages/hour. Prefer on-demand ranked refresh plus a throttled invalidation signal over streaming every leaderboard row. Alert at 80% monthly usage and gracefully defer new live sessions/media before limits are exceeded; preserve recording locally. Do not automatically upgrade the paid plan or assume unused monthly messages override per-second caps.

### Auth, RLS and Storage implications

Supabase's built-in email sender currently accepts only project-team recipients and sends at most two emails/hour; it is not a public signup/reset service. [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp). Keep real Google login working and leave public email delivery gated until custom SMTP is configured and tested. Handle `429` with readable copy/cooldown rather than automatic retries: default resend/signup-confirmation/password-reset windows are 60 seconds per user, with additional endpoint/IP limits. [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

Keep the foundation's explicit grants/RLS and server-side actor validation. [RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) require both grants and policies, note views can bypass RLS by default, and keep service/secret keys server-side. [Function security](https://supabase.com/docs/guides/database/functions) documents default PUBLIC execution and fixed search paths for SECURITY DEFINER; every additive RPC must revoke default execution and grant only its reviewed callers. A table being RLS-enabled is not sufficient proof that a privileged function or view is safe.

[Realtime authorization](https://supabase.com/docs/guides/realtime/authorization) requires private client channels and disabled public channel access. Authorization is cached on join/token update, not checked per message: preserve the existing generation/topic rotation for revocation. Do not add `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` in hosted migrations; it is already enabled and current docs warn the ownership check aborts such a transaction. Keep policies on that table and test migration application against a hosted-compatible environment.

Keep private post/evidence buckets and authorized downloads. Storage service keys bypass object RLS. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control). Bucket file/MIME limits can be stricter than the 50 MB global Free ceiling; retain the existing 3 MiB photo and 2 MiB evidence limits, then enforce six-photo reservations/publish ownership and cleanup as planned in M7. [Upload limits](https://supabase.com/docs/guides/storage/uploads/file-limits). Compress/resize on-device because Free does not include image transformations, and reconcile an upload ledger with actual stored objects before admitting new batches.

Private signed URLs are bearer access until expiry and survive Auth signing-key rotation; keep their lifetime short and do not rely on logout/JWT rotation to revoke a previously issued link. [Private downloads and URL lifetime](https://supabase.com/docs/guides/storage/serving/downloads). Storage binary deletion and orphan retention remain necessary alongside database cleanup.

**Still unproven:** launch/map readiness within two seconds, 60 fps with 50 markers, no memory growth over 30 minutes, Android background capture, and two-device start skew within 300 ms. These remain instrumented release-build acceptance targets from M2/M5/M8; source compatibility, website screenshots and CI passing cannot establish them.
