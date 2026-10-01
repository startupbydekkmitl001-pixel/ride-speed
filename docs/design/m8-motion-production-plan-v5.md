# M8 motion production plan — V5

Prepared 1 October 2026 before production. This document retains the original planning measurements and sequencing below. The 28-output family is now rendered and independently hash/seam/poster checked; current delivery is in [motion/DELIVERY.md](../../motion/DELIVERY.md). Garage, profile, auth/onboarding and stationary expanded-HUD integration is documented in [m8-motion-integration-v5.md](m8-motion-integration-v5.md). Ranked/lobby integration and physical hardware acceptance remain separate work. The old asset inventory and proposed CLI switches below describe the planning baseline, not current deliverables.

## Existing assets, checked on disk

The mobile asset directory currently contains three MP4s, three posters and one V5 manifest. Videos total **779,547 bytes**; posters total **49,155 bytes**. Media plus posters is 828,702 bytes. All videos have one H.264 video stream and no audio.

| Delivered asset | Video / poster bytes | Dimensions | Duration / rate / frames | Status |
| --- | ---: | --- | --- | --- |
| `v5/garage-scooter` | 117,180 / 8,455 | 1280×720 | 6 s / 60 fps / 360 | Current original V5 black/warm material; BT.709 limited-range `yuv420p` |
| `card-loop-dark` | 310,857 / 20,565 | 720×450 | 12 s / 30 fps / 360 | Legacy profile material; blue/graphite edge, full-range `yuvj420p`, BT.470BG |
| `card-loop` | 351,510 / 20,135 | 720×450 | 12 s / 30 fps / 360 | Legacy pearl profile material; blue/sage edge, full-range `yuvj420p`, BT.470BG |

Actual SHA-256 values match the V5 manifest for both files and all five recorded generation source files. Re-decoding the delivered V5 MP4 found exactly 360 frames. The source proof's frame 0 and virtual frame 360 are pixel-identical. At 320×180 RGB, encoded seam MAE is **0.084317 / 255**, maximum ordinary adjacent-frame MAE **0.073374 / 255**, and ordinary mean **0.020766 / 255**. These reproduce the recorded manifest/validation values. They prove asset continuity, not mobile playback scheduling or frame rate.

The legacy video hashes match the earlier accepted outputs: pearl `69027cc07bc2104a15b3e0668172a5484c80fb8659b19928eb6034ae309ca1d1`, black `f08f80941d0ac557192494a12549606eb36fead5098fa6e430f30a01218cab66`. Their historical validation reports source endpoint equality and encoded seam RMS 0.592 / 255 pearl, 0.570 / 255 black. Those older RMS values use a different measurement than V5 MAE and must not be compared as the same statistic. Both legacy files need replacement to meet the current 4–8 s, 720p and warm-accent family direction; they are not missing or broken assets.

The current V5 manifest/registry contains only `garage-scooter`. Scooter cards use it when their own photo is absent. Big-bike/car cards currently use a static neutral fallback. The profile still uses its legacy dark/light materials, but shares the same playback lease budget. The Garage's category glyphs, rider photo/name and all controls remain native UI above the background.

## Grounded direction

Use the existing Remotion 4.0.531 project under `/motion`. The user permits Remotion or HyperFrames, and this renderer already produced a verified asset on this host. No second renderer or workflow installation is needed for the family. The mandatory HyperFrames entry/creative guidance and Remotion creation/markup/render skills were consulted; their marketing-frame density/intensity defaults do not override this app's quiet, touch-readable material brief.

The visual basis is the fully studied reference set, not a new unrelated style. References 01/02 communicate depth through a sleeve edge, independent planes and settled reading holds. Reference 03 concentrates movement inside a status-icon footprint. Reference 04 is an interaction accent with a hard polarity cut, so its flash is excluded from repeating app ambience. Reference 05 keeps the dark poster's upper reading region quiet and moves light near an edge. Reference 06 contributes a smooth specular contour; its colorful lettering and modal layout are not copied. See [reference study](reference-study-v5.md) and [design brief](../../DESIGN_BRIEF.md).

Dark reading areas stay exactly `#000000`; raised substrate uses the existing neutral theme only. The only decorative chromatic accent is `#FF5A1F`. Light variants use the theme's `#FAFAF8` canvas, white/neutral substrate and the same warm accent. Semantic green/red and the speed gradient stay in native status/gauge roles. There is no hue carousel, baked rank/name, copied reference image, fake map, vehicle logo, hidden portrait, narration or audio. Reflective material is a rendered background; actual Liquid Glass remains the native/fallback glass control kit.

Each material has one primary physical contour and one localized reflected-light field. Left/central content zones remain steady. Stronger light is confined to a small edge, making the material visible at card scale without flashing behind Thai text. Loop motion comes from smooth periodic position/opacity/curve parameters, not repeated card entrances. Photo selection, card expansion, icon states and real rank changes remain interruptible native interactions.

## Exact loop family

The target is **14 semantic roles**, with a dark and a light output for each: **28 delivered loops plus posters**. The existing black scooter output can be retained if the final crop/contrast audit passes, leaving at most 27 newly rendered outputs. The profile role completes the user's earlier license-card request in addition to the BUILD SPEC family. These are planned asset IDs; only the original `garage-scooter` ID exists today. Preserve that ID as a dark alias when introducing the theme-aware registry.

All variants are 1280×720, silent H.264, 60 fps. Numbers below are new design starting points, not timings reverse-engineered from source videos. Amplitudes refer to source pixels; actual card crops are reviewed before delivery.

| Role / planned base ID | Period | Original contour/light design | Stable content zone and display policy |
| --- | ---: | --- | --- |
| `garage-scooter` | 6 s | Retain rounded vertical painted-panel edge; travelling warm reflection, ~24 px lateral / 94 px vertical path, ≤0.65° lean | Left ~65% black/neutral; native category glyph/photo. Only the active visible no-photo card plays |
| `garage-bigbike` | 6 s | One shallow chamfered diagonal panel, narrow reflected light following its facet; ±14 px normal displacement, ≤0.45° lean | Left 60% stable; geometry differs from the scooter without racing stripes or a copied motorcycle silhouette |
| `garage-car` | 8 s | Broad horizontal roof-like bevel below the reading zone; reflection slides ±36 px with a second restrained return highlight | Upper/left 65% stable; no camera fly-through or moving vehicle photo |
| `podium-first` | 6 s | Etched stepped plate with a warm reflected edge under the actual first-place portrait; ±18 px travelling highlight | Rank/name/speed are native and still; only exists when a real eligible first row exists |
| `podium-second` | 6 s | Same plate family, quieter neutral reflection and a shorter warm edge; ±12 px highlight | Native second-row content; poster whenever the two-player budget is occupied |
| `podium-third` | 6 s | Shallower plate and subdued edge reflection; ±10 px highlight | Native third-row content; no gold/silver/bronze color system added |
| `ranked-today` | 6 s | One narrow horizon reflection beneath the real Today label; ±12 px lateral travel | Upper 75% steady. No looping clock, number or invented rank |
| `ranked-week` | 8 s | Two etched parallel contour bands sharing one slow light phase; ±10 px movement | Same header crop/type zone. Real Bangkok-window state stays native |
| `ranked-month` | 8 s | Wider low-amplitude reflected contour with a longer soft return; ±8 px movement | Same native period control; distinction comes from contour cadence rather than a new color |
| `auth-onboarding` | 8 s | A single layered sleeve edge in the far-right/lower portion; one continuous reflection bend, ≤0.5° lean | Form/title occupy left/upper 65%. One hero is reused for auth and onboarding; it never performs an endless open/close gesture |
| `empty-state` | 6 s | A small etched annulus/open contour with a slow light travelling around its fixed footprint | Actual empty-message/icon remain native. Decorative ambience never claims loading, successful GPS or unseen content |
| `challenge-lobby` | 6 s | Two quiet parallel material contours carrying one reflection; positions are abstract and fixed | Native participants, readiness and server countdown remain entirely separate. No simulated racers or video countdown |
| `speedometer-glow` | 8 s | Low-amplitude neutral/warm radial reflection confined below/behind the gauge rim, opacity swing ≤0.02 | Digit/quality reading zone stays solid. Poster in compact glance mode and while moving; optional playback only in a stationary expanded dashboard |
| `profile-license` | 6 s | Warm/neutral curved optical ridge at the right edge, adapted from the accepted profile material and V5 sleeve language | Identity/photo/edit controls stay native. Dark/light replacements remove legacy blue/sage and normalize the encode |

The native reading zone is defined relative to the actual component, not a fixed screenshot coordinate. Verify `cover` crops at the phone's real card width, the Garage's image region, the profile's taller license-card aspect, expanded landscape HUD and Dynamic Type. Preserve an opaque fallback/scrim where a photograph or map could otherwise reduce text contrast.

## Asset and playback budget

Every MP4 has an absolute 1,500,000-byte limit. Internal targets are 350 KB for Garage/podium/profile/lobby, 200 KB for period/empty/HUD, and 450 KB for auth. Across both themes these targets total about **8.5 MB video**, plus ≤20 KB per poster (~0.56 MB). This is a planning budget, not a promised compression result. The renderer rejects a release family over 20,000,000 bytes rather than quietly bundling it. If visual quality genuinely requires more, use a hashed public static CDN/Storage asset with bounded cache and poster/offline fallback; these decorative files contain no rider data. Do not use private ride-media signing for them.

At most two videos may play globally. Keep the existing FIFO pause-before-grant lease policy and native power observer. Invisible/unfocused/background/Reduce Motion/unknown native power/error states show posters. Browser power remains unsupported; it is not claimed as a measured normal-power state.

Ranked can display three podium materials and a header, but must explicitly choose two eligible play surfaces. Default to first place plus the selected-period header; runners-up use posters. If the podium is the primary visible region, use first/second and make the header static. Empty boards show no podium, and a one-row board never manufactures two more winners. Community cards do not each get a decoder. A visible expanded stationary HUD may use one lease; moving/glance mode uses its poster while native instrument motion continues.

Preload the next asset/poster bytes without creating a hidden playing third player. Expo supports buffering an unattached player, but such a decoder must also fit a measured resource budget and release correctly. Prefer bundled-file/poster preparation first; only add lease-bounded paused decoder prewarming if device tests show it improves transition latency. Existing `useVideoPlayer` owns disposal. Retain pause binding in layout and guarded `play()` after the web VideoView's passive attachment; never regress the M0 start-order fix. All video/poster elements explicitly fill their wrapper, and Android cover/clipping keeps the documented texture-view workaround until hardware evidence supports a change. [Expo SDK 57 video lifecycle/preloading](https://docs.expo.dev/versions/v57.0.0/sdk/video/).

## Required M8 lifecycle work before performance claims

Root's actual M4 browser inspection found both Map Home and route-planner map DOM/canvases retained while the planner was focused. MapHome currently mounts MapSurface whenever its screen exists; focus only drives its location action. Hidden tab routes can retain their own renderer too. Source tests or passing JS lint do not establish that native detached screens stop drawing.

Add a focus/foreground lifecycle to every map host: retain camera intent/provider state outside the heavy view, unmount or explicitly suspend the renderer when unfocused, and restore only one active map on return. Hidden map controls must also leave the accessibility/hit-test tree. Abort/invalidate planner search/calculation on blur, retaining its local draft and permitting a deliberate fresh request after focus returns. Gate at request dispatch and completion, not only by opacity. Movement remains an independent stricter lock.

Ride recording and account-scoped evidence stay in the provider above routes. Disposing a decorative video/map view must not pause a ride, clear a route or erase consent. Retain the existing foreground recording policy and explain actual native background behavior separately. Measure renderer count, decoder count and listener cleanup through tab cycles before adding ambient surfaces. This is an M8 source/performance prerequisite, not a change made during the M4 freeze.

## Render pipeline: current commands and planned extension

The **currently working** V5 commands, from `/motion`, are:

```sh
npm ci
npm run render
npm run verify
npm run studio
```

`render` generates only GarageScooter, copies verified media to `ExpoRideSpeed/assets/motion/v5/`, and writes its manifest. `verify` checks the existing build and writes `motion/validation.json`. Studio serves port 3035 without opening a system browser. The legacy project under `/videos/card-loop-v4` has `npm run check:loop`, `npm run render`, `python verify-pixels.py` and Studio port 3027; it is historical reproduction source, not the new family's delivery pipeline.

M8 will extend the single `/motion` project as follows; these CLI switches/scripts **do not exist yet**:

1. Add a canonical role/theme configuration catalog, explicit safe zones, dimensions, fps, period, composition ID and byte target. One registry creates every Remotion Composition. Keep original geometry/parameters in procedural source, with no wall-clock timers, random per-frame values, CSS animation or external assets.
2. Generalize `render` to `npm run render -- --asset <id>` and `--all`; bundle once per batch and render each composition with its own frames/metadata. Keep the pinned lockfile and record actual Node/Remotion/Chrome/FFmpeg versions. Software graphics remain the reproducible host baseline. Browser overrides use `RIDE_CHROME_PATH`; FFmpeg discovery retains `FFMPEG_PATH`/`FFPROBE_PATH`.
3. For each asset, render source proof frames 0, 1, N/4, N/2, 3N/4, N−1 and N. Frame N is only a virtual continuation proof. Encode frames 0…N−1, never a duplicated endpoint. Integer-frequency sine/cosine parameters give continuous phase and velocity; compare analytical/numeric seam velocity as well as parameter equality.
4. Encode H.264 `yuv420p`, explicit BT.709 limited range, silent, initially CRF 24. Use PNG frame capture when needed for reliable color conversion; review compression at component scale before changing quality. A final encoded-first-frame poster avoids a handoff color mismatch. [Remotion renderMedia options](https://www.remotion.dev/docs/renderer/render-media), [renderStill](https://www.remotion.dev/docs/renderer/render-still).
5. Generalize verification per composition: codec/range/size/dimensions/fps/frame count/exact duration/no audio; detached source/proof hashes; source endpoint pixel equality; every ordinary encoded-frame step versus last→first; motion-mask/reading-zone luminance/contrast and device-sized crops. Record metric type/resolution. The current garage tolerance is maximum ordinary MAE ×1.25 +0.12; keep it as a transparent starting guard, not an automatic visual-quality verdict for all assets.
6. Inspect the rendered quarter-cycle and seam crops plus a real looping preview. Reject an endpoint hold, flash, black crush/color lift, visible banding, jittering contour, concealed light after crop or movement behind essential text. Numerics do not replace this review. Native text/photos are reviewed on top of the actual material.
7. Copy only passing outputs. Build one manifest with component/role/theme mapping, provenance/externalAssets=[], generator/command, source and package-lock hashes, video/poster SHA-256/bytes, dimensions/frames/fps/duration/codec/color/audio, safe zone and seam report. Keep a per-asset validation report under `/motion`; intermediate frames/bundles stay ignored.
8. Add explicit static requires to the app registry and a typed theme-aware role resolver. Preserve `garage-scooter` compatibility. Wire existing screens only after their real data/state contracts are ready. Replace the profile's legacy adapter with the unified material path; historical source can remain, but unused old media must stop contributing to the native bundle.

## Acceptance sequence

First verify global leases, blur/focus/power/movement poster policies and hidden map disposal. Then render Garage/profile, followed by real-data Ranked/header surfaces, then auth/empty/lobby/HUD. Each batch gets seam/hash/size proofs, actual theme/crop inspection, and source checks before integration.

Use actual accounts/rows for integrated ranked/lobby/feed screens; explicitly labelled test fixtures belong only to test tooling. Test interrupted media decode, asset/theme switches, rapid scrolling and tab changes, incoming Low Power events during stale reads, manual/system Reduce Motion and Reduce Transparency, background/inactive/resume, and no video mount when a lease is denied. Native gauge/icons/countdown remain state-driven, with no React frame loop.

Final physical evidence on iPhone 14 Plus/iOS 26 and a mid-range Android phone must include map pan/zoom with 50 markers and the chosen glass/video budget, cold launch, frame-time trace, memory before/after a 30-minute ride, battery/power transitions, native Thai shaping/Dynamic Type, screen readers and landscape. The iPhone 14 Plus target is sustained 60 fps; 120 Hz claims require separate supported hardware. An encoded 60 fps loop does not itself prove either UI target.
