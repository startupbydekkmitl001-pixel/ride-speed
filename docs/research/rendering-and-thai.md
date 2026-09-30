# Rendering, Thai text, and reference projects

Research date: 30 September 2026. This is a Phase 1 design recommendation, not an implemented or benchmarked screen.

## 16. Long tracks, charts, and UI updates

Use `react-native-maps` with the Apple provider. Its iOS MapKit polyline supports `strokeColors`, with one color for each coordinate. Keep a numeric speed legend and a selected-point value so color is not the only explanation. Break tracks at invalid fixes and recording gaps; never draw a convincing straight line across a tunnel as measured travel. [Polyline API](https://github.com/react-native-maps/react-native-maps/blob/master/docs/polyline.md)

The proposed data path has three resolutions:

1. **Recorded:** untouched sensor payloads and timestamps. All statistics, records, exports, and verification use these plus versioned quality rules.
2. **Analysis:** accepted samples, derived metrics, and indexed events. Retain the original sample ID and provenance.
3. **Display:** simplify spatial polylines according to zoom; downsample chart data to roughly 1–2 points per horizontal pixel. Always retain gaps, lap boundaries, brake events, and selected samples.

LTTB is a useful shape-preserving chart downsampler, but it does not guarantee preservation of every extremum. Add per-bucket min/max or event anchors where relevant. It is not a metric algorithm and must not decide max speed or lap times. Use spatial simplification for the map, not LTTB on latitude/longitude. [Original LTTB implementation and thesis link](https://github.com/sveinn-steinarsson/flot-downsample)

For Phase 3, use Skia paths with Reanimated/Gesture Handler for linked speed, elevation, and later lap/G-G charts. Maintain one selected **timestamp/sample ID** across charts and the map; binary-search the full analysis data when scrubbing. Compute path geometry when data or viewport changes, not every animation frame. Update the marker without rebuilding the whole map. Skia accepts Reanimated shared values directly. [Skia animation integration](https://shopify.github.io/react-native-skia/docs/animations/animations/)

`react-native-graph` is a real Skia-based option with scrubbing and an Expo SDK 57 example. However, its smooth Bézier rendering and single-series API need care for honest telemetry, multi-lap overlays, and explicit gaps. Recommendation: evaluate it during Phase 3, but prefer thin Skia chart components with straight segments where necessary. Do not imply that library marketing proves our performance. [Library API and example](https://github.com/margelo/react-native-graph)

Native acquisition runs independently of React. Proposed delivery: motion batches at 2–4 Hz while foregrounded, at lower frequency when no screen consumes them; the numerical speed changes only when a valid measurement arrives. A small subscribed speed component updates separately from controls and history. Animation may interpolate visual position, but must not invent intermediate speed measurements or hide latency. Keep high-rate samples out of React state, virtualize history, and test release builds. [React Native performance guidance](https://reactnative.dev/docs/performance)

**Proposed targets, not results:** 60 fps on supported devices; 120 fps as an optional ProMotion target, subject to hardware, power mode, and OS scheduling. Frame budgets are 16.7 ms at 60 Hz and 8.3 ms at 120 Hz. A one-hour or eight-hour recording must not make the live screen progressively slower. See the [measurement plan](../TEST_PLAN.md). Apple controls the actual display cadence; a requested rate is not guaranteed. [CADisplayLink](https://developer.apple.com/documentation/quartzcore/cadisplaylink)

## 24. Thai-first localization and typography

Thai has combining marks above and below the baseline, and spaces usually separate phrases rather than every word. Avoid fixed-height text boxes, arbitrary character splitting, aggressive letter spacing, and Latin-only assumptions about wrapping. Prefer short complete phrases and let the native text engine wrap. Test words such as “ความเร็ว”, “พื้นที่”, and “กำลังบันทึก” with stacked marks. W3C's Thai resources are a work in progress, not a certification of React Native rendering. [W3C Thai script resources](https://www.w3.org/TR/thai-lreq/)

Start with the iOS system font and tabular numerals for the speed. Compare a bundled Noto Sans Thai for labels during screenshot review; use regular/medium/semibold, not thin text in sunlight. Bundle only necessary weights so the first launch needs no font download. Noto Thai is distributed under the SIL Open Font License; retain its license with the app. [Noto Thai source](https://github.com/notofonts/thai), [Expo font embedding](https://docs.expo.dev/versions/v57.0.0/sdk/font/)

Use `i18next` + `react-i18next`, JSON translation files, and `expo-localization` for formatting preferences. First app launch defaults to Thai even when the phone uses English; Settings persists the explicit English/Thai choice. Use translations for accessibility labels, errors, exports, units, and native permission descriptions too. Expo `locales` can generate `InfoPlist.strings`; changing an in-app language preference alone does not change the language of an iOS-owned permission dialog. Explain that distinction in Settings. [Expo localization and native metadata](https://docs.expo.dev/guides/localization/)

Use Unicode-aware `Intl` formatting. For the riding display choose Latin digits consistently (e.g. `th-TH-u-nu-latn`) and label km/h versus mph clearly. For Thai history dates use a deliberate Buddhist-calendar preference (`th-TH-u-ca-buddhist`), with a Gregorian option. For example, 30 September 2026 is in BE 2569. Store UTC instants, SI units, and Gregorian ISO dates; never store formatted Buddhist years as timestamps. Leaderboard week boundaries must follow an explicit server rule, not each phone's locale. [CLDR calendar preferences](https://www.unicode.org/reports/tr35/tr35-dates.html#Calendar_Preference_Data)

Allow Dynamic Type and wrapping; proposed body size 17 pt with approximately 1.4–1.55 line height, adjusted after native Thai testing rather than treated as a universal formula. At accessibility sizes, secondary stats can stack or move below the fold. Do not shrink everything to fit. VoiceOver reads speed and units as one value on demand, without announcing every GPS update. Buttons need meaningful roles and states, and quality needs a word/icon as well as color. [React Native Text scaling](https://reactnative.dev/docs/text), [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility)

### Proposed design tokens for Phase 2 screenshot review

These are a proposal only. The requested light/dark Thai screen screenshots must be shown and approved **before screen implementation in Phase 2**.

| Token | Proposal |
|---|---|
| Light surface / main text | `#FFFFFF` / `#101828` |
| Dark surface / main text | `#101418` / `#F8FAFC` |
| Light action / warning / error | `#005C43` / `#7A4700` / `#B42318` on white |
| Dark action / warning / error | `#72E0B5` / `#FFD166` / `#FF9990` on dark surface |
| Speed | 96–128 pt tabular digits where space allows; no decimal while riding by default |
| Secondary statistic / heading / body | 28–36 / 22 / 17 pt, scalable |
| Spacing | 4, 8, 12, 16, 24, 32 pt; 20–24 pt screen inset |
| Touch target | At least 48 × 48 pt; primary start/end controls at least 56 pt high |
| Shapes | 12–16 pt corner radius; simple dividers; no decorative gauge required |
| Components | Speed value, quality badge, vehicle picker, start/end button, max/reset pair, permission explanation, metric card, event marker |
| Feedback | Optional brief haptic after confirmed events; no celebratory public-road speed chasing |

The speed is the focus. “—” and an explicit status replace unreliable numbers. The default ride surface has no scrolling charts, leaderboard, or route editing. Menus, calibration, and reports are stationary tasks. Contrast must be checked for final font sizes and actual combinations during screenshot review; these tokens are not a completed accessibility audit.

### Thai copy needing native-speaker review

| Meaning | Draft Thai | Review concern |
|---|---|---|
| Start / end recording | เริ่มบันทึก / จบบันทึก | Clear distinction from pause |
| Weak location | สัญญาณอ่อน | Explain that this is our data-quality estimate, not satellite signal strength |
| No reliable fix | ยังระบุตำแหน่งไม่ได้ | Short enough for riding screen |
| Maximum sustained for 3 seconds | สูงสุดต่อเนื่อง 3 วิ | Explain the conservative support-window definition; not an instantaneous peak |
| Elevation gain | ระยะไต่สะสม | Help: ผลรวมความสูงที่ไต่ขึ้นระหว่างทาง |
| Hard braking | เบรกแรง | Avoid implying a crash or emergency |
| Mount calibration | ตั้งค่าแนวติดตั้งโทรศัพท์ | Meaning and length |
| Closed course only | ใช้ในสนามหรือพื้นที่ปิดเท่านั้น | Must communicate restricted access, not an empty public road |
| Location explanation | ใช้ตำแหน่งเพื่อวัดความเร็วและบันทึกเส้นทางระหว่างที่คุณเริ่มบันทึก | Match actual scope, including a separate locked-screen explanation |
| Motion explanation | ใช้การเคลื่อนไหวเพื่อวัดแรงเร่งและแรงเบรก | Explain optional permission and which features remain available |
| Export warning | รายงานนี้มีเส้นทางและตำแหน่งของคุณ | Explicit action before sharing a raw report |

## Five open-source references worth studying

| Project | What to learn | Scope and reuse caution |
|---|---|---|
| [Overland iOS](https://github.com/aaronpk/Overland-iOS) | Background location collection, queueing, batching, configurable quality data including speed accuracy | Apache-2.0; architecture reference, not a validated performance meter |
| [Open GPX Tracker](https://github.com/merlos/iOS-Open-GPX-Tracker) | GPX import/export, pause/resume, recovering tracks, map interactions and localization | GPL-3.0; study behavior, review license before copying code |
| [OutRun](https://github.com/timfraedrich/OutRun) | Private local workout history, cycling support, statistics, GPX and full backup concepts | GPL-3.0; useful complete data-ownership model |
| [RaceChrono BLE DIY device](https://github.com/aollin/racechrono-ble-diy-device) | External GNSS/CAN data transport, receiver integration, telemetry testing | Hardware reference; verify license/protocol and actual iOS compatibility before reuse |
| [react-native-graph](https://github.com/margelo/react-native-graph) | Skia charts, selection gestures, keeping graph work away from React rendering | MIT; validate gaps, extrema, supported dependency versions and multi-series needs |

## Community search notes

These reports inform the test plan; they are **not accuracy evidence** and do not override vendor APIs or controlled measurements.

- [r/cycling: improbable max speeds](https://www.reddit.com/r/cycling/comments/hrwmh8/how_accurate_is_strava_max_speed/) supports keeping raw evidence and making single-spike fixtures.
- [r/Trackdays: preferred lap timers](https://www.reddit.com/r/Trackdays/comments/1loc23k/preferred_lap_timers/) values simple recording and exports, while reporting setup friction. Its quoted timing claims are not adopted as specifications.
- [r/motorcycles: digital speedometer project](https://www.reddit.com/r/motorcycles/comments/1sxqbik/gps_enabled_digital_speedo_i_made_for_a_class/) reinforces glanceable digits and mounting needs, not a universal dashboard error percentage.
- [r/cars: Dragy discussion](https://www.reddit.com/r/cars/comments/ma1ve7/) distinguishes external hardware from a phone app. Product generations differ; old comments cannot establish current update rates.
- [r/iOSProgramming: locked-screen failure](https://www.reddit.com/r/iOSProgramming/comments/1rfi33f/trouble_with_background_gps_tracking_on_ios_works/) is a useful failure scenario to reproduce. It is not proof that one Core Location API always fails.
- [Stack Overflow: unpredictable speed peaks](https://stackoverflow.com/questions/49939030/how-can-i-get-rid-of-unpredictable-speed-peaks-during-speed-measurements) motivates adversarial traces; old answers are not used to set current APIs.
- [r/reactnative: chart selection problems](https://www.reddit.com/r/reactnative/comments/1922ncg/any_good_gesture_enabled_line_chart_library/) motivates checking rendered peaks against source samples.
- X/Twitter searches for RaceBox/Dragy GPS accuracy yielded no sufficiently verifiable primary technical evidence in this research pass. No technical claim here relies on an X post. Build-specific r/expo/r/sideloaded findings are in the [build report](build-and-sideloading.md).
