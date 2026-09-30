const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

test('the preview marker compiles only the reviewed branch at its initiating commit', () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'native-preview-gate.cjs')), 'native preview gate is required');
  const { decide } = require('./native-preview-gate.cjs');
  const sha = 'a'.repeat(40);
  const event = { head_commit: { id: sha, message: 'M2: map and ride journal [native-preview]' } };
  assert.deepEqual(decide('push', 'refs/heads/codex/map-first-v5', sha, event), { build_preview: true, source_sha: sha });
  assert.equal(decide('push', 'refs/heads/codex/map-first-v5', sha, { head_commit: { id: sha, message: 'routine fix' } }).build_preview, false);
  assert.equal(decide('push', 'refs/heads/main', sha, event).build_preview, false);
  assert.equal(decide('push', 'refs/heads/codex/other', sha, event).build_preview, false);
  assert.equal(decide('pull_request', 'refs/pull/1/merge', sha, event).build_preview, false);
  assert.equal(decide('push', 'refs/heads/codex/map-first-v5', sha, { head_commit: { ...event.head_commit, id: 'b'.repeat(40) } }).build_preview, false);
  assert.throws(() => decide('workflow_dispatch', 'refs/heads/main', 'invalid', {}), /SHA/);
});

test('manual and version-tag builds retain explicit native preview entry points', () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'native-preview-gate.cjs')), 'native preview gate is required');
  const { decide } = require('./native-preview-gate.cjs');
  const sha = 'b'.repeat(40);
  assert.equal(decide('workflow_dispatch', 'refs/heads/codex/map-first-v5', sha, {}).build_preview, true);
  assert.equal(decide('push', 'refs/tags/v0.1.0', sha, {}).build_preview, true);
  assert.equal(decide('push', 'refs/tags/unrelated', sha, {}).build_preview, false);
});

test('workflow consumes the gate and source SHA with read-only permissions', () => {
  const yaml = require('../ExpoRideSpeed/node_modules/js-yaml');
  const workflow = yaml.load(fs.readFileSync(path.join(__dirname, '../.github/workflows/android-preview.yml'), 'utf8'));
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.build.if, "needs.verify.outputs.build_preview == 'true'");
  assert.equal(workflow.jobs.verify.outputs.build_preview, '${{ steps.preview.outputs.build_preview }}');
  assert.equal(workflow.jobs.build.env.NATIVE_PREVIEW_SOURCE_SHA, '${{ needs.verify.outputs.source_sha }}');
  assert.equal(workflow.jobs.verify.steps.find((step) => step.id === 'preview').run, 'node scripts/native-preview-gate.cjs');
  assert.equal(workflow.jobs.build['runs-on'], 'ubuntu-24.04');
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps.filter((value) => value.uses)) assert.match(step.uses, /@[a-f0-9]{40}$/);
    assert.equal(job.steps[0].with['persist-credentials'], false);
  }
});

test('the standalone checker never resolves an omitted development plugin, while normal verification checks both variants', () => {
  const source = fs.readFileSync(path.join(__dirname, 'check-android-preview-config.cjs'), 'utf8');
  const pkg = require('../ExpoRideSpeed/package.json');
  function execute(releaseOnly, missingDevClient) {
    const calls = [], processFixture = { env: { APP_VARIANT: 'release', IOS_BUILD_NUMBER: '23.2.0' }, argv: ['node', 'check', ...(releaseOnly ? ['--release-only'] : [])], stdout: { write() {} } };
    const getConfig = () => {
      const variant = processFixture.env.APP_VARIANT; calls.push(variant);
      if (variant === 'development' && missingDevClient) throw Error('PluginError: Failed to resolve plugin expo-dev-client');
      return { exp: { version: pkg.version, android: { package: `com.arnalxz.ridespeed${variant === 'development' ? '.dev' : ''}`, versionCode: 230200 },
        plugins: ['@maplibre/maplibre-react-native', 'expo-sqlite', ['expo-location', { isAndroidBackgroundLocationEnabled: false }], ...(variant === 'development' ? ['expo-dev-client'] : [])] } };
    };
    vm.runInNewContext(source, { __dirname, process: processFixture, console: { log() {} }, require: name => {
      if (name === '../ExpoRideSpeed/node_modules/expo/config') return { getConfig };
      if (name === '../ExpoRideSpeed/package.json') return pkg;
      return require(name);
    } });
    assert.equal(processFixture.env.APP_VARIANT, 'release');
    return calls;
  }
  assert.deepEqual(execute(true, true), ['release']);
  assert.deepEqual(execute(false, false), ['release', 'development']);
  assert.throws(() => execute(false, true), /expo-dev-client/);
});
