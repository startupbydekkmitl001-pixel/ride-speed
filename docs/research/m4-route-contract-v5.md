# M4 route contract — V5

Prepared 1 October 2026. This contract does not claim a deployed provider function or physical-device acceptance. Existing migrations 001–005 remain immutable; implementation belongs to additive 006 and new Edge/shared modules.

## Authenticated provider boundary

One `route-service` POST endpoint validates the current Bearer token through project Auth `getUser`. It never accepts an owner, provider URL, key, arbitrary HTTP options or verification claim. The server key remains `GEOAPIFY_API_KEY`. Requests require explicit `consent: true` to transmit the supplied query/pins to Geoapify. Automatic launch positioning stays local to the map; it does not invoke search/routing.

```ts
type Coordinate = { latitude: number; longitude: number };
type SearchRequest = { operation: 'search'; query: string; language: 'th'|'en'; consent: true; proximity?: Coordinate };
type RoadRequest = { operation: 'route'; stops: Coordinate[]; profile: 'scooter'|'motorcycle'|'drive'; consent: true };
type SearchResult = { items: { id: string; label: string; subtitle: string; latitude: number; longitude: number }[]; attribution: string; cached: boolean };
type RoadResult = {
  routeToken: string; requestHash: string; provider: 'geoapify'; profile: RoadRequest['profile'];
  segments: Coordinate[][]; distanceMeters: number; durationSeconds: number;
  calculatedAt: string; attribution: string; cached: boolean;
};
```

Queries contain 3–120 Unicode codepoints after NFC normalization/whitespace collapse; at most five results. Debounce 400 ms and discard stale responses by request generation plus AuthScope identity. Routes accept 2–12 ordered stops; every coordinate is finite and in range. Recalculate after pin drag ends. Returned MultiLineString parts stay disconnected. This pilot exposes basic metric, free-flow routing only: no live traffic, elevation, route-details, arbitrary avoidance or stop optimization. Provider route tokens are owner-bound opaque UUIDs; a save copies server-held geometry and checks exact stop coordinates/profile/category. A client cannot label its own geometry as provider-produced.

Search caching is owner-private for 24 hours; route caching is owner-private for seven days. Exact normalized request hashes include language and ordered pins/profile. No public shared cache contains private coordinates or query text. Atomic server budgets reserve before egress: per-owner allowance, a shared rolling 24-hour allowance below the published free quota, and fewer than five requests per rolling second. Failed/timeout requests retain their reserved budget because upstream work may have occurred. Same-request lease coalescing bounds concurrent misses. Cache hits do not consume provider credits but retain Auth/deletion checks. Retention cleanup runs on the bounded claim path and account deletion purges all owner cache/query/result data.

Errors: `AUTH_REQUIRED`, `INVALID_REQUEST`, `REQUEST_TOO_LARGE`, `NO_ROUTE`, `ROUTE_DISTANCE_LIMIT`, `QUOTA_EXCEEDED`, `THROTTLED`, `PROVIDER_UNAVAILABLE`, `SERVER_CONFIGURATION`, `ACCOUNT_DELETION_PENDING`. No private upstream URL, key, coordinate or response body enters logs or returned error text. The Thailand pilot filters search to Thailand, accepts at most 200 km summed straight-line pin distance and at most 450 km returned road distance. These are app limits, not a claim that all road-access restrictions are correct. It reserves three times the basic waypoint credit estimate, caps each owner at 150 reserved credits per rolling 24 hours and the whole project at 2,700, with four reservations per rolling second. Provider daily-reset timing is not assumed; the rolling window leaves margin and failed egress remains metered.

## Saved documents and immutable operations

```ts
type RouteStopV1 = { lat: number; lng: number; label: string; place_id?: string };
type RouteDocumentV1 = {
  schema_version: 1; title: string;
  category: 'scooter'|'motorcycle'|'car'|'bicycle';
  visibility: 'private'|'friends'|'public'; stops: RouteStopV1[];
  source: { kind: 'road'; routeToken: string }
        | { kind: 'recorded'; segments: string[] } // independently encoded polyline5 parts
        | { kind: 'draft' }; // compatibility/import only; no road ETA claim
};
type RouteSyncDraft = { operationId: string; routeId: string; expectedRevision: number; document: RouteDocumentV1 };
type RouteDeleteDraft = { operationId: string; routeId: string; expectedRevision: number };
type RouteSyncAck = {
  operation_id: string; route_id: string; action: 'save'|'delete';
  applied_revision: number; current_revision: number|null;
  document_sha256: string|null; synced_at: string;
};
type RouteSnapshot = {
  id: string; owner_id: string; revision: number; document: RouteDocumentV1;
  segments: Coordinate[][]; distanceMeters: number|null; durationSeconds: number|null;
  geometryHash: string|null; provider: 'geoapify'|'recorded'|'draft';
  calculatedAt: string|null; attribution: string|null; updated_at: string;
};
type RouteCursor = { updated_at: string; id: string };
type RoutePage = { items: RouteSnapshot[]; next_cursor: RouteCursor|null };
type RouteProjection = {
  id: string; owner_id: string; revision: number; title: string;
  category: RouteDocumentV1['category']; visibility: RouteDocumentV1['visibility'];
  segments: Coordinate[][]; geometryStatus: 'trimmed'|'hidden';
  privacyTrimMeters: 200; geometryHash: string|null;
  provider: 'geoapify'|'recorded'|'draft'; attribution: string|null;
};
```

RPCs: `rs_save_route_v2(p_operation uuid,p_id uuid,p_expected_revision integer,p_document jsonb)` and `rs_delete_route_v2(p_operation uuid,p_id uuid,p_expected_revision integer)` return `RouteSyncAck`. `rs_get_route_operation(p_operation uuid)` returns the exact owner receipt or null. `rs_get_route_owner(p_id uuid)` returns `RouteSnapshot|null`; `rs_list_routes_owner(p_limit integer=30,p_before timestamptz=null,p_before_id uuid=null)` returns `RoutePage`, ordered descending `(updated_at,id)`, capped at 50. `rs_get_route_projection(p_id uuid)` returns `RouteProjection|null` only while currently authorized.

Persist the entire detached immutable operation before RPC egress. Revision 0 creates; a later revision requires explicit CAS. Exact operation replay returns its applied revision and current revision without quota/write or overwriting newer edits. An operation UUID with changed payload/action/route/base fails `ROUTE_OPERATION_CONFLICT`. CAS fails `ROUTE_REVISION_CONFLICT`; never silently rebase an uncertain operation. Delete acknowledgements and tombstone receipts prevent a delayed create/save from resurrecting a removed route ID. Owner deletion uses the existing account lock/fence and removes receipts/documents/cache before Auth deletion. Profile completion is optional for private save.

Titles 1–80 nonblank Unicode codepoints, stop labels 1–80, place IDs ≤300, exact keys, no control characters, 2–12 stops for road/recorded sources and 0–12 for genuine incomplete drafts; documents ≤512 KiB, ≤200 live owner routes, ≤32 recording parts, ≤4,096 points/part and ≤10,000 total decoded points. Draft geometry is absent: connecting raw pins never becomes a published road line or provider ETA. Category is a vehicle type, not cc. No save, source token, category, checkbox or revision creates closed-course approval or verified evidence. Any route edit clears existing approval; later M5 invitations bind immutable revision/hash.

## Trusted sharing and legacy remediation

Private is the save default until the user explicitly chooses another audience. Friend visibility requires a current accepted, unblocked friendship; explicitly targeted legacy shares remain generation-bound. Public means signed-in app readers and is revoked by block/delete/account fence. Nonowners never read full stops, original place IDs, endpoint labels, full geometry, original bounds, exact provider time, full distance/ETA or hidden coordinates from another path.

The trusted projection trims at least 200 m of traversed geometry at each end using geodesic distance/interpolation, preserving segment breaks; it never trims by vertex count or draws through a recording gap. Geometry at or below 400 m is fully hidden. Bounds/thumbnails/export must derive only from the returned projection. This minimum endpoint trim does not promise anonymity or conceal repeated visits; the UI offers private visibility and a share preview.

Migration preserves every existing owner raw route in `ride_private.route_documents` before sanitizing public `rs_routes.stops`. Existing public route rows become safe metadata/projections, so old authorized row readers and generation-bound shares retain compatibility. New owner RPCs recover exact legacy stop names/pins. Existing challenge/post snapshots are stripped of raw geometry/stops and future compatibility publishers attach only sanitized projections. No legacy snapshot is treated as evidence. Additive functions keep fixed search paths and explicit grants/RLS; old anti-cheat/course/session gates remain intact.

## Primary sources and practical limits

Current official routing docs specify latitude/longitude request order and longitude/latitude GeoJSON output order, MultiLineString legs, scooter/motorcycle/drive profiles, and estimated free-flow time. Thai maneuver-language support is absent; this milestone does not mislabel English instructions as Thai. Basic route credits depend on waypoint count; added details/avoidance and long routes can cost more. Restrict this pilot and budget conservatively. [Geoapify routing documentation](https://apidocs.geoapify.com/docs/routing/), [autocomplete documentation](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/), [published pricing](https://www.geoapify.com/pricing/).

Tests must cover owner/profile-optional save, foreign token, stop/profile mismatch, CAS/receipt replay/deletion tombstone, >200 m geodesic clipping and short routes/disconnected gaps, legacy snapshot remediation, blocked friend/share-generation revocation, cache isolation/lease/retry/rolling budget and malformed/oversized upstream responses. Physical route access correctness, native pin gestures and 60 fps remain measured acceptance gates, separate from source tests.

Credit estimates do not attest provider billing: a detour can exceed the returned450km limit before rejection. Lease-bound service reconciliation raises known metric-distance cost before rejecting that response and never refunds. Timeout/invalid/oversized responses can leave actual charges unknown. Keep the configured Free plan and observe dashboard usage; the app counter does not guarantee provider allowance preservation. This follows the official long-distance pricing caveat rather than hiding it behind a successful-route-only estimate.
