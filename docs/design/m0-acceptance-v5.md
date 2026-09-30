# M0 foundation acceptance — 1 October 2026

The foundation is source-verified; it is not a newly published native build. Hardware startup/frame-time/power measurements remain pending. The original build 9 continues to be the published IPA until later native release verification.

## Verified

- App tests: 82 passed; typecheck, Expo lint and both build configurations pass. Expo Doctor passed 21/21 checks; SDK dependency compatibility passed.
- Original Remotion garage material: 1280×720, 60 fps, 360 frames / 6 s, H.264 BT.709 limited-range yuv420p, no audio, 117,180 bytes. Source continuation pixels match exactly; encoded boundary deviation is recorded in `motion/validation.json` and the asset manifest.
- Real Expo web app at 428×926: fresh guest onboarding, navigation, empty garage, catalog/custom-model entry, Thai/English preferences, dark/light themes, reduced motion/transparency, and preference retention after reload. No horizontal overflow.
- Garage has one unambiguous `/garage` tab route. The optional modal picker is `/vehicle-picker`; existing Garage links remain valid. Reload retains the Garage tab.
- Manual Reduce Motion removes mounted decorative video elements; foreground eligible cards resume muted looping playback. Tab changes remove the old card player. The shared budget tests cover two-player limits, pause-before-grant, revocation and stale power reads.
- Independent review resolved light-card contrast, light-glass/navigation contrast, browser transparency support, manual reduced navigation motion and embedded picker footer spacing. The darkest light fallback is approximately #E9E9E9: accent text 4.76:1, muted text 5.47:1.

## Runtime defects found by app QA

Expo Battery's SDK 57 web implementation omits `addListener`, while the public listener wrapper calls it. A platform observer now skips unsupported web power events and uses Expo's documented unsupported value; native read/subscription failure stays unknown and uses a poster.

Expo Video's web view attaches to its player in a passive effect; `play()` in an earlier layout effect had no attached element and lost the intent. Both material players bind their immediate pause callback in layout, then start playback in a guarded passive effect after the view attaches. This retains synchronous budget revocation.

## Deliberately later scope

Map is the navigation label; the fullscreen MapLibre renderer/HUD and native landscape behavior are M2. Local owner isolation, onboarding/profile/avatar/deletion are M1. Garage and other feature screens retain older Thai copy until their owning milestones. M0 contains one new material; other compositions/preloading are M8. Native iOS/Android startup, frame rate, Thai shaping, native glass contrast and Low Power Mode acceptance have not been measured.

Local screenshot evidence is under ignored `build/review-v5/m0/`; original private references and evidence are not bundled into public source.
