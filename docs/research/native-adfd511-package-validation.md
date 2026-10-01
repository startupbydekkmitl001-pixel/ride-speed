# Native preview package validation — adfd511

Checked on2026-10-01. The public GitHub run metadata reports success for the full source commit `adfd511333793e79220a2e6fd77f81a18c06985e` on Android [run36819957710](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36819957710) and iOS [run36820939608](https://github.com/startupbydekkmitl001-pixel/ride-speed/actions/runs/36820939608), both attempt1. Downloaded archives were read directly without installing, executing or publishing their apps.

These builds predate M6 Ranked/publication/report source. Build success and package inspection do not establish physical installation, GPS behavior, frame rate, memory, battery, accessibility or two-device timing.

## Archive and contained-app hashes

All three archive SHA256 values match the corresponding public GitHub artifact metadata digest. Each contained app hash and byte count also matches its bundled manifest/checksum file.

| Artifact | GitHub artifact ID | Archive bytes | Archive SHA256 | Contained app SHA256 |
|---|---:|---:|---|---|
| android-preview-debug-signed-0.1.0-14.1.0.zip |11143542968|137458416|`27aeae1406dab4cf9708fdc64260177852b695071793c04c895efee7f33c47be`|`ded92a2c73a30fede9d8ddf8448c3e5694a497bf1d4ed06fde32b8cefcdb282d`|
| ios-release-0.1.0-26.1.0.zip |11143093365|23002438|`9eb8747705f4088bae74b39ec5fa8e2af2da23127dca4a9eac87cc7ff4afa9c7`|`4ed21d411ef0c97d108d354d6bd4c2dd7f3d84ee986a88fa5b577c39fb4ee261`|
| ios-development-0.1.0-26.1.0.zip |11143918245|37396520|`5215f5ae8a065fa92b0964ff9a3079505429eb8370c3a396c0046bc1bde2de84`|`d2cb7c3b9f38ace3fdd2f59792d6c1483518e076b6b9cfb99ad80974f7af28de`|

The source commit, initiating run and attempt are present in each app manifest and exactly match the public API metadata.

## Android inspection

The contained137455313-byte APK is `RideSpeed-0.1.0-14.1.0-android-preview-debug-signed.apk`. Independent parsing of its actual binary AndroidManifest.xml confirms package `com.arnalxz.ridespeed`, version0.1.0, versionCode140100, minimum API24, target API36 and debuggablefalse. Its nonempty standalone JavaScript bundle, MapLibre React Native DEX binding and ELF `libmaplibre.so`/`librnskia.so` are present for exactly arm64-v8a and x86_64. Duplicate/unsafe ZIP paths were absent.

The actual APK v2 public certificate SHA256 is `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, matching the manifest's public Expo template debug signer. This is a preview signature, not a store-release identity. The CI packager performed apksigner validation; this independent Windows inspection checked the certificate/digests and package structure, and did not rerun a cryptographic APK signature verifier.

Build metadata reports Node22.23.2, Expo57.0.26, React Native0.86.3, MapLibre RN11.4.0, Skia2.6.2 with checked prebuilt147.1.0, JDK17, Gradle9.3.1 and Android SDK36. Actual native ELF payloads supplement the metadata; JavaScript export success alone would not prove those libraries present.

## iOS inspection

Both actual Info.plists confirm version0.1.0, build26.1.0, minimum iOS17.0 and iPhoneOS platform. Release uses `com.arnalxz.ridespeed`; development uses `com.arnalxz.ridespeed.dev`. Both actual Mach-O executables are arm64, have no LC_CODE_SIGNATURE, and their packages have no embedded.mobileprovision or `_CodeSignature` entries, consistent with intentionally unsigned device previews.

Release contains a nonempty main.jsbundle and MapLibre.framework. Development contains the development launcher and no main.jsbundle, consistent with its Metro development-client workflow. Both manifests report Xcode26.4.1/17E202, Node22.23.2, CocoaPods1.17.0 and the initiating exact source/run. Each manifest explicitly marks deviceInstallationTestedfalse.

The archives remain in the user's Downloads directory. No release was created or installed as part of this check.
