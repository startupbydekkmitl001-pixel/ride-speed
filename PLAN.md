# Ride Speed build plan

The user has authorized native implementation and chosen MapLibre/OpenFreeMap + Geoapify. Finish each milestone, verify its meaningful checks, commit only its files, then report five lines: done / how to test / known issues / what the user must provide / next. Device/account gates are recorded; they do not justify stopping unrelated implementation. Existing dirty design files belong to earlier work and are preserved.

## Step 0 — evidence and architecture

- [x] Read seven complete design documents; sample/study six latest videos and all supplied screenshots.
- [x] Open/capture all five sites; inspect shell tokens; use connected Inspo MCP search/find_similar/get_screen.
- [x] Audit canonical app/backend; verify selected map provider and free route/search service using official docs.
- [x] Finish reference/map/current platform research reports and inspect them before product code.
- [x] Write DESIGN_BRIEF.md, DECISIONS.md and this PLAN.md.
- [x] Create `/references` index with evidence provenance; keep originals and extracted frames out of public app assets.

## M0 — foundation

- [x] `src/lib/theme.ts`: single color/space/radius/type/motion source; true black and accessible orange labels; retain preference choices while new users default to system.
- [x] `src/lib/i18n/*`: Thai/English keys, device locale/manual selection, interpolation, localized errors; meaningful resource-parity/locale tests. Convert shared UI/auth/onboarding/navigation first, all remaining screens within owning milestone.
- [x] `src/components/glass/*` and `components/ui.tsx`: native glass, blur fallback, solid accessibility/Android fallback; 44 pt controls and Reanimated press response.
- [x] Tab shell: Map/Garage/Community/Ranked/Me; saved-route URLs remain compatible; Garage tab and modal picker paths are unique. Gesture root and full-width native host; orientation handling remains M2.
- [x] `/motion`: one original 6 s garage material + poster + manifest; global two-player budget/visibility/power policy foundation. Document rerender.
- [x] `.env.example`, architecture/setup README and SDK-compatible dependencies via `expo install`.
- [x] Verify tests/typecheck/lint, real web shell loading/accessibility/Thai-English toggle, reduced motion/transparency and loop seam/size. Physical startup/FPS baseline pending until hardware; evidence in `docs/design/m0-acceptance-v5.md`.
- [x] Commit M0; report five lines.

## M1 — accounts, profile and schema

- [x] `features/onboarding`, Auth/RiderProfile/AppState: returning users map-first; language/location rationale/profile/optional vehicle flow; persistent secure session and account-scoped local data migration.
- [x] Additive profile/preferences/avatar/deletion migration: owner RPCs/RLS, private avatar upload, idempotent deletion cleanup, resolve cross-owner challenge/result references. Deployed once; foundation preserved.
- [x] Auth UI: real Google, configured email recovery/signup availability, Apple adapter/provider capability gate; profile card photo edits; legal/privacy/settings/delete UI with localized errors.
- [x] Test A→B→A delayed work/cache isolation, handle collision, interrupted onboarding, avatar/path authorization, browser restart session and deletion retry/RLS. Hosted Google acceptance passes; native/disposable-account gates recorded in `docs/design/m1-acceptance-v5.md`.
- [x] Commit M1; report five lines.

## M2 — fullscreen map, speed and recording

- [x] MapLibre v11 native + v6 web adapters with shared black/light style, Thai glyph coverage, attribution, real pan/zoom and permitted user positioning; denied/loading/retry states.
- [x] Map Home: recenter/layers/friends/history and route/challenge entry controls, compact HUD and expanded native landscape mode; actual search and peer positions follow in M4/M5.
- [x] Reanimated shared-value needle/rolling digits preserving SpeedEngine quality/stale/zero/max semantics; never generate evidence from display interpolation.
- [x] One ride provider above routes; durable SQLite/IndexedDB journal with owner/capture IDs, append/checkpoint, pause segments, crash recovery, saved summaries and compressed disconnected geometry. Provider limits remain explicit.
- [x] Start/pause/resume/stop/save, keep awake, offline outbox and idempotent cloud ride summary sync; foreground interruption policy visible. Glance lock >10 km/h with passenger override.
- [x] Meaningful unit/adapter tests, browser map/HUD/history interactions, lint/typecheck and all-platform export. See `docs/design/m2-acceptance-v5.md` for exact evidence.
- [ ] Fresh iOS/Android native CI compilation and physical GPS/50-marker/2 s map/FPS/battery acceptance. Source implementation is complete; these results must be measured separately.
- [x] Commit M2; report five lines.

## M3 — garage/catalog

- [x] Garage tab and first-run animated plus; category→brand/model/variant/year flow, powertrain cc/kW, photo/color/nickname, many vehicles and active snapshot.
- [x] Expand editable verified Thailand catalog to about 20–30 models per category from official manufacturer pages, provenance/year; uncertain specs explicitly flagged and excluded from autoverified classification. Custom fallback.
- [x] Cloud vehicle owner/RLS sync with revisions; active vehicle immutable snapshot attaches to rides/posts/competition classes.
- [x] Verify type is independent of cc, EV uses kW, 4-tap fast path, duplicate/manual handling and owner isolation; browser flow and catalog provenance checks. See M3 acceptance for device/photo gates.
- [x] Commit M3; report five lines.

## M4 — routes/search/road geometry

- [x] Authenticated `route-service` Edge function: bounded validated search/route requests, Geoapify key secret, per-user/shared token budget, cache, debounce, timeout/retry. Native in-app results only.
- [x] Pins long-press/tap/drag, undo, start/via/finish, road snapping, actual distance/ETA, saved visibility/name, recorded-route import, in-app detail and route sharing.
- [x] Add route geometry/revisions/provider hash; private/public projections and server ≥200 m endpoint trimming, privacy-aware existing snapshot remediation. Geometry changes reset approvals; invite binds immutable revision.
- [x] Test stale route responses, pin edits, disconnected geometry, search/route quotas, short routes entirely hidden, RLS/foreign route ownership/public leaks/cache consent. Hosted real road request and cache/reload pass; no coordinates/key logged. See `docs/design/m4-acceptance-v5.md`.
- [ ] Installed-device drag/camera/performance and genuine-route two-device save/conflict acceptance; source/hosted-provider checks do not imply these measurements.
- [x] Commit M4; report five lines.

## M5 — friends, convoy and challenges

- [x] M5A: exact-handle friend requests/actions, private blocked list, paged invitations, owner-only durable operation receipts, status consent/expiry and one scope-fenced provider. Migration007 deployed; Thai/English owner reads and guest gate checked. See `docs/design/m5a-acceptance-v5.md`.
- [x] M5A: 397 app tests, 118 backend tests, typecheck/lint and all-platform export; commit the verified slice before continuing M5B. This does not complete the remaining M5 requirements below.
- [ ] Friend username/QR/invite links/search and requests/block; server private presence riding/online/offline/ghost, explicit opt-in map sharing, expiry/revocation; notification token/preferences/outbox and credential gates.
- [ ] Convoy host/join-code/session membership, rate-bound hashed expiring codes, private live positions 1–2 Hz; map markers actual authorized peers only.
- [ ] Async route-time trials first; then approved closed-course live lobby/ready/countdown/running/finish/results/rematch state machine with server schedule/clock uncertainty. No user checkbox grants course approval.
- [ ] Server private channels and ordered directed gates/checkpoints/corridor evidence; geofence alone cannot verify shortcut-free completion. Preserve existing sustained-speed verifier and lease fencing.
- [ ] Test relationship generation/outsider/block/expired code/stale positions/reconnect, race transitions/duplicate starts/clock budget/finish gaps. Two consenting devices/course and push provider required for corresponding real acceptance.
- [ ] Commit M5; report five lines.

## M6 — ranked/anti-cheat

- [ ] Versioned speed/route-time boards, Today/Week/Month Bangkok periods, category/cc/class/EV/friends/global filters, server immutable vehicle class and explicit verified metric labels.
- [ ] Actual-row podium (0–3 rows only), sticky own rank, rank changes, refresh and coalesced realtime invalidation.
- [ ] Server anti-cheat evidence/mock/accuracy/teleport/acceleration/class plausibility/gaps/too-few-points, reports/operator queue and revocation.
- [ ] Test Bangkok Monday/month/leap/year boundaries, ties, forged class/route, edited vehicle, scope/block/deleted/revoked results, uncertainty and stale-worker leases. No fake ranks to demonstrate UI.
- [ ] Commit M6; report five lines.

## M7 — community

- [ ] Latest/Top week/Friends virtualized feed, real loading/empty/error/offline states, optimistic likes/comments/save, deep-link share/report/block, moderation queue.
- [ ] Durable composer: verified or self-reported ride attachment, actual summary/vehicle/private-trimmed route snapshot, six ≤1600 px metadata-stripped photos with blurhash; caption≤150 and description/visibility.
- [ ] Versioned media reservations/post publish/interactions/feed cursor RPCs and RLS; private Storage, signer only for currently visible parent posts, orphan/deletion cleanup.
- [ ] Test media ownership/cap/ordering/retries, 150-char new posts without truncating old data, route privacy, stable cursors, block/hide/delete child visibility/counts/signatures and optimistic rollback. Real two-account posting acceptance where available.
- [ ] Commit M7; report five lines.

## M8 — motion, performance, accessibility/store prep

- [ ] Complete periodic garage×3, podium×3, period headers, auth/onboard, empty, lobby and HUD loop family; ≤1.5 MB each/poster/manifest/hash/seam proof, ≤20 MB total or private CDN caching.
- [ ] Native route/presence/needle/digits/rank/glass touch polish; no layout/blur/per-frame React updates, offscreen videos stop and ≤2 budget globally.
- [ ] Dynamic Type/screens readers/44 pt/Thai tones/Reduce Motion/Transparency, safe-area/landscape and all offline/error states; measured native iPhone/Android performance matrix.
- [ ] Android artifact pipeline alongside verified unsigned iOS builds; provider/entitlement/legal/account deletion/UGC moderation/background rationale readiness. Publish only truthful build/source acceptance and explicit remaining hardware/store gates.
- [ ] Smoke auth→vehicle→ride→post→eligible rank on a real approved course; lint/typecheck/core/backend/build tests, release hashes and source provenance. Physical cold start/50 markers/30 min memory/battery/countdown recorded, never inferred from code.
- [ ] Commit M8; report five lines and final artifacts.
