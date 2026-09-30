import assert from 'node:assert/strict';
import test from 'node:test';
import { challengeUnavailable, prepareRideEvidence, sendRideSubmission, MAX_SUBMISSION_BYTES } from '../src/lib/rideSubmission.ts';

const owner = '8a6c341e-8f52-4c63-8b43-1c4803fe28e5';
const challengeId = 'd134e71c-c8ba-435d-b7c9-59b772219c64';
const id = '541786ac-a5d5-42a3-a4b6-a8179460d15d';
const epoch = 1790000000000;
const challenge = { id: challengeId, mode: 'timed_race', metric: 'sustained_speed_3s', state: 'open', course_session_id: id, route_snapshot: { title: 'ทดสอบ' }, starts_at: new Date(epoch).toISOString(), ends_at: new Date(epoch + 10000).toISOString() };
const binding = { sessionId: 'capture-new', ownerId: owner, challenge };
const evidence = () => ({ sessionId: binding.sessionId, nativeSource: true, truncated: false, samples: Array.from({ length: 4 }, (_, i) => ({ timestampMs: epoch + i * 1000, latitude: 13.701234567 + i * .00001, longitude: 100.512345678, speedMps: 1.234567, horizontalAccuracyM: 3.2, speedAccuracyMps: .42, isSimulatedBySoftware: false, isProducedByAccessory: false, mocked: null })) });
const draft = () => ({ id, ownerId: owner, challengeId, visibility: 'private', bytes: prepareRideEvidence(evidence(), binding).bytes });
const serverRow = (patch = {}) => ({ id, owner_id: owner, challenge_id: challengeId, visibility: 'private', evidence_path: `${owner}/${id}/samples.bin`, state: 'pending_upload', rejection_reason: null, verification_started_at: null, verification_attempts: 0, ...patch });

function fakeServer() {
  const state = { row: null, stored: null, calls: [], ownerCurrent: true, loseReserve: false, loseUpload: false, loseQueue: false, failVerify: false };
  const api = {
    assertOwner: async () => { if (!state.ownerCurrent) throw new Error('ACCOUNT_CHANGED'); },
    read: async () => { state.calls.push('read'); return state.row && { ...state.row }; },
    reserve: async () => { state.calls.push('reserve'); state.row = serverRow(); if (state.loseReserve) { state.loseReserve = false; throw new Error('LOST_RESERVE_RESPONSE'); } return state.row.evidence_path; },
    exists: async () => { state.calls.push('exists'); return !!state.stored; },
    upload: async (path, bytes) => { state.calls.push('upload'); assert.equal(path, serverRow().evidence_path); assert.equal(state.stored, null); state.stored = bytes.slice(0); if (state.loseUpload) { state.loseUpload = false; throw new Error('LOST_UPLOAD_RESPONSE'); } },
    queue: async () => { state.calls.push('queue'); assert.ok(state.stored); state.row.state = 'queued'; if (state.loseQueue) { state.loseQueue = false; throw new Error('LOST_QUEUE_RESPONSE'); } },
    verify: async () => { state.calls.push('verify'); if (state.failVerify) throw new Error('SERVICE_UNAVAILABLE'); state.row.state = 'verified'; },
  };
  return { state, api };
}

test('challenge preflight requires accepted membership, timed metric, current open window', () => {
  assert.equal(challengeUnavailable(challenge, true, epoch), null);
  for (const [value, accepted, time] of [
    [challenge, false, epoch], [{ ...challenge, mode: 'group_ride' }, true, epoch],
    [{ ...challenge, metric: 'none' }, true, epoch], [{ ...challenge, course_session_id: null }, true, epoch],
    [{ ...challenge, state: 'cancelled' }, true, epoch], [challenge, true, epoch - 1], [challenge, true, epoch + 10000],
  ]) assert.ok(challengeUnavailable(value, accepted, time));
});

test('serialization preserves delivered values and exact bytes, without adding a speed value', () => {
  const raw = evidence(), original = structuredClone(raw);
  const prepared = prepareRideEvidence(raw, binding), encoded = new TextDecoder().decode(prepared.bytes);
  assert.deepEqual(JSON.parse(encoded), { schemaVersion: 1, challengeId, source: 'corelocation', samples: raw.samples });
  assert.deepEqual(raw, original);
  assert.equal(Buffer.byteLength(encoded, 'utf8'), prepared.bytes.byteLength);
  assert.equal(prepared.sampleCount, 4);
  assert.equal(prepared.endsAtMs - prepared.startsAtMs, 3000);
  assert.equal(JSON.parse(encoded).samples[0].latitude, 13.701234567);
});

test('old capture, failed capture identity, fallback, truncation, absent accuracy and mock samples are refused', () => {
  const cases = [
    { ...evidence(), sessionId: 'old-capture' }, { ...evidence(), sessionId: null },
    { ...evidence(), nativeSource: false }, { ...evidence(), truncated: true },
  ];
  for (const field of ['speedMps', 'horizontalAccuracyM', 'speedAccuracyMps']) { const raw = evidence(); raw.samples[0][field] = null; cases.push(raw); }
  for (const field of ['isSimulatedBySoftware', 'mocked']) { const raw = evidence(); raw.samples[0][field] = true; cases.push(raw); }
  const duplicate = evidence(); duplicate.samples[1].timestampMs = duplicate.samples[0].timestampMs; cases.push(duplicate);
  for (const value of cases) assert.throws(() => prepareRideEvidence(value, binding));
});

test('the envelope byte limit includes its overhead; it never trims samples to fit', () => {
  const raw = evidence();
  // A future provider extension also counts toward UTF-8 bytes, not JS string length.
  raw.samples[0].providerDetail = '';
  const baseSize = new TextEncoder().encode(JSON.stringify(raw.samples)).byteLength;
  raw.samples[0].providerDetail = 'ก'.repeat(Math.floor((MAX_SUBMISSION_BYTES - baseSize) / 3));
  assert.ok(new TextEncoder().encode(JSON.stringify(raw.samples)).byteLength <= MAX_SUBMISSION_BYTES);
  assert.throws(() => prepareRideEvidence(raw, binding), /ขนาด/);
});

test('reserve response lost: retry reads the same row and does not reserve or upload twice', async () => {
  const { state, api } = fakeServer(), frozen = draft(); state.loseReserve = true;
  await assert.rejects(sendRideSubmission(frozen, api), /LOST_RESERVE_RESPONSE/);
  const result = await sendRideSubmission(frozen, api);
  assert.equal(result.row.state, 'verified');
  assert.equal(state.calls.filter(v => v === 'reserve').length, 1);
  assert.equal(state.calls.filter(v => v === 'upload').length, 1);
  assert.deepEqual(new Uint8Array(state.stored), new Uint8Array(frozen.bytes));
});

test('upload and queue responses lost: existence/state checks finish the same submission', async () => {
  const { state, api } = fakeServer(), frozen = draft(); state.loseUpload = true; state.loseQueue = true;
  assert.equal((await sendRideSubmission(frozen, api)).row.state, 'verified');
  assert.equal(state.calls.filter(v => v === 'upload').length, 1);
  assert.equal((await sendRideSubmission(frozen, api)).row.state, 'verified');
  assert.equal(state.calls.filter(v => v === 'verify').length, 1);
});

test('a pre-existing immutable object is never uploaded again', async () => {
  const { state, api } = fakeServer(), frozen = draft(); state.row = serverRow(); state.stored = frozen.bytes;
  assert.equal((await sendRideSubmission(frozen, api)).row.state, 'verified');
  assert.equal(state.calls.includes('upload'), false);
  assert.equal(state.calls.includes('reserve'), false);
});

test('pending verification is reported as pending, and only explicit retry invokes again', async () => {
  const { state, api } = fakeServer(); state.failVerify = true;
  const result = await sendRideSubmission(draft(), api);
  assert.equal(result.row.state, 'queued'); assert.equal(result.verificationInterrupted, true);
  state.failVerify = false;
  assert.equal((await sendRideSubmission(draft(), api)).row.state, 'verified');
  assert.equal(state.calls.filter(v => v === 'upload').length, 1);
});

test('active verification lease and rejected result do not rerun the verifier', async () => {
  for (const patch of [
    { state: 'verifying', verification_started_at: new Date(epoch).toISOString(), verification_attempts: 1 },
    { state: 'rejected', rejection_reason: 'NO_ELIGIBLE_WINDOW' },
  ]) {
    const { state, api } = fakeServer(); state.row = serverRow(patch);
    const result = await sendRideSubmission(draft(), api, epoch + 10000);
    assert.equal(result.row.state, patch.state);
    assert.deepEqual(state.calls, ['read']);
  }
});

test('retry cannot rebind an existing submission to another audience or challenge', async () => {
  for (const patch of [{ visibility: 'community' }, { challenge_id: id }, { owner_id: id }, { evidence_path: 'unexpected' }]) {
    const { state, api } = fakeServer(); state.row = serverRow(patch);
    await assert.rejects(sendRideSubmission(draft(), api));
    assert.deepEqual(state.calls, ['read']);
  }
});

test('an account change between steps prevents the next write', async () => {
  const { state, api } = fakeServer(); const original = api.reserve;
  api.reserve = async value => { const result = await original(value); state.ownerCurrent = false; return result; };
  await assert.rejects(sendRideSubmission(draft(), api), /ACCOUNT_CHANGED/);
  assert.equal(state.calls.includes('upload'), false);
  assert.equal(state.calls.includes('queue'), false);
});
