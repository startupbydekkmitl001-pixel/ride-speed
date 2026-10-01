# Field tests and performance evidence

**Historical Phase 1 baseline — 30 September 2026:** no new IPA had been built or installed, and no device/battery/accuracy measurements had been made in that phase. The Expo Go prototype was not evidence that native recording works while locked. For current source and remaining installed-device checks, see [Current V5 native acceptance](#current-v5-native-acceptance); the older published package is recorded under [Historical build9 native pilot](#historical-build9-native-pilot-1-october-2026).

## Measurement rules

For each run record app/build/algorithm versions, iPhone model, iOS version, battery health, mount/vehicle, temperature, screen brightness, power mode, permissions, precise-location state, and reference instrument. Save original timestamps and quality flags. Compare matched time windows, not two displays viewed at different times. Account for display and receiver latency.

A calibrated wheel sensor is useful for bicycle steady speed/distance; a vehicle dashboard is only a cross-check, not ground truth. Use a validated 10–25 Hz receiver or track timing system for performance timing. Borrow equipment if possible; an external receiver purchase is not required for v1. Mark every reference's own uncertainty. Testing 0–100 or emergency braking belongs on an authorized closed course with appropriate supervision, not in traffic.

## Confirmed device and vehicles

Confirmed by the user on 30 September 2026. These are planned validation profiles, not completed tests. Record the exact iOS 26 patch/build in test logs. Vehicle model years/modifications, cases and mounts remain unspecified; no single primary vehicle has been selected.

| Device or vehicle | Role | Specific validation |
|---|---|---|
| iPhone 14 Plus, iOS 26 | Initial phone baseline | Actual Core Location cadence and uncertainty; permission behavior; 30-minute foreground recording and expected pause when locked/backgrounded; battery/thermal use; 60 Hz rendering target. Additional sensors and locked-screen continuity remain separate roadmap checks. |
| Honda PCX160 | Saved motorcycle profile, scooter | Low-speed stop/start and creeping; lean/steering effects; vibration and mount movement; reliable-fix coverage in the chosen phone position |
| BMW S1000RR | Separate saved motorcycle profile | Account for Apple's high-powered-motorcycle mounting warning before field work; assess recording quality in a protected carrying position; later closed-course timing only with suitable reference equipment |
| Honda Civic RS | Saved car profile; proposed first driving baseline | Fixed cabin mount; windshield/roof obstruction; ordinary acceleration/deceleration; cabin pressure/HVAC effects on barometric altitude; locked and screen-on battery runs |

Apple lists GPS, GLONASS, Galileo, QZSS and BeiDou, plus a barometer, high dynamic range gyro and high-g accelerometer for iPhone 14 Plus. Its specifications do not advertise precision dual-frequency GPS. Hardware availability does not establish app sample rate, background continuity or measurement accuracy. [Apple specifications](https://support.apple.com/en-us/111854)

Apple advises against attaching iPhones to high-powered motorcycles because vibration can damage camera stabilization/autofocus. Apply that guidance to the S1000RR: do not schedule a direct-mounted iPhone test or treat a damper as proof of protection. For lower-powered scooters, Apple recommends a vibration-damping mount and avoiding prolonged regular exposure. A pocket or bag changes GNSS reception and allows independent phone movement, so do not interpret its motion as calibrated vehicle G or hard-brake evidence. Assess signal quality in the actual carrying position and withhold unreliable results. [Apple motorcycle vibration guidance](https://support.apple.com/en-us/102175)

Use separate calibration records for each vehicle/mount combination. PCX160 and S1000RR remain in the motorcycle class; Civic RS belongs to the car class. Do not impose guessed factory top speeds or braking limits based on these names. Begin with stationary/outdoor checks and the Civic cabin baseline, then assess the motorcycle recording arrangements. iOS 17 remains the minimum deployment target; testing on iOS 26 alone does not verify iOS 17 behavior.

## Initial performance targets

These are proposed acceptance goals, not research-derived guarantees. Revise them after a baseline on the oldest test phone. Report pass/fail and observed values every phase, including regressions.

| Measurement | Initial goal | Windows/iPhone method |
|---|---|---|
| Cold launch to responsive screen | p95 under 2 s in Release | Native monotonic launch marker to first interactive screen, at least 20 launches |
| Start to reliable speed, warm fix outdoors | p90 under 10 s | Log permission-complete/start/first accepted/confirmed timestamps; separate cold GNSS and obstruction cases |
| New valid sample to displayed number | p95 under 300 ms foreground | Log acquisition, batch, processing, and UI timestamps; also record original measurement age |
| Stale speed | Blank by 3 s after last usable speed | Desk replay and lost-fix field test; use actual sample time, not receipt time |
| Recording with screen off | Aim at most 8 battery percentage points/hour | Two-hour matched rides, three repeats; include motion logging, radios, and battery-health notes |
| Simple riding screen, about 50% brightness | Aim at most 15 percentage points/hour | Same repeated test; direct sunlight/max brightness reported separately, may exceed this |
| Motion cadence | Start at 25 Hz for raw session logging; assess 50 Hz for performance mode | Compare delivered intervals, aliasing, vibration, battery and missing intervals; never infer cadence from requested rate |
| Native frame cadence at 60 Hz | At least 95% of sampled intervals at or below 20 ms during controlled interaction | Native CADisplayLink histogram plus JS event-loop latency; idle adaptive frame rate excluded |
| ProMotion interaction, other compatible test phones only | Optional 120 Hz experiment; at least 95% intervals at or below 10 ms if OS grants 120 Hz | Outside the confirmed iPhone 14 Plus baseline; record actual granted cadence and thermal/power state |
| Chart-to-map selection latency | p95 under 100 ms | Scrub scripted positions and log selected timestamp to marker update |
| Long-session UI | No progressive slowdown or crash over 8 h | Replay 28,800 GPS samples plus 720,000 motion samples at 25 Hz, then a real 2–4 h ride |
| End session | Stop subscriptions immediately; no sustained callbacks beyond 2 s | Log all stop calls, outstanding deliveries and post-stop counters; location indicator/battery cross-check |
| Storage safety | No silent loss; every interruption leaves a visible gap/recoverable session | Simulate low disk, process termination and incomplete final chunk; verify sequence counters and recovery |

CADisplayLink measures callback cadence, not a perfect GPU or visual hitch trace; JS timers are not native FPS. Instrumentation itself adds overhead, so export both instrumented and minimally instrumented Release runs. iPhone Settings → Battery is a useful coarse cross-check, not per-sensor power measurement. [Apple display timing](https://developer.apple.com/documentation/quartzcore/cadisplaylink), [React Native release performance](https://reactnative.dev/docs/performance), [Apple battery-use view](https://support.apple.com/en-us/102432)

## Phase 1: research review

- Initial iPhone 14 Plus, iOS 26 and three vehicle profiles are confirmed above. Record remaining testers' devices and each test run's exact OS version.
- Review [research](../RESEARCH.md), especially the uncertainty table, signing limitations, and closed-course ranking policy.
- Public source hosting with standard GitHub-hosted macOS runners is selected for Phase 2. No personal routes/test reports belong in a public repository or Release.
- Collect an optional existing GPX and a description of its source. GPX cannot establish speed accuracy or authenticity; it is a geometry/replay fixture.
- Result this phase: documentation research only; hardware feasibility remains unmeasured.

## Phase 2: build and speedometer

**Pipeline first:** make one minimal Release IPA and one development-client IPA on the selected free cloud Mac. Inspect `Payload/App.app`, arm64 device platform, deployment target 17.0, bundle ID, build number and JS bundle. Re-sign/install with a free Apple ID. Test native module discovery, permission prompts, a 30-minute foreground recording baseline, expected pause when locked/backgrounded, offline Release launch, Windows Metro reload, and a second build installing over retained test data. Locked-screen continuity remains a separate roadmap gate. Repeat expiry/refresh testing after seven days before calling the friends' install path proven.

**Design before screens:** approve Thai light/dark screenshots including large text, denied permission, no fix and weak fix. A screenshot is a layout review, not a device measurement.

**Desk fixtures:** use the same pure TypeScript pipeline for real data, recorded-session replay and GPX import. Cover negative/missing speed uncertainty, NaN, timestamps out of order/future/stale, wall-clock changes, missing fixes, one/two spikes, sustained anomalous data, low speed drift, max reset, simulated-software location, accessory source, incomplete recording, and end-session teardown. Use a virtual clock; running a replay faster must not change the result. Mark replay/import as permanently ineligible for rankings. Jest tests are planned; the current prototype uses Node's test runner.

**Field matrix:** five minutes stationary outdoors; several ten-second steady speeds; ordinary acceleration/deceleration; trees/tall buildings; entering/exiting a tunnel; phone locked; switch apps; a phone call; Low Power Mode; denied location; approximate location; denied Motion & Fitness; no internet; a repositioned mount. Do not force the phone into dangerous mounting positions just to create a bad fix.

**Exit evidence:** no one-sample record, visible `—` during unreliable intervals, retained raw data/gap flags, successful export, data surviving an update, native sensors stopping, and a two-hour battery baseline. Share a report manually through the iOS share sheet; the button must not silently email anyone.

## Phase 3: ride statistics

Compare a measured loop with a calibrated wheel computer; do at least three repeats including stops. Compare elevation on a hill with independently known endpoints and repeat a flat circuit to expose cumulative noise. A known endpoint height tests net change, not every metre of cumulative ascent. Log wind/weather and barometer drift. Verify moving/stopped/manually paused/unknown time sum to elapsed time, no tunnel chord is counted as measured distance, and unavailable intervals reduce coverage.

Use 1 h and 8 h recorded traces for map/chart navigation. Check extrema against full-resolution data and confirm that selecting a chart point highlights the correct sample. Export GPX and a full backup, restore to a clean test installation, and compare ride IDs/counts/checksums. Uninstall only after independently validating the backup. Re-run battery and launch measurements.

## Phase 4: performance tools

On an authorized closed course compare multiple acceleration/braking runs against a high-rate reference, with no-rollout and one-foot-rollout results separated. Capture both threshold brackets and reference uncertainty. Report bias, distribution and worst case; never certify hundredths from 1 Hz data just because the UI formats two decimals.

For G, test the same controlled maneuver with several fixed mounting angles, static tilt, a bumpy surface, and remounting mid-session while stopped. Require recalibration after mount movement. Straight braking plus a vertical bump should not become two hard-brake events. For bicycles/motorcycles, test lean and handlebar steering explicitly using an arrangement consistent with the mounting guidance above. The S1000RR requires suitable independently mounted reference equipment for vehicle motion; a carried phone or external GNSS receiver alone cannot establish calibrated vehicle-axis G.

For laps, cross a surveyed start/finish gate in the correct and reverse direction, run nearby on a parallel path, stop on the gate, cross during a GNSS gap, and miss a sector. Compare at least ten laps to a transponder or reference timer. Test auto-laps crossing more than one distance boundary between samples. Lap comparisons use the same course/version/direction and matching distance, not nearest points from different track branches.

## Phase 5: routing

Use at least 20 manually reviewed routes spanning Thai Bangkok streets, rural roads, bicycle paths, ferries, bridges and restricted expressways, plus routes in another country before claiming worldwide quality. Compare legal access/profile choices, detours, one-way roads, missing paths and map freshness. Verify SDK/runtime cycling availability on the actual iOS 17 test phone. Test rate limits, lost network, saved route following, and clear failure when offline rerouting is unavailable. Re-run battery with guidance active.

## Phase 6: leaderboards

Submit real, replayed, truncated, duplicated, reordered, forged, oversized and compressed-bomb fixtures. Test absent/false spoofing flags and physically plausible fabricated data: server recomputation cannot prove authenticity. Verify only server-approved records appear, RLS isolates private evidence, invite access works, reports flag records, and raw retention/deletion behaves as documented. Test anonymous-account loss and recovery before friends depend on it.

Check global/country/friends filters, separate vehicle and receiver classes, UTC weekly/monthly boundaries, course versions, rollout policy, and uncertainty ties. Check that hidden start/end points cannot be recovered from public polylines, event markers, chart endpoints, download URLs or metadata. Test quota rejection while recording continues locally; no automatic paid-plan upgrade.

## Current V5 native acceptance

Current V5 source uses MapLibre + OpenFreeMap with consented server-side Geoapify search/routing, bilingual controls, owner-scoped durable rides and garage/routes, and the current Ranked/Community flows. Recording remains foreground-only. Published build9 uses Apple Maps and predates this source. Successful Android/iOS compilation at `adfd511333793e79220a2e6fd77f81a18c06985e` also predates M6/M7 and the accepted M8 motion correction. Expo exports, browser checks and source tests do not prove that those newer features are compiled into an installed native app.

Start with a fresh custom development/Release build from the exact reviewed V5 commit; record its source SHA, package hash and installed build number. Expo Go and an older IPA/APK cannot verify the current native modules. No current M7/M8 native compilation, installation, frame-rate or battery result is claimed here.

| Area | Existing source/browser evidence | Next installed-device acceptance |
|---|---|---|
| Packages and lifecycle | Earlier native artifacts and current all-platform exports are recorded separately in the milestone acceptance documents. | Build the reviewed source for iOS and Android, validate package/source hashes, launch without Metro, update over retained owner data, and test restart/signing expiry. |
| Accounts and privacy | Genuine Google sign-in, Map/Profile `@arnalxz`, empty Community and owner post-settings reads work after API recovery. Empty reads do not prove publication or photo handling. | Complete onboarding, restart the session, switch accounts without exposing another owner's data, and exercise error/offline recovery with consenting accounts. |
| Map, HUD and rides | Real MapLibre maps/provider routes and durable segmented ride/storage behavior have source/browser checks. | Test long-press/drag, safe areas, landscape, recenter, denied/approximate/services-off GPS, start/pause/resume/stop, crash recovery and expected lock/background pause. Measure cold start and pan/zoom with 50 markers. |
| Garage and profile | Catalog, owner sync, immutable photo reservations and account-isolation/retry behavior have source checks. | Add PCX160/S1000RR/Civic RS as genuine user choices; test native photo preparation, retry/restart, selection and owner-isolated update recovery. |
| Community and Ranked | Genuine empty boards/feed/settings and strict source authorization, attachment/media and publication recovery are checked. | With consenting accounts, test six-photo preparation, genuine ride/route attachments, sharing/revocation, comments/report/block and restart. A positive rank needs a genuine qualifying, explicitly shared result; do not seed fake records. |
| Friends and competition | Scoped link/invitation, consent, cancellation and evidence state machines have source tests. Convoy/race pilots remain disabled pending their operational gates. | Establish real friend acceptance and private managed sockets first; only then run approved-course paired-device consent, countdown, original evidence and finish-interval checks. A checkbox never grants operator approval. |
| Motion and accessibility | Actual-provider regressions cover batched resume, stale held-render denial, retained-player recovery, unknown/low power, Reduce Motion and the two-player budget. | Test rapid background/foreground and power changes, off-screen pause, Reduce Transparency, Thai/English large text, VoiceOver/TalkBack focus and 44-point controls. Measure 60 Hz on iPhone 14 Plus and a mid-range Android; 120 Hz requires another supported device. |

Record observed values for cold start, 50-marker interaction, a 30-minute foreground ride, memory growth, battery/thermal behavior and frame pacing. Preserve original logs and metadata; no synthetic fixture or desktop benchmark supplies these measurements. The milestone [M2](design/m2-acceptance-v5.md), [M4](design/m4-acceptance-v5.md), [M6](design/m6-acceptance-v5.md) and [M7](design/m7-acceptance-v5.md) records distinguish source, hosted and device gates.

## Historical build9 native pilot: 1 October 2026

The owner authorized native implementation. This older pilot uses foreground-only Core Location capture, Apple Maps pin editing and Google/Supabase accounts. Its original locked-screen recording, durable SQLite journals/export/replay, English settings, driving navigation, later sensor tools and worldwide/country rankings were roadmap work. This paragraph records build9 limitations; current V5 durable storage and bilingual settings are described above. The broader phase exit criteria above are not all met.

Build **0.1.0 (9.1.0)** is from `df1e7db` in [run #9](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36750133009). Verification, Release and development jobs passed. Both unsigned IPAs and their metadata/checksum files are published in the [native preview release](https://github.com/startupbydekkmitl001-pixel/ride-speed/releases/tag/preview-0.1.0-build9). Both downloaded archives and IPAs passed SHA-256, structure and exact version/build/source checks. The Release IPA contains its JavaScript bundle, both card videos and bundled fonts. This establishes packaging, not installation or device performance.

Browser acceptance completed: real Google consent/callback; cloud profile save and reload; private account gates opening; friend controls and approved-course empty state; live empty rankings; two synthetic local route stops saved/reordered and retained after reload. The synthetic route is explicitly labelled a test and was not synced or published. Rider-card looping pauses for reduced motion and navigation. Preview checks do not verify native FPS, Apple Maps gestures or GPS.

Historical build9 device sequence: sign that release IPA; open without Metro; sign in with the same Google account; add a vehicle; test its Apple Maps pins; change rider-card picture; toggle Reduce Motion; then test foreground location start/stop, denied/approximate permission and background stop while stationary. This sequence does not verify current V5 MapLibre, media or Ranked. Use the fresh-build matrix above for those features. Two consenting accounts are needed to finish real friend acceptance, media visibility and private presence checks. Do not seed fake ranked records to make an empty screen appear populated.

## Results log

| Phase | Date/build/device | Software checks | Device accuracy | Battery | Rendering | Decision |
|---|---|---|---|---|---|---|
| 1 | 2026-09-30 / documentation / no device | Source/consistency review; existing prototype 12/12 tests, typecheck and lint pass; Node module-type warning; no product changes | Not measured | Not measured | Not measured | Review research before Phase 2 |
| 2 build preparation | 2026-09-30 / 0.1.0 / Windows checks | 12/12 prototype tests; 6/6 IPA fixture tests; lint/typecheck/configuration, Bash/YAML/Python checks pass; production install excludes dev client; independent review corrected deployment-target validation | Not measured | Not measured | Not measured | Cloud compile and Sideloadly test pending; screen draft needs revision |
| 2 first cloud build | 2026-09-30 / 0.1.0 (2.1.0) / Xcode 26.4.1 / [run #2](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36725855154) | Linux verification and both Mac jobs passed; device arm64/iOS 17 packaging verified; downloaded Release and development SHA-256 matched metadata | Not measured | Not measured | Not measured | Historical prototype; superseded by native preview; installation untested |
| Native/online revision | 2026-10-01 / 0.1.0 (9.1.0) / `df1e7db` / Windows browser + [run #9](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36750133009) | 58 app, 18 backend, 12 build-script tests; typecheck/lint/config pass; live Google/profile and Edge denial/CORS checks pass. Release/development compilation and both downloaded IPA checks pass | Not measured | Not measured | Browser layout/loop controls checked; native not measured | Both unsigned IPAs published; device installation and two-account acceptance pending |

Each later phase adds actual figures and attaches exported logs. “Not measured” is a valid result; invented values are not.
