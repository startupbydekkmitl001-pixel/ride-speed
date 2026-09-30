# M2 map, HUD and durable rides — V5

Source verification date: 1 October 2026. Native binary and physical-device results are separate below.

The logged-in home is a real edge-to-edge MapLibre map, with OpenFreeMap data and visible OpenFreeMap/OpenMapTiles/OpenStreetMap credits. Dark roads sit on pure black; Thai/English styles retain local name fallbacks and verified Thai glyphs. The renderer receives validated positions from one global ride provider, without starting its own GPS watcher. Map controls include recenter, appearance, friends, history and entry points to routes/challenges; search, road snapping and real peer positions belong to M4/M5.

The compact glass HUD expands into a solid black instrument. Its spring needle and fixed-width rolling digits use Reanimated shared values; uncertain speed stays unavailable and confirmed maximum remains independent. Expanded mode hides the map and its attribution together, preserving the renderer rather than covering attribution with statistics. Native expanded mode permits landscape and restores portrait afterward. Web portrait is visually checked; the browser viewport capability did not produce the requested landscape dimensions, so landscape is not claimed as browser acceptance.

One app-level provider survives screen changes. Recording intent is durably saved before acquiring GPS. SQLite WAL transactions on native and IndexedDB on web persist exact raw receipts, bounded checkpoints, separate pause/rejected-fix fragments, immutable starting vehicle and summary metadata. Actual acquisition starts the monotonic active clock; clock anomalies retain observed UTC values. Recovery marks interrupted recording and never invents samples or an elapsed gap. Capture pressure/size caps stop acquisition explicitly. Foreground-only recording and screen-lock behavior remain visible in the UI; background recording is not implemented.

Completed rides save locally even if cloud projection exceeds its bounds. The frozen summary/operation retries without changing bytes, account token or revision. Failed requests wait for a scheduled/foreground/online/manual trigger. An acknowledged server operation followed by a disk failure retains its authoritative queued checkpoint; it cannot be overwritten by an older pending draft. Owner history reads are separate from raw proof, and every row is explicitly self-reported. Confirmed deletion closes owner queues, stops collection, rejects retained actions and cannot clear another account.

Movement above 10 km/h locks editing outside the map. Pause or GPS loss does not prove the vehicle has stopped: the last confirmed lock remains until a fresh suitable stationary reading or explicit passenger override. Account changes reset the UI while rejecting late old work.

## Verified evidence

- 193 app tests pass, covering native session identity/quality, durable queue/provider races, summary transport and presentation. Six tests execute the actual adapter SQL on SQLite and the actual IndexedDB adapter against a standards emulator, including owner collision, receipt recovery and deletion beyond the 500-row display cap.
- 55 backend tests pass. M2 additive SQL is deployed at the exact hash recorded in `backend/DEPLOYMENT.md`; independent review found no contract blocker.
- Typecheck, lint and all 21 Expo doctor checks pass. Both native configurations, 20 Python build/package checks and 8 Node native-library/preview-gate checks pass; both build scripts pass shell syntax checks.
- All-platform Expo export passes for web, iOS Hermes and Android Hermes. This verifies module resolution/bundling and does not substitute for native compilation. Both renderers validate all four base styles and dynamic overlays.
- Real browser map shows roads, Thai labels and attribution; keyboard zoom changes rendered geometry. Portrait screenshot dimensions are the actual 428 × 926 browser viewport, close to the iPhone 14 Plus CSS viewport. Expanded HUD shows unavailable GPS honestly and clear statistics on black. Real account history read succeeds and remains empty without seeded rides.
- Review proofs: `build/review-v5/m2/map-phone-thai.png`, `map-zoom-thai.png`, `speedometer-phone-thai.png`, `private-history-empty.png`, `schema-deployed.png` (ignored local artifacts).

## Native and device gates

MapLibre/SQLite/orientation require freshly rebuilt custom native apps; published build 9 predates V5. iOS and Android cloud compilation status must be recorded against their initiating commit after the new pipeline runs. The Android preview uses an explicitly public debug certificate and is not a store release. iPhone IPAs remain unsigned and require the owner's own Sideloadly signing.

GPS pause/resume/recovery on iPhone 14 Plus and mid-range Android, Thai/font scaling in native glass, expanded landscape, location denial/services off, map 50-marker performance, cold-start timing, 30-minute memory/battery and native FPS are unmeasured. No 60/120 fps or 2-second loading claim is made. Routing, live friends, route-time race proof and richer motion remain later milestones.
