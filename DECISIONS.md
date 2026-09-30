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
