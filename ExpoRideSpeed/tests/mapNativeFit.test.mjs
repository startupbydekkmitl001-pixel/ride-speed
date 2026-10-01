import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../src/', import.meta.url));
const insets = { top: 130, left: 24, right: 68, bottom: 436 };
const stops = [{ latitude: 13.7, longitude: 100.49 }, { latitude: 13.74, longitude: 100.51 }];

function adapter() {
  const output = [], ref = { current: null };
  const native = { Map: 'NativeMap', Camera: 'NativeCamera', GeoJSONSource: 'GeoJSONSource', Layer: 'Layer', ViewAnnotation: 'ViewAnnotation' };
  const jsx = (type, props) => ({ type, props });
  const react = { memo: value => value, forwardRef: value => value, useRef: current => ({ current }),
    useMemo: callback => callback(), useCallback: callback => callback,
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useLayoutEffect: callback => { callback(); }, useEffect: () => {},
    useImperativeHandle: (target, create) => { target.current = create(); },
  };
  const deps = { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { absoluteFill: {} } },
    '@maplibre/maplibre-react-native': native,
  };
  const cache = new Map();
  function load(path) {
    if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    runInNewContext(code, { module, exports: module.exports, require: name => {
      if (name in deps) return deps[name];
      if (!name.startsWith('.')) return require(name);
      let next = resolve(dirname(path), name);
      if (!existsSync(next)) for (const extension of ['.ts', '.tsx']) if (existsSync(next + extension)) { next += extension; break; }
      return load(next);
    }, URL, console }, { filename: path });
    return module.exports;
  }
  const Surface = load(resolve(root, 'features/map/MapSurface.native.tsx')).default;
  const tree = Surface({ initialCamera: { center: stops[0], zoom: 13, bearing: 0, pitch: 0 },
    contentInsets: insets, theme: 'dark', locale: 'th', mode: 'browse', reducedMotion: true,
    track: null, pins: [], peers: [], userFix: null, selectedPinId: null, retryToken: 0,
    online: true, onStatus: () => {},
  }, ref);
  const map = tree.props.children.find(value => value.type === native.Map);
  const camera = map.props.children.find(value => value?.type === native.Camera);
  const attribution = tree.props.children.find(value => value.type === 'Pressable');
  camera.props.ref.current = {
    easeTo: value => { output.push({ kind: 'center', value }); },
    fitBounds: (bounds, value) => { output.push({ kind: 'bounds', value, bounds }); },
  };
  tree.props.onLayout({ nativeEvent: { layout: { width: 428, height: 926 } } });
  map.props.onDidFinishLoadingStyle();
  output.length = 0;
  return { handle: ref.current, map, camera, attribution, output };
}

// Both pinned native engines add Map.contentInset to the camera stop padding:
// Android11.4 CameraStop.kt51–59; iOS6.31 MLNMapView.mm4089–4103.
// Execute our actual adapter and test its effective bridge boundary, without
// claiming that this Node harness runs the unavailable iOS/Android engines.
function effective(map, padding) {
  return Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [side, map.props.contentInset[side] + padding[side]]));
}

test('native recenter and initial camera own overlay padding once across the additive native bridge', () => {
  const value = adapter();
  assert.deepEqual(effective(value.map, value.camera.props.initialViewState.padding), insets);
  value.handle.setCamera({ center: stops[1], zoom: 14, durationMs: 0 });
  assert.deepEqual(effective(value.map, value.output.at(-1).value.padding), insets);
});

test('native bounds Overview reserves attribution and marker clearance once above the phone sheet', () => {
  const value = adapter();
  value.handle.fitCoordinates(stops, { padding: insets, maxZoom: 15 });
  assert.equal(value.output.at(-1).kind, 'bounds');
  assert.deepEqual(effective(value.map, value.output.at(-1).value.padding), { top: 130, right: 68, bottom: 518, left: 24 });
  [100.49, 13.7, 100.51, 13.74].forEach((coordinate, index) => {
    assert.ok(Math.abs(value.output.at(-1).bounds[index] - coordinate) < 1e-9);
  });
});

test('native nearby bounds cap zoom with the same single-owner attribution allowance', () => {
  const value = adapter();
  value.handle.fitCoordinates([stops[0], { latitude: 13.700001, longitude: 100.490001 }], { padding: insets, maxZoom: 15 });
  assert.equal(value.output.at(-1).kind, 'center');
  assert.equal(value.output.at(-1).value.zoom, 15);
  assert.deepEqual(effective(value.map, value.output.at(-1).value.padding), { top: 130, right: 68, bottom: 518, left: 24 });
});
