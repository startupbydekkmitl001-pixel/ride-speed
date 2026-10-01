# Ride Speed original motion materials

The M8 family contains 14 original material roles, each with a dark and light loop and a matching first-frame poster. Labels, profile pictures, vehicle photos, ranks, real countdowns and controls remain native UI above them. Dark reading areas are opaque `#000000`; light areas use `#FAFAF8`. Decorative light uses one warm `#FF5A1F` accent. There is no reference footage, copied layout/image, logo, audio or baked text.

The project uses the existing verified Remotion 4.0.531 stack. The user permits either Remotion or HyperFrames; no second renderer is required. All visual state comes from the current frame and a periodic analytical function, with no wall-clock timers, randomness or CSS animation. Frame N is a proof-only continuation frame identical to frame zero; the encoded video contains 0–N−1, avoiding a duplicated endpoint hold. Both position and analytic velocity repeat at the seam.

The direction is grounded in all seven design documents and the nine reviewed reference videos. In particular, the fixed-capsule/edge-light reference reinforces stable content; the arrow→check and tiny activity-symbol references belong to real native pending/confirmed feedback, so those stateful symbols are deliberately absent from these repeating backgrounds. Source names, layouts, colorful palettes and reference pixels are not redistributed. See the project `docs/design/reference-study-v5.md` for measured versus inferred findings.

## Re-render

Requirements: Node.js 22.18+ with native TypeScript stripping (verified with 24.14), a supported Chrome/Chromium executable, and FFmpeg/FFprobe on PATH. On this Windows workspace Chrome and FFmpeg are discovered at `C:/Program Files/Google/Chrome/Application/chrome.exe` and `C:/ffmpeg/`. To override discovery set `RIDE_CHROME_PATH`, `FFMPEG_PATH` and `FFPROBE_PATH` to executable paths. No credentials are required.

```sh
cd motion
npm ci
npm run render -- --all
npm run registry
npm run verify -- --all
npm run inspect
python scripts/inspect-encoded.py
node scripts/check-posters.mjs
npm test
```

Install the mobile app's dependencies once (`cd ../ExpoRideSpeed && npm ci`) before the delivery tests. Their registry check executes the actual TypeScript file with the app's pinned compiler; it does not substitute a duplicate registry model.

The render uses 1280 × 720, 60 fps, 360 or 480 frames, H.264/yuv420p with explicit BT.709 limited range, no audio, PNG frame capture and CRF 24. Explicit color space avoids Remotion 4's default full-range JPEG tagging and keeps black consistent on mobile decoders. The renderer bundles once and reuses one headless software-graphics browser for a batch. Encoding/proofs happen in ignored `motion/build`; only passing media is copied to `ExpoRideSpeed/assets/motion/v5/`.

The generated schema-2 `manifest.json` records all video/poster hashes and sizes, actual Node/Chrome/FFmpeg versions, render settings, component/role/theme mapping, safe zones, original authorship, source/lockfile hashes, proof-frame hashes and numerical seam/reading-zone evidence. `motion/validation/<asset-id>.json` is the per-output tracked evidence. Source hashes normalize UTF-8 CRLF to LF so Git's Windows text checkout does not invalidate the same source; media, proof and validation hashes use exact bytes. Each MP4 must be ≤1,500,000 bytes and the complete 28-output video+poster family ≤20,000,000 bytes. The old single-output `motion/validation.json` is historical M0 evidence, not the M8 family report.

For a single role/theme, use `npm run render -- --asset profile-license-light` and `npm run verify -- --asset profile-license-light`. Bare `npm run render` defaults to `garage-scooter-dark`. A batch only merges previously verified manifest entries from the same source snapshot. The registry generator refuses incomplete families or altered media. Do not run independent render batches concurrently into the same manifest.

`npm run inspect` additionally requires Python 3 and Pillow (`python -m pip install Pillow` in your chosen environment). It creates seam/quarter-cycle filmstrips, centered `cover` crops at 382×328 Garage, 375×490 license, 336×216 hero and 600×300 landscape HUD, and theme boards under `build/inspection`. These diagnostic images carry labels outside the material; they are not app assets. Crop and real native text/photo integration need human review after rendering.

`python scripts/inspect-encoded.py` creates equivalent crops/filmstrips from the actual H.264 output under `build/inspection-encoded`, including the encoded last→first seam. `node scripts/check-posters.mjs` separately checks each full-resolution JPEG against the first decoded video frame and saves `poster-validation.json`. Both source and encoded crops need inspection: a clean source render cannot establish compression quality.

## Family

| Role | Period | Intended use |
| --- | --- | --- |
| `garage-scooter` | 6 s | Rounded panel sleeve behind a real scooter card |
| `garage-bigbike` | 6 s | Chamfered facet behind a real motorcycle card |
| `garage-car` | 8 s | Broad lower roof bevel behind a real car card |
| `podium-first`, `podium-second`, `podium-third` | 6 s | Actual eligible rows only; increasingly quiet etched plates |
| `ranked-today` | 6 s | Narrow horizon below native period text |
| `ranked-week`, `ranked-month` | 8 s | Parallel bands / wider return contour |
| `auth-onboarding` | 8 s | One quiet sleeve hero reused for forms and onboarding |
| `empty-state` | 6 s | Fixed small open annulus; decorative, never a fake loader |
| `challenge-lobby` | 6 s | Fixed abstract parallel contours; no simulated racers/countdown |
| `speedometer-glow` | 8 s | Stationary expanded dashboard only; poster while moving/compact |
| `profile-license` | 6 s | Warm optical ridge behind native identity/photo |

Each explicit output ID is `<role>-dark` or `<role>-light`. The existing `garage-scooter` key aliases its dark entry without another bundled video. `src/catalog.mjs` owns motion periods, amplitudes, reading zones and original design descriptions; it imports color tokens directly from the app's sole `src/lib/theme.ts`, whose snapshot is also hashed. `src/MaterialLoop.jsx` owns the vector geometry. The legacy `GarageScooter` composition remains in Studio for historical reproduction, but is not a 29th family delivery.

To preview the composition locally:

```sh
npm run studio
```

This starts Studio on port 3035 without opening another browser window. Open `http://localhost:3035/profile-license-dark` or select a role/theme folder. Proof frames 0, 1, N/4, N/2, 3N/4, N−1 and virtual N are rendered under `build/proofs/<asset-id>/`. Encoded loops never include proof frame N.

## Seam verification

`npm run verify -- --all` checks codec, range/space/primaries/transfer, duration, exact frame count, 720p dimensions, 60 fps, absence of audio and size. It compares parameter/velocity endpoints, uncompressed source pixels, and every encoded frame at 320 × 180 RGB. Last-to-first motion must not exceed maximum ordinary MAE ×1.25 +0.12, an explicit quantization guard rather than a subjective quality claim. Encoded reading areas must retain their expected neutral color within four channel levels, vary by no more than three channel levels over the whole loop and provide nominal text contrast ≥4.5:1. The motion mask confirms some actual post-encode variation outside the safe zone. There is no assertion that encoded first/last frames are identical.

## Native integration

Exports from `ExpoRideSpeed/src/features/motion/index.ts`:

```tsx
import { AmbientLoop, MotionProvider } from './src/features/motion';

// Mount MotionProvider once inside AppProvider, around the routed app.
<MotionProvider>{children}</MotionProvider>

// The parent card clips the background and keeps its text/photo above it.
<AmbientLoop
  asset="garage-scooter"
  visible={cardIsOnScreen}
  style={StyleSheet.absoluteFill}
/>
```

Theme-aware registry exports live in `ExpoRideSpeed/src/features/motion/assets.ts`:

```tsx
import { resolveAmbientAsset, type MotionRole, type MotionTheme } from './src/features/motion/assets';
<AmbientLoop asset={resolveAmbientAsset('profile-license', dark ? 'dark' : 'light')} visible={focused} />
```

The resolver has no independent theme observer; pass the app's resolved theme. All requires are literal Metro paths. Do not key native labels/photos by video frame or put text inside the composition. The media-only M8 delivery does not itself wire new screens or replace their legacy adapters.

`visible` defaults to true for simple screen content. Scroll lists must supply actual viewability. The hook also checks screen focus, `useApp().motion` (including device and manual Reduce Motion), native foreground/inactive/background state and Low Power Mode. Unknown power state stays on the poster until the native read completes. Power is re-read when returning to the app. Native read or subscription failure keeps the poster. The browser uses Expo's documented unsupported `false` value and never calls the missing SDK 57 web listener; this is not a measurement of browser power mode. Low Power detection itself requires a physical supported device. Native events cancel older in-flight reads so a stale normal-power result cannot override a newer Low Power event.

There is one global FIFO budget with **at most two playing video leases**. Materials denied a slot show their local poster. Ineligible children do not mount a native player. A revoked player's pause callback runs synchronously before another loop receives that slot. Muted loops mix with existing device audio; background playback, external playback, picture-in-picture and native playback controls are disabled. The poster covers decoding until the first frame renders; a decoder error releases the slot and leaves the poster for the remainder of that asset's mount.

For existing material assets, use the same budget rather than a second player manager:

```tsx
const { canPlay, registerStop, playIfAllowed } = useMotionPlaybackLease(visible);
// Keep a poster mounted, and mount a separate player component only when canPlay.
// Within that player component's layout effect, register its pause callback:
const detach = registerStop(() => player.pause());
// Effect cleanup: player.pause(); detach();
// Within a separate passive useEffect, after VideoView attaches its web element:
playIfAllowed(() => player.play());
```

The `playIfAllowed` guard prevents a stale mount from starting a player after its lease was revoked. The mounted player should be created paused with `useVideoPlayer`, whose hook owns native disposal. On SDK 57 web, `VideoView` registers its HTML element in a passive effect; `VideoPlayer.play()` only forwards to already mounted elements and does not remember play intent. Starting from the parent layout effect silently loses playback. The separate passive effect runs after the child view attaches, while the early pause binding still enforces immediate budget revocation.

The video and poster explicitly fill their card with `width: "100%"` and `height: "100%"` in addition to absolute positioning. HTML video is a replaced element and otherwise keeps its intrinsic 1280 × 720 dimensions, placing the warm edge outside a small card. Real browser QA confirmed active playback for both Garage and profile, no mounted videos under manual Reduce Motion, and disposal when changing tabs; physical-device acceptance remains separate.

Android uses `textureView` for the clipped decorative background because Expo documents an overlapping `cover` surface rendering issue. This is a deliberate compatibility tradeoff; the real-device GPU/battery baseline still needs measurement. Neither the still renders nor passing JS tests prove 60 fps on a device.

## Tests and remaining scope

The pure budget behavior tests are at `ExpoRideSpeed/tests/motionBudget.test.mjs`. They cover all policy gates, unknown power, the two-player limit, FIFO handoff, cancelled queued cards, pause-before-grant ordering, global revocation/resume, duplicate requests and subscription cleanup. Run `npm test` from `ExpoRideSpeed`, plus its `npm run typecheck` and `npm run lint`.

`npm test` under `/motion` checks all role/theme pairs, endpoint continuity and derivative, bounded palette/opacity, actual manifest media/source/validation hashes and the real generated TypeScript registry. The material family does not alter the existing two-player provider. Screen integration, hidden-map renderer disposal, preload policy, reduced-motion/transparency review and physical-device performance/power acceptance remain separate M8 work. The 60 fps encode is not proof of sustained app frame rate or 120 Hz display behavior.

## API references checked for this implementation

- [Remotion frame hook](https://www.remotion.dev/docs/use-current-frame), [composition](https://www.remotion.dev/docs/composition), [bundle](https://www.remotion.dev/docs/bundle), [renderMedia](https://www.remotion.dev/docs/renderer/render-media), [renderStill](https://www.remotion.dev/docs/renderer/render-still)
- [Expo SDK 57 Video](https://docs.expo.dev/versions/v57.0.0/sdk/video/), [Expo SDK 57 Battery](https://docs.expo.dev/versions/v57.0.0/sdk/battery/), [Expo Router focus effect](https://docs.expo.dev/versions/latest/sdk/router/#usefocuseffecteffect)

The actual installed SDK 57 TypeScript declarations were also checked before selecting player and battery APIs.
