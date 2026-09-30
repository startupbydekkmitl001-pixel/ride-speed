# Ride Speed — Phase 1 research

**Research date: 30 September 2026. Status: research and proposed architecture; no hardware accuracy claim.** The brief is handled one phase at a time. Phase 2 build preparation has now begun; its first deliverable is an unsigned-build/sideload smoke test, followed by approved screen mockups and the native speedometer.

## Recommendation

Keep **Expo + TypeScript**, add a small **Swift sensor recorder with durable native storage**, and share a versioned TypeScript analysis core between live use, replay, tests and later server verification. Use **SQLite for local indexing**, **Apple Maps for display**, and **Supabase Free for the small-group leaderboard phase**. Build unsigned arm64 device IPAs on a free cloud Mac; each person signs on Windows with Sideloadly. See the [complete architecture](docs/ARCHITECTURE.md) and [build investigation](docs/research/build-and-sideloading.md).

The important corrections to the starting assumptions are:

1. `CLLocation.speed` is preferable to naïve point-to-point speed for the primary display, but Apple does **not** promise that it is always Doppler-derived. iOS exposes processed location/velocity and quality estimates, not Android-style raw satellite observables or GNSS mode controls. [Apple speed API](https://developer.apple.com/documentation/corelocation/cllocation/speed), [sensor evidence and device distinctions](docs/research/sensors.md)
2. Neither 1 Hz samples nor interpolation justify displaying a phone-only time as accurate to hundredths. Start/stop observability, OS filtering, quality and clock alignment matter. Separate approximate phone results from validated external-receiver results. [Timing analysis and metric table](docs/research/sensors.md)
3. The proposed async location API and a configurable `CLLocationManager` are different interfaces. Start with the manager for explicit controls and compare it with `liveUpdates` in a measured spike; keep only one acquisition path active. [Apple WWDC23](https://developer.apple.com/videos/play/wwdc2023/10180/)
4. Native recording must precede JavaScript delivery. A smooth UI is not enough if raw evidence vanishes during a JS stall or locked-screen lifecycle transition. [Architecture and recovery contract](docs/ARCHITECTURE.md)
5. A paid Apple Developer membership is **not inherently needed to compile an unsigned device app in the cloud**. Installation still requires re-signing and provisioning. Free-signing capabilities, expiry and update identity must be tested rather than assumed. [Sideloadly official guide](https://sideloadly.io/), [capability matrix](docs/research/build-and-sideloading.md)
6. Recomputing raw uploads catches many errors but cannot authenticate fabricated sensor data by itself. Keep moderated closed-course rankings, provenance classes and uncertainty; do not claim cheat-proof results. [Threat model and free backend comparison](docs/research/backend-and-routing.md)

## Full answers to all 24 questions

The linked reports contain direct sources for each answer, formulas, tuning proposals and explicit uncertainty. Numbers described as **targets**, **planning ranges** or **proposals** are not measured results or Apple guarantees.

| Question | Coverage | Detailed answer |
|---|---|---|
| 1 | Multi-constellation, L1/L5, Doppler, SBAS, RTK, PPP, iPhone hardware and API limits | [Sensors](docs/research/sensors.md) |
| 2 | Exposed iOS data versus Android raw GNSS; phone versus external limits | [Sensors](docs/research/sensors.md) |
| 3 | Later 10–25 Hz BLE receiver support, protocols and actual delivered cadence | [Sensors](docs/research/sensors.md) |
| 4 | Native speed versus position differencing and source uncertainty | [Sensors](docs/research/sensors.md) |
| 5 | iOS 17 location APIs, configuration, activity type, accuracy and background lifetime | [Sensors](docs/research/sensors.md) |
| 6 | Invalid/old/out-of-order fixes, speed/position uncertainty, multipath and gaps | [Sensors](docs/research/sensors.md) |
| 7 | Supported maximum windows, preserved raw peaks and spike rejection | [Sensors](docs/research/sensors.md) |
| 8 | Vehicle-specific plausible speed/acceleration/braking ranges and limits of inference | [Sensors](docs/research/sensors.md) |
| 9 | 0–100/100–0 uncertainty, interpolation, inertial fusion, rollout and maker methods | [Sensors](docs/research/sensors.md) |
| 10 | Gravity removal, arbitrary mount orientation, travel alignment, vibration and battery | [Sensors](docs/research/sensors.md) |
| 11 | Vehicle-specific hard-brake thresholds, duration, speed confirmation and bump rejection | [Sensors](docs/research/sensors.md) |
| 12 | GNSS/barometer/DEM elevation, relative versus absolute height, gain/loss noise | [Sensors](docs/research/sensors.md) |
| 13 | Moving/stopped/unknown time, hysteresis and auto-pause | [Sensors](docs/research/sensors.md) |
| 14 | Start/finish intersection, interpolated crossings, manual/distance laps and best-lap delta | [Sensors](docs/research/sensors.md) |
| 15 | MapKit/ORS/GraphHopper alternatives, Thai access/profile quality, quotas and offline limits | [Backend and routing](docs/research/backend-and-routing.md) |
| 16 | Long speed-colored tracks, Skia charts, LTTB and sample-linked selection | [Rendering and Thai](docs/research/rendering-and-thai.md) |
| 17 | Cloud prebuild, unsigned xcodebuild, Payload packaging, free build limits and EAS | [Build and sideloading](docs/research/build-and-sideloading.md) |
| 18 | Free Apple ID feature matrix, seven-day refresh, app limits, Developer Mode, updates | [Build and sideloading](docs/research/build-and-sideloading.md) |
| 19 | Windows Metro + signed development client, native-change rebuilds and logs | [Build and sideloading](docs/research/build-and-sideloading.md) |
| 20 | Server verification, simulation/accessory flags, vehicle inference and remaining cheats | [Backend and routing](docs/research/backend-and-routing.md) |
| 21 | Supabase/Workers+D1/Firebase free limits, verification compute, queries and login | [Backend and routing](docs/research/backend-and-routing.md) |
| 22 | Local raw storage, candidate windows, compression, quotas and retention | [Backend and routing](docs/research/backend-and-routing.md) |
| 23 | Closed-course ranking rules and privacy zones across every public representation | [Backend and routing](docs/research/backend-and-routing.md) |
| 24 | Thai fonts, combining marks, line height, accessibility, dates/numbers and native strings | [Rendering and Thai](docs/research/rendering-and-thai.md) |

## Required comparison tables and practical guides

- **Expected accuracy for every metric, phone and external receiver:** the [sensor report's accuracy table](docs/research/sensors.md), including conditions and unsupported guarantees.
- **Free-Apple-ID features and workarounds:** the [build report's capability table](docs/research/build-and-sideloading.md).
- **Backend and routing quotas:** the [backend comparison](docs/research/backend-and-routing.md), with billing-plan boundaries and fallback behavior.
- **Five open-source projects:** [reference table](docs/research/rendering-and-thai.md): Overland, Open GPX Tracker, OutRun, RaceChrono BLE DIY and react-native-graph.
- **Windows setup, cloud build, install, fast reload and logs:** [developer steps](docs/research/build-and-sideloading.md).
- **Thai installation guide for friends:** [คู่มือติดตั้ง](docs/INSTALL_TH.md), a draft to validate with the first IPA.
- **Design tokens and Thai wording for native-speaker review:** [design proposal](docs/research/rendering-and-thai.md). Requested screenshots precede screen implementation in Phase 2.
- **Battery/launch/rendering targets and per-phase tests:** [test plan](docs/TEST_PLAN.md). All device metrics are currently unmeasured.
- **App Store migration checklist:** [architecture](docs/ARCHITECTURE.md).

## Evidence and uncertainty

Primary evidence includes Apple API documentation and WWDC, official Expo SDK 57 docs, provider pricing/limits, published GNSS research, manufacturer protocol/specification material and source repositories. Community searches cover the requested Reddit categories and Stack Overflow; they identify failure cases and usability preferences, not calibration constants. X/Twitter yielded no sufficiently verifiable technical evidence in this pass. Detailed community notes are in the individual reports.

Public pages can change, and some present misleading historical examples. In particular, do not carry forward old private macOS build multipliers without checking current billing; do not equate an Apple Maps feature listing with verified `MKDirections` behavior on iOS 17; do not turn a vendor's sample rate, display resolution or marketing accuracy into a confidence bound. The reports call these out explicitly.

The confirmed initial phone is **iPhone 14 Plus running iOS 26**, with **Honda PCX160, BMW S1000RR and Honda Civic RS** as the initial vehicle profiles. Apple lists multi-constellation location support, a barometer, gyro and accelerometer for this phone; its specification does not advertise precision dual-frequency GPS. Do not assume Pro-model GNSS capabilities or infer a speed-error bound from the hardware list. [Apple iPhone 14 Plus specifications](https://support.apple.com/en-us/111854)

The remaining real-device questions are: observed sensor cadence, motion delivery while locked, signing and refreshing the chosen IPA, data survival across updates, native library compatibility, actual energy use, and accuracy against a reference. Record the exact iOS 26 patch/build with test logs. Other testers' phones, vehicle model years, modifications and mounts remain unspecified. The [test plan](docs/TEST_PLAN.md#confirmed-device-and-vehicles) now distinguishes the three vehicles and Apple's motorcycle mounting guidance. No device results have been measured.

## Phase boundary

Phase 1 delivers the research and recommendations. It does not include a new IPA, published release, deployed backend or completed screen design. The existing foreground Expo Go prototype remains in place; its earlier notes are preserved in [docs/legacy](docs/legacy/README-prototype.md), including superseded assumptions. Do not use those historical build conclusions as the current plan.

The phone, iOS major version and vehicle profiles are confirmed. The user selected **public source hosting with standard GitHub-hosted macOS runners** and Phase 2 preparation has begun. The first screenshot proposal requires revision, so screen implementation remains pending. Later phases wait for you and your friends to test the preceding phase, as requested.
