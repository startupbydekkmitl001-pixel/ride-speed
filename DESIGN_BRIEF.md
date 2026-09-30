# Ride Speed — map-first design brief

Date: 1 October 2026. This implements the user's BUILD SPEC and explicit MapLibre/OpenFreeMap/Geoapify choice. Reference documents govern visual direction; the BUILD SPEC governs features, safety and architecture. This is a design decision record, not a claim that device performance has been measured.

## Evidence studied before product code

Seven complete DESIGN documents: Raycast, Apple, Caldera, dope, Lamborghini, Hyperstudio and ThoughtLab (22,138 whitespace-delimited words). Six supplied videos were sampled at approximately 2 fps plus scene detection and inspected as contact sheets. Five screenshots contain four unique images; the two route-detail files are identical. All five requested websites were opened, captured and studied; Inspo MCP search/find_similar/get_screen were used. Details: [reference study](docs/design/reference-study-v5.md), [website study](docs/design/website-study-v5.md), [map research](docs/research/map-platform-v5.md), [source and backend audit](docs/research/build-spec-gap-v5.md).

The screenshots establish the composition: an edge-to-edge map; a few floating circular controls; one grouped lower ride/route control; a separate floating tab bar; route detail with a large map and clear native text; a dark route-led community feed. Borrow these principles without copying layouts or assets. The videos establish light moving behind stable card content, restrained depth and deliberate card transitions. Source loops and exact easing are not inferred as proven from edited footage.

## Product composition

Authenticated returning users open Map. Navigation is Map · Garage · Community · Ranked · Me. Map contains route planning/saved routes, online friends and challenge entry. The speed HUD sits within thumb/glance reach above the ride control. Route editing expands a sheet; it does not become a second competing map. Expanded speed mode uses a black instrument surface and remains legible in landscape. Screens outside Map use spacious native text and opaque black surfaces, with glass reserved for floating controls.

Primary hierarchy: map and route → current speed → current ride action → secondary controls. The active vehicle is a compact context label, not a dashboard of decorative cards. Never show invented users, rides, vehicles, podium winners, locations or route estimates.

## Tokens — one maintained theme source

Implementation source: `ExpoRideSpeed/src/lib/theme.ts`. Values below are decisions, not measurements of reference thumbnail pixels.

| Token family | Dark | Light |
| --- | --- | --- |
| Background | `#000000` | `#FAFAF8` |
| Surface / raised | `#0A0A0A` / `#111111` | `#FFFFFF` / `#F1F1EF` |
| Primary / secondary text | `#FFFFFF` / `#A8A8AD` | `#171717` / `#5C5C62` |
| Signature accent / label | `#FF5A1F` / `#000000` | Same |
| Accent text / selected navigation | `#FF5A1F` | `#B93806` for 4.5:1 text contrast |
| Online / danger | `#2EE6A6` / `#FF3B5C` | Accessible darker variants where needed |
| Hairline | white 10–12% | black 10% |

Speed heat uses cyan → lime → amber → red only for the speed arc and route heat. Neutral map land/water/building layers use black through low-contrast gray; road labels must stay legible. A small orange route retains identity without turning every road into an accent. Preserve visible OpenFreeMap/OpenMapTiles/OpenStreetMap attribution; Geoapify attribution accompanies its search/routes.

Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48. Radius scale 12 for small rows, 20 for panels, 28 for sheets, pill for grouped floating controls. Touch targets ≥44 pt; icon glyphs generally 20–24 pt. Safe-area spacing is measured from insets, never a device-specific screenshot coordinate. Avoid dense all-caps Thai labels.

## Typography decision

Use bundled Anuphan 400/500/600 for mixed Thai/English UI. Its inspected glyph set includes the Thai test string and all digits; digit advance is 600/1000 UPM. Use Manrope only for large Latin instrument numerals with tabular figures/fixed cells (its default digits vary and it contains no Thai). Thai line height is ≥1.45, usually 1.55; no Thai tracking. Changing time/rank/speed uses tabular or fixed cells.

IBM Plex Sans Thai, Kanit and Prompt remain comparison candidates alongside Anuphan. Do not claim a real-device comparison occurred. A font specimen and large-text acceptance on iPhone 14 Plus/iOS 26 and Android will decide any later swap. The existing mixed-language readability and reference restraint favor Anuphan provisionally; the spec's default families are explicitly a default, not a reason to regress readability without testing.

## Glass

Native iOS 26 Liquid Glass where supported. Else use one blur/tint container per grouped control with 8–12% white tint, a 1 px inner specular line and a restrained static highlight. Android low-end/unsupported blur and Reduce Transparency use an opaque surface. Never nest glass containers. Limit simultaneous live material surfaces to roughly four; do not animate blur intensity. Text contrast is evaluated against the fallback and composited content, with a solid option whenever contrast cannot hold. White on `#FF5A1F` is only 3.12:1; dark labels are about 6.73:1.

## Motion language and assets

Touch spring starts at damping 20 / stiffness 220, interruptible. Press feedback scales to 0.97 in ~100 ms. State transitions 200–350 ms; stagger 40 ms only for short first appearances. Tabs change immediately without theatrical page slides. One haptic per meaningful action/tick, not per animation frame.

Map panning belongs to the native renderer. GPS fixes update shared values; the display interpolates on the UI thread without rerendering the map per frame. Raw measurement evidence is separate from smoothing. Needle, rolling digits, presence dots and route emphasis are native. The loop materials never determine race timing.

Original Remotion compositions under `/motion` generate periodic 4–8 s muted MP4 + poster assets, normally 720p and ≤1.5 MB each. Existing local Remotion 4.0.531 is reproducible; no duplicate framework is needed. Garage categories, podium/header states, auth/empty/lobby and HUD glow receive subtle distinct material. Maximum two active video players globally; offscreen/background/Reduce Motion/Low Power uses a poster. Native labels and photos remain stable above the material. Seam tests compare the mathematical continuation frame, not merely duplicate first/last images.

## Conflicts and resolutions

| Evidence / conflict | Resolution |
| --- | --- |
| Reference dark palettes include navy, lavender, gray; screenshots' basemap includes blue/green. | User asks pure black and explicitly chooses a custom map provider. Keep black neutral chrome/map style and a single orange identity. |
| References disagree on radii, headline families, shadow weight and uppercase tracking. | Mobile touch targets, Anuphan readability and restrained spacing win; no Latin tracking is transferred to Thai. |
| Spec recommends Google Maps; earlier user selected Apple Maps. | Latest explicit choice is MapLibre + OpenFreeMap and Geoapify. No billing/key required for base map; route/search key is server-only. |
| Spec mentions 120 Hz on supported devices. | iPhone 14 Plus is a 60 Hz display. Target sustained 60 fps there; 120 Hz is tested only on capable hardware. |
| Source videos contain sharp inversion/cuts and uncertain loop boundaries. | Build original periodic light motion; no abrupt looping polarity flash behind text. |
| Existing competition metric is sustained 3-second speed. | Preserve and label that metric; add route-time verification as a separate contract. |
| Default font families vs existing Anuphan. | Retain proven glyph coverage provisionally; record device comparison as pending. |

## Acceptance evidence

Source tests, typecheck, lint, web visual/interaction checks and unsigned builds are separate from physical-device acceptance. A real 50-marker pan/zoom, cold start, 30-minute ride/memory/battery trace, Thai shaping, low-power behavior and two-device synchronized countdown are required before claiming the corresponding spec targets. Live competitive results require an approved private course and real evidence; a closed-course checkbox cannot manufacture approval.
