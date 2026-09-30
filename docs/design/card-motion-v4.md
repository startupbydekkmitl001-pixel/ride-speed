# Profile-card material loop — v4

Created 30 September 2026 for the approved native UI implementation. These are delivered assets, not a proposed animation that still needs rendering.

## Native assets

All four files are in `ExpoRideSpeed/assets/motion/`:

| Asset | Purpose | Size |
| --- | --- | ---: |
| `card-loop.mp4` | Pearl material, blue/sage edge light | 351,510 bytes |
| `card-loop-poster.png` | First decoded pearl frame | 20,135 bytes |
| `card-loop-dark.mp4` | Black material, restrained graphite/blue edge light | 310,857 bytes |
| `card-loop-dark-poster.png` | First decoded black frame | 20,565 bytes |

Both videos are H.264, 720 × 450, 30 fps, exactly 12 seconds / 360 frames, with no audio. Each is well below the 2 MB target. The rectangle is opaque and has no baked corner radius. Clip it within the native card wrapper; keep name, vehicle, photo and buttons in native layers above it.

Use the separate black asset for dark mode. The left reading area in the decoded black video is exactly RGB `(0, 0, 0)`, with subtle material light confined towards the right. This asset does not change the app's overall screen background; that remains the native theme's responsibility.

No text, identity data, portrait or user-reference footage is embedded. The only imagery is procedurally authored material. All font rendering remains native above the video.

## Design and references

The quiet reading zone comes from the user's luminous-capsule reference `3f23aaff-204e-4af3-97cf-cea19e69f085`; the changing blue/sage light field adapts the restrained portions of `fbd50842-3a71-4e32-963c-e3b499d84f73`; the thin optical ridge and layered edge treatment derive from the sleeve reference `02b80340-2b54-4847-9b98-3d0f014b13d8`. These are compositional observations from the [reference study](reference-study-v3.md), not copies of source pixels.

Motion stays near the card edge. The center does not drift, spin, pulse in brightness or cycle through unrelated colors. The broad light shapes travel slowly; the small highlight bends slightly with them. This is decorative card material rendered into video, not native Liquid Glass or a realtime refraction shader.

## Actual production and loop verification

Remotion 4.0.531 rendered both files from `videos/card-loop-v4/src/CardMaterial.jsx`. Rendering followed the installed Remotion plugin's creation, markup and render skills. The composition uses `useCurrentFrame()` and periodic functions; it contains no CSS keyframe animation, random time source or GSAP endpoint reset.

The motion period is 360 frames. Each position, intensity and curve-control value is a sine/cosine function with an integer frequency over that period. Frame 360 is exactly frame 0; it is rendered only for validation and is **not** included in the video. Playback therefore transitions from frame 359 to frame 0 as one ordinary temporal step, rather than holding a duplicate endpoint.

`verify-period.mjs` confirms exact state equality at the virtual endpoint, matching numerical velocity on both sides of the seam, and a boundary step no greater than the maximum ordinary step for each animated property. `verify-pixels.py` compares actual PNG proofs and decodes all 360 frames of each final video.

| Check | Pearl | Black |
| --- | ---: | ---: |
| Frame 0 vs virtual frame 360 | Pixel-identical | Pixel-identical |
| Uncompressed frame 359→0 RMS change | 0.389 / 255 | 0.310 / 255 |
| Uncompressed frame 0→1 RMS change | 0.344 / 255 | 0.267 / 255 |
| Encoded frame 359→0 RMS change | 0.592 / 255 | 0.570 / 255 |
| Maximum ordinary encoded adjacent-frame change | 0.506 / 255 | 0.519 / 255 |
| Complete video decode | 360 frames, no errors | 360 frames, no errors |

The small extra encoded boundary difference comes from compression, including the first I-frame. It remains below one 8-bit channel level RMS and close to ordinary frame movement. Full-size initial/midcycle proofs and the seam frames were visually inspected. This verifies the authored asset's continuity, not the native player's loop scheduling on an iPhone.

The delivered videos are byte-identical to the verified renders. SHA-256:

- Pearl: `69027cc07bc2104a15b3e0668172a5484c80fb8659b19928eb6034ae309ca1d1`
- Black: `f08f80941d0ac557192494a12549606eb36fead5098fa6e430f30a01218cab66`

## Expo integration

The project currently uses Expo `~57.0.26`; these notes were checked against the [SDK 57 expo-video documentation](https://docs.expo.dev/versions/v57.0.0/sdk/video/).

- Load the appropriate local MP4 with a static `require` and `useVideoPlayer`. Configure looping and muting; keep background playback and Now Playing notification disabled.
- Render one `VideoView` as the decorative card background with controls disabled and `contentFit="cover"`. Keep picture-in-picture and fullscreen disabled. The wrapper provides clipping and rounded corners.
- Place the matching PNG over the video during initial loading and errors; `onFirstFrameRender` can hide that cover after the video draws. The posters were extracted from the encoded first frame to avoid a visible color change at handoff.
- Play only while the profile card is visible and the app is active. Pause on screen blur, background/inactive state, and when Reduce Motion is enabled. For Reduce Motion, use the static poster. Keep decorative video out of accessibility focus and hit testing.

From a file at `ExpoRideSpeed/src/components/`, the static assets are `require('../../assets/motion/card-loop.mp4')` and the corresponding poster/dark paths. From `App.tsx`, use `require('./assets/motion/card-loop.mp4')`. Do not construct these asset paths dynamically, because Metro needs a statically discoverable file reference.

No video render engine needs to ship with the mobile app: Remotion is an authoring dependency under `videos/card-loop-v4/`. The app receives four local files. Actual native loop playback, background pausing, reduced-motion fallback, clipping and battery use still need device validation as part of integration.
