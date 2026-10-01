# In-app route planning

`RouteBuilder` is a controlled map screen. The root adapter owns account-scoped durable draft storage, saved operations and consent. Remount the screen on AuthScope generation or a different edited route. `onChange` must publish the current draft promptly and serialize its durable writes; `onSave` returns true only after the local immutable operation is durable. Failed writes keep the editor open and expose a bounded error code.

Optional `onSignIn` adds an account entry button beside authenticated search/routing errors. It closes the current sheet before handing navigation to the adapter and honors the movement lock. The builder itself never redirects or calls a router; `onClose` is reserved for its explicit back-to-map controls.

`BuilderDraft` keeps local pin IDs separate from the server document. Pin, ordering and category changes must clear its geometry/token. The pure history restores pin edits without reviving an expired road token; road metrics come only from the authenticated provider result. Metadata changes preserve the current geometry. Recorded parts remain separately encoded and separately rendered. Imported bicycle routes do not request motor-vehicle routing.

Search and road calculation require explicit provider consent; nothing is sent at launch. Search waits 400 ms, is limited to Thailand, and each request is bounded and canceled/discarded when its identity, owner, lock or screen changes. Route calculation waits 400 ms after pin changes and runs only after drag end. No result can write across an account generation. The current pilot limits are policy choices documented in the backend contract, not general provider limits.

`RouteDetail` takes either an owner document/cache or the authoritative `RouteProjection` returned by the server. A shared view renders only projection segments. It never reconstructs donor pins, full metrics or original bounds. Save/sync before requesting a share preview; server clipping is the privacy boundary.

Native MapLibre 11.4 uses one selected `ViewAnnotation` with native drag events and keeps other pins in GeoJSON. The web renderer uses one draggable MapLibre GL `Marker`. Neither path updates React on every drag frame; the end event validates map generation, selected ID, unchanged origin and edit mode before committing. A mode change removes the draggable marker. Stop-list controls provide the editing alternative to direct map gestures.

Verified API references: [native ViewAnnotation](https://maplibre.org/maplibre-react-native/docs/components/annotations/view-annotation/), [native v11 migration](https://maplibre.org/maplibre-react-native/docs/setup/migrations/v11/), [web Marker](https://maplibre.org/maplibre-gl-js/docs/API/classes/Marker/), plus the installed native/web implementation. Source tests prove request fencing and geometry semantics; native drag feel, real-device accessibility, battery and FPS still require device acceptance.

Run `node --experimental-strip-types --test tests/routeBuilder.test.mjs tests/routeProviderTransport.test.mjs tests/mapPinDrag.test.mjs tests/mapSurface.test.mjs`, then `npm run typecheck` and `npm run lint`. Real provider/SQL acceptance belongs to the hosted milestone checks; there are no shipped fake route results.
