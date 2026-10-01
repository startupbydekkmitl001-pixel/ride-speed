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
- [x] M5B source: private expiring friend QR/links, exact code/host approval flow, independent receive/send consent, foreground capture leases, scoped durable recovery and privacy-fenced map peers. Migration008 deployed once; twelve private tables/RLS/ACLs and disabled policy verified in the hosted project. See `docs/design/m5b-acceptance-v5.md`.
- [ ] M5B operational acceptance: install/observe the reviewed minute cleanup job after browser approval, verify private Realtime setting/organization quotas, then paired native QR/code/GPS/15-second removal checks before enabling rooms. Friend-link flow is available independently; no fake hosted rooms or GPS points were created.
- [x] M5C source/schema: original native capture, immutable private evidence, exact durable recovery, approved private course map and distinct route-time verifier; migration009 deployed once with policyfalse. Independent206 backend tests and59 focused client map/race cases pass; source acceptance in docs/design/m5c-acceptance-v5.md.
- [ ] M5C operational/device acceptance: the two authenticated workers are deployed/configured with anonymous401 checks; managed state/binary retention, hosted CPU/quota checks, independent operator course approval and consenting paired installed devices remain. Source/schema acceptance does not enable races.
- [x] Source: friend username/QR/invite links/search and requests/block, private presence and explicit map-sharing consent/expiry/revocation. Hosted empty owner reads are distinct from paired-device acceptance.
- [x] Source: convoy host/join-code/session membership, rate-bound hashed expiring codes, private live positions1–2Hz and authorized-only map peers. The operational pilot stays disabled.
- [x] Source: async trials and approved closed-course live lobby/ready/countdown/running/finish/results/rematch with server schedule/clock uncertainty and directed evidence. No user checkbox grants course approval.
- [x] Source tests cover outsider/block/expiry/stale/reconnect, race transitions/duplicate starts/clock budget/finish gaps and verifier lease fencing. Physical acceptance remains above.
- [ ] Push delivery on installed devices: provider credentials, token registration, request/invite delivery and preference/revocation checks.
- [x] Commit M5 source slices and report; operational/device gates remain open.

## M6 — ranked/anti-cheat

- [x] M6 source/schema and signed-owner empty-read acceptance: genuine versioned boards, strict pagination/class/periods, separate owner candidate/settings pages, explicit visibility CAS, opaque fresh report review and pending-privacy quarantine. Backend230 tests/independent24 focused, owned32 publication/report cases, root28 board/provider/report cases and9 localization cases pass; see docs/design/m6-acceptance-v5.md.
- [ ] M6 positive-record/two-account/device acceptance and managed realtime/moderation operations. Current adfd511 Android/iOS successful native builds predate M6; no fake qualifiers or ranks were inserted.
- [x] Source: versioned speed/route-time boards, Bangkok periods, category/cc/class/EV/friends/global filters, immutable vehicle class and explicit qualified metric labels.
- [x] Source: actual-row podium (0–3 only), sticky own rank, rank changes, refresh and coalesced realtime invalidation. Positive real records remain a separate acceptance gate.
- [x] Source: server evidence checks, reports/operator queue and revocation; validation of submitted evidence is not device sensor attestation.
- [x] Test Bangkok calendar boundaries, ties, forged class/route, edited vehicle, scope/block/deleted/revoked results, uncertainty and stale-worker leases. No fake ranks were inserted.
- [x] Commit M6 source and report; positive/operator/device gates remain open.

## M7 — community

- [x] Latest/Top week/Friends FlashList feed, real loading/empty/error/offline states, durable interactions/comments/save, deep-link share/report/block and service-only moderation contracts. Hidden posts retain owner metadata for private revocation/delete.
- [x] Durable composer: genuine ride/saved-route attachment review, actual summary/vehicle/200m endpoint-trimmed route, six ≤1600 px metadata-stripped JPEG photos with server blurhash; caption≤150 and explicit visibility.
- [x] Versioned reservations/publish/interactions/feed cursor RPCs and private RLS/Storage, parent-ACL-fenced signer and bounded cleanup handlers.011/012 and three workers deployed once; approved legacy gateway settings off, each handler rejects anonymous requests401.
- [x] Source checks:961 app and277 backend tests, zero skips; whole typecheck/lint and web/iOS/Android exports pass. Media ownership/caps/recovery, cursor/privacy/child visibility, retained confirmations, recycling and strict decoders verified. See docs/design/m7-acceptance-v5.md.
- [ ] Hosted positive posting/photo/two-account acceptance: Google sign-in/profile and genuine empty feed/owner-settings reads work after documented managed pool recovery. Protected binary-cleanup schedule/observed execution and native codec/performance remain separate gates; no synthetic hosted posts added.
- [x] Prepare/review private Community cleanup bootstrap/installer/status/runbook with18 PostgreSQL-engine facade tests. Hosted read-only preflights identify absent Cron/net APIs, unsafe service_role Vault access and missing required names. Source is ready to review; extension/ACL setup, human Vault entry and scheduled permanent cleanup remain unapproved/unexecuted.
- [x] Commit M7 source; report five lines. Operational/device gates above remain open.

## M8 — motion, performance, accessibility/store prep

- [x] Render periodic garage×3, podium×3, period headers, auth/onboard, empty, lobby, HUD and profile loop family in both themes;28outputs/1,552,874bytes with manifest/hash/source+encoded seam/poster proofs. Integration/hardware gates remain below; see motion/DELIVERY.md.
- [x] Reviewed source polish: centralized Thai/Latin typography and empty headings, grouped native map glass controls, Ranked method disclosure, synchronous motion lease lifecycle fencing and current-state native countdown haptics.988 app/277 backend tests, typecheck/lint, all-platform export,6 motion tests and9 native-policy/21 packaging checks pass; exact evidence in docs/design/m8-acceptance-v5.md.
- [ ] Remaining native motion work: route flow/presence interpolation, shared-element transitions, touch/audio cues and bounded next-loop preload; measured costs before adopting. Existing needle/digits/rank response and ≤2 video budget are source-verified, not physical frame-rate measurements.
- [ ] Dynamic Type/screens readers/44 pt/Thai tones/Reduce Motion/Transparency, safe-area/landscape and all offline/error states; measured native iPhone/Android performance matrix.
- [x] Source7bb3665 compiled in actual iOS run30 and Android run17. Independently validated downloaded unsigned arm64 Release/development IPA and standalone Android APK identities, hashes, native modules and all28 videos/posters; see docs/research/native-7bb3665-package-validation.md. Physical installation remains unmeasured.
- [ ] Provider/entitlement/legal/account deletion/UGC moderation/background rationale readiness. Publish only truthful build/source acceptance and explicit remaining hardware/store gates.
- [ ] Smoke auth→vehicle→ride→post→eligible rank on a real approved course; lint/typecheck/core/backend/build tests, release hashes and source provenance. Physical cold start/50 markers/30 min memory/battery/countdown recorded, never inferred from code.
- [x] Commit/push M8 source polish7bb3665 and validate its actual native artifacts. Physical/store and remaining source gates above remain open; this is preview acceptance, not a completed production milestone.
