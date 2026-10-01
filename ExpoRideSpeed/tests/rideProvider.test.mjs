import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import * as journalModel from '../src/features/rides/journalModel.ts';
import { DurableRideQueue } from '../src/features/rides/DurableRideQueue.ts';
import { ExclusiveLocationCapture } from '../modules/ride-location/src/sessionSupport.ts';

const require = createRequire(import.meta.url), ts = require('typescript');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const syncSource = readFileSync(new URL('../src/features/rides/syncModel.ts', import.meta.url), 'utf8');
const syncModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(syncSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  require: name => { if (name === './journalModel') return journalModel; throw Error(name); }, module: syncModule, exports: syncModule.exports, Date,
});
const errorModule = { exports: {} };
const socialErrors = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/i18n/m5a.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module:socialErrors, exports:socialErrors.exports });
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/i18n/errors.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: errorModule, exports: errorModule.exports, require:name=>{if(name==='./m5a')return socialErrors.exports;throw Error(name);} });

/** Executes the real provider and journal model. Only React, platform capture and disk are ports. */
function harness({ stored = [], scopeId = 'A', signedIn = false } = {}) {
  const cells = [], effects = [], layouts = [], timers = new Map(), rows = new Map(stored.map(ride => [ride.id, copy(ride)])), receipts = new Map();
  let index = 0, dirty = false, observer, timerId = 0, generation = 0;
  let scope = { userId: scopeId, generation: 1 };
  let session = signedIn ? { user: { id: scopeId }, access_token: `test-only-${scopeId}` } : null;
  const behavior = { now: 1700000000000, mono: 0, failWrites: false, failStart: false, pendingWrite: null, pendingStop: null, pendingStart: null, pendingList: null, pendingLocatePermission: null, pendingSync: new Map(), syncFailure: new Map(), pendingCloud: new Map(), starts: 0, stops: 0, idleStarts: 0, idleStops: 0, saves: [], lists: [], syncCalls: [], cloudCalls: [], active: false };
  const idleCapture = new ExclusiveLocationCapture();
  const emptySnapshot = { liveMps: null, maxMps: null, quality: 'noFix', horizontalAccuracyM: null };
  let snapshot = { ...emptySnapshot }, captureId = null, evidenceSamples = [];
  class Clock extends Date { static now() { return behavior.now; } }
  const React = {
    createContext(value) { const context = { value }; context.Provider = { context }; return context; },
    useContext(context) { return context.value; },
    createElement(type, props, ...children) { if (type?.context) type.context.value = props.value; return { type, props, children }; },
    useState(value) { const i = index++; if (!(i in cells)) cells[i] = typeof value === 'function' ? value() : value; return [cells[i], update => { cells[i] = typeof update === 'function' ? update(cells[i]) : update; dirty = true; }]; },
    useRef(value) { const i = index++; if (!(i in cells)) cells[i] = { current: value }; return cells[i]; },
    useCallback(fn, deps) { const i = index++, previous = cells[i]; if (!previous || deps.some((v, j) => v !== previous.deps[j])) cells[i] = { deps, fn }; return cells[i].fn; },
    useEffect(fn, deps = []) { enqueueEffect(effects, fn, deps); },
    useLayoutEffect(fn, deps = []) { enqueueEffect(layouts, fn, deps); },
  };
  function enqueueEffect(queue, fn, deps) {
    const i = index++, previous = cells[i];
    if (!previous || deps.some((v, j) => v !== previous.deps[j])) {
      previous?.cleanup?.(); cells[i] = { deps };
      queue.push(() => { cells[i].cleanup = fn(); });
    }
  }
  const stopCapture = (message = null) => { generation++; behavior.active = false; behavior.stops++; observer?.onStopped?.(message); snapshot = { ...emptySnapshot, maxMps: snapshot.maxMps }; dirty = true; };
  const capture = {
    async start() { const begun = ++generation; behavior.starts++; if (behavior.pendingStart) await behavior.pendingStart.promise; if (begun !== generation || behavior.failStart) return null; observer?.onAcquired?.(true); behavior.active = true; snapshot = { ...emptySnapshot }; evidenceSamples = []; captureId = randomUUID(); dirty = true; return captureId; },
    stop: stopCapture,
    async stopAsync() { stopCapture(); if (behavior.pendingStop) await behavior.pendingStop.promise; },
    resetMax() { snapshot = { ...snapshot, maxMps: null }; dirty = true; },
    getEvidence: () => ({ sessionId: captureId, samples: copy(evidenceSamples), nativeSource: captureId !== null, truncated: false }),
  };
  const port = {
    async save(ride, receipt) {
      if (behavior.pendingWrite) await behavior.pendingWrite.promise;
      if (behavior.failWrites) throw Error('TEST_DISK_UNAVAILABLE');
      behavior.saves.push({ ride: copy(ride), receipt: receipt ? copy(receipt) : null });
      rows.set(ride.id, copy(journalModel.persistedRide(ride)));
      if (receipt) { const existing = receipts.get(ride.id) ?? []; if (!existing.some(row => row.seq === receipt.seq)) existing.push(copy(receipt)); receipts.set(ride.id, existing); }
    },
    async list(owner) {
      behavior.lists.push(owner); if (behavior.pendingList?.owner === owner) await behavior.pendingList.promise;
      return [...rows.values()].filter(row => row.ownerId === owner).map(row => { const ride = copy(row); if (ride.status === 'recording') journalModel.restoreFragments(ride, receipts.get(ride.id) ?? []); return ride; }).sort((a, b) => b.startedAtMs - a.startedAtMs);
    },
    async removeOwner(owner) { for (const [id, ride] of rows) if (ride.ownerId === owner) { rows.delete(id); receipts.delete(id); } },
  };
  const imports = {
    react: React, 'expo-location': {
      getForegroundPermissionsAsync: async () => behavior.pendingLocatePermission ? behavior.pendingLocatePermission.promise : ({ granted: false }),
      Accuracy: { High: 4 },
      async watchPositionAsync(options, accept) { behavior.idleStarts++; accept({ timestamp: behavior.now, coords: { latitude: 13, longitude: 100, accuracy: 5, heading: null } }); return { remove() { behavior.idleStops++; } }; },
    },
    'expo-crypto': { randomUUID }, 'react-native': { Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }, 'expo-keep-awake': { useKeepAwake() {} },
    '../../modules/ride-location': { default: {}, __esModule: true },
    '../useRideSession': { useRideSession(nextObserver) { observer = nextObserver; return { ...capture, active: behavior.active, snapshot, permissionState: 'ready', message: null, nativeSource: captureId !== null, sessionId: captureId }; }, locationCapture: idleCapture },
    './AppState': { useApp: () => ({ vehicle: null }) },
    './AuthState': { useAuth: () => ({ scope, ready: true, session }), isAccountCurrent: candidate => candidate === scope },
    '../features/rides/DurableRideQueue': { DurableRideQueue }, '../features/rides/journalPort': { journalPort: port }, '../features/rides/journalModel': journalModel,
    '../features/rides/syncModel': syncModule.exports,
    '../lib/i18n': errorModule.exports,
    '../features/rides/syncService': {
      async syncRideSummary(requested, auth, draft) {
        assert.ok(signedIn, 'No transport may run without a session'); assert.equal(auth.user.id, requested.userId);
        behavior.syncCalls.push({ scope: requested, draft: copy(draft), token: auth.access_token });
        if (behavior.syncFailure.has(requested.userId)) throw behavior.syncFailure.get(requested.userId);
        if (behavior.pendingSync.has(requested.userId)) return behavior.pendingSync.get(requested.userId).promise;
        return { operation_id: draft.operationId, ride_id: draft.rideId, applied_revision: draft.expectedRevision + 1 };
      },
      async listRideSummaries(requested, auth, options) {
        assert.ok(signedIn, 'No transport may run without a session'); assert.equal(auth.user.id, requested.userId);
        behavior.cloudCalls.push({ scope: requested, options });
        if (behavior.pendingCloud.has(requested.userId)) return behavior.pendingCloud.get(requested.userId).promise;
        return { items: [], next_cursor: null };
      },
    },
  };
  const source = readFileSync(new URL('../src/state/RideState.tsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    require: name => { if (!(name in imports)) throw Error(`Unexpected provider import: ${name}`); return imports[name]; },
    module, exports: module.exports, Date: Clock, Promise, Error, Symbol, Number,
    performance: { now: () => behavior.mono },
    setInterval: fn => { timers.set(++timerId, fn); return timerId; }, clearInterval: id => timers.delete(id), setTimeout, clearTimeout,
  });
  const h = {
    behavior, rows, receipts,
    get scope() { return scope; },
    clearAccount(ownerScope = scope) { return module.exports.clearRideAccount(ownerScope); },
    render() { index = 0; dirty = false; module.exports.RideProvider({ children: null }); while (layouts.length) layouts.shift()(); while (effects.length) effects.shift()(); return module.exports.useRide(); },
    async settle() { for (let n = 0; n < 12; n++) { await tick(); if (dirty) h.render(); } return h.render(); },
    switchAccount(id) { scope = { userId: id, generation: scope.generation + 1 }; session = signedIn ? { user: { id }, access_token: `test-only-${id}` } : null; return h.render(); },
    sample(extra = {}) { behavior.now += 1000; behavior.mono += 1000; const sample = { timestampMs: behavior.now, latitude: 13, longitude: 100 + behavior.mono / 10000000, speedMps: 10, horizontalAccuracyM: 5, speedAccuracyMps: .2, isSimulatedBySoftware: false, isProducedByAccessory: false, mocked: null, ...extra }; evidenceSamples.push(copy(sample)); observer?.onSample?.(sample, true); return sample; },
    confirmedSpeed(value) { snapshot = { ...emptySnapshot, quality: 'good', liveMps: value, maxMps: value }; observer?.onSnapshot?.(snapshot); dirty = true; },
    signalLost() { snapshot = { ...emptySnapshot, maxMps: snapshot.maxMps }; observer?.onSnapshot?.(snapshot); dirty = true; },
    fatalStop() { stopCapture('TEST_FATAL_GPS'); },
    timer() { for (const fn of timers.values()) fn(); },
  };
  h.render(); return h;
}

test('restored recording is interrupted without fabricated samples, fixes or elapsed time', async () => {
  const stored = journalModel.createRide('interrupted', 'A', 1700000000000, null);
  stored.status = 'recording'; stored.activeDurationMs = 3500;
  stored.captures = [{ id: 'old', segmentId: 'old-segment', provider: 'ios_core_location', count: 0, truncated: false, startedAtMs: stored.startedAtMs, endedAtMs: null }];
  const h = harness({ stored: [stored] }), ride = await h.settle();
  assert.equal(ride.ready, true); assert.equal(ride.ride.status, 'interrupted'); assert.equal(ride.metrics.durationSeconds, 3.5);
  assert.equal(ride.userFix, null); assert.equal(ride.snapshot.liveMps, null); assert.equal(ride.ride.rawCount, 0);
  assert.deepEqual(ride.ride.fragments, []); assert.equal(h.behavior.starts, 0);
});

test('raw invalid fixes are journaled privately while visible geometry contains only accepted samples', async () => {
  const h = harness(); let ride = await h.settle(); assert.ok(await ride.start()); await h.settle();
  const first = h.sample(); h.sample({ mocked: true, latitude: 55 }); const last = h.sample(); ride = await h.settle();
  assert.equal(ride.ride.rawCount, 3); assert.equal(ride.ride.acceptedCount, 2); assert.equal(ride.ride.rejectedCount, 1);
  assert.equal(ride.ride.fragments.length, 2); assert.equal(ride.metrics.distanceMeters, 0);
  assert.deepEqual(copy(ride.ride.fragments.map(part => part.points)), [[{ latitude: first.latitude, longitude: first.longitude }], [{ latitude: last.latitude, longitude: last.longitude }]]);
  assert.equal(h.receipts.get(ride.ride.id).length, 3); assert.equal(ride.userFix.coordinate.latitude, last.latitude);
  await ride.pause(); await h.settle();
});

test('retained pause and finish from A cannot stop an active B ride', async () => {
  const h = harness(); const old = await h.settle(); assert.ok(await old.start()); await h.settle();
  h.switchAccount('B'); const next = await h.settle(); assert.ok(await next.start()); const running = await h.settle();
  const stops = h.behavior.stops; await old.pause(); await old.finish(); const current = await h.settle();
  assert.equal(h.behavior.stops, stops); assert.equal(current.active, true); assert.equal(current.ride.ownerId, 'B');
  assert.equal(current.ride.id, running.ride.id); assert.equal(current.ride.status, 'recording');
  await current.pause(); await h.settle();
});

test('account switch waits for old provider stop before B becomes writable', async () => {
  const h = harness(); const old = await h.settle(); assert.ok(await old.start()); await h.settle();
  const blocked = deferred(); h.behavior.pendingStop = blocked;
  const immediate = h.switchAccount('B'); assert.equal(immediate.ready, false); assert.equal(immediate.ride, null); assert.equal(immediate.userFix, null);
  const starting = immediate.start(); assert.equal(await starting, null); assert.equal(h.behavior.starts, 1);
  blocked.resolve(); h.behavior.pendingStop = null; const next = await h.settle(); assert.equal(next.ready, true);
  assert.ok(await next.start()); const running = await h.settle(); assert.equal(running.ride.ownerId, 'B');
  await running.pause(); await h.settle();
});

test('failed durable start cannot leave a resumable ride logically recording without a provider', async () => {
  const h = harness(); const initial = await h.settle(); h.behavior.failWrites = true;
  assert.equal(await initial.start(), null); let ride = await h.settle(); assert.equal(ride.active, false);
  h.behavior.failWrites = false; await ride.retrySave(); ride = await h.settle();
  assert.notEqual(ride.ride?.status, 'recording'); assert.equal(ride.error, null);
  assert.ok(await ride.resume()); const resumed = await h.settle(); assert.equal(resumed.active, true);
  await resumed.pause(); await h.settle();
});

test('stale A hydration finishing after B cannot clear B current journal', async () => {
  const blocked = deferred(), h = harness(); h.behavior.pendingList = { owner: 'A', ...blocked };
  await tick(); h.switchAccount('B'); const next = await h.settle(); assert.equal(next.ready, true);
  assert.ok(await next.start()); let ride = await h.settle(); const id = ride.ride.id;
  blocked.resolve(); h.behavior.pendingList = null; ride = await h.settle();
  assert.equal(ride.ride.id, id); assert.equal(ride.ride.ownerId, 'B'); assert.equal(ride.active, true);
  h.sample(); ride = await h.settle(); assert.equal(ride.ride.rawCount, 1);
  await ride.pause(); await h.settle();
});

test('a confirmed peak is durable when pause occurs before the next elapsed-time tick', async () => {
  const h = harness(); let ride = await h.settle(); assert.ok(await ride.start()); await h.settle();
  h.confirmedSpeed(22); ride = await h.settle(); await ride.pause(); ride = await h.settle();
  assert.equal(ride.ride.maxMps, 22); assert.equal(h.rows.get(ride.ride.id).maxMps, 22);
  assert.ok(await ride.resume()); await h.settle(); h.confirmedSpeed(8); ride = await h.settle();
  assert.equal(ride.snapshot.maxMps, 22); await ride.pause(); await h.settle();
});

test('a new account never sees the previous account peak while idle', async () => {
  const h = harness(); let ride = await h.settle(); assert.ok(await ride.start()); await h.settle();
  h.confirmedSpeed(22); ride = await h.settle(); await ride.pause(); await h.settle();
  h.switchAccount('B'); const next = await h.settle();
  assert.equal(next.ready, true); assert.equal(next.ride, null); assert.equal(next.snapshot.maxMps, null);
  assert.equal(next.sessionId, null); assert.equal(next.getEvidence().sessionId, null);
});

test('a stalled journal applies backpressure and keeps one final paused checkpoint after its raw receipts', async () => {
  const h = harness(); let ride = await h.settle(); assert.ok(await ride.start()); await h.settle();
  const blocked = deferred(); h.behavior.pendingWrite = blocked;
  for (let n = 0; n < 140 && h.behavior.active; n++) h.sample();
  ride = h.render(); assert.equal(ride.active, false); assert.equal(ride.ride.status, 'paused');
  assert.equal(ride.error, 'm2.ride.captureLimit'); assert.ok(ride.ride.rawCount <= 128);
  assert.equal(ride.getEvidence().truncated, true);
  const id = ride.ride.id, count = ride.ride.rawCount;
  blocked.resolve(); h.behavior.pendingWrite = null; await h.settle();
  assert.equal(h.rows.get(id).status, 'paused'); assert.equal(h.rows.get(id).rawCount, count);
  assert.equal(h.receipts.get(id).length, count); assert.equal(h.behavior.saves.at(-1).receipt, null);
});

test('waiting for permission/provider acquisition is excluded from active ride duration', async () => {
  const h = harness(); let ride = await h.settle(); const blocked = deferred(); h.behavior.pendingStart = blocked;
  const starting = ride.start(); await tick(); await tick();
  h.behavior.mono += 60000; h.behavior.now += 60000;
  assert.equal(h.behavior.active, false); blocked.resolve(); h.behavior.pendingStart = null;
  assert.ok(await starting); ride = await h.settle(); assert.equal(ride.metrics.durationSeconds, 0);
  h.sample(); ride = await h.settle(); assert.equal(ride.metrics.durationSeconds, 1);
  await ride.pause(); await h.settle();
});

test('unknown or expired GPS cannot silently unlock typing after a confirmed moving fix', async () => {
  const h = harness(); let ride = await h.settle(); assert.ok(await ride.start()); await h.settle();
  h.confirmedSpeed(8); ride = await h.settle(); assert.equal(ride.movingLocked, true);
  h.signalLost(); ride = await h.settle(); assert.equal(ride.snapshot.liveMps, null); assert.equal(ride.movingLocked, true);
  h.confirmedSpeed(0); ride = await h.settle(); assert.equal(ride.movingLocked, false);
  await ride.pause(); await h.settle();
});

test('a fragmented ride still finishes durably when its summary cannot fit the cloud limit', async () => {
  const stored = journalModel.createRide(randomUUID(), 'A', 1699999000000, null), captureId = randomUUID(), segmentId = randomUUID();
  stored.activeDurationMs = 515000; stored.rawCount = 386; stored.acceptedCount = 258; stored.rejectedCount = 128;
  stored.captures = [{ id: captureId, segmentId, provider: 'ios_core_location', count: 386, truncated: false, startedAtMs: stored.startedAtMs, endedAtMs: 1699999515000 }];
  stored.fragments = Array.from({ length: 129 }, (_, partIndex) => ({ captureId, segmentId, partIndex, points: [{ latitude: 13, longitude: 100 + partIndex / 1000 }, { latitude: 13, longitude: 100 + partIndex / 1000 + .0001 }] }));
  const h = harness({ stored: [stored] }); let ride = await h.settle(); await ride.finish(); ride = await h.settle();
  assert.equal(h.rows.get(stored.id).status, 'complete'); assert.equal(h.rows.get(stored.id).fragments.length, 129);
  assert.equal(h.rows.get(stored.id).sync, 'local'); assert.equal(h.rows.get(stored.id).syncError, 'm2.sync.tooLarge');
  assert.equal(ride.error, null);
  assert.equal(ride.ride.status, 'complete'); assert.equal(ride.history.find(row => row.id === stored.id)?.status, 'complete');
});

const pendingSummary = owner => {
  const ride = journalModel.createRide(randomUUID(), owner, 1699999000000, null);
  ride.status = 'complete'; ride.endedAtMs = 1699999001000; ride.activeDurationMs = 1000;
  ride.captures = [{ id: randomUUID(), segmentId: randomUUID(), provider: 'ios_core_location', count: 0, truncated: false, startedAtMs: ride.startedAtMs, endedAtMs: ride.endedAtMs }];
  ride.sync = 'pending'; ride.operationId = randomUUID(); ride.summary = copy(syncModule.exports.toRideSummary(ride, 'ios'));
  return ride;
};

test('late A sync/cloud responses cannot stop B outbox or replace B cloud history', async () => {
  const a = pendingSummary('A'), b = pendingSummary('B'), oldAck = deferred(), newAck = deferred(), oldCloud = deferred();
  const h = harness({ stored: [a, b], signedIn: true });
  h.behavior.pendingSync.set('A', oldAck); h.behavior.pendingSync.set('B', newAck); h.behavior.pendingCloud.set('A', oldCloud);
  let ride = await h.settle(); assert.equal(ride.syncing, true); assert.equal(h.behavior.syncCalls[0].scope.userId, 'A');
  h.switchAccount('B'); ride = await h.settle(); assert.equal(ride.syncing, true); assert.equal(h.behavior.syncCalls.at(-1).scope.userId, 'B');
  oldAck.resolve({ operation_id: a.operationId, ride_id: a.id, applied_revision: 1 });
  oldCloud.resolve({ items: [{ ride_id: a.id }], next_cursor: null }); ride = await h.settle();
  assert.equal(ride.syncing, true); assert.deepEqual(copy(ride.cloudHistory), []); assert.equal(h.rows.get(a.id).sync, 'pending');
  newAck.resolve({ operation_id: b.operationId, ride_id: b.id, applied_revision: 1 }); ride = await h.settle();
  assert.equal(ride.syncing, false); assert.equal(h.rows.get(b.id).sync, 'synced'); assert.equal(h.rows.get(b.id).revision, 1);
  assert.equal(ride.history.length, 1); assert.equal(ride.history[0].ownerId, 'B'); assert.equal(ride.history[0].id, b.id);
});

test('a failed new ride attempt cannot borrow the previous same-account capture evidence', async () => {
  const h = harness(); let ride = await h.settle(); const originalId = await ride.start(); assert.ok(originalId);
  await h.settle(); h.sample(); h.confirmedSpeed(8); ride = await h.settle(); await ride.finish(); ride = await h.settle();
  const originalRideId = ride.ride.id; assert.equal(ride.getEvidence().sessionId, originalId);
  h.behavior.failStart = true; assert.equal(await ride.start(), null); const attempted = await h.settle();
  assert.notEqual(attempted.ride.id, originalRideId); assert.equal(attempted.sessionId, null); assert.equal(attempted.nativeSource, false);
  assert.equal(attempted.snapshot.maxMps, null); assert.equal(attempted.getEvidence().sessionId, null); assert.deepEqual(copy(attempted.getEvidence().samples), []);
});

test('an old account location request cannot leave the new account recenter button busy', async () => {
  const h = harness(); const old = await h.settle(), permission = deferred(); h.behavior.pendingLocatePermission = permission;
  const locating = old.locate(); await tick(); assert.equal(h.render().locating, true);
  h.switchAccount('B'); let next = await h.settle(); assert.equal(next.ready, true); assert.equal(next.locating, false);
  permission.resolve({ granted: false }); h.behavior.pendingLocatePermission = null; await locating; next = await h.settle();
  assert.equal(next.locating, false); await old.locate(); assert.equal((await h.settle()).locating, false);
});

test('a transport failure stays pending with localized error and waits for the scheduled or explicit retry', async () => {
  const stored = pendingSummary('A'), h = harness({ stored: [stored], signedIn: true });
  h.behavior.syncFailure.set('A', Error('RIDE_SYNC_RATE_LIMITED')); const ride = await h.settle();
  assert.equal(h.rows.get(stored.id).sync, 'pending'); assert.equal(h.rows.get(stored.id).syncError, 'm2.sync.rateLimited');
  assert.equal(ride.history[0].syncError, 'm2.sync.rateLimited'); assert.equal(ride.syncing, false);
  assert.equal(h.behavior.syncCalls.length, 1, 'History publication must not immediately retry its failed operation');
  h.timer(); const scheduled = await h.settle();
  assert.equal(h.behavior.syncCalls.length, 2, 'The scheduled retry makes exactly one additional attempt');
  assert.equal(scheduled.history[0].syncError, 'm2.sync.rateLimited');
  h.behavior.syncFailure.clear(); scheduled.retrySync(); const recovered = await h.settle();
  assert.equal(h.rows.get(stored.id).sync, 'synced'); assert.equal(recovered.history[0].syncError, undefined);
  assert.equal(h.behavior.syncCalls.length, 3, 'Explicit retry makes exactly one attempt after recovery');
  for (const call of h.behavior.syncCalls) { assert.equal(call.draft.operationId, stored.operationId); assert.deepEqual(call.draft.payload, copy(stored.summary)); }
});

test('an old account sync cannot leave a new account with no pending rides marked syncing', async () => {
  const stored = pendingSummary('A'), blocked = deferred(), h = harness({ stored: [stored], signedIn: true });
  h.behavior.pendingSync.set('A', blocked); assert.equal((await h.settle()).syncing, true);
  h.switchAccount('B'); let next = await h.settle(); assert.equal(next.ready, true); assert.equal(next.history.length, 0); assert.equal(next.syncing, false);
  blocked.resolve({ operation_id: stored.operationId, ride_id: stored.id, applied_revision: 1 }); next = await h.settle();
  assert.equal(next.syncing, false); assert.equal(next.history.length, 0);
});

test('confirmed deletion fences retained capture actions and proof before sign-out while another account stays usable', async () => {
  const h = harness({ signedIn: true }); let old = await h.settle(); assert.ok(await old.start()); await h.settle(); h.sample(); old = await h.settle();
  assert.equal(old.getEvidence().samples.length, 1); const ownerA = h.scope;
  await h.clearAccount(); let deleted = await h.settle();
  assert.equal(deleted.ready, false); assert.equal(deleted.active, false); assert.equal(deleted.ride, null); assert.deepEqual(copy(deleted.history), []); assert.equal(deleted.userFix, null);
  const starts = h.behavior.starts, idleStarts = h.behavior.idleStarts, saves = h.behavior.saves.length;
  assert.equal(await old.start(), null); await old.locate(); await old.finish(); deleted = await h.settle();
  assert.equal(h.behavior.starts, starts); assert.equal(h.behavior.idleStarts, idleStarts); assert.equal(h.behavior.saves.length, saves); assert.equal(h.rows.size, 0);
  assert.equal(deleted.getEvidence().sessionId, null); assert.deepEqual(copy(deleted.getEvidence().samples), []);
  h.switchAccount('B'); let next = await h.settle(); assert.equal(next.ready, true); assert.ok(await next.start()); next = await h.settle(); const stops = h.behavior.stops;
  await h.clearAccount(ownerA); await old.pause(); next = await h.settle();
  assert.equal(next.active, true); assert.equal(next.ride.ownerId, 'B'); assert.equal(h.behavior.stops, stops);
  h.sample(); next = await h.settle(); assert.equal(h.rows.get(next.ride.id).ownerId, 'B'); await next.pause();
});

test('deletion during a stalled start checkpoint prevents provider acquisition and leaves no recreated owner journal', async () => {
  const h = harness({ signedIn: true }), state = await h.settle(), held = deferred(); h.behavior.pendingWrite = held;
  const starting = state.start(); await tick(); await tick(); assert.equal(h.behavior.starts, 0);
  const closing = h.clearAccount(); assert.equal((await h.settle()).ready, false);
  held.resolve(); h.behavior.pendingWrite = null;
  await closing; assert.equal(await starting, null); const result = await h.settle();
  assert.equal(h.behavior.starts, 0); assert.equal(result.active, false); assert.equal(result.ready, false); assert.equal(h.rows.size, 0);
});

test('deletion cancels an in-flight permission request for idle map location before GPS can start', async () => {
  const h = harness({ signedIn: true }), state = await h.settle(), permission = deferred(); h.behavior.pendingLocatePermission = permission;
  const locating = state.locate(); await tick(); await h.clearAccount();
  permission.resolve({ granted: true }); h.behavior.pendingLocatePermission = null; await locating;
  const result = await h.settle(); assert.equal(h.behavior.idleStarts, 0); assert.equal(result.userFix, null); assert.equal(result.ready, false);
});

test('a cloud response obtained before confirmed deletion cannot republish private history after closure', async () => {
  const stored = pendingSummary('A'), h = harness({ stored: [stored], signedIn: true }), held = deferred();
  h.behavior.pendingCloud.set('A', held); await h.settle(); await h.clearAccount();
  held.resolve({ items: [{ ride_id: stored.id, revision: 1, payload: copy(stored.summary), category: null, class_key: 'unknown', class_scheme_version: 1, metadata_authority: 'self_reported', speed_status: 'self_reported', visibility: 'private', created_at: '2023-11-14T22:00:00Z', updated_at: '2023-11-14T22:00:00Z' }], next_cursor: null });
  const result = await h.settle(); assert.equal(result.ready, false); assert.deepEqual(copy(result.cloudHistory), []); assert.equal(h.rows.size, 0);
});

test('pausing GPS cannot unlock interaction after measured movement without an explicit passenger override', async () => {
  const h = harness(); let ride = await h.settle(); assert.ok(await ride.start()); await h.settle(); h.confirmedSpeed(8); ride = await h.settle();
  assert.equal(ride.movingLocked, true); await ride.pause(); ride = await h.settle();
  assert.equal(ride.active, false); assert.equal(ride.snapshot.liveMps, null); assert.equal(ride.movingLocked, true);
  ride.setPassengerOverride(); assert.equal((await h.settle()).movingLocked, false);
});

test('fatal GPS failure retains the movement lock until a fresh capture confirms stationary speed', async () => {
  const h = harness(); let ride = await h.settle(); assert.ok(await ride.start()); await h.settle(); h.confirmedSpeed(8); await h.settle(); h.fatalStop(); ride = await h.settle();
  assert.equal(ride.active, false); assert.equal(ride.ride.status, 'interrupted'); assert.equal(ride.snapshot.liveMps, null); assert.equal(ride.movingLocked, true);
  assert.ok(await ride.resume()); await h.settle(); h.confirmedSpeed(0); ride = await h.settle(); assert.equal(ride.movingLocked, false); await ride.pause();
});

test('deletion while provider start is pending cancels capture binding after acquisition returns', async () => {
  const h = harness({ signedIn: true }), state = await h.settle(), held = deferred(); h.behavior.pendingStart = held;
  const starting = state.start(); await tick(); await tick(); assert.equal(h.behavior.starts, 1);
  await h.clearAccount(); held.resolve(); h.behavior.pendingStart = null; assert.equal(await starting, null);
  const result = await h.settle(); assert.equal(result.active, false); assert.equal(result.ready, false); assert.equal(result.sessionId, null); assert.equal(h.rows.size, 0);
});

test('retrying a failed durable acknowledgement cannot overwrite synced receipt with the earlier pending draft', async () => {
  const stored = pendingSummary('A'), h = harness({ stored: [stored], signedIn: true }); h.behavior.failWrites = true;
  let state = await h.settle(); assert.equal(h.behavior.syncCalls.length, 1); assert.equal(h.rows.get(stored.id).sync, 'pending');
  h.behavior.failWrites = false; await state.retrySave(); state = await h.settle();
  assert.equal(h.rows.get(stored.id).sync, 'synced'); assert.equal(h.rows.get(stored.id).revision, 1);
  assert.equal(state.history[0].sync, 'synced'); assert.equal(h.behavior.syncCalls.length, 1, 'Retry flushes the accepted acknowledgement without another cloud operation');
});
