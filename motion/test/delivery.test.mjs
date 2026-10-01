import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { assets, roles } from '../src/catalog.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.resolve(root, '../ExpoRideSpeed'), media = path.join(app, 'assets/motion/v5');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceHash = file => createHash('sha256').update(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex');
const manifest = () => JSON.parse(fs.readFileSync(path.join(media, 'manifest.json'), 'utf8'));

test('complete bundled media have their real size/hash, color, original-source and seam evidence', () => {
  const value = manifest(); assert.equal(value.schemaVersion, 2); assert.equal(value.complete, true);
  assert.equal(Object.keys(value.assets).length, 28); assert.equal(value.expectedAssetCount, 28);
  assert.deepEqual(value.provenance.externalAssets, []);
  assert.match(value.provenance.sourceHashNormalization, /CRLF normalized to LF/);
  for (const [relative, expected] of Object.entries(value.provenance.sourceSha256)) assert.equal(sourceHash(path.resolve(root, '..', relative)), expected, relative);
  let total = 0;
  for (const spec of assets) {
    const record = value.assets[spec.id]; assert.ok(record, spec.id);
    assert.equal(record.role, spec.role); assert.equal(record.theme, spec.theme);
    assert.equal(record.videoSha256, hash(path.join(media, record.video)));
    assert.equal(record.posterSha256, hash(path.join(media, record.poster)));
    assert.equal(record.videoBytes, fs.statSync(path.join(media, record.video)).size);
    assert.equal(record.posterBytes, fs.statSync(path.join(media, record.poster)).size);
    assert.ok(record.videoBytes <= 1500000);
    assert.equal(record.frames, spec.frames); assert.equal(record.fps, 60);
    assert.equal(record.codec, 'h264'); assert.equal(record.audio, false);
    assert.deepEqual(record.color, { range: 'tv', space: 'bt709', transfer: 'bt709', primaries: 'bt709' });
    assert.equal(record.seamVerification.sourceEndpointMAE0To255, 0);
    assert.equal(record.seamVerification.sourceVelocityEndpointIdentical, true);
    assert.ok(record.seamVerification.encodedSeamMAE0To255 <= record.seamVerification.acceptedMaximumMAE0To255);
    assert.equal(record.readingZoneVerification.sourceMaximumChannelError0To255, 0);
    assert.ok(record.readingZoneVerification.minimumEncodedContrast >= 4.5);
    assert.equal(hash(path.resolve(root, '..', record.validation)), record.validationSha256);
    assert.deepEqual(Object.keys(record.proofFrames).map(Number), [0, 1, spec.frames / 4, spec.frames / 2, spec.frames * 3 / 4, spec.frames - 1, spec.frames]);
    assert.equal(record.proofFrames['0'], record.proofFrames[String(spec.frames)]);
    total += record.videoBytes + record.posterBytes;
  }
  assert.equal(value.budget.familyBytes, total); assert.ok(total <= 20000000);
});

test('actual TypeScript registry resolves all role/theme combinations to distinct bundled media, alias shares original', () => {
  const require = createRequire(path.join(app, 'package.json'));
  const ts = require('typescript'), exports = {};
  const file = path.join(app, 'src/features/motion/assets.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: relative => {
    const resolved = path.resolve(path.dirname(file), relative);
    assert.ok(resolved.startsWith(media + path.sep)); assert.ok(fs.existsSync(resolved));
    return resolved;
  } });
  assert.deepEqual(Array.from(exports.motionRoles), roles.map(role => role.id));
  assert.equal(Object.keys(exports.ambientAssets).length, 29);
  for (const role of roles) for (const theme of ['dark', 'light']) {
    const id = exports.resolveAmbientAsset(role.id, theme);
    assert.equal(id, `${role.id}-${theme}`);
    assert.ok(exports.ambientAssets[id].video.endsWith(`${id}.mp4`));
    assert.ok(exports.ambientAssets[id].poster.endsWith(`${id}-poster.jpg`));
  }
  assert.equal(exports.ambientAssets['garage-scooter'], exports.ambientAssets['garage-scooter-dark']);
  assert.throws(() => exports.resolveAmbientAsset('made-up', 'dark'));
  assert.throws(() => exports.resolveAmbientAsset('garage-car', 'automatic'));
});

test('every poster has an independently recorded full-resolution handoff check for its exact media', () => {
  const value = manifest(), report = JSON.parse(fs.readFileSync(path.join(root, 'poster-validation.json'), 'utf8'));
  assert.equal(Object.keys(report.assets).length, 28);
  assert.equal(sourceHash(path.resolve(root, '..', report.generator)), report.sourceSha256);
  for (const asset of assets) {
    const row = report.assets[asset.id], record = value.assets[asset.id];
    assert.equal(row.videoSha256, record.videoSha256); assert.equal(row.posterSha256, record.posterSha256);
    assert.ok(row.posterFirstEncodedFrameMAE0To255 <= 1.5);
    assert.ok(row.readingZoneMaximumChannelDifference0To255 <= 4);
    assert.equal(row.passed, true);
  }
});
