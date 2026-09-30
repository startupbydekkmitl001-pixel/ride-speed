# Speedometer design review — draft 1

30 September 2026. **The user requested revisions; this direction is not approved for implementation.** Build preparation continues independently. The next design revision awaits their preferences.

## Preview artifacts

- [Dark and light proposal](speedometer-v1.png)
- [No fix, weak fix, permission and large text concepts](speedometer-states-v1.png)
- [Generation prompts](generation-prompts-v1.md)

Created with the built-in image-generation tool. These are generated concept images with fictional data, not screenshots of a working application. Exact spacing, glyph rendering, accessibility behavior and contrast must be checked in the implemented app after design approval.

## Proposed behavior, retained for revision

The speed is the primary value. The profile picker shows Civic RS, PCX160 or S1000RR, while the underlying type picker also supports bicycle and e-bike. A textual quality label accompanies an icon; it does not claim actual satellite signal strength. Live values become an em dash when quality is unreliable. Previously confirmed session maximum remains visible through a later GNSS gap.

The maximum is labeled as sustained for three seconds. Reset affects that displayed maximum without deleting recorded samples. Changing vehicles, reset and settings are stationary interactions. Start/end controls are at least 56 points tall, secondary touch targets at least 48 points.

The draft uses a dark charcoal surface with mint accents and a white surface with deep green actions. Speed uses tabular digits at approximately 120 points; labels start at 17 points with comfortable Thai line height. At large accessibility sizes, labels wrap and secondary content scrolls rather than shrinking. Speed and units are one VoiceOver value on demand, without announcing every sample.

Permission explanation is app-owned; the system permission dialog remains controlled by iOS. Denied location exposes a settings action. Optional motion denial must leave speed available. All actual app strings will live in Thai/English translation files.

## Visual review notes

- The two boards show a recording dot in different colors. The final direction must select one consistent treatment.
- Mint versus white speed numerals differ between the standard and large-text boards. Normalize after the user chooses their preferred appearance.
- Native Thai review is most useful for the sustained maximum label, fix-quality messages and permission explanations.
- No generated texture/gradient should be copied into native components; final surfaces use solid design tokens.

## Status

User response: “Revise the design before implementation.” No screen changes were made from this draft.
