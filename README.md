# Ride Speed

A Thai-first iPhone speed and ride recorder for a private group of friends. Target: iOS 17+, Windows development, free-Apple-ID Sideloadly installs, and free server tiers.

**Current status: Phase 2 build pipeline verified in the cloud; iPhone installation remains untested.** Release and development unsigned IPAs were produced successfully in [build run #2](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36725855154). They contain the earlier foreground-only prototype. Native recording is not implemented yet, and the first screen proposal needs revision before UI implementation.

**Confirmed test setup:** iPhone 14 Plus running iOS 26; Honda PCX160 and BMW S1000RR motorcycle profiles; Honda Civic RS car profile. The user selected public source hosting and standard GitHub-hosted macOS runners. See the [device and vehicle test matrix](docs/TEST_PLAN.md#confirmed-device-and-vehicles).

**Public repository:** [startupbydekkmitl001-pixel/ride-speed](https://github.com/startupbydekkmitl001-pixel/ride-speed). The [screen review](docs/design/phase2-speedometer-v1.md) records the proposed design and requested revisions.

## Start here

| Document | Contents |
|---|---|
| [Research](RESEARCH.md) | Summary, all 24 question locations, sources and uncertainties |
| [Sensors](docs/research/sensors.md) | GNSS, speed, max filtering, timing, G, elevation, laps and accuracy table |
| [Build and sideloading](docs/research/build-and-sideloading.md) | Free signing feature table, cloud limits, unsigned IPA, Windows reload/logging steps |
| [Backend and routing](docs/research/backend-and-routing.md) | Free-tier limits, verification, login, privacy, country queries and routing |
| [Rendering and Thai](docs/research/rendering-and-thai.md) | Chart/map performance, design tokens, Thai typography/copy and five reference projects |
| [Architecture](docs/ARCHITECTURE.md) | Stack, data flow, lifecycle, delivery and App Store migration decisions |
| [Windows build steps](docs/BUILD_WINDOWS.md) | First unsigned cloud build, development client and versioned downloads |
| [Test plan](docs/TEST_PLAN.md) | Real-device checks, performance targets and result log for every phase |
| [คู่มือติดตั้งภาษาไทย](docs/INSTALL_TH.md) | Friends' Windows/Sideloadly installation draft |
| [Thai changelog](CHANGELOG_TH.md) | Documentation milestone; future IPA releases will add tested changes |

## Key decisions

- Expo/TypeScript UI and analysis, plus a Swift module that records native sensor payloads **before** batching them to JavaScript.
- Core Location speed and uncertainty; no claimed raw iPhone satellite access or guaranteed 1 Hz/Doppler implementation.
- A confirmed maximum, visible gaps and `—` for unreliable values. Replay uses the same versioned analysis and is excluded from rankings.
- Local raw session journals; SQLite for history/index/summaries; share-sheet reports and full backups.
- Unsigned device builds on a cloud Mac, followed by each person's own Sideloadly signing. Initial installation/update/expiry behavior is still untested.
- Supabase Free is recommended for the later 1–10-person leaderboard. Anonymous nickname accounts avoid a hidden email-delivery dependency, with recovery designed before use.
- Public competition only on approved closed courses, split by vehicle and evidence class. Recomputing sensor data cannot prove authenticity by itself.

Sources and caveats are in the documents above. Nothing here depends on buying a Mac or a paid Apple account for the test version.

## Free-tier operating policy

The user selected public source hosting and standard GitHub-hosted macOS runners; the first Release and development builds passed. Keep short-lived CI artifacts, stable Release files, no Apple credentials in CI and no private ride data in public files. The [build report](docs/research/build-and-sideloading.md) records the dated limits and alternatives.

Keep recording functional offline. Upload only bounded qualifying evidence and refuse excess submissions when backend limits are near. Supabase email sending, inactivity pauses, storage, egress and function ceilings are explicit design constraints; Firebase's required paid billing plan for this verification/storage architecture rules it out under the current constraints. The [backend report](docs/research/backend-and-routing.md) contains the detailed quota table and budget calculation.

## Feature checklist

| Phase | Deliverables | State |
|---|---|---|
| 1 | Sourced research, accuracy/capability tables, architecture, Thai install draft, test plans | Research delivered; device results unmeasured |
| 2a | Unsigned Release/dev IPA workflows, stable bundle ID, GitHub Release/changelog, update smoke test | Both cloud builds passed; first prerelease being prepared; installation/update untested |
| 2b | Approved screenshots, Thai/English, vehicle picker, light/dark speed/max/quality, native locked recording, raw logs/export/replay, Jest | First design needs revision; old foreground prototype only |
| 3 | Speed-colored map, ride stats/elevation, linked charts, history, GPX, backup/restore | Not implemented |
| 4 | Acceleration/braking tests, brake events, calibrated G/G-G, laps and comparisons | Not implemented |
| 5 | Free ride, route planning and following with offline limitations explained | Not implemented |
| 6 | Global/country/friends rankings, periods/vehicles, auth, server verification, moderation/privacy | Not implemented |
| Later | Direct BLE GNSS, Live Activity/Dynamic Island, Apple Watch, App Store migration | Research considerations only |

Finish and test each phase before moving to the next. Screenshots must be approved before Phase 2 screen implementation.

## Existing prototype on Windows

The code in `ExpoRideSpeed` currently uses Expo SDK 57 and a Node test runner. It lacks native speed accuracy/source flags, vehicle tuning, Thai localization, raw recording and locked-screen tracking. Its GPX file is a sample, not an implemented replay feature.

With a compatible Node version and dependencies available, open PowerShell here:

```powershell
cd .\ExpoRideSpeed
npm ci
npm start
```

Use Expo Go only to inspect the old foreground screen. Keep it open and unlocked. The native module planned for Phase 2 needs the separate development client described in the [Windows build guide](docs/research/build-and-sideloading.md).

Existing checks:

```powershell
npm test
npm run typecheck
npm run lint
```

On 30 September 2026, all 12 existing tests, typecheck and lint passed. Node emitted a module-type detection warning. No new native build or field test was run. These tests do not cover the newly requested source/spoofing or raw-recording functionality.

Earlier README/research copies are retained under `docs/legacy` as historical snapshots. Their statement that cloud building necessarily requires paid Apple membership is superseded by the new unsigned-build research.
