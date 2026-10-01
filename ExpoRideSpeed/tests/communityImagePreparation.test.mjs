import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { communityModule, hold } from './communityFixtures.mjs';

const candidate = new Uint8Array(readFileSync(new URL('./fixtures/community/prepared-gradient.jpg', import.meta.url)));
const sha = createHash('sha256').update(candidate).digest('hex');

function fixture(platform = 'ios') {
 let valid = true, heldAt = null, held = null, width = 3200, height = 2400, oversized = false;
 const calls = [], files = new Map([['file:///picker/original.jpg', { bytes: candidate, size: 500000 }]]), source = { uri: platform === 'web' ? 'blob:https://preview.test/original' : 'file:///picker/original.jpg', width: 3200, height: 2400 };
 const pause = async point => { if (point === heldAt) await held.promise; };
 class File {
  constructor(uri) { this.uri = uri; }
  get size() { return files.get(this.uri)?.size ?? 0; }
  get exists() { return files.has(this.uri); }
  async bytes() { calls.push(['bytes', this.uri]); await pause('bytes'); return files.get(this.uri).bytes; }
  delete() { calls.push(['delete', this.uri]); files.delete(this.uri); }
 }
 let serial = 0;
 const context = { resize(next) { calls.push(['resize', next]); width = next.width; height = next.height; return context; }, async renderAsync() { calls.push('render'); await pause('render'); const image = { width, height, uri: platform === 'web' ? 'blob:https://preview.test/render-' + (++serial) : undefined, release() { calls.push('release-image'); }, async saveAsync(options) { calls.push(['save', options]); const uri = platform === 'web' ? 'blob:https://preview.test/output-' + (++serial) : 'file:///cache/ImageManipulator/output-' + (++serial) + '.jpg'; files.set(uri, { bytes: candidate, size: oversized && options.compress > .6 ? 1100000 : candidate.byteLength }); await pause('save'); return { uri, width, height }; } }; return image; }, release() { calls.push('release-context'); } };
 const url = class extends URL {};
 url.createObjectURL = () => 'blob:https://preview.test/helper-source-' + (++serial);
 url.revokeObjectURL = uri => calls.push(['revoke', uri]);
 const deps = { 'react-native': { Platform: { OS: platform } }, 'expo-file-system': { File, Paths: { cache: { uri: 'file:///cache/' } } }, 'expo-image-manipulator': { ImageManipulator: { manipulate(uri) { calls.push(['manipulate', uri]); return context; } }, SaveFormat: { JPEG: 'jpeg' } }, 'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, async digest(algorithm, bytes) { calls.push(['digest', algorithm, bytes.byteLength]); await pause('digest'); const buffer = createHash('sha256').update(bytes).digest(); return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength); } }, 'expo-image': { Image: { async generateBlurhashAsync(uri, components) { calls.push(['blurhash', uri, components]); await pause('blurhash'); return 'LEHV6nWB2yk8pyo0adR*.7kCMdnj'; } } } };
 const module = communityModule('imagePreparation', deps, { URL: url, fetch: async uri => { calls.push(['fetch', uri]); await pause('bytes'); return { ok: true, blob: async () => new Blob([candidate]) }; }, Blob });
 if (platform === 'web') source.webFile = new Blob([candidate]);
 return { source, calls, files, prepare: () => module.prepareCommunityPhoto(source, () => { if (!valid) throw Error('ACCOUNT_CHANGED'); }), invalidate: () => { valid = false; }, hold(point) { heldAt = point; held = hold(); return held; }, setSize(value) { files.get(source.uri).size = value; }, tooLarge() { oversized = true; } };
}

test('local candidate hashes exact JPEG upload bytes, uses actual rendered dimensions and carries no decoded-validation claim', async () => {
 const f = fixture(), prepared = await f.prepare();
 assert.equal(prepared.descriptor.sha256, sha); assert.equal(prepared.descriptor.byte_count, candidate.byteLength); assert.equal(prepared.descriptor.width, 1600); assert.equal(prepared.descriptor.height, 1200); assert.equal(prepared.descriptor.mime, 'image/jpeg'); assert.equal('validation' in prepared.descriptor, false);
 assert.equal(f.calls.some(v => Array.isArray(v) && v[0] === 'save' && v[1].format === 'jpeg' && v[1].base64 !== true), true);
 assert.equal(f.calls.some(v => Array.isArray(v) && v[0] === 'digest' && v[1] === 'SHA-256' && v[2] === candidate.byteLength), true);
 await prepared.dispose(); await prepared.dispose(); assert.equal(f.files.has(f.source.uri), true); assert.equal(f.files.has(prepared.uri), false);
});
test('actual source byte cap rejects before loading pixels, even if picker dimensions look safe', async () => { const f = fixture(); f.setSize(20 * 1024 * 1024 + 1); await assert.rejects(f.prepare(), /COMMUNITY_PHOTO_TOO_LARGE/); assert.equal(f.calls.some(v => Array.isArray(v) && v[0] === 'manipulate'), false); });
test('input pixel cap and remote HTTP URI are rejected without decode, egress or deleting the picker input', async () => { for (const mutate of [s => { s.width = 10000; s.height = 10000; }, s => { s.uri = 'https://third-party.test/private.jpg'; }]) { const f = fixture(); mutate(f.source); await assert.rejects(f.prepare(), /COMMUNITY_PHOTO_(TOO_LARGE|INVALID)/); assert.equal(f.calls.length, 0); assert.equal(f.files.has('file:///picker/original.jpg'), true); } });
test('oversized encoded attempts are discarded and lower JPEG quality reuses pixels until actual bytes fit', async () => { const f = fixture(); f.tooLarge(); const p = await f.prepare(); assert.ok(p.descriptor.byte_count <= 1024 * 1024); const saves = f.calls.filter(v => Array.isArray(v) && v[0] === 'save'); assert.ok(saves.length > 1); assert.ok(saves.at(-1)[1].compress < saves[0][1].compress); assert.ok(f.calls.some(v => Array.isArray(v) && v[0] === 'delete')); await p.dispose(); });
test('native BlurHash is optional real output and browser preparation never fabricates or invokes a native hash', async () => { const native = fixture(), p = await native.prepare(); assert.equal(p.descriptor.blurhash, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj'); await p.dispose(); const browser = fixture('web'), w = await browser.prepare(); assert.equal(w.descriptor.blurhash, null); assert.equal(browser.calls.some(v => Array.isArray(v) && v[0] === 'blurhash'), false); await w.dispose(); assert.equal(browser.calls.some(v => Array.isArray(v) && v[0] === 'revoke' && v[1] === browser.source.uri), false); });
test('every held native async boundary rejects a later owner and cleans only newly created temporary files', async () => { for (const point of ['render', 'save', 'bytes', 'digest', 'blurhash']) { const f = fixture(), wait = f.hold(point), pending = f.prepare(); await new Promise(r => setTimeout(r, 0)); f.invalidate(); wait.resolve(); await assert.rejects(pending, /ACCOUNT_CHANGED/, point); assert.equal(f.files.has(f.source.uri), true, point); assert.equal([...f.files.keys()].some(uri => uri.startsWith('file:///cache/')), false, point); } });
