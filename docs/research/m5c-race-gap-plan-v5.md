# M5C — route-time trials and live races: source audit and proposed slice

Read-only proposal, 2026-10-01. M5B remains frozen. This document changes no product source, schema, grant, hosted setting or approval. Root must approve the exact M5C wire before implementation.

## What actually exists

The current checkout has no `race-control`, `race-presence`, `verify-ride` handler or `OnlineChallengeScreen`. `RideSpeed/` is empty and `supabase/` contains a compatibility README. The maintained app is Expo, `components/Challenges.tsx` delegates to `InvitationsScreen`, and `OnlineState.tsx` is a transport-free SocialProvider facade.

| Maintained source | Real capability | M5C gap |
| --- | --- | --- |
| `backend/migrations/202609300001_online_foundation.sql:44` | Operator-managed courses, boundary polygons, approved sessions; route revision bound to course approval | No directed start/finish gates, ordered checkpoints, route corridor, approval audit/version or route-time result |
| Foundation `:72`, additive007 | Real friend invitations; exact friendship/route/session review, durable control receipts | `timed_race` means `sustained_speed_3s`, not elapsed route time; no attempt/lobby/countdown/finish state |
| `backend/functions/verify-submission/index.ts` and `_shared/verify-evidence.mjs` | Owner-only immutable evidence, service claim token, conservative 3-second minimum speed recomputation, course/session/membership checks at finalization | Verifier schema is `source:'corelocation'`; it finds a speed window inside a polygon, not completion of a route |
| Foundation `:402–475` | Submission reserve/upload/queue/verify lifecycle and Bangkok speed leaderboard | Reservation is not idempotent; existing result and leaderboard fields cannot represent route time |
| `features/rides/journalModel.ts`, `journalPort.types.ts`, `RideState.tsx` | Owner-only raw receipts, disconnected captures, durable journal, immutable vehicle snapshot, exclusive watcher | Need a bounded race evidence export pinned to one uninterrupted capture and exact receipt range; `getEvidence()` is only the current in-memory buffer |
| M5B `LiveCaptureBus`, convoy control/position service | Passive actual-fix subscription, consented foreground peer positions, host lease, opaque private hints | Convoy positions are unverified display data. They cannot establish timing, checkpoint traversal or a competitive result |

Preserve the deployed speed verifier, its worker leases, source-quality limits and `sustained_min_3s_v1` result sink. Add a distinct `route_time_v1` verifier/result path; do not reinterpret an existing speed challenge or insert elapsed milliseconds into a speed record. A fresh operator approval and actual approved session are required. A user safety checkbox is acknowledgement only.

## Smallest useful implementation sequence

1. **M5C1 async time trial:** one reviewed approved route, one accepted friend invitation, separate attempts inside an operator session window, start → ordered route completion → bounded immutable evidence upload → server-checked elapsed-time result. Real empty/unavailable/error/offline states. No seeded approval or fake result.
2. **M5C2 live race:** reuse that attempt/verifier protocol; add a four-person lobby, explicit ready state, server-scheduled countdown and common start epoch, optional existing M5B peer display, timeout/DNF/cancel, results and rematch as a new race. This remains required scope, not an optional alternative to async.
3. Add Route Time ranking/read history in M6. Push delivery still needs its separate native signing/FCM setup; a live socket is not push.

Keeping route time in new private tables avoids changing the semantic meaning of foundation `rs_challenges.metric` and old speed records. Reuse shared friend-generation, safe-route projection, owner account fences, immutable receipts and typed business-envelope helpers. New race invitations belong to the same Challenges screen, but have an explicit metric and resource ID. Do not silently promote a group ride or old speed invitation into a route-time competition.

## Proposed additive domain and ports (not frozen)

All authenticated mutations derive the actor and use immutable `{operationId,request}` control receipts. Known typed errors may retire only after exact status recovery; unknown responses retain their exact pending request. Every receipt echo binds action, resource, expected revision/generations and normalized request. Stored controls contain no raw GPS. New tables have RLS and no direct browser writes. Service verifier/approval sinks receive explicit grants only.

| Resource | Essential binding/state |
| --- | --- |
| `race_course_approvals` | Service-managed immutable approval UUID/revision, exact route owner/UUID/revision/geometry hash, course and session, private canonical ordered geometry, directed gate definitions, corridor and checkpoint configuration, category/class snapshot, method version, reviewer/time; active/revoked state |
| `races` | UUID, creator, revision, `async|live`, immutable approval/session and safe display snapshot, UTC window, `open|lobby|countdown|running|finished|cancelled|expired`, nullable live convoy binding/common `starts_at`, terminal reason |
| `race_members` | Actor/recipient, accepted friendship generation, member generation, invited/accepted/declined/withdrawn; live ready state bound to race epoch and member generation |
| `race_attempts` | Owner, immutable race/member/approval/vehicle snapshot, capture UUID, attempt UUID/revision; `reserved|armed|upload_pending|queued|verifying|verified|rejected|aborted|dnf`; bounded start/finish observations, evidence path/digest and token-fenced worker lease |
| `race_results` | Server-only attempt, approval/method, elapsed time plus timing-quality/uncertainty, start/finish times, summary stats, verified-at; no raw coordinates in shared results |
| `race_operations` / cancellation fences | Owner-only immutable exact control replay, retained after resource expiry; exact unknown attempt-start cancellation proof |

Tentative client exports:

```ts
type RaceMode = 'async' | 'live';
type RaceControlRequest = RaceCreate | RaceInvite | RaceMemberAction |
  RaceAttemptReserve | RaceAttemptArm | RaceAttemptAbort |
  RaceReady | RaceSchedule | RaceCancel;
type RaceClock = {serverNow: string; requestStartedMono: number; receivedMono: number};
type RaceEvidenceRef = {rideId: string; captureId: string; firstSequence: number;
  lastSequence: number; schemaVersion: 1; sha256: string; bytes: number};

getRace(scope, session, raceId): Promise<RaceSnapshot | null>;
getRaceOperation(scope, session, operationId): Promise<RaceReceipt | null>;
mutateRace(scope, session, operation): Promise<RaceReceipt | RaceErrorEnvelope>;
cancelRaceAttemptStart(scope, session, originalOperation): Promise<RaceReceipt |
  RaceStartCancellation | RaceErrorEnvelope>;
getRaceAttempts(scope, session, raceId, cursor): Promise<RaceAttemptPage>;
reserveRaceEvidence(scope, session, attemptId, digest, byteLength): Promise<EvidenceReservation>;
queueRaceEvidence(scope, session, attemptId, digest): Promise<AttemptSnapshot>;
verifyRaceAttempt(scope, session, attemptId): Promise<AttemptSnapshot>;
```

`RaceControlCoordinator` follows the existing durable outbox rules, including exact-ID explicit review after restoring enable-sensitive work, foreground network gates, owner-only durable late ACK and a coalesced terminal settlement. A delayed `attempt_arm` cannot safely be dismissed after status=null; OFF/abort fences the exact original operation under the same lock, returns applied receipt or cancellation proof, then aborts the fresh current attempt if needed. Never resend an obsolete capture to clear a lane.

`RaceAttemptCoordinator` passively consumes `LiveCapturePort`, pins scope/ride/capture/generation and receives a `JournalEvidencePort.read(ref)` only after `DurableRideQueue.drain()`. It does not create a watcher, update the speed engine, send interpolated positions or append duplicate GPS to account JSON. Local preview gate events are provisional; server evidence recomputation decides completion. Persist only metadata plus journal references for resumable upload. Background/pause/storage failure/capture restart invalidates continuous attempt authority; an interrupted attempt cannot automatically resume or stitch captures.

Reuse `ride-evidence` only with an added exact attempt reservation policy and immutable owner/attempt path. Keep 2 MiB/8,000 samples as an initial client bound aligned with the existing capture buffer; reject truncation or missing original receipts. Validate actual Storage byte length/MIME and calculate digest server-side. Recover a lost upload response through exact object metadata, without upsert. Queuing the same immutable evidence must be idempotent. Extend binary-first deletion to every new owner path and dependent attempt/result before Auth removal. Define evidence retention and operated cleanup before broad release; application expiry does not erase provider backups.

## Operator approval and route verification

The service operator reviews the real closed-course operator/session authorization and the exact server-stored route geometry. Existing `closed_course_approved=true` is a necessary foundation gate, but it is not enough to infer gate direction or safe course traversal. New approval records freeze those definitions and a versioned verifier configuration; validate finite/simple bounded polygon geometry, connected canonical course segments and nonzero directed gate vectors. No client can write an approval, choose an arbitrary polygon, copy another route's approval or regain approval after editing. Public shared maps retain M4 privacy trimming; the verifier privately uses the exact approved geometry, never the trimmed display snapshot. A draft, disconnected unusable course geometry, public-road route or missing approval shows an honest unavailable state.

Proposed `route_time_v1` rules, to freeze against fixtures before coding:

- Ordered **directed** start → checkpoint(s) → finish crossings from consecutive actual original observations. Starting inside the finish zone, crossing backward, skipping a checkpoint or leaving/re-entering at the finish does not complete a route.
- All traversed fixes and their consecutive motion segments remain inside the approved course boundary and a bounded route corridor, with a frozen bounded accuracy allowance. Endpoint containment alone permits shortcuts across a concave polygon. Match ordered progress/checkpoint windows, not just the nearest segment on a self-intersection. Approve a course-specific progress ambiguity/tolerance; do not automatically choose the fastest projection branch. Enforce a bounded gap and reject teleports/implausible movement or ambiguous inter-fix traversal. Preserve bad observations and source flags for rejection rather than hiding them through geometry simplification.
- Positive horizontal accuracy with a frozen ceiling (proposal ≤15m); known mocked/simulated samples reject the attempt. Nullable provenance remains unknown. Timestamp order, capture continuity, complete raw range and window checks are required. The current journal's `accepted` flag is a local display filter, not server proof. Its `clockAnomaly` only notices limited backward/end cases; M5C must add per-sample wall-versus-monotonic continuity checks for a competitive attempt.
- Treat gate crossing as a bounded time interval between actual observations, including spatial uncertainty; do not claim millisecond timing from 1Hz GPS. Local interpolation is visual only. Server computes a conservative elapsed interval or rejects ambiguous crossings, stores quality, and groups overlapping/coarsely indistinguishable results as ties under a frozen ranking rule. Exact gate geometry/tolerance/tie quantization is an explicit wire/design decision before implementation.
- Do not require the existing iOS native speed-accuracy field just to measure elapsed route time. Expo57 exposes epoch timestamp, coordinates, accuracy, speed and Android mocked status, but not native speed/elapsed-realtime uncertainty. The present Expo conversion correctly preserves missing accuracy/provenance as null. Native Android's monotonic fix timestamp is a possible future module improvement; it cannot be manufactured from JavaScript arrival time. [Expo57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [Android Location](https://developer.android.com/reference/android/location/Location#getElapsedRealtimeNanos()), [Apple CLLocation](https://developer.apple.com/documentation/corelocation/cllocation).
- New verifier accepts its own versioned journal schema/platform claims. Existing `verifyEvidence` remains unchanged. Server recomputation is a consistency check of supplied evidence, not hardware sensor attestation; result copy must say what was checked. Browser preview can show the flow but cannot qualify an installed native competitive attempt.

The worker finalization transaction rechecks active actor, accepted current friend/member generation, uncancelled race/attempt, exact approval version/session/time and current worker lease. Revocation/deletion while a worker downloads or computes makes its finalization fail. Obtain account → existing global live control lock → race/attempt rows in one documented order; janitor uses global only and never waits for a foreign account under it. Do not introduce submission-row → global inversions in old verifier helpers. Bound geometry and algorithm work and benchmark the maximum fixture: hosted Edge Functions currently have 256 MiB memory and **2s CPU per request**, independent of the free 150s wall-clock allowance. [Official limits](https://supabase.com/docs/guides/functions/limits).

## Live lobby and countdown uncertainty

Reuse M5B for optional precise peer display; consent remains independent from race readiness, default none. A ready checkbox never enables location. No GPS enters Realtime payloads or competitive receipts. Rotate the unpredictable private race/room topic after membership/cancel/revoke boundaries and send only an opaque epoch-change hint. Fresh authenticated reads remain authoritative because Supabase channel authorization is cached per connection. [Official Realtime authorization](https://supabase.com/docs/guides/realtime/authorization#updating-rls-policies).

The server schedules a future common UTC start only after all selected accepted members are freshly ready in the same epoch, the host lease/current convoy (if associated) is valid, and the approved session fully contains the attempt window. Use a countdown long enough to deliver and acknowledge the immutable epoch before start. A lost schedule response recovers the exact receipt; no client chooses another start or begins from an unconfirmed hint.

Use a new interval clock model for competitive countdown rather than treating M5B's conservative TTL clock as exact time. For a server timestamp captured inside a request with monotonic start `m0` and receive `m1`, at current monotonic `m` the server-time interval is `[stamp + m - m1, stamp + m - m0]`, assuming a continuing monotonic clock. This avoids assuming symmetric network latency. Intersect a small bounded set of recent valid probes; a disjoint interval, rewind, background, clock discontinuity or stale anchor requires resync. The midpoint drives haptic/audio/display only, with explicit uncertainty.

Proposal: do not arm a live countdown while half-width exceeds100ms; measure real devices before claiming the spec's approximately300ms paired start target. Network/server delay can make that target unavailable. Readiness binds exact race epoch/member/capture; canonical epoch arriving after the uncertainty-adjusted start window yields late/DNF, never backdated start. Server verifies shared epoch and evidence timing within the approved method tolerance; local countdown animation is not proof. Schedule-triggered live start is separate from directed start-gate crossing used for async elapsed trials; finalize the intended live timing rule before wire freeze.

Pause/background/host expiry/member removal/block/deletion cancels or marks DNF according to a fixed state machine. Show those states and preserve a recoverable evidence/control upload where allowed, but never reopen an ended epoch. Rematch creates a new ID and rechecks approval/session/friendship; no old code, member generation, capture, point or ready state carries over.

## Ownership split and meaningful acceptance

| Owner | Proposed files/slice |
| --- | --- |
| Backend agent | Additive009 course approval/race/attempt/receipt/RLS/lock/deletion migration; separate `verify-race-attempt` worker and pure bounded route-time algorithm/tests; operator approval recipe, no synthetic approved user data |
| Pure client agent | `features/races/{types,model,service,RaceControlCoordinator,RaceAttemptCoordinator,raceClock,gatePreview}.ts` + actual decoder/SDK/journal/clock tests |
| Root | RaceProvider + owner durable metadata/outbox/evidence reference integration, passive CaptureBus/journal export, deletion closure and map/lifecycle integration |
| UI agent | Challenge detail/async attempt/results first; live lobby/readiness/countdown/rematch next; natural Thai/English, safe moving controls, real states, explicit independent location controls |

Required tests: exact receipt response loss and every terminal settlement order/flush failure; missing/foreign/unapproved/revoked route/session/course; changed route revision; operator-only grants; directed reverse/skipped/self-intersection/corridor/teleport/gap/duplicate/clock jump/truncated/known-mock cases; null provenance on genuine native platforms; late worker lease and concurrent block/delete/approval revocation; no raw GPS through socket/results/UI logs; immutable lost-upload response recovery; account A→B→A/closed disk gates; interrupted capture cannot resume; common countdown with RTT jitter/asymmetry/late epoch/background and no fake start; server start race/CAS/finalization races on actual PostgreSQL. Feed actual SQL responses into maintained client decoders. Installed paired-device closed-course acceptance is still required for timing/position quality, haptic scheduling and sensor behavior.

Approval needed from root before product edits: distinct route-time resource/metric path, initial gate/corridor/tie/clock tolerances, async/live timing rule, concrete immutable wire and operated course/retention gates. There is no missing API key for the source implementation; an actual operator-approved course/session and installed consenting test accounts/devices gate meaningful hosted race acceptance.
