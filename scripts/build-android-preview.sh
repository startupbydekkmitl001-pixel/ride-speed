#!/usr/bin/env bash
# Disposable GitHub Linux checkout only. This is a public-debug-signed preview, not a store release.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/ExpoRideSpeed"
OUT="$ROOT/build/android-preview"
[[ "$(uname -s)" == Linux && "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Android preview compilation runs on the GitHub Linux runner.' >&2; exit 1; }
[[ "${APP_VARIANT:-}" == release ]] || { echo 'The standalone preview requires APP_VARIANT=release.' >&2; exit 1; }
[[ "${IOS_BUILD_NUMBER:-}" =~ ^[1-9][0-9]{0,3}\.[0-9]{1,2}\.[0-9]{1,2}$ ]] || { echo 'Expected the validated CI build identity.' >&2; exit 1; }
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected the initiating commit SHA.' >&2; exit 1; }
[[ "${NATIVE_PREVIEW_SOURCE_SHA:-}" == "$GITHUB_SHA" ]] || { echo 'The native preview request belongs to a different source commit.' >&2; exit 1; }
[[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME" ]] || { echo 'The runner Android SDK is unavailable.' >&2; exit 1; }
java -version 2>&1 | grep -Eq 'version "17\.' || { echo 'Select JDK 17 before building.' >&2; exit 1; }
mkdir -p "$OUT"
cd "$APP"
npm ci --omit=dev
node "$ROOT/scripts/prepare-native-libraries.cjs" android > "$OUT/native-library-preparation.json"
for name in expo-dev-client expo-dev-launcher expo-dev-menu; do
  [[ ! -d "node_modules/$name" ]] || { echo "Standalone preview contains $name" >&2; exit 1; }
done
# npm ci postinstall copies the pinned worker, its shared module and BSD notice.
node "$ROOT/scripts/check-android-preview-config.cjs" --release-only --json > "$OUT/app-identity.json"
VERSION="$(node -p "require('./package.json').version")"
VERSION_CODE="$(node -p "require(process.argv[1]).release.version_code" "$OUT/app-identity.json")"
PACKAGE="$(node -p "require(process.argv[1]).release.package" "$OUT/app-identity.json")"
SDK_MANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
[[ -x "$SDK_MANAGER" ]] || { echo 'The runner SDK package manager is unavailable.' >&2; exit 1; }
# The hosted SDK has accepted licenses. Install only these explicit stable packages;
# never auto-accept new agreements or install preview SDKs.
"$SDK_MANAGER" --install 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.1.12297006' 'cmake;3.30.5' </dev/null | tee "$OUT/sdk-install.log"
TOOLS="$ANDROID_HOME/build-tools/36.0.0"
[[ -x "$TOOLS/aapt2" && -x "$TOOLS/apksigner" ]] || exit 1
CI=1 npx --no-install expo prebuild --platform android --clean --no-install | tee "$OUT/prebuild.log"
python3 "$ROOT/scripts/package-android-preview.py" verify-prebuild \
  --project android --template node_modules/expo/template.tgz \
  --package "$PACKAGE" --version "$VERSION" --version-code "$VERSION_CODE" > "$OUT/generated-project.json"
# Export only the PUBLIC certificate for comparison; no private signing material is uploaded.
keytool -exportcert -keystore android/app/debug.keystore -alias androiddebugkey -storepass android \
  -file "$OUT/preview-certificate.der" >/dev/null
cd android
bash ./gradlew --no-daemon --console=plain --stacktrace --max-workers=2 --version > "$OUT/gradle-version.log"
# Use the generated SDK 57 wrapper/toolchain and Expo's native Release JS embedding.
# Limit ABI compilation to the documented physical ARM64/emulator X64 preview.
bash ./gradlew --no-daemon --console=plain --stacktrace --max-workers=2 :app:assembleRelease \
  '-PreactNativeArchitectures=arm64-v8a,x86_64' '-Pandroid.cmakeVersion=3.30.5' \
  '-Porg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g' | tee "$OUT/gradle-build.log"
APK="$APP/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || { echo 'Expected one standalone Release-configuration APK.' >&2; exit 1; }
"$TOOLS/apksigner" verify --verbose --print-certs "$APK" > "$OUT/apk-signature.log"
"$TOOLS/aapt2" dump badging "$APK" > "$OUT/apk-badging.log"
cd "$APP"
node - "$OUT/build-info.json" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const pkg = require('./package.json');
const output = path.dirname(process.argv[2]);
const java = fs.readFileSync(path.join(process.env.JAVA_HOME, 'release'), 'utf8').match(/^JAVA_VERSION="([^"]+)"/m)?.[1];
const gradle = fs.readFileSync(path.join(output, 'gradle-version.log'), 'utf8').match(/^Gradle ([0-9.]+)/m)?.[1];
if (!java?.startsWith('17.') || !gradle) throw new Error('Actual JDK/Gradle provenance is unavailable');
const facts = {
  commit: process.env.GITHUB_SHA, run_id: process.env.GITHUB_RUN_ID, run_attempt: process.env.GITHUB_RUN_ATTEMPT,
  app_variant: process.env.APP_VARIANT, runner: process.env.RUNNER_OS, node: process.version, npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  expo: require('expo/package.json').version, react_native: pkg.dependencies['react-native'],
  maplibre_react_native: require('@maplibre/maplibre-react-native/package.json').version,
  native_graphics: JSON.parse(fs.readFileSync(path.join(output, 'native-library-preparation.json'), 'utf8')),
  sdk_platform: 36, build_tools: '36.0.0', ndk: '27.1.12297006', cmake: '3.30.5', jdk_major: 17,
  jdk: java, gradle, gradle_distribution: JSON.parse(fs.readFileSync(path.join(output, 'generated-project.json'), 'utf8')).gradle_distribution,
};
fs.writeFileSync(process.argv[2], JSON.stringify(facts, null, 2) + '\n');
NODE
python3 "$ROOT/scripts/package-android-preview.py" package \
  --apk "$APK" --output "$OUT/artifacts" --badging "$OUT/apk-badging.log" --signature "$OUT/apk-signature.log" \
  --certificate "$OUT/preview-certificate.der" --build-info "$OUT/build-info.json" \
  --package "$PACKAGE" --version "$VERSION" --version-code "$VERSION_CODE" --build-number "$IOS_BUILD_NUMBER" > "$OUT/validation.json"
echo 'Validated Android standalone preview (public debug certificate; not a store release).'
