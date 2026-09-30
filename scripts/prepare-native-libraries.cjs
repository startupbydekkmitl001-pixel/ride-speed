#!/usr/bin/env node
'use strict';
// SDK 57's locked Skia 2.6.2 still copies its npm-packaged native libraries in
// postinstall. Invoke only this reviewed script when npm's script policy skips it.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

const INSTALLER_SHA256 = '52e2c685ccc41892015ef95f01fc212dd602666df566d4b811cda4288a0b2f15';
const ANDROID_ABIS = ['arm64-v8a', 'x86_64'];
const ANDROID_ARCHIVES = ['libskia.a', 'libsvg.a', 'libskshaper.a', 'libskparagraph.a', 'libskunicode_core.a', 'libskunicode_icu.a', 'libskottie.a', 'libsksg.a', 'libjsonreader.a'];
const APPLE_FRAMEWORKS = ['libskia', 'libsvg', 'libskshaper', 'libskparagraph', 'libskunicode_core', 'libskunicode_libgrapheme', 'libskottie', 'libsksg'].map((name) => `${name}.xcframework`);

function assertWithin(root, target) {
  const absoluteRoot = fs.realpathSync(root);
  const absoluteTarget = path.resolve(target);
  const relative = path.relative(absoluteRoot, absoluteTarget);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error(`Native library target is outside its package: ${target}`);
  // Verify existing ancestors as well, so a symlink cannot redirect the vendor
  // installer's recursive removal/copy outside this exact installed package.
  let existing = absoluteTarget;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const resolved = fs.realpathSync(existing);
  const resolvedRelative = path.relative(absoluteRoot, resolved);
  if (resolvedRelative === '..' || resolvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelative)) throw new Error(`Native library target resolves outside its package: ${target}`);
  return absoluteTarget;
}

function verifyArchive(file) {
  const descriptor = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(descriptor).size;
    const header = Buffer.alloc(8);
    const fail = () => { throw new Error(`Missing/corrupt native static archive: ${file}`); };
    if (fs.readSync(descriptor, header, 0, 8, 0) !== 8 || size <= 8) fail();
    if (header.toString() === '!<arch>\n') return;
    // Apple publishes Mach-O universal containers, each slice holding an ar
    // archive. Validate the table and actual slice headers, not just FAT_MAGIC.
    const magic = header.readUInt32BE(0);
    if (magic !== 0xcafebabe && magic !== 0xcafebabf) fail();
    const count = header.readUInt32BE(4);
    const recordBytes = magic === 0xcafebabe ? 20 : 32;
    if (count < 1 || count > 16 || 8 + count * recordBytes >= size) fail();
    const table = Buffer.alloc(count * recordBytes);
    if (fs.readSync(descriptor, table, 0, table.length, 8) !== table.length) fail();
    const slices = [];
    for (let index = 0; index < count; index++) {
      const record = index * recordBytes;
      const offset = magic === 0xcafebabe ? table.readUInt32BE(record + 8) : Number(table.readBigUInt64BE(record + 8));
      const bytes = magic === 0xcafebabe ? table.readUInt32BE(record + 12) : Number(table.readBigUInt64BE(record + 16));
      const alignment = table.readUInt32BE(record + (magic === 0xcafebabe ? 16 : 24));
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(bytes) || alignment > 31 || offset % (2 ** alignment)
        || offset < 8 + table.length || bytes <= 8 || bytes > size - offset) fail();
      if (fs.readSync(descriptor, header, 0, 8, offset) !== 8 || header.toString() !== '!<arch>\n') fail();
      slices.push({ offset, end: offset + bytes });
    }
    slices.sort((a, b) => a.offset - b.offset);
    if (slices.some((slice, index) => index > 0 && slice.offset < slices[index - 1].end)) fail();
  } finally { fs.closeSync(descriptor); }
}

function verifyPrepared(packageRoot, platform) {
  if (platform === 'android') {
    for (const abi of ANDROID_ABIS) for (const name of ANDROID_ARCHIVES) verifyArchive(assertWithin(packageRoot, path.join(packageRoot, 'libs', 'android', abi, name)));
    return { android_abis: ANDROID_ABIS, archive_count_per_abi: ANDROID_ARCHIVES.length };
  }
  if (platform !== 'ios') throw new Error('Native preparation supports android or ios');
  for (const target of ['ios', 'macos']) {
    for (const name of APPLE_FRAMEWORKS) {
      const directory = assertWithin(packageRoot, path.join(packageRoot, 'libs', target, name));
      const plist = fs.readFileSync(assertWithin(packageRoot, path.join(directory, 'Info.plist')), 'utf8');
      if (!plist.includes('AvailableLibraries')) throw new Error(`Framework Info.plist lacks its slices: ${directory}`);
      const archives = [];
      function visit(current) {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const file = assertWithin(packageRoot, path.join(current, entry.name));
          if (entry.isDirectory()) visit(file);
          else if (entry.name.endsWith('.a')) archives.push(file);
        }
      }
      visit(directory);
      if (!archives.length) throw new Error(`Framework has no native archives: ${directory}`);
      archives.forEach(verifyArchive);
    }
  }
  return { apple_platforms: ['ios', 'macos'], framework_count_per_platform: APPLE_FRAMEWORKS.length };
}

function inspectPackages(app) {
  const nodeModules = fs.realpathSync(path.join(app, 'node_modules'));
  const appRequire = createRequire(path.resolve(app, 'package.json'));
  const packageFile = appRequire.resolve('@shopify/react-native-skia/package.json');
  const packageRoot = fs.realpathSync(path.dirname(packageFile));
  assertWithin(nodeModules, packageRoot);
  const skia = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  if (skia.version !== '2.6.2') throw new Error('Review the native installer before changing locked Skia 2.6.2');
  if (['1', 'true'].includes((process.env.SK_GRAPHITE || '').toLowerCase())) throw new Error('The reviewed preview uses Ganesh, not Graphite');
  const installer = assertWithin(packageRoot, path.join(packageRoot, 'scripts/install-libs.js'));
  const digest = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
  if (digest !== INSTALLER_SHA256) throw new Error('Skia native installer differs from the reviewed package script');
  // The installer touches all four destinations even when only one OS is built.
  for (const target of ['ios', 'macos', 'tvos', 'android']) assertWithin(packageRoot, path.join(packageRoot, 'libs', target));
  for (const suffix of ['android', 'apple-ios', 'apple-macos', 'apple-tvos']) {
    const file = appRequire.resolve(`react-native-skia-${suffix}/package.json`);
    const root = fs.realpathSync(path.dirname(file));
    assertWithin(nodeModules, root);
    const info = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (info.version !== '147.1.0' || skia.dependencies[`react-native-skia-${suffix}`] !== '147.1.0') throw new Error(`Unreviewed Skia prebuilt package: ${suffix}`);
    assertWithin(root, path.join(root, 'libs'));
  }
  return { installer, packageRoot, skiaVersion: skia.version, binaryVersion: '147.1.0' };
}

function main() {
  const platform = process.argv[2];
  if (!['android', 'ios'].includes(platform)) throw new Error('Usage: node scripts/prepare-native-libraries.cjs android|ios [--check]');
  const inspected = inspectPackages(path.join(__dirname, '../ExpoRideSpeed'));
  const readOnly = process.argv.includes('--check');
  if (!readOnly) {
    if (!['linux', 'darwin'].includes(process.platform) || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Native library copying is restricted to the disposable Linux/macOS GitHub checkout; use --check locally');
    const log = execFileSync(process.execPath, [inspected.installer], { cwd: inspected.packageRoot, encoding: 'utf8', env: { ...process.env, SK_GRAPHITE: '0' } });
    process.stderr.write(log);
  }
  const libraries = verifyPrepared(inspected.packageRoot, platform);
  process.stdout.write(JSON.stringify({ checked: true, skia: inspected.skiaVersion, prebuilt: inspected.binaryVersion, installer_sha256: INSTALLER_SHA256, ...libraries }, null, 2) + '\n');
}

module.exports = { INSTALLER_SHA256, ANDROID_ABIS, ANDROID_ARCHIVES, APPLE_FRAMEWORKS, assertWithin, inspectPackages, verifyArchive, verifyPrepared };
if (require.main === module) main();
