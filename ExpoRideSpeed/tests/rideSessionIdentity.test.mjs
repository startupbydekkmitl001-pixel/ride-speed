import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as sessionSupport from '../modules/ride-location/src/sessionSupport.ts';
import * as speedEngine from '../src/speedEngine.ts';
const require = createRequire(import.meta.url), ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness() {
  const cells = [], effects = [], listeners = new Map(); let index = 0, uuid = 0, appListener;
  const behavior = { permission: { granted: true, ios: { accuracy: 'full' } }, pendingPermission: null, starts: 0, stops: 0, fallbackStarts: 0, failStart: false };
  const React = {
    useState(value) { const i = index++; if (!(i in cells)) cells[i] = typeof value === 'function' ? value() : value; return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; }]; },
    useRef(value) { const i = index++; if (!(i in cells)) cells[i] = { current: value }; return cells[i]; },
    useCallback: fn => fn,
    useEffect(fn, deps) { const i = index++, previous = cells[i]; if (!previous || deps.some((v, j) => v !== previous.deps[j])) { previous?.cleanup?.(); cells[i] = { deps }; effects.push(() => { cells[i].cleanup = fn(); }); } },
  };
  // Stable callback identity keeps the real hook's mount effect stable across test renders.
  React.useCallback = (fn, deps) => { const i = index++, previous = cells[i]; if (!previous || deps.some((v, j) => v !== previous.deps[j])) cells[i] = { deps, fn }; return cells[i].fn; };
  const AppState = { currentState: 'active', addEventListener: (_name, fn) => { appListener = fn; return { remove() {} }; } };
  const native = {
    addListener(name, fn) { listeners.set(name, fn); return { remove() { if (listeners.get(name) === fn) listeners.delete(name); } }; },
    start: async () => { behavior.starts++; if (behavior.failStart) throw new Error('NATIVE_START_FAILURE'); },
    stop: async () => { behavior.stops++; },
  };
  const imports = {
    react: React, 'react-native': { AppState, Platform: { OS: 'ios' } }, 'expo-crypto': { randomUUID: () => `capture-${++uuid}` },
    'expo-location': { requestForegroundPermissionsAsync: async () => behavior.pendingPermission ? behavior.pendingPermission.promise : behavior.permission,
      hasServicesEnabledAsync: async () => true, watchPositionAsync: async () => { behavior.fallbackStarts++; return { remove() {} }; }, Accuracy: { Highest: 6 } },
    '../modules/ride-location': { default: native, __esModule: true },
    '../modules/ride-location/src/sessionSupport': sessionSupport, './speedEngine': speedEngine,
  };
  const source = readFileSync(new URL('../src/useRideSession.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { require: name => { if (!(name in imports)) throw new Error(name); return imports[name]; }, module, exports: module.exports, Date, Promise, Error, Symbol, Number, setInterval: () => 1, clearInterval: () => {} });
  return {
    behavior,
    render() { index = 0; const value = module.exports.useRideSession(); while (effects.length) effects.shift()(); return value; },
    sample(value) { listeners.get('onSample')?.(value); },
    error(value) { listeners.get('onError')?.(value); },
    background() { AppState.currentState = 'background'; appListener('background'); },
  };
}
const sample = { timestampMs: Date.now(), latitude: 13.7, longitude: 100.5, speedMps: 3, horizontalAccuracyM: 4, speedAccuracyMps: .4, isSimulatedBySoftware: false, isProducedByAccessory: false };

test('failed permission returns no new capture ID and cannot relabel retained old evidence', async () => {
  const h = harness(); let ride = h.render(); const original = await ride.start();
  h.sample(sample); ride.stop(); await flush(); ride = h.render();
  assert.equal(ride.getEvidence().sessionId, original); assert.equal(ride.getEvidence().samples.length, 1);
  h.behavior.permission = { granted: false };
  assert.equal(await ride.start(), null); ride = h.render();
  assert.equal(ride.sessionId, original); assert.equal(ride.getEvidence().sessionId, original);
  assert.equal(h.behavior.starts, 1); assert.equal(h.behavior.fallbackStarts, 0);
});

test('only a successful new native capture gets a new ID and fresh evidence', async () => {
  const h = harness(); let ride = h.render(); const oldId = await ride.start();
  h.sample(sample); ride.stop(); await flush(); ride = h.render();
  const newId = await ride.start(); ride = h.render();
  assert.notEqual(newId, oldId); assert.equal(ride.sessionId, newId);
  assert.equal(ride.getEvidence().samples.length, 0); assert.equal(ride.getEvidence().nativeSource, true);
  ride.stop(); await flush();
});

test('background cancellation while permission is pending returns no capture ID or provider', async () => {
  const h = harness(), permission = deferred(); h.behavior.pendingPermission = permission;
  const ride = h.render(), starting = ride.start(); h.background();
  permission.resolve({ granted: true, ios: { accuracy: 'full' } });
  assert.equal(await starting, null);
  assert.equal(h.render().sessionId, null); assert.equal(h.behavior.starts, 0);
});

test('native start failure clears the attempted identity, never starts fallback, and cleans up', async () => {
  const h = harness(), ride = h.render(); h.behavior.failStart = true;
  assert.equal(await ride.start(), null); await flush();
  assert.equal(h.render().sessionId, null); assert.equal(h.behavior.stops, 1); assert.equal(h.behavior.fallbackStarts, 0);
});

test('fatal native stop preserves the successful session ID and raw evidence for explicit review', async () => {
  const h = harness(), ride = h.render(), id = await ride.start();
  h.sample(sample); h.error({ code: 'E_BACKGROUND', message: 'background', fatal: true }); await flush();
  const ended = h.render(); assert.equal(ended.active, false); assert.equal(ended.sessionId, id);
  assert.equal(ended.getEvidence().samples[0].speedAccuracyMps, .4); assert.equal(h.behavior.stops, 1);
});
