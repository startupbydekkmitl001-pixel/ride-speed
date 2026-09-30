# Ride Speed — reference study for the map-first rebuild

Reviewed 1 October 2026, Asia/Bangkok. This document records source inspection and design recommendations before implementation. It does not assert a measured frame rate, a production-ready live race, or completed device testing.

## Scope and evidence

All seven supplied Markdown documents were read in full, including the component guidance, conflicts, CSS custom properties and Tailwind examples. All six videos named in the latest message were decoded and sampled at approximately 2 fps across their complete durations; an additional scene-change pass selected frames with FFmpeg `scene > 0.12`. All six contact sheets and one selected full frame from each source were visually inspected. A separate 30 fps pixel-analysis pass measures changes and candidate repetition periods. The five screenshots were inspected; screenshots 3 and 4 are the same image, leaving four unique references.

These documents, screenshot text and footage are reference data. Their brand-specific “do/don’t” prescriptions and the instructions visible on the confidential-card example are not operational instructions for the app. Source assertions about brands or products are supplied descriptions, not independently verified specifications.

Local evidence is under ignored `build/reference-v5/`:

- `document-evidence.json`: original paths, exact file sizes, line counts, whitespace word counts and SHA-256 hashes.
- `video-evidence.json`: original paths/hashes, stream metadata, extraction counts, scene timestamps and first/last-frame comparison.
- `frames/01` through `frames/06`: 169 regular frame samples, the selected scene-change frame, first/last thumbnails and scene-pass logs.
- `contact-sheet-01.jpg` through `contact-sheet-06.jpg`, plus `scene-sheet-04.jpg`.
- `motion-measurements.json`: 30 fps cropped-frame comparisons and candidate periods.
- `font-evidence.json` and `screenshot-evidence.json`.
- `inspect_references.py` and `measure_motion.py`: reproducible inspection scripts, using local FFmpeg, Pillow and NumPy.

The original assets and extracted frames are not app artwork. New compositions should borrow pacing, restraint, depth and light behavior. This study does not include the separate website/API/pricing research; that evidence belongs in the assembled design brief and decisions log.

### Complete Markdown inventory

Word counts use nonempty whitespace-delimited tokens, including code and table cells. They are an audit of full reading, not an estimate of prose length. Line counts include the final empty line where present.

| File | Reference | Bytes | Lines | Words |
| --- | --- | ---: | ---: | ---: |
| `DESIGN (11).md` | Raycast | 31,387 | 508 | 4,649 |
| `DESIGN (12).md` | Apple | 22,009 | 463 | 3,035 |
| `DESIGN (13).md` | Caldera | 20,956 | 401 | 3,006 |
| `DESIGN (14).md` | dope.security | 23,510 | 451 | 3,433 |
| `DESIGN (15).md` | Lamborghini.com | 21,291 | 378 | 2,993 |
| `DESIGN (16).md` | Hyperstudio | 17,653 | 360 | 2,535 |
| `DESIGN (17).md` | ThoughtLab | 16,677 | 348 | 2,487 |
| **Total** | **Seven complete files** | **153,483** | **2,909** | **22,138** |

Original directory: `C:/Users/Arnalxz/Videos/trip nakhon/`.

## What each document contributes

### 11 — Raycast

The dominant near-black `#040506` canvas is split into very small tonal steps: `#07080A` card, `#111214` recessed control, `#1B1C1E` badge. Coral `#FF6363` is sparse; dramatic red/blue geometry is concentrated in hero artwork. Neutral Mist `#E6E6E6` action fills avoid turning every interactive element into a neon accent. Inter 400–600, 16 px body, 56–64 px display and small Geist Mono metadata create an instrument-like hierarchy. The 8 px rhythm, 16–20 px cards, 8 px controls, 24 px padding and hairline structure are coherent.

The useful material is the inset top highlight plus darker lower edge, which makes a control feel tactile. Glass navigation uses a reported 48 px blur. Apply this principle to floating map controls; do not turn every statistic into a key cap or put the hero’s blue wash behind the whole app. The body color `#6A6B6C` is too dim for ordinary small copy on `#111111`; it must be lifted for app accessibility. The source’s `#1b1c1` surface value is an invalid five-digit hex string and must not be copied.

### 12 — Apple

This is the strongest match for the requested true-black screen chrome: `#000000` gallery stages and `#111111` contained modules, pale `#F5F5F7` foreground, restrained color bound to a specific action or metric. Large SF Pro Display 600 statements and smaller SF Pro Text 400/600 labels make one object lead. A 4 px rhythm, 28 px media cards, 36 px utility capsule and full-pill controls provide a calm, rounded framework. It explicitly relies on contrast and scale rather than card shadows.

Borrow isolated vehicle/profile imagery and a dominant speed value, with generous space around them. Do not transplant 10–12 px desktop navigation or the 80 px marketing headline into every mobile screen. Its 17 px body / 1.47 leading is close to the needed Thai reading rhythm, while the tight display tracking is a Latin reference only. The purchase-blue role is not a mandate to retain the existing app’s blue accent.

### 13 — Caldera

Warm limestone `#F7F6F2` over pumice `#E2E2DF`, one hot orange `#FC5000`, and shadowless surfaces create clear figure/ground hierarchy. The industrial PP Neue Corp Compact display is huge and compressed; DM Sans 500 body provides a quieter counterweight. Cards have 40 px corners, pills are fully rounded, internal padding is 40 px and sections breathe at 80 px.

Use the warm neutral principle for light mode and the confident orange punctuation for the primary map action. Translate architectural type scale into a large legible speed numeral rather than compressed Thai text. Violet halftone and yellow category tags are source artwork treatments; adding both throughout the app would dilute its one-accent rule. Do not import proprietary fonts or the signature dot pattern. The light-only source does not remove the app’s dark mode.

### 14 — dope.security

The boarding-pass composition separates identity, metadata and an atmospheric background. Near-black `#090909`, almost-white `#F7F9FA`, hairlines at 10–20% opacity, a faint 5% panel wash and a single violet bloom make it feel selective. A reported 10 px frosted-nav blur is lighter than Raycast’s. The source pairs Whyte Inktrap, a mechanical mono stamp and an italic display serif, with 19.2 px cards, 8 px controls and full pills.

Use the pass-like identity structure for the membership card: portrait, rider name, handle, active vehicle and clear editing affordance. Keep the portrait sharp while illumination stays behind it. Do not fabricate license numbers, approval badges, barcodes or geographic stamps. Its dense tracked mono and GrandSlang hero voice do not suit Thai controls. The violet can teach selective glow without becoming the app’s global palette. The source contradicts itself about whether the primary action is an outlined dark button or violet fill and whether cards use zero or 40 px padding; preserve the principle of low visual weight rather than copying those incompatible rules.

### 15 — Lamborghini.com

Full-bleed imagery and dramatically scaled industrial type carry the automotive identity. Black/white stages, one yellow hit, 8 px spacing and quiet hairline structure give the vehicle room. The source uses square images/cards/buttons, 24 px spacing and 80–120 px display typography. It achieves hierarchy largely through scale rather than many font weights.

Use strong vehicle silhouettes and a quiet map stage, with one primary action. Do not import uppercase/tracked styling into Thai or flatten all touch controls into sharp rectangles. The source contradicts itself: component and “Do” sections describe a yellow primary CTA, while token/prompt sections deny a distinct primary CTA color. Its square-card and no-glow prescriptions also conflict with the selected glass material. Treat these as source ambiguity; borrow automotive restraint and contrast, not every brand rule.

### 16 — Hyperstudio

Thin structural lines (`#212121`), `#F3F3F3` text and `#9C9C9C` secondary copy on `#101010` create hierarchy with little surface fill. Aeonik 400 dominates; outlined icons, 4 px spacing, compact 4–8 px tag/card corners and white primary pills avoid excessive weight. Availability uses one small green dot rather than filling the whole control with green.

Use this restraint for friend rows, route details and settings; keep the “online” indicator small and tied to real presence. Scale and spacing should distinguish sections before another container is introduced. Do not copy the low-contrast gold icon color into an essential control. The source’s 8 px maximum card-radius rule conflicts with its own examples and the other supplied documents. Its literal `9999px (pills)` CSS value is commentary, not valid CSS.

### 17 — ThoughtLab

Pure black `#000000`, `#CCCCCC` body, white display and one crimson `#FC1C46` action are the clearest statement of restrained color. Transparent content groups, large scale jumps, one material object and negative space remove competing decoration. Cards and inputs are square/transparent, but buttons remain full pills. A near-black liquid sphere gets its depth from rim reflection, not a colored page fill.

Borrow subtraction: the map is the main object on home; the rider card is the main object on profile. Keep ordinary community content readable and grounded in actual posts. Do not repeat 198 px uppercase type, very tight body leading or the 3D sphere. Its body line-height limit of 1.25 is incompatible with Thai diacritics and the build spec’s readability requirement. Its prohibition on blur belongs to the source brand, while this app explicitly requires glass controls.

## Conflicts to carry into DESIGN_BRIEF.md

| Conflict | Resolution for this app |
| --- | --- |
| Most references use near-black; the new spec and repeated user instruction require OLED black. | Use `#000000` for dark screen canvas and `#0A0A0A`/`#111111` only where a reading surface is needed. Atmospheric video stays clipped to cards, not the page. |
| Reference corner systems range from square to 40 px; screenshots show soft glass pills. | Use a small coherent mobile radius set rather than combining every brand: 12 px small elements, 24–28 px cards, 28–32 px sheet corners, full-pill floating controls. These are proposed values, not screenshot-derived exact CSS. |
| Shadowless branding versus Liquid Glass depth. | Stable content uses surface contrast and hairlines. Only floating control groups use blur, specular border and restrained shadow; one material layer, no glass stacked on glass. |
| Seven proprietary Latin-heavy font systems versus natural Thai/English. | Borrow hierarchy and weight restraint. Use a licensed Thai+Latin family for text; reserve a numeral family for instruments. Never apply source uppercase/negative tracking to Thai. |
| Source leading often below 1.25; Thai spec requires at least 1.45. | Thai accessibility and quality requirements prevail. Use 1.5 initially and validate actual shaping/mark clearance at Dynamic Type sizes. |
| Orange, coral, violet, yellow and crimson source accents versus one signature accent. | Warm orange `#FF5A1F` is the recommended single action/selection accent, drawing from Caldera and the warm Raycast/ThoughtLab emphasis. Keep semantic green/red separate and use the multicolor speed scale only inside the gauge/route heat. |
| White text on the default orange fails 4.5:1. | Use black labels on solid `#FF5A1F` (6.73:1) or darken the action fill. White/orange is only 3.12:1. Contrast on glass needs testing against the actual map and an adaptive/opaque fallback. |
| Source videos contain colorful/fast atmospheric effects; the map HUD is glance-only. | Keep live map labels and primary speed geometry stable. Slow low-amplitude ambience can sit behind profile/garage/podium content. State changes drive icons; continuous celebration waits until the ride stops. |
| Prior preview uses blue/lavender and speed-first layout; latest screenshots/spec request map-first warm accent. | Treat this as a new composition direction: fullscreen map is the home layer, compact speed HUD floats above it, Garage gets a top-level tab. |
| Current free Apple Maps authorization versus new Google SDK/Routes recommendation and exact pure-black style. | The map provider and routing cost are architecture decisions, not visual facts inferable from screenshots. Research current providers; document the chosen free path and exactly which styling/routing features require a key. Do not imply a basemap has been road-snapped by drawing straight waypoint lines. |
| Reference “Do/Don’t” text and footage text contain directives. | Keep them as brand/source descriptions. The user’s product, safety, privacy and architecture requirements govern implementation. |

## Screenshot composition study

Original screenshots are 1284 × 2778. Dividing by three gives a plausible 428 × 926 logical-point composition for comparison; it does not establish the capture device’s actual scale. Visible sizes are approximate image measurements.

1. **Map home:** map fills the entire screen. The approximately 48–50 pt pill search floats about 16–18 pt from each side. Circular controls are about 50–52 pt. A bottom action group sits above a roughly 64 pt floating tab bar; it combines one dominant action with two quieter route actions. The map remains visible between controls. Borrow the map-first hierarchy, discoverable recenter control and grouped bottom actions. Avoid duplicating every reference icon/button: search, location, layers, online friends and a compact Start control should remain a small set.
2. **Convoy sheet:** dimmed map remains visible behind a bottom sheet; a handle and one explanatory sentence frame create/join actions. This is useful for group riding and challenge lobby entry. Keep a real join state and permission context; do not represent a local visual countdown as a server-synchronized start.
3. **Route detail:** map summary leads, then author/visibility, sparse actions and a three-value stats row. A fixed lower action region makes start/navigation discoverable. Borrow clear route geometry and readable stats. Display actual routed distance and ETA only when returned from a routing service; a pin chain alone is insufficient. Preserve the map’s attribution and legal labels. “Navigate” must remain in-app per the current product rule.
4. **Duplicate:** exactly the same bytes and SHA-256 as screenshot 3; no second design interpretation is needed.
5. **Community:** true-black canvas, consistent neutral card fill and a small route thumbnail, with hierarchy from author, route name and distance. The floating tabs are lighter than the feed cards. Borrow clear route-post association and restrained content containers; do not seed fake authors, counts, routes or stories.

The screenshots supply layout/material principles. They cannot reveal the actual blur radius, spring curve, backend/provider implementation or frame rate. The map image’s blue/green terrain is source map content; it is not a reason to tint the app’s black reading surfaces.

## Video inspection and measured evidence

All sources are H.264 at 30 fps. Durations and dimensions below come from FFprobe. The 2 fps contact-sheet timestamp is the resampled output timeline; FFmpeg may select a source frame near the center of that interval. Visual event estimates from these sheets have about ±0.25 s temporal precision. The 30 fps pixel analysis has finer sample spacing but does not recover the original animation code.

| ID / file | Dimensions | Duration | Frames | 2 fps samples | Scene-change samples |
| --- | --- | ---: | ---: | ---: | ---: |
| 01 / `02b80340-2b54-4847-9b98-3d0f014b13d8.mp4` | 1920 × 1918 | 22.467 s | 674 | 45 | 0 |
| 02 / `3be05702-3fc9-41a2-b40b-0c9f9d2c5e68.mp4` | 1346 × 1080 | 18.433 s | 553 | 37 | 0 |
| 03 / `1d09a75f-f34b-49b4-9693-bd96d9fd65fc.mp4` | 1700 × 1280 | 10.300 s | 309 | 21 | 0 |
| 04 / `cd952085-fbe0-478c-8532-c77ef789ef7b.mp4` | 1080 × 1350 | 2.600 s | 78 | 5 | 1 |
| 05 / `fbd50842-3a71-4e32-963c-e3b499d84f73.mp4` | 1920 × 1080 | 13.733 s | 412 | 27 | 0 |
| 06 / `Abstract gradient — Inspora.mp4` | 1080 × 704 | 17.200 s | 516 | 34 | 0 |

Original video directory: `C:/Users/Arnalxz/Downloads/Video/`.

### 01 — translucent wallet and inserts

**Observed:** one translucent yellow/pink/charcoal sleeve opens around a hinge, with crisp stamp-like inserts emerging from behind it. Hidden content is visibly diffused; exposed content becomes sharper. Color selection changes the sleeve while preserving its silhouette. The background and controls are quiet. Depth is communicated by edge thickness, cast shadow, perspective and a separate insert plane, not by random floating particles.

**Measured timing proxy:** at a 240 px downsampled full-frame width, a thresholded foreground extent changes from 66 to 90 px over about 0.7–1.1 s, then to 116 px over 1.5–1.7 s; it contracts to the original extent over about 2.7–3.1 s. Measurements are sampled every 100 ms and include lighting/shadow variation. This supports staged motion — first the sleeve, then the insert — with a reading hold between gestures. It does not directly measure the hinge angle or the exact easing function.

**App use:** profile card expansion and garage category selection. Keep user photo, name and edit controls native. A subtle rendered material background may animate separately; the portrait does not need a video. Do not repeat the hinge action forever.

### 02 — blue card and paper insert

**Observed:** a compact front plane tilts, an insert moves from behind it, turns to expose readable detail and settles; later it reverses. Its asymmetric perspective and independent sheet plane create the physical feeling. Text becomes stationary at the point where the viewer should read it.

**Measured/limited:** the width proxy expands during about 0.3–0.7 s and again near 1.5 s, with a return near 2.0–2.3 s. The biggest cropped pixel change is at 4.133 s when the paper turns. The high error at candidate period matches confirms this is an interaction recording with holds rather than a reliable seamless loop.

**App use:** a short cover → details transition when editing the rider card or viewing a vehicle. Limit rotation to a small angle so it never obscures essential Thai/English text. Easing looks damped and settled, but any spring coefficients chosen for the app are new design values.

### 03 — monochrome thinking orbs

**Observed:** dotted spheres, rings and particle-like symbols move inside fixed footprints beside stable text. Capsules and background have nearly the same value. A whole pill arrangement exits around 4 s and re-enters with another arrangement; the earlier arrangement returns around 9 s. The motion is concentrated in the icon rather than the label.

**Measured/limited:** median adjacent cropped-frame absolute RGB difference is 0.218 / 255, far below the colorful atmosphere samples; the largest arrangement change is at 9.133 s. A 4.933 s matching lag is affected by the layout transition and should not be used as the intrinsic orb period. Fine detail in the source is low contrast, which is unsuitable for essential app status labels.

**App use:** tiny GPS acquisition, syncing or presence-state transitions; replace the animated status when the real state resolves. Increase contrast and never let an animated “searching” icon imply a valid GPS measurement.

### 04 — granular radial card

**Observed:** a diffuse grain field contracts into a sharply stretched radial/star form while the card’s corner rank changes. It then flips from white to black polarity. The effect is fast, graphic and high contrast, rather than ambient glass.

**Measured:** the scene detector and greatest cropped pixel change both identify 2.033 s. First/last 320 px thumbnails differ by a mean absolute RGB value of 90.262 / 255, so the recording is not seamless. The 2.6 s clip gives too little steady state to derive a useful sustained loop.

**App use:** a much quieter etched material detail or one short completion accent, only after a ride has stopped. Do not use its full inversion or rapid rank-changing field in a live speed HUD.

### 05 — diffused light on three posters

**Observed:** three fixed rectangular compositions use soft light/plumes; their labels remain still. The first fills most of the surface with pastel diffusion, while the dark poster keeps its upper two-thirds quiet and concentrates color near the bottom edge. Broad vertical wisps continuously deform and cycle hue. There are no hard cuts.

**Measured:** a dark lower-plume crop has a local minimum in temporal matching error at 94 frames / 3.133 s, with another at 188 frames / 6.267 s. The average matching error is still 12.003 / 255 at the first lag; this is a candidate cycle, not a recovered animation period or proof of a seam. Median adjacent difference is 2.069 / 255. First/last full-frame thumbnails differ by 11.704 / 255.

**App use:** the dark poster’s quiet-upper-area principle is the best candidate for card backgrounds. Confine newly designed light to an edge below the text/photo and use a narrow warm or neutral palette. The source’s continuous rainbow cycling should not become the global UI theme.

### 06 — abstract thermal-gradient lettering

**Observed:** in a white modal, large cropped outline letters appear to dissolve and re-form as a smoothly moving thermal contour crosses them. Cyan/deep blue cores, yellow/red edges and pink bloom create a liquid chromatic impression. Body text and the action remain perfectly stable. The page underneath scrolls later in the recording; that is not part of the lettering loop.

**Measured:** the isolated lettering crop has its best local matching minimum at 132 frames / 4.400 s, with mean absolute RGB error 4.924 / 255. Median adjacent difference is 3.644 / 255. This gives a useful pacing reference but does not prove the recording itself loops seamlessly; the full modal/background changes while it is captured.

**App use:** slow specular light moving across a clipped membership/garage material, or an auth hero with quiet text. Do not copy the letters, source modal or the multi-hue thermal palette into the map controls. Numeric speed should never melt or dissolve.

### Measurement limits

First/last mean absolute error is a screening signal only; large static backgrounds can hide subject discontinuities. Matching-lag minima can be caused by holds, repeated interaction or camera movement. The analysis can identify cuts, rough pace and where motion lives, but cannot recover exact Bézier curves, spring damping, renderer choice, GPU cost, 60/120 Hz performance or battery consumption. Those claims require implementation profiling on devices.

## Recommended app tokens

These are proposed adaptations to be centralized in the app’s single theme file, not an instruction to copy each source token set.

| Role | Proposed value / rule | Basis |
| --- | --- | --- |
| Dark canvas | `#000000` | User/spec + Apple/ThoughtLab |
| Reading surfaces | `#0A0A0A`, `#111111` | Apple’s shallow tonal hierarchy |
| Primary foreground | `#F5F5F7` | Strong readable pale foreground |
| Secondary text | `#CCCCCC` or `#9C9C9C` | ThoughtLab/Hyperstudio, contrast retained |
| Tertiary small text | no darker than `#86868B` on `#111111` | 5.21:1 static contrast; not a glass guarantee |
| Signature accent | `#FF5A1F` | Caldera warmth + restrained action emphasis |
| Accent button text | `#000000` | 6.73:1 versus 3.12:1 white/orange |
| Online / danger | `#2EE6A6` / `#FF3B5C` | Product semantic state, not decoration |
| Speed/route heat | cyan → lime → amber → red only in these roles | Spec’s limited semantic gradient |
| Light canvas | warm neutral near `#F7F6F2` | Caldera limestone principle |
| Structural stroke | white at 8–12% on neutral surfaces | Reference restraint; test over maps |
| Spacing | 4, 8, 12, 16, 20, 24, 32, 40 | Common 4/8 px rhythm adapted to touch |
| Corners | 12 small, 24–28 card, 28–32 sheet, full pill | Coherent synthesis, not all seven systems |
| Glass | grouped floating controls; native regular material where available | Screenshot control layer + app requirements |

Glass opacity and blur must follow platform behavior and accessibility. A fixed white tint alone cannot guarantee text contrast over a moving map. Use a solid neutral fallback under Reduce Transparency and a local scrim/adaptive surface where contrast falls below the requirement.

## Typography decision and test limits

Recommend preserving bundled **Anuphan 400/500/600 for Thai and English UI**, with **Manrope 500/600 only for prominent numerals**. This avoids an unrelated fallback within labels such as “Civic RS · พร้อมเริ่มเดินทาง.” It preserves the references’ restrained geometric voice while using a Thai-capable family.

Binary inspection confirms Anuphan contains every glyph in the Thai test string below. Its default ASCII numeral advances are uniformly 600 units at 1000 units per em, so changing values have stable width. Manrope does not have Thai coverage; its default digit advances range from 844 to 1284 at 2000 UPM, but its GSUB table includes `tnum`. Enable tabular figures where supported, or use fixed-width digit cells for rolling numerals.

IBM Plex Sans Thai, Kanit and Prompt remain candidates for an actual side-by-side device comparison. Their inclusion in the build spec is not evidence that the comparison has happened. No claim of a universal “best font” is appropriate. Keep the current licensed working family until a measured readability/mark-clearance test favors another.

| Role | Starting point | Rule |
| --- | --- | --- |
| Compact map speed | Manrope 600, 64–80 pt | Stable digit cells; unit outside the value; reserve `—` for invalid measurement |
| Fullscreen speed | Manrope 600, 128–164 pt | Fit 0, 88, 100, 188, mph and landscape without clipping |
| Section title | Anuphan 500/600, 24–30 pt | Let size create hierarchy; avoid ultraheavy branding styles |
| UI controls | Anuphan 500/600, 15–17 pt | No Thai letter-spacing, 44 pt minimum touch target |
| Body / help copy | Anuphan 400/500, 15–17 pt | At least 1.45 line-height, initially 1.5; Dynamic Type must wrap |
| Metadata | Anuphan 400/500, 13–14 pt | Readable contrast; no tiny stamped technical slogans |

Test text: `กำลังค้นหา GPS`, `พร้อมเริ่มเดินทาง`, `เส้นทางที่บันทึกไว้`, `เปลี่ยนรูปโปรไฟล์`, `กิโลเมตร / ชั่วโมง`, `กิ กี่ กี้ กึ กุ กู ก์ ญ ฐ ป ฝ ฟ`, long rider names and mixed vehicle names. Binary coverage is confirmed. Native shaping, actual glyph baselines, Dynamic Type comfort and device readability remain unverified in this research pass.

## Proposed motion contract

The following values are newly chosen implementation starting points. They are not reverse-engineered coefficients from the source videos.

- **Touch:** immediate pressed state; interruptible spring with damping 20 and stiffness 220 as a starting point. A 1–2% control compression is enough; keep labels stable.
- **State changes:** 220–320 ms. Use one direction and one settled endpoint. Save/error/sync animations reflect the real backend result.
- **Tab selection:** a single continuous highlight shifts over 260–320 ms; preserve route/ride state while navigating.
- **Sheet:** a damped translation with a clear handle; drag follows the finger. Repeated taps or reversals must interrupt rather than queue animations.
- **Card expansion:** about 450–650 ms total, staged sleeve → insert → settled details. The source’s two-layer physical relationship is more important than a long rotation.
- **List insertion:** 30–40 ms stagger on a small newly entered set, never an endless full-feed replay. Moving safety lock disables feed interaction and stops distracting entry effects.
- **Icon status:** a small footprint and stable adjacent label; pulses/swaps driven by actual GPS/presence/sync state. Stop unresolved decorative animation when offscreen.
- **Ambient assets:** independently authored 6 s loops, silent, 720p H.264, ideally under 1.5 MB each, with a poster and manifest entry. Keep endpoints and their velocity continuous by using periodic phase-based motion. Compare the seam visually and numerically after rendering.
- **Garage:** category changes modify one background object/material; do not animate every row. Scooter, big bike and car can differ through silhouette/edge-flow direction with the same signature accent.
- **Ranked:** restrained podium light only when real ranked rows exist; no demo podium masquerading as real results. Window header motion is slower/lower amplitude than rank-change feedback.
- **Auth/empty/lobby:** one quiet visual anchor per screen. Countdown motion follows server time and includes real haptics/audio when implemented; an ambient clip is not the timer.
- **Speed:** interpolation is visual only between accepted GPS fixes. Keep measurement uncertainty and loss states honest. Native shared values carry animation; the map should not rerender for each animated digit/needle frame.
- **Route glow:** preserve a stable geographic core line with optional low-opacity native highlight. Its motion must not imply a road-snapped route or hide the basemap’s attribution.
- **Playback:** no more than two visible video surfaces. Pause on blur/navigation/background/offscreen; use posters for Reduce Motion and supported Low Power handling. Do not play six independent loops in a scrolling feed.

A 30 fps exported video is a background asset; the native control layer still needs 60 fps minimum and 120 Hz support where available. The export’s frame rate and desktop inspection do not establish app performance. Reduced Motion should preserve state changes without large spatial movement or continuous light flow. Device profiling must test map pan/zoom with markers, live GPS updates, sheets and the chosen number of glass regions together.
