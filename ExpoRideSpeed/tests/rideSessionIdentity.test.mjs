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

function harness({ nativeAvailable = true,observer } = {}) {
  const cells = [], effects = [], listeners = new Map(); let index = 0, uuid = 0, appListener, expoListener,expoError;
  const behavior = { permission: { granted: true, ios: { accuracy: 'full' } }, pendingPermission: null, starts: 0, stops: 0, fallbackStarts: 0, failStart: false, now: Date.now() };
  class CaptureClock extends Date { static now() { return behavior.now; } }
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
      hasServicesEnabledAsync: async () => true, watchPositionAsync: async (_options, listener,error) => { behavior.fallbackStarts++; expoListener = listener;expoError=error; return { remove() { expoListener = null;expoError=null; } }; }, Accuracy: { Highest: 5, BestForNavigation: 6 } },
    '../modules/ride-location': { default: nativeAvailable ? native : null, __esModule: true },
    '../modules/ride-location/src/sessionSupport': sessionSupport, './speedEngine': speedEngine,
  };
  const source = readFileSync(new URL('../src/useRideSession.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { require: name => { if (!(name in imports)) throw new Error(name); return imports[name]; }, module, exports: module.exports, Date: CaptureClock, Promise, Error, Symbol, Number, setInterval: () => 1, clearInterval: () => {} });
  return {
    behavior,
    render() { index = 0; const value = module.exports.useRideSession(observer); while (effects.length) effects.shift()(); return value; },
    sample(value) { listeners.get('onSample')?.(value); },
    expoSample(value) { expoListener?.(value); },
    error(value) { listeners.get('onError')?.(value); },
    expoError(){expoError?.('TEST_ONLY_UNAVAILABLE');},
    background() { AppState.currentState = 'background'; appListener('background'); },
  };
}
const sample = { timestampMs: Date.now(), latitude: 13.7, longitude: 100.5, speedMps: 3, horizontalAccuracyM: 4, speedAccuracyMps: .4, isSimulatedBySoftware: false, isProducedByAccessory: false };

test('actual native and Expo source-error callbacks notify passive consumers while retaining local capture/evidence',async()=>{
 for(const nativeAvailable of [true,false]){let unavailable=0;const h=harness({nativeAvailable,observer:{onUnavailable(){unavailable++;}}});await h.render().start();
  if(nativeAvailable){h.sample(sample);h.error({fatal:false,code:'TEST_SIGNAL'});}else{h.expoSample({timestamp:sample.timestampMs,coords:{latitude:13,longitude:100,speed:0,accuracy:5}});h.expoError();}
  assert.equal(unavailable,1);assert.equal(h.render().active,true);assert.equal(h.render().getEvidence().samples.length,1);
  h.render().stop();await flush();if(nativeAvailable)h.error({fatal:false,code:'OLD_CALLBACK'});else h.expoError();assert.equal(unavailable,1);
 }
});

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

function nativeReading(h, overrides = {}) {
  h.behavior.now += 1000;
  const reading = { ...sample, timestampMs: h.behavior.now, speedMps: 12, ...overrides };
  h.sample(reading);
  return { ...reading, mocked: null };
}

test('native speed uncertainty outside 0–1 m/s cannot produce a good reading or max; raw evidence stays exact', async t => {
  for (const accuracy of [100, 1.001, null, -1, NaN, Infinity]) {
    await t.test(String(accuracy), async () => {
      const h = harness(); await h.render().start();
      const readings = Array.from({ length: 3 }, () => nativeReading(h, { speedAccuracyMps: accuracy }));
      const ride = h.render();
      assert.equal(ride.snapshot.quality, 'weak');
      assert.equal(ride.snapshot.liveMps, null); assert.equal(ride.snapshot.maxMps, null);
      assert.deepEqual(ride.getEvidence().samples, readings);
      assert.equal(ride.active, true);
      ride.stop(); await flush();
    });
  }
});

test('native uncertainty ceiling includes zero and one, without rejecting an accessory or unknown simulation flag', async t => {
  for (const accuracy of [0, 1]) {
    await t.test(String(accuracy), async () => {
      const h = harness(); await h.render().start();
      const readings = Array.from({ length: 3 }, () => nativeReading(h, {
        speedAccuracyMps: accuracy, isProducedByAccessory: true, isSimulatedBySoftware: null,
      }));
      const ride = h.render();
      assert.equal(ride.snapshot.quality, 'good');
      assert.equal(ride.snapshot.liveMps, 12); assert.equal(ride.snapshot.maxMps, 12);
      assert.deepEqual(ride.getEvidence().samples, readings);
      ride.stop(); await flush();
    });
  }
});

test('unreliable native speed breaks confirmation, preserves the previous max, and recovers live speed immediately while max requires three fresh good samples', async () => {
  const h = harness(); await h.render().start();
  const readings = Array.from({ length: 3 }, () => nativeReading(h, { speedMps: 8 }));
  assert.equal(h.render().snapshot.maxMps, 8);
  readings.push(nativeReading(h, { speedAccuracyMps: 100 }));
  let ride = h.render();
  assert.equal(ride.snapshot.quality, 'weak'); assert.equal(ride.snapshot.liveMps, null);
  assert.equal(ride.snapshot.maxMps, 8);
  for (let index = 0; index < 2; index++) {
    readings.push(nativeReading(h));
    assert.equal(h.render().snapshot.liveMps, 12); assert.equal(h.render().snapshot.maxMps, 8);
  }
  readings.push(nativeReading(h)); ride = h.render();
  assert.equal(ride.snapshot.liveMps, 12); assert.equal(ride.snapshot.maxMps, 12);
  assert.deepEqual(ride.getEvidence().samples, readings);
  ride.stop(); await flush();
});

test('explicit native simulation cannot confirm speed or raise an existing max and remains visible in raw evidence', async () => {
  const h = harness(); await h.render().start();
  const readings = Array.from({ length: 3 }, () => nativeReading(h, { isSimulatedBySoftware: true }));
  assert.equal(h.render().snapshot.quality, 'weak'); assert.equal(h.render().snapshot.maxMps, null);
  for (let index = 0; index < 3; index++) readings.push(nativeReading(h, { speedMps: 8 }));
  assert.equal(h.render().snapshot.maxMps, 8);
  for (let index = 0; index < 3; index++) readings.push(nativeReading(h, { isSimulatedBySoftware: true }));
  const ride = h.render();
  assert.equal(ride.snapshot.quality, 'weak'); assert.equal(ride.snapshot.liveMps, null);
  assert.equal(ride.snapshot.maxMps, 8);
  assert.deepEqual(ride.getEvidence().samples, readings);
  ride.stop(); await flush();
});

test('Expo fallback rejects reported mock locations, preserves their fields, and can recover with fresh real readings', async () => {
  const h = harness({ nativeAvailable: false }); await h.render().start();
  const readings = [];
  const emit = mocked => {
    h.behavior.now += 1000;
    h.expoSample({ timestamp: h.behavior.now, mocked, coords: { latitude: 13.7, longitude: 100.5, speed: 12, accuracy: 4 } });
    readings.push({ timestampMs: h.behavior.now, latitude: 13.7, longitude: 100.5, speedMps: 12,
      horizontalAccuracyM: 4, speedAccuracyMps: null, isSimulatedBySoftware: null, isProducedByAccessory: null, mocked });
  };
  for (let index = 0; index < 3; index++) emit(true);
  let ride = h.render();
  assert.equal(ride.nativeSource, false); assert.equal(h.behavior.fallbackStarts, 1);
  assert.equal(ride.snapshot.quality, 'weak'); assert.equal(ride.snapshot.liveMps, null); assert.equal(ride.snapshot.maxMps, null);
  for (let index = 0; index < 2; index++) { emit(false); assert.equal(h.render().snapshot.liveMps, null); }
  emit(false); ride = h.render();
  assert.equal(ride.snapshot.quality, 'good'); assert.equal(ride.snapshot.liveMps, 12); assert.equal(ride.snapshot.maxMps, 12);
  assert.deepEqual(ride.getEvidence().samples, readings);
  ride.stop(); await flush();
});


test('one precise native fix reaches the HUD immediately but invalid coordinates only remain as raw evidence',async()=>{
 const h=harness();await h.render().start();nativeReading(h,{speedMps:7});assert.equal(h.render().snapshot.liveMps,7);assert.equal(h.render().snapshot.maxMps,null);
 for(const position of [{latitude:NaN},{latitude:91},{longitude:181},{longitude:Infinity}]){
  const raw=nativeReading(h,position);assert.equal(h.render().snapshot.liveMps,null);assert.deepEqual(h.render().getEvidence().samples.at(-1),raw);
 }
 h.render().stop();await flush();
});
