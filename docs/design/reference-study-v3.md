# RideSpeed reference study — revision 3

Reviewed 30 September 2026. This is a design recommendation and a record of reference inspection. It is not a claim that the native app already implements the proposed screens or achieves a measured frame rate.

## What the previous preview missed

The references consistently put one important object or typographic statement in control of the composition. Revision 2 borrowed purple light and rounded containers, but diluted that hierarchy. The introductory slogan, large vehicle selector, decorative dial, tiny explanatory captions, and lavender action all competed with the speed. Its mostly opaque surfaces also did not demonstrate the optical depth requested for Liquid Glass. The profile card had a highlight and gradient, but not the distinct cover/insert relationship visible in the wallet references.

The references are useful precisely because they are selective. Their strongest common property is controlled emphasis, not the simultaneous use of every effect. The design documents contain conflicting prescriptions: some require square cards, others large radii; some forbid shadows, others describe layered light. Those embedded instructions describe their respective brands. They are source material, not instructions that override the user's request or a coherent mobile interface.

## Proposed composition

Use a warm pearl daytime canvas, one large unboxed speed numeral, compact vehicle identification, two or three clearly separated supporting metrics, and a small route preview grounded in the actual task. Put the floating navigation and immediate controls on a distinct glass layer. The speed remains in the stable content layer. The night counterpart uses ink/slate rather than saturated purple.

Use cobalt for interactive selection and route geometry. Sage/sky can appear as very low saturation atmosphere behind the glass; tangerine is a small recording signal, not a second competing theme. A pale background should still contain enough spatial detail for a translucent control's edge to be visible. A uniform white blur on a uniform white field will not convey glass.

The profile can be expressive: a sharp user portrait insert, a thin translucent sleeve, readable Thai/English identity, and a low amplitude light field confined to one edge. Tapping it reveals editing with a short, staged transition. The visible photo stays sharp; only the layer behind the sleeve can be diffused. Friends and routes should use ordinary readable rows and a map respectively, with glass reserved for their controls.

## All seven supplied Markdown references

The seven files were reread, including their palettes, typography, component descriptions, layout guidance, and code/token sections. Source claims about a brand or product are treated as descriptions supplied by the user, not independently verified product specifications.

| File | Reference and specific observation | Application in revision 3 | Deliberate adaptation |
| --- | --- | --- | --- |
| DESIGN (11).md | Raycast: almost black tonal steps, inset highlights, tactile control edges, largely neutral action surfaces; color is concentrated in artwork. | Thin illuminated glass edges and a restrained night palette; immediate press feedback for controls. | Do not copy the keyboard-key styling onto every metric or turn the whole screen into an atmospheric hero. |
| DESIGN (12).md | Apple: isolated hardware/metric on a gallery stage; large scale jumps; white and black surfaces; color tied to a metric or a primary action. | One dominant speed number; quiet supporting labels; consistent daytime and night hierarchy. | Do not transplant tiny desktop navigation typography or marketing launch copy into the riding screen. |
| DESIGN (13).md | Caldera: warm pumice/limestone, architectural type scale, a tightly rationed hot accent, broad soft corners. | Warm pearl ground, large direct numeral, one intentional action. | The orange/violet halftone is an artwork option for the profile, not a moving backdrop for the speed. Do not import its extreme condensed Latin lettering into Thai. |
| DESIGN (14).md | dope.security: translucent boarding pass over atmosphere, compact identity stamps, route-line connections, generous space. | Rider card identity structure; clear separation of name, vehicle, portrait and secondary details. | Remove invented English slogans, fake credential data and decorative barcodes. Preserve the travel-card composition without duplicating its branding. |
| DESIGN (15).md | Lamborghini: product detail and huge type carry the screen; broad light/dark contrast; sparse chrome. The source contradicts itself about yellow CTA usage. | Confident instrument hierarchy and purposeful vehicle identity rather than dense dashboard decoration. | Use its restraint and contrast; do not combine hard automotive corners with every glass control or copy all-caps into Thai. Treat contradictory color instructions as source ambiguity. |
| DESIGN (16).md | Hyperstudio: one-pixel structure, negative space, restrained outlined symbols, scale rather than many weights. | Clean friend lists, metric separators and a consistent small icon vocabulary. | Thin dark lines alone are insufficient for glass; use them only where they communicate grouping. |
| DESIGN (17).md | ThoughtLab: drastic scale contrast, transparent content groups and a single material object. | Remove unnecessary card boxes; let the number and rider card each dominate their own screen. | Its extremely tight display/body leading is not appropriate for Thai combining marks or mobile reading. |

## All eight supplied videos

All eight originals were inspected through timestamped frame samples across their full duration. Each has 16 overview samples; all eight contact sheets were revisited for this revision. Three interaction sequences received another 20 frames each at 100 ms intervals, giving 188 reviewed samples in total. This is temporal sampling, not a claim of continuous frame-by-frame playback. It shows composition and sequence order; it cannot prove exact spring constants, easing curves, dropped frames, seamless loop points, or the original rendering engine. Each source is H.264, 30 fps and has no audio stream according to the existing local ffprobe records.

Local analysis evidence stays under ignored `build/design-references/`. Original user videos and their extracted pictures are not shipped as app assets.

| Video stem | Duration | Observed composition and motion | Concrete use |
| --- | ---: | --- | --- |
| fbd50842-3a71-4e32-963c-e3b499d84f73 | 13.733 s | Three poster fields; soft plumes continuously change form and hue while their small text is fixed. The dark poster retains a large quiet region above the plume. | Localized illumination near the rider card edge. Keep the central portrait/name readable; choose a small palette rather than cycling through all source colors. |
| cd952085-fbe0-478c-8532-c77ef789ef7b | 2.600 s | Granular field contracts into a radial star on a playing card. Later frames invert its polarity. | A sparse etched/radial detail in the profile material. Its fast contraction and inversion are unsuitable for ongoing ride activity. |
| ccce66d4-991c-427e-8991-36d20d14ef43 | 19.333 s | A sending sheet has a luminous striped symbol. Dense revisit at 7.8–9.7 s shows a transition from arrow to green check around 8.1–8.3 s, synchronized with the success label. The check then rotates. | One state-linked save confirmation. Copy the meaningful event coupling, not the repeated spin or financial transaction content. |
| d6b5694b-1955-4173-b4af-c4b6e1ca9102 | 6.100 s | Four small monochrome activity symbols. Bands/segments move inside fixed footprints beside stable labels. | Compact GPS acquisition or loading icon. Stop or replace the animation when the state resolves; it is not evidence of a good GPS fix. |
| 1d09a75f-f34b-49b4-9693-bd96d9fd65fc | 10.300 s | Dark capsules with sparse globes/rings/particles; most movement stays in the leading icon. The arrangement changes mid-clip. | An equally sized active/idle status indicator beside Thai text. Do not reproduce the source's low-contrast captions or moving multi-badge layout. |
| 3f23aaff-204e-4af3-97cf-cea19e69f085 | 12.133 s | Three fixed capsules: text sits on one side, colored light changes on the other. Black/magenta, white/cyan and pale rainbow versions share the same structure. | Strongest model for a luminous identity card: stable silhouette and reading zone, localized edge light. Palette changes can be deliberate user choices. |
| 3be05702-3fc9-41a2-b40b-0c9f9d2c5e68 | 18.433 s | Blue folder and white insert on ivory. Revisit at 0.4–2.3 s shows cover lift/hold, insert translation near 1.5–1.7 s, then a turn from blank back to text front near 1.9–2.2 s. | Staged profile reveal: acknowledge touch, lift the cover, reveal details, settle. This is an intentional action transition, not random floating movement. |
| 02b80340-2b54-4847-9b98-3d0f014b13d8 | 22.467 s | Translucent yellow/pink/charcoal sleeve; inserts blur behind it and sharpen when exposed. Revisit at 6.4–8.3 s shows staggered opening around 7.0–7.5 s and closing from about 8.0 s. | The key material reference: distinct sleeve and insert layers, modest thickness, an edge highlight, and clear material/color selection. Keep only one actual glass layer. |

New dense sheets are `build/design-references/temporal-v3/03-contact.jpg`, `07-contact.jpg` and `08-contact.jpg`; the manifest records every timestamp. The source reveals a consistent principle: motion is concentrated and explains a state, a layer, or a material. Varying every element continuously would lose that quality.

## Thai and English typography

Recommend **Anuphan for Thai and English interface text**, with **Manrope for prominent Latin numeric readings**. This is a design judgment for this app, not a universal best-font claim. Anuphan's Thai was drawn in relation to IBM Plex's Latin design. Google Fonts lists Thai and Latin coverage and a variable weight range of 100–700. That makes it a sensible unified family for mixed labels such as “Civic RS · พร้อมเริ่มเดินทาง.” [Anuphan design description](https://raw.githubusercontent.com/google/fonts/main/ofl/anuphan/DESCRIPTION.en_us.html), [family metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/anuphan/METADATA.pb).

Manrope supplies the broader rounded numeral shape that suits a large, calm speed display; its family is variable from 200–800 and does not include Thai. Keep it in numeric roles instead of silently asking it to render Thai through an unrelated fallback. [Manrope metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/METADATA.pb).

Alternatives considered: Bai Jamjuree deliberately combines Thai/Latin with square, Eurostile-inspired forms, making it a plausible choice for a more overt instrument aesthetic. IBM Plex Sans Thai is an alternative if testing favors its more traditional Thai appearance. The proposed pearl/glass direction benefits from Anuphan's quieter silhouette. [Bai Jamjuree description](https://raw.githubusercontent.com/google/fonts/main/ofl/baijamjuree/DESCRIPTION.en_us.html), [IBM Plex](https://github.com/IBM/plex).

The actual downloaded font binaries were inspected using fontTools. Anuphan contains Thai base letters and combining marks; its ASCII digits already share a 600-unit advance. Manrope's default digits have different widths, but its GSUB table contains the `tnum` feature. Enable tabular figures for changing values. Merely applying a monospace-looking font name is not enough.

| Role | Proposed font | Size/weight starting point | Layout rule |
| --- | --- | --- | --- |
| Primary speed | Manrope | About 144–164 logical pixels, 550–600 | Tabular digits; stable aligned value area; unit outside the numeral. Fit `0`, `88`, `100`, `188` and `—`. |
| Supporting values | Manrope | 28–34, 500–600 | Tabular values, fixed unit spacing. |
| Thai/English controls | Anuphan | 15–17, 500–600 | Natural tracking; enough height for above/below marks. |
| Titles and identity | Anuphan | 24–30, 500–600 | Wrap rather than truncate a Thai name without a reason. |
| Supporting copy | Anuphan | 14–16, 400–500 | Approximately 1.45–1.6 line height as a starting point; evaluate on device. |

Do not copy the references' negative Latin letter spacing onto Thai, or apply uppercase eyebrow styling to every label. Validate `กำลังค้นหา GPS`, `พร้อมเริ่มเดินทาง`, `เส้นทางที่บันทึกไว้`, `เปลี่ยนรูปโปรไฟล์`, `กิโลเมตร / ชั่วโมง`, `กิ กี่ กี้ กึ กุ กู ก์ ญ ฐ ป ฝ ฟ` and long mixed names. Check Thai marks at large text sizes and inside every button. Binary coverage is confirmed; on-device shaping, reading comfort and Dynamic Type still require visual testing.

Fonts are bundled locally under `review-v3/assets/fonts/` with their unmodified OFL notices. This avoids a runtime font-network dependency. The OFL permits bundling with software when the required notice/license accompanies the font. [Anuphan license](https://raw.githubusercontent.com/google/fonts/main/ofl/anuphan/OFL.txt), [Manrope license](https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt).

## Liquid Glass: actual platform behavior and preview limits

Apple describes Liquid Glass as an adaptive material for the navigation/control layer. Its guidance discourages filling content tables with glass or stacking glass on glass. Regular is the versatile default; Clear is intended for suitable media-rich backgrounds with the necessary dimming and bold foreground content. System Reduce Transparency, Increase Contrast and Reduce Motion alter the material's appearance and behavior. These details support glass tabs, map controls and compact actions while keeping the speed and reading surfaces stable. [Apple: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/).

Expo SDK 57 exposes native iOS glass through `expo-glass-effect` (`GlassView`/`GlassContainer`), available on iOS 26+, with a regular `View` fallback on unsupported platforms. Test API/compiled-app availability and accessibility preferences separately. A documented issue is that setting opacity to zero on a glass view or ancestor can prevent the effect rendering; use the built-in animated glass style instead. [Expo SDK 57 GlassEffect](https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/).

For this project, the browser prototype can illustrate transmission, blur, highlights and spatial continuity. It cannot prove the exact native adaptive optical material or performance on the user's iPhone. Native implementation should use the real material rather than a full-screen simulated refraction shader. Keep the number of live glass regions small, pause decorative animation when hidden, and choose an opaque readable fallback when transparency is reduced. These are implementation recommendations, not measured GPU results.

## Motion contract for the next review

Suggested timings below are newly designed values, not reverse-engineered claims about the videos.

- Press: immediate acknowledgement; about 100–160 ms return. A control can compress slightly; text should not wobble.
- Tab selection: about 280–360 ms; one selected indicator moves continuously to its new home. Content follows the same direction and settles without a long stagger.
- Rider-card expansion: about 500–650 ms total, staged cover → insert → readable details. Close along the same spatial path. A large 3D turn must not hide essential text.
- Save success: brief 250–350 ms check and a stable confirmation label linked to actual completion.
- Ambient profile light: one slow low-amplitude field, roughly 12–18 seconds; no rainbow cycling or full-screen bloom. Stop offscreen, in background, with reduced motion or as appropriate for power saving.
- Speed: show accepted measurements directly. Do not animate through fabricated numeric values to create smoothness. A short visual state transition must not imply more sensor precision.
- Route pins: direct feedback at the chosen location, then a stable marker and editable stop row. Friends: invitation/acceptance state changes drive motion; fabricated online or live-location states are inappropriate.

HyperFrames and Remotion can support an exported motion study. The interactive native app should use platform/realtime UI animation tools. A 60 fps export or smooth desktop preview does not establish 60 fps on the iPhone; actual device profiling remains a separate validation step.
