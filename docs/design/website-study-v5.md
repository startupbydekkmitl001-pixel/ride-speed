# Website reference study — 1 October 2026

All five requested sites were opened in the in-app browser. Screenshots and read-only computed-style observations are in ignored `build/reference-v5/websites/`; `tokens.json` records four sites. The Inspo shell was observed before that JSON was assembled. These are measurements of the websites' visible shell, not measurements of the designs inside screenshot thumbnails. No assets or layouts are copied into the product.

| Site | Observed palette and typography | Observed controls / timing | Principle used in Ride Speed |
| --- | --- | --- | --- |
| [Inspo](https://inspomcp.dev/screens) | Cream `#F4F1EC`, ink `#1A1A1A`, muted `#6B6862`, accent `#BF3B2B`; Inter Tight body 17/27.2; Fraunces identity 24/28.8 | 14 px controls, 8×16 padding, pill radius; transitions 150–200 ms; shell blur 0 | Clear metadata, real reference provenance, restrained color. Its desktop archive shell is not a mobile map reference. |
| [Bencho](https://bencho.dev) | White, ink `#17181A`, muted `#3C3B37`; Inter/Maison Neue body 16/24; observed heading 40/42.4 | Black/white pill CTA, 15 px label; 20 px padding; soft neutral chips; 140–200 ms transitions | Small responsive controls, fixed footprints, movement tied to touch and state. |
| [Scrolltide](https://www.scrolltide.co/#library) | `#07080A`, ink `#F3F5F8`, muted `#9AA2AD`; Inter 16/24 | Nav 14/20, padding 6×14, pill radius, 150 ms transitions; teal CTA `#8BF3E6`; shell blur 0 | Periodic shader material can sit behind stable native labels. Its teal/navy palette conflicts with the requested true-black chrome. |
| [Minimal Gallery](https://minimal.gallery) | Observed dark shell `#000000`, text `#B3B3B3`; Inter 17/23.8 | Submit background `#242424`, 5×12 padding, radius 60, 200 ms transition | Fewer competing objects, generous breathing room, useful hierarchy. Raised product surfaces remain ≤`#111111` per spec. |
| [Liquid Glass Design](https://liquidglassdesign.com) | `#FCFCFC`, ink `#202020`, muted `#646464`; Inter 14/21.7, cards 13/19.5 | Card padding/radius 12; 150 ms controls; visible glass examples are images, so blur/tint cannot be measured from DOM | Glass only on controls floating over meaningful content; merge neighboring controls; opaque accessibility fallback. |

## Inspo MCP

The requested MCP is already connected; installing another copy would be unnecessary. `search_screens` was used for map HUD, leaderboard/podium, vehicle picker, feed, auth and onboarding, then `find_similar` for automotive restraint. Results included Frill, Bugatti, Porsche, Lithic and Zudo. `get_screen` inspected Bugatti and Frill records. The archive search did not supply a close mobile map HUD match. The user's four unique screenshots remain the strongest map/feed composition evidence.

Bugatti contributes automotive negative space and stable foreground typography over imagery. Frill contributes legible small functional tabs and metadata. Neither supplies a map, racing flow or Thai type system; those are designed from the user screenshots and product requirements.

## Proposed values, not extracted measurements

The product glass fallback uses a modest blur, 8–12% white tint and an inner hairline. The 200–350 ms state timings and touch spring (damping 20, stiffness 220) come from the BUILD SPEC and our implementation choice. Website screenshots cannot establish those blur values or recover exact easing. Live native controls use transform/opacity motion; blur intensity and layout are not animated per frame.

## Evidence boundaries

Screenshots were captured during this study, but hosted content can change. Browser computed styles establish the listed shell values only. FPS, native Thai shaping, device power consumption and the resulting app's glass appearance require physical-device acceptance. The original website/video assets are reference material, not bundled or redistributed app assets.
