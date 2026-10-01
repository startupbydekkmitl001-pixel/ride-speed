# Map adapters

`MapSurface` chooses MapLibre Native 11.4.0 on iOS/Android and MapLibre GL JS 6.11.2 on web. Both use the same app coordinates, segmented track/pin/authorized-peer source properties and overlay layer IDs. The public props/ref contract is in `MapSurface.types.ts`; no location watcher, permissions, auth, search request or routing request is owned by the renderer.

The caller must supply already-authorized, opt-in, nonexpired peers and the provider's validated location fix. Account changes must dispose/key the map by AuthScope generation. Theme, locale, route changes and GPS fixes must preserve its instance and viewport. A coordinate is never invented to fill a missing fix; the initial camera is a geographic browsing context, not user position.

`geometry.ts` preserves every recorded part and splits at invalid fixes. MultiLineString never connects pauses or GPS gaps. A draft line is dashed and carries no claim of road snapping or ETA. Marker hitboxes use native 44 pt defaults; the parent provides a 44 pt accessible alternative list for pins/peers. Peer clustering uses one source, radius 50, max cluster zoom 14; no sample people are present in product code. Source updates coalesce to the most recent geometry while web workers are busy.

Native needs the MapLibre config plugin and a new development/release binary; Expo Go/older binaries report `unsupported/native-module`. Camera commands apply only after style readiness and retain the latest intent before that boundary. Native v11 fitBounds has no maxZoom parameter: nearby fits use a calculated capped center/zoom, while other bounds use the actual two-argument fitBounds API. This does not restrict later gestures. Queries return null before ready, after disposal, or when a native result belongs to a superseded style.

Web requires WebGL2. Browser construction/imports happen after mount, with cleanup of the map, source writers, pointer timers and ResizeObserver. MapLibre CSS is imported by the root layout. Before web dev or export, run `npm run copy:map-workers` (or `node scripts/copy-maplibre-workers.cjs`). That script copies the installed worker **and its imported shared module**, BSD notice and deterministic digest manifest into public/maplibre. The adapter uses a same-origin worker URL respecting Expo experiments.baseUrl; no CDN worker or API secret is involved.

The bundled, unmodified OpenFreeMap Liberty JSON is captured in styles/ with digest/source URLs in provenance.json and the upstream MIT/BSD/CC BY notices. The runtime factory derives pure-black/light tokens from lib/theme.ts, removes the uncontrolled low-zoom shaded raster, keeps live TileJSON/glyph/sprite endpoints, and substitutes named-label language fallbacks without changing road references. Thai named labels have no letter spacing and use the theme Thai leading. Upstream Noto glyphs are independent of the app UI fonts. Colors are never embedded in the derived style as a second theme palette. Text/data attribution stays above the caller's bottom insets on both renderers.

The installed renderer validators check all four theme/language factory outputs. Tests cover coordinate order, invalid measured fixes, antimeridian and capped bounds, disconnected parts, stable markers, actual offline/ready/tile states, reduced motion, stale/disposed source writes and worker base paths. Dev/export browser rendering and iOS/Android builds are additional gates; tests do not establish physical Thai shaping, permission behavior, 50-marker frame rate, launch timing or battery usage. Cached tiles may remain useful offline; no bulk prefetch or guaranteed offline basemap is provided.

## Live Friends presentation

`NativePeerSource` writes bounded, consent-aware interpolation to the MapLibre
animatable source using Reanimated. There is no React update per animation frame.
An independent UI-thread deadline hides the source if JavaScript is delayed.
Web uses transform-positioned markers above cluster zoom and immediately disposes
them on revocation. `PeerPresentation` preserves sequence/topic/member/consent
identity; duplicate snapshots never renew an expiry deadline. Positions are for
display only and never enter ride evidence or decide race results.

`/map-vehicle` uses actual Garage selection and original generic category meshes.
Source, CC0 provenance and sprite/glTF regeneration live in `assets/vehicles`.
The current v1 positions contract has no peer vehicle/avatar/speed metadata.
Do not infer it or label self-reported positions verified.

For a local-only check, run the development app and open `/live-map-preview`.
Three explicitly labeled synthetic riders move without GPS capture or upload;
pause, hide/show and focus controls exercise interpolation and removal. This route
redirects home in distribution builds. It is not an end-to-end live-sharing test.

Official APIs and provenance: [MapLibre React Native Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/), [GL JS docs](https://maplibre.org/maplibre-gl-js/docs/), [OpenFreeMap quick start](https://openfreemap.org/quick_start/), [upstream styles/license](https://github.com/hyperknot/openfreemap-styles), [Expo 57 Metro](https://docs.expo.dev/versions/v57.0.0/config/metro/).
