const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

// Temporary package fixtures exercise file/path checks; they do not compile Skia.
test('locked native library installer is inspected before any vendor mutation', () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'prepare-native-libraries.cjs')), 'native preparation helper is required');
  const native = require('./prepare-native-libraries.cjs');
  const app = path.join(__dirname, '../ExpoRideSpeed');
  const inspected = native.inspectPackages(app);
  assert.equal(inspected.skiaVersion, '2.6.2');
  assert.equal(inspected.binaryVersion, '147.1.0');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(inspected.installer)).digest('hex'), native.INSTALLER_SHA256);
});

test('native validation rejects an absent ABI archive and accepts every target library', (t) => {
  assert.ok(fs.existsSync(path.join(__dirname, 'prepare-native-libraries.cjs')), 'native preparation helper is required');
  const native = require('./prepare-native-libraries.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ride-native-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const libraries = path.join(directory, 'libs');
  for (const abi of native.ANDROID_ABIS) {
    const target = path.join(libraries, 'android', abi);
    fs.mkdirSync(target, { recursive: true });
    for (const name of native.ANDROID_ARCHIVES) fs.writeFileSync(path.join(target, name), '!<arch>\nfixture');
  }
  assert.equal(native.verifyPrepared(directory, 'android').android_abis.length, 2);
  fs.unlinkSync(path.join(libraries, 'android', 'x86_64', 'libskia.a'));
  assert.throws(() => native.verifyPrepared(directory, 'android'), /libskia.a/);
});

test('library checks reject corrupt archives and an escaping package destination', (t) => {
  assert.ok(fs.existsSync(path.join(__dirname, 'prepare-native-libraries.cjs')), 'native preparation helper is required');
  const native = require('./prepare-native-libraries.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ride-native-path-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.throws(() => native.assertWithin(directory, path.join(directory, '..', 'outside')), /outside/);
  const target = path.join(directory, 'libs', 'android', 'arm64-v8a');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'libskia.a'), 'corrupt');
  assert.throws(() => native.verifyPrepared(directory, 'android'), /static archive/);
});

test('Apple verification requires every framework on both platforms', (t) => {
  assert.ok(fs.existsSync(path.join(__dirname, 'prepare-native-libraries.cjs')), 'native preparation helper is required');
  const native = require('./prepare-native-libraries.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ride-native-apple-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const platform of ['ios', 'macos']) {
    for (const name of native.APPLE_FRAMEWORKS) {
      const target = path.join(directory, 'libs', platform, name);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, 'Info.plist'), '<?xml version="1.0"?><plist><dict><key>AvailableLibraries</key></dict></plist>');
      fs.writeFileSync(path.join(target, 'fixture.a'), '!<arch>\nfixture');
    }
  }
  assert.deepEqual(native.verifyPrepared(directory, 'ios').apple_platforms, ['ios', 'macos']);
  fs.unlinkSync(path.join(directory, 'libs', 'macos', 'libskia.xcframework', 'Info.plist'));
  assert.throws(() => native.verifyPrepared(directory, 'ios'), /Info.plist/);
});

test('Apple universal archives require bounded non-overlapping slices containing ar archives', (t) => {
  const native = require('./prepare-native-libraries.cjs');
  assert.equal(typeof native.verifyArchive, 'function', 'archive verifier must support real Apple universal archives');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ride-native-fat-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'universal.a');
  const valid = Buffer.alloc(96);
  valid.writeUInt32BE(0xcafebabe, 0);
  valid.writeUInt32BE(2, 4);
  for (let index = 0; index < 2; index++) {
    const table = 8 + index * 20;
    valid.writeUInt32BE(0x0100000c, table);
    valid.writeUInt32BE(index, table + 4);
    valid.writeUInt32BE(64 + index * 16, table + 8);
    valid.writeUInt32BE(16, table + 12);
    valid.writeUInt32BE(4, table + 16);
    valid.write('!<arch>\nfixture', 64 + index * 16);
  }
  fs.writeFileSync(file, valid);
  assert.doesNotThrow(() => native.verifyArchive(file));
  const overlapping = Buffer.from(valid); overlapping.writeUInt32BE(64, 36);
  const badSlice = Buffer.from(valid); badSlice.write('not an ar', 80);
  const tooMany = Buffer.from(valid); tooMany.writeUInt32BE(100, 4);
  for (const invalid of [valid.subarray(0, 95), overlapping, badSlice, tooMany, valid.subarray(0, 20)]) {
    fs.writeFileSync(file, invalid);
    assert.throws(() => native.verifyArchive(file), /archive/);
  }
});
