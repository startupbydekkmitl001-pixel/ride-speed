# Native package inspection: 7bb3665

Read-only inspection on 1 October 2026 passed for all three downloaded packages from source `7bb36652e697c347d9ba673e8df6da0083bf64c4`. Public GitHub metadata reported successful [iOS run 36842127777](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36842127777) (#30, attempt 1) and [Android run 36842021461](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36842021461) (#17, attempt 1). No app was installed or executed during this inspection.

The downloaded ZIPs were hashed again against the public artifact digests. ZIP CRCs, contained checksum files, package metadata/source/run identity and actual native contents were checked using the existing packager validators plus bounded Mach-O, Android binary-XML, ELF and APK certificate inspection. Dependency metadata matched the initiating source. The allowlisted evidence is retained locally in `build/validation-<ZIP filename>.json`; these ignored records are not required to install an app.

| Artifact ZIP | Public artifact ID | ZIP bytes | ZIP SHA-256 |
| --- | --- | ---: | --- |
| `ios-release-0.1.0-30.1.0.zip` | 11152457688 | 25,014,956 | `12f3e675ac18a44ab0bde32e29b883acb0a932e0e9e9ebe349e4e8d9497537c7` |
| `ios-development-0.1.0-30.1.0.zip` | 11153280249 | 41,118,338 | `de8a312ab9c9b4b708b61dc906ff84ab989625005b6bc8354dc198d36ed0d370` |
| `android-preview-debug-signed-0.1.0-17.1.0.zip` | 11152162800 | 141,565,272 | `53a862125c845434a93b5c688c5a4353ae71ea2e0ea7fa28c7d941b8f9da2f18` |

| Actual ZIP-contained package | Bytes | Package SHA-256 |
| --- | ---: | --- |
| `RideSpeed-0.1.0-30.1.0-release-unsigned.ipa` | 25,222,521 | `869ebcf1e5ab700ab15acfe8d96975ae67e0cc91e58bf5943c57f08ba47c0f12` |
| `RideSpeed-0.1.0-30.1.0-development-unsigned.ipa` | 41,889,266 | `936ec28dbb151be2dbc6aa181ec59e609b1279e3a9a9cf0e0d7cd271a6046b81` |
| `RideSpeed-0.1.0-17.1.0-android-preview-debug-signed.apk` | 141,562,169 | `db828047633f6127605963312faf4b9aa10482f6a31c3627056ef4271c0a0821` |

## Native identity and delivered assets

Both iOS packages have version `0.1.0`, build `30.1.0`, a device arm64 main executable with minimum iOS 17.0, and no main code-signature load command, provisioning profile, `_CodeSignature` material or entitlements files. Release bundle ID is `com.arnalxz.ridespeed`; development is `com.arnalxz.ridespeed.dev`. Both contain the actual arm64 MapLibre framework/load command and native MapLibre/Skia binding identifiers. The MapLibre framework's own minimum OS is 12.0; the app minimum remains 17.0.

The release IPA contains Hermes bytecode and all 28 motion videos plus 28 posters whose bytes match the manifest at the initiating source. Development contains its launcher and requires Metro; it has no embedded JavaScript or motion family, as expected for that variant.

The standalone Android APK is `com.arnalxz.ridespeed`, version `0.1.0`, version code `170100`, minimum API 24, target API 36 and **nondebuggable**. Actual Hermes bytecode, MapLibre binding and MapLibre/Skia ELF libraries are present for exactly `arm64-v8a` and `x86_64`. All 28 motion videos and 28 posters match source hashes. Its APK-v2 certificate SHA-256 is `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, the public Expo template preview certificate. This Windows inspection checked the embedded certificate identity; cryptographic signature verification remains the CI `apksigner` check.

## Actual permission and privacy declarations

iOS has foreground-location, camera and photo-library purpose strings. Both `en.lproj/InfoPlist.strings` and `th.lproj/InfoPlist.strings` contain location and camera descriptions. The photo-library description is the main English fallback, “Choose a photo for your rider card or a community post”; it is absent from those localized files. No always-location purpose key or `UIBackgroundModes` entry is present.

Each IPA contains 11 `PrivacyInfo.xcprivacy` files: the app, ExpoConstants, ExpoLocalization, MapLibre, ReactNativeDependencies boost/folly/glog, AsyncStorage, React-Core, React-cxxreact and React-timing. All declare required-reason APIs, using UserDefaults `CA92.1`, FileTimestamp `C617.1` and/or SystemBootTime `35F9.1`. Ten explicitly declare tracking false; AsyncStorage omits the tracking flag. None declares tracking domains or collected-data types. These are packaged declarations, not evidence that the online app collects no data or that store privacy forms are complete.

The Android manifest declares fine/coarse location, camera, internet, network/Wi-Fi state, vibration, wake lock, biometric/fingerprint, legacy read/write external storage, system alert window and the package's non-exported receiver permission. Background location and `POST_NOTIFICATIONS` are absent. `usesCleartextTraffic` and `networkSecurityConfig` are undeclared; inspection does not infer a stronger runtime networking guarantee.

## Remaining verification

The iOS packages are unsigned previews requiring valid device signing/provisioning before installation; development also needs Metro. The Android APK is a standalone preview signed with a public template key, not a store release. This read-only inspection did not publish a release or read credentials/environment secrets. Root subsequently published the exact files as [V5 native prerelease](https://github.com/startupbydekkmitl001-pixel/ride-speed/releases/tag/preview-v5-m8-7bb3665) at17:14Bangkok. GitHub's displayed digests match all three validated package hashes and their uploaded metadata/checksum files. Android's release JSON is an exact copy of the artifact's `manifest.json`; its separate checksum file was generated locally from the independently verified APK.

Physical iPhone/Android installation, permissions and online sessions, native haptic feel, sustained frame rate, thermal/battery behavior, 30-minute memory stability and multi-device races remain unmeasured. Store signing, social-login/store requirements, privacy declarations and physical acceptance remain separate gates. Successful compilation and packaged media do not establish 60/120 Hz playback or functional device acceptance. This record covers the exact initiating source above, not later changes.
