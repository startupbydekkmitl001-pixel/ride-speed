# MapHome responsive follow-up — 1 October 2026

This source follow-up fixes a real short-wide browser overlap and the old560px web shell cap. It is separate from the compiled/public7bb3665 native preview. Native/tall map defaults and the other web screens'560px shell are preserved.

For web width≥720 and height<640, the stationary instrument/details occupy a right side panel, with ride terminal controls fixed below. Search/camera/credits insets leave the left map clear and52px floating rails retain their spacing. During movement the single primary speed/GPS instrument moves outside the scroll lane, so a retained stationary scroll offset cannot hide it when scrolling locks. The narrow moving glance variant is opt-in/default-false; secondary maximum remains in stationary details. Large-text terminal controls use distinct52px Pause/Stop/Resume/passenger targets with full bilingual labels and existing callback/disabled semantics, including retained movement lock after pause or interruption. No speed, account, course, record or position was fabricated for review.

## Evidence

- Root reran the complete app suite: **1000/1000, zero skips/failures**. The27 independently rerun focused actual-component cases cover ancestor shell width, native/tall defaults, active/inactive terminal states, single HUD/player and retained scroll position. Their simple line-height budget is a lower bound; it does not establish Thai glyph shaping at accessibility sizes.
- Real browser review used the current signed-owner app in a local fixed-size iframe, whose DOM reported **932×430,720×430 and428×926**. Thai/default-scale idle controls all passed center hit tests at720/428. Search width was446px at932,282px at720 and386px at428;52px rails stayed separated from the HUD/terminal controls. Actual attribution links were visible at720 y313–324 and428 y549–560, clear of those overlays.
- Screenshots and allowlisted DOM rectangles are in ignored `build/review-v5/m8/map-{wide-932,small-720,portrait-428}-*`. Portrait top/bottom captures cover the taller iframe. This is browser rendering evidence, not an iPhone emulator, native glass inspection, device font comparison or performance trace.
- App typecheck/lint and fresh all-platform JavaScript/Hermes exports are recorded separately in `build/m8-web-followup-*-final*`. Native compilation remains the exact7bb3665 package proof; it does not include this later web follow-up.

Physical iOS/Android accessibility, largest-text Thai/English shaping, GPS cadence, screen-reader order, power/codec/frame pacing and long-ride memory remain in the [M8 acceptance matrix](m8-acceptance-v5.md). The patch adds no theme/media/dependencies or hosted mutations.
