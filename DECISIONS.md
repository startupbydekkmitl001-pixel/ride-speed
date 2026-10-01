# Ride Speed implementation decisions

## 2026-10-01 — map-first expansion

1. **Map architecture:** user explicitly selected MapLibre + OpenFreeMap for iPhone and Android, with Geoapify for routing/search. Replace the prior Apple-only map adapter. Base map is keyless; route/search requests go through authenticated Supabase Edge logic with server-only `GEOAPIFY_API_KEY`, caching, debounce and shared quota accounting. Never put that key in `EXPO_PUBLIC_*`.
2. **Incremental source layout:** keep Expo Router under `ExpoRideSpeed/src/app`, add `src/components/glass`, `src/features/*`, `src/lib`; maintain existing `backend` sources with a documented `/supabase` entry point rather than moving deployed files and breaking CI. `/motion` and `/references` are added at root.
3. **Typography:** retain Anuphan UI + numeric Manrope provisionally, based on actual glyph/advance inspection. Device comparison of IBM Plex Sans Thai/Kanit/Prompt remains an acceptance task.
4. **Motion framework:** use the working local Remotion version for original loop materials. HyperFrames entry-point/workflow guidance was consulted; the spec allows either framework, so a second renderer adds no benefit here. UI interaction motion remains Reanimated/Gesture Handler, not video playback.
5. **State and accounts:** theme/language/accessibility preferences are device-scoped. Vehicles/routes/ride journals/drafts are guest or owner-scoped; legacy device data must never silently move between signed-in accounts. Preserve initiating JWT and account generation checks.
6. **Competitive data:** retain existing `sustained_min_3s_v1` eligibility and lease fencing. Add route-time/live sessions separately. No simulated location or road-snapped display geometry becomes measurement evidence.
7. **Free tiers:** budget the Geoapify shared 3,000 credits/day and 5 requests/s conservatively. OpenFreeMap has no announced public usage caps/SLA. Supabase resource caps guide batching and media limits; hardware/FPS claims require actual measurements.
8. **Auth/store gates:** keep real Google login and secure sessions. Public email delivery remains disabled until SMTP is configured; Apple login/distribution capabilities need the appropriate developer/provider setup. Show truthful availability states. Optional LINE is subsequent to required auth.
9. **User workflow:** the user's direct instruction to choose sensibly and avoid questions except keys/accounts/architecture overrides extra design-approval pauses in generic skills. This brief and plan are reviewable; implementation proceeds milestone by milestone.
10. **Privacy:** friends-only defaults, explicit live location consent, server public endpoint trimming, block revocation and account deletion cleanup are backend invariants. Never publish raw precise location or evidence in the public repository.

## M1 — account recovery and ownership

- The v4 device record has no reliable account owner. Migrate it to a guest record and retain the original recovery copy. Signed-in users explicitly copy that garage/routes into their account; regenerated local IDs and removed cloud bindings prevent a device import from inheriting another owner's server records.
- Theme, language, units and accessibility are device preferences. Onboarding completion, garage, routes, photo drafts and profile caches are owner-scoped. Every delayed write retains its initiating account generation and JWT; changing accounts clears visible owned data before hydration.
- Supabase's existing foundation was deployed through the dashboard and has no CLI migration history (verified with a read-only query). Apply only the additive M1 migration. A future CLI push must reconcile that history first.
- Apple sign-in remains a configured capability gate until its provider/App ID are tested. Google is available now; public email signup/reset delivery requires SMTP. These gates must be stated in the app, rather than showing buttons that promise unavailable login methods.
- Native encrypted session storage already uses an atomic generation manifest and bounded chunks. The web review session uses sessionStorage. Native restart acceptance still requires a signed device build.

## M2 — maps, journals and native validation

- MapLibre native 11.4.0/web 6.11.2 share validated black/light bilingual styles. Same-origin web worker modules are copied from the exact locked package with their BSD notice. Visible OpenFreeMap/OpenMapTiles/OSM attribution remains with the map; expanded HUD hides the map as a whole.
- Use native SQLite and web IndexedDB rather than SQLite WASM on web, avoiding cross-origin isolation headers that disrupt OAuth. Test actual SQL/IDB adapter behavior in addition to the global provider's captured-location ports. Failed writes remain queued and never let finalization overtake receipts.
- Keep the proven SpeedEngine and use Reanimated SVG for the portable instrument; Skia is installed for later native shaders. Rolling digits/needle do not contribute evidence. There are no per-frame React state updates. Native frame rate remains a measured gate.
- Cloud summaries are owner-only, self-reported and bounded. Oversized geometry stays saved locally with a sync message; do not merge gaps, silently clip an observed maximum or relabel it verified. A frozen operation survives response loss and disk retry.
- Foreground interruption is explicit. Pause/GPS failure retain the last confirmed moving lock; only a fresh suitable stationary reading or passenger override releases it. Confirmed account deletion permanently closes that owner's local acquisition/write/proof boundary before cleanup finishes.
- Run native compilation on public standard GitHub runners. The Android standalone preview uses Expo's public debug certificate, bundles its JS and is labeled unfit for store submission. iPhone artifacts remain unsigned. Compile/installation/performance are distinct results.

## M3 — garage ownership and catalog

- Keep 90 editable configurations across 72 verified model families (21 scooter, 25 motorcycle, 26 car). Three preserved legacy EV suggestions have unverified power output; nullable values and manual entry remain valid. A Civic RS badge does not determine its engine, generation or hybrid status.
- Classify scooters by body/type rather than cc. Pure EVs use traction-motor kW, diesel is represented explicitly, and previously captured ride vehicle snapshots remain immutable.
- Persist the complete owner garage with compare-and-swap revisions and immutable operation receipts. Never automatically overwrite a conflicting cloud garage or silently import guest data into a real account. Local-only QA vehicles are explicitly labelled and isolated on a separate browser origin.
- Private photo reservations retain exact bounded bytes and owner/vehicle/upload IDs across interruption. Unknown response outcomes preserve the operation; only a definite expired reservation can be retired and rotated. Delete a retained local photo draft only after the current garage acknowledgement proves its attachment. Signed photo reads authorize the current owner vehicle rather than an arbitrary caller-supplied Storage path.
- The shortest catalog path is plus → category → model → save. Brand filters, trim selection and optional photo/nickname/color share the picker rather than adding mandatory screens. Native photo acquisition and two-device conflicts still require installed-device acceptance.

## M4 — route editing and provider proof

- Keep unfinished zero/one-pin drafts locally instead of treating them as invalid saved routes. Drafts, provider consent and saved route operations belong to the initiating account; guest import strips server proof and defaults copied routes to private.
- Road geometry uses server-issued proof bound to the owner, exact ordered pins and routing profile. Cached geometry without a token remains a labelled preview until recalculation. Recorded geometry preserves separate fragments and has no road ETA. Neither source creates verified race evidence.
- Use immutable operation receipts and compare-and-swap revisions. Disk failure, unknown network outcome and a real revision conflict remain distinct recovery states. A remotely deleted edited route is copied only after explicit conflict choice; its old tombstone remains.
- Nonowner projections remove at least 200 m from both ends, hide short paths, preserve gaps and omit private stop labels, place IDs, bounds and original metrics. Shared links carry an opaque route ID and are authorized when opened. Historical invitation metadata cannot stand in for missing safe geometry.
- Provider requests are bounded, debounced and cached per owner. Estimates exclude live traffic; search is restricted to Thailand in this pilot. Server credit reservations are conservative estimates, not a guarantee against unknown billed work after timeouts.
- Trace hosted provider failures only with fixed diagnostic stages, numeric HTTP statuses, bounded SQL codes and allowlisted shape reasons. Never log requests, user IDs, queries, coordinates, URLs, bodies, secrets or arbitrary error messages. Preserve deployed migration 006; subsequent SQL fixes must be additive.
- Give camera padding one owner. GL JS adds persistent padding to fit options; native Android/iOS add renderer content insets to camera padding. Web bounds use persistent padding plus zero additive fit padding; native renderer insets are zero and camera commands supply the viewport. Bounds reserve attribution/marker clearance; recenter remains unchanged. Actual SDK/adapter regressions accompany the correction.

## M5A — social recovery and status authority

- One SocialProvider owns reads, the owner outbox, heartbeat and scoped private sockets. OnlineState is a compatibility facade. A durable immutable operation is saved before transmission and removed only after an exact owner/operation/request acknowledgement. Unknown transport outcomes remain recoverable; malformed owner storage is never overwritten with an empty queue.
- Migration007 revokes the six superseded browser mutation entry points. Current clients use actor-facing typed RPCs; internal service helpers retain their existing behavior. Deployed migration sources001–007 are immutable.
- Online status contains no GPS. Presence requires fresh canonical opt-in, active foreground, current account/JWT and readable local ownership. A local off intent stops transport immediately. Replayed older enable acknowledgements cannot restore it.
- Anchor server TTL to each request's monotonic start, not batch adoption. Slow network or sibling reads consume freshness. Block/remove quarantines peers during uncertain outcomes and proven terminal acknowledgements keep them hidden even if the follow-up read fails.
- Empty messages require successful fresh pages. Failed/unread pages show recovery, never an invented absence. The map badge counts only loaded fresh statuses; it does not claim an all-friends total or provide live positions.
- Browser acceptance uses real owner reads and isolated guest UI. No synthetic production friend, invitation, account deletion or precise-location transmission is needed to verify the empty screens. QR, room-scoped live locations, races and notifications are subsequent M5 slices.

## M5B — private links and foreground group trips

- Keep four-person group trips separate from verified races. Safe immutable route projections, accepted host friendships, code proofs and explicit host approval establish membership; none grants permission to send a location.
- Receiving is an independent local choice. Sending requires an explicit foreground review, exact capture/lease/revision and fresh canonical room authority. Pause, background, ghost mode, account change and deletion clear that authority. A recovered acknowledgement cannot recreate it.
- Store only hashed link tokens and codes on the server; persist plaintext in versioned owner SecureStore before control transmission. Browser review uses session-only application storage. Installed development links use the allowlisted development scheme; incoming tokens remain memory-only and never become router parameters or automatic requests.
- Broadcast only GPS-free invalidation hints. Authoritative scalar reads recheck membership, blocks, consent and expiry; latest positions have a 15-second maximum TTL. Map layers hide before pending worker updates and cannot be revealed by older responses.
- Persist immutable control operations before egress. Stop during an unknown grant obtains an exact server cancellation fence or its applied receipt before retiring the operation, then revokes the current canonical lease. Concurrent terminal replies share one durable settlement; failed storage preserves recovery.
- Migration008 is deployed at SHA256 `228141005DC4FE61392C92377B7618D96C573B06B9254C3C3071CD24DF00C5F8`. Rooms remain disabled until minute cleanup, private managed Realtime, actual quotas and paired installed-device checks pass. Real source/SQL tests are not native GPS or performance measurements. Unrelated milestones continue while these gates remain pending.

## M5C — original capture and evidence recovery

- Race attempts passively tap the existing native recorder. Exact original receipt clocks/flags and contiguous raw sequence ranges stay private; display interpolation and road snapping never become evidence. No second watcher or invented sample is introduced.
- A background or source interruption retains durable owner stop intent. Unknown arm outcomes settle by exact receipt first, followed by a new terminal operation only at the fresh server revision. Failed disk writes stay retryable. New activations require current detail, course/member/capture and separately reviewed closed-course/evidence consent.
- Private upload files are immutable. Reservation/ref capacity is checked before exporting or writing a new file; uploaded bytes cannot be overwritten. Canonical terminal acknowledgment with no unresolved attempt action releases only that local upload copy. Original private ride journals are separate.
- Hosted evidence retention is measured from immutable upload reservation, due within seven days, rather than seven days after finalization. This bounds abandoned data as well as completed attempts. Both languages disclose the same rule and provider-backup limitation. Dedicated256MiB reserved+actual capacity protects free-tier headroom; it does not certify total organization billing usage.
- One detail poll contains two read RPCs. Six-second foreground polling costs20read RPCs/minute and coalesces slow requests. Host lobby heartbeat uses its separate budget and does not add redundant detail reads, create readiness or grant GPS sharing. Missing managed/native acceptance keeps the pilot disabled.

## M6 — qualification, visibility and reports

- Rank only the existing server-qualified sustained-speed method and independently verified native course-time intervals. Owner-reported start vehicle metadata is immutable per record and is not sensor attestation. Ordinary ride maxima, posts and later Garage edits cannot create or reclassify a qualified result.
- Separate the current qualified-result selector from retained own visibility settings. A record whose qualification expires remains discoverable for Private revocation; sharing again requires current server qualification and, for course time, separate operator-approved public discovery. A mutation receipt is never current getter authority.
- Keep reports bound to an opaque owner-memory token and an exact fresh genuine board page. Pending private/block/remove requests quarantine rows and report authority immediately; privacy acknowledgements require a new canonical read. A received report is not a claim that moderation acted.
- Persist immutable CAS operations before status-first egress. Unknown outcomes retain the same operation, disk-read failures do not become empty queues, and confirmed deletion closes the initiating owner before local cleanup. Account and foreground generations fence both transport and retained local form callbacks.
- The bilingual registry is flat, so disable i18next namespace and key separators for class keys containing colons. Use `{{value}}` interpolation and test the real translators, not a key-returning screen fixture alone.
- M6 source and hosted owner empty-read acceptance are separate from genuine positive-result/two-account and native performance acceptance. Native artifacts at adfd511 predate M6, and the route-time pilot remains disabled pending its existing operational/device gates.

## M7 — private media and durable community

- Use real owner-reviewed ride/saved-route projections, fixed typed DTOs and200m endpoint trimming; ordinary ride maxima never qualify for Ranked by appearing in a post. New content is150 Unicode characters plus a separate description; legacy content remains readable without truncation.
- Keep JPEG candidates in owner-private local storage. Metadata adoption and pruning share one serialized byte lane; publication operations flush before egress and recover exact IDs/status before sending. Unknown disk/server outcomes remain retryable.
- New published photos require bounded actual entropy decode, SHA256 and server BlurHash; current parent visibility is checked before signing and before displaying.60s URLs remain memory-only, and FlashList recycled images use binding-specific recycling/retry fences. Source recycling tests do not measure phone frame rates.
- Keep reviewed deployed011 immutable. Repair the additionally reproduced deleted-draft upgrade projection through additive012, including unchanged helper grants/signature/search path and independent real database regressions.
- Use SDK57-compatible FlashList2.0.2 for community galleries/comments/feed and Ranked. Explicitly disable default anchor maintenance for changing filter lists and retire visibility grants at owner/generation boundaries. Pin versions in the lockfile; native rebuild is required.
- Hosted schema/worker readiness is separate from positive app acceptance. Current Google login reaches the app, but existing account/profile requests returned PostgRESTPGRST002503; routine schema reload succeeded and the retry still failed. Do not weaken authentication, invent successful posts, or call an export/device codec a real hosted acceptance check.

## M8 — original loop family and integration

- Render one Remotion project for all14roles×2themes. The user permits either motion renderer; the HyperFrames creative/motion guidance informed direction, with Remotion supplying the verified production pipeline. Every loop is original, frame-derived and silent; native content supplies actual identity and state.
- Bundle the complete1.55MB family locally instead of adding a CDN/key or network dependency. Native text overlays remain still; first-frame posters hide startup/decode interruption. Legacy profile playback is replaced by the shared two-player budget and theme-aware license role.
- Expanded stationary speedometer may play one subtle background loop. Compact/moving HUD shows a poster while the existing Reanimated instrument remains driven by measurements. Native performance and accessibility claims require installed-device evidence.
