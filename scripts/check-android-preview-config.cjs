const assert = require('node:assert/strict');
const path = require('node:path');
const { getConfig } = require('../ExpoRideSpeed/node_modules/expo/config');
const project = path.resolve(__dirname, '../ExpoRideSpeed');
const pkg = require('../ExpoRideSpeed/package.json');
const priorVariant = process.env.APP_VARIANT;
const buildNumber = process.env.IOS_BUILD_NUMBER || '1.1.0';
assert.match(buildNumber, /^[1-9]\d{0,3}\.\d{1,2}\.\d{1,2}$/);
const [run, attempt, patch] = buildNumber.split('.').map(Number);
const expectedCode = run * 10000 + attempt * 100 + patch;
const identities = {};
try {
  // The release builder deliberately omits development-native dependencies.
  // Full matrix verification runs in verify, before npm ci --omit=dev.
  for (const variant of process.argv.includes('--release-only') ? ['release'] : ['release', 'development']) {
    process.env.APP_VARIANT = variant;
    const { exp } = getConfig(project);
    const plugins = exp.plugins.map(value => Array.isArray(value) ? value[0] : value);
    assert.equal(exp.android.package, `com.arnalxz.ridespeed${variant === 'development' ? '.dev' : ''}`);
    assert.equal(exp.android.versionCode, expectedCode);
    assert.equal(exp.version, pkg.version);
    assert.equal(plugins.includes('expo-dev-client'), variant === 'development');
    assert.ok(plugins.includes('@maplibre/maplibre-react-native'));
    assert.ok(plugins.includes('expo-sqlite'));
    assert.ok(plugins.includes('expo-location'));
    assert.equal(exp.android.permissions?.includes('android.permission.ACCESS_BACKGROUND_LOCATION') ?? false, false);
    const location = exp.plugins.find(value => Array.isArray(value) && value[0] === 'expo-location');
    assert.equal(location[1].isAndroidBackgroundLocationEnabled ?? false, false);
    identities[variant] = { package: exp.android.package, version: exp.version, version_code: exp.android.versionCode };
  }
} finally {
  if (priorVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = priorVariant;
}
assert.match(pkg.dependencies.expo, /57\./);
assert.equal(pkg.dependencies['react-native'], '0.86.3');
assert.equal(pkg.dependencies['@maplibre/maplibre-react-native'], '11.4.0');
assert.equal(require('../ExpoRideSpeed/node_modules/@maplibre/maplibre-react-native/package.json').version, '11.4.0');
assert.equal(require('../ExpoRideSpeed/node_modules/maplibre-gl/package.json').version, '6.11.2');
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify({ build_number: buildNumber, ...identities }, null, 2) + '\n');
else console.log('Android IDs, CI version codes, MapLibre/SQLite plugins and foreground-only permissions passed.');
