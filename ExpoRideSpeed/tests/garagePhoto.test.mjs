import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url), ts = require('typescript');
function load(name, imports = {}) {
  const module = { exports: {} };
  try {
    const source = readFileSync(new URL(`../src/features/garage/${name}.ts`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', js)(key => imports[key], module, module.exports);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return module.exports;
}
const drafts = load('photoDraftStore');
const pipeline = load('photoPipeline', { './photoDraftStore': drafts });
const uuid = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000001`;
const owner = uuid(1), other = uuid(2);
const photo = (n = 3, vehicleId = 'vehicle', ownerId = owner) => ({ id: uuid(n), ownerId, vehicleId, mime: 'image/jpeg', base64: Buffer.from('jpeg fixture').toString('base64'), createdAtMs: 1_700_000_000_000 });
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const turn = () => new Promise(r => setImmediate(r));
function fixture() {
  const values = new Map(); let failRead = false, hold = null, readHold = null, failWrite = false, failRemove = false;
  const storage = { getAllKeys: async () => { if (failRead) throw Error('disk read'); return [...values.keys()]; }, getItem: async key => { if (readHold) await readHold.promise; return values.get(key) ?? null; },
    setItem: async (key, value) => { if (hold) await hold.promise; if (failWrite) throw Error('disk full'); values.set(key, value); }, removeItem: async key => { if (failRemove) throw Error('remove failed'); values.delete(key); } };
  assert.equal(typeof drafts.PhotoDraftStore, 'function');
  return { values, storage, store: new drafts.PhotoDraftStore(storage), failRead: () => { failRead = true; }, hold: () => { hold = deferred(); return hold; },
    holdRead: () => { readHold = deferred(); return readHold; }, failWrite: value => { failWrite = value; }, failRemove: value => { failRemove = value; } };
}
test('photo drafts persist separately per owner and enforce the real 1 MiB/eight-draft limits', async () => {
  const h = fixture();
  for (let n = 3; n < 11; n++) await h.store.write(owner, photo(n));
  assert.equal((await h.store.list(owner)).length, 8);
  assert.equal((await h.store.list(other)).length, 0);
  await assert.rejects(h.store.write(owner, photo(11)), /PHOTO_DRAFT_LIMIT/);
  await h.store.write(owner, photo(3)); // Same immutable draft can be retried.
  assert.equal((await h.store.read(owner, uuid(3))).vehicleId, 'vehicle');
  await assert.rejects(h.store.write(other, photo(3)), /PHOTO_INVALID/);
  await assert.rejects(h.store.write(other, { ...photo(12, 'car', other), base64: Buffer.alloc(1_048_577).toString('base64') }), /PHOTO_INVALID/);
  assert.ok([...h.values.keys()].every(key => !key.startsWith('ride.local.')));
});
test('failed draft reads never turn into an empty store that can bypass the limit', async () => {
  const h = fixture(); h.failRead();
  await assert.rejects(h.store.list(owner), /LOCAL_READ_FAILED/);
  await assert.rejects(h.store.write(owner, photo()), /LOCAL_READ_FAILED/);
  assert.equal(h.values.size, 0);
});

test('a draft UUID is immutable, write failure remains retryable, and foreign cached content is unreadable', async () => {
  const h = fixture(), original = photo(); h.failWrite(true);
  await assert.rejects(h.store.write(owner, original), /LOCAL_WRITE_FAILED/); assert.equal(h.values.size, 0);
  h.failWrite(false); await h.store.write(owner, original);
  await assert.rejects(h.store.write(owner, { ...original, base64: Buffer.from('different bytes').toString('base64') }), /PHOTO_DRAFT_CONFLICT/);
  assert.deepEqual(await new drafts.PhotoDraftStore(h.storage).read(owner, original.id), original);
  const ownKey = [...h.values.keys()][0]; h.values.set(ownKey, JSON.stringify({ ...original, ownerId: other }));
  await assert.rejects(h.store.read(owner, original.id), /LOCAL_READ_FAILED/);
});

test('an owner-generation read guard rejects delayed A data after A to B to A', async () => {
  const h = fixture(); await h.store.write(owner, photo());
  const firstA = {}, laterA = {}; let current = firstA;
  const hold = h.holdRead();
  const reading = h.store.read(owner, uuid(3), () => { if (current !== firstA) throw Error('ACCOUNT_CHANGED'); });
  await turn(); current = {}; current = laterA; hold.resolve();
  await assert.rejects(reading, /ACCOUNT_CHANGED/);
});

test('failed account cleanup can retry after closure and drains every owner key without touching another owner', async () => {
  const h = fixture();
  for (let n = 3; n < 13; n++) h.values.set(`ride.garage-photo.v1.${owner}.${uuid(n)}`, JSON.stringify(photo(n)));
  const foreignKey = `ride.garage-photo.v1.${other}.${uuid(30)}`; h.values.set(foreignKey, JSON.stringify(photo(30, 'car', other)));
  h.failRemove(true); await assert.rejects(h.store.removeOwner(owner), /LOCAL_WRITE_FAILED/);
  await assert.rejects(h.store.write(owner, photo(20)), /ACCOUNT_DELETION_PENDING/);
  h.failRemove(false); await h.store.removeOwner(owner);
  assert.deepEqual([...h.values.keys()], [foreignKey]);
});
test('same-owner stores share the quota queue, and confirmed deletion fences queued and late work', async () => {
  const h = fixture(), another = new drafts.PhotoDraftStore(h.storage);
  const results = await Promise.allSettled(Array.from({ length: 9 }, (_, n) => (n % 2 ? h.store : another).write(owner, photo(3 + n))));
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 8);
  assert.equal(results.filter(value => value.status === 'rejected').length, 1);
  const hold = h.hold(); const replacing = h.store.write(owner, photo(3)); await turn();
  const removal = another.removeOwner(owner); hold.resolve(); await assert.rejects(replacing, /ACCOUNT_DELETION_PENDING/); await removal;
  assert.equal(h.values.size, 0);
  await assert.rejects(h.store.write(owner, photo(12)), /ACCOUNT_DELETION_PENDING/);
  await assert.rejects(another.list(owner), /ACCOUNT_DELETION_PENDING/);
});
test('an expired upload rotates its immutable ID in the existing storage slot at the eight-image limit', async () => {
  const h = fixture(); for (let n = 3; n < 11; n++) await h.store.write(owner, photo(n));
  assert.equal(typeof h.store.rotate, 'function');
  const renewed = await h.store.rotate(owner, uuid(3), uuid(40));
  assert.equal(renewed.id, uuid(40)); assert.equal(renewed.base64, photo(3).base64);
  assert.equal(renewed.vehicleId, photo(3).vehicleId); assert.equal(renewed.mime, photo(3).mime);
  assert.equal(h.values.size, 8, 'rotation never creates a ninth storage slot');
  const restarted = new drafts.PhotoDraftStore(h.storage);
  assert.equal(await restarted.read(owner, uuid(3)), null);
  assert.deepEqual(await restarted.read(owner, uuid(40)), renewed);
  assert.deepEqual(await restarted.rotate(owner, uuid(3), uuid(40)), renewed, 'lost rotation response is idempotent');
  await assert.rejects(restarted.rotate(owner, uuid(4), uuid(40)), /PHOTO_DRAFT_CONFLICT/);
  await assert.rejects(restarted.write(owner, photo(3)), /PHOTO_DRAFT_CONFLICT/);
  await restarted.remove(owner, uuid(40)); assert.equal(h.values.size, 7);
  assert.equal(await restarted.read(owner, uuid(40)), null);
});
test('failed rotation keeps original bytes and a durable rotation survives an account-generation response loss', async () => {
  const h = fixture(); await h.store.write(owner, photo());
  assert.equal(typeof h.store.rotate, 'function'); h.failWrite(true);
  await assert.rejects(h.store.rotate(owner, uuid(3), uuid(40)), /LOCAL_WRITE_FAILED/);
  assert.deepEqual(await h.store.read(owner, uuid(3)), photo()); h.failWrite(false);
  let active = true; const hold = h.hold();
  const rotating = h.store.rotate(owner, uuid(3), uuid(40), () => { if (!active) throw Error('ACCOUNT_CHANGED'); });
  await turn(); active = false; hold.resolve(); await assert.rejects(rotating, /ACCOUNT_CHANGED/);
  assert.equal((await h.store.read(owner, uuid(40))).base64, photo().base64);
  await h.store.removeOwner(owner); assert.equal(h.values.size, 0);
});
test('rotation fences a superseded target and deletion, and refuses unread or foreign draft ownership', async () => {
  const h = fixture(); await h.store.write(owner, photo());
  assert.equal(typeof h.store.rotate, 'function');
  await assert.rejects(h.store.rotate(other, uuid(3), uuid(40)), /PHOTO_UNAVAILABLE/);
  await assert.rejects(h.store.rotate(owner, uuid(3), uuid(40), () => { throw Error('GARAGE_PHOTO_TARGET_CHANGED'); }), /TARGET_CHANGED/);
  assert.deepEqual(await h.store.read(owner, uuid(3)), photo());
  const hold = h.hold(), rotating = h.store.rotate(owner, uuid(3), uuid(40)); await turn();
  const removing = h.store.removeOwner(owner); hold.resolve(); await assert.rejects(rotating, /ACCOUNT_DELETION_PENDING/);
  await removing; assert.equal(h.values.size, 0);
  const unread = fixture(); unread.failRead();
  await assert.rejects(unread.store.rotate(owner, uuid(3), uuid(40)), /LOCAL_READ_FAILED/);
});
test('immutable photo upload recovers a lost response and returns a path without deleting its draft', async () => {
  assert.equal(typeof pipeline.prepareVehiclePhoto, 'function');
  const draft = photo(); let uploaded = false, sends = 0;
  const api = { reserve: async () => ({ upload_id: draft.id, vehicle_id: draft.vehicleId, state: 'reserved', bucket: 'vehicle-photos', path: `${owner}/${draft.id}.jpg`, expires_at: new Date(Date.now() + 60_000).toISOString() }),
    exists: async () => uploaded, upload: async () => { uploaded = true; sends++; throw Error('lost response'); } };
  const result = await pipeline.prepareVehiclePhoto(draft, api, () => {});
  assert.equal(result.path, `${owner}/${draft.id}.jpg`);
  assert.equal(result.uploadId, draft.id); assert.equal(sends, 1);
  await pipeline.prepareVehiclePhoto(draft, api, () => {}); assert.equal(sends, 1);
});
test('foreign/colliding/expired reservations cannot trigger an upload', async () => {
  assert.equal(typeof pipeline.prepareVehiclePhoto, 'function');
  const draft = photo(); let calls = 0;
  const valid = { upload_id: draft.id, vehicle_id: draft.vehicleId, state: 'reserved', bucket: 'vehicle-photos', path: `${owner}/${draft.id}.jpg`, expires_at: new Date(Date.now() + 60_000).toISOString() };
  for (const patch of [{ path: `${other}/${draft.id}.jpg` }, { upload_id: uuid(8) }, { vehicle_id: 'removed' }, { bucket: 'ride-avatars' }]) {
    await assert.rejects(pipeline.prepareVehiclePhoto(draft, { reserve: async () => ({ ...valid, ...patch }), exists: async () => { calls++; return false; }, upload: async () => { calls++; } }, () => {}), /PHOTO_INVALID/);
  }
  await assert.rejects(pipeline.prepareVehiclePhoto(draft, { reserve: async () => ({ ...valid, expires_at: '2000-01-01' }), exists: async () => { calls++; return false; }, upload: async () => { calls++; } }, () => {}), /PHOTO_EXPIRED/);
  assert.equal(calls, 0);
});
test('the SDK photo transport preserves a precisely bound server expiry so the caller can rotate bytes', async () => {
  const scope = { userId: owner }, session = { user: { id: owner } }, h = fixture();
  const service = load('photoService', { '@react-native-async-storage/async-storage': { default: h.storage }, './photoDraftStore': drafts, './photoPipeline': pipeline,
    '../../state/AuthState': { isAccountCurrent: value => value === scope, accountClient: () => ({ rpc: async () => ({ data: null, error: { message: 'GARAGE_PHOTO_EXPIRED' } }) }) }, '../../lib/publicService': { publicService: { url: 'https://project.supabase.co' } } });
  await assert.rejects(service.vehiclePhotoTransport(scope, session).reserve(photo()), /PHOTO_EXPIRED/);
});
test('a committed photo keeps its original expired reservation path and is never uploaded again', async () => {
  const draft = photo(), path = `${owner}/${draft.id}.jpg`; let sends = 0, objectPresent = true;
  const api = { reserve: async () => ({ upload_id: draft.id, vehicle_id: draft.vehicleId, bucket: 'vehicle-photos', path, expires_at: '2000-01-01', state: 'committed' }),
    exists: async () => objectPresent, upload: async () => { sends++; } };
  assert.equal((await pipeline.prepareVehiclePhoto(draft, api, () => {})).path, path); assert.equal(sends, 0);
  objectPresent = false;
  await assert.rejects(pipeline.prepareVehiclePhoto(draft, api, () => {}), /PHOTO_UNAVAILABLE/);
  assert.equal(sends, 0, 'committed missing binaries never re-upload under an immutable committed path');
  await assert.rejects(pipeline.prepareVehiclePhoto(draft, { ...api, reserve: async () => ({ ...await api.reserve(), state: 'obsolete' }) }, () => {}), /PHOTO_INVALID/);
});
test('account ABA, later photo selection and vehicle removal fence every awaited request', async () => {
  assert.equal(typeof pipeline.prepareVehiclePhoto, 'function');
  for (const reason of ['ACCOUNT_CHANGED', 'PHOTO_CHANGED', 'VEHICLE_REMOVED']) {
    const draft = photo(), hold = deferred(); let active = true, exists = 0;
    const work = pipeline.prepareVehiclePhoto(draft, { reserve: async () => { await hold.promise; return { upload_id: draft.id, vehicle_id: draft.vehicleId, state: 'reserved', bucket: 'vehicle-photos', path: `${owner}/${draft.id}.jpg`, expires_at: new Date(Date.now() + 60_000).toISOString() }; }, exists: async () => { exists++; return false; }, upload: async () => {} }, () => { if (!active) throw Error(reason); });
    await turn(); active = false; hold.resolve(); await assert.rejects(work, new RegExp(reason)); assert.equal(exists, 0);
  }
});
test('signed garage photo URLs and cache entries bind exact scope, path and short lifetime', () => {
  assert.equal(typeof pipeline.ScopedVehiclePhotoCache, 'function');
  const project = 'https://project.supabase.co', path = `${owner}/${uuid(3)}.jpg`, url = `${project}/storage/v1/object/sign/vehicle-photos/${path}?token=private`;
  assert.equal(pipeline.validateVehiclePhotoUrl(url, project, owner, uuid(3), path), url);
  for (const changed of [url.replace('https:', 'http:'), url.replace('project.', 'foreign.'), url.replace(owner, other), url.replace('vehicle-photos', 'ride-avatars'), url + '#fragment']) assert.throws(() => pipeline.validateVehiclePhotoUrl(changed, project, owner, uuid(3), path), /PHOTO_UNAVAILABLE/);
  let now = 0; const cache = new pipeline.ScopedVehiclePhotoCache(() => now), a = {}, laterA = {};
  cache.put(a, 'vehicle', path, url, 60); assert.equal(cache.get(a, 'vehicle', path), url);
  assert.equal(cache.get(laterA, 'vehicle', path), null); assert.equal(cache.get(a, 'vehicle', `${owner}/${uuid(4)}.jpg`), null);
  now = 55_000; assert.equal(cache.get(a, 'vehicle', path), null);
  cache.put(a, 'vehicle', path, url, 60); cache.clear(a); assert.equal(cache.get(a, 'vehicle', path), null);
});

test('the real SDK photo transport pins the original JWT, uses immutable uploads, and rejects an ABA completion', async () => {
  const scope = { userId: owner, generation: 1 }, session = { user: { id: owner }, access_token: 'fixture-token-A' };
  let current = scope, hold = null, uploaded = false; const requests = [];
  const draft = photo(), path = `${owner}/${draft.id}.jpg`;
  const fetch = async (input, init) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers), body: init?.body });
    if (hold) await hold.promise;
    if (String(input).includes('/rpc/rs_reserve_vehicle_photo')) return new Response(JSON.stringify({ upload_id: draft.id, vehicle_id: draft.vehicleId, state: 'reserved', bucket: 'vehicle-photos', path, expires_at: new Date(Date.now() + 60_000).toISOString() }), { status: 200 });
    if (String(input).includes('/object/info/')) return new Response(JSON.stringify(uploaded ? { name: path, size: 12 } : { message: 'Object not found', statusCode: '404', error: 'not_found' }), { status: uploaded ? 200 : 404 });
    uploaded = true; return new Response(JSON.stringify({ Key: `vehicle-photos/${path}`, Id: draft.id }), { status: 200 });
  };
  const token = session.access_token;
  const client = createClient('https://project.supabase.co', 'fixture-publishable-key', { accessToken: async () => token, global: { fetch } });
  const h = fixture();
  const service = load('photoService', { '@react-native-async-storage/async-storage': { default: h.storage }, './photoDraftStore': drafts, './photoPipeline': pipeline,
    '../../state/AuthState': { isAccountCurrent: candidate => candidate === current, accountClient: () => client }, '../../lib/publicService': { publicService: { url: 'https://project.supabase.co' } } });
  assert.equal(typeof service.vehiclePhotoTransport, 'function');
  const api = service.vehiclePhotoTransport(scope, session);
  await pipeline.prepareVehiclePhoto(draft, api, () => { if (scope !== current) throw Error('ACCOUNT_CHANGED'); });
  assert.ok(requests.every(request => request.headers.get('authorization') === 'Bearer fixture-token-A'));
  assert.equal(requests.at(-1).headers.get('x-upsert'), 'false');
  const sent = JSON.parse(requests[0].body);
  assert.deepEqual(sent, { p_id: draft.id, p_vehicle_id: draft.vehicleId, p_mime: 'image/jpeg' });
  hold = deferred(); const late = api.reserve(draft); await turn(); current = { userId: owner, generation: 3 }; hold.resolve();
  await assert.rejects(late, /ACCOUNT_CHANGED/);
  await assert.rejects(api.exists(path), /ACCOUNT_CHANGED/);
});

test('the signer accepts only current expected owner/path and rejects stale vehicle responses', async () => {
  const scope = { userId: owner, generation: 1 }, session = { user: { id: owner }, access_token: 'fixture-token-A' };
  const path = `${owner}/${uuid(3)}.jpg`, url = `https://project.supabase.co/storage/v1/object/sign/vehicle-photos/${path}?token=signed`;
  let result = { url, expiresIn: 60, uploadId: uuid(3) }; const bodies = [];
  const client = { functions: { invoke: async (name, options) => { assert.equal(name, 'vehicle-photo-url'); bodies.push(options.body); return { data: result, error: null }; } } };
  const h = fixture();
  const service = load('photoService', { '@react-native-async-storage/async-storage': { default: h.storage }, './photoDraftStore': drafts, './photoPipeline': pipeline,
    '../../state/AuthState': { isAccountCurrent: candidate => candidate === scope, accountClient: () => client }, '../../lib/publicService': { publicService: { url: 'https://project.supabase.co' } } });
  assert.equal(typeof service.getPrivateVehiclePhoto, 'function');
  assert.equal(await service.getPrivateVehiclePhoto(scope, session, 'vehicle', path), url);
  assert.deepEqual(bodies[0], { vehicleId: 'vehicle' });
  await assert.rejects(service.getPrivateVehiclePhoto(scope, session, 'vehicle', `${other}/${uuid(3)}.jpg`), /PHOTO_UNAVAILABLE/);
  service.vehiclePhotoCache.clear(scope); result = { ...result, uploadId: uuid(4) };
  assert.equal(await service.getPrivateVehiclePhoto(scope, session, 'vehicle', path), null);
  result = { ...result, uploadId: uuid(3), url: url.replace('project.', 'foreign.') };
  await assert.rejects(service.getPrivateVehiclePhoto(scope, session, 'vehicle', path), /PHOTO_UNAVAILABLE/);
});

test('the garage picker re-encodes without EXIF and shrinks to the byte budget while preserving default profile behavior', async () => {
  const source = readFileSync(new URL('../src/lib/photos.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }, settings = [], resized = [], saves = []; let releases = 0;
  let outputs = [Buffer.alloc(1_048_577).toString('base64'), Buffer.from('bounded JPEG fixture').toString('base64')];
  const imports = { 'expo-image-picker': { launchImageLibraryAsync: async options => { settings.push(options); return { canceled: false, assets: [{ uri: 'fixture', fileSize: 2_000_000, width: 4000, height: 3000 }] }; } },
    'expo-image-manipulator': { SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: () => ({ crop() { return this; }, resize(value) { resized.push(value); return this; }, release() { releases++; }, renderAsync: async () => ({ release() { releases++; }, saveAsync: async value => { saves.push(value); return { base64: outputs.shift() }; } }) }) } } };
  new Function('require', 'module', 'exports', js)(name => imports[name], module, module.exports);
  assert.equal(typeof module.exports.pickGaragePhoto, 'function');
  const result = await module.exports.pickGaragePhoto();
  assert.ok(result.base64.length < 100); assert.equal(settings[0].exif, false);
  assert.deepEqual(resized, [{ width: 720 }, { width: 512 }]); assert.ok(saves.every(save => save.compress <= 0.75));
  assert.equal(releases, 4, 'each garage manipulation/image reference is released after its attempt');
  resized.length = 0; saves.length = 0; outputs = [Buffer.from('default profile fixture').toString('base64')];
  await module.exports.pickPicture(false);
  assert.deepEqual(resized, [{ width: 1440 }]); assert.equal(saves[0].compress, 0.8);
});
