# Windows → cloud Mac → unsigned IPA → Sideloadly

Phase 1 research, checked **30 September 2026**. Questions **17–19**. This document proposes the next phase; it does not establish that this app has built, installed, refreshed, or recorded successfully on an iPhone. No workflow or application code was added for this research.

## Recommendation and remaining proof

The constraints are technically compatible: generate the native project on a cloud Mac, build an **iPhone device** application without signing, package it as an IPA, and let each tester's Windows Sideloadly installation sign it with that tester's free Apple Account. The cloud build does not need the tester's phone or Apple password. Apple's free provisioning limits still apply to the installed app. This is a composition of documented build/signing mechanisms, **not an end-to-end test result**. [Apple account limits](https://developer.apple.com/help/account/basics/about-your-developer-account), [Sideloadly](https://sideloadly.io/), [example unsigned archive workflow](https://github.com/antigluten/amgi/blob/main/.github/workflows/build-ipa.yml)

The user has selected **public source hosting and GitHub Actions on standard macOS runners** for Phase 2. Both unsigned build variants now passed in [workflow run #2](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36725855154); device installation is still untested. For comparison, **Codemagic's personal free plan** has the clearest published Mac-time allocation for private development; private GitHub Actions remains another option subject to measuring current quota accounting.

The first Phase 2 gate must prove two small artifacts: a release IPA that starts without Metro, and a development IPA that loads JavaScript from Windows. Test install, locked-screen recording, refresh, and an in-place update retaining a sample ride before building more screens. Required Apple services absent from free provisioning cannot be restored simply by disabling signing or editing entitlements.

## 17. Cloud build feasibility and free limits

| Provider/account | Published free allowance | Implication for this project |
|---|---|---|
| GitHub public repository, **standard** hosted runner | Standard runner usage is free; this includes standard macOS. Larger runners are charged even for public repositories. | Preferred if publishing source is acceptable. Avoid `-large`/`-xlarge`. |
| GitHub Free private repository | 2,000 included minutes/month; 500 MB Actions artifact storage shared with Packages; 10 GB cache/repository. | Account-wide quota, not a separate allowance per app. The current page does **not** establish 2,000 macOS wall-clock minutes. See uncertainty below. |
| Codemagic personal Free | 500 **macOS M2** minutes/month, one simultaneous build, one user; 30-day build history/artifact storage. Free minutes reset monthly and do not apply to Teams. | Good private-repository option. Linux/Windows and M4 minutes are not this free allowance. Do not enable paid overage. |
| EAS Free | Up to 15 iOS builds plus 15 Android builds, low-priority queue, one concurrency, 45-minute build timeout; separate 60-minute Workflows allowance. | A possible custom-build fallback; native compilation may hit the time cap. It is not unlimited builds. |

Sources: [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Codemagic pricing](https://codemagic.io/pricing/), [Codemagic billing source](https://github.com/codemagic-ci-cd/codemagic-docs/blob/master/content/billing/pricing.md), [Expo pricing](https://expo.dev/pricing).

**GitHub quota uncertainty:** older official documentation says macOS consumes included minutes at 10×, suggesting 200 Mac minutes from a 2,000-minute allowance. The current English page has replaced that table with per-SKU prices ($0.062/minute standard macOS; $0.006/minute standard Linux). Do not present either the historical 200 or 2,000 Mac wall minutes as verified current entitlement. Check the account's usage before and after a short job, with no payment method or a stop-usage budget. The public-runner recommendation does not depend on this ambiguity. [Historical official multiplier text](https://docs.github.com/ko/billing/managing-billing-for-your-products/about-billing-for-github-actions), [current billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

For planning only: if one clean Mac build takes 20 minutes, 500 Codemagic minutes allows approximately 25 builds, fewer after retries and setup. This duration is an assumption to replace with the first measured build. Run TypeScript tests on Windows/Linux and schedule Mac builds for native changes and releases.

### Existing project compatibility

The inspected `ExpoRideSpeed/package.json` declares Expo `~57.0.26`, React Native `0.86.3`, React `19.2.3`. Expo's SDK 57 table lists RN 0.86, iOS **16.4+**, Xcode **26.4+**, and minimum Node **22.13.x**. Therefore an application deployment target of **17.0** is compatible; the new Xcode SDK version does not force users to install that iOS version. Set the built-in `ios.deploymentTarget` property, then verify the generated app and Pods targets rather than assuming prebuild used it. [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/), [app config](https://docs.expo.dev/versions/latest/config/app/)

For the initial cloud build, explicitly choose the standard `macos-26` runner and an installed Xcode 26.4+ version. The inspected runner inventory includes Xcode 26.4.1 and newer; pin the selected version and record it in build metadata. `macos-latest` moves over time. **Actual dependency installation and native-module compatibility remain untested here.** [Runner labels](https://github.com/actions/runner-images/blob/main/README.md), [Mac ARM64 software inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md)

### Proposed pipeline

1. Checkout the intended commit. Install pinned Node and dependencies from the lockfile. Run lint, typecheck, and meaningful math tests before consuming Mac build time.
2. Configure a permanent release bundle ID, a monotonic iOS build number, and a human version. Proposed ID: `app.ridespeed.friends` (not registered or verified available); optional developer ID: `app.ridespeed.friends.dev`. Keep a separate fixed `.dev` identifier only if simultaneous dev/release installation is useful; it costs another installed-app slot and has separate data. For example, user-facing version `0.1.0` and build `1`, then `2`, are a numbering proposal, not existing release numbers.
3. Keep the Swift sensor implementation in a **local Expo module** under `modules/`. Put generated-project settings in app config/config plugins. Clean prebuild deletes generated `ios/`, so important handwritten code must live outside it. [Local Expo module](https://docs.expo.dev/more/create-expo-module/), [native customization](https://docs.expo.dev/workflow/customizing/)
4. On the Mac runner run `expo prebuild --platform ios --clean`, install CocoaPods, then discover the generated workspace and shared scheme with `xcodebuild -list`. [CNG](https://docs.expo.dev/workflow/continuous-native-generation/), [Apple command-line build guide](https://developer.apple.com/library/archive/technotes/tn2339/_index.html)
5. Archive for `generic/platform=iOS` with the `iphoneos` SDK and signing disabled. Build **Release** for friends, **Debug with expo-dev-client included** for development. A simulator `.app`, even ARM64, is not an iPhone binary. [Expo native development builds](https://docs.expo.dev/guides/local-app-development/)
6. Put exactly the archived app in `Payload/AppName.app` at the ZIP root and name that ZIP `.ipa`. Keep frameworks/resources inside the app. Do not use ordinary signed `-exportArchive` distribution as the unsigned packaging step. Sideloadly signs at installation. [Unsigned workflow example](https://github.com/antigluten/amgi/blob/main/.github/workflows/build-ipa.yml)
7. Validate ZIP contents, device architecture, minimum OS, bundle ID, version, release JavaScript/assets, and presence of the native module. Save Xcode logs and matching dSYMs. A ZIP check is insufficient: acceptance still requires the target iPhone test.
8. Keep transient CI artifacts briefly; attach the release IPA, checksum, Thai notes, and install guide to a versioned GitHub Release. The publish job needs `contents: write`; build jobs can remain read-only. Public release assets are convenient for friends; private release assets require repository access. GitHub permits individual release assets below 2 GiB, with up to 1,000 assets/release. [Release assets](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), [release workflow example](https://github.com/hoangnd107/ios-swiftui-app-template)

**Illustration only — untested, not a ready workflow.** The following is Bash on a disposable **cloud Mac**, with placeholder workspace/scheme/app names. Phase 2 must resolve the real names and lock tool versions. CocoaPods invocation should use the project's pinned Bundler/Gemfile if present.

```bash
npm ci
npx expo prebuild --platform ios --clean --no-install
npx pod-install
xcodebuild -list -workspace ios/RideSpeed.xcworkspace

xcodebuild archive \
  -workspace ios/RideSpeed.xcworkspace \
  -scheme RideSpeed \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath build/RideSpeed.xcarchive \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY=""

mkdir -p build/package/Payload
ditto build/RideSpeed.xcarchive/Products/Applications/RideSpeed.app \
  build/package/Payload/RideSpeed.app
cd build/package
zip -qry ../RideSpeed-unsigned.ipa Payload
unzip -l ../RideSpeed-unsigned.ipa
```

The code block is an engineering proposal assembled from the documented Xcode actions and inspected workflows. No claim is made that a particular signing-disabled archive setting succeeds with every dependency. Resolve build failures from logs; do not add paid capabilities to get around an unsigned build error. No Apple login, `.p12`, provisioning profile, or friend's password belongs in this build pipeline.

**Windows owner workflow after Phase 2 exists:** install the pinned Node version and Git; enter `ExpoRideSpeed` and run `npm ci` from the checked-out lockfile. Commit/push → open the chosen provider's build page → trigger the intended dev/release build → download its artifact → extract the outer CI artifact ZIP if present → select the enclosed `.ipa` in Sideloadly. For an actual release, friends download the attached IPA, not GitHub's automatically generated source ZIP. Actions artifact downloads require GitHub sign-in and repository read access. These steps were not executed in Phase 1; prebuild, Pods, and Xcode compilation belong to the cloud Mac in this pipeline. [Downloading artifacts](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

### Can EAS produce an unsigned IPA?

**Yes, through a custom build; do not equate “EAS” with “paid Apple account required in all cases.”** EAS documents signed and unsigned applications. Its iOS profile supports `withoutCredentials: true`, expressly useful for custom builds. A custom configuration can run the same signing-disabled archive/packaging commands and upload the result as an application archive. This is a documented building block plus an inferred pipeline, not a tested one-click recipe. Setting `withoutCredentials` alone does not rewrite the default signing/export steps. [Credentials](https://docs.expo.dev/app-signing/app-credentials/), [EAS profile schema](https://docs.expo.dev/eas/json/), [custom builds](https://docs.expo.dev/custom-builds/get-started/), [artifact upload schema](https://docs.expo.dev/custom-builds/schema/)

The ordinary EAS physical-device/internal-distribution recipe uses Apple provisioning; the simulator recipe avoids device signing but produces a simulator application. Neither is a shortcut from an unsigned simulator artifact to an iPhone install. EAS local iOS builds still need macOS/Xcode; Windows hosts Metro, tests, and orchestration. [Normal iOS build process](https://docs.expo.dev/build-reference/ios-builds/), [local builds](https://docs.expo.dev/build-reference/local-builds/)

## 18. Free-Apple-ID feature matrix

**“Expected” means supported by Apple's API/capability model, not measured in this app.** The current Apple membership table was inspected including its HTML checkmarks: plain extracted table text hides them. A free account is its “Apple Developer” column, not “ADP.” Sideloadly must also preserve/provision any required identifiers and extensions. [Apple supported capabilities](https://developer.apple.com/help/account/reference/supported-capabilities-ios/)

| Feature | Free signing status | Implementation or workaround |
|---|---|---|
| Foreground Core Location and `speedAccuracy`/source information | Expected to work | Request location permission and handle reduced accuracy/denial. Free signing does not improve sensor accuracy. |
| Background/locked-screen location | **Supported capability**, conditional runtime | Use `UIBackgroundModes: location` and begin recording in foreground. For the manager baseline, enable `allowsBackgroundLocationUpdates`; for the live-updates experiment, retain `CLBackgroundActivitySession`. Confirm locked-screen operation on iOS 17 and a current OS. |
| `CMDeviceMotion` and motion activity | Expected to work | Device availability and applicable privacy authorization still matter. Motion APIs alone do not grant indefinite background execution. |
| `CMAltimeter` relative/absolute altitude | Expected on supported hardware | Include `NSMotionUsageDescription`, request permission, check each availability API. Display unavailable data honestly. |
| SQLite, local files, GPX/export/share sheet | Expected to work | Ordinary application storage; implement explicit export/import backups. |
| Native Apple Maps display | Expected to work | No paid Google Maps key for the Apple Maps provider. Directions/network availability is a separate issue. |
| Email code / anonymous backend login | Expected to work | Ordinary HTTPS. Persist account recovery separately from expiring app signatures. |
| Local notifications | Expected with permission | Can remind about an event; they cannot renew signing certificates. |
| Sign in with Apple | **Unavailable under this membership** | Email code or recoverable anonymous account. |
| APNs push, including Expo push to this app | **Unavailable** | Fetch inbox/results while app is active; local reminders for device-local events. |
| App Attest | **Unavailable** | Server recomputation, consistency checks, quotas, and reviewed/unverified record labels. These do not replace hardware attestation. |
| iCloud/CloudKit/ubiquity key-value storage | **Unavailable** | Local SQLite plus an exported backup saved by the user to Files/PC; optional free backend sync later. User-selected Files export is distinct from adding an iCloud entitlement. |
| Game Center | **Unavailable** | Own nickname, friends, and leaderboard service. |
| HealthKit | Listed as supported for free developers | Future separate permission/capability/device test; not required for v1. |
| App Groups | Listed as supported for free developers | Do not repeat the outdated blanket claim that they always require ADP. Sideloadly's group remapping across independently signed extensions still needs testing. |
| Local Live Activity / Dynamic Island | **Potentially feasible; not yet verified through this pipeline** | ActivityKit has local update APIs. Requires a widget extension and separate signing/provisioning checks; extension App IDs consume scarce identifier capacity. No promise of a 1 Hz dashboard or indefinite execution. |
| Push-updated Live Activity | **Unavailable** | Local updates while permitted to execute, or normal in-app dashboard. |
| App Store/TestFlight distribution and purchases | Outside free personal signing | Continue per-person Sideloadly for this test group. Revisit with ADP only for a later store release. |

Membership-dependent rows above derive from [Apple's capability matrix](https://developer.apple.com/help/account/reference/supported-capabilities-ios/); the workaround column is the proposed product design. API details: [manager background setting](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates), [WWDC23 background session behavior](https://developer.apple.com/videos/play/wwdc2023/10180/), [CMDeviceMotion](https://developer.apple.com/documentation/coremotion/cmdevicemotion), [CMAltimeter](https://developer.apple.com/documentation/coremotion/cmaltimeter), [native MapKit view library](https://github.com/react-native-maps/react-native-maps), [local Live Activity updates](https://developer.apple.com/documentation/activitykit/activity/update(_:)), [Live Activity constraints](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities), [APNs Live Activities](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications).

**iOS 17 trap:** today's background-location sample also discusses `CLServiceSession`, an iOS 18 addition. Do not use it unguarded in an iOS 17 deployment. The 2023 session covers the iOS 17 `liveUpdates`/`CLBackgroundActivitySession` path. Background access is not an unconditional promise that JavaScript or every sensor keeps running after suspension, force quit, reboot, or expired signing. Persist sensor batches natively before depending on JavaScript delivery; record gaps and recover from a journal. [Apple background location guidance](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background), [current sample requirements](https://developer.apple.com/documentation/corelocation/adopting-live-updates-in-core-location)

### Expiry, limits, updates, and backup

Apple states: **7-day provisioning**, at most **3 installed apps/device**, **10 App IDs** and **3 registered devices** under a Personal Team, with seven-day lifetimes. Each friend should sign for their own device with their own account; the owner should not attempt to provision ten friends through one free account. App and extension identifiers must be budgeted separately from installed-app slots. [Apple account overview](https://developer.apple.com/help/account/basics/about-your-developer-account)

Sideloadly's auto-refresh needs its Windows daemon running and the phone reachable by USB or configured Wi-Fi. It cannot refresh from a powered-off PC. In-place updates require the **same Apple ID and effective bundle ID**, including any Sideloadly custom ID setting. Install over the app; do not delete it first. Keep auto-refresh enabled when replacing its cached IPA with a newer release. [Sideloadly FAQ](https://sideloadly.io/faq)

Proposed data contract: release bundle ID never changes; schema migrations are transactional and forward-compatible; the update test checks ride count, identifiers, raw samples, and settings. Before updates, export a versioned backup containing SQLite data/raw chunks/settings/checksums, then test restoration. Copying a live SQLite file without its WAL state is not the backup design. Expiry should be handled by refreshing the existing installation; a deleted application cannot be assumed to retain its sandbox. Implement at least a basic export **before friends collect important rides**, even though the full backup/restore UX is planned for Phase 3.

The [Thai friend guide](../INSTALL_TH.md) covers Windows prerequisites, Developer Mode, trust, refresh, and update steps. Installation and refresh must happen while stopped, outside a recording session.

## 19. Fast Windows development loop

1. Once in Phase 2, add `expo-dev-client` and the custom Swift module, produce the unsigned **Debug iPhone** IPA on the cloud Mac, and sideload it. Expo Go cannot acquire a custom Swift module through Metro. [Development-build introduction](https://docs.expo.dev/develop/development-builds/introduction/), [local native build mechanics](https://docs.expo.dev/guides/local-app-development/)
2. On Windows, from `ExpoRideSpeed`, run **`npx expo start --dev-client --lan`**. PC and phone must reach each other on the same local network. Permit Node through Windows Firewall for that private network; allow the app's iOS Local Network request. Scan Metro's QR code or enter the displayed URL in the dev-client launcher. Do not use the phone's `localhost` for the PC. [Expo CLI networking](https://docs.expo.dev/more/expo-cli/)
3. Change TypeScript/UI/translations/filter parameters and use Fast Refresh/reload. A Metro restart may be needed for bundler configuration. JavaScript changes do not need a new native IPA; changing Swift, native packages, app extensions, permission strings, entitlements, native configuration or SDK does. [Using a dev build](https://docs.expo.dev/develop/development-builds/use-development-builds/), [native modules rebuild guidance](https://docs.expo.dev/modules/get-started/)
4. The executable is still signed and still expires after seven days. Metro refresh neither signs the app nor extends its provisioning lifetime. Regular Hermes/Metro JavaScript execution is the planned path, not a dependence on Sideloadly's optional JIT-enabling feature. [Hermes engine](https://github.com/facebook/hermes/blob/main/README.md)
5. Use the dev build at the desk. Give friends an offline-capable Release IPA with embedded JavaScript/assets; measure battery, frame pacing, background reliability and timing in Release, because debug overhead would distort results. [React Native Hermes release behavior](https://reactnative.dev/docs/0.86/hermes)

**Windows logging plan:** JavaScript errors/Metro logs in the terminal plus React Native DevTools as supported by the chosen version. Native build failures in the provider's Xcode log. Add an in-app diagnostic export with native timestamps, start/stop reasons, OS/build/filter versions, authorization states, sample gaps and sensor rates. Save matching dSYMs per build for native crash interpretation. Cloud CI cannot directly observe the user's unplugged iPhone. The logging/export buttons are proposed work, not present merely because this guide mentions them.

### Phase 2 acceptance checklist

- [ ] Clean unsigned cloud archive and a ZIP with `Payload/*.app`, correct device binary, iOS floor 17.0, stable ID, version and embedded release bundle.
- [ ] One owner's free account installs both variants; a second friend's account installs the same release artifact independently.
- [ ] Metro over Windows Wi-Fi changes visible UI without a native rebuild; restart/reload/connection-loss behavior is understood.
- [ ] Release starts and records with Metro/PC turned off; device locked for at least 30 minutes, interruption and permission-denial cases logged.
- [ ] Stop cancels native sensors/session; suspension or forced termination leaves an honest gap and recoverable ride, not fabricated continuous samples.
- [ ] Same-ID/same-account version upgrade preserves a seeded ride; exported data round-trips; expiry/refresh is tested over a real seven-day period.
- [ ] One auto-refresh over Wi-Fi and one USB/manual refresh observed; PC-off case does not falsely report refresh success.
- [ ] Capture exact Xcode/Expo/RN/Sideloadly/iOS versions, elapsed cloud minutes, archive hash, and private-quota usage delta where applicable.

## Evidence from existing projects and communities

These sources identify implementation patterns and test cases. They do not certify this project or supersede Apple/Expo/provider documentation.

- [Amgi's actual GitHub workflow](https://github.com/antigluten/amgi/blob/main/.github/workflows/build-ipa.yml) has a signing-disabled archive, `Payload` packaging and short-lived artifacts. Useful for the build shape; its app and dependency graph differ from Expo.
- [SwiftUI unsigned template](https://github.com/hoangnd107/ios-swiftui-app-template) demonstrates unsigned artifacts and tag-to-release publication. Study the separation of compilation and signing; do not copy its framework/tool versions blindly.
- [Forge's Expo sideloading notes](https://github.com/adulari/forge/blob/main/docs/mobile/SIDELOAD.md) describe prebuild → archive → Payload; project-owner documentation, not an Expo guarantee.
- [Expo dev-client/Codemagic gist](https://gist.github.com/manutheblacker/a5145e6d13492bce0759784a2042a11e) targets this exact use case, but the inspected version changes into `Payload` and zips `.`. That omits `Payload/` at the archive root. It is an example of why recipes require inspection, not a ready workflow to adopt.
- [Stack Overflow unsigned-IPA discussion](https://stackoverflow.com/questions/25396299/generating-an-unsigned-ipa-ios-application) corroborates the long-standing pattern but contains old SDK-editing advice. Use it only as historical context; never patch Xcode's SDK settings to disable signing.
- [r/expo device-build question](https://www.reddit.com/r/expo/comments/1ft06nb/) illustrates confusion between the normal EAS signing flow and compiling unsigned native code. The verified custom-build schema answers the technical question here. Targeted r/reactnative searches did not yield a useful current first-hand report; no claim of validation from that community is made.
- [r/sideloaded auto-refresh discussion](https://www.reddit.com/r/sideloaded/comments/179gl62/) reports inconsistent wireless refresh. Treat it as a reason to test USB fallback, not a measured failure rate.
- **Conflicting current-version evidence:** a [29 September 2026 community report](https://www.reddit.com/r/sideloadly/comments/1wt5gdg/sideloadly_070_bug_wrong_infoplist_hash_in_every/) alleges a Sideloadly 0.70 signing regression, while the fetched [official changelog](https://sideloadly.io/changelog.html) identifies 0.60 as latest. This research could not reconcile that discrepancy or reproduce the alleged bug. Record the installer version actually obtained from the official site and smoke-test before telling friends to update; no unverified repacking patch is prescribed.

## Later App Store migration

If the fixed no-paid-account constraint changes later: enroll in ADP; establish one real team identity and signed release pipeline; replace weekly personal provisioning with TestFlight/store distribution; re-evaluate entitlements, SIWA/login rules, privacy disclosures, background-location review, store metadata, privacy manifests, account/data deletion and server retention. An identity change can affect keychain and existing sideloaded app data, so export/import migration must be planned. This is a future scope list, not a request to buy membership now. [Apple membership resources](https://developer.apple.com/help/account/basics/about-your-developer-account)
