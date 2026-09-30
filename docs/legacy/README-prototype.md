# Ride Speed — Expo Go prototype

This is a foreground-only iPhone speedometer that runs from a Windows PC through Expo Go. It works the same way for a bicycle, motorcycle, or car: there is no vehicle selection and no vehicle-specific speed cap. The core speed filter is separate from the screen and has automated tests.

## Important limits

- **Keep Expo Go open and the phone unlocked.** Expo Go does not support iOS background location updates. Locking the phone or sending the app to the background stops the session.
- Expo Location supplies an instantaneous speed and horizontal position accuracy, but does **not** expose iOS CLLocation.speedAccuracy. This prototype therefore cannot apply the strongest native speed-uncertainty check. “Good” means the available reading passed the app's checks; it is not a certified GPS signal or speed accuracy grade.
- A current reading needs three consecutive fresh, good fixes. The session maximum uses the lowest speed of each three-fix window, so one or two high GPS spikes cannot set a record. This deliberately misses brief true peaks. A sustained bad GNSS reading can still be wrong.
- No ride track is saved in this prototype. A [sample GPX route](ExpoRideSpeed/samples/RideSimulation.gpx) is included for future Xcode simulator work; Expo Go on an iPhone cannot replay it.

The research and native recommendation are in [RESEARCH.md](RESEARCH.md).

## Run on your iPhone from Windows

1. Install [Node.js LTS](https://nodejs.org/en/download) on Windows, and install [Expo Go](https://expo.dev/go) from the iPhone App Store.
2. Create a free Expo account. Sign in to that account in Expo Go on the iPhone.
3. Open PowerShell in this folder and run:

   ~~~powershell
   cd .\ExpoRideSpeed
   npm install
   npx expo login
   npm start
   ~~~

4. Keep the PC and iPhone on the same Wi-Fi network. Scan the terminal QR code with the iPhone Camera and open it in Expo Go. If the connection fails, stop the server with Ctrl+C and run npx expo start --tunnel instead. Expo requires the CLI and iPhone app to use the same account for a physical iOS device ([Expo instructions](https://docs.expo.dev/get-started/start-developing/)).
5. Tap **Start Session**. Allow location access **While Using the App** and turn on **Precise Location**. Outdoors, wait for three clean readings. The large speed appears in km/h; tap mph to switch. Tap **Reset** to clear the maximum, and **End Session** to stop GPS use.

The app.json permission text is for a future standalone build. Expo Go displays its own iOS permission text.

## Verify the code on Windows

From the ExpoRideSpeed folder:

~~~powershell
npm test
npm run typecheck
npm run lint
npx expo export --platform ios
~~~

The unit tests cover invalid and stale readings, weak accuracy, gaps, GPS spikes, reset, and timeouts. These commands check the filter, TypeScript, lint, and iOS JavaScript bundle; they do not replace a field test on an iPhone.

## Compare speed outdoors

Secure the iPhone with a clear sky view. On a safe route or closed course, hold several steady speeds for at least ten seconds and compare the display against a calibrated wheel-sensor bike computer or an independent GNSS reference. A vehicle dashboard is useful as a cross-check but may itself overread. Have a passenger observe the phone in a car; do not handle it while riding or driving.

Repeat under trees and near tall buildings. Check that an uncertain reading becomes “—” without raising the maximum. Lock the phone and confirm that the session stops rather than silently claiming continued measurement. Record the iPhone model, iOS version, reference device, route, and conditions for discrepancies. Avoid using a simulator or a single brief peak as an accuracy verdict.

## Path to the full native app

The original locked-screen requirement needs a native iOS build with Core Location's speedAccuracy and background location mode. Xcode requires macOS. With a borrowed physical Mac and a free Apple Account, you can install on your own attached iPhone for personal testing, but provisioning [expires after seven days](https://developer.apple.com/help/account/basics/about-your-developer-account/). A cloud Mac without a physically paired iPhone requires a paid Apple Developer Program route for TestFlight distribution. Windows plus Expo Go cannot meet locked-screen tracking.

## Later phases (plan only)

1. **Native speedometer:** SwiftUI/Core Location, speedAccuracy gate, active-session background updates, and on-device locked-screen tests.
2. **Ride recording:** retain timestamped raw fixes and quality flags, draw a speed-colored MapKit track, and export GPX.
3. **Sensor fusion:** evaluate CoreMotion-assisted smoothing against an independent reference during short GNSS outages; never infer a tunnel maximum from uncorrected acceleration alone.
4. **External GNSS:** add optional support only after testing receiver compatibility and actual delivered update cadence.
5. **History:** store completed rides and summary statistics locally, with export and deletion.
