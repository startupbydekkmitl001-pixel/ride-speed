import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function sourceModule(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8').catch(() => '');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const state = { exports: {}, require: name => dependencies[name] ?? require(name), URL };
  runInNewContext(output, state);
  return state.exports;
}
const geometry = await sourceModule('../src/features/map/geometry.ts');
const theme = await sourceModule('../src/lib/theme.ts');
const base = await readFile(new URL('../src/features/map/styles/openfreemap-liberty.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => ({}));
const styles = await sourceModule('../src/features/map/mapStyle.ts', { '../../lib/theme': theme, './styles/openfreemap-liberty.json': base });
const lifecycle = await sourceModule('../src/features/map/lifecycle.ts');
const updates = await sourceModule('../src/features/map/sourceUpdates.ts');
const overlays = await sourceModule('../src/features/map/overlays.ts', { '../../lib/theme': theme });
const plain = value => JSON.parse(JSON.stringify(value));
const a = { latitude: 13.7, longitude: 100.5 }, b = { latitude: 13.8, longitude: 100.6 }, c = { latitude: 13.9, longitude: 100.7 };

test('map coordinates preserve longitude-first order and reject invalid values', () => {
  assert.equal(typeof geometry.toLngLat, 'function');
  assert.deepEqual(plain(geometry.toLngLat(a)), [100.5, 13.7]);
  assert.deepEqual(plain(geometry.fromLngLat([100.5, 13.7])), a);
  for (const coordinate of [{ latitude: NaN, longitude: 100 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }]) assert.equal(geometry.toLngLat(coordinate), null);
  assert.equal(geometry.fromLngLat([Infinity, 0]), null);
});

test('recorded tracks preserve pause and invalid-fix gaps instead of joining endpoints', () => {
  assert.equal(typeof geometry.trackData, 'function');
  const data = geometry.trackData({ kind: 'recorded', segments: [[a, b], [c], [a, b, { latitude: NaN, longitude: 100 }, b, c], [b, c]] });
  assert.deepEqual(plain(data.features[0].geometry.coordinates), [[[100.5, 13.7], [100.6, 13.8]], [[100.5, 13.7], [100.6, 13.8]], [[100.6, 13.8], [100.7, 13.9]], [[100.6, 13.8], [100.7, 13.9]]]);
  assert.equal(data.features[0].geometry.type, 'MultiLineString');
  assert.equal(data.features[0].properties.kind, 'recorded');
  assert.equal(geometry.trackData(null).features.length, 0);
});

test('bounds do not invent a camera for empty input and use a short antimeridian span', () => {
  assert.equal(typeof geometry.fitIntent, 'function');
  assert.equal(geometry.fitIntent([], {}), null);
  assert.deepEqual(plain(geometry.fitIntent([a], { maxZoom: 16 })), { kind: 'center', center: [100.5, 13.7], zoom: 16 });
  const result = geometry.fitIntent([{ latitude: 5, longitude: 179 }, { latitude: 6, longitude: -179 }], {});
  assert.deepEqual(plain(result.bounds), [179, 5, 181, 6]);
});

test('map pins and peers use stable IDs and never synthesize unauthorized fixtures', () => {
  assert.equal(typeof geometry.peersData, 'function');
  const peers = geometry.peersData([{ id: 'A', coordinate: a, name: 'อาร์', presence: 'riding', updatedAtMs: 1 }, { id: 'bad', coordinate: { latitude: 100, longitude: 2 }, name: 'bad', presence: 'online', updatedAtMs: 1 }]);
  assert.equal(peers.features.length, 1); assert.equal(peers.features[0].id, 'A');
  assert.deepEqual(plain(geometry.peersData([]).features), []);
  const pins = geometry.pinsData([{ id: 'start', coordinate: a, label: 'เริ่ม', role: 'start', order: 1 }], 'start');
  assert.equal(pins.features[0].properties.selected, true);
  assert.equal(pins.features[0].properties.label, 'เริ่ม');
});

test('the puck requires a valid measured fix and never replaces missing accuracy with zero', () => {
  assert.equal(typeof geometry.fixData, 'function');
  const fix = { coordinate: a, accuracyMeters: 10, timestampMs: 123, headingDegrees: null };
  assert.equal(geometry.fixData(fix).features.length, 1);
  for (const value of [null, { ...fix, accuracyMeters: null }, { ...fix, accuracyMeters: -1 }, { ...fix, timestampMs: NaN }]) assert.equal(geometry.fixData(value).features.length, 0);
});

test('map style makes land and water true black without mutating the upstream style', () => {
  assert.equal(typeof styles.createMapStyle, 'function');
  const before = JSON.stringify(base), dark = styles.createMapStyle('dark', 'th');
  assert.equal(dark.layers.find(layer => layer.type === 'background').paint['background-color'], '#000000');
  for (const layer of dark.layers.filter(layer => ['water', 'landcover', 'landuse'].includes(layer['source-layer']))) if (layer.type === 'fill') assert.equal(layer.paint['fill-color'], '#000000');
  assert.equal(JSON.stringify(base), before);
  assert.equal(dark.sources.openmaptiles.url, 'https://tiles.openfreemap.org/planet');
  assert.ok(dark.glyphs.includes('tiles.openfreemap.org/fonts'));
  const light = styles.createMapStyle('light', 'en');
  assert.notEqual(light.layers.find(layer => layer.type === 'background').paint['background-color'], '#000000');
});

test('map label fallbacks follow Thai and English without replacing route references', () => {
  assert.equal(typeof styles.createMapStyle, 'function');
  const thai = styles.createMapStyle('dark', 'th'), english = styles.createMapStyle('dark', 'en');
  const thLabel = thai.layers.find(layer => layer.id === 'label_city').layout['text-field'];
  const enLabel = english.layers.find(layer => layer.id === 'label_city').layout['text-field'];
  assert.ok(JSON.stringify(thLabel).indexOf('name:th') < JSON.stringify(thLabel).indexOf('name:en'));
  assert.ok(JSON.stringify(enLabel).indexOf('name:en') < JSON.stringify(enLabel).indexOf('name:th'));
  assert.equal(thai.layers.find(layer => layer.id === 'label_city').layout['text-letter-spacing'], 0);
  assert.ok(thai.layers.find(layer => layer.id === 'label_city').layout['text-line-height'] >= 1.45);
  const shield = thai.layers.find(layer => layer.id === 'highway-shield-non-us');
  assert.ok(JSON.stringify(shield.layout['text-field']).includes('ref'));
});

test('map worker URL stays on the app origin and preserves its deployment base path', () => {
  assert.equal(typeof geometry.mapWorkerUrl, 'function');
  assert.equal(geometry.mapWorkerUrl('https://ride.test', '/ride-speed/'), 'https://ride.test/ride-speed/maplibre/maplibre-gl-worker.mjs');
  assert.equal(geometry.mapWorkerUrl('http://localhost:8081', ''), 'http://localhost:8081/maplibre/maplibre-gl-worker.mjs');
  assert.equal(geometry.mapWorkerUrl('https://ride.test', 'https://evil.test/'), null);
});

test('map readiness waits for a frame, reports real offline/tile state, and avoids callback spam', () => {
  assert.equal(typeof lifecycle.MapStatusTracker, 'function');
  const events = [], tracker = new lifecycle.MapStatusTracker(status => events.push(plain(status)));
  tracker.beginStyle(true); tracker.styleLoaded();
  assert.deepEqual(events, [{ state: 'loading' }]);
  tracker.fullyRendered(); tracker.fullyRendered();
  assert.deepEqual(events.at(-1), { state: 'ready' });
  assert.equal(events.length, 2);
  tracker.tileFailed(); tracker.tileFailed();
  assert.deepEqual(events.at(-1), { state: 'degraded', reason: 'tiles' });
  tracker.setOnline(false);
  assert.deepEqual(events.at(-1), { state: 'degraded', reason: 'offline' });
  tracker.setOnline(true);
  assert.deepEqual(events.at(-1), { state: 'degraded', reason: 'tiles' });
  tracker.tilesRecovered();
  assert.deepEqual(events.at(-1), { state: 'ready' });
});

test('reduced motion and invalid camera commands never trigger invented position changes', () => {
  assert.equal(typeof geometry.cameraCommand, 'function');
  const current = { center: a, zoom: 12, bearing: 0, pitch: 0 };
  assert.equal(geometry.cameraCommand({ center: { latitude: 100, longitude: 2 } }, current, false), null);
  const command = geometry.cameraCommand({ zoom: 16, durationMs: 300 }, current, true);
  assert.equal(command.duration, 0); assert.deepEqual(plain(command.center), a);
  assert.equal(geometry.cameraCommand({ zoom: NaN }, current, false), null);
});

test('slow GeoJSON writes coalesce newer fixes and disposed sources cannot publish stale failures', async () => {
  assert.equal(typeof updates.GeoJSONUpdateQueue, 'function');
  let release; const blocked = new Promise(resolve => { release = resolve; });
  const writes = [], failures = [];
  const queue = new updates.GeoJSONUpdateQueue(async data => { writes.push(data); if (data === 'one') await blocked; }, error => failures.push(error));
  queue.update('one'); queue.update('two'); queue.update('three');
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(writes, ['one', 'three']);
  const rejected = new updates.GeoJSONUpdateQueue(async () => { await blocked; throw Error('old style'); }, error => failures.push(error));
  rejected.update('old'); rejected.dispose();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(failures, []);
});

test('nearby native fit points respect max zoom without restricting later gestures', () => {
  assert.equal(typeof geometry.cappedFitCamera, 'function');
  const result = geometry.cappedFitCamera([100.5, 13.7, 100.500001, 13.700001], { width: 390, height: 844 }, { top: 100, right: 20, bottom: 200, left: 20 }, 16);
  assert.equal(result.zoom, 16);
  assert.ok(Math.abs(result.center.latitude - 13.7000005) < 0.000001);
  assert.equal(geometry.cappedFitCamera([95, 5, 106, 20], { width: 390, height: 844 }, { top: 0, right: 0, bottom: 0, left: 0 }, 16), null);
});

test('all bundled theme and language styles and dynamic overlays pass both pinned renderer validators', () => {
  const nativeSpec = require('@maplibre/maplibre-gl-style-spec');
  const webRequire = createRequire(require.resolve('maplibre-gl/package.json'));
  const webSpec = webRequire('@maplibre/maplibre-gl-style-spec');
  for (const mode of ['dark', 'light']) for (const locale of ['th', 'en']) {
    const style = styles.createMapStyle(mode, locale);
    assert.deepEqual(plain(nativeSpec.validateStyleMin(style)), []);
    assert.deepEqual(plain(webSpec.validateStyleMin(style)), []);
    for (const id of [overlays.mapIds.track, overlays.mapIds.pins, overlays.mapIds.peers, overlays.mapIds.fix]) {
      style.sources[id] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, ...(id === overlays.mapIds.peers ? overlays.peerClusterOptions : {}), ...(id === overlays.mapIds.track ? { lineMetrics: true } : {}) };
    }
    style.layers.push(...overlays.overlayLayers(mode));
    assert.deepEqual(plain(nativeSpec.validateStyleMin(style)), []);
    assert.deepEqual(plain(webSpec.validateStyleMin(style)), []);
    const peerLabel = style.layers.find(layer => layer.id === overlays.mapIds.peerName);
    assert.equal(peerLabel.layout['text-letter-spacing'], 0);
    assert.ok(peerLabel.layout['text-line-height'] >= 1.45);
  }
});
