# Build and install from Windows

This is the first Phase 2 build preparation. The workflow builds the existing **foreground speedometer prototype**. New Thai screens, the Swift recorder, background recording, export/replay and accuracy improvements have not been implemented yet. An unsigned IPA is not an installation result; the first cloud build and iPhone smoke test must be recorded separately.

## Build variants

| Variant | Fixed bundle ID | Native configuration | Use |
|---|---|---|---|
| Release | `com.arnalxz.ridespeed` | Release; development dependencies omitted | Friends; embedded JavaScript; PC/Metro not needed after installation |
| Development | `com.arnalxz.ridespeed.dev` | Debug with `expo-dev-client` | Windows Metro and Fast Refresh |

Both target a real arm64 iPhone running **iOS 17+**. Initial device: **iPhone 14 Plus, iOS 26**. Both installations use separate storage and consume separate free-signing app slots. Neither build needs an Apple password, signing certificate or provisioning profile in GitHub.

The app currently asks for foreground location only. Thai and English system permission strings are generated from `ExpoRideSpeed/locales/`. Development also explains access to the local Windows Metro server. The product UI is still the original prototype; system permission localization does not mean the redesigned Thai UI exists.

## Run the cloud build

1. Open the public [Ride Speed repository](https://github.com/startupbydekkmitl001-pixel/ride-speed), which already contains this workflow. For later changes, push reviewed commits before building.
2. Open **Actions → Unsigned iPhone IPA → Run workflow**, choose the intended branch and run it. This produces both variants. Pull requests run the JavaScript/configuration/package-fixture checks only; they do not build or publish IPAs.
3. The Linux job runs tests, lint, typecheck, resolved Expo configuration checks and IPA layout fixture tests. Mac jobs use the standard `macos-26` runner, Node `22.23.2`, and **Xcode 26.4.1**. No larger/paid runner is selected. If GitHub removes that Xcode version, the job fails clearly; recheck the inventory before deliberately updating it.
4. Each Mac job installs locked dependencies. Release uses `npm ci --omit=dev`, and refuses to continue if the dev-client, launcher or menu is installed or linked. Development uses the full lockfile. Expo generates `ios/` with clean prebuild; CocoaPods installs native dependencies; `xcodebuild archive` targets `generic/platform=iOS` with signing disabled.
5. Download the `ios-release-…` or `ios-development-…` artifact from the successful run. GitHub wraps it in an outer ZIP: extract that ZIP and select the enclosed `.ipa`, not the ZIP, in Sideloadly. Artifacts are retained for seven days; downloading Actions artifacts requires GitHub sign-in.

Build validation checks the generated deployment target and localized strings, native dependency separation, the archive's stable ID/version/build number, iPhoneOS platform, arm64 Mach-O platform/minimum OS, absence of a main-app signature and provisioning profile, ZIP integrity, exactly one `Payload/*.app`, and the embedded Release JavaScript bundle. Fixture tests intentionally use fake binaries to exercise rejection cases; only the Mac job performs native binary checks.

Public download artifacts contain only the IPA, SHA-256 file and sanitized build metadata. Matching dSYMs and build logs go to a separate three-day diagnostic artifact. They contain build diagnostics, not device sensor data. Do not add private ride logs, Apple credentials or signing files to this public repository.

## Sign and test on the iPhone

Follow [the Thai Sideloadly guide](INSTALL_TH.md). Use each tester's own Apple ID. For an existing installation, retain the same Apple ID and effective Sideloadly bundle identifier and install over the app. Do not delete the app to update it.

After the first successful build, check these items while stopped:

- **Release:** install, grant precise location, open a session outdoors, stop it, close/reopen the app with the PC and Metro off. Denial/revocation should remain understandable. This only checks the existing foreground prototype.
- **Development:** install, allow local network access, connect to Metro, then change a visible text string and confirm Fast Refresh. Restore that temporary edit afterwards.
- Record the downloaded IPA hash, workflow run/build number, exact iOS version, Sideloadly version and result in [the test plan](TEST_PLAN.md). Run a second independent friend's installation before distributing more broadly.

Locked-screen recording, native journals, diagnostics export, preservation of recorded rides across upgrades and measured accuracy cannot pass yet because those features are not in this build preparation. Weekly signing refresh still needs a real elapsed-time test.

## Windows development loop

Install Node 22.13 or newer (CI pins `22.23.2`) and Git. In PowerShell:

```powershell
cd C:\Users\Arnalxz\OneDrive\Documents\ChatGPT\GPS\ExpoRideSpeed
npm ci
npm test
npm run typecheck
npm run lint
npm run check:build
npm run start:dev
```

`start:dev` selects the development app identity and starts `expo start --dev-client --lan`. Connect PC and phone to the same reachable private network, allow Node through Windows Firewall on that network and allow the phone's Local Network prompt. Scan Metro's QR code or use the dev launcher's URL entry. Use the PC's LAN address, not `localhost` on the phone.

TypeScript changes use Fast Refresh. Native packages, Swift files, app configuration, permission strings or SDK changes require a new cloud IPA. Metro reload does not extend the app's seven-day provisioning. Release never imports `expo-dev-client`; its package is a dev dependency omitted from the native build. Keep development-only imports out of shared application code.

## Versioned downloads for friends

The human version comes from `ExpoRideSpeed/package.json` (initially `0.1.0`). Keep `app.json` and the lockfile package version synchronized. CI uses `GITHUB_RUN_NUMBER.GITHUB_RUN_ATTEMPT.0` as `CFBundleVersion`, for example `23.2.0`. New workflow runs increase the first component; reruns increase the second. Do not distribute an old run after a newer one. Numbers beyond run 9999 or attempt 99 fail instead of silently exceeding Apple's format. A CI file rename starts a new workflow counter, so retain this workflow name/file or deliberately migrate the numbering first.

To publish a new preview:

1. Bump package/app versions and update the lockfile. Add a `## X.Y.Z` section with short Thai notes in `CHANGELOG_TH.md`, including known limitations and actual device test status.
2. Commit/push the reviewed changes, then create and push the matching `vX.Y.Z` tag. The workflow rejects a tag whose version differs from the package.
3. A version tag builds **Release only** and creates a GitHub **prerelease**, explicitly labeled unsigned/signing required, with IPA, checksum, metadata and Thai install guide. Only the publish job has `contents: write`; ordinary jobs stay read-only.

Publication never replaces assets on an existing release. If a published build needs fixing, increment the version and publish a new tag rather than rerunning an old release to change its content. Build filenames also include both version and build number.

Verify a downloaded file on Windows:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\RideSpeed-0.1.0-23.1.0-release-unsigned.ipa'
Get-Content -LiteralPath '.\RideSpeed-0.1.0-23.1.0-release-unsigned.sha256'
```

Compare the hashes; the example build number will differ from the actual run. GitHub's automatically generated Source code ZIP is not an iPhone app.

## Sources and remaining proof

- [Expo SDK 57 compatibility](https://docs.expo.dev/versions/v57.0.0/), [SDK 57 app configuration](https://docs.expo.dev/versions/v57.0.0/config/app/), [SDK 57 development client](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/).
- [Expo native project generation](https://docs.expo.dev/workflow/continuous-native-generation/), [development builds](https://docs.expo.dev/guides/local-app-development/).
- [GitHub macOS 26 ARM64 software inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md), [Actions billing for public standard runners](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- [Apple build-number format](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleversion), [phase-one build and signing research](research/build-and-sideloading.md).

Both native variants compiled and produced validated unsigned IPAs in [run #2](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36725855154), from commit 48ce49a, version 0.1.0, build 2.1.0. Downloaded IPA hashes matched their metadata. Sideloadly installation, offline device launch, Metro connection, refresh and data preservation remain real-device checks.
