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

After the shared typography tokens changed, the whole 28-output family was rendered again from the frozen current source on 1 October 2026. The full normalized theme snapshot is an input even when its changed fields are unused by the compositions. The documented render, registry, all-output verification, source/encoded inspection and full-resolution poster checks ran again; no render source, validation threshold or test was changed. The render took 20 minutes 18 seconds on this host. Comparison against the previous delivery verified all 28 videos, 28 posters, 196 source proof frames and 28 validation reports were byte-identical. The fresh aggregate also exactly matched `delivery-summary.json`. The manifest alone changes to bind those freshly generated outputs to the current theme.

Current evidence SHA256:

- App manifest: `99181F0376325D05C1410A70B1E2832800F2247AB945187800299303523E24C5`.
- Normalized theme source: `7FC950766F8593B06CCC8D1F8DA5EC785C5A1FD023D10D5C2F1B8F3CFA42A919`.
- Aggregate delivery: `541A4C345B2210BBCEB10B96CBE07EC49A129429F2C463315AD0E2454B714B93`.
- Poster handoff report: `133CC20FD776EF199863F9062C3BF9989F7192BB2AB1ADA1B39B0D4C3B2E11C8`.
- Generated registry: `1D4E5B6FE23E7D4C9484EAB48C0032E0D6C678692D600B6719FB7C9CF56F6D58`.

The refresh logs and exact per-file comparison are local diagnostics under ignored `motion/build/theme-token-refresh-*`. They are not shipped assets. Dark/light source and encoded boards, all 28 encoded seam strips, and selected license/hero/landscape crops were visually inspected again after the refresh.

Human inspection covered dark/light source and compressed-output phone boards, all 28 encoded seam/quarter-cycle strips, and Garage/license/hero/landscape crops. The license ridge was adjusted before final production because the first taller crop concealed too much light. The final crops retain their quiet edge below/beside stable reading space. Full-resolution encoded PNGs and diagnostic boards remain ignored under `build/inspection-encoded`; they are not app assets.

The typed registry exports `motionRoles`, `MotionRole`, `MotionTheme`, `motionRoleAssets`, `ambientAssets`, `AmbientAsset` and `resolveAmbientAsset(role, theme)` from `ExpoRideSpeed/src/features/motion/assets.ts`. Its 28 literal Metro requires are generated only after complete media/hash verification. Existing `garage-scooter` aliases `garage-scooter-dark` without a duplicate bundled video. The unreferenced original M0 filenames were removed from the output directory; their historical source/validation and Git revision remain available.

Verification: `/motion` tests **6 passed, 0 failed, 0 skipped**; the actual generated TypeScript registry ran in the delivery test. Mobile app typecheck and scoped ESLint for the registry passed. The batch itself verified every codec/frame/color/size/source/encoded seam/reading-zone/motion mask before copying; poster handoff checks passed for all 28.

This is a media/registry delivery. Subsequent source integration and player-policy corrections are recorded separately in `docs/design/m8-acceptance-v5.md`; the provenance refresh changed no UI/provider/budget or hosted service. Actual native text/photo overlays, codec playback, interruptions and hardware performance still require physical acceptance. Encoded 60 fps does not establish native app FPS, battery use or 120 Hz behavior. Studio remains available at port 3035 for integrated/live preview; no physical-device performance claim is made.

Reproduction commands and policy details are in `README.md`. No files were committed or staged by this subagent.
