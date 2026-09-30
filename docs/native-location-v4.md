# Foreground iOS location samples

Local Expo module: `ExpoRideSpeed/modules/ride-location`. Reviewed against the installed Expo SDK **57.0.26**, Expo Location **57.0.20**, and Expo Modules Core implementation on **30 September 2026**. This module needs an iOS development or production build; Expo Go does not contain it. Swift compilation and real-device measurements are not verified on this Windows host.

## Why a local module

The installed Expo Location iOS watcher exports the most recent CLLocation from each delivered batch and its standard JS location shape does not supply native `speedAccuracy`. The local module forwards every item delivered by Core Location to preserve measured speed uncertainty for later validation. It does not estimate speed from coordinates, synthesize accuracy, claim a fixed sample rate, or declare a ride eligible for ranking.

## Public API

```ts
import RideLocation, { type NativeLocationSample } from '../modules/ride-location';

// Nullable on Expo Go, Android, web, or an iOS build without the module.
if (RideLocation) {
  const samples = RideLocation.addListener('onSample', (sample: NativeLocationSample) => {
    // Feed the existing speed engine and preserve the raw sample for validation.
  });
  const errors = RideLocation.addListener('onError', ({ code, message, fatal }) => {
    // Fatal errors stop native capture. Temporary errors mark the signal unavailable.
  });
  await RideLocation.start();
  // On explicit stop, cancellation or unmount:
  await RideLocation.stop();
  samples.remove();
  errors.remove();
}
```

This is an API illustration, not a complete React hook. The application hook owns its mounted flag, pending-start generation, permissions, subscription cleanup, active state and engine lifecycle. Add listeners before starting; remove both when start rejects. A second native `start()` while running is idempotent. Stop clears the current manager identity before stopping updates, so an old manager's delayed callbacks cannot enter a later session.

## Implemented ride-hook integration

`ExpoRideSpeed/src/useRideSession.ts` now selects this module exclusively when it is present and keeps Expo Location as the absence-only fallback. Its public return adds:

```ts
nativeSource: boolean;
sessionId: string | null;
start(): Promise<string | null>;
getEvidence(): {
  sessionId: string | null;
  samples: RideEvidenceSample[];
  nativeSource: boolean;
  truncated: boolean;
};
```

`nativeSource` describes the selected provider for the captured session, not ranking eligibility. It remains available after stopping. `getEvidence()` returns independent copies of the raw sample records, so callers cannot mutate the retained evidence. Capture uses in-memory refs/objects, not per-sample evidence state updates, disk persistence or network submission.

`start()` resolves a fresh ID only after a new provider starts successfully. Permission failure/cancellation returns null; it never returns the retained prior capture's ID. The old snapshot can remain available after permission denial, but cannot be rebound to a new challenge. An attempted provider start clears its identity before clearing evidence; only successful completion assigns the new ID. Stop, background and fatal native errors preserve the successful identity and captured evidence for explicit review.

The buffer preserves the first samples until either **8,000 samples** or **2 MiB of serialized sample-array data** is reached, then stops appending and sets `truncated: true`. The speed display continues normally. A truncated session cannot be treated as complete ranking evidence. The limits apply to the sample array; any eventual submission envelope has additional overhead. Permission denial before a new provider starts leaves the previous capture intact. A new provider start clears evidence and max; stop, fatal errors, background, signal loss and `resetMax()` preserve the evidence. `resetMax()` only resets the display's max confirmation window, not the full session's raw history.

Native records preserve speed accuracy and source-information flags. Expo records carry actual coordinates, speed, horizontal accuracy and timestamp, with `speedAccuracyMps` and native source flags set to null. Its reported Android `mocked` flag is retained when supplied; all other providers leave that flag null. Native speed accuracy outside 0–1 m/s, or an explicit simulated/mock flag, withholds speed from the unchanged SpeedEngine and resets its confirmation window while preserving the previous confirmed maximum. All original values remain in evidence. The transport and UI do not create a replacement accuracy value.

The shared `ExclusiveLocationCapture` helper serializes start/stop across hook generations and remounts. A cancelled pending start must finish disposal before another begins. Cleanup from an older owner is a no-op against a newer owner. A failed cleanup retains ownership and blocks a second capture. The provider never switches because a native start failed. Hook permission, signal and background messages are now Thai and describe foreground-only behavior without incorrectly attributing it to Expo Go.

Use **one provider per session**:

1. Request foreground permissions through the existing Expo Location flow. Check its granted/precise result and Location Services setting.
2. If `RideLocation !== null`, subscribe and start it. Do not also start Expo `watchPositionAsync`.
3. If the module is null, use the existing Expo fallback. Keep unavailable speed accuracy unknown; do not fill it with zero or horizontal accuracy.
4. A native permission, accuracy or start error does **not** authorize fallback. Surface it and stop the session. Falling through to Expo could bypass the precise-location requirement or create overlapping watchers.
5. If an async start finishes after the hook's generation was cancelled, stop that native session and remove its listeners. Serialize stop/start transitions so an old cleanup cannot stop a newly requested session.
6. Backgrounding, lock, permission revocation and loss of Precise Location stop native capture. It does not automatically restart on return to foreground. The JS hook must update its displayed active state when the fatal event arrives; its existing AppState safeguard should remain.

## Raw sample fields

| JS field | Native source | Interpretation |
| --- | --- | --- |
| `timestampMs` | `(location.timestamp.timeIntervalSince1970 * 1000).rounded()` | Original fix time normalized to the wire format's nearest integer Unix millisecond, never bridge delivery time |
| `latitude`, `longitude` | `location.coordinate` | Unaltered coordinate components |
| `speedMps` | `location.speed` | Native instantaneous speed in metres/second; a negative value is invalid |
| `horizontalAccuracyM` | `location.horizontalAccuracy` | Native horizontal uncertainty in metres; a negative value invalidates coordinates |
| `speedAccuracyMps` | `location.speedAccuracy` | Native speed uncertainty in metres/second; a negative value invalidates speed |
| `isSimulatedBySoftware` | optional `location.sourceInformation` | Actual native source flag, or null when unavailable |
| `isProducedByAccessory` | optional `location.sourceInformation` | Actual native accessory flag, or null when unavailable |

Invalid negative readings are preserved for rejection downstream, not clamped to zero. Batches are emitted in Core Location's delivery order, one `onSample` event for each CLLocation. No filtering, smoothing or GPS quality threshold is embedded in this transport module. A native source flag alone is not cryptographic proof of a genuine ride; ranking still needs server validation and anti-abuse checks.

## Errors and lifecycle

`onError` includes `code`, `message`, `fatal`. The same codes are used for rejected start promises.

| Code | Meaning | Capture |
| --- | --- | --- |
| `E_LOCATION_PERMISSION` | Permission missing/revoked, or Core Location denied access | Stops / start rejects |
| `E_PRECISE_LOCATION_REQUIRED` | Reduced accuracy is enabled | Stops / start rejects |
| `E_BACKGROUND` | App is backgrounded | Stops / start rejects |
| `E_LOCATION_UNAVAILABLE` | A temporary Core Location error | Remains running; require a valid new sample |

The manager is created and operated on the main queue. It requests best-for-navigation accuracy, no distance filter, automotive navigation activity, no automatic pausing and **no background location updates**. These preferences do not guarantee a fix, accuracy or cadence. Module destruction and app-context destruction stop capture. The module asks for no permissions itself, writes no files and makes no network requests.

## Autolinking and build

Expo's default `nativeModulesDir` is `./modules`, so no application package edit is required. `expo-module.config.json` registers `RideLocationModule` for Apple; `ios/RideLocation.podspec` defines the local pod and its ExpoModulesCore dependency, with iOS 16.4 matching SDK 57. There is no generated application `ios/` directory in this change and no Android native stub.

Validate discovery from `ExpoRideSpeed` with the installed CLI:

```powershell
npx expo-modules-autolinking search --platform apple
npx expo-modules-autolinking resolve --platform apple
npm run typecheck
npm run lint
node --experimental-strip-types --test tests/speedEngine.test.mjs modules/ride-location/tests/sessionSupport.test.mjs
```

The existing Expo Location configuration must keep `NSLocationWhenInUseUsageDescription` in the generated app. It is intentionally not duplicated in a local plugin. The app build must include the `modules/ride-location` directory in its EAS upload or other cloud checkout. Swift changes require a new binary; an OTA JS update alone cannot add this module.

Required validation before claiming production readiness: successful cloud iOS compile/autolink; foreground start/stop on the iPhone 14 Plus; no extra manager after repeated starts; denied/reduced-accuracy flows; lock/background stop; cancellation during permission/start; restart without stale callbacks; genuine measured speed accuracy under usable and unusable GPS; web/Expo Go fallback without manufactured native fields. Retain raw invalid values in test observations and confirm downstream rejection. No claim that these device checks have passed is made here.

Verified locally: Apple autolinking search and resolve detect the local `RideLocation` pod and `RideLocationModule`; project typecheck and lint pass; **19 tests pass** (the 12 existing SpeedEngine cases plus 7 tests of the actual shared ownership/buffer helper used by the hook). The added tests exercise cancellation, stale-owner cleanup, failed start/stop, immutable evidence snapshots, both storage bounds and raw invalid-accuracy preservation. They do not substitute for React/native lifecycle or iPhone tests.

## Challenge review and submission

`src/components/RideControls.tsx` retains ordinary ride start/stop and adds challenge capture only when a signed-in user has accepted an open server `timed_race` using `sustained_speed_3s`, with a course session and a currently valid time window. It rereads challenge/membership at Start and rechecks time after permissions finish. The challenge and account bind to the successful new capture ID, not the screen query or previously retained evidence. Query/account changes during Start invalidate the pending binding; changing the query after a successful start keeps that capture's original challenge.

After stopping, the user explicitly opens review, chooses a result audience (private by default), and consents to sending precise coordinates, timestamps, speed and uncertainties to the verification service. Raw evidence is not exposed to friends/community by that audience setting. Missing native fields, fallback capture, simulated/mock flags, truncated evidence, invalid order and oversized envelopes are refused locally. The server remains responsible for course eligibility, membership, complete 3-second windows, signal quality and final result. No screen callback fabricates a verified result or winner.

`src/lib/rideSubmission.ts` serializes the exact captured records once as UTF-8 JSON, measures the complete envelope against 2 MiB, reserves a UUID, uploads its exact ArrayBuffer as `application/octet-stream` without upsert, queues, then invokes `verify-submission`. The ID, immutable bytes, audience and expected owner/ID path survive network retries in memory. Every retry first reads the existing row; existing objects are not uploaded again. Unknown/lost responses trigger state/existence checks, not new submission IDs. Queued/verifying/rejected/verified text comes from the stored server row. Retry and refresh are separate explicit user actions; there is no scheduled upload or verification polling.

Outgoing requests use the initiating account's pinned JWT and check the live AuthScope between steps. Switching accounts cannot convert an old submission into a new account's write. Unmount stops follow-up work, while an already transmitted request may finish on the server. Raw evidence and the retry draft are intentionally memory-only: app termination/unmount loses the local review; durable offline recovery is not implemented.

Additional local verification: 11 submission tests cover exact serialization and byte bounds, evidence identity/native requirements, challenge preflight, response loss at reserve/upload/queue, existing object reuse, verification lease handling, retained server states, binding mismatches and account changes. Five tests execute the actual hook with mocked React/native boundaries for successful identities, denied permissions, cancelled starts, native failure cleanup and fatal-stop evidence preservation. These tests do not replace cloud compilation, real iPhone GPS or a real approved-course submission.

## Primary references

- [Expo local-module setup](https://docs.expo.dev/modules/get-started/) and [autolinking local directory](https://docs.expo.dev/modules/autolinking/#nativemodulesdir).
- [Expo Modules API: queues, events and lifecycle](https://docs.expo.dev/modules/module-api/) and [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/).
- [Apple CLLocation speed accuracy](https://developer.apple.com/documentation/corelocation/cllocation/speedaccuracy), [speed](https://developer.apple.com/documentation/corelocation/cllocation/speed), and [horizontal accuracy](https://developer.apple.com/documentation/corelocation/cllocation/horizontalaccuracy).
- [Apple delivered location batches](https://developer.apple.com/documentation/corelocation/cllocationmanagerdelegate/locationmanager(_:didupdatelocations:)) and [accuracy authorization](https://developer.apple.com/documentation/corelocation/cllocationmanager/accuracyauthorization).
- [Apple source information](https://developer.apple.com/documentation/corelocation/cllocation/sourceinformation), [software-simulation flag](https://developer.apple.com/documentation/corelocation/cllocationsourceinformation/issimulatedbysoftware), and [accessory flag](https://developer.apple.com/documentation/corelocation/cllocationsourceinformation/isproducedbyaccessory).

Apple's HTML reference pages required JavaScript in the research tool. Their linked official Markdown endpoints were read directly to verify the property semantics and ordered batch delivery.

## 1 October verification update

Cloud development build [run 36748202348](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36748202348) compiled and packaged the Swift module on Xcode 26.4.1 at commit `edd4576`. Its release job failed before compilation because the Hermes download connection reset. Bounded transient-download retries were added for the next build. The current native test suite has 58 passing tests, including live uncertainty/source-flag filtering and real Supabase SDK token isolation. iPhone installation, native map gestures, GPS and frame rate still require device acceptance.
