import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseAccountState, parseOnboardingDraft, mergeOnboardingState, initialAccountState, validateRiderName } from '../src/features/onboarding/model.ts';
import * as model from '../src/features/onboarding/model.ts';

const require = createRequire(import.meta.url), ts = require('typescript');
const module = { exports: {} };
const source = readFileSync(new URL('../src/features/onboarding/OnboardingStore.ts', import.meta.url), 'utf8');
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => model, module, module.exports);
const { OnboardingStore } = module.exports;
const state = (step, revision = 0) => ({ ...initialAccountState(), onboarding_step: step, revision });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture({ local = null, remote = state('language'), readFails = false, getFails = false } = {}) {
  let raw = local ? JSON.stringify(local) : null, cloud = remote, failRead = readFails, failGet = getFails;
  const store = new OnboardingStore({
    read: async () => { if (failRead) throw Error('disk unavailable'); return raw; },
    write: async value => { raw = value; }, remove: async () => { raw = null; },
    get: async () => { if (failGet) throw Error('ACCOUNT_STATE_UNAVAILABLE'); return cloud; },
    put: async value => { cloud = { ...value, revision: cloud.revision + 1 }; delete cloud.pending; return cloud; },
    ensure: () => {},
  });
  return { store, get raw() { return raw; }, get cloud() { return cloud; }, set cloud(value) { cloud = value; }, failRead(value) { failRead = value; }, failGet(value) { failGet = value; } };
}

test('new users begin with language and private location choices without inferring a profile', () => {
  const state = initialAccountState();
  assert.equal(state.onboarding_step, 'language');
  assert.equal(state.location_choice, 'unknown');
  assert.equal(state.preferences.route_audience, 'friends');
});

test('interrupted onboarding resumes its later local step with the latest cloud revision', () => {
  const local = { ...initialAccountState(), onboarding_step: 'vehicle', pending: true };
  const remote = { ...initialAccountState(), revision: 5, onboarding_step: 'profile' };
  const result = mergeOnboardingState(local, remote);
  assert.equal(result.onboarding_step, 'vehicle');
  assert.equal(result.revision, 5);
  assert.equal(result.pending, true);
});

test('local completion is never erased by an older cloud draft', () => {
  const local = { ...initialAccountState(), onboarding_step: 'complete', pending: true };
  const result = mergeOnboardingState(local, { ...initialAccountState(), revision: 1 });
  assert.equal(result.onboarding_step, 'complete');
  assert.equal(result.pending, true);
});

test('returning cloud-complete users remain complete on a fresh device', () => {
  const result = mergeOnboardingState(null, { ...initialAccountState(), revision: 2, onboarding_step: 'complete' });
  assert.equal(result.onboarding_step, 'complete');
  assert.equal(result.pending, false);
});

test('malformed drafts and server revisions cannot disable safety preferences', () => {
  assert.equal(parseOnboardingDraft('{bad json'), null);
  assert.equal(parseOnboardingDraft(JSON.stringify({ onboarding_step: 'unknown' })), null);
  assert.throws(() => parseAccountState({ ...initialAccountState(), revision: -1 }), /ACCOUNT_STATE_INVALID/);
  const result = parseAccountState({ ...initialAccountState(), preferences: { ghost_mode: 'false', route_audience: 'public', notifications_enabled: 'true' } });
  assert.equal(result.preferences.ghost_mode, true);
  assert.equal(result.preferences.route_audience, 'friends');
  assert.equal(result.preferences.notifications_enabled, false);
});

test('an unread onboarding draft is not overwritten by an older cloud step', async () => {
  const h = fixture({ local: { ...state('complete'), pending: true }, remote: state('profile', 4), readFails: true });
  await h.store.hydrate();
  assert.equal(JSON.parse(h.raw).onboarding_step, 'complete');
  assert.equal(h.store.getSnapshot().error, 'LOCAL_READ_FAILED');
  await assert.rejects(h.store.advance('language'), /LOCAL_READ_FAILED/);
  assert.equal(JSON.parse(h.raw).onboarding_step, 'complete');
  h.failRead(false);
  await h.store.retry();
  assert.equal(h.store.getSnapshot().value.onboarding_step, 'complete');
  assert.equal(h.store.getSnapshot().error, null);
  assert.equal(h.cloud.onboarding_step, 'complete');
});

test('hydration synchronizes offline completion without a hidden manual retry', async () => {
  const h = fixture({ local: { ...state('complete'), location_choice: 'denied', pending: true }, remote: state('profile', 4) });
  await h.store.hydrate();
  assert.equal(h.cloud.onboarding_step, 'complete');
  assert.equal(h.cloud.location_choice, 'denied');
  assert.equal(h.store.getSnapshot().value.pending, false);
  assert.equal(JSON.parse(h.raw).pending, false);
});

test('connection retry retains local completion and uses current cloud privacy', async () => {
  const h = fixture({ local: { ...state('complete'), pending: true }, remote: state('profile', 4), getFails: true });
  await h.store.hydrate();
  assert.equal(h.store.getSnapshot().value.onboarding_step, 'complete');
  assert.equal(h.store.getSnapshot().error, 'ACCOUNT_STATE_UNAVAILABLE');
  h.cloud = { ...state('profile', 7), preferences: { ghost_mode: false, route_audience: 'private', notifications_enabled: false } };
  h.failGet(false);
  await h.store.retry();
  assert.equal(h.cloud.onboarding_step, 'complete');
  assert.equal(h.cloud.preferences.route_audience, 'private');
  assert.equal(h.store.getSnapshot().value.pending, false);
});

test('privacy updates preserve offline onboarding progress on the server', async () => {
  const h = fixture({ local: { ...state('complete'), pending: true }, remote: state('profile', 4), getFails: true });
  await h.store.hydrate(); h.failGet(false);
  await h.store.setPreferences({ route_audience: 'private' });
  assert.equal(h.cloud.onboarding_step, 'complete');
  assert.equal(h.cloud.preferences.route_audience, 'private');
  assert.equal(h.store.getSnapshot().value.onboarding_step, 'complete');
});

test('new account generations read after an in-flight owner write and cannot regress the durable draft', async () => {
  assert.equal(typeof module.exports.OnboardingStorageQueue, 'function');
  const queue = new module.exports.OnboardingStorageQueue();
  const key = 'ride.onboarding.v1.A', values = new Map(), held = deferred(), started = deferred();
  let active = 'A1', holdWrite = false;
  const storage = { getItem: async k => values.get(k) ?? null, setItem: async (k, value) => {
    if (k === key && holdWrite) { started.resolve(); await held.promise; }
    values.set(k, value);
  }, removeItem: async k => { values.delete(k); } };
  const create = (epoch, step) => {
    const ensure = () => { if (active !== epoch) throw Error('ACCOUNT_CHANGED'); };
    return new OnboardingStore({ ...queue.bind(key, storage, ensure), get: async () => state(step), put: async v => v, ensure });
  };
  const a1 = create('A1', 'language'); await a1.hydrate(); holdWrite = true;
  const old = a1.advance('location'); const oldFailure = assert.rejects(old, /ACCOUNT_CHANGED/); await started.promise;
  active = 'B'; active = 'A2'; const a2 = create('A2', 'profile');
  const fresh = a2.hydrate(); await new Promise(r => setImmediate(r));
  holdWrite = false; held.resolve(); await oldFailure; await fresh;
  assert.equal(a2.getSnapshot().value.onboarding_step, 'profile');
  assert.equal(JSON.parse(values.get(key)).onboarding_step, 'profile');
});

test('confirmed owner cleanup waits for active writes and cannot be recreated by another generation', async () => {
  assert.equal(typeof module.exports.OnboardingStorageQueue, 'function');
  const queue = new module.exports.OnboardingStorageQueue(), values = new Map(), held = deferred(), started = deferred();
  const key = 'ride.onboarding.v1.A';
  const storage = { getItem: async k => values.get(k) ?? null, setItem: async (k, value) => { started.resolve(); await held.promise; values.set(k, value); }, removeItem: async k => { values.delete(k); } };
  const a = queue.bind(key, storage, () => {}), newA = queue.bind(key, storage, () => {}), b = queue.bind('ride.onboarding.v1.B', storage, () => {});
  const writing = a.write('old A'); await started.promise; const removing = a.remove();
  await assert.rejects(newA.write('resurrected'), /ACCOUNT_DELETION_PENDING/);
  held.resolve(); await writing; await removing;
  assert.equal(values.has(key), false);
  await b.write('B progress'); assert.equal(values.get('ride.onboarding.v1.B'), 'B progress');
});

test('refresh retry reflects a changed server privacy preference without regressing completion', async () => {
  const h = fixture({ remote: state('complete', 1) }); await h.store.hydrate();
  h.cloud = { ...state('complete', 2), preferences: { ghost_mode: false, route_audience: 'private', notifications_enabled: false } };
  await h.store.retry();
  assert.equal(h.store.getSnapshot().value.preferences.ghost_mode, false);
  assert.equal(h.store.getSnapshot().value.preferences.route_audience, 'private');
  assert.equal(h.store.getSnapshot().value.onboarding_step, 'complete');
});

test('profile validation normalizes handles, preserves Thai names, and identifies fields', () => {
  assert.deepEqual(validateRiderName('  อาร์นัล  ', '  Arnalxz  '), { displayName: 'อาร์นัล', handle: 'arnalxz' });
  assert.equal(validateRiderName('', 'arnalxz').error, 'name');
  assert.equal(validateRiderName('Rider', 'a').error, 'handle');
  assert.equal(validateRiderName('Rider', 'name with space').error, 'handle');
});
