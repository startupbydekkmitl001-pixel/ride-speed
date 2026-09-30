import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as journalModel from '../src/features/rides/journalModel.ts';
const require = createRequire(import.meta.url), ts = require('typescript');
const source = readFileSync(new URL('../src/features/rides/syncModel.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.compileFunction(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, ['require', 'module', 'exports'])(name => { if (name === './journalModel') return journalModel; throw Error(name); }, module, module.exports);
const { toRideSummary, sendRideSummary, validateRideSyncAck } = module.exports;

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const points = [{ latitude: 38.5, longitude: -120.2 }, { latitude: 40.7, longitude: -120.95 }, { latitude: 43.252, longitude: -126.453 }];
const vehicle = () => ({ id: 'local-vehicle', catalogId: null, category: 'bigbike', brand: 'Test', model: 'Test', year: '', variant: undefined, engineCc: 156.9, powertrain: null });
const ride = () => ({
  id: uuid(1), ownerId: uuid(2), startedAtMs: Date.parse('2026-10-01T01:00:00Z'), endedAtMs: Date.parse('2026-10-01T01:01:00Z'),
  status: 'complete', activeDurationMs: 60_000, clockAnomaly: false, vehicle: vehicle(),
  captures: [{ id: uuid(3), segmentId: uuid(4), provider: 'expo_location', count: 4, truncated: false, startedAtMs: Date.parse('2026-10-01T01:00:00Z'), endedAtMs: Date.parse('2026-10-01T01:01:00Z') }],
  rawCount: 4, acceptedCount: 3, rejectedCount: 1, distanceMeters: 100, maxMps: 10,
  fragments: [{ segmentId: uuid(4), captureId: uuid(3), partIndex: 0, points: structuredClone(points) }], revision: 0, sync: 'pending', operationId: uuid(5),
});
const draft = () => ({ operationId: uuid(5), rideId: uuid(1), expectedRevision: 0, payload: toRideSummary(ride(), 'android') });
const ack = (value = draft()) => ({ operation_id: value.operationId, ride_id: value.rideId, applied_revision: value.expectedRevision + 1, current_revision: value.expectedRevision + 1, payload_sha256: 'a'.repeat(64), speed_status: 'self_reported', visibility: 'private', synced_at: '2026-10-01T01:02:00.123456+00:00' });

test('new garage EV kW and diesel snapshots persist without rebuilding earlier summaries',()=>{
 const electric=ride();electric.vehicle={...electric.vehicle,category:'car',powertrain:'electric',engineCc:null,motorPowerKw:150,nickname:'Private name',photoPath:'private'};
 const captured=toRideSummary(electric,'android');assert.equal(captured.vehicle.motor_kw,150);assert.equal(captured.vehicle.engine_cc,null);assert.equal(Object.hasOwn(captured.vehicle,'photoPath'),false);assert.equal(Object.hasOwn(captured.vehicle,'nickname'),false);
 electric.vehicle.motorPowerKw=230;assert.equal(captured.vehicle.motor_kw,150);
 const diesel=ride();diesel.vehicle.powertrain='diesel';assert.equal(toRideSummary(diesel,'ios').vehicle.powertrain,'diesel');
});

function decode(polyline) {
  let cursor = 0, lat = 0, lon = 0;
  const result = [], integer = () => {
    let value = 0, shift = 0, part;
    do { part = polyline.charCodeAt(cursor++) - 63; value |= (part & 31) << shift; shift += 5; } while (part >= 32);
    return value & 1 ? ~(value >>> 1) : value >>> 1;
  };
  while (cursor < polyline.length) { lat += integer(); lon += integer(); result.push({ latitude: lat / 1e5, longitude: lon / 1e5 }); }
  return result;
}

test('finalized ride converts canonical units and a detached immutable vehicle snapshot without raw evidence', () => {
  const input = ride(), payload = toRideSummary(input, 'android');
  assert.equal(payload.max_speed_mps, 10);
  assert.equal(payload.average_speed_mps, 100 / 60);
  assert.equal(payload.active_duration_ms, 60_000);
  assert.equal(payload.elapsed_duration_ms, 60_000);
  assert.equal(payload.reported_provider, 'expo_android');
  assert.deepEqual(payload.vehicle, { local_id: 'local-vehicle', catalog_id: null, category: 'motorcycle', brand: 'Test', model: 'Test', variant: null, year: null, powertrain: 'unknown', engine_cc: 156.9, motor_kw: null });
  assert.equal(payload.geometry.fragments[0].polyline, '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(decode(payload.geometry.fragments[0].polyline), points);
  input.vehicle.brand = 'edited after stop'; input.fragments[0].points[0].latitude = 0; input.distanceMeters = 999;
  assert.equal(payload.vehicle.brand, 'Test'); assert.equal(payload.distance_m, 100);
  assert.equal(Object.isFrozen(payload), true); assert.equal(Object.isFrozen(payload.geometry.fragments), true);
  const text = JSON.stringify(payload);
  for (const key of ['rawCount', 'samples', 'timestampMs', 'horizontalAccuracyM', 'isSimulatedBySoftware', 'verified', 'ownerId', 'speed_status', 'visibility']) assert.equal(text.includes(`"${key}"`), false);
});

test('no accepted fixes and a single isolated point stay unavailable, while confirmed stationary pairs retain zero', () => {
  const empty = ride(); empty.acceptedCount = 0; empty.rejectedCount = 4; empty.fragments = []; empty.maxMps = null; empty.distanceMeters = 0;
  const absent = toRideSummary(empty, 'ios');
  assert.equal(absent.distance_m, null); assert.equal(absent.max_speed_mps, null); assert.equal(absent.average_speed_mps, null);
  assert.equal(absent.geometry_status, 'unavailable'); assert.deepEqual(absent.geometry.fragments, []);
  const single = ride(); single.acceptedCount = 1; single.fragments[0].points = [points[0]]; single.distanceMeters = 0; single.maxMps = null;
  assert.equal(toRideSummary(single, 'web').distance_m, null);
  const stationary = ride(); stationary.distanceMeters = 0; stationary.maxMps = 0;
  assert.equal(toRideSummary(stationary, 'android').average_speed_mps, 0);
});

test('separate captures and rejected-fix parts remain separate, with their own origin and provenance', () => {
  const input = ride(); input.acceptedCount = 5;
  input.captures.push({ ...input.captures[0], id: uuid(6), segmentId: uuid(7), provider: 'ios_core_location' });
  input.fragments.push({ segmentId: uuid(4), captureId: uuid(3), partIndex: 1, points: [points[2]] }, { segmentId: uuid(7), captureId: uuid(6), partIndex: 0, points: [points[0]] });
  const payload = toRideSummary(input, 'ios');
  assert.equal(payload.reported_provider, 'mixed'); assert.equal(payload.capture_count, 2);
  assert.equal(payload.geometry.fragments.length, 3);
  assert.deepEqual(payload.geometry.fragments.map(fragment => decode(fragment.polyline)), [points, [points[2]], [points[0]]]);
});

test('long accepted paths simplify deterministically without losing a single boundary or either endpoint', () => {
  const input = ride(), long = Array.from({ length: 6000 }, (_, i) => ({ latitude: 13 + i / 100000, longitude: 100 + i / 100000 }));
  input.acceptedCount = 12_001; input.rawCount = 12_001; input.rejectedCount = 0;
  input.fragments = [
    { segmentId: uuid(4), captureId: uuid(3), partIndex: 0, points: long },
    { segmentId: uuid(4), captureId: uuid(3), partIndex: 1, points: [points[0]] },
    { segmentId: uuid(4), captureId: uuid(3), partIndex: 2, points: long.map(p => ({ latitude: p.latitude + 1, longitude: p.longitude + 1 })) },
  ];
  const payload = toRideSummary(input, 'android'), again = toRideSummary(input, 'android');
  assert.equal(payload.geometry_status, 'simplified'); assert.deepEqual(again, payload);
  assert.equal(payload.geometry.fragments.reduce((n, f) => n + f.point_count, 0), 4096);
  assert.equal(payload.geometry.fragments.length, 3);
  for (let i = 0; i < 3; i++) {
    const actual = decode(payload.geometry.fragments[i].polyline), original = input.fragments[i].points;
    assert.deepEqual(actual[0], original[0]); assert.deepEqual(actual.at(-1), original.at(-1));
  }
  assert.equal(payload.geometry.fragments.reduce((n, f) => n + f.polyline.length, 0) <= 65536, true);
});

test('the UTC clock can go backwards without inventing elapsed time or changing the observed timestamps', () => {
  const input = ride(); input.clockAnomaly = true; input.endedAtMs = input.startedAtMs - 60_000;
  const payload = toRideSummary(input, 'android');
  assert.equal(payload.started_at, '2026-10-01T01:00:00.000Z'); assert.equal(payload.ended_at, '2026-10-01T00:59:00.000Z');
  assert.equal(payload.active_duration_ms, 60_000); assert.equal(payload.elapsed_duration_ms, null); assert.equal(payload.clock_anomaly, true);
});

test('unfinalized rides, unsupported metadata, corrupt points and too many parts never become a pending request', () => {
  const variants = [
    value => { value.status = 'recording'; }, value => { value.endedAtMs = null; }, value => { value.maxMps = Infinity; },
    value => { value.fragments[0].points[0].latitude = 91; }, value => { value.fragments[0].captureId = uuid(99); },
    value => { value.fragments.push({ ...value.fragments[0] }); }, value => { value.captures = []; },
  ];
  for (const change of variants) { const input = ride(); change(input); assert.throws(() => toRideSummary(input, 'android'), /RIDE_SUMMARY_INVALID/); }
  const input = ride(); input.acceptedCount = 129; input.fragments = Array.from({ length: 129 }, (_, partIndex) => ({ ...input.fragments[0], partIndex, points: [points[0]] }));
  assert.throws(() => toRideSummary(input, 'android'), /RIDE_SUMMARY_TOO_LARGE/);
});

test('acknowledgements must match the exact operation, ride and applied revision, remain private and self-reported', () => {
  const value = draft(); assert.deepEqual(validateRideSyncAck(ack(value), value), ack(value));
  assert.equal(validateRideSyncAck({ ...ack(value), current_revision: 3 }, value).current_revision, 3);
  for (const patch of [ { operation_id: uuid(99) }, { ride_id: uuid(99) }, { applied_revision: 2 }, { current_revision: 0 }, { current_revision: 2147483648 }, { operation_id: 1 }, { speed_status: 'verified' }, { visibility: 'public' }, { payload_sha256: 'client hash' }, { synced_at: 'tomorrow' } ]) {
    assert.throws(() => validateRideSyncAck({ ...ack(value), ...patch }, value), /RIDE_SYNC_INVALID_RESPONSE/);
  }
});

test('a lost RPC response recovers its existing receipt without changing or resending the operation', async () => {
  const value = draft(), events = [];
  const result = await sendRideSummary(value, { async send(input) { events.push(['send', input]); throw Error('network lost'); }, async status(id) { events.push(['status', id]); return ack(value); } }, () => {});
  assert.deepEqual(result, ack(value)); assert.equal(events.length, 2); assert.equal(events[0][1], value); assert.deepEqual(events[1], ['status', value.operationId]);
  await assert.rejects(sendRideSummary(value, { async send() { throw Error('network lost'); }, async status() { return null; } }, () => {}), /network lost/);
});

test('owner/generation changes reject completion and prevent status recovery from a different login', async () => {
  const value = draft(); let current = true, statusCalls = 0;
  const api = { async send() { current = false; return ack(value); }, async status() { statusCalls++; return ack(value); } };
  await assert.rejects(sendRideSummary(value, api, () => { if (!current) throw Error('ACCOUNT_CHANGED'); }), /ACCOUNT_CHANGED/);
  assert.equal(statusCalls, 0);
});

test('server conflicts and invalid responses retain the immutable request and never attempt receipt recovery', async () => {
  const value = draft(); let calls = 0;
  for (const code of ['RIDE_OPERATION_CONFLICT', 'RIDE_REVISION_CONFLICT', 'RIDE_SNAPSHOT_CONFLICT', 'ACCOUNT_DELETION_PENDING']) {
    await assert.rejects(sendRideSummary(value, { async send() { throw Error(code); }, async status() { calls++; return null; } }, () => {}), new RegExp(code));
  }
  await assert.rejects(sendRideSummary(value, { async send() { return { ...ack(value), ride_id: uuid(99) }; }, async status() { calls++; return ack(value); } }, () => {}), /RIDE_SYNC_INVALID_RESPONSE/);
  assert.equal(calls, 0);
});

function serviceHarness(respond) {
  const sdk = require('@supabase/supabase-js'), requests = [];
  const scope = { userId: uuid(2), generation: 1 }, session = { user: { id: uuid(2) }, access_token: 'test-fixed-owner-A' };
  let current = scope;
  const client = sdk.createClient('https://configured.test', 'test-publishable', { accessToken: async () => session.access_token, global: { fetch: async (input, init) => {
    const request = { path: new URL(typeof input === 'string' ? input : input.url).pathname, token: new Headers(init?.headers).get('Authorization'), body: JSON.parse(init.body) };
    requests.push(request);
    const result = await respond(request, requests.length);
    return new Response(JSON.stringify(result.body), { status: result.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  } } });
  const auth = { accountClient: () => client, isAccountCurrent: value => value === current };
  const serviceSource = readFileSync(new URL('../src/features/rides/syncService.ts', import.meta.url), 'utf8'), compiled = { exports: {} };
  vm.compileFunction(ts.transpileModule(serviceSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, ['require', 'module', 'exports'])(name => {
    if (name === '../../state/AuthState') return auth;
    if (name === './syncModel') return module.exports;
    throw Error(name);
  }, compiled, compiled.exports);
  return { api: compiled.exports, requests, scope, session, switchAccount() { current = { userId: uuid(2), generation: 3 }; } };
}

test('actual SDK summary transport sends only bounded summary RPCs with the initiating JWT', async () => {
  const value = draft(), h = serviceHarness(() => ({ body: ack(value) }));
  assert.deepEqual(await h.api.syncRideSummary(h.scope, h.session, value), ack(value));
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].path, '/rest/v1/rpc/rs_sync_ride_summary');
  assert.equal(h.requests[0].token, 'Bearer test-fixed-owner-A');
  assert.deepEqual(h.requests[0].body, { p_operation: value.operationId, p_ride: value.rideId, p_expected_revision: 0, p_payload: value.payload });
  for (const payload of [{ ...value.payload, samples: [{ latitude: 13, longitude: 100 }] }, { ...value.payload, geometry: { ...value.payload.geometry, fragments: [{ ...value.payload.geometry.fragments[0], accuracy: [4, 5] }] } }]) {
    await assert.rejects(h.api.syncRideSummary(h.scope, h.session, { ...value, payload }), /RIDE_SUMMARY_INVALID/);
  }
  assert.equal(h.requests.length, 1);
});

test('actual SDK response-loss recovery reads only that immutable operation; backend conflicts are stable', async () => {
  const value = draft(), h = serviceHarness((request, n) => n === 1 ? { status: 503, body: { message: 'internal detail must not reach UI' } } : { body: ack(value) });
  assert.deepEqual(await h.api.syncRideSummary(h.scope, h.session, value), ack(value));
  assert.deepEqual(h.requests.map(r => r.path), ['/rest/v1/rpc/rs_sync_ride_summary', '/rest/v1/rpc/rs_get_ride_sync_status']);
  assert.deepEqual(h.requests[1].body, { p_operation: value.operationId });
  const conflict = serviceHarness(() => ({ status: 400, body: { code: 'P0001', message: 'RIDE_OPERATION_CONFLICT' } }));
  await assert.rejects(conflict.api.syncRideSummary(conflict.scope, conflict.session, value), /RIDE_OPERATION_CONFLICT/);
  assert.equal(conflict.requests.length, 1);
});

test('actual SDK completion is discarded after A→B→A even with the original token still valid', async () => {
  const value = draft(); let enter, resolve;
  const entered = new Promise(r => { enter = r; }), held = new Promise(r => { resolve = r; });
  const h = serviceHarness(async () => { enter(); return held; });
  const pending = h.api.syncRideSummary(h.scope, h.session, value);
  await entered; h.switchAccount(); resolve({ body: ack(value) });
  await assert.rejects(pending, /ACCOUNT_CHANGED/);
  assert.equal(h.requests.length, 1);
  await assert.rejects(h.api.syncRideSummary(h.scope, h.session, value), /ACCOUNT_CHANGED/);
  assert.equal(h.requests.length, 1);
});

test('owner cloud history has bounded exact cursors and cannot masquerade as verified evidence', async () => {
  const value = draft(), row = { ride_id: value.rideId, revision: 1, payload: value.payload, category: 'motorcycle', class_key: 'motorcycle:le500', class_scheme_version: 1, metadata_authority: 'self_reported', speed_status: 'self_reported', visibility: 'private', created_at: '2026-10-01T01:02:00+00:00', updated_at: '2026-10-01T01:02:00+00:00' };
  const cursor = { ended_at: value.payload.ended_at, ride_id: value.rideId }, h = serviceHarness(() => ({ body: { items: [row], next_cursor: cursor } }));
  assert.deepEqual(await h.api.listRideSummaries(h.scope, h.session, { limit: 1 }), { items: [row], next_cursor: cursor });
  assert.deepEqual(h.requests[0].body, { p_limit: 1, p_before_end: null, p_before_id: null });
  await h.api.listRideSummaries(h.scope, h.session, { limit: 1, cursor });
  assert.deepEqual(h.requests[1].body, { p_limit: 1, p_before_end: cursor.ended_at, p_before_id: cursor.ride_id });
  await assert.rejects(h.api.listRideSummaries(h.scope, h.session, { limit: 51 }), /RIDE_SUMMARY_INVALID/);
  const forged = serviceHarness(() => ({ body: { items: [{ ...row, speed_status: 'verified' }], next_cursor: null } }));
  await assert.rejects(forged.api.listRideSummaries(forged.scope, forged.session), /RIDE_SYNC_INVALID_RESPONSE/);
});
