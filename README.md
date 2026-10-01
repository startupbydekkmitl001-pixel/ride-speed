# Ride Speed

**V5 map-first preview:** MapLibre + OpenFreeMap with server-side Geoapify routing/search for iOS and Android. The current source includes accounts, a real in-app map, private ride recording, garage, road routes, friends, qualified rankings and Community. Live convoy/race operation, physical performance and store release retain their separate acceptance gates. See [design brief](DESIGN_BRIEF.md), [milestone plan](PLAN.md), [decisions](DECISIONS.md) and [setup](docs/map-first-setup.md). Published build9 predates V5; exact source and package evidence are recorded separately.

V5 source includes M0 (black glass, bilingual theme and motion budget), M1 (owner-isolated accounts), M2 (fullscreen MapLibre maps, animated HUD and durable private rides), M3 (searchable vehicle catalog, EV kW, personal garage cards and private photo/sync handling), M4 (in-app search/road route builder, private owner geometry, trimmed sharing and durable edit/sync recovery), and M5A (friends, private status and paged invitations with durable operation recovery). These additive schemas/functions are deployed. M4's real scooter route shows4.1km/estimated8minutes, survives reload, and repeats from the private provider cache; its secret stays server-side. See [M1 acceptance](docs/design/m1-acceptance-v5.md), [M2 acceptance](docs/design/m2-acceptance-v5.md), [M3 acceptance](docs/design/m3-acceptance-v5.md), [M4 acceptance](docs/design/m4-acceptance-v5.md) and [M5A acceptance](docs/design/m5a-acceptance-v5.md) for exact source/browser evidence and device gates. M2 iOS release/development compilation succeeded in [manual run #12](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36783813984); M4 Android compilation and package validation passed [run #7](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36795867989). The matching iOS run verified source only. Published build9 remains historical; current7bb3665 preview packages and still-pending physical-device results are recorded below. Subsequent M5–M8 source and operational/device gates are recorded below and in PLAN.md.

M5B adds expiring private friend QR/links and foreground group-trip source, exact consent/cancellation recovery and privacy-fenced live map peers. Migration008 is deployed and its RLS/ACLs checked; live rooms remain disabled pending scheduled cleanup/private managed sockets/quotas/paired-device acceptance. See [M5B acceptance](docs/design/m5b-acceptance-v5.md). Friend links work independently of the room gate. M5C adds original-capture route-time race source, private approved-course maps, immutable evidence and receipt recovery; migration009 is deployed with its pilot disabled pending managed retention and installed-device acceptance. See [M5C acceptance](docs/design/m5c-acceptance-v5.md). The original28-loop dark/light family is integrated with the shared playback budget; Ranked and Community source are now implemented. Operational, physical and store acceptance remain separate.

A bilingual Thai/English iOS and Android speed and ride recorder for friends. Windows development, free-Apple-ID Sideloadly iPhone previews and free server tiers are retained.

M6 source adds genuine qualified speed/course-time boards, immutable vehicle-class filters, reviewed Private/Friends/Global result sharing and privacy-fenced reports. The signed owner browser accepted actual empty hosted boards and the separate qualified-results/saved-visibility pages. See [M6 acceptance](docs/design/m6-acceptance-v5.md) for exact source checks and remaining positive-record, two-account, realtime/moderation and physical-device gates. Successful Android/iOS builds at `adfd511` predate this M6 source; no new native installation or frame-rate result is implied.

**Historical native preview — built 1 October 2026:** **0.1.0 (9.1.0)** includes the revised UI, foreground Core Location capture, embedded Apple Maps route editor, garage, animated rider card and online community. Google sign-in and cloud profile saving passed a real browser acceptance check. Release and development builds passed [run #9](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36750133009) at `df1e7db`; both unsigned IPAs are published and their downloaded hashes and packages verified. Installation, GPS and frame rate on the iPhone 14 Plus remain untested. The earlier run #2 IPAs contain the old prototype.

**Confirmed test setup:** iPhone 14 Plus running iOS 26; Honda PCX160 and BMW S1000RR motorcycle profiles; Honda Civic RS car profile. The user selected public source hosting and standard GitHub-hosted macOS runners. See the [device and vehicle test matrix](docs/TEST_PLAN.md#confirmed-device-and-vehicles).

**Public repository:** [startupbydekkmitl001-pixel/ride-speed](https://github.com/startupbydekkmitl001-pixel/ride-speed). The [screen review](docs/design/phase2-speedometer-v1.md) records the proposed design and requested revisions.

**Historical build9 installation:** download `RideSpeed-0.1.0-9.1.0-release-unsigned.ipa` from the [native preview release](https://github.com/startupbydekkmitl001-pixel/ride-speed/releases/tag/preview-0.1.0-build9) and follow the [Thai install guide](docs/INSTALL_TH.md). Sign this unsigned IPA with your own Apple Account through Sideloadly. The Release app includes its JavaScript bundle and does not need Metro; the development IPA is for Windows reload testing. This older package predates V5 MapLibre and the current Ranked, Community and motion source; rebuild the reviewed V5 commit before testing those features on a device.

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
- V5 source persists raw ride receipts and checkpoints in SQLite on native, IndexedDB on web; compressed private summaries sync independently of competition evidence. Share-sheet reports/full backups remain pending. Published build 9 holds pending evidence in memory.
- Unsigned device builds on a cloud Mac, followed by each person's own Sideloadly signing. Initial installation/update/expiry behavior is still untested.
- Supabase Free is deployed for accounts, private friend presence, routes, posts and verified rankings. Google is the public sign-in route; default Supabase email delivery is limited to the project team until custom SMTP is configured. See [deployment evidence](backend/DEPLOYMENT.md).
- Public competition only on approved closed courses, split by vehicle and evidence class. Recomputing sensor data cannot prove authenticity by itself.

Sources and caveats are in the documents above. Nothing here depends on buying a Mac or a paid Apple account for the test version.

## Free-tier operating policy

The user selected public source hosting and standard GitHub-hosted macOS runners. Keep short-lived CI artifacts, stable Release files, no Apple credentials in CI and no private ride data in public files. The [build report](docs/research/build-and-sideloading.md) records the dated limits and alternatives.

Keep recording functional offline. Upload only bounded qualifying evidence and refuse excess submissions when backend limits are near. Supabase email sending, inactivity pauses, storage, egress and function ceilings are explicit design constraints; Firebase's required paid billing plan for this verification/storage architecture rules it out under the current constraints. The [backend report](docs/research/backend-and-routing.md) contains the detailed quota table and budget calculation.

## Historical roadmap — published build 9

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

This table records the older build9 roadmap. For current V5 source, use [PLAN.md](PLAN.md) and the milestone acceptance documents above; it does not claim the new race, media, leaderboard or motion requirements are finished.

## Current app on Windows

M8 source `7bb3665` includes centralized Thai/Latin typography, grouped map glass controls, an accessible Ranked method sheet, motion lifecycle fencing and guarded native countdown haptics. That frozen source passed988 app and277 backend tests,6 motion checks,9 native-policy tests and21 packaging tests, all with zero skips; typecheck/lint and all-platform export also passed. All28 motion loops were rerendered after the theme-token change and remain byte-identical; the provenance manifest is refreshed. Actual iOS run30 and Android run17 compiled successfully; downloaded Release/development IPA and standalone APK identities, hashes, embedded code/native modules and56 media files were independently validated against this exact source. See [native proof](docs/research/native-7bb3665-package-validation.md), [V5 preview downloads](https://github.com/startupbydekkmitl001-pixel/ride-speed/releases/tag/preview-v5-m8-7bb3665), [Thai install guide](docs/INSTALL_TH.md) and [M8 acceptance](docs/design/m8-acceptance-v5.md). Installation/GPS/performance/store acceptance remain open; later source follow-ups are not inside those packages.

The later [web map layout fix](docs/design/map-web-layout-v5.md) removes the home-map560px cap, keeps short-wide HUD/controls/credits separated and preserves the moving readout after scrolling or pause/interruption. The app suite now passes1000 tests;27 focused cases, typecheck/lint and actual932/720/428 default-scale Thai browser checks pass. This is separate from compiled7bb3665 previews. The protected [Community cleanup source](backend/ops/M7_COMMUNITY_CLEANUP.md) passes18 focused PostgreSQL facade tests; extension/private-access setup, user-entered Vault credentials and permanent cleanup installation remain pending separate authorization.

Current V5 Community source includes a durable six-photo composer, genuine ride/route attachment review, Latest/Top week/Friends feed, comments/likes/save/report/block and owner sharing controls. Community and Ranked use SDK-compatible FlashList; source recycling checks are separate from measured native performance. See [M7 acceptance](docs/design/m7-acceptance-v5.md) and [deployment evidence](backend/DEPLOYMENT.md). The frozen M7 source passed961 app tests and277 backend tests with zero skips, TypeScript/lint and iOS/Android/web exports. The validated7bb3665 native previews below contain this slice; older build9 and adfd511 artifacts do not. Google login, the existing profile and genuine empty Community/owner-settings reads work after managed API pool recovery. Positive online photo/post and two-account acceptance remain pending.

The app uses Expo SDK 57, Expo Router, a local Swift Core Location module and Node tests. V5 preserves timestamps, accuracy/source flags and local journal receipts; recording remains foreground-only. Raw proof is separate from a self-reported cloud summary, and no display animation changes evidence. Published build 9 retains its earlier memory-only limitation. The sample GPX is not a replay feature.

With a compatible Node version and dependencies available, open PowerShell here:

```powershell
cd .\ExpoRideSpeed
npm ci
npm start
```

Use a freshly rebuilt custom development app for native GPS, MapLibre, SQLite and glass effects. Expo Go cannot load these native additions. The web preview shows real vector maps and online flows; it uses IndexedDB for local ride storage. Expo fallback samples do not contain native speed uncertainty and cannot qualify for rankings. Keep the app open and unlocked while recording. Start the development preview with `npm run start:dev -- --web --port 8082`; web export copies the pinned worker modules automatically.

Existing checks:

```powershell
npm test
npm run typecheck
npm run lint
```

At `df1e7db`, 58 app tests, 18 backend tests, 12 build-script tests, TypeScript and lint passed. Checks cover filtering, native payload transport, account races, capture ownership, immutable submission retries, URL decoding, database authorization and server evidence verification. Cloud compilation and real-device checks are separate gates. See [native capture](docs/native-location-v4.md), [route editor](docs/design/native-routes-v4.md), [card motion](docs/design/card-motion-v4.md), and [backend contracts](backend/API.md).

Earlier README/research copies are retained under `docs/legacy` as historical snapshots. Their statement that cloud building necessarily requires paid Apple membership is superseded by the new unsigned-build research.
