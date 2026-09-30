# Map platform research — V5

Checked **1 October 2026**, Asia/Bangkok. Research and architecture recommendation; this document does not mean a native build, routing endpoint or device acceptance test has passed.

## Selected architecture

The user selected **MapLibre + OpenFreeMap + Geoapify**, superseding the earlier free Apple Maps choice and the BUILD SPEC's recommended Google provider. Use MapLibre Native for iOS/Android and MapLibre GL JS for the web review. OpenFreeMap supplies the basemap; an authenticated Supabase Edge Function supplies Geoapify search and road routes. Keep every map interaction inside Ride Speed.

This supports a shared, genuinely black map style without Google billing. It is suitable for a limited production pilot, subject to service quotas and attribution. Free public services do not provide a production uptime guarantee. OpenFreeMap explicitly offers no SLA; Geoapify's Free plan provides best-effort support. [OpenFreeMap](https://openfreemap.org/), [Geoapify pricing](https://www.geoapify.com/pricing/)

## What exists in this repository

At inspection, `ExpoRideSpeed` uses Expo **57.0.26**, React Native **0.86.3**, React **19.2.3**, Reanimated **4.5.1** and Worklets **0.10.1**. Its `RouteMap.tsx` is a bounded Apple Maps view on iOS; Android/web display a coordinate fallback. Existing connecting lines join the stops and are not road-snapped geometry. The map has no address search or road ETA.

`modules/ride-location/expo-module.config.json` declares only `apple`. Preserve its stronger iOS Core Location evidence; Android needs a real Expo Location implementation rather than an unavailable native-module call. Current capture stops on background and keeps the active ride in memory. Durable restart recovery and opt-in background capture are separate work.

The real Singapore Supabase project and Google identity login already exist. The deployed foundation has profiles, friends/blocks, pinned routes, challenges, posts, evidence verification and private presence authorization. It does not yet implement the complete vehicle catalog, road route summaries, route-time results, live-race synchronization or full community interactions requested in V5. Extend it with **new additive migrations**. `backend/DEPLOYMENT.md` records a dashboard-applied migration that must not be blindly applied again.

## Installation and native constraints

| Dependency | Verified version / compatibility | Implementation implication |
| --- | --- | --- |
| `@maplibre/maplibre-react-native` | **11.4.0**; React Native ≥0.80, React ≥19.1, Expo peer ≥54; v11 supports only the New Architecture; Android API ≥23 | Existing RN/React satisfy published requirements. This is compatibility evidence, not a successful native compile. |
| MapLibre Native inside the wrapper | Android **13.6.1**, iOS **6.31.0** in current setup documentation | Validate platform-specific expressions and callbacks against these versions. |
| `maplibre-gl` | **6.11.2** | Web v6 is ESM-only and requires WebGL2. Configure its worker for the actual bundler. |
| Reanimated / Worklets | Existing **4.5.1 / 0.10.1** | Official compatibility includes RN 0.86. Keep SDK-compatible versions. |
| Gesture Handler / Skia | Expo 57 recommends **~2.32.0 / 2.6.2** | Install with Expo's resolver. Do not select a newer npm version solely because it is latest. |

[Native release](https://github.com/maplibre/maplibre-react-native/releases/tag/v11.4.0), [native requirements](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/), [web release](https://github.com/maplibre/maplibre-gl-js/releases/tag/v6.11.2), [web v6 migration](https://github.com/maplibre/maplibre-gl-js/blob/main/docs/guides/v5-to-v6-migration-guide.md), [Reanimated compatibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/), [Expo 57 Gesture Handler](https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/), [Expo 57 Skia](https://docs.expo.dev/versions/v57.0.0/sdk/skia/)

Native setup:

```sh
npx expo install @maplibre/maplibre-react-native@11.4.0
npx expo install react-native-gesture-handler @shopify/react-native-skia
```

Add `@maplibre/maplibre-react-native` to the existing Expo config's `plugins`, then regenerate and rebuild the native binary. **Expo Go cannot load this library.** Use CNG/config plugins rather than editing generated native projects. Current free GitHub macOS builds can produce the iOS binary; an Android application ID, Gradle build and signing/distribution path still need configuration. [Official Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/)

V11 code uses `Map`, `GeoJSONSource` and `Layer`; old `MapView`, `ShapeSource` and specialized layer examples need migration. Layers use MapLibre style-spec `paint`/`layout`. `lineMetrics` enables a route gradient. Cluster friends in a GeoJSON source; keep the base map stable while the speed HUD reads shared values. Hardware frame-rate preferences are requests, not evidence of 60/120 fps. [V11 migration](https://maplibre.org/maplibre-react-native/docs/setup/migrations/v11/), [GeoJSON source](https://maplibre.org/maplibre-react-native/docs/components/sources/geo-json-source/), [Map API](https://maplibre.org/maplibre-react-native/docs/components/map/)

### Exact V11 implementation API

Import `Map`, `Camera`, `GeoJSONSource`, `Layer` and types `MapRef`, `CameraRef`, `GeoJSONSourceRef` from the native package. Bind refs with `useRef<… | null>(null)`.

| Action | V11 interface |
| --- | --- |
| Add a pin | `Map.onLongPress`; read `event.nativeEvent.lngLat` as `[longitude, latitude]`; `point` is the pixel coordinate |
| Detect user pan | `onRegionDidChange`; `event.nativeEvent.userInteraction`, `center`, `zoom`, `bearing`, `pitch`, `bounds` |
| Ready/error UI | `onDidFinishLoadingStyle`, `onDidFinishRenderingMapFully`, `onDidFailLoadingMap` |
| Source selection | `GeoJSONSource.onPress`; feature data is in `nativeEvent.features`; call `event.stopPropagation()` to prevent another map pin |
| Viewport ref | `MapRef.getViewState()`, `project([lng,lat])`, `unproject([x,y])`; these return promises |
| Recenter | `CameraRef.easeTo({center:[lng,lat],zoom:16,duration:300})`; `jumpTo` is immediate; `flyTo` is optional |
| Fit route | `CameraRef.fitBounds([west,south,east,north], {padding:{top:80,right:24,bottom:280,left:24},duration:300,easing:'ease'})` |
| Camera defaults | `Camera.initialViewState` uses `center`/`zoom`; tracking modes are `default`, `heading`, `course` |
| Route / marker layers | `GeoJSONSource data={geoJSON}`; nested `Layer type="line"` with `paint` such as `line-color`/`line-width`, `layout` such as `line-cap`/`line-join` |
| Cluster selection | `GeoJSONSourceRef.getClusterExpansionZoom(clusterId)` then `CameraRef.easeTo`; do not mount 50 complex React view markers |

The current Camera documentation's example still shows an obsolete three-argument `fitBounds` call. **The 11.4.0 TypeScript interface and implementation take two arguments**, with padding and duration inside the options object. Follow the installed version's declarations rather than that stale example. [Tagged Camera source](https://github.com/maplibre/maplibre-react-native/blob/v11.4.0/package/src/components/camera/Camera.tsx), [tagged press-event type](https://github.com/maplibre/maplibre-react-native/blob/v11.4.0/package/src/types/PressEvent.ts), [tagged Map source](https://github.com/maplibre/maplibre-react-native/blob/v11.4.0/package/src/components/map/Map.tsx), [Layer API](https://maplibre.org/maplibre-react-native/docs/components/layer/)

Published marker documentation does not establish a V10-style built-in drag callback. Verify the pinned package before choosing pin dragging; a deliberate draggable overlay can convert final pixels using `MapRef.unproject`, update the stop once, and then request the road route. Native map gestures and overlay gestures must be tested together. [Marker API](https://maplibre.org/maplibre-react-native/docs/components/annotations/marker/)

## Public style, exact endpoints and Thai labels

Start from the officially documented Liberty style, derive and bundle Ride Speed's own black/light style JSON, and retain upstream notices:

```text
Style:   https://tiles.openfreemap.org/styles/liberty
Vector:  https://tiles.openfreemap.org/planet
Glyphs:  https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf
Sprite:  https://tiles.openfreemap.org/sprites/ofm_f384/ofm
```

The vector URL is TileJSON and follows current tiles; do not freeze its changing weekly tile archive URL. The sprite address above was observed in today's JSON and can change; preserve the bundled style's resolved reference or update it deliberately. Liberty is a starting material system, not the requested final palette. Set background/land to `#000000`, distinguish roads with restrained neutral strokes and keep POI colors minimal. Do not lay an opaque black view over the map to simulate custom styling. [OpenFreeMap quick start](https://openfreemap.org/quick_start/), [upstream style source and license](https://github.com/hyperknot/openfreemap-styles)

Observed TileJSON label fields include `name:th`, `name:en`, `name:latin` and `name:nonlatin`, but individual features may omit translated names. Use a locale-dependent fallback expression and zero Thai letter spacing. The current Noto Sans Regular/Bold/Italic glyph range `3584-3839.pbf` was downloaded and decoded: each has 154 glyphs, including nonempty bitmaps for U+0E01, U+0E31, U+0E32, U+0E48, U+0E49, U+0E50 and U+0E59. Machine evidence is in `build/research/openfreemap-thai-glyph-check-v5.json`.

**Glyph coverage is verified; Thai shaping, tone-mark placement and label collision are not.** Check Bangkok street/place names on both native platforms and web. App UI fonts and the map's remote glyph fonts are separate pipelines; changing IBM Plex Sans Thai in the app does not change map labels automatically.

OpenFreeMap's public instance has no API key, registration or stated request/map-view limits and permits commercial use. It supplies tiles, not routing, traffic or search. Keep visible provider/data attribution outside the bottom sheet and tab bar. The React Native wrapper is MIT; retain notices and respect OSM's ODbL/data attribution. [OpenFreeMap FAQ](https://openfreemap.org/), [wrapper license](https://github.com/maplibre/maplibre-react-native/blob/main/LICENSE.md), [OSM copyright](https://www.openstreetmap.org/copyright)

## Geoapify account, limits and cache policy

The official account/project dashboard is **[Geoapify MyProjects](https://myprojects.geoapify.com/)**. The owner signs in, creates a Free project, then uses its API Keys section. No credit card is required. Store the resulting key as Supabase Edge secret `GEOAPIFY_API_KEY`; do not put it in the public repository, mobile bundle, `EXPO_PUBLIC_*`, chat or screenshots. API restrictions are optional; browser referrer restrictions cannot protect an Edge Function's server-to-server request. [Official key setup](https://apidocs.geoapify.com/docs/routing/)

| Free allowance / cost | Verified published value |
| --- | --- |
| Account-wide budget | **3,000 credits/day**, up to **5 requests/sec** |
| Address autocomplete / forward / reverse geocoding | **1 credit/request** |
| Basic route under 500 km | **waypoint count − 1** credits |
| Map matching | **1 credit per 100 waypoints** |
| Geoapify map tiles | **0.25 credit/tile**; use OpenFreeMap instead |

Commercial production use is allowed within the plan's features, credits/rate limit and attribution requirements. Quotas are shared by all app users, not 3,000 credits for each user. [Pricing](https://www.geoapify.com/pricing/), [per-API costs](https://www.geoapify.com/pricing-details/)

Geoapify's homepage FAQ expressly allows storing/caching API results, and its Routing product page allows storing/redistributing route results based on open data. Preserve required data-source notices and `Powered by Geoapify` near service-provided information. Cache rights do not waive location privacy or ODbL obligations. [Cache/store FAQ](https://www.geoapify.com/), [Routing reuse statement](https://www.geoapify.com/routing-api/), [terms](https://www.geoapify.com/terms-and-conditions/)

Implementation policy: debounce search 400 ms after ≥3 characters; cache exact normalized queries with coarse location bias and locale for 24 hours. Recalculate after drag ends, not every drag frame. Cache routing by ordered stops, travel profile, avoidance settings and provider version for seven days; saved geometry can persist with a calculation timestamp and explicit recalculation action. These retention durations are app decisions, not provider-mandated limits. Private route coordinates must not enter public cache objects.

Avoidance, extra route attributes, elevation, stop optimization and long distances increase credits. The detailed routing pricing text and long-distance examples are not entirely consistent with the general pricing calculator at boundary/rounding cases. Budget conservatively, measure actual dashboard usage, and clarify provider billing before enabling those options at scale. Do not assume every route costs one credit. [Detailed routing pricing](https://apidocs.geoapify.com/docs/routing/)

## Proposed Edge API contracts

These are proposed Ride Speed endpoints, not deployed APIs. Authenticate through Supabase Auth `getUser`, validate every input, allow only known operations, bound request sizes, and enforce account-wide and per-user quotas atomically. A proxy that accepts arbitrary provider URLs is unacceptable. Return stable app error codes and omit key-bearing upstream URLs from logs/errors.

| App endpoint | Upstream / normalized result |
| --- | --- |
| `POST /functions/v1/map-search` | `/v1/geocode/autocomplete`; input query, locale, optional proximity; return `items[{id,label,subtitle,latitude,longitude}]`, attribution and cache status |
| `POST /functions/v1/map-route` | `/v1/routing`; input ordered stops, explicit profile, optional approved avoidance; return road geometry, `polyline6`, `distanceMeters`, `durationSeconds`, maneuvers, provider timestamp, attribution and cache status |

Search requests can use `lang=th`, `filter=countrycode:th`, `bias=proximity:longitude,latitude` and `limit=5`. Default results are a GeoJSON FeatureCollection with point geometry and properties such as `place_id`, `formatted`, `address_line1`, `address_line2`, `lat` and `lon`. Missing properties must have a safe fallback. [Address autocomplete reference](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/)

Routing uses `waypoints=latitude,longitude|latitude,longitude`, whereas returned GeoJSON coordinates use `[longitude,latitude]`. Request metric units and `details=polyline6,instruction_details`. The response's route feature is a MultiLineString; properties contain distance, time in seconds and legs/steps. Do not flatten disconnected legs in a way that draws a false connecting segment. Display only successful road routes as road routes; an offline straight connection needs a distinct draft treatment. [Routing response reference](https://apidocs.geoapify.com/docs/routing/)

Profiles include `drive`, `scooter` and `motorcycle`. Choose deliberately for PCX160, S1000RR and Civic RS and verify representative Thailand routes, especially forbidden expressways. Do not infer the profile solely from cc. The published routing language list **does not include Thai**, and `approximated` traffic is not live traffic. Localize maneuver types in the app, retain road names, and disclose English fallback when an instruction cannot be safely represented. Avoid flags are preferences, not an absolute guarantee that a restricted road is excluded. [Travel profiles](https://apidocs.geoapify.com/docs/routing/)

Expose distinct `AUTH_REQUIRED`, `INVALID_REQUEST`, `NO_RESULTS`, `NO_ROUTE`, `QUOTA_EXCEEDED` and `PROVIDER_UNAVAILABLE` states. Preserve cached saved routes during outages; do not silently substitute an external Maps handoff. Proposed global budget: stop new upstream calls at 2,700 credits/day to leave margin; serialize/limit upstream work below five requests/sec. Confirm the provider's daily reset timezone rather than assuming Bangkok leaderboard windows apply to quotas.

## Backend and store constraints

Supabase Free includes 500 MB database, 1 GB Storage, 50,000 MAU, 5 GB egress plus 5 GB cached egress, two million Realtime messages/month and 200 peak connections. Inactive projects can pause after one week; automatic backups and an SLA are absent. Configure operational exports and monitor consumption. These are limits, not proof that live racing will remain free indefinitely. [Supabase pricing](https://supabase.com/pricing/)

Realtime Free limits include 100 messages/sec, 100 channel joins/sec, 20 Presence messages/sec and five Presence calls per client per 30 seconds. Use low-frequency Presence lifecycle changes and separate bounded race-position Broadcast at 1–2 Hz. Fan-out multiplies traffic; measure actual message usage before expanding the pilot. [Realtime limits](https://supabase.com/docs/guides/realtime/limits)

Use private channels authorized by `realtime.messages` RLS. Authorization is cached at join, so revoking a friendship alone does not immediately revoke an existing subscriber. Preserve the existing generation-scoped friend channels and rotate/stop old broadcasts on block, ghost mode or revoked membership. A single global location/presence channel would conflict with existing privacy controls. [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization/)

Apple's login guideline calls for an equivalent privacy-preserving login option when qualifying third-party social login is offered. Sign in with Apple is the usual solution here, but requires native capability/provider configuration and appropriate Apple account access. UGC report/block, account deletion and permission explanations are store requirements, not optional visual polish. [App Store review rules](https://developer.apple.com/app-store/review/guidelines/), [Expo Apple Authentication](https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/), [Supabase Apple Auth](https://supabase.com/docs/guides/auth/social-login/auth-apple)

Background GPS requires permissions, native configuration and a top-level TaskManager task; termination/restart behavior is platform-dependent. Foreground Android tracking can use Expo Location now. Add background collection later with explicit consent, durable local storage, battery policy and a purpose that matches the permission wording. [Expo 57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)

## Declined alternatives and acceptance

Google's ordinary native Maps SDK currently has unlimited $0 map usage, but requires billing-enabled Cloud/key configuration; map IDs can trigger Dynamic Maps pricing. Routes Essentials has 10,000 free monthly requests, while two-wheeler routing is an Enterprise SKU. Google route results displayed on a map must use a Google map, so Google routing must not be mixed into this selected MapLibre implementation. [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [SKU rules](https://developers.google.com/maps/billing-and-pricing/sku-details), [Routes policies](https://developers.google.com/maps/documentation/routes/policies)

The prior Apple-iOS/Google-Android split cannot provide one fully custom black basemap and introduces Android billing configuration. Public Nominatim is not a substitute for product autocomplete: its policy forbids client autocomplete and caps total application traffic at one request/sec. [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)

The owner has created the Geoapify Free project, and the server secret has been confirmed saved by name/digest without exposing its value (2026-10-01). Search/routing still require a deployed, authenticated Edge proxy and a successful upstream integration check before they count as complete. M0 can proceed using real OpenFreeMap tiles and explicit unavailable-search/routing states. Later dependencies include Apple identity capability, Android distribution configuration, SMTP for public email registration, and two physical devices for race/privacy tests.

Before claiming map completion: compile both native targets; test live location on both, road routing and search with a real restricted key, denied permissions/offline/quota states, Thai label shaping, attribution visibility and viewport control. Profile pan/zoom with a road route and 50 clustered markers, HUD isolation and a 30-minute ride. Cold-start/60-fps/120-Hz targets remain **unmeasured** until physical-device traces exist. A browser review alone cannot verify them.
