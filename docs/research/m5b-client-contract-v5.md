# M5B passive capture and live map client contract

Documentation-only proposal, 1 October 2026. Read alongside [the backend M5B wire](m5b-live-contract-v5.md) and [M5A](m5a-social-contract-v5.md). No product code, migration008, hosted setting or location sharing is enabled by this document. Root must freeze the interfaces and operational gates before implementation. The backend document owns snake_case request/response shapes; the interfaces below are proposed TypeScript boundaries around those shapes.

## 1. Scope and exact existing source

M5B is a normal foreground convoy, metric `none`: at most four accepted participants including host, two admitted unexpired rooms/project and one nonterminal membership/account. It does not verify speed, measure a race, create a rank or certify sensor authenticity. M5C still supplies approved async route-time and live timing; push and installation links retain their separate credential gates.

| Actual source | Integration consequence |
| --- | --- |
| `src/state/RideState.tsx` guarded `onSample` calls `acceptSample`, persists its `JournalReceipt`, then updates `userFix`. | Tap that actual callback once. A receipt supplies capture UUID, segment UUID, original sample, accepted/rejected status and increasing journal sequence. Do not open another native/Expo watcher. |
| `src/useRideSession.ts` owns the shared `ExclusiveLocationCapture`, native/Expo listener, original timestamps and raw evidence. | LiveProvider subscribes passively to RideProvider; it does not mount another hook, invoke `locationCapture.start`, call `watchPositionAsync` or change capture ownership. |
| Capture callbacks may arrive during `startingRef=true`, before native start resolves and before RideProvider binds its successful capture. | Journal those fixes as before, but do not publish them. Only callbacks received after successful exact capture binding become live candidates; do not replay startup fixes when the binding becomes active. |
| `RideState.userFix` remains the last accepted position after pause/stop. Idle `locate()` uses the same exclusive owner for a short foreground lookup. | Neither `userFix` nor idle locate is a sharing source. A retained last-known dot is not permission to continue sending. |
| `SpeedEngine` snapshots and its one-second timer interpolate speed; journal restoration reconstructs saved fragments. | Snapshot ticks, rolling digits, restored points, smoothed positions and `getEvidence()` polling never enter live transport. |
| Recording stops on AppState `background`; it tolerates iOS `inactive` during permission prompts. | Preserve recording semantics. Sharing requires exactly `active` (and web document visible), so inactive suspends live egress without changing recording behavior. |
| `pause` and `finish` await `stopAsync` and journal drain; deletion closes its owner queue before removal. | Invalidate the passive bus synchronously before awaiting cleanup, including storage failure, capture-limit stop and owner closure. An outstanding request cannot be recalled; later replies cannot republish it. |
| `JournalReceipt` keeps raw private samples in SQLite/IndexedDB; owner summaries use separate sync services. | Live transport has no new durable GPS store, sample outbox, sample receipt table or route-history upload. Preserve the existing private journal and original evidence unchanged. |
| MapSurface only renders caller-authorized peers and has no location watcher. | LiveProvider authorizes and expires peers; the map adapter never grants access. Current MapHome supplies an empty peer list, so explicit integration remains required. |

Current capture source fields are `timestampMs`, lat/lon, nullable speed/accuracy uncertainties, nullable simulation/accessory/mock flags. There is **no heading field in the recording sample**; emit `heading_deg:null`. Idle locate's heading cannot be grafted onto a recording fix. iOS native callbacks currently set `mocked:null`; Expo supplies `location.mocked ?? null` and leaves native source flags unknown. Unknown stays null, never false or a verified badge.

## 2. Passive sample API owned by root

Add one stable read-only subscription to RideProvider, backed by refs and synchronous events rather than per-subscriber React state. Bind `captureId` to the active journal `Capture.id`, not the hook's independently generated session ID. A new resume produces a new capture UUID; a current grant for a previous capture cannot resume sending.

```ts
import type {AuthScope} from '../../state/AuthState';
import type {RideEvidenceSample} from '../../../modules/ride-location/src/sessionSupport';

type LiveCaptureBinding = Readonly<{
  scope: AuthScope; rideId: string; captureId: string; segmentId: string;
  generation: number; platform: 'ios'|'android'|'web';
}>;
type LiveCaptureFix = Readonly<{
  binding: LiveCaptureBinding; journalSequence: number;
  receivedMonotonicMs: number; receivedWallMs: number;
  sample: Readonly<RideEvidenceSample>;
}>;
type LiveCaptureEvent =
  | {kind:'active'; binding:LiveCaptureBinding}
  | {kind:'sample'; fix:LiveCaptureFix}
  | {kind:'unavailable'; binding:LiveCaptureBinding; reason:'sample_quality'}
  | {kind:'invalidated'; generation:number; reason:
      'starting'|'pause'|'stop'|'background'|'source_error'|'storage_error'|
      'capture_limit'|'account_changed'|'account_deleted'|'unmount'};
interface LiveCapturePort {
  getBinding(): LiveCaptureBinding|null;
  subscribe(listener:(event:LiveCaptureEvent)=>void):()=>void;
}
```

`getBinding()` exposes no saved sample and is null until successfully active, during scope hydration, after invalidation, for guests and for an owner with a journal read/write failure. Subscribe never replays historical samples; it may notify current binding but requires the next actual fix. Each callback checks exact AuthScope object identity, owner queue closure, active capture generation, ride status and current capture UUID. Detach/freeze the small original sample so consumers cannot mutate evidence; no whole evidence clone. Notify sample only for accepted receipts whose finite original coordinates/positive accuracy/time and source flags pass live quality checks. A rejected, zero-accuracy or otherwise unsuitable actual fix emits `unavailable/sample_quality` with binding only: coordinator clears latest candidate and reports `LOCATION_QUALITY`, without raw coordinates or disarming continuously active consent for each transient fix. It cannot keep an older candidate alive.

Parent bus generation changes before pause/finish async work, background/inactive share invalidation, owner change/deletion, unmount, failed cleanup, GPS fatal/nonfatal source error and storage/capture-limit stop. Add an explicit source-unavailable observer event for nonfatal native/Expo errors: current hook sets an unavailable display snapshot without `onStopped`, which otherwise leaves a prior live candidate waiting until its freshness timeout. Successful source recovery can emit fresh fixes, but a foreground/capture restart requires a new explicit sharing grant/review.

The root integration must not expose capture Symbol ownership or a `start` operation through this port. Existing exclusive start/stop serialization is unchanged. Permission prompts may keep recording active, but LiveProvider's independent foreground gate prevents publishing while inactive.

## 3. Consent, local intent and lifecycle

Sending defaults `none`; receiving defaults off. M5B grants only exact-room `precise` consent for15 or60minutes, capped by room expiry. It adds **no coarse friends-location directory**. General friends sharing remains a later separately reviewed scope with coarse (~100m) cells and independent consent; M5B must not approximate it by granting precise convoy location to every friend or by treating ordinary online status as location consent.

```ts
type LivePolicy = Readonly<{
  scope:AuthScope; signedIn:boolean; hydrated:boolean; foreground:boolean;
  online:boolean; ghost:boolean; closed:boolean;
  receiveEnabled:boolean; mapFocused:boolean;
}>;
type LocalShareIntent = Readonly<{
  armedGeneration:number; captureId:string; leaseId:string;
  consentRevision:number; memberGeneration:number; topicGeneration:number;
}>;
```

`armedGeneration` is memory-only, created by a current explicit disclosure action. Durable grant ACK proves an old control action; it does not create this local intent after restart, background, pause, off, signout or deletion. Restored grant/join/link-request intents recover receipts first; absent receipt requires review. Unknown result keeps the exact immutable control operation, never a changed UUID/request. Only typed fixed-envelope rejection plus exact statusnull permits retirement. Root's durable controls follow M5A flush-before-egress and ACK-removal-before-refresh ordering.

The sender requires exact current signed/hydrated owner, foreground+visible document, online, non-ghost account, successfully active same capture, accepted active nonexpired room, fresh canonical topic/member/consent/lease/capture and an armed local intent. Sending can continue during another foreground tab while the same explicitly started ride records; show a persistent sharing indicator. Screen focus gates disclosure mutations and receiving, not an accidental second capture. The receiving toggle does not start GPS, imply own consent or require own non-ghost mode.

| Boundary | Immediate local action | Server/control recovery |
| --- | --- | --- |
| Pause/stop/GPS error/storage error/capture limit | Disarm; clear candidate; advance send/read epochs; stop interpolation. | Best-effort exact revoke while allowed. Resume needs active new capture and explicit disclosure; ordinary recording remains independent. |
| App inactive/background, screen lock, web hidden, unmount | Disarm synchronously; cancel timers/subscriptions; clear peers and source slot. | Host stops45s lease renewal; prepare a durable revoke/cancel intent when owner storage is readable, but do not start new network egress while background. On foreground, first recover controls/canonical room. Show expired/cancelled honestly and require new review. |
| Receive off / map blur | Hide all peer layers immediately; invalidate read generation and pending callbacks; no coordinate poll or interpolation. | No own grant mutation needed. Room control can refresh when lobby focuses; location reads remain off. |
| Ghost/off/leave/block/remove intent | Quarantine relevant peers and disarm before awaiting durable enqueue/network. | Unknown prior grant is recovered and resolved before an exact revoke can be authored. No old ACK may clear the newer off latch. Failed server revocation is visibly pending; application cannot recall already delivered coordinates. |
| Topic rotation/membership generation changed | Invalidate all current reads/candidates/interpolation; hide old-epoch peers. | Fresh authorized room read supplies new topic. Rebind only still-valid unchanged local grant/capture intent after canonical confirmation; expired/revoked/new consent never arms itself. |
| Network/socket loss or token renewal | Drop publish candidate; stop sending; retire old socket callbacks and clear authorization freshness. | Scope-pinned JWT/new socket; recover room/consent before using the next actual fix. A short interruption during the continuously foreground same active capture may retain local armed intent only for the identical still-unexpired canonical grant. Background/pause/capture restart/expiry still requires explicit review. No old samples drain and no new permission is inferred. |
| Account A→B→A or account closure | Exact AuthScope generation fence; close sender/reader/channel/secret-store owner first; clear all in-memory positions. | Late old ACK can finish only an allowed initiating-owner durable cleanup. It cannot reopen closed owner, import other owner's outbox or recreate secrets. |

If background captures stop as currently implemented, do not claim background convoy tracking. A nonhost foreground interruption needs explicit regrant on its resumed capture. A host that stays away past its lease cannot resurrect the old room; room expiry is authoritative.

## 4. Proposed pure feature exports and control port

Keep source under `features/live/`; do not extend frozen M5A request unions. Imported DTOs `LiveRequest`, `LiveResult`, `LiveReceipt`, `LiveMutation`, `ConvoySnapshot`, `LiveSample`, `PeerPosition`, `ConvoyEvent` and all exact snake_case RPC shapes match the backend contract. Proposed exported decoder/freezer names:

```ts
freezeLiveRequest(value:unknown):LiveRequest;
parseLiveOperations(value:unknown):StoredLiveOperation[];
validateLiveReceipt(value:unknown, ownerId:string,
  operation:StoredLiveOperation):LiveReceipt;
validateLiveMutation(value:unknown, ownerId:string,
  operation:StoredLiveOperation):LiveMutation;
validateConvoySnapshot(value:unknown, ownerId:string,
  convoyId:string):ConvoySnapshot|null;
validateConvoyPositions(value:unknown, ownerId:string,
  room:ConvoySnapshot):ConvoyPositions;
validateLivePublishAck(value:unknown, ownerId:string,
  sample:LiveSample):LivePublishAck;
validateConvoyEvent(value:unknown, room:ConvoySnapshot):ConvoyEvent|null;
```

All validation checks exact known keys, bounded nullable fields, owner/ID/generation/receipt request-result identity, UTC instant precision, no duplicate members/peers, requested/member role visibility, safe immutable M4 snapshot and no own peer duplicate. Applicant sees host+self, no topic and effective none consent; terminal room reader is only host/still-accepted current authorized member, never left/removed/requested member. `self_code:{generation,hash,expires_at}|null` appears only for the current host of a nonterminal room; member/applicant/terminal snapshots have null. A parsed position is `authority:'unverified_live'`. Position output and sender flags cannot become verified-rank evidence.

```ts
type StoredLiveOperation = Readonly<{
  operationId:string; request:LiveRequest;
  queuedAt:string; lastError:LiveErrorCode|'LIVE_INVALID_RESPONSE'|null;
}>;
type LiveControlState = Readonly<{
  operations:readonly StoredLiveOperation[];
  latest:LiveReceipt|null; error:LiveErrorCode|null;
}>;
interface LiveControlPort {
  ownerId:string;
  current():boolean; // owner/closure guard for durable ACK work
  eligible():boolean; // foreground/hydrated/signed network gate
  read():LiveControlState;
  update(reducer:(fresh:LiveControlState)=>LiveControlState):Promise<void>;
  flush():Promise<void>;
  send(operation:StoredLiveOperation):Promise<LiveMutation>;
  status(operationId:string):Promise<LiveReceipt|null>;
  refresh(receipt:LiveReceipt):Promise<void>;
  operationId():string;
}
class LiveCoordinator {
  constructor(port:LiveControlPort);
  enqueue(request:LiveRequest):Promise<string|null>;
  retry(reviewedOperationId?:string):Promise<void>;
  suspend():void; // clear ephemeral review/first-attempt authority, not pending rows
  close():void;
}
```

**RestoreRule:** no `reviewRequired:false` authorization flag is stored or trusted. `parseLiveOperations` validates only immutable request/ID, UTC queuedAt and bounded lastError. Coordinator owns memory-only reviewed/first-attempt ID sets; a freshly enqueued current foreground request can make its first attempt after durable flush. Every newly constructed/hydrated coordinator treats pending `location_grant`, `convoy_join` and `friend_link_request` as restored: status recovery first; if exact receipt is absent, expose its ID in `reviewRequired:string[]` and do not resend until `retry(exactReviewedId)`. Background/inactive/suspend clears those ephemeral sets without discarding pending rows. A caller cannot bypass review by editing stored JSON. Other controls retain normal exact status/CAS recovery. This matches M5A's separation of immutable stored operations from ephemeral explicit-review authority.

`enqueue` freezes and durably writes, then attempts eligible current work, returning the durable ID; UI reports pending versus confirmed from current outbox/latest state. Queued reducers always use fresh owner data. `retry` flushes first; restored enable-sensitive operation may perform status recovery but cannot resend without exact reviewed ID. Other independent lanes can progress while one restored proof/grant needs review. Valid held ACK still persists across background, but its canonical refresh skips background and never re-enables local intent; foreground read starts a fresh generation. Unknown status/SDK failure preserves operation unchanged. Use recognized fixed envelopes only, not raw Error.message classification. Owner read failure fences mutations and retry re-reads storage rather than writing an empty outbox.

Secret port is separate from ordinary JSON: raw token/code versions keyed owner/resource/hash, bounded count, close/removeOwner fence and secure-write-before-control-egress. Keep current and pending code versions until canonical host `self_code.hash` proves replacement; a pending rotation must not overwrite the presently valid raw code. Receipt replay cannot display an obsolete code after another device rotates it. Native uses SecureStore. Web preview must explicitly declare its supported secret persistence; Expo native SecureStore support is not proof of a web store. A server-side link/code hash cannot restore plaintext after a missing local secret; show replacement/revoke flow rather than a fabricated QR/code.

## 5. Non-durable sender and reader contracts

```ts
type LivePublishAck = Readonly<{
  owner_id:string; convoy_id:string; lease_id:string; sequence:number;
  received_at:string; expires_at:string;
}>;
type ConvoyPositions = Readonly<{
  owner_id:string; convoy_id:string; server_now:string;
  topic_generation:number; change_revision:number;
  items:readonly PeerPosition[];
}>;
type LiveErrorEnvelope = {error:{code:LiveErrorCode}};
type LivePublishMutation = LivePublishAck|LiveErrorEnvelope;
type ConvoyPositionMutation = ConvoyPositions|LiveErrorEnvelope;
type AuthorizedPeer = Readonly<{
  position:PeerPosition; expiresMonotonicMs:number;
}>;
type AuthorizedPeerFrame = Readonly<{
  scope:AuthScope; convoyId:string; topicGeneration:number;
  changeRevision:number; clock:LiveClock; roomExpiresAt:string;
  hostLeaseUntil:string; peers:readonly AuthorizedPeer[];
}>;
type LiveSenderBinding = Readonly<{
  scope:AuthScope; room:ConvoySnapshot; roomClock:LiveClock;
  capture:LiveCaptureBinding; intent:LocalShareIntent;
}>;
interface LivePositionPort {
  monotonicNow():number;
  wallNow():number;
  policy():LivePolicy;
  current(binding:LiveSenderBinding):boolean;
  publish(sample:LiveSample):Promise<LivePublishMutation>;
  read(room:ConvoySnapshot):Promise<ConvoyPositionMutation>;
  refreshRoom(convoyId:string):Promise<ConvoySnapshot|null>;
  onPeers(value:AuthorizedPeerFrame|null):void;
  onError(code:LiveErrorCode|'LIVE_INVALID_RESPONSE'|'LIVE_CLOCK_UNCERTAIN'):void;
}
class LivePositionCoordinator {
  constructor(port:LivePositionPort);
  bind(binding:LiveSenderBinding|null):void;
  accept(event:LiveCaptureEvent):void;
  tick():Promise<void>; // at most one publish and one read at their own1Hz gates
  invalidation(event:unknown):void; // GPS-free hint, never coordinates
  setReceive(room:ConvoySnapshot|null, enabled:boolean, focused:boolean,
    roomClock:LiveClock|null):void;
  suspend():void; // synchronous epoch/candidate/peer clear
  close():void;
}
```

`AuthorizedPeerFrame` contains the exact owner/room/topic generation, server anchor, current authorized peers and rendering expiry. It is memory-only. Sender and reader maintain independent in-flight promises and epochs; a slow publication must not block TTL expiry or a current authorized read. A synchronous port throw is normalized within the same promise boundary as rejection, so void refresh/timer calls never leak an unhandled rejection.

`roomClock` comes only from a canonical room RPC's captured request-start/adoption monotonic times. Rebinding or rendering must not create a fresh anchor for an old `room.server_now`. Missing, mismatched or rewinding anchors suspend; an expired room/host/own-consent bound does not authorize further sends or reads. `getFrame()` exposes the current memory-only renderer frame and `getNextExpiry()` its absolute monotonic deadline.

Sender slot holds at most the newest eligible actual fix. At send time recheck exact binding, policy and monotonic age; no original fix older than3s, original timestamp future tolerance per backend, finite coordinates, positive accuracy≤20m, known mock/simulated rejection and nullable source flags preserved. Existing journal acceptance allows zero accuracy; live publication requires positive accuracy, so it adds that explicit egress check. Client clock failure is visible; do not rewrite `captured_at` to send time or a server estimate. `source.platform` records client adapter provenance, not attestation.

Use wire sequence1..2147483647 **per lease**, independent of journal zero-based seq. A canonical snapshot exposes `self_consent.last_sequence`; bind/rebind keeps the greater of that floor and the current lease's locally allocated sequence. Topic rotation, TTL point deletion and a read response do not reset an unchanged lease. Allocate once immediately before each actual send; never reuse a timed-out sequence for a different sample. One in-flight publish; fixes arriving while it waits replace the memory slot. After success/error, next attempt uses a newly received still-current fix and next sequence; no retry of the old body after response loss. Server duplicate recovery is defensiveness, not a client position outbox. Old epoch response is discarded even if the server legitimately accepted it before revocation. Sequence exhaustion disarms and requests explicit new lease; it does not reset under the same lease.

Reader coalesces invalidations and poll requests to≤1Hz, with one current-generation in-flight read. Broadcast payload contains only exact schema/room/topic/change revision/kind; unexpected fields or another epoch are ignored. A retired-topic `room_changed` hint is a request to clear peers/refetch, never an authorization renewal. The visible opted-in map polls1Hz to repair dropped hints; no coordinate polling while map hidden, receive off, background or account not hydrated. Control room refresh and host15s heartbeat are separate. Host heartbeat never survives foreground loss; server lease cannot be inferred from local presence70s status.

Every read response binds owner/room/current topic, peers accepted in the canonical member set, increasing identity/sequence, exact server expiry and source authority. Discard stale held responses after receive off, prune/block, rotation, scope change, clock discontinuity or new read generation. Invalidate before coalescing: no pre-change promise may be adopted after a revocation boundary. Network/authorization/changed-room failure clears displayed peers instead of claiming an expired cache is current. Throttle/rate errors back off; no rapid repeated rejected poll loop. No positions in AsyncStorage/account JSON, Query durable cache, Redux/Zustand persistence, analytics, logs or crash breadcrumbs.

## 6. Scoped transport and server-clock expiry

Proposed service signatures take captured `AuthScope` and `Session`, use existing `accountClient(scope,session)` with fixed JWT and check scope before/after each request:

```ts
mutateLive(scope:AuthScope,session:Session,op:StoredLiveOperation):Promise<LiveMutation>;
getLiveOperation(scope:AuthScope,session:Session,operationId:string):Promise<LiveReceipt|null>;
getConvoy(scope:AuthScope,session:Session,convoyId:string):Promise<ConvoySnapshot|null>;
listConvoys(scope:AuthScope,session:Session):Promise<ConvoyList>;
heartbeatConvoy(scope:AuthScope,session:Session,room:ConvoySnapshot):Promise<ConvoyHeartbeat>;
publishLivePosition(scope:AuthScope,session:Session,sample:LiveSample):Promise<LivePublishMutation>;
getConvoyPositions(scope:AuthScope,session:Session,room:ConvoySnapshot):Promise<ConvoyPositionMutation>;
```

Realtime uses its own captured token client with `private:true` and exact current unpredictable room topic. Register only `broadcast` event `convoy`; no Presence.track, Postgres Changes, HTTP/client Broadcast, raw GPS or client INSERT. Dispose old scoped sockets on token/scope/room epoch change and ignore their delayed callbacks even if removal fails. Cached channel authorization remains a server reality; fresh authorized RPCs supply positions. [Supabase authorization](https://supabase.com/docs/guides/realtime/authorization), [Broadcast retention](https://supabase.com/docs/guides/realtime/broadcast).

```ts
type LiveClock = Readonly<{
  serverTimeMs:number; requestStartMonotonicMs:number;
  adoptedMonotonicMs:number;
}>;
liveClock(serverNow:string,requestStartMono:number,adoptedMono:number):LiveClock;
estimatedLiveServerNow(clock:LiveClock,mono:number):number|null;
freshConvoyPeers(frame:AuthorizedPeerFrame,mono:number):readonly PeerPosition[];
nextLiveExpiry(frame:AuthorizedPeerFrame,mono:number):number|null;
```

Clock uses response `server_now` anchored conservatively to **request start**, never to completion of another slower bucket. Rendering uses monotonic now≥adoption; elapsed request/network time consumes expiry rather than extending it. Reject negative/NaN/rewinding anchors; clear positions until fresh canonical read. `Date.now()` wall changes cannot renew markers; it remains only the original source timestamp freshness check. Store server anchors only in memory. A single nearest-expiry timer clears peers at the bound even if a read hangs or events stop; no per-frame React clock updates.

Each rendered expiry is min(peer15s bound, room lifetime, current host lease), and the server must cap PeerPosition.expires_at by sender consent expiry as well because the DTO has no sender consent-expiry field. A decoded expiry beyond these bounds is invalid. Current canonical room read is required before an expired host lease can be extended locally; a heartbeat response for the correct current host/room can update that bound after validation. No late response may resurrect an expired frame. These conservative clocks are for privacy/freshness, **not** the M5C≤300ms countdown synchronization or server timing proof.

## 7. Map presenter and smooth motion without false evidence

Keep MapSurface provider/authorization independent. Up to three other convoy peers are already small; current general peer source clustering stays available for the future50-marker case. Keep the immutable M4 route segments and private capture fragments separate; never connect convoy points into a history polyline or bridge recorded gaps. Friend online counts remain M5A status and do not fabricate a marker.

Proposed presentation boundary:

```ts
type PeerRenderKey = Readonly<{
  userId:string; memberGeneration:number; consentRevision:number;
  topicGeneration:number; sequence:number;
}>;
type PeerMotion = Readonly<{
  key:PeerRenderKey; from:MapCoordinate; to:MapCoordinate;
  startMonotonicMs:number; durationMs:number; expiresMonotonicMs:number;
}>;
createPeerMotion(previous:AuthorizedPeer|null,current:AuthorizedPeer,
  mono:number,reducedMotion:boolean):PeerMotion;
samplePeerMotion(value:PeerMotion,mono:number):MapCoordinate|null;
interface LiveMapPresenter {
  replace(frame:AuthorizedPeerFrame|null):void; // event-frequency/shared values
  clear(epoch:number):void; // immediately hide all peers and cancel animations
}
```

Interpolate only between two fresh same-owner/member/consent/topic authorized fixes; a generation gap or unexpected jump snaps/hides, never animates a long invented trip. Clamp progress0..1 and duration≤1000ms; shortest antimeridian longitude path; no spring overshoot or extrapolation beyond newest fix. Expiry/off/rotation cancels animation and hides immediately. Reduce Motion uses the new actual point without animated movement. Interpolated coordinates are display-only and cannot feed live send, journal, recorded route, checkpoints, evidence or ranks.

Current MapLibre RN11.4 `AnimatedPoint.timing/spring` hardcodes `useNativeDriver:false`; `LayerAnnotation animated` therefore does **not** demonstrate UI-thread motion. Installed Marker/ViewAnnotation expose `getAnimatableRef()` for Reanimated4; both platform codegen components declare `lngLat:[longitude,latitude]`. Candidate adapter: `Reanimated.createAnimatedComponent(MapLibre.Marker)` plus `useAnimatedProps` for that tuple, avoiding map projection callbacks for each frame. It still needs actual installed-bridge tests and paired iOS/Android device validation; codegen declarations alone do not prove worklet-driven native coordinate updates. No new per-frame setState, JS GeoJSON rewrites or asynchronous map.project bridge call every frame. Root/UI can choose that tested native marker adapter or shared-value overlay with valid camera projection; camera movement must keep it aligned or suspend the overlay while projection is unknown.

For web, a renderer-frame DOM Marker/projection adapter can animate at display refresh without React rerenders; test camera pan/zoom and epoch clearing against the installed MapLibre SDK. Native MapSurface currently has only region transition callbacks, so a camera-overlay strategy cannot silently claim continuous per-frame native camera tracking. Reanimated screen-space transforms alone are not correct if the map moves under an obsolete projection.

Existing web GeoJSONUpdateQueue coalesces worker writes. Passing `peers=[]` may wait behind an already-issued worker operation. Therefore **privacy clear also hides peer layers/markers synchronously and advances renderer epoch**; an old worker callback cannot make them visible again. Delayed cluster/marker selections validate latest epoch/key. Test the actual map adapter with a held worker update and receive-off/rotation; do not rely on pure array filtering alone. Smoothness60fps/120Hz and battery/memory remain actual-device measurement gates.

## 8. Backend lock review and pilot safeguards

The proposed pilot-wide account→`live_control_lock` protocol is coherent **if every relevant entry joins it before lower locks and no holder acquires another account fence**. This agent independently read001/002/007:007 `rs_social_mutate` bypasses actor() with direct account_lock;002 update preferences takes account-state rows then calls presence; deletion begin/purge are service direct account locks. Wrapping only actor(), pair_lock or row triggers is insufficient.

Backend section7 now includes predecessor wrappers for social mutation, legacy friend/presence, account preferences, deletion and heartbeat (heartbeat also holds profile+friend rows). Preserve retired007 authenticated write grants and internal/service semantics. Nested calls must reenter an already-held own account/global lock, never wait for global after acquiring a new profile/pair/row lock. Read/plain MVCC helpers that do not acquire global later need not be serialized gratuitously; audit actual bodies, not just function names.

Important existing exception:002 `can_upload_evidence` acquires owner+creator account fences in sorted UUID order before storage/evidence checks. New room/control code must never invoke it under global while taking another owner account lock. Ordinary existing uploads/profile/avatar/garage/routes do not call new room helpers later. Service janitor holds global first and cannot acquire account locks; deletion paths use owner account→global and must not wait on a janitor-held global while already holding profile/room rows. Room creation's route share lock is safe only while route writers cannot call global after holding that route row.

Review exact current nested calls in the new wrapper graph and ensure serialization covers friendship changes/block/ghost/deletion before they touch membership/positions. Topic rotation and stale rows clear atomically; replayed control ACK is an acknowledgement only. No raw GPS event escapes on an old topic. Two rooms cap normal participants, not concurrent devices/malicious retained sockets or2million monthly messages. With four recipients a room hint estimates five messages (18,000/hour); existing organization usage, cached sockets, separate status traffic and nonmatching calendar/provider billing windows still require conservative service policy and dashboard observation. [Free limits](https://supabase.com/docs/guides/realtime/limits), [message quota](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages).

Live policy starts disabled. Before enabling: actual bounded minute janitor and retention, private-channel setting, admission budgets and real PostgreSQL multi-connection lock tests. One-connection PGlite behavioral tests cannot prove no deadlock. No extra keys/accounts are needed for ordinary foreground convoy; actual scanner native build and second consenting account/device remain acceptance inputs. Do not manufacture participants or enable live while these gates are unverified.

## 9. Meaningful test matrix and implementation split

| Ownership / tests | Required concrete evidence |
| --- | --- |
| Root passive bus/provider | Actual RideProvider/hook harness: one native/Expo capture; startup samples recorded but not sent; future accepted actual fix carries exact UUID/seq; rejected/zero-accuracy/old/known-mock unavailable; idle locate/snapshot tick/restored journal never emits; pause/deletion invalidates before held cleanup; storage failure stops sharing; A→B→A and old listener cannot publish. |
| Pure position coordinator | Fake monotonic clock+held network: one in-flight/replace latest; fresh next sample after response loss; no old-body retry/offline queue; lease sequence and overflow, preserved floor after point deletion/topic rotation/unknown ACK; same/changed epoch; grant ACK after newer off never arms; stale read after prune/BG/off/rotation ignored; sync port throw contained; rejected read backs off while expiry still fires. |
| Real SDK transport | Captured JWT and exact RPC args; source nulls/actual timestamp preserved; forbidden extra fields rejected; membership/consent/capture/owner/ACK/epoch mismatch; no `.channel().send`, Presence or Postgres Changes GPS transport; socket token renewal/disposal failure cannot adopt old callback. |
| Clock + presenter | Request-start anchor with slow unrelated request; wall jump and monotonic rewind; exact15s/consent/host expiry; no late frame resurrection; shortest antimeridian bounded interpolation; Reduce Motion; generation/jump snaps; interpolated point never calls sender/journal; actual held web worker cannot restore hidden peers. |
| Durable controls/secrets | Same UUID/request after lost ACK; storage flush/read/removal failure; restored enable-sensitive proof review; explicit grant followed by pending revoke; owner closure before delayed SecureStore read/write; current code survives pending rotation; canonical hash chooses version and old receipt cannot restore obsolete code; no plaintext secret/GPS in account outbox; missing secret truthful replacement flow. |
| Backend + actual PostgreSQL | Simultaneous last slot/join; publish/read versus block/remove/ghost/prefs/consent/host lease/deletion; opposite-owner QR request/handle rename; janitor versus deletion; no lock cycle, rejected failed probes consume committed admission, no acknowledged point after revoke commit and no post-quarantine reads. |
| Installed two-account/native acceptance | Actual QR/request/accept/code/host approval/explicit disclose; map position without external handoff; sender pause/BG/inactive/permission/revoke/ghost/block and receive-off;15s hide even network stalled; correct Thai/English/error/glance states; measured capture/read latency and60fps/battery/30min memory. No actual account deletion needed for QA. |

Pure agent owns typed live model, durable-control coordinator, ephemeral-position coordinator, service/clock/interpolation math and executable tests after freeze. Root owns `features/live/captureTypes.ts`, `CaptureBus.ts`, RideProvider/hook bus integration, LiveProvider/auth/storage/SecureStore/deletion/foreground wiring. UI agent owns QR/code/lobby/disclosure/screens, map presentation and localized errors. Backend owns additive008/wrappers/exact wire/authorization/admission/cleanup/real PG concurrency. Root controls hosted enablement and native QA; none of these source tests is evidence that a production two-device convoy,120Hz motion or background tracking has already passed.

### Approved lost-grant cancellation amendment

An unknown grant must not block off forever, and a status-null answer is not proof that an earlier request cannot still apply. `rs_cancel_live_grant(p_operation,p_request)` accepts the exact original owned immutable `location_grant` and returns its applied `LiveReceipt`, fixed error envelope, or `{owner_id,operation_id,request,state:'cancelled',cancelled_at}`. Account→global locking linearizes cancellation with the original grant. The owner/request-bound server tombstone makes a delayed exact original mutation return `LIVE_OPERATION_CANCELLED` before admission; altered request remains conflict. Cancellation retry returns the same proof without granting anything.

`LiveControlPort.cancelGrant(operation)` and `LiveCoordinator.cancelGrant(operationId):Promise<boolean>` preserve the original durable row until a validated applied receipt or cancellation proof is durably settled. This operation can fence an already-held grant request and never re-reviews its obsolete capture. Errors, unknown replies, status-null and disk failure retain that exact row. `true` means durable settlement only; an applied grant receipt does not arm local sharing. Off first clears local intent, cancels pending grants, then reads fresh canonical consent and queues a revoke with those exact member/revision/lease expectations. Generic SQL/transport errors never masquerade as cancellation proof.
