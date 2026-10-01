# GPS response and zero-start acceptance — 1 October 2026

The user cancelled CarPlay, asked to remove passenger mode, and requested faster,
more accurate GPS speed with an initial **0**. The existing Expo/MapLibre app and
foreground-only capture policy remain in place. No new entitlement is needed.

## Changes

- Precise native velocity is displayed on its first valid fix. Previously every
  provider waited for three fixes and used a median, adding two sample intervals
  on acquisition and one on a sustained acceleration/braking ramp.
- Trust requires horizontal accuracy ≤20 m, speed uncertainty 0–1 m/s when the
  native provider supplies it, a fresh ordered timestamp, valid coordinates,
  nonmocked source and the existing plausible-acceleration check. Raw observations
  remain intact in evidence; the display never supplies verification evidence.
- Expo/web does not expose native velocity uncertainty. It retains three-fix
  acquisition and median spike rejection, but a strictly increasing/decreasing
  three-fix trend uses the newest speed. No extrapolated speed is displayed.
- A display-only standstill deadband enters zero at ≤0.3 m/s and holds through
  ≤0.55 m/s. It can suppress very slow creeping below about 2 km/h; this is a
  calibratable UI heuristic, not a claim of sensor accuracy. Record candidates
  still use the minimum of three raw accepted speeds and server verification.
- Native iOS already requests Core Location's best navigation accuracy with no
  distance filter. Expo fallback now requests BestForNavigation and an Android
  minimum update interval of 1,000 ms. OS delivery cadence is not guaranteed.
- Digit/needle transitions use the existing 260 ms theme timing on the UI thread,
  are interruptible, never overshoot, and respect Reduce Motion. No animation
  loop updates React state or drives map rendering.
- Initial zero is a muted placeholder paired with “Waiting for GPS” / “กำลังรอ GPS”.
  The engine keeps measured speed null. Once speed has been measured, losing GPS
  shows unavailable rather than pretending the vehicle stopped. First-fix state
  survives max reset and is reset only by a new capture.
- Passenger state, override API, buttons and Thai/English instructions are gone.
  Pause or signal loss cannot remove the movement lock. After pausing, the location
  button can check real stopping: three accurate, nonmocked, fresh and separated
  readings ≤0.3 m/s over at least 1.5 s, within a 10 s foreground lookup. Repeated
  cached timestamps cannot unlock; cancellation/background/account changes retire
  the lookup. These fixes are neither recorded nor shared.
- CarPlay request draft and planned scene/voice work removed. No CarPlay code or
  entitlement had been installed. Also fix an empty vehicle-year separator in
  the map vehicle picker.

## Verification

- Reproduced four response/standstill regression failures before the engine fix.
- 87 focused cases passed; full app suite: **1,025 passed, 0 failed, 0 skipped**.
- TypeScript and Expo lint passed; all-platform bundle export passed.
- Actual Thai browser UI at 428×926: map and expanded gauge show initial zero,
  waiting-for-GPS copy, readable controls and map attribution. No GPS was recorded
  or uploaded for this preview. Component tests cover Thai/English zero/loss,
  movement-lock covers, large text and reachable pause/resume/finish controls.
- Local evidence: `build/gps-focused-tests.txt`, `build/gps-full-tests.txt`,
  `build/gps-response-export.log`, and `build/review-v5/live-friends/` screenshots
  `map-zero-start.png` and `speedometer-zero-start.png`.
- Native cloud builds must use the follow-up source commit; build 864aac1 predates
  these changes. Bundle export alone is not an Xcode/Gradle build result.

## Installed-device checks still required

Use a passenger-operated reference logger or a stationary outdoor test setup:
observe first-fix acquisition, idle jitter, creeping, normal acceleration/braking,
poor sky visibility and GPS loss/recovery. Compare timestamped raw sensor readings
with displayed speeds without uploading synthetic rides. Pause while moving,
stop, and use the location button to verify the lock recovers only from fresh
stopped fixes. Check permission revocation and background interruption. Measure
battery and frame time on iPhone 14 Plus and a midrange Android. No physical
accuracy, 60/120 fps or battery claim has been established by desktop tests.

## Official API references checked

- [Expo SDK 57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/):
  navigation accuracy, Android timeInterval, reported speed and foreground watch.
- [Apple CLLocation speedAccuracy](https://developer.apple.com/documentation/corelocation/cllocation/speedaccuracy):
  native velocity uncertainty, separate from horizontal position uncertainty.
- [Reanimated withTiming](https://docs.swmansion.com/react-native-reanimated/docs/animations/withTiming/):
  bounded-duration shared-value transitions and reduced-motion support.
