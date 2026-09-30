# Website visual review — 30 September 2026

All five user-supplied sites were opened and visually inspected in the Codex browser. No login, purchase, paid asset download, or third-party code copy was performed. Screenshots here are local reference evidence, not app assets. This review distinguishes direct visual observation from proposed adaptations.

## Pages actually viewed

- https://inspomcp.dev/screens — archive thumbnail grid; Porsche detail at https://inspomcp.dev/sites/porsche-com.
- https://bencho.dev — component gallery; https://bencho.dev/blocks/glass-bubble; https://bencho.dev/blocks/tilt; https://bencho.dev/blocks/icon-bar. Glass bubble was dragged, card received a pointer interaction, icon selection changed from Home to You.
- https://www.scrolltide.co/#library — public template grid; https://www.scrolltide.co/components#c-liquid-glass-button — public component preview; https://www.scrolltide.co/shaders#sh-mesh-arctic — public shader preview. Actual prompt/component downloads are gated; none were accessed.
- https://minimal.gallery — gallery; https://minimal.gallery/tag/app/; https://minimal.gallery/takecontrol/ — desktop and mobile screenshot views.
- https://liquidglassdesign.com — gallery; https://liquidglassdesign.com/gallery/glass-on-image; https://liquidglassdesign.com/gallery/waze-reimagined-with-apples-liquid-glass-design-language.

## Eight precise observations and adaptations

1. **Glass needs something to refract.** Bencho's circular lens is almost clear through its middle. The background photograph remains recognizable; deformation and stronger luminance concentrate at the rim. The brightest edge is narrow, with small warm/cool variations, rather than a universal white outline or neon shadow. Dragging it across grass and the dark animal changes the visible material. Adaptation: use real contextual image/map content beneath floating control surfaces and keep refraction to a narrow rim. A gray opaque rounded rectangle over blank gray does not communicate the same material.

2. **A card can feel physical without permanent animation.** Bencho's tilt card is a single large photograph, with a modest corner radius and mostly quiet perimeter. Pointer interaction changes plane and shade together. It is not a card inside several nested cards. Adaptation: give the profile one coherent plane, a real editable portrait, one restrained specular pass on entry, and bounded touch-driven tilt. Keep name and vehicle readable during the transformation.

3. **Navigation motion should communicate selection.** Bencho's icon bar is a charcoal pill holding five evenly spaced line icons, with a circular active region. Inactive icons recede; only the active destination is bright. The active destination moved from Home to You when selected. Adaptation: a single traveling selection lens in a bottom dock; retain short Thai labels for discoverability instead of replicating icon-only navigation. Avoid all icons animating indefinitely.

4. **Tint is inherited from context.** The LiquidGlassDesign 'Glass on image' example has cream-to-green glass because the background is natural greenery. Its circular controls and tall sliders are cohesive despite different sizes. Bright white icon silhouettes remain legible over the translucent center. Adaptation: silver/cool neutral control glass over a restrained mineral/map field; no arbitrary rainbow palette. Keep the central speed field much calmer and higher contrast than photographic profile content.

5. **Map controls have distinct hierarchy.** The Waze concept keeps a full map legible behind sparse floating panels: turn direction at top, route summary/ETA at bottom, a vertical auxiliary control stack, blue route geometry, and a singular blue start action. Content panels use stronger dark tint than the lens border. Adaptation: route pinning is a full map screen with bottom-sheet stop list and one primary action; do not compress a fake detailed map into a dashboard card or duplicate maps between unrelated decorative panels.

6. **Optical depth is not a huge blur.** Scrolltide's public glass-button preview shows a clear primary pill, a more opaque frosted variant, a tinted variant, and a receding disabled variant. Edge highlight, internal shading, and gentle outer shadow separate these states. Adaptation: one consistent material hierarchy: clear floating navigation, regular opaque-enough sheets for text, solid saturated primary actions. Avoid making every button translucent just to say 'liquid glass'.

7. **The background can be quiet and still have dimension.** Scrolltide Arctic Mesh is a very pale ice-blue/white field with broad transitions, subtle surface texture, and no small glowing blobs. The public shader supplies a slow visual drift; exact timing was not measured. Adaptation: pale warm-white/cool-silver canvas with a broad blue-gray shift, reserved low-amplitude background movement only on parked/profile surfaces. The active speed reading must not sit over high-frequency motion.

8. **Type and image can carry the composition.** Inspo's Porsche screenshot uses cool silver automotive photography, dark shadows, a single red physical taillight accent, and a plainly set white sans-serif headline. Minimal Gallery's TakeControl desktop/mobile example uses warm light gray, near-black ordinary-weight type, generous spacing, and very few controls. Neither needs repeated decorative labels, badges, nested panels, or multiple accents to create hierarchy. Adaptation: sentence-case Thai titles, one concise secondary line, speed as the only huge number, no English slogan/eyebrow filler, no automatic card around every row.

## V2 proof critique

Viewed `docs/design/review-v2/proofs/speedometer-light.png` and `profile-pearl.png`.

- The speed screen has a decorative English eyebrow, large Thai slogan, manufacturer capsule, gauge arc, speed label, unit, quality capsule, explanatory sentence, three metric cells, readiness row, CTA, and another demo disclaimer. This makes a supposedly minimal screen busy through microcopy and repeated sections.
- The thin Thai letterforms and conventional heavy Latin number do not look like a deliberately tuned bilingual system. Lavender is repeated as brand dot, arc, and dominant CTA, without a connection to vehicle or route state.
- The profile contains several English presentation labels around a mostly empty identity card. A placeholder letter cannot demonstrate the photo feature or personal value. The card's synthetic streak and halo carry more attention than identity content.

## One coherent v3 direction

**Daylight instrument with optical controls.** Full-screen mineral-white base, near-black tabular speed numerals, a small carefully spaced Thai label and unit, clear quality status, and only the two or three secondary values needed for the current ride. A restrained silver-blue material is used for a floating bottom navigation dock and the compact vehicle selector. Route blue is the only major accent. The map owns its screen, with a stop list expanding from one sheet. Friends are clean photo/name rows and explicit route-sharing state, not a mosaic of stat cards. The rider card uses a cropped real user-selected portrait and the chosen vehicle, with bounded reflective animation. No ornamental English labels, all-caps microcopy, purple mesh blobs, or endless pulsing.

Proposed motion values, not measured from reference sites: button compression 0.98 over 120 ms; selection lens travel 260–320 ms; sheet settle 340–420 ms; subtle entry specular sweep around 700 ms only once. Motion must be state-driven and reversible. Reduced motion uses instant selection and opacity transitions. Do not animate numerical speed through invented intermediate values.

## Saved visual evidence

- `bencho-glass-bubble.png`
- `bencho-tilt-card.png`
- `bencho-icon-bar.png`
- `liquidglass-glass-on-image.png`
- `liquidglass-waze.png`
- `scrolltide-liquid-button.png`
- `scrolltide-arctic.png`
- `inspo-archive.png`
- `inspo-porsche.png`
- `minimal-gallery.png`

No claim of measured animation frame rate or native iPhone performance is supported by this reference review.
