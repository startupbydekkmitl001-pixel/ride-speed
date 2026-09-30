# Field tests and performance evidence

Phase 1, 30 September 2026. **No new IPA has been built or installed, and no device/battery/accuracy measurements have been made in this phase.** The existing Expo Go prototype is not evidence that native recording works while locked.

## Measurement rules

For each run record app/build/algorithm versions, iPhone model, iOS version, battery health, mount/vehicle, temperature, screen brightness, power mode, permissions, precise-location state, and reference instrument. Save original timestamps and quality flags. Compare matched time windows, not two displays viewed at different times. Account for display and receiver latency.

A calibrated wheel sensor is useful for bicycle steady speed/distance; a vehicle dashboard is only a cross-check, not ground truth. Use a validated 10–25 Hz receiver or track timing system for performance timing. Borrow equipment if possible; an external receiver purchase is not required for v1. Mark every reference's own uncertainty. Testing 0–100 or emergency braking belongs on an authorized closed course with appropriate supervision, not in traffic.

## Confirmed device and vehicles

Confirmed by the user on 30 September 2026. These are planned validation profiles, not completed tests. Record the exact iOS 26 patch/build in test logs. Vehicle model years/modifications, cases and mounts remain unspecified; no single primary vehicle has been selected.

| Device or vehicle | Role | Specific validation |
|---|---|---|
| iPhone 14 Plus, iOS 26 | Initial phone baseline | Actual Core Location/motion/barometer cadence and uncertainty; permission behavior; at least 30 minutes locked recording; battery/thermal use; 60 Hz rendering target |
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

**Pipeline first:** make one minimal Release IPA and one development-client IPA on the selected free cloud Mac. Inspect `Payload/App.app`, arm64 device platform, deployment target 17.0, bundle ID, build number and JS bundle. Re-sign/install with a free Apple ID. Test native module discovery, permission prompts, at least 30 minutes of locked recording, offline Release launch, Windows Metro reload, and a second build installing over seeded data. Repeat expiry/refresh testing after seven days before calling the friends' install path proven.

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

## Results log

| Phase | Date/build/device | Software checks | Device accuracy | Battery | Rendering | Decision |
|---|---|---|---|---|---|---|
| 1 | 2026-09-30 / documentation / no device | Source/consistency review; existing prototype 12/12 tests, typecheck and lint pass; Node module-type warning; no product changes | Not measured | Not measured | Not measured | Review research before Phase 2 |
| 2 build preparation | 2026-09-30 / 0.1.0 / Windows checks | 12/12 prototype tests; 6/6 IPA fixture tests; lint/typecheck/configuration, Bash/YAML/Python checks pass; production install excludes dev client; independent review corrected deployment-target validation | Not measured | Not measured | Not measured | Cloud compile and Sideloadly test pending; screen draft needs revision |

Each later phase adds actual figures and attaches exported logs. “Not measured” is a valid result; invented values are not.
