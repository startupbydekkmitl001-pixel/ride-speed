# RideSpeed motion study — revision 3

Created 30 September 2026. The source lives in `videos/ride-motion-v3/`; the final review artifact is `videos/ride-motion-v3/renders/ride-motion-v3.mp4`.

## What this study establishes

The composition uses a warm pearl canvas, quiet sage/sky atmosphere and a single cobalt action color. Speed is an unboxed Manrope numeral with tabular figures; Thai controls and labels use Anuphan. The number is a constant sample of 48 km/h, not an animation through invented sensor measurements.

Motion explains selection and material layers. One optical selection capsule travels through the navigation bar. The profile cover responds first, then the insert rises and holds, then both return along the same path. The cover retains the user name while the insert carries the selected vehicle and an A monogram. The first draft's duplicated identity and overlapping vehicle captions were removed after the layout check.

This is a 10-second portrait motion study with sample values and schematic route geometry. It is not the full functional friends/maps app and does not claim to show Google map tiles, live GPS or native iOS Liquid Glass.

## Tools actually used together

HyperFrames 0.8.97 renders the six-second profile scene from deterministic HTML/CSS/GSAP. The registry's `light-sweep-pass` component was installed and its single scalar-driven light technique adapted into a narrow material highlight. GSAP controls the cover, insert, backplate and highlight in one paused, seekable timeline.

Remotion 4.0.531 renders the first four seconds of speed typography and common navigation, then composites the HyperFrames clip using `OffthreadVideo`. The navigation remains a common layer across both scenes. It exports H.264 at 1080 × 1920 and 60 frames per second. Frame-based interpolation and bundled fonts keep individual frames deterministic. [Remotion renderMedia](https://www.remotion.dev/docs/renderer/render-media), [OffthreadVideo](https://www.remotion.dev/docs/offthreadvideo).

Both tools are used in the exported study. Neither is proposed as a second animation runtime inside the live mobile interface.

## Timeline

All times below are positions in the final export. These are authored values, not measured reverse engineering of the reference videos.

| Time | Motion | Purpose |
| --- | --- | --- |
| 0.00–0.70 s | Short entrance and settle for the speed layout; speed stays 48. | Establish the instrument hierarchy, then stop. |
| 0.70–3.45 s | Stable speed, supporting metrics and schematic route. | Provide a readable pause. |
| 3.45–3.92 s | The selected dock capsule travels to the profile tab; slight horizontal optical stretch. | Preserve continuity between navigation states. |
| 3.60–4.00 s | Speed content fades and shifts 14 pixels upward. | Clear the content layer while navigation remains anchored. |
| 4.00–4.60 s | Profile content settles into place. | Introduce one dominant identity object. |
| 4.85–5.32 s | A small touch cue appears and disperses. | Identify the demonstrated trigger. |
| 5.05–5.60 s | Sleeve tips by 12 degrees, lowers 36 pixels and compresses slightly. | Make the outer layer react first. |
| 5.23–5.87 s | Insert rises 107 pixels and rotates 1.7 degrees; backplate shifts subtly. | Reveal the photo area and distinguish separate physical layers. |
| 5.80–7.10 s | A single light field crosses the sleeve while the name stays still. | Show material, without a continuous distracting loop. |
| 7.10–7.80 s | Insert, cover and backplate close in sequence. | Return along the same spatial path. |
| 7.80–10.00 s | Stable final card and visible editing controls. | Give the user time to read and understand the next action. |

The reveal uses the staged cover/insert relationship observed in user video `3be05702-3fc9-41a2-b40b-0c9f9d2c5e68`, and the blurred sleeve/sharp exposed insert material observed in `02b80340-2b54-4847-9b98-3d0f014b13d8`. The steady reading zone and localized light come from `3f23aaff-204e-4af3-97cf-cea19e69f085`. The broader mapping of all seven Markdown files and eight videos, including the sampling limits, is in [the reference study](reference-study-v3.md).

## Translation into the app

Use native `expo-glass-effect` controls on a supported iOS 26 build, with ordinary readable content surfaces. Expo's documented availability and accessibility checks must decide the fallback; browser blur is only a material approximation. In particular, avoid making a native glass view or its parent fully transparent with ordinary opacity animation because Expo documents a rendering issue with that pattern. [Expo SDK 57 GlassEffect](https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/).

Use the native UI animation system/Reanimated for interactive transform, opacity and selection transitions. Keep speed readings direct and stable. Animate state acknowledgement around the reading rather than interpolating the displayed measurement. The profile animation runs on deliberate interaction and stops when settled; there is no reason to keep the driving screen in continuous decorative motion.

Reduce Motion removes the card's 3D movement and light sweep and substitutes a brief content transition. Reduce Transparency uses an opaque pearl/ink surface with a clear edge. Higher contrast and larger text must be evaluated using actual device settings; exported pixels cannot test those behaviours. Reserve the glass layer for navigation and controls, consistent with Apple's guidance. [Apple: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/).

## Validation record

- HyperFrames runtime: zero errors.
- HyperFrames layout: zero overlap/out-of-frame findings after the identity simplification.
- HyperFrames motion assertions: 121 sampled states, zero failures.
- HyperFrames contrast: 68 sampled checks passed.
- One nonblocking authoring advisory remains: the compact six-second card scene is nested in one timeline row, rather than split into a separate sub-composition.
- HyperFrames produced the actual six-second H.264 card clip using hardware browser capture on this PC.
- Final Remotion encode: H.264, 1080 × 1920, 60 fps, exactly 600 frames / 10.000 seconds; 1,791,407 bytes. FFmpeg decoded the complete final file without errors.
- Inspected full-resolution speed, dock-transition, open-card, closing-card and resting-card proofs, plus timestamped frames extracted from the encoded video and a ten-frame overview. The vehicle label now clears the sleeve at rest. This is sampled visual review, not a claim to have manually inspected every frame.
- A static speed segment decimated to one distinct frame, consistent with the intended stable reading and absence of decorative motion during that hold.
- Final file SHA-256: `f15b947a275bc80e4365594a7c4340329b0f3456be9d49054d4f77b5a6c9a940`.

These checks validate this fixed-size export only. The iPhone 14 Plus has not been profiled with a native build, and the video does not establish battery consumption, touch latency or sustained device frame rate.
