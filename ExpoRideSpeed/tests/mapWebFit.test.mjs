import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sdkRoot = dirname(require.resolve('maplibre-gl/package.json'));
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

// Execute the pinned SDK source, including its actual Camera/MercatorTransform.
// Node cannot load the SDK's TS or MLT's extensionless ESM directly. Compilation
// only adapts modules/import.meta; camera, padding and projection stay unmocked.
function sourceLoader(overrides = {}) {
  const cache = new Map();
  function load(path) {
    if (path.endsWith('.png')) return 1;
    if (!existsSync(path)) path += '.js';
    if (path.endsWith('.css')) return {};
    if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const source = readFileSync(path, 'utf8').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(path).href));
    const output = ts.transpileModule(source, { fileName: path, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      esModuleInterop: true, allowJs: true, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const localRequire = createRequire(path);
    runInNewContext(output, { module, exports: module.exports,
      require: name => {
        if (name === 'expo-asset') return {Asset:{fromModule:()=>({uri:'local-original-vehicle.png'})}};
        if (name in overrides) return overrides[name];
        if (name.startsWith('.')) {
          let target = resolve(dirname(path), name);
          if (!existsSync(target)) for (const extension of ['.ts', '.tsx', '.js']) {
            if (existsSync(target + extension)) { target += extension; break; }
          }
          return load(target);
        }
        return name === '@maplibre/mlt' ? load(localRequire.resolve(name)) : localRequire(name);
      }, console, URL, performance, AbortController, setTimeout, clearTimeout,
      TextEncoder, TextDecoder, Uint8Array, Uint8ClampedArray, Float32Array,
      Float64Array, Int16Array, Uint16Array, Int32Array, Uint32Array, ArrayBuffer, DataView,
    }, { filename: path });
    return module.exports;
  }
  return load;
}
const sdk = sourceLoader();
const { Camera } = sdk(resolve(sdkRoot, 'src/ui/camera.ts'));
const { LngLat } = sdk(resolve(sdkRoot, 'src/geo/lng_lat.ts'));
const stops = [{ latitude: 13.7, longitude: 100.49 }, { latitude: 13.74, longitude: 100.51 }];

function mapHandle(width, height, contentInsets, reducedMotion = false, attributionHeight = 23) {
  const camera = new Camera({});
  camera.transform.resize(width, height);
  camera.jumpTo({ center: [100.49, 13.7], zoom: 13, bearing: 0, pitch: 0 });
  camera.setPadding(contentInsets);
  // Only the browser's animation scheduler is replaced. The real fitBounds,
  // cameraForBounds, _fitInternal, jumpTo and projection perform every fit.
  camera.flyTo = options => camera.jumpTo(options);
  camera.easeTo = options => camera.jumpTo(options);
  camera.getContainer = () => ({ querySelector: () => ({ getBoundingClientRect: () => ({ height: attributionHeight }) }) });
  const ref = { current: null };
  let refIndex = 0;
  const react = {
    forwardRef: render => render,
    useRef: value => ({ current: refIndex++ === 3 ? camera : refIndex === 5 || refIndex === 6 ? true : value }),
    useMemo: callback => callback(), useCallback: callback => callback,
    useEffect: () => {},useLayoutEffect:()=>{}, useImperativeHandle: (target, create) => { target.current = create(); },
  };
  const load = sourceLoader({ react, 'expo-constants': { default: { expoConfig: {} } } });
  const Surface = load(resolve(sourceRoot, 'features/map/MapSurface.web.tsx')).default;
  Surface({ initialCamera: { center: stops[0], zoom: 13, bearing: 0, pitch: 0 },
    theme: 'dark', locale: 'th', mode: 'browse', reducedMotion, online: true,
    contentInsets, track: null, pins: [], peers: [], userFix: null,
    selectedPinId: null, retryToken: 0, onStatus: () => {},
  }, ref);
  return { camera, handle: ref.current };
}

function visibleRoute(camera, width, height, insets) {
  return stops.map(stop => {
    const point = camera.transform.locationToScreenPoint(new LngLat(stop.longitude, stop.latitude));
    assert.ok(point.x >= insets.left - 0.01 && point.x <= width - insets.right + 0.01, `pin x=${point.x} outside unobscured map`);
    assert.ok(point.y >= insets.top - 0.01 && point.y <= height - insets.bottom + 0.01, `pin y=${point.y} outside unobscured map`);
    return point;
  });
}

test('web Overview fits both route endpoints above a tall phone sheet without double-counting its insets', () => {
  const insets = { top: 130, left: 24, right: 68, bottom: 436 };
  const { camera, handle } = mapHandle(428, 926, insets);
  handle.fitCoordinates(stops, { padding: insets, maxZoom: 15, durationMs: 300 });
  const points = visibleRoute(camera, 428, 926, insets);
  assert.ok(Math.abs(points[1].y - 130) < 0.01);
  // Keep a 44 pt attribution band + 8 pt offset, and 22 pt marker + 8 pt gap.
  assert.ok(Math.abs(points[0].y - 408) < 0.01);
  assert.ok(points[0].y + 22 + 8 <= 438);
  // A second Overview must not accumulate previous persistent padding.
  handle.fitCoordinates(stops, { padding: insets, maxZoom: 15, durationMs: 0 });
  visibleRoute(camera, 428, 926, insets);
});

test('web Overview uses a requested fit viewport once when it differs from existing content insets', () => {
  const existing = { top: 20, left: 12, right: 12, bottom: 80 };
  const requested = { top: 110, left: 90, right: 30, bottom: 420 };
  const { camera, handle } = mapHandle(600, 900, existing, true);
  handle.fitCoordinates(stops, { padding: requested, maxZoom: 15 });
  const points = visibleRoute(camera, 600, 900, requested);
  assert.ok(Math.abs(points[1].y - 110) < 0.01);
  assert.ok(Math.abs(points[0].y - 398) < 0.01);
});

test('web Overview reserves the actual attribution height when credits wrap taller than the target band', () => {
  const insets = { top: 130, left: 24, right: 68, bottom: 436 };
  const { camera, handle } = mapHandle(428, 926, insets, true, 68);
  handle.fitCoordinates(stops, { padding: insets, maxZoom: 15 });
  const points = visibleRoute(camera, 428, 926, insets);
  assert.ok(Math.abs(points[0].y - 384) < 0.01);
  assert.ok(points[0].y + 22 + 8 <= 414);
});

test('web singleton fit centers a pin in the unobscured viewport and respects its zoom cap', () => {
  const insets = { top: 130, left: 24, right: 68, bottom: 436 };
  const { camera, handle } = mapHandle(428, 926, insets);
  handle.fitCoordinates([stops[0]], { maxZoom: 15 });
  const point = camera.transform.locationToScreenPoint(new LngLat(100.49, 13.7));
  assert.ok(Math.abs(point.x - 192) < 0.01);
  assert.ok(Math.abs(point.y - 310) < 0.01);
  assert.equal(camera.getZoom(), 15);
});
