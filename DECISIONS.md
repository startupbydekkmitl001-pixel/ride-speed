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
