# M4 route response acceptance — 1 October 2026

This is a bounded diagnostic record. A consented road request initially returned HTTP200 upstream but failed at the `normalize` stage with a distance-unit mismatch; no SQL finish result was cached. The static diagnostic at06:54:56UTC confirmed `distance_units_lowercase_meters`. Canonical normalization now accepts exactly `Meters` (documented) and `meters` (observed), and metric cost extraction uses the same pair. No abbreviated, imperial, missing or unknown value is accepted, and no default unit is invented.

The current documented contract is [Geoapify Routing API outputs](https://apidocs.geoapify.com/docs/routing/): GeoJSON `FeatureCollection`; each route feature has `MultiLineString` geometry, with one line per leg; feature properties include full `distance`, `distance_units` (`Meters` or `Miles`) and `time` in seconds. The maintained request fixes `units=metric`, basic free-flow routing and GeoJSON format. Request waypoints use latitude,longitude; GeoJSON positions use longitude,latitude. No paid details/avoid/elevation option is requested.

Current normalizer requirements:

| Field | Required shape or bound |
| --- | --- |
| `type`, `features` | `FeatureCollection`, array; empty route array reports `NO_ROUTE` |
| `features[0].geometry` | `MultiLineString`, 1–32 separate parts |
| Each part | 2–4096 positions; 10000 total across all parts |
| Each position | Exactly two finite numbers, longitude −180…180 and latitude −90…90 |
| `properties.distance_units` | Exactly `Meters` or empirically observed `meters`; `m`, imperial, missing and unknown values remain rejected |
| `properties.distance` | Finite nonnegative numeric metres, ≤450000; known longer work is reconciled before `ROUTE_DISTANCE_LIMIT` |
| `properties.time` | Finite nonnegative numeric seconds, ≤604800 |
| Provider response | Streamed UTF-8 JSON ≤1MiB with an8s network deadline; no redirects |
| Returned app data | Whitelisted segments, metric summary, server time/attribution and server-issued token/hash only |

Extra provider request/waypoint/step/key properties never enter the app response or diagnostic logs. Gaps remain separate parts; no endpoint connector is invented. Ordinary planning supplies no evidence or ranked result.

Diagnostics contain only fixed local stage enums (`auth`, `claim`, `upstream`, `read`, `reconcile`, `normalize`, `finish`), numeric upstream HTTP status, a bounded SQL error code and a whitelisted reason. Unit reasons are `distance_units_lowercase_meters`, `distance_units_m`, `distance_units_absent`, `distance_units_imperial` and `distance_units_other`. They reveal a category only. Never log the actual unit string, provider body, URL, token, UID, pins, query or error message. Other reasons distinguish collection/feature/geometry/part/coordinate/count/duration bounds without logging their values.

The Edge passes the validated Auth actor to each service RPC. Reconcile and finish receive exactly the **claimed lease UUID**, not a call UUID or request hash. SQL resolves `cache.call_id` internally under that owner and active lease, raises reserved costs only and never refunds. Tests pin exact RPC names/argument keys, force reconcile and finish SQL failures, prove no later cache commit, and verify that diagnostic objects omit private error text. PGlite exercises actual claim/reconcile/finish definitions, service-only grants, expiry and owner boundaries; these tests do not replace the hosted provider response check.

The deployed006 source is immutable. This observed-shape fix changes only canonical Edge/shared normalization, with tests proving the two literal spellings produce the same metric result and that lowercase work is reconciled before finish. All other bounds and public error shapes remain unchanged. A necessary SQL correction would require a new additive migration. Updating diagnostics does not authorize reading a secret or changing the quota/consent/privacy rules.

After deploying the final checked bundle, the consented public-landmark scooter route from Lumphini Park Gate3 to CentralWorld rendered real road geometry,4.1km and an estimated8minutes. Reload preserved the draft and calculation. Reverse created the second cache result; the second reverse/undo sequence left aggregate counts unchanged at9 admitted calls and2 cached road results. No synthetic route was saved into the user's cloud account. Exact owner save/second-device acceptance remains a separate test with a genuine route or agreed disposable account; successful routing/cache acceptance does not imply that test ran.
