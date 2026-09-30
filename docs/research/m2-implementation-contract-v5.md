# M2 map and recording implementation contract — V5

Checked **1 October 2026** against Expo **57.0.26**, RN **0.86.3**, the existing capture/submission code, MapLibre React Native **11.4.0** and GL JS **6.11.2**. This is an implementation boundary, not native/device acceptance. M0 is committed as `5f2ca63`; product changes wait for the M1 gate.

## Ownership and proposed files

Root owns the app-level ride provider/journal, Map Home, HUD, navigation and capture lifecycle. The map adapter owner owns `src/features/map/MapSurface.types.ts`, `MapSurface.native.tsx`, `MapSurface.web.tsx`, `mapStyle.ts`, the bundled upstream style/provenance, and the web-worker copy script. Coordinate/geometry helpers may be shared with the route feature by agreement. Replace the old bounded `RouteMap` through a thin compatibility wrapper; do not leave Android/web on coordinate-only fallbacks.

The map renderer **does not request location permission, acquire GPS, submit rides, call search/routing APIs or own authentication**. It receives geometry and the last validated fix. Do not use MapLibre's `UserLocation` or `Camera.trackUserLocation`: that component starts the package's own location watcher, outside `ExclusiveLocationCapture`. Render a puck from provider data instead. [Tagged UserLocation implementation](https://github.com/maplibre/maplibre-react-native/blob/v11.4.0/package/src/components/user-location/UserLocation.tsx)

The provider sits above routed screens, within the authenticated account scope. Screen switches and an expanded/compact HUD cannot create another capture owner. Idle launch positioning/recenter are one-shot fixes coordinated with the same owner; finish/release idle work before starting continuous capture. Generation checks must reject delayed idle results after a new ride/account starts.

## Typed adapter contract

Use app coordinates externally and convert to MapLibre `[longitude, latitude]` only inside adapters. Export types without importing either platform's map runtime. The interface below is the proposed concrete handoff; the provider can supply it without knowing MapLibre classes.

```ts
type MapCoordinate = Readonly<{ latitude: number; longitude: number }>;
type MapInsets = Readonly<{ top: number; right: number; bottom: number; left: number }>;
type MapCamera = Readonly<{
  center: MapCoordinate; zoom: number; bearing: number; pitch: number;
}>;
type MapPin = Readonly<{
  id: string; coordinate: MapCoordinate; label: string;
  role: 'start' | 'via' | 'finish'; order: number;
}>;
type MapPeer = Readonly<{
  id: string; coordinate: MapCoordinate; name: string;
  presence: 'online' | 'riding'; updatedAtMs: number;
}>;
type MapFix = Readonly<{
  coordinate: MapCoordinate; accuracyMeters: number;
  timestampMs: number; headingDegrees: number | null;
}>;
type MapTrack = Readonly<{
  kind: 'road' | 'recorded' | 'draft';
  segments: readonly (readonly MapCoordinate[])[];
}>;
type MapStatus =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'degraded'; reason: 'offline' | 'tiles' }
  | { state: 'error'; reason: 'style' | 'renderer' }
  | { state: 'unsupported'; reason: 'webgl2' | 'native-module' };
interface MapHandle {
  setCamera(camera: Partial<Omit<MapCamera, 'center'>> & {
    center?: MapCoordinate; durationMs?: number;
  }): void;
  fitCoordinates(coordinates: readonly MapCoordinate[], options?: {
    padding?: MapInsets; durationMs?: number; maxZoom?: number;
  }): void;
  getCamera(): Promise<MapCamera | null>;
  project(coordinate: MapCoordinate): Promise<{ x: number; y: number } | null>;
  unproject(point: { x: number; y: number }): Promise<MapCoordinate | null>;
}
interface MapSurfaceProps {
  theme: 'dark' | 'light'; locale: 'th' | 'en';
  initialCamera: MapCamera; contentInsets: MapInsets;
  mode: 'browse' | 'edit' | 'glance'; reducedMotion: boolean;
  online: boolean; retryToken: number;
  track: MapTrack | null; pins: readonly MapPin[]; selectedPinId: string | null;
  peers: readonly MapPeer[]; userFix: MapFix | null;
  onStatus(status: MapStatus): void;
  onPress?(coordinate: MapCoordinate): void;
  onLongPress?(coordinate: MapCoordinate): void;
  onSelectPin?(id: string): void;
  onSelectPeer?(id: string): void;
  onUserGesture?(): void;
}
```

Expose the handle via a React ref. Commands return `void`: native camera methods do not signal completed animations. Before style readiness, retain only the latest camera intent; queries return `null` if unavailable/unmounted. Zero-duration transitions honor Reduce Motion. Validate finite coordinates/ranges and refuse empty fit bounds. One-point bounds use `maxZoom`; fit uses measured safe area/HUD insets. `initialCamera` applies once, not on every GPS tick. Preserve camera on theme/locale changes; do not remount the renderer by route ID or speed.

`MapPeer` means already authorized, nonexpired and explicitly shared data. Root filters ghost mode/blocks/revocation/expiry before rendering; the adapter never fabricates peers to demonstrate clustering. A development 50-marker fixture must be labeled and excluded from installed production UI. Pins/peers are selected by stable IDs; localized descriptive controls and a 44 pt accessible alternative list supplement rasterized map targets.

## Exact pinned native API

Install at M2 with `npx expo install @maplibre/maplibre-react-native@11.4.0`, add its config plugin, then rebuild both native binaries. Expo Go cannot load it. Published peers cover this RN/React/Expo combination; successful iOS and Android compilation remains required. The existing app has no Android package/distribution configuration yet. [Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/), [requirements](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/)

| Adapter responsibility | Version 11.4.0 API |
| --- | --- |
| Render | `Map` with `mapStyle` object/string, `contentInset`, `dragPan`, `touchZoom`, `doubleTapZoom`, `doubleTapHoldZoom`, `touchRotate`, `touchPitch` |
| Initial camera / commands | `Camera.initialViewState`; `CameraRef.jumpTo`, `easeTo`, `flyTo`, `fitBounds`, `zoomTo` return void; `setStop` returns a promise |
| Fit | `fitBounds([west,south,east,north], {padding, duration, easing:'ease'})`; two arguments, not stale three-argument examples |
| Press / user gesture | `onPress`/`onLongPress` read `event.nativeEvent.lngLat`; `onRegionDidChange` reads `userInteraction`, `center`, `zoom`, `bearing`, `pitch` |
| Queries | `MapRef.getViewState`, `project`, `unproject` return promises; guard results by mounted renderer generation |
| Features | `GeoJSONSource.data`; nested `Layer` with `type`, style-spec `paint`, `layout`, `filter`; source press reads `nativeEvent.features` and stops propagation |
| Clusters | `cluster`, `clusterRadius`, `clusterMaxZoom`, `clusterMinPoints`; source `maxzoom` is lowercase; `getClusterExpansionZoom`, `getClusterLeaves`, `getClusterChildren` return promises |
| Loading | `onDidFinishLoadingStyle`, `onDidFinishRenderingMapFully`, `onDidFailLoadingMap`; these callback payloads are `null`, not detailed error objects |
| Attribution | `attribution`, `attributionPosition`; optional `MapRef.showAttribution()` |

[Tagged Map source](https://github.com/maplibre/maplibre-react-native/blob/v11.4.0/package/src/components/map/Map.tsx), [Camera source](https://github.com/maplibre/maplibre-react-native/blob/v11.4.0/package/src/components/camera/Camera.tsx), [GeoJSONSource source](https://github.com/maplibre/maplibre-react-native/blob/v11.4.0/package/src/components/sources/geojson-source/GeoJSONSource.tsx), [Layer source](https://github.com/maplibre/maplibre-react-native/blob/v11.4.0/package/src/components/layer/Layer.tsx)

Native `Marker` has no `draggable`, `onDrag` or `onDragEnd` props. M2 supports actual pin selection/long press; M4 must implement and test a Gesture Handler overlay or another deliberate dragging mechanism, ending with `unproject` and one route recalculation. Do not promise web-only dragging as cross-platform completion. [Tagged Marker props](https://github.com/maplibre/maplibre-react-native/blob/v11.4.0/package/src/components/annotations/marker/Marker.tsx)

Use stable source/layer IDs. Peers use one clustered GeoJSON source, cluster circle/count layers and an unclustered layer; expansion zoom is queried on selection. Start with radius 50 and maximum cluster zoom 14, then tune against the 50-marker physical test. Route geometry uses `MultiLineString` so paused/lost-fix gaps stay disconnected, a soft wider casing and a sharp core. Enable `lineMetrics` for supported gradients. A dashed `draft` has no road ETA; only provider-returned `road` geometry claims snapping. Keep map/route/peer memo boundaries independent of HUD shared-value animation and update only the small user-position source on GPS fixes. No per-frame React paint updates.

## Web v6 and Metro

GL JS **6.11.2** is ESM-only and requires WebGL2. Import `Map`/`setWorkerUrl` and CSS in the web adapter, create the map after the DOM container mounts, use a `ResizeObserver`, and remove listeners/map/observer on cleanup. Use the same style/source/layer IDs and feature properties. Source `setData` and cluster queries return promises in v6; do not use obsolete callback overloads. Coalesce updates and generation-check awaited cluster results. [V6 migration](https://github.com/maplibre/maplibre-gl-js/blob/v6.11.2/docs/guides/v5-to-v6-migration-guide.md), [tagged GeoJSONSource](https://github.com/maplibre/maplibre-gl-js/blob/v6.11.2/src/source/geojson_source.ts)

The pinned distribution worker imports `./maplibre-gl-shared.mjs`. Copy **both** `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` from the installed package into `public/maplibre/`, before development/export, and call `setWorkerUrl` with a same-origin URL respecting the deployed base path. Retain BSD notices. Copying only the worker can mount an empty map with no tiles. This is the proposed Metro adaptation of MapLibre's documented static-worker pattern; Metro is not one of its published integration examples, so verify dev **and exported production**. [Official ESM/worker/CSS setup](https://maplibre.org/maplibre-gl-js/docs/)

Expo 57 supports package export conditions, async web imports and public worker paths; public files copy into exports. Keep native map imports out of web/server bundles, and browser-only construction out of SSR. Use `expo/metro-config` if custom configuration becomes necessary. Avoid reserved `public/assets`. Do not depend on inferred `import.meta.url` for worker discovery: provide the explicit URL. [Expo 57 Metro](https://docs.expo.dev/versions/v57.0.0/config/metro/), [public files](https://docs.expo.dev/guides/customizing-metro/#static-files), [reserved paths](https://docs.expo.dev/router/reference/reserved-paths/)

## Style and honest map states

Bundle one audited OpenFreeMap Liberty base style JSON with its license/provenance. A pure `mapStyle(theme, locale)` factory derives black/light colors from `src/lib/theme.ts`, including map-specific tokens added there. This avoids an initial remote style fetch and duplicate reskin colors. Generated JSON exports, if used, come from that factory. Preserve vector TileJSON `https://tiles.openfreemap.org/planet`, glyph template `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` and the captured sprite URL; do not freeze changing tile archive URLs. Background/land/water stay black in dark mode, roads use neutral strokes and map labels use readable neutral colors. Light mode derives corresponding theme values. [OpenFreeMap quick start](https://openfreemap.org/quick_start/), [style source/license](https://github.com/hyperknot/openfreemap-styles)

Use locale-dependent name fallbacks (`name:th`/`name:en`, then `name`, then Latin/non-Latin alternatives) only on appropriate text layers; missing translations retain real names. Prior research verified the Noto Thai glyph ranges, not Thai shaping/collision on devices. UI Anuphan/Manrope fonts are independent of map glyphs. Keep upstream data attribution and OpenFreeMap/OpenMapTiles/OSM notices visible above tabs/sheets in either orientation. Geoapify notices accompany its search/route output when M4 is enabled.

| State | Actual behavior |
| --- | --- |
| Initial/style loading | Neutral black/light surface and localized loading UI; retain loaded renderer while overlays change. Style-loaded permits source/camera setup; first fully rendered frame marks native visual readiness. Timing is measured, not assumed. |
| Location denied/unavailable | Map remains pannable, saved routes/pins usable; root shows permission/retry/settings action. Never invent a user coordinate or silently reprompt on map mount. |
| Basemap request errors | Preserve local geometry/last viewport; show retry and tile warning. Native failure payload has no reason: do not claim diagnosed network/credential errors from it. No upstream URLs/key-bearing errors in user messages. |
| Offline | Display cache if available and local route/ride geometry. Explain unavailable tiles/search; recording continues if GPS remains usable. No guaranteed downloaded/offline basemap or bulk tile prefetch. |
| Unsupported | WebGL2/native-module capability state with useful text/retry/build guidance. Never substitute a static image and call it an interactive map. |
| Retry/theme/locale | Reinstall overlay sources after style load, preserve viewport, dispose outdated listeners/queries; one status notification per meaningful transition. |

Root supplies online state. A tile error alone is not proof the device is offline. The adapter signals renderer status; root owns banners, search availability, glance locks and location rationale. `glance` blocks editing/long-press callbacks while preserving safe map/HUD access. Hardware frame preference is a request; iPhone 14 Plus is a 60 Hz device, so 120 Hz applies only to supporting hardware.

## Current recording risks and required boundaries

Inspected `src/useRideSession.ts`, `src/speedEngine.ts`, `modules/ride-location/src/sessionSupport.ts`, `modules/ride-location/ios/RideLocationModule.swift`, `src/lib/rideSubmission.ts`, the speed tab and related session tests. These are code findings, not speculative rewrites.

1. **Exclusive capture is already serialized and generation-safe.** Failed provider cleanup retains ownership, stale owners cannot stop a replacement, denied attempts preserve earlier evidence, and native start failure never falls back to weaker evidence. Preserve these invariants when moving the hook above navigation.
2. **Ride state/raw evidence are still screen-scoped memory.** Unmount ends capture; `RideEvidenceBuffer` caps at 8,000 samples/2 MiB and becomes truncated. Raw append happens before display filtering, correctly preserving invalid evidence. A disk journal must bound memory and retain sequence/provenance without treating capped evidence as eligible proof. Do not clone the entire evidence buffer to move the puck.
3. **`stop(): void` does not mean cleanup/flush completed.** A saved result needs awaited invalidation → provider release → journal drain → durable finalization. Disk/network failure cannot produce a truthful “saved/synced” success without the corresponding completed boundary.
4. **No durable pause/distance/active-time model exists.** Current UI timers restart from `Date.now()`; background stops the hook. Segments, elapsed active intervals, accepted-coordinate distance and recovery must be owned by the provider, not a tab timer.
5. **SpeedEngine is conservative.** It rejects stale/future/out-of-order fixes, weak accuracy and acceleration spikes; requires a three-fix window; exposes `null` on loss while retaining confirmed maximum. HUD interpolation is display-only. Never replace unavailable speed with zero or turn interpolated display values into evidence. Stationary/zero behavior requires meaningful tests if filtering changes.
6. **Android supports real foreground Expo GPS but lacks iOS proof fields.** The optional native module is Apple-only. Expo fallback reports nullable speed uncertainty/source flags and Android's mocked flag where available. The existing server/client verification path requires Core Location evidence; Android/web rides remain self-reported until a separate compatible verifier is implemented. Do not set missing uncertainty/flags to zero/false or relax the proof gate cosmetically.
7. **Existing proof upload is owner/session-bound and idempotent.** Preserve immutable raw bytes, capture identity, owner assertions, challenge binding and reserve/upload/queue/verify retry fencing. Ordinary ride-summary synchronization is a separate outbox operation and must not silently upload raw evidence or grant a verified rank.

## Journal contract for root

Expo 57 recommends `expo-sqlite ~57.0.3`. Native storage persists across restarts; use one serialized writer, WAL/foreign keys, bound parameters, and transactions for state + outbox changes. `execAsync` is for fixed schema, not interpolated user values. `withExclusiveTransactionAsync` is native-only; execute writes on its supplied transaction. Web support is alpha and requires WASM plus SharedArrayBuffer isolation headers. **Propose native SQLite / web IndexedDB adapters** under one journal interface, avoiding global COOP/COEP changes without an OAuth regression test. Unencrypted SQLite is not a secret vault. [Expo 57 SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)

Minimum persisted identities: immutable `ownerId`, logical `rideId`, per-acquisition `captureId`, `segmentId`, monotonically increasing receipt sequence, raw provider timestamp/fields/provenance, immutable active-vehicle snapshot, schema version and revision. Preserve duplicate/out-of-order raw timestamps as evidence; derived display/distance can reject them. Native course binding continues to identify one continuous capture, even when a paused logical ride resumes as another segment.

| Transition | Required durable boundary |
| --- | --- |
| Start | Persist owner/ride/capture intent; acquire the exclusive provider; generation/account-check after awaits; persist recording state before UI success. Samples arriving during acquisition belong to that reserved capture. Failed acquisition leaves an explicit recoverable attempt, not a fabricated ride. |
| Append | Serialize raw sample receipt and checkpoints. Bound queued memory/backpressure; on write failure stop/pause and expose unsaved state. Separate accepted positions/stats from unfiltered proof rows. |
| Pause | Invalidate callbacks first; await provider release and queued writes; close the segment and persist paused state. No coordinate bridge or active-duration accrual during pause. |
| Resume | New capture ID/segment under the same owner/logical ride; reset fix-confirmation continuity. Aggregate confirmed ride maximum without replaying old proof candidates. |
| Stop/save | Await release/drain; commit final local summary, segmented encoded geometry and immutable summary outbox ID/revision atomically. Only then display locally saved. Internet sync is independently retryable. |
| Restart | Recover starting/recording rows as interrupted/paused at the last persisted sample. Offer resume/save/discard; no automatic GPS restart, extrapolated path or claimed recording while the process was dead. |
| Account change/delete | Stop/drain before the next capture owner starts; enforce owner + auth epoch after every await. Never adopt another user's rows or let delayed A work mutate B state. Scope reads/writes/outbox retries by owner. |
| Retry | Reuse the same operation ID and payload revision; never create a second ride after a lost response. Distinguish locally saved, pending, syncing, synced and failed. |

Distance joins only accepted fixes inside a continuous segment. Break at rejected jumps/lost-fix gaps; never connect a pause or crash gap. Active time sums explicit active intervals, not first-to-last GPS time. Store UTC event timestamps and preserve clock anomalies rather than repairing raw evidence. Public 200 m privacy trimming belongs to server-approved public projections in M4; the local journal is private data.

Foreground-only interruption remains the truthful M2 policy: Swift and app configuration explicitly disable background location. Android `watchPositionAsync` can add a measured `timeInterval`; it is not a background task. Background/lock-screen recording requires an opt-in TaskManager/native lifecycle, permissions, durable task-safe writes and real-device acceptance later. [Expo 57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)

## M2 verification gates

- Pure geometry/style tests: coordinate order, invalid inputs, segmented gaps, true-black token output, bilingual fallback, stable source IDs and bounds behavior.
- Journal/provider tests: failed/canceled starts, awaited cleanup failures, append failure, pause/crash gap, restart recovery, duplicate/out-of-order raw preservation, denied restart preserving proof, A→B delayed work, idempotent lost-response summary retry.
- Browser dev and exported build: worker + sibling both fetched, real OpenFreeMap vector tiles, pan/zoom/recenter, source replacement, theme/locale, denial/offline/unsupported states and visible attribution; no fake GPS/peers.
- Native builds: pinned module/plugin compile on iOS and Android; runtime tests remain separate. Physical tests cover native GPS semantics, Thai marks, orientation/insets, permission/revocation/background interruption, 50 markers + route with HUD active, startup/FPS and a 30-minute recording/memory/battery session.

No missing key blocks the basemap. Geoapify secret is confirmed saved but authenticated routing/search is M4 and still needs deployed endpoint acceptance. Android ID/build distribution and physical devices remain explicit native acceptance gates; code/typechecking/browser review alone cannot certify them.
