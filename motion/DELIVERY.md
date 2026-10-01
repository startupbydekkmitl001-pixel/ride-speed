# M8 original material delivery

28 verified outputs, 14 roles × dark/light, were rendered on 1 October 2026 using the pinned Remotion 4.0.531 project. They are original procedural vectors grounded in the reviewed design/motion principles. No reference pixels, layouts, names, photographs, logos, audio, countdowns or rider data are included. App colors come directly from its single `src/lib/theme.ts`.

All outputs are 1280×720, 60 fps, 6 or 8 seconds, silent H.264 `yuv420p`, BT.709 limited range. Encoded frames are 0…N−1; virtual N is only a proof frame. The source position/analytic velocity and rendered endpoint pixels repeat exactly. Every ordinary decoded-frame step and the encoded last→first seam were checked at 320×180 RGB.

| Measurement | Delivered result |
| --- | ---: |
| Video + poster family | 1,552,874 bytes |
| Videos / posters | 1,322,182 / 230,692 bytes |
| Largest video / poster | 78,304 / 9,959 bytes |
| Largest encoded seam MAE | 0.130127 / 255; every asset passes its recorded ordinary-step guard |
| Maximum reading-zone temporal channel change | 0 across all decoded frames |
| Minimum nominal native-text contrast in reading zone | 16.996:1 |
| Largest full-resolution poster→encoded-first-frame MAE | 0.477248 / 255 |
| Maximum poster reading-zone channel difference | 1 / 255 light; 0 dark |

The schema-2 app manifest is complete, hashes every video/poster and proof/report, and records actual generator versions/settings, safe zones, component/role/theme mapping, original provenance and normalized source/lockfile snapshots. Per-output validation is under `/motion/validation`; the independent poster handoff report is `poster-validation.json`. `delivery-summary.json` contains the aggregate measurements. Source SHA normalizes UTF-8 CRLF to LF; media and proof SHA use exact bytes.

Human inspection covered dark/light source and compressed-output phone boards, all 28 encoded seam/quarter-cycle strips, and Garage/license/hero/landscape crops. The license ridge was adjusted before final production because the first taller crop concealed too much light. The final crops retain their quiet edge below/beside stable reading space. Full-resolution encoded PNGs and diagnostic boards remain ignored under `build/inspection-encoded`; they are not app assets.

The typed registry exports `motionRoles`, `MotionRole`, `MotionTheme`, `motionRoleAssets`, `ambientAssets`, `AmbientAsset` and `resolveAmbientAsset(role, theme)` from `ExpoRideSpeed/src/features/motion/assets.ts`. Its 28 literal Metro requires are generated only after complete media/hash verification. Existing `garage-scooter` aliases `garage-scooter-dark` without a duplicate bundled video. The unreferenced original M0 filenames were removed from the output directory; their historical source/validation and Git revision remain available.

Verification: `/motion` tests **6 passed, 0 failed, 0 skipped**; the actual generated TypeScript registry ran in the delivery test. Mobile app typecheck and scoped ESLint for the registry passed. The batch itself verified every codec/frame/color/size/source/encoded seam/reading-zone/motion mask before copying; poster handoff checks passed for all 28.

This is a media/registry delivery. Screen integration, the existing two-player lease policies, theme fallback during decoding, actual native text/photo overlays, app playback interruptions and hardware performance remain Root's M8 integration/acceptance work. No UI/provider/budget or hosted service was changed in this slice. Encoded 60 fps does not establish native app FPS, battery use or 120 Hz behavior. Studio remains available at port 3035 for integrated/live preview; no physical-device performance claim is made.

Reproduction commands and policy details are in `README.md`. No files were committed or staged by this subagent.
