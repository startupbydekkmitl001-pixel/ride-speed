# Live Friends — implementation brief

## Detected stack and direction

The shipping source is Expo SDK 57 / React Native 0.86.3 / React 19.2.3,
TypeScript, Expo Router, MapLibre RN 11.4.0 and GL JS 6.11.2, OpenFreeMap,
server-side Geoapify, and Supabase Auth/Postgres/RLS/Realtime. Retain this stack.
The supplied SwiftUI/AVPlayer suggestions describe the desired native experience;
Reanimated worklets and the existing expo-video lifecycle are the equivalents here.
The first pass uses existing rendering libraries. Expo Asset 57.0.18, already an
indirect Expo dependency, is now declared directly and its config plugin enabled
to resolve bundled vehicle sprites in the web map. No new 3D engine is installed.

Black #000000, raised #0A0A0A, orange #FF5A1F for actions, green #2EE6A6 for
shared positions. Anuphan for Thai/English interface text; tabular Manrope for
numbers. Keep Thai leading 1.55. One glass container per neighboring control group;
44–52 pt targets. No continuously animated blur. Motion must not imply verification.

Map remains the main surface. Small round friend controls form a rail; tapping one
centers the map without opening another screen. Readout and ride terminal actions
remain accessible in the bottom card. A dedicated, clearly labeled local preview
lets one person inspect movement without starting GPS or uploading simulated rides.

## Marker strategy (before implementation)

| Approach | Benefit | Cost / limitation |
| --- | --- | --- |
| MapKit + RealityKit/SceneKit overlay | Native Apple rendering and real meshes | iOS only; must synchronize projected positions, occlusion, camera and gestures; rewrites current map |
| Mapbox model layers | True map-space models | Provider/SDK migration, access-token/account/pricing review; model support is platform/version dependent |
| Directional sprites / vector markers | Current free map, bounded memory, cross-platform | 2.5D illustration, not a true map-space mesh; separate rotatable picker required |

Use the third option for live markers. Do not label a sprite as a real 3D map model.
Keep meshes original and generic rather than unlicensed manufacturer replicas.
Source: [Mapbox model layer example](https://docs.mapbox.com/ios/maps/examples/3D-model-layer/).

## Files and milestones

1. `features/map/peerPresentation.ts`, native source bridge, web renderer:
   reuse the consent-bound motion model, conserve sequence/deadline identity,
   interrupt safely, snap on discontinuities, clear removed peers immediately.
   Regression coverage: duplicate snapshots, expiry, revoke, consent/topic changes,
   reduced motion, dateline and 50-peer bounded work. No React state per frame.
2. Map home and a small `LiveFriendsRail`: one-tap focus, safe cached recenter,
   zoom controls, translations, selected garage chip; retain short-web-window
   layout/accessibility work. Local preview owns its simulated samples and never
   calls capture, evidence, backend or route-saving code.
3. Vehicle picker: generic original lightweight meshes, rotatable preview and
   accessible rotate controls, Garage selection, provenance. Friends' chosen model
   requires an additive versioned server contract; current v1 positions contain
   heading but **no avatar, speed or vehicle**. Never invent those fields for real peers.
4. Destination/share and arrival challenge: reuse route search/snap/save and
   private session authorization. Server-owned destination revisions, participant
   acceptance, accurate-fix arrival detection and idempotent results are required.
   Existing convoy locations are explicitly unverified and cannot decide winners.
5. CarPlay research precedes native scene implementation; no entitlement is assumed.

## CarPlay and external gates

Candidate category: Driving Task for useful trip coordination. Navigation requires
actual turn-by-turn navigation, not just a route line. Apple decides eligibility.
Prepare team/app identity, bundle ID, a concrete driving-task explanation, intended
templates/actions and screenshots/video of the core app for the entitlement request.
Check the current request form for its exact fields; do not submit agreements for
the user. [Apple CarPlay](https://developer.apple.com/carplay/) links the request,
developer guide, design guidance and CarPlay simulator tools.

No typed destination, feed, racing animation or avatar-heavy map in CarPlay. Use
CPListTemplate/CPInformationTemplate and voice actions only within the approved
category. A native bridge must share the authoritative session/consent snapshot,
clear it on sign-out/end, and avoid starting JS-owned GPS from a disconnected scene.
Test an enabled, provisioned development target on macOS with Xcode's CarPlay
simulator, then a real head unit. This Windows session cannot certify those tests.

Live pilot activation, retention operation, background capture, Apple entitlement
and physical-device performance remain separate gates. Existing approval for the
three photo worker gateway settings does not approve Cron/Vault changes or enable
live races. iPhone 14 Plus is a 60 Hz device; ProMotion claims require other hardware.

## Source delivery status

Implemented: native Reanimated source interpolation and UI-thread expiry gate;
web transform markers; consent/membership/topic/sequence fencing; a duplicate
snapshot cannot extend either the displayed point or its interpolation history.
Unknown movement is no longer labeled riding. Round initial avatars are explicit
fallbacks until recipient-authorized profile images exist in the API.

Map home now supports friend focus, zoom, cached one-tap recenter while moving,
Garage vehicle selection and category sprites, time/distance in the driving HUD,
and four shared glass material groups at normal phone size. The recenter action
does not request permission while moving. Existing privacy, foreground capture,
movement locks and closed-course race gates are retained.

The rotatable picker uses original procedural meshes and a matching glTF export;
all three meshes total 128,982 bytes, and their transparent 128 px sprites total
2,027 bytes. Licenses and regeneration are in `ExpoRideSpeed/assets/vehicles/`.
Native uses Skia + Reanimated; web redraws a canvas on interaction. The picker
reuses the existing per-category Remotion loops and central playback policy.
Starting to drive replaces the picker with its glance-only return action. A
backgrounded save cannot navigate on return, and rapid double taps submit once.

The browser review also found a pre-existing Ranked guest-flow defect: the host
applied its authenticated-read guard to the sign-in and method-information
buttons. Navigation now checks account/activity/movement independently; actual
board reads remain authenticated. Signed-out visitors no longer see a stale
private-board error alongside the sign-in prompt.

`/live-map-preview` is a **development-only** screen with three clearly labeled
sample riders. It does not call GPS, publishing, route saving or verification.
It has play/pause, hide/show and a camera-focus rail. Distribution builds redirect
away from it. The picker provides its entry point in development.

Not implemented by this UI milestone: real peer avatar/speed/vehicle propagation,
per-session speed visibility, destination stake/arrival-order challenge, and the
CarPlay scene/voice bridge. Existing route search, saved routes and private convoy
flows remain available. The v1 positions API cannot supply those new metadata
fields or verify arrivals. The live pilot remains disabled pending its existing
operational/device gates; no synthetic data was submitted to Supabase.

No native FPS, battery, 30-minute memory, two-phone location or CarPlay entitlement
claim follows from a web preview or successful bundle export. The previous IPA/APK
release is unchanged; this source needs a new native build and on-device checks.

## Verification recorded on 1 October 2026

- App unit/integration suite: **1,016 passed, 0 failed**. New regression tests
  first failed for deadline-history renewal and reversed triangle occlusion, then
  passed after their fixes. The full existing suite remains enabled.
- Guest Ranked navigation and vehicle-picker driving/background/double-tap
  regressions also reproduced before their fixes and passed afterward.
- TypeScript and Expo lint passed. Build configuration checks passed for release
  and development variants; nine native-library/build-gate checks passed.
- Expo export completed for **iOS, Android and web**. This compiles JavaScript/
  Hermes bundles, not an Xcode/Gradle binary or an on-device performance result.
- Actual browser checks: Thai map at 428×926; 932×430 map with all controls at
  least 44 px, legal credits visible, side HUD and ride actions unobscured;
  simulated markers hide immediately and return; rotatable generic picker loads.
- Evidence/logs: `build/review-v5/live-friends/`, `build/live-map-test-log.txt`,
  `build/live-friends-export.log`. These local artifacts are not shipped app data.
