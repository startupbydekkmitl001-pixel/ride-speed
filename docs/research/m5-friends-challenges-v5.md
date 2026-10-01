# M5 friends, presence, convoy and route-time contract

Read-only readiness audit, 1 October 2026. This is a proposed additive contract, not a claim that M5 is implemented or deployed. M4 remains the implementation gate. The selected map is MapLibre + OpenFreeMap; Geoapify supplies explicit, consented road routing. No Google Maps key or billing is required by this proposal. Migration numbers below are deliberately unassigned until M4 is committed.

## 1. What already works and what must change

| Evidence in current source | Current capability | M5 change |
| --- | --- | --- |
| `src/state/OnlineState.tsx` and foundation `rs_request_friend`, `rs_my_friends`, `rs_friend_action` | Exact handle request; incoming acceptance; decline/cancel/remove/block/unblock. Canonical ordered pair, relationship generation and opaque topic rotation. | Extract typed feature/service layer and dedicated friends screen; preserve generation, paginate, expose blocked-list management and readable localized errors. |
| `OnlineState.tsx` | Scope-fenced HTTP refresh; foreground 30s heartbeat; trusted server online flag expires after70s. Pair Broadcast only, no coordinates. | Capture an isolated Realtime client/token per Auth scope; handle channel states, token refresh, cleanup, retry and unexpired online/riding display. |
| `src/app/(tabs)/index.tsx:48,61` | Pushes `/friends` and `/challenges`. | Neither route file exists. Add real routes. Friends and challenges currently live inside Community. |
| `src/components/Challenges.tsx`, pre-M4 reader | Previously read public raw stops, checked2–12 pins and previewed all coordinates. | In-progress M4 compatibility now uses owner RPC + projection + safe snapshot parsers, removing that mismatch. M5 must reuse this fixed contract, never restore the former raw-pin copy or fallback. |
| Foundation challenges/members and006 compatibility creator | Group invitation or approved closed-course sustained-speed challenge, immutable revision, explicit accept/decline/withdraw/cancel. | Add durable exact operation receipts and distinct async route-time/live session contracts. Current `timed_race` does **not** measure route elapsed time. |
| `features/map/MapSurface.types.ts` | `MapPeer` supports clustered authorized, opt-in, unexpired online/riding markers. | Supply peers only from a checked live-provider snapshot; the map adapter must never authorize data or start GPS itself. |
| `state/RideState.tsx`, `useRideSession.ts`, journal and evidence submission | One exclusive foreground capture, local durable segmented recording; iOS native GNSS evidence. Android/Web summaries remain self-reported. | Passive sampler from existing capture; no second watcher. Raw competitive evidence and verification need a separately versioned route-time transport. |
| `rs_begin_account_deletion`002 and later purge upgrades | Quarantine status, rotate pair topics, cancel own challenges, withdraw membership, revoke results, binary-first deletion. | Quarantine live memberships/topics/positions/device registrations/outbox before cleanup; purge new rows and receipts deliberately. |
| `package.json`, current public native preview builds | No `expo-notifications`; unsigned iOS and controlled debug-signed Android previews. | Remote push remains an external credential/native capability gate. In-app invitations can work without it. |

Existing friend requests require a completed profile; private M4 routes can belong to an Auth-only user. The new challenge creator must return `PROFILE_REQUIRED` rather than fail a profile foreign key. No fake online friends, courses, invitations, positions or completed results enter the product UI.

## 2. Verified provider constraints

Supabase private-channel authorization is evaluated on join and new JWT. Permissions remain cached while a socket stays connected; deleting membership is insufficient to stop reception. Use `config.private:true`, explicitly bind/update the scope's JWT, and disable dashboard **Allow public access**. Add only policies on `realtime.messages`; do not alter its ownership/RLS setting. Receive policies use `extension='broadcast'`; no client INSERT permission for trusted status/session events. These are current documented behaviors. [Authorization](https://supabase.com/docs/guides/realtime/authorization), [settings](https://supabase.com/docs/guides/realtime/settings).

Database `realtime.send` inserts messages retained for replay for at least72h and at most4days. REST Broadcast uses a separate WebSocket delivery path; `channel.httpSend` exists in supabase-js≥2.107.0. Consequently the proposed first implementation puts **no precise coordinates, raw course boundaries or endpoint pins in database broadcasts**. Broadcasts are invalidations; an authenticated current-state RPC returns authorized positions. REST streaming is a possible later optimization, subject to a publication/revocation race review. [Broadcast](https://supabase.com/docs/guides/realtime/broadcast).

Free limits currently include200 concurrent connections,100 messages/s,100 joins/s,100 channels/connection,20 Presence messages/s, five Presence calls/client/30s and256KB Broadcast payloads. Do not use Presence.track for GPS ticks. [Realtime limits](https://supabase.com/docs/guides/realtime/limits). The Free message quota is2million per billing cycle. A Broadcast counts its send plus each receiving client; quotas cover every project in the organization. [Message usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages).

**Pilot policy, not a provider guarantee:** four live participants/room,1Hz publication, at most two admitted active rooms/project initially, one coalesced room invalidation/s and one client position read/s. A room invalidation received by four clients costs about5 messages, or18,000/hour before presence/control traffic. Broadcasting all four samples individually would cost about72,000/hour. Reserve global/monthly headroom in shared DB counters, limit per-owner work, admit only after a bounded lease and show `LIVE_CAPACITY` when full. Reconcile measured dashboard usage before increasing caps; never auto-upgrade the plan. Local ride recording continues if live service is unavailable.

## 3. Shared contracts and mutation recovery

All timestamps are UTC ISO instants; calendar-ranked windows remain Asia/Bangkok. User IDs come from validated JWT, never request owner fields. Category conversions follow existing domain (`bigbike` garage → `motorcycle` route); never silently rewrite saved vehicle snapshots. Validate envelopes, bounds, UUIDs, enumerations and unexpected fields on both sides.

```ts
type SocialAck = {
  operationId: string; kind: string; resourceId: string;
  appliedRevision: number; currentRevision: number | null; appliedAt: string;
};
type FriendSummary = {
  userId: string; handle: string; displayName: string;
  state: 'pending'|'accepted'; direction: 'incoming'|'outgoing';
  generation: number; updatedAt: string;
};
type StatusSummary = {
  userId: string; state: 'online'|'riding'|'offline';
  expiresAt: string|null; generation: number;
};
type SocialSnapshot = {
  serverNow: string; revision: number; inboxTopic: string;
  friends: FriendSummary[]; statuses: StatusSummary[];
  nextCursor: {updatedAt: string; userId: string}|null;
};
```

New durable writes use owner-scoped operation UUID + immutable normalized arguments + receipt before revision/current-state validation. Same request recovers its original ACK; changed action/resource/args under that UUID fails `SOCIAL_OPERATION_CONFLICT`. A replay acknowledges the old operation without restoring a removed member, previous consent or cancelled session. Unknown result preserves the exact pending request. Only definitive rejection retires it; never silently replace a pending operation with a new UUID. Use narrow explicit grants, closed helper/private tables and active-account RLS/RPC fences.

Persist only minimal owner operation outbox, drafts and own consent/recovery metadata. Cache friend/invitation content per owner only while permitted; live peer coordinates/topics never enter account JSON, logs, analytics, crash breadcrumbs or durable outbox. Guard scope before/after every async step and before queued reducer commits. A→B→A creates a new generation; no earlier provider/request/channel may publish into the new state. Retry flushes storage before network, and failed reads never become an empty writable document.

Proposed exact services:

| RPC / endpoint | Request and result | Important rule |
| --- | --- | --- |
| `rs_social_snapshot` | cursor/limit≤30 → checked snapshot | One owner-private inbox invalidation channel avoids joining a channel per friend; existing pair channels remain during compatible migration. Snapshot evaluates current active accounts, block and relationship generation. |
| `rs_friend_request_v2` | operationUUID + exact normalized handle → ACK/current relationship | Derive requester; exact lookup only. No public prefix directory. UI search filters own known list; arbitrary handle search requires explicit action. |
| `rs_friend_action_v2` | operationUUID + otherUUID + expected generation + accept/decline/cancel/remove/block/unblock | Recipient-only acceptance; block works without friendship; unblock does not restore any relationship or consent. Request changed while a dialog is open fails `FRIEND_CHANGED`. |
| `rs_social_operation` | operationUUID → ACK/null | Actor-only receipt; no action or implicit resend. |
| `rs_blocked_people` | cursor/limit≤30 → minimal own blocked summaries | Only own block list; never expose another user's reasons or blocks. |
| `rs_friend_link_create/revoke` and authenticated `friend-link` resolver | stable operation + linkUUID + SHA256 of locally generated256-bit token; server fixes≤24h expiry → ACK | Client persists token in owner SecureStore before reservation and sends hash only for creation. Resolver hashes presented token, requires login/active issuer and returns minimal issuer identity. Token grants a preview/request, never friendship. Explicit recipient request/issuer acceptance still apply. Max8 active links; revoke/delete fences. QR encodes versioned app link, no credentials/GPS. Do not use a mutable @handle as permanent identity. |

Failed/blocked/nonexistent handle or code attempts must consume an admission budget even when rejected. Existing `ride_private.quota` increments roll back on SQL exceptions; it currently bounds successful actions, not all failed probes. Use a committed admission RPC returning typed outcome, or a separate service admission transaction, plus project/Auth rate defenses. Suggested pilot limits:10 lookup attempts/min and40/day/actor;10 code attempts/min,100/day. These are proposed app policy. Return a generic unavailable result for forbidden/nonexistent resources to avoid a profile directory oracle.

## 4. Presence, ghost mode and location consent

Keep current server heartbeat semantics. Extend the canonical status with a server-bound foreground active ride lease for `riding`; a client-authored flag is a convenience claim, not verified motion. Online70s expiry is not precise position freshness. Local rendered status expires using server clock estimate and falls back to unknown/offline on failed refresh.

`ghost_mode=true` must stop online/riding publication and revoke every live-location lease. Turning it off only permits opt-in status; it never grants position sharing. Preserve002's synchronization of ghost preference and presence switch/account revision. Separate consent explicitly:

```ts
type LocationConsent = {
  scope: 'friends'|'convoy'|'closed_course'; sessionId: string|null;
  precision: 'coarse'|'precise'; expiresAt: string; revision: number;
};
type PeerPosition = {
  userId: string; displayName: string; latitude: number; longitude: number;
  accuracyMeters: number; headingDegrees: number|null;
  capturedAt: string; receivedAt: string; expiresAt: string;
  consentRevision: number; membershipGeneration: number;
};
```

Default no position sharing. `rs_location_consent` operation pins expected consent revision, target session and explicit precision; grant maximum60min, no automatic restart/regrant. Friends sharing defaults coarse (~100m rounded cell); precise convoy sharing has a separate disclosure. Receiving map markers is an independent toggle and does not start local GPS or imply sending. Turning recipient toggle off immediately hides markers and stops position reads.

A single `ride_private.live_positions` latest row per owner/session holds consent/member generation, sample sequence, current coordinates and server expiry15s. RPC reads reject expired/foreign/blocked/unaccepted/ghost/deleting rows on every request; physically clear stale rows with bounded cleanup and account/session cleanup. No public SELECT or Postgres Changes subscriptions on this table. No location replay. Retention in backups/provider infrastructure is separate from application TTL and must be described honestly in the privacy policy.

`rs_publish_live_position` takes sessionUUID, membership/consent revision, leaseUUID, increasing sequence, actual sample timestamp/coordinates/accuracy/heading/mock flags. Validate finite bounds, sample age≤3s, accuracy≤20m and no known mock/simulation; missing native flags are unknown, not invented false. Derive actor; require current consent/account/membership, reject older sequence, enforce≥1s server publication interval and project admission budget. Do not queue an offline sample and send later. Preserve latest sequence under packet reordering. `rs_live_positions` returns≤4 current authorized participants and serverNow. DB event payload is only `{schemaVersion:1,sessionId,topicGeneration,revision,kind:'positions_changed'}`. Fetches coalesce to at most1/s; a1Hz poll repairs dropped events while the opted-in map is visible. Authorized positions interpolate locally; stop interpolation/extrapolation and hide at expiry.

Reuse the existing exclusive RideProvider capture. Initial simplest scope: live sharing operates during an explicitly started foreground ride; the sharing CTA clearly starts/uses local recording. A later independent sharing-only capture must be implemented as another consumer of the same capture owner, never a second Location watcher. Pause/stop/background/permission loss/account switch disables sending immediately; reconnect rereads consent/room/version before sending a fresh fix. Do not claim background convoy tracking in M5 while recording explicitly stops on background.

## 5. Convoy lifecycle and channel revocation

Propose `public.rs_convoys` and `rs_convoy_members` with participant-authorized minimal metadata; private route/session document, code hashes, location rows and operation receipts stay in `ride_private`. Creator requires a completed profile and synced exact route revision. Initial join code is8 random Crockford characters, hash stored,≤60min expiry, max4 participants. Code use requests admission; host approval and each participant's position disclosure are separate actions. Pilot members must be accepted friends of host. Blocked pairs cannot share a room even through a mutual friend; re-adding a friend never restores old membership or consent.

```ts
type ConvoySnapshot = {
  id: string; hostId: string; revision: number;
  state: 'lobby'|'active'|'ended'|'cancelled';
  route: SafeRouteSnapshot; // M4 exact immutable trimmed segments, not owner pins
  members: {userId:string; state:'requested'|'accepted'|'left'; generation:number}[];
  liveTopic: string; topicGeneration: number; expiresAt:string; serverNow:string;
};
```

RPCs: `rs_convoy_create`, `rs_convoy_join_request`, `rs_convoy_member_action(approve/decline/leave/remove)`, `rs_convoy_start/end`, `rs_get_convoy`, `rs_list_convoys`, operation status and own location consent/publish/read. Mutation revisions CAS; host-only approve/start/end; participant may leave/revoke independently. Start consumes active-room lease; closed/expired resources cannot be restarted under an old operation. Full private route endpoints are not disclosed through a join code. Shared normal-trip route stays the M4 projection; navigation of a private missing start requires an explicit separately reviewed rendezvous pin, not bypassing route privacy trimming.

Rotate an unpredictable room topic in the **same transaction** whenever membership, location consent, ghost setting, friendship generation, block or account deletion changes. Clear old position leases; notify remaining members through their owner inbox to refetch/rejoin. After rotation no future publication uses the old topic; replayed invalidations reveal no geometry. Client requires current scope+session+topicGeneration and ignores old callbacks. Server position reads remain authorized even if a malicious client keeps the old socket open.

Deterministic block/removal rule for initial small rooms: affected rooms are cancelled and everyone must explicitly create/join a new room. This avoids a remaining mutual friend becoming a bridge for blocked users' locations. A participant's normal voluntary leave removes that member and rotates topic for the rest. Host departure/deletion cancels; no automatic host transfer with hidden consent changes. Existing friend pair topic rotation remains in place for the compatible status API.

Concurrent locks need a documented order compatible with existing `actor()` account locking: actor account fence, sorted relevant relationship pair advisory/row locks, room row/advisory lock, consent/location rows, global admission counter. Capture the member set before locking, then re-read its generation after acquiring the locks; a changed set returns a retryable conflict rather than acquiring additional pair locks under the room lock. Extend legacy block/ghost/deletion paths consistently. Do not acquire another user's account lock after the actor lock in arbitrary order; recipient deletion is serialized through the common pair/room locks and rechecked active-account state. Prove the exact lock protocol with concurrent transactions before rollout. An already delivered point cannot be recalled, so clear current UI immediately and describe this limit.

## 6. Async route-time first; live timing is separate

Ordinary road convoys have metric `none` and never grant verified ranks. Keep historical `timed_race/sustained_speed_3s` and `sustained_min_3s_v1` unchanged. Add versioned `time_trial/route_time_v1` and `live_race/route_time_v1` resources or a separate versioned competition table rather than broadening legacy checks until the compatibility paths and old verifier are proved.

Competitive async and live sessions require **operator-approved private/closed course and exact reviewed route revision/geometry hash** plus the one-time safety acknowledgement. A checkbox cannot approve a public road. Freeze ordered course checkpoint gates, start/finish geometry, category and actual start vehicle snapshot/class policy server-side. Owner edits/revocations invalidate a new invitation's approval; old approved immutable course/session stays only under its explicit service policy. Shared invitation contains safe metadata/projection; accepted course participants get only the specific approved course geometry needed to run it, through a fresh authorized RPC. General public/private home-route endpoints are never restored.

Proposed server machine: `lobby → countdown → running → completed`, with cancellation from any nonterminal state. Async trials use their approved window and individually reserved attempt. `rs_competition_create/invite/action`, `rs_competition_ready`, `rs_competition_schedule_start`, `rs_get_competition`, `rs_competition_clock`, result submission/status are actor-scoped, CAS/idempotent and separate from position signals. Ready state does not imply location consent. Server atomically fixes `startAt` at least5s ahead after all required participants are ready, current approval/window/leases and clock uncertainty checks pass. A reconnect reads canonical state; it does not schedule another start. Background/disconnected devices become not-ready before scheduling; loss during a run means a visible interrupted/provisional attempt, never a manufactured finish.

Clock samples use request/response monotonic timestamps and server receive/send instants; choose several low-RTT samples and retain uncertainty/drift bound. Count down to the fixed server instant using a monotonic local anchor, not receipt of a Broadcast, `Date.now()` alone or push delivery. Cancel/fail readiness if uncertainty is too large for the target. The≤300ms two-device start target requires actual paired-device measurements; source code/browser timers cannot certify it.

A local finish geofence provides HUD feedback only. Route-time verifier recomputes ordered start/checkpoint/finish crossings and elapsed time from immutable actual samples; rejects gaps, insufficient accuracy, known mocked fixes, teleports/impossible travel, missing checkpoints, pauses/restarts and invalid time/approval windows. Gaps/parts remain separate; no smoothed animation samples count as evidence. Evidence receipt keeps capture/attempt/owner/course/route hash/vehicle binding and same immutable uploadUUID/bytes. Server-only token-fenced finalizer writes `route_time_v1` result; provisional/self-reported summaries and live position messages never do. Android route-time support needs its own reviewed original timestamp/location evidence adapter; missing speed uncertainty must not be forged to pass the older sustained-speed method. Client GNSS recomputation does not prove sensor authenticity.

Results contain server-controlled method/version, completion time, elapsed milliseconds, evidence hash, current moderation/approval eligibility and audience. Future M6 route-time ranks compare only the same approved route/revision and valid vehicle class, lower elapsed time first; sustained-speed ordering remains separate. Best record per rider, deterministic ties, UTC storage/Bangkok windows and revocation/account-delete exclusions are mandatory. Existing approved courses may be empty: show real unavailable state and allow normal convoy, no development course seed in production.

## 7. Push and setup gates

Expo requires notification library/config plugin, permission, projectID for Expo tokens, platform credentials and a new native build. FCM credentials are needed on Android; iOS push credential generation requires a paid Apple Developer account and suitable registration/signing. EAS Build is optional; configured local/GitHub native builds can use the library. Expo Go SDK≥53 does not prove remote push. [Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).

Expo Push has no sending charge and600 requests/s/project. Handoff is best-effort/at-least-once: a receipt means APNs/FCM accepted a handoff, not a delivered or timely on-device notification. Remove DeviceNotRegistered tokens. Push cannot synchronize a race start. [FAQ](https://docs.expo.dev/push-notifications/faq/).

Implement an owner-private install registration and service-only event outbox. Client registration pins installUUID, scope, platform, token and preferences; a fixed token/installation is not allowed to remain assigned to two accounts. Reassignment invalidates the previous generation, signout disables token locally/remotely when possible, registrations expire without periodic owner confirmation. A wrong-account notification tap must navigate to login/current authorized inbox, never retrieve former-owner content. Logout while offline cannot recall a previously queued notification; use generic lock-screen text and short expiry to bound disclosure.

Outbox contains opaque friend/challenge IDs, dedupe identity and localized generic copy, not exact route/GPS/speed/email/photos. Worker rechecks active recipient, current friend/member generation, notification setting, block and pending invitation immediately before delivery. Track tickets/receipts and exponential retry; do not retry permanent invalid tokens. Authentication/deep-link handler re-fetches authorized resource; forged or revoked link returns unavailable. Existing `notifications_enabled=false` must remain off until user grants app setting **and** OS permission. No request for keys in chat; credentials go into provider dashboards/secrets. In-app inbox works while push is unconfigured.

Required external acceptance inputs, batched only when dependent work is ready: Expo projectID/platform push credentials; paid Apple capability/signing for iOS remote push; second consenting account/device; actual operator-approved closed course/time window for verified races. No provider account is needed for ordinary foreground friend requests/in-app invitations.

## 8. Deletion and acceptance contract

Extend deletion **begin quarantine**, not only final purge: turn status/position consent off, clear own live rows, cancel hosted/affected rooms per room policy, remove participant membership, rotate current room and inbox generations, disable device registrations, cancel unsent notification outbox and invalidate result eligibility. Acquire the same locks as ordinary publication. Every new RPC/helper checks active account including Auth-only users. A response-loss deletion retry repeats the same request and never resumes sharing.

Purge operation/link hashes, codes, latest positions, own/owned-room private route documents, memberships, immutable invitation snapshots containing personal data, attempts/evidence/results and push tokens/outbox. Resolve cross-owner FKs and evidence binaries before Auth deletion, retaining only nonpersonal deletion receipt material required by the existing signed receipt recovery. Private evidence/blob TTL is not equivalent to complete account deletion. Client `clearSocialAccount(scope)` closes owner fence/channels/timers first, then removes own durable outbox/secure invite tokens; late hydration/send/receipt cannot recreate them. Keep other owners' unsent local data.

Proposed stable errors: `SOCIAL_AUTH_REQUIRED`, `PROFILE_REQUIRED`, `SOCIAL_INVALID`, `SOCIAL_TOO_LARGE`, `SOCIAL_OPERATION_CONFLICT`, `SOCIAL_REVISION_CONFLICT`, `SOCIAL_RATE_LIMITED`, `SOCIAL_UNAVAILABLE`, `FRIEND_CHANGED`, `INVITE_UNAVAILABLE`, `INVITE_EXPIRED`, `CONVOY_UNAVAILABLE`, `CONVOY_FULL`, `CONVOY_CHANGED`, `LOCATION_CONSENT_REQUIRED`, `LOCATION_CONSENT_CHANGED`, `LOCATION_STALE`, `LOCATION_QUALITY`, `LIVE_CAPACITY`, `CLOCK_UNCERTAIN`, `COURSE_APPROVAL_REQUIRED`, `COMPETITION_CHANGED`, `ATTEMPT_INTERRUPTED`, plus existing `ACCOUNT_CHANGED`/`ACCOUNT_DELETION_PENDING`. Map forbidden/missing resources to generic unavailable, not existence-detail leaks. UI localizes loading/empty/offline/expired/retry states and locks typing/edits above the existing moving threshold.

## 9. Implementation split and meaningful checks

1. **M5A friends/invitations:** the narrowed [M5A contract](m5a-social-contract-v5.md) supplies typed friends/status/blocked pages, minimal invitation flow and exact receipts; root owner-scoped SocialProvider/storage/deletion and navigation; UI agent extracted Friends/Challenges screens and bilingual states; this agent pure social coordinator/decoder/transport tests. Reuse the fixed M4 safe route preparation. QR/token links and a new inbox channel can follow; current pair status channels and foreground refresh remain in this first stage. Verify exact request/accept/block/unblock, lost ACK/restart, stale expected generation, A→B→A, failed hydrate/persist and deletion while in-flight. No push/device claims yet.
2. **M5B foreground convoy:** backend room/consent/position/admission/rotation RPC+RLS tests; root passive capture sampler and map peers; UI host/code/lobby/location disclosure and motion; this agent versioned live coordinator/clock and channel tests. Verify revoke/block/deletion while malicious old socket remains subscribed, stale generation/sequence, TTL expiry, dropped event/poll repair, no coordinate DB broadcast/replay, pair and room lock order, project cap/rate load and no second watcher. Run actual two-account map session on installed native apps.
3. **M5C async route-time then live:** backend approved course/attempt/evidence/finalizer contract and tests; root immutable capture bindings/durable evidence path; UI safety/readiness/countdown/results; this agent clock/attempt state machine and reorder/reconnect tests. Verify different route hash/class/version never mixes ranks, stale verifier lease cannot finalize, all ordered checkpoints required, forged/mocked/gap evidence rejected, cancelled/deleted/blocked eligibility, real controlled-course completion and measured clock/start uncertainty.
4. **Push acceptance gate:** registration/outbox/deep-link tests can precede credentials. Actual delivery foreground/background/tap, signout/account change, opt-out and revoked invitation need configured release/development builds and devices. Store/background location, app attestation and 30-minute battery/performance measurements remain separate explicit acceptance tasks.

Every stage commits only after its relevant real tests and current typecheck/lint/build checks pass. Do not present old dummy online indicators or simulated timer races as a completed milestone. Proposed names, bounds and wire types above must be frozen with root/backend before M5 source edits start.
