const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getConfig } = require('../ExpoRideSpeed/node_modules/expo/config');
const { metadata } = require('./ci-metadata.cjs');
const project = path.resolve(__dirname, '../ExpoRideSpeed');

for (const variant of ['release', 'development']) {
  process.env.APP_VARIANT = variant;
  process.env.IOS_BUILD_NUMBER = '23.2.0';
  const { exp } = getConfig(project);
  assert.equal(exp.ios.deploymentTarget, '17.0');
  assert.equal(exp.ios.bundleIdentifier, `com.arnalxz.ridespeed${variant === 'development' ? '.dev' : ''}`);
  assert.equal(exp.ios.buildNumber, '23.2.0');
  assert.equal(exp.version, require('../ExpoRideSpeed/package.json').version);
  assert.equal(exp.plugins.some(p => (Array.isArray(p) ? p[0] : p) === 'expo-dev-client'), variant === 'development');
  for (const locale of ['en', 'th']) {
    const strings = JSON.parse(fs.readFileSync(path.join(project, exp.locales[locale]), 'utf8'));
    assert.ok(strings.ios.NSLocationWhenInUseUsageDescription.length > 20);
  }
}
const env = { GITHUB_RUN_NUMBER: '23', GITHUB_RUN_ATTEMPT: '2', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.0' };
assert.equal(metadata(env, '0.1.0').build_number, '23.2.0');
assert.equal(metadata(env, '0.1.0').variants, '["release"]');
assert.throws(() => metadata({ ...env, GITHUB_REF_NAME: 'v9.0.0' }, '0.1.0'));
assert.throws(() => metadata({ ...env, GITHUB_RUN_ATTEMPT: '100' }, '0.1.0'));
console.log('Both Expo configurations, fixed IDs, permissions and CI numbering passed.');
