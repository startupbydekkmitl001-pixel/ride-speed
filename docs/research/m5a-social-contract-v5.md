# M5A: compatible friends and invitations

Approved contract, 1 October 2026; M4 gate opened at5395eb7 and M5A implementation is in progress. Backend review agrees with the minimal split below. This stage provides real `/friends` and `/challenges` navigation, typed existing friends/status/blocked/invitation flows and durable response-loss recovery. No live GPS, new global Realtime channel, convoy, route-time metric or push credential setup belongs in M5A.

M4 compatibility work now uses `getRouteOwner`, `getRouteProjection`, `sharePreview` and `parseShareSnapshot` in Challenges. Reuse it. The earlier audit's raw-stop finding describes the reader before that in-progress fix; it is not a request to redo the fixed M4 slice.

## Existing constraints to preserve

| Source | Required behavior |
| --- | --- |
| foundation `rs_request_friend` | Actor JWT; exact lowercase trimmed handle; generic unavailable for absent/self/blocked; pair advisory lock; already accepted/pending is a no-op; request after decline/remove/cancel waits24h. Existing successful lookup quota40/UTC day. Failed SQL exceptions roll back quota; not an abuse budget for failed probes. |
| `rs_my_friends` | Pending/accepted only, own pair, either-direction block excluded; response includes relationship `generation` currently omitted by client type. Incoming means another user requested. |
| `rs_friend_action` | Accept/decline only recipient; cancel only requester; remove accepted; block both-direction visibility; own unblock deletes own block only. Meaningful transitions increment generation and rotate presence topic; unblock restores nothing. |
|002 account/presence | Active-account fence and fixed actor account lock; `rs_set_presence` keeps profile opt-in and inverted `ghost_mode` coherent with account revision. No presence grant without a completed profile in new social writes; self read reports `profile_ready:false`. Status opt-in never authorizes GPS. |
| foundation heartbeat/presence | Foreground30s heartbeat; server20s throttle and70s expiry; server-origin trusted online status on private opaque pair Broadcast topics. No client INSERT/presence track/GPS. |
|006 creator + legacy challenge invite | Exact saved own route revision, safe immutable trimmed snapshot; actor profile; accepted friend/current generation; create quota20/UTC day; future start, end>start, maximum24h window. Group mode has null course session and metricnone. Timed mode requires approved closed course, exact approved route revision and approved session covering the window; metricsustained_speed_3s. At most11 stored members incl creator. |
| challenge action | Participant accepts/declines/withdraws own current-generation invitation, before starts while open/current friendship; creator can cancel. Accept invited/accepted, decline invited/declined, withdraw accepted/withdrawn; no state transition from withdrawn to accepted. Removal/re-add does not revive invitation. |
|002 deletion | New receipt reads/writes require active actor; quarantine cancels own challenges/withdraws membership and rotates friend topics. Extend deliberate purge for new receipts/block tokens/read metadata without changing deleted receipt recovery. |

New M5 clients mutate only through the new wrapper; do not mix legacy/new writes for one user action. New wrappers acquire the same locks and call/reuse the proven transition semantics; narrow grants, no direct table writes. Root approved revoking authenticated direct grants on the six legacy social writes after client migration, preventing bypass of outer failed-probe admission. Internal account/privacy calls and trusted service compatibility remain; current heartbeat/read grants stay. Older app binaries must update to the new mutation path.

## Frozen candidate wire

Requests contain no owner ID. Responses echo actor owner for decoder/scoping checks; JWT remains the authority. UUIDs, int32 generation/revision, UTC instants and extra fields are strictly validated. Handle is `[a-z0-9_]{3,24}` after trim/lowercase; UI may remove one leading@ before freezing. display_name≤40 Unicode codepoints. All pages cap30 and preserve PostgreSQL timestamp precision in cursors.

```ts
type FriendRow = {
 user_id:string; handle:string; display_name:string;
 state:'pending'|'accepted'; direction:'incoming'|'outgoing';
 generation:number; updated_at:string;
};
type StatusRow = {user_id:string; topic:string; online:boolean; expires_at:string|null};
type SocialPage = {
 owner_id:string; server_now:string;
 self:{profile_ready:boolean; presence_opt_in:boolean; account_revision:number};
 items:FriendRow[]; statuses:StatusRow[];
 next_cursor:{updated_at:string;user_id:string}|null;
};
type BlockedPage = {
 owner_id:string; items:{user_id:string;handle:string;display_name:string;block_token:string}[];
 next_cursor:{user_id:string}|null;
};
type SafeRouteSnapshot = { // same immutable stored006 snapshot/compatibility parser
 route_id:string; revision:number; title:string; category:RouteCategory;
 segments:Coordinate[][]; geometryStatus:'trimmed'|'hidden'; privacyTrimMeters:200;
 geometryHash:string|null; provider:'geoapify'|'recorded'|'draft'; attribution:string|null;
};
type InvitationRow = {
 id:string; creator_id:string; creator_name:string|null;
 route_summary:{title:string;revision:number;category:RouteCategory}|null;
 route_snapshot:SafeRouteSnapshot|null; // historical redacted metadata cannot accept
 mode:'group_ride'|'timed_race'; metric:'none'|'sustained_speed_3s';
 course_session_id:string|null; starts_at:string; ends_at:string;
 state:'open'|'cancelled'; created_at:string;
 member:{state:'invited'|'accepted'|'declined'|'withdrawn';friendship_generation:number|null}|null;
 can_cancel:boolean;
};
type InvitationPage = {
 owner_id:string; server_now:string; items:InvitationRow[];
 next_cursor:{created_at:string;id:string}|null;
};
```

`rs_social_snapshot(p_limit,p_before,p_before_user)` returns SocialPage. Statuses contain only accepted IDs returned in that page; no arbitrary user-ID status lookup. False/expired online means expires_atnull. Client's received list is validated for duplicate IDs, own ID, mismatched status membership and topic format. Paginate own known friends; arbitrary prefix profile search is excluded. `rs_blocked_people(p_limit,p_before_user)` returns only own blocks; add a server UUID `block_token` default per inserted block so an old unblock cannot undo a later re-block. Legacy block INSERT uses the default; existing rows receive tokens. `rs_invitation_inbox(p_limit,p_before,p_before_id)` returns participant-authorized minimal invitation rows; no unrelated member directory. Creator names only through current allowed profile summary; unavailable/deleted names become null. Use current safe stored snapshots; invalid/historical geometry is null and acceptance disabled, no raw-pin fallback.

```ts
type SocialRequest = {schema_version:1} & (
 | {action:'request_friend';handle:string}
 | {action:'friend_action';other_id:string;verb:'accept'|'decline'|'cancel'|'remove'|'block';
    expected_generation:number|null}
 | {action:'unblock';other_id:string;block_token:string}
 | {action:'set_presence';enabled:boolean;expected_account_revision:number}
 | {action:'create_invitation';challenge_id:string;route_id:string;route_revision:number;
    reviewed_geometry_hash:string|null;mode:'group_ride'|'timed_race';session_id:string|null;
    starts_at:string;ends_at:string;recipient_id:string;friendship_generation:number}
 | {action:'invitation_action';challenge_id:string;verb:'accept'|'decline'|'withdraw'|'cancel';
    expected_member_state:'invited'|'accepted'|'declined'|'withdrawn'|null;
    friendship_generation:number|null}
);
type SocialOperation = {operationId:string;request:SocialRequest}; // client shape
type SocialReceipt = {
 owner_id:string;operation_id:string;request:SocialRequest;applied_at:string;
 result:
  | {kind:'friend';user_id:string;state:'incoming'|'outgoing'|'accepted'|'declined'|'cancelled'|'removed'|'blocked';generation:number|null}
  | {kind:'unblock';user_id:string;state:'unblocked'}
  | {kind:'presence';enabled:boolean;account_revision:number}
  | {kind:'invitation';challenge_id:string;state:'open'|'accepted'|'declined'|'withdrawn'|'cancelled'};
};
type SocialErrorCode =
 | 'SOCIAL_INVALID'|'SOCIAL_TOO_LARGE'|'SOCIAL_OPERATION_CONFLICT'
 | 'SOCIAL_UNAVAILABLE'|'SOCIAL_RATE_LIMITED'|'SOCIAL_AUTH_REQUIRED'
 | 'PROFILE_REQUIRED'|'FRIEND_CHANGED'|'BLOCK_CHANGED'|'PRESENCE_CHANGED'
 | 'INVITATION_CHANGED'|'INVITATION_UNAVAILABLE'|'ACCOUNT_DELETION_PENDING';
type SocialMutationResponse = SocialReceipt | {error:{code:SocialErrorCode}};
```

`rs_social_mutate(p_operation UUID,p_request jsonb)` returns SocialMutationResponse. `rs_social_operation(p_operation)` returns owner receipt/null. Store exact normalized request + original result/receipt atomically, closed private table keyedowner+operation. Echoed request lets the client validate every argument, not merely UUID; no platform-specific JSONB hash convention is required. Replay is checked before current state/window/quota and never reapplies. Result kind/ID/enum must match request; never apply original receipt as the current friends/status state—refresh canonical pages after ACK. Changed UUID content returnsSOCIAL_OPERATION_CONFLICT. Receipt lookup does not create missing state or consume mutation quota.

The fixed error envelope is intentional: a rejected exact-handle probe still consumes a bounded, committed admission budget. After active-actor checks, bounded request normalization and exact receipt replay lookup, admit the request outside an inner PostgreSQL `BEGIN … EXCEPTION` block. Call the legacy transition helper and write successful receipts inside that subtransaction. Catch only recognized business rejection codes and return the typed envelope so helper writes roll back while admission survives. Raising the rejection through the outer transaction would roll back the probe budget and permit unlimited failures. Never expose SQL messages/details, return arbitrary codes, or convert unrecognized SQL failures into definitive business rejection; unexpected failures remain transport uncertainty. Invalid/auth-inactive requests need no successful relationship mutation, and admission itself remains bounded. The client decodes only the fixed envelope, scopes the response to its captured actor/request, and confirms exact receipt absence before retiring a definitively rejected operation. A receipt response and an error response cannot be combined. This budget complements the existing40-success/day quota; it does not replace it.

Friend expected_generationnull is permitted only for blocking when no pair exists; any changed/nonmatching pair rejectsFRIEND_CHANGED. Unblock requires exact current own block_token. Presence uses account revision CAS while preserving current onboarding/location fields; a successful receipt contains resulting account revision and explicit enabled flag. Presence retry after another setting changes does not silently overwrite that setting.

`create_invitation` is one transaction: validate exact accepted friend_generation, saved route_revision and reviewed safe projection hash (including legitimate hidden/null hash), mode/course/session/window; create immutable challenge and invite the one reviewed recipient; save receipt. UUID collision is unavailable/conflict, not adoption of an unrelated challenge. No partial create followed by a second queued invite. One recipient matches existing UX; multiple recipients can be an explicit later extension. Owner route metadata/approval choices still come from current M4 owner/projection/course readers; route geometry is never in the mutation request. For participant action, pin exact own member state+friendship generation. Cancel requires creator and both expectation fieldsnull; it never grants participant rights. Historical snapshot acceptance failsINVITATION_UNAVAILABLE.

Backend implementation notes: derive request_friend incoming/outgoing/accepted and generation from the fresh locked pair after the legacy helper, not its untyped pending return. Blocked summaries require an owner-only definer query because target profile RLS excludes blocked profiles; they never expose other people's blocks. Keep legacy positional block INSERT compatible or replace it with explicit columns in the additive migration. Presence result reads actual resulting stored account revision, even if enabled did not change. Fresh time validation uses wall clock after locks; timestamp cursor strings retain microseconds. Historical route_summary retains only authorized title/revision/category and never restores discarded geographic fields.

## Pure coordinator and transport boundary

Planned ownership after gate: this agent `features/social/types.ts`, `model.ts`, `SocialCoordinator.ts`, `service.ts` + pure model/coordinator/real-SDK transport tests; root SocialProvider/local persistence/deletion/navigation integration; backend additive migration/RPC/receipt/RLS tests; motion/UI agent extracted Friends/Challenges presentation, bilingual resources and loading/empty/offline/error states. Existing map and ride providers stay untouched by this stage.

```ts
type StoredSocialOperation = SocialOperation & {queuedAt:string;lastError:string|null};
type SocialPort = {
 ownerId:string;
 guard():void; hasSession():boolean;
 read():{socialOperations:StoredSocialOperation[]};
 write(value:Partial<{socialOperations:StoredSocialOperation[]}>):Promise<void>;
 flush():Promise<void>; operationUUID():string; nowISO():string;
 send(operation:SocialOperation):Promise<SocialMutationResponse>;
 status(operationId:string):Promise<SocialReceipt|null>;
 refresh(receipt:SocialReceipt):Promise<void>; // only after validated durable ACK
};
// enqueue(request):Promise<string|null>: durable ID, not a success/grant
// retry(reviewedOperationId?:string):Promise<void>, close(), getSnapshot()/subscribe()
// Snapshot: busy,pending,error,latest:{operationId,status:'applied'|'rejected',error}|null,
// reviewRequired:string[]. No peer GPS; unknown operations have no discard action.
```

Bounds:32 pending requests,128KiB total normalized outbox, no screenshots/GPS/name caches in it. Enqueue detaches/freeze-validates request and persists+flushes before egress. It never optimistically grants friendship or enables presence. Opt-out stops local heartbeat immediately while showing its pending server confirmation; it does not claim the previous70s status lease is already recalled. Guest/offline input is a recoverable editor draft, not a fabricated sent request. State-changing acceptance/unblock/presence enable must be explicitly pressed on a fresh online review; unknown-response retries preserve the same reviewed intent. Before resuming an unapplied handle-only friend request from an older app session, require explicit retry/review because mutable handles can be reassigned; already-applied receipt recovery is safe.

Sequential writes per owner, scope checks before/after every await and queued reducer; no network await holds the storage mutation queue. One network operation at a time, bounded4 pending per retry pass. Status first for restored/unknown pending. If send fails, check exact status once; matching receipt wins, definitive rejection with statusnull retires pending and reports typed error, status failure/ambiguous outcome keeps immutable pending. Forged/mismatched receipts retain pending and reportSOCIAL_INVALID_RESPONSE. Receipt accepted but disk ACK-removal failed retains the same operation and errors; retry flushes/replays receipt before further mutations. New operations queued during network settle survive the ACK reducer. Refresh failure after durable ACK is a read error, not resend/recreate. Scope closure/deletion fences before removing disk data; a late status/send/refresh can neither acknowledge into another owner nor recreate deleted outbox.

Do not automatically discard unknown operations, change request/UUID, send offline queue with a new login token or auto-enable status after sign-in. Definitively unapplied rejected requests retire only after typed server envelope plus exact statusnull; unknown requests stay pending until receipt recovery/review. One conflict does not block unrelated request recovery, but subsequent mutations of the same known target/consent lane remain behind its unresolved operation. Surface pending/retry clearly. Typed errors: SOCIAL_INVALID/TOO_LARGE/OPERATION_CONFLICT/INVALID_RESPONSE/UNAVAILABLE/RATE_LIMITED/AUTH_REQUIRED, PROFILE_REQUIRED, FRIEND_CHANGED, BLOCK_CHANGED, PRESENCE_CHANGED, INVITATION_CHANGED/UNAVAILABLE, ACCOUNT_CHANGED/ACCOUNT_DELETION_PENDING and LOCAL_READ_FAILED/LOCAL_WRITE_FAILED. Backend admission of failed probes is a separate bounded committed budget, not a claim that legacy successful-action quota prevents enumeration.

### Exact implemented exports

`types.ts` exports SocialCursor, BlockedCursor, InvitationCursor, FriendRow, StatusRow, SocialSelf, SocialPage, BlockedPerson, BlockedPage, SafeRouteSnapshot, InvitationRow/Page, SocialRequest/Operation/Receipt/MutationResponse, SocialErrorCode, StoredSocialOperation, SocialLatest, SocialCoordinatorSnapshot and SocialPort. `model.ts` exports freezeSocialRequest/Operation, parseSocialOperations(value,stripCloud=false), validateSocialPage/BlockedPage/InvitationPage(value,ownerId), validateSocialReceipt(value,ownerId,operation), validateSocialOperation(value,ownerId,operationId), validateSocialMutation(value,ownerId,operation) and isSocialInstant. Persisted requests must already be canonical; unreadable pending data is not normalized or silently dropped. Undefined historical outbox meansempty; explicit guest transfer returnsnone and preserves its source recovery copy.

`service.ts` exports getSocialSnapshot/getBlockedPeople/getInvitationInbox(scope,session,limit=30,cursor=null), sendSocialMutation(scope,session,operation), getSocialOperation(scope,session,operationId) and heartbeatSocial(scope,session):Promise<string>. Service validates and returns the fixed mutation union; it performs no hidden status lookup. Thrown transport errors remain uncertain even if an SQL message resembles a business code. Root captures each HTTP operation's JWT and owner guard; a delayed result cannot pick up another account's token.

`presenceModel.ts` exports socialPresenceTopic(value):string|null, validatePresenceEvent(value,expectedUserId):PresenceEvent|null, presenceClock(serverNow,monotonicNowMs):PresenceClock and freshSocialStatuses(rows,clock,monotonicNowMs):StatusRow[]. Expired/invalid-clock status becomesoffline with nullexpiry, using a monotonic server anchor. Trusted Broadcast events are bounded refresh hints, never consent/location authority. Server offline events may contain their actual expiry instant; canonical offline page rows containnull.

Enqueue detaches the reviewed request, durable-writes+flushes it, then awaits one shared bounded retry pass before returning its ID. The ID means the intent was durably queued; current outbox/latest state determines pending/applied/rejected. Newly reviewed requests may attempt immediately; restored handle requests look up their exact receipt and require retry(operationId) if unapplied. All other retry calls are bounded4 intents/pass. `port.refresh(receipt)` is invoked only after durable ACK removal; root refreshes account/onboarding only for presence receipts, then canonical pages. A replayed enable receipt never overrides a newer local off intent.

Approved UI context: ready/loading/profileReady/optedIn/accountRevision, friends/presence/blocked/invitations, per-page loading/error/hasMore, pending/busy/error/latest/reviewRequired; refresh/loadMoreFriends/loadMoreBlocked/loadMoreInvitations, mutate(request):Promise<string|null>, retry(reviewedOperationId?) and setPresence(enabled):Promise<void>. The compatibility setPresence returns success only for an applied ACK, reports a known rejection, or reports SOCIAL_PENDING. Root handles a generic pending-row retry by passing the ID to coordinator only for handle review. Blocked pages load only when explicitly opened. Loading/failed self reads never imply that profile is absent.

## Executable test design and first acceptance

| Slice | Required behavioral evidence |
| --- | --- |
| Pure freezer/decoders | Each valid legacy-compatible action; extra keys rejected; Unicode/handle bounds; wrong result kind/owner/target/request; duplicate/status foreign IDs; false online with nonnull expiry rejected; raw stops rejected; hidden safe snapshot accepted; null historical geometry disables acceptance; cursor precision preserved. |
| Coordinator fake port + durable restart | No egress before storage flush; immutable same operation replay after lost send and restart; exact statusnull versus unknown; failed ACK persistence recovery; queued newer operation retained; refresh failure does not resend; one unresolved lane blocks only that lane; quota/size bound; stale generation/block token/member state/setting revision become explicit errors. |
| Owner lifecycle | A→B→A held hydrate/send/status/ACK callbacks; deletion closes before late write; read failure never writes empty; retry flush first; no current-token pickup in delayed requests; malformed operation on disk fails read without dropping other owners. |
| Real supabase-js transport | Captured JWT header under auth switch, exact RPC names/argument shapes, auth/quota/error mapping, no arbitrary owner/path fields, response-loss status uses same operation and owner. |
| Backend actual PostgreSQL | Same-op collision/replay after friendship removal/re-add, recipient-only transitions, crossed requests, block ABA token, active-account/Auth-only profile gate, statusCAS+ghost consistency, atomic invitation failure rolls back bothrows, exact safe projection hash/revision, closed-course/window/cap limits, operator/deletion fences, grants and RLS. Repeated missing/blocked/cooldown handle probes consume outer admission despite inner rollback; exact replay consumes none; typed recognized rejection contains no raw SQL detail; unknown exceptions are not definitive error envelopes. |
| Navigation/UI + two accounts | Map buttons open existing `/friends` and `/challenges`; incoming request accepts; online status expires/ghost stops; blocked list unblocks without friendship resurrection; real saved M4 route creates a safe reviewed invitation; recipient accept/decline; creator cancel; no dummy users/courses. Both locales, motion/reduced motion and moving edit lock. |

Reuse existing opaque pair subscriptions for M5A, strictly private and scope-specific; subscribed statuses are hints to coalesced snapshot refresh. Bound simultaneously subscribed visible friend topics (≤50) and retain30s foreground refresh for unloaded friends/new requests; no claim of instant delivery for requests without a dedicated inbox channel. Close on background/account switch/deletion and handle channel error as stale status. Friends list paging and manual retry work without push credentials. Review/commit M5A before adding the agreed four-person foreground convoy and later async→live route-time stages.

## Concrete file split after the M4 gate

| Owner | Files / narrow responsibility |
| --- | --- |
| This agent | New `src/features/social/types.ts`, `model.ts`, `SocialCoordinator.ts`, `service.ts`; `presenceModel.ts` only for topic/event/TTL validation, no React/GPS; `tests/socialModel.test.mjs`, `socialCoordinator.test.mjs`, `socialService.test.mjs`, `socialPresence.test.mjs`. Freeze wire before implementation and export owned outbox parser to root. Service captures JWT per HTTP operation; coordinator owns immutable outbox scheduling/receipts only. |
| Root | New `src/state/SocialState.tsx`; make `state/OnlineState.tsx` a thin compatibility facade instead of mounting a second polling/heartbeat provider. `lib/accountLocalStore.ts` adds bounded owner-only social outbox with strict read/guest-transfer policy; `state/AppState.tsx` fresh queued persistence integration as needed. Root owns `app/_layout.tsx`, `app/auth/delete-account.tsx`, `components/AccountGate.tsx`, map badge/lifecycle integration and relevant provider/account-store tests. |
| UI/motion agent | New `src/features/social/FriendsScreen.tsx`, `InvitationsScreen.tsx` and reusable content panels, `app/friends.tsx`, `app/challenges.tsx` route wrappers; adapt `components/Challenges.tsx` and `(tabs)/community.tsx` to share the same panels, no independent mutation logic. Own new `lib/i18n/m5a.ts`; add its resources/error mapping in narrow agreed imports. Current profile/map theme stays owned by root; M4 share components are reused. |
| Backend agent | New additive M5A SQL after006, exact social pages/mutate/status/block token, receipt private table/indexes, explicit grants/RLS, deletion purge extension, current transition helper compatibility and actual PostgreSQL tests. Update API/README/deployment diagnostics only after source review; root owns hosted deployment. No Edge function is required for the first direct actor-facing RPCs. |

Minimum real screens: Friends has accepted/request tabs, search of loaded own friends, explicit exact-handle request, online/offline rows, request actions, ghost/status disclosure and private blocked list with token-bound unblock. Challenges has real outgoing/incoming invitations, create flow from synced M4 routes/current accepted friends, safe projection review, approved-course availability for the legacy sustained-speed mode, accept/decline/withdraw/cancel and durable pending/retry. No fake podium, online avatar carousel, ride count or race progress fills an empty state. Use one native virtualized list per long screen and44pt action targets; current M4 SharedRouteSnapshot preserves gaps/hidden geometry. Shared panels can still appear under existing Community segments until M7 redesigns the feed. New route wrappers resolve current MapHome buttons without changing the five-tab navigation.

### Exact provider and Realtime gates

1. SocialProvider mounts inside RideProvider + RouteProvider, under AuthProvider + AppProvider. The OnlineProvider compatibility facade mounts beneath SocialProvider and owns no independent polling, heartbeat or subscriptions. Its ready state requires current Auth scope and successful owner storage hydrate, not merely a default empty value. A cloud snapshot with profile_readyfalse is a confirmed profile gate; loading/failed reads are not evidence that profile is absent. AccountGate must check social ready/loading before offering profile setup. The compatibility facade supplies current `friends`, `presence`, `optedIn`, `profileReady`, `error`, `refresh`, `setPresence`, plus readiness; all consumers use one provider. This placement allows later convoy capture/map integration without moving consent or creating a second GPS owner.
2. Exposed data belongs only to the identical AuthScope object. RPCs/checkpoints gate current scope before/after await; queued reducer gates freshly read owner and closed-owner fence. A scope with null user is a sign-in/editor state and sends no social request/heartbeat. Confirmed deletion closes coordinator/channels/timers first, clears outbox before `forgetLocalAccount`, and cannot be reset by A→B→A.
3. Permission to heartbeat requires current signed-in scope, app `active`, a fresh successful cloud self snapshot, profile_readytrue, presence_opt_intrue, no ghost/off intent, no deletion/storage-read failure. Defaults are off. Never copy a guest preference into online presence consent or auto-enable after auth/onboarding. Opt-out immediately mutes local heartbeat until canonical server confirmation; a replayed prior enable receipt never turns it back on. After presence ACK only, refresh account/onboarding state so the ghost preference/account CAS base remains coherent with M1; preserve completion progress through its tested merge API. Current RiderProfile.reload reads profile/avatar only; use the tested onboarding/account refresh or a root-added getAccount refresh bridge rather than assuming profile reload changes the account revision.
4. Private pair subscription requires accepted current-generation friend returned by checked page, allowed opaque topic, active app and current scoped token. Use a dedicated socket client bound to scope+JWT; on token change dispose old channels/socket before opening the new binding, or provide a deliberately scope-fenced current-token callback. Installed realtime-js treats accessToken callback as source of truth, so calling setAuth(newJWT) on an old fixed-token callback is insufficient. Never share the global Auth socket or disconnect another feature's client. Subscribe after explicit setAuth and handle SUBSCRIBED/CHANNEL_ERROR/TIMED_OUT/CLOSED with coalesced refresh and bounded jitter/backoff.
5. Close subscriptions and stop heartbeat on background, signout, scope switch, deletion or local opt-out; refresh canonical page before reopening on foreground. A queued event from an obsolete topic/scope/generation cannot refresh/adopt into a replacement binding. Read-only receiving status does not require the receiver to publish their own status; otherwise ghost users could not see consenting friends. Relationship removal/block prunes/hides target status/invitations immediately while canonical refresh runs, and does not restore data if refresh fails.
6. Display online only while its server-derived expiry is fresh. Anchor server_now to that friend request's monotonic start, with a separate adoption timestamp: network or slow sibling reads conservatively consume TTL rather than renewing it. The provider supplies already-derived fresh rows to MapHome. Expiry schedules the next boundary instead of rerendering the map once per second. With paged status, show a dot/loaded-row count rather than claiming an exact all-friends total. TTL/read failure is offline/unknown, not an inferred live riding flag. M5A adds no map peers; M5B will supply only freshly authorized opted-in coordinates.

## Remaining full product scope, not dropped from the plan

| Milestone | Source foundation available | Still meaningful work / acceptance |
| --- | --- | --- |
| M0 | Unified black/light tokens, bilingual foundation, glass kit, font assets, one6s scooter loop and global playback budget. | Complete screen conversion in owning milestones; physical font/contrast/Dynamic Type checks and measured cold-start/frame cadence. Broader loop family remains M8. |
| M1 | Real auth/profile/avatar/privacy/deletion/onboarding and owner isolation. | Arbitrary-user signup/verification/reset delivery needs SMTP; Apple login/distribution capability and real signed-device tests; operational legal/contact publication and scheduled orphan cleanup. Existing Google sign-in stays usable. |
| M2 | Map adapters, smooth HUD, exclusive foreground recording, durable journal and private self-reported sync. iOS compilation/Android Gradle evidence exists in later acceptance notes. | Fresh installable artifact provenance after changes; physical GPS/denial/pause/restart/landscape,50 markers,2s map goal,30min memory/battery/FPS. Foreground-only policy is explicit; background ride capture requires separate task-manager/native justification and real tests before calling it supported. |
| M3 | Verified catalog, picker, owner CAS garage and secure durable photo lifecycle. | Native photo acquisition/sign upload/read, two-device garage conflicts, glyph scaling/loop FPS and scheduled cleanup operation. Active vehicle bindings are preserved for later server-authoritative class policy. |
| M4 | Local editor/drag/undo/detail, recorded geometry, owner documents/CAS, privacy projection and provider budget/cache implemented and committed. Hosted Geoapify normalization/cache/reload acceptance passes. | Genuine-route two-device save/conflict and installed-device map editing/performance remain. No external-map handoff is introduced. See M4 acceptance. |
| M5A | Real screen routes, one provider, pure transport/outbox, deployed007 receipts/pages/grants, localized states, blocked management and owner/guest browser reads. App397/backend118tests, typecheck/lint/export pass. | Actual two-account request/status/invitation and installed-device acceptance remain. This is the first M5 stage, not completion of all M5. See M5A acceptance. |
| M5B | MapPeer adapter and exclusive recording foundation; full audit defaults agreed. | Four-person foreground convoy, hashed code/admission, host+member consent, location privacy/revocation/15s TTL,1Hz publication/read, rotating topics, private map markers, friend QR/token invite links, multi-recipient invitations and riding status. Location/background/network failure behavior must be explicit. |
| M5C | Existing closed-course sustained-speed evidence/verifier and leases. | Approved async route-time attempts, directed ordered gates/checkpoints/corridor and immutable class/course/evidence binding; then live readiness/server-clock/countdown/finish/results/rematch, with physical two-device≤300ms target measured. Push schema/outbox/deep-link/revocation plus credential/native delivery acceptance can proceed alongside; none is omitted because credentials are not yet configured. |
| M6 | Bangkok period/tie logic and sustained-speed board. | Versioned Top Speed/Route Time/class/cc/EV/category/friends/global boards, server class policy/snapshots, own rank beyond first page, real0–3 podium, UI-thread rank motion, anti-cheat uncertainty/physics/plausibility, reports/moderator revocation and all calendar boundaries. No self-reported summaries become verified ranks. |
| M7 | Existing real feed/one-image publish/report/block and M4-safe route snapshots. | Latest/Top week/Friends virtualization, durable six-image≤1600px composer, ride/vehicle/verified attachment,≤150 caption, likes/comments/save/share, controlled optimistic updates, blurhash, child RLS/cursors/signers, moderation queue and two-account full posting acceptance. |
| M8 | Remotion scooter project, material asset provenance/budget, native press/glass/HUD motion. | Complete all requested4–8s garage×3/podium×3/period/auth/onboarding/empty/lobby/HUD loops with poster/seam/size manifest; route/presence/rank native polish; comprehensive accessibility/power/thermal/30min native performance; Apple/store/push/background/UGC/legal readiness and real auth→vehicle→ride→post→eligible rank smoke. No browser/CI pass certifies60/120Hz. |

Keep PLAN.md's full M5/M6/M7/M8 requirements; implementation subdivision and credential/hardware gates are sequencing, not feature cancellation. Each stage may report only its verified slice, with the remaining required scope visible until actual completion.
