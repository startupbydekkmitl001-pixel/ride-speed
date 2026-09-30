# Ride Speed

**Map-first expansion in progress:** the owner selected MapLibre + OpenFreeMap with server-side Geoapify routing/search for iOS and Android. See [design brief](DESIGN_BRIEF.md), [milestone plan](PLAN.md), [decisions](DECISIONS.md) and [setup](docs/map-first-setup.md). Published build 9 below predates this expansion; milestone checks and release evidence are recorded separately.

V5 source has completed M0 (black glass, bilingual theme and motion budget) and M1 (owner-isolated onboarding/profile/privacy/avatar/deletion). M1 passes 125 app and 45 backend tests plus typecheck/lint/build configuration and browser Google-session checks. Its additive schema and account functions are deployed. See [M1 acceptance](docs/design/m1-acceptance-v5.md). These changes are not yet in a published IPA; map/recording work starts in M2.

A Thai-first iPhone speed and ride recorder for a private group of friends. Target: iOS 17+, Windows development, free-Apple-ID Sideloadly installs, and free server tiers.

**Current status — 1 October 2026:** native preview **0.1.0 (9.1.0)** includes the revised UI, foreground Core Location capture, embedded Apple Maps route editor, garage, animated rider card and online community. Google sign-in and cloud profile saving passed a real browser acceptance check. Release and development builds passed [run #9](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36750133009) at `df1e7db`; both unsigned IPAs are published and their downloaded hashes and packages verified. Installation, GPS and frame rate on the iPhone 14 Plus remain untested. The earlier run #2 IPAs contain the old prototype.

**Confirmed test setup:** iPhone 14 Plus running iOS 26; Honda PCX160 and BMW S1000RR motorcycle profiles; Honda Civic RS car profile. The user selected public source hosting and standard GitHub-hosted macOS runners. See the [device and vehicle test matrix](docs/TEST_PLAN.md#confirmed-device-and-vehicles).

**Public repository:** [startupbydekkmitl001-pixel/ride-speed](https://github.com/startupbydekkmitl001-pixel/ride-speed). The [screen review](docs/design/phase2-speedometer-v1.md) records the proposed design and requested revisions.

**Installation:** download `RideSpeed-0.1.0-9.1.0-release-unsigned.ipa` from the [native preview release](https://github.com/startupbydekkmitl001-pixel/ride-speed/releases/tag/preview-0.1.0-build9) and follow the [Thai install guide](docs/INSTALL_TH.md). Sign this unsigned IPA with your own Apple Account through Sideloadly. The Release app includes its JavaScript bundle and does not need Metro; the development IPA is for Windows reload testing.

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
| [คู่มือติดตั้งภาษาไทย](docs/INSTALL_TH.md) | Windows/Sideloadly installation and native preview checks |
| [Thai changelog](CHANGELOG_TH.md) | Current preview changes, verification and limitations |

## Key decisions

- Expo/TypeScript UI and analysis, plus a Swift module that records native sensor payloads **before** batching them to JavaScript.
- Core Location speed and uncertainty; no claimed raw iPhone satellite access or guaranteed 1 Hz/Doppler implementation.
- A confirmed maximum, visible gaps and `—` for unreliable values. Replay uses the same versioned analysis and is excluded from rankings.
- Planned: local raw session journals, SQLite history/index/summaries, share-sheet reports and full backups. The current pilot holds pending capture evidence in memory.
- Unsigned device builds on a cloud Mac, followed by each person's own Sideloadly signing. Initial installation/update/expiry behavior is still untested.
- Supabase Free is deployed for accounts, private friend presence, routes, posts and verified rankings. Google is the public sign-in route; default Supabase email delivery is limited to the project team until custom SMTP is configured. See [deployment evidence](backend/DEPLOYMENT.md).
- Public competition only on approved closed courses, split by vehicle and evidence class. Recomputing sensor data cannot prove authenticity by itself.

Sources and caveats are in the documents above. Nothing here depends on buying a Mac or a paid Apple account for the test version.

## Free-tier operating policy

The user selected public source hosting and standard GitHub-hosted macOS runners. Keep short-lived CI artifacts, stable Release files, no Apple credentials in CI and no private ride data in public files. The [build report](docs/research/build-and-sideloading.md) records the dated limits and alternatives.

Keep recording functional offline. Upload only bounded qualifying evidence and refuse excess submissions when backend limits are near. Supabase email sending, inactivity pauses, storage, egress and function ceilings are explicit design constraints; Firebase's required paid billing plan for this verification/storage architecture rules it out under the current constraints. The [backend report](docs/research/backend-and-routing.md) contains the detailed quota table and budget calculation.

## Feature checklist

| Phase | Deliverables | State |
|---|---|---|
| 1 | Sourced research, accuracy/capability tables, architecture, Thai install draft, test plans | Research delivered; device results unmeasured |
| 2a | Unsigned Release/dev IPA workflows, stable bundle ID, release delivery, update smoke test | Native preview Release/development builds passed and both IPAs published; installation/update untested |
| 2b | Revised UI, Thai/English, vehicle picker, speed/max/quality, native recording, raw logs/export/replay | Revised UI authorized and implemented; Thai-first, black/light themes, foreground native evidence. English switch, locked recording, durable ride journal/export/replay remain pending |
| 3 | Speed-colored map, ride stats/elevation, linked charts, history, GPX, backup/restore | Not implemented |
| 4 | Acceleration/braking tests, brake events, calibrated G/G-G, laps and comparisons | Not implemented |
| 5 | Free ride, route planning and following with offline limitations explained | Embedded Apple Maps pin editor, stop ordering and local/cloud routes implemented. Driving directions/following and offline map downloads are not implemented |
| 6 | Community, friends, rankings, auth, verification, moderation/privacy | Backend deployed; Google login/profile checked live. Posts, friend requests/private presence, group invitations, approved-course speed challenges and day/week/month category rankings implemented. Two-account/media/device acceptance and moderation operations remain pending |
| Later | Direct BLE GNSS, Live Activity/Dynamic Island, Apple Watch, App Store migration | Research considerations only |

The owner explicitly authorized native implementation after the revised design review. The requested online features were developed alongside the native UI; this does not imply that the original phased roadmap is complete.

## Current app on Windows

The app uses Expo SDK 57, Expo Router, a local Swift Core Location module and Node tests. Core Location evidence preserves native timestamps, accuracy and source flags. Recording is foreground-only and pending evidence is held in memory: do not use this build as the sole archive of important rides. The sample GPX is not a replay feature.

With a compatible Node version and dependencies available, open PowerShell here:

```powershell
cd .\ExpoRideSpeed
npm ci
npm start
```

Use a custom development build for native GPS, Apple Maps and glass effects. The web preview shows the real UI and online flows, but uses a coordinate editor in place of Apple Maps. Expo fallback samples do not contain native speed uncertainty and cannot qualify for rankings. Keep the app open and unlocked while recording.

Existing checks:

```powershell
npm test
npm run typecheck
npm run lint
```

At `df1e7db`, 58 app tests, 18 backend tests, 12 build-script tests, TypeScript and lint passed. Checks cover filtering, native payload transport, account races, capture ownership, immutable submission retries, URL decoding, database authorization and server evidence verification. Cloud compilation and real-device checks are separate gates. See [native capture](docs/native-location-v4.md), [route editor](docs/design/native-routes-v4.md), [card motion](docs/design/card-motion-v4.md), and [backend contracts](backend/API.md).

Earlier README/research copies are retained under `docs/legacy` as historical snapshots. Their statement that cloud building necessarily requires paid Apple membership is superseded by the new unsigned-build research.
