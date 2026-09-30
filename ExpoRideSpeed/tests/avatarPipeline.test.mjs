import assert from 'node:assert/strict';
import test from 'node:test';
import { syncAvatarUpload, ScopedAvatarCache, validateSignedAvatarUrl } from '../src/features/profile/avatarPipeline.ts';

const id = '11111111-1111-4111-8111-111111111111';
const upload = () => ({ id, owner: 'owner-A', mime: 'image/jpeg', bytes: new Uint8Array([255, 216, 255, 217]).buffer, expectedRevision: null });
function server() {
  let current = { revision: 0, avatar_id: null }, exists = false;
  const events = [];
  const api = {
    async current() { events.push('current'); return { ...current }; },
    async reserve(value) { events.push(['reserve', value.id]); return { upload_id: value.id, bucket: 'ride-avatars', path: `owner-A/${id}.jpg`, expires_at: '2099-01-01T00:00:00Z' }; },
    async exists() { events.push('exists'); return exists; },
    async upload(path, bytes, mime) { events.push(['upload', path, bytes.byteLength, mime]); exists = true; },
    async commit(value, revision) {
      events.push(['commit', value, revision]);
      if (current.avatar_id === value) return { ...current };
      assert.equal(revision, current.revision);
      assert.equal(exists, true);
      current = { revision: current.revision + 1, avatar_id: value };
      return { ...current };
    },
  };
  return { api, events, get current() { return current; }, set current(value) { current = value; } };
}

test('avatar publication reserves a server path and commits only after immutable upload', async () => {
  const s = server();
  const result = await syncAvatarUpload(upload(), s.api, () => {});
  assert.equal(result.avatar_id, id);
  assert.deepEqual(s.events, ['current', ['reserve', id], 'exists', ['upload', `owner-A/${id}.jpg`, 4, 'image/jpeg'], ['commit', id, 0]]);
});

test('lost upload response reuses the actual object without uploading it twice', async () => {
  const s = server(), original = s.api.upload;
  s.api.upload = async (...args) => { await original(...args); throw new Error('response lost'); };
  assert.equal((await syncAvatarUpload(upload(), s.api, () => {})).avatar_id, id);
  assert.equal(s.events.filter(event => Array.isArray(event) && event[0] === 'upload').length, 1);
});

test('lost commit response is resolved by current avatar identity, without another reservation', async () => {
  const s = server(), original = s.api.commit;
  s.api.commit = async (...args) => { await original(...args); throw new Error('response lost'); };
  assert.equal((await syncAvatarUpload(upload(), s.api, () => {})).avatar_id, id);
  const prior = s.events.length;
  assert.equal((await syncAvatarUpload(upload(), s.api, () => {})).avatar_id, id);
  assert.deepEqual(s.events.slice(prior), ['current']);
});

test('a stale avatar revision cannot overwrite a newer photo from another device', async () => {
  const s = server();
  s.current = { revision: 3, avatar_id: '22222222-2222-4222-8222-222222222222' };
  await assert.rejects(syncAvatarUpload({ ...upload(), expectedRevision: 2 }, s.api, () => {}), /AVATAR_REVISION_CONFLICT/);
  assert.deepEqual(s.events, ['current']);
});

test('foreign and malformed reservation paths are rejected before object access', async () => {
  for (const path of [`owner-B/${id}.jpg`, `owner-A/../${id}.jpg`, `owner-A/%2f${id}.jpg`, `owner-A/${id}.png`, `owner-A/${id}.jpeg`]) {
    const s = server();
    s.api.reserve = async () => ({ upload_id: id, bucket: 'ride-avatars', path, expires_at: '2099-01-01T00:00:00Z' });
    await assert.rejects(syncAvatarUpload(upload(), s.api, () => {}), /AVATAR_INVALID_OBJECT/);
    assert.deepEqual(s.events, ['current']);
  }
});

test('private photo URLs accept the resolved project only and exact owner/id object paths', () => {
  const valid=`https://configured.test/storage/v1/object/sign/ride-avatars/owner-A/${id}.jpg?token=private`;
  assert.equal(validateSignedAvatarUrl(valid,'https://configured.test','owner-A',id),valid);
  for(const value of [valid.replace('configured.test','other.test'),valid.replace('owner-A','owner-B'),valid.replace('.jpg?','.jpg/extra?'),valid.replace('token=private','download=1'),valid.replace('https:','http:'),valid+'#fragment']) assert.throws(()=>validateSignedAvatarUrl(value,'https://configured.test','owner-A',id),/AVATAR_UNAVAILABLE/);
});

test('account changes between stages prevent the next upload or commit', async () => {
  const s = server();
  let checks = 0;
  await assert.rejects(syncAvatarUpload(upload(), s.api, () => { if (++checks >= 4) throw new Error('account changed'); }), /account changed/);
  assert.equal(s.events.some(event => Array.isArray(event) && event[0] === 'upload'), false);
  assert.equal(s.events.some(event => Array.isArray(event) && event[0] === 'commit'), false);
});

test('avatars above one MiB or with unsupported MIME never reach the server', async () => {
  for (const value of [{ ...upload(), bytes: new ArrayBuffer(1_048_577) }, { ...upload(), mime: 'image/svg+xml' }]) {
    const s = server();
    await assert.rejects(syncAvatarUpload(value, s.api, () => {}), /AVATAR_INVALID_OBJECT/);
    assert.deepEqual(s.events, []);
  }
});

test('signed avatar URLs expire early and cannot cross account generations or avatar IDs', () => {
  let now = 1000;
  const cache = new ScopedAvatarCache(() => now);
  const originalA = {}, b = {}, newA = {};
  cache.put(originalA, id, 'https://server.test/signed-A', 60);
  assert.equal(cache.get(originalA, id), 'https://server.test/signed-A');
  assert.equal(cache.get(b, id), null);
  assert.equal(cache.get(newA, id), null);
  assert.equal(cache.get(originalA, 'other-avatar'), null);
  now += 55_000;
  assert.equal(cache.get(originalA, id), null);
});
