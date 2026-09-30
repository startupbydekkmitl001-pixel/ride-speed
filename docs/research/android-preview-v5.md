# Android standalone preview — M2

Reviewed 2026-10-01. Native compilation has **not** run on this Windows machine.
The workflow is a validation gate, not evidence of a successful native build.

## Reproducible public-runner build

`.github/workflows/android-preview.yml` verifies ordinary pushes and pull requests.
It compiles on manual dispatch, an exact matching `v<package version>` tag, or a
push to `codex/map-first-v5` whose exact head commit contains `[native-preview]`.
The marker allows the first build before this new workflow reaches the default
branch. Its event commit ID must equal `GITHUB_SHA`; that SHA is passed to the
build and recorded in the manifest. No PR builds, deployment, store submission,
new signing secret, Google Maps billing, or EAS account is needed.

The build uses a standard public-repository `ubuntu-24.04` runner, SHA-pinned
actions, Node 22.23.2, Temurin JDK 17, `npm ci --omit=dev`, and Expo Prebuild.
Release configuration embeds JavaScript and excludes the dev launcher/Metro.
Public standard runners are covered by [GitHub's runner policy](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## Toolchain evidence and exceptions

| Input | Selected and checked |
| --- | --- |
| Expo / React Native | Installed Expo 57.0.26 / RN 0.86.3; minimum Android API 24, compile/target API 36. [SDK 57 table](https://docs.expo.dev/versions/v57.0.0/) |
| Java | JDK 17 as recommended by [RN 0.86 setup](https://reactnative.dev/docs/0.86/set-up-your-environment); actual patch version is saved in build provenance. |
| Gradle / AGP | Preserve the installed Expo template wrapper (9.3.1) and RN-selected AGP (8.12.0). Compare the generated wrapper byte-for-byte with `expo/template.tgz`. Record the actual Gradle version. [AGP 8.12 requirements](https://developer.android.com/build/releases/agp-8-12-0-release-notes) specify minimum Gradle 8.13 / Java 17; only the native build proves the whole selected combination. |
| Android native tools | Explicit API 36 / build-tools 36.0.0 / NDK 27.1.12297006 / CMake 3.30.5. NDK matches the installed RN/MapLibre defaults; CMake matches installed RN's ReactAndroid CMake requirement. |
| MapLibre | Locked RN binding 11.4.0, Native SDK 13.6.1. Config plugin plus native prebuild required; [Expo Go cannot supply it](https://maplibre.org/maplibre-react-native/docs/setup/expo/). [Tagged Android defaults](https://github.com/maplibre/maplibre-react-native/blob/v11.4.0/package/android/gradle.properties). |
| Preview ABIs | `arm64-v8a` for current physical devices and `x86_64` for emulators. This preview does not claim 32-bit Android support. |

The generic RN setup page still names API 35; the versioned Expo 57 table and
installed template determine API 36 here. Hosted runner SDK inventory changes;
the build installs exact required package versions instead of relying on the
[Ubuntu inventory's defaults](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md).
The runner still ships `sdkmanager`. Android's [current documentation](https://developer.android.com/tools/sdkmanager)
marks it deprecated in favor of the new Android CLI; this workflow intentionally
uses the existing runner tool for explicit package installation. It does not
auto-accept new license agreements; absent acceptance fails the build.

## Skia installation policy

The locked `@shopify/react-native-skia` 2.6.2 package requires its local
`scripts/install-libs.js`, although the [newer public installation guide](https://shopify.github.io/react-native-skia/docs/getting-started/installation/)
describes releases that need no postinstall. It copies the four normal npm
dependencies at 147.1.0 into the package's `libs` directory; it downloads nothing.
`prepare-native-libraries.cjs` checks package versions, exact reviewed installer
SHA-256 and real destination containment before invoking this one script in the
disposable Linux/macOS CI checkout. It checks every target Android ar archive;
iOS mode checks each iOS/macOS XCFramework and its plain or bounded universal
archive slices. This bypasses a skipped lifecycle copy without approving unrelated
install scripts or rewriting the dependency lockfile.

Use `node scripts/prepare-native-libraries.cjs android` after CI's npm install.
The iOS equivalent is `node scripts/prepare-native-libraries.cjs ios` before pods.
`--check` is read-only for local diagnostics. Tests checked all 16 actual npm iOS
and 8 actual npm macOS archives read-only; this does not prove native linking.
`unrs-resolver` uses `napi-postinstall` only to find/install an optional platform
binding when missing. It is a development lint dependency; normal `npm ci` and
the actual lint command are its validation gate. No broad script approval is used.

## Artifact and acceptance

The generated SDK 57 debug keystore must match the reviewed template bytes and
SHA-256; the generated Release build must use exactly that debug configuration.
This is a **public-debug-signed standalone preview**, never a Play/store release.
Android documents the [debug key's testing-only role](https://developer.android.com/build/building-cmdline).
After Gradle succeeds, [apksigner](https://developer.android.com/tools/apksigner)
verifies the final signature, and aapt2 verifies package/version, min/target SDK,
foreground-only location permissions, non-debuggable status and exactly two ABIs.
ZIP validation requires embedded JavaScript, the MapLibre React Native DEX binding,
and ELF MapLibre/Skia libraries for both ABIs. Signing material is never uploaded.

The artifact contains an APK, `manifest.json`, `SHA256SUMS.txt`, and `PREVIEW.txt`.
The manifest records initiating commit/build number, actual Java/Gradle and native
package versions, certificate fingerprint, artifact hash, and pending physical
device/performance acceptance. Diagnostics are a whitelist of logs/JSON only.
APK artifacts expire after 7 days; diagnostics after 3 days. A future store
certificate differs, so switching may require uninstalling the preview and loses
its local data. Install with `adb install -r <APK>` or open the APK on a test device.

Before M2 device acceptance, install the successful artifact on a mid-range ARM64
Android phone and verify real black/light Thai/English map rendering, attribution,
location granted/denied/lost, pan/zoom with 50 authorized markers, foreground ride
recording, process restart recovery, offline/reconnect, and account A → B → A
isolation. Measure startup, frame pacing, battery and a 30-minute ride memory trace.
Native compilation passing alone does not satisfy those checks.

Local checks: `node --test scripts/test_native_libraries.cjs scripts/test_native_preview_gate.cjs`,
`python -m unittest discover -s scripts -p 'test_*.py'`,
`node scripts/check-android-preview-config.cjs`, and `bash -n scripts/build-android-preview.sh`.
Fixture APKs/archives test rejection and packaging behavior; none are shipped.
