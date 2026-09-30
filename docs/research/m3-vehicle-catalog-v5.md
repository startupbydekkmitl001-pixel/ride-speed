# M3 vehicle catalog research and import handoff

Reviewed 1 October 2026. This is a research handoff; no product, backend, package or hosted state was changed.

The same-day [primary-source catalog study](vehicle-catalog-v5.md) already documents **72 distinct model families: 21 scooters, 25 motorcycles and 26 cars**. It includes original Thai manufacturer/distributor HTML/PDF evidence in ignored `build/research/vehicle-*-v5.*`. Reuse that work rather than generate another list from vehicle badges or dealer estimates. These counts describe curated coverage, not measured popularity, dealer stock or every available vehicle.

The editable candidate is `build/research-v5/m3/vehicle-catalog.candidate.json`. The conversion script beside it reads the source study, validates distinct family counts, preserves published decimals and assigns the existing app category `bigbike` to its motorcycle rows. It deliberately does not import itself into the app.

## What was independently checked for this handoff

| Configuration | Checked evidence | Result and limit |
| --- | --- | --- |
| Honda PCX160 RoadSync Type / Standard Type | Cached manufacturer PDF specification image, `build/research/vehicle-honda-pcx160-v5-spec.png`, linked to [Thai Honda's original brochure](https://www.thaihonda.co.th/honda/laravel-filemanager/files/shares/2026/AW_PCX160_eCatalog_July2026-2.pdf) | The visible cc row is **156.93**. This is published precision, not a calculation from bore/stroke. The web reader could not fetch this PDF during the independent check; the earlier primary PDF/cache and its spec image were available and inspected. |
| BMW S 1000 RR | [BMW Motorrad Thailand technical data](https://www.bmw-motorrad.co.th/th/models/sport/s1000rr/technicaldata.html), reopened | **999 cc**. The page does not identify the owner's generation/year or optional M package. |
| Honda Civic e:HEV RS | [Honda Thailand specification](https://www.honda.co.th/civic/specification), reopened | **1993 cc**, explicitly under the e:HEV grades. This identifies a configuration, not the user's unspecified Civic RS. |
| Yamaha NMAX Standard / Tech Max | [Yamaha Thailand 2026 specification](https://www.yamaha-motor.co.th/commuter/nmax-2026/specification), reopened | **155 cc**, with an explicit named 2026 model heading and three trim choices. The starter is Standard; Tech Max requires a separate configuration ID. |
| Suzuki GSX-8R | [Suzuki Motosales Thailand](https://www.suzukimotosales.co.th/bikes/gsx-8r/), reopened | The independently reopened page confirms **775.9** in the summary and **776** in the detailed table. Keep the published precise value and retain the rounding note. |

Remaining candidate rows retain `verificationOrigin: same-day-primary-review-in-vehicle-catalog-v5.md` and `independentlyRecheckedForM3: false`. This distinguishes reuse of already reviewed primary evidence from fresh checks; it does not pretend every website was reopened in this handoff. Their selected specifications and sources are listed in the earlier study, and its source caches remain available for review before shipping.

The earlier [Civic Turbo RS official specsheet](https://www.honda.co.th/specsheet/AW%20CIVIC%20RS%20Specsheet%20A4.pdf) now returns **404** in this check. It is therefore a **withheld, unverified import candidate** in the JSON, with no cc value populated. Obtain an accessible official historical source and identify body/year before importing it. This is not evidence that the user's car is hybrid.

Some current primary websites time out or resist the web reader: the Rêver DOLPHIN page and Kawasaki Ninja 500 SE page did not provide fresh readable content in this handoff. Their existing primary-cache facts remain attributed to the earlier review. A timeout is not a reason to substitute third-party numeric specifications.

## Candidate schema and existing app shape

The present `ExpoRideSpeed/src/data/vehicleCatalog.ts` exposes a TypeScript array with `id`, `brand`, `model`, optional `variant`, `category: scooter | bigbike | car`, `engineCc`, `powertrain: petrol | hybrid | electric`, market, optional model year, a source URL and a checked-at date. Its current rows do not represent motor kW, field-level verification, diesel, source edition or stable family IDs.

The research JSON adds:

- `familyId`: one stable named/body family. City Turbo/e:HEV and SEAL trims are configurations within one family; City vs City Hatchback are separate families.
- `id`: a **candidate** configuration ID. Do not use it to rewrite existing user-owned catalog bindings automatically. The production importer should map old compatible IDs explicitly and keep historical saved snapshots.
- `variant` and `variantScope`: the short selector title plus the precise configuration limitation from the source. Do not treat “base regional configuration” as a manufacturer trim name.
- `engineCc` and `motorPowerKw`: exactly one populated for petrol/hybrid versus pure EV starter rows. The kW value is traction-motor output, not battery kWh, charging power or an equivalent cc.
- `modelYear: number | null`, `modelYearVerified`, `sourceEdition`: vehicle year is distinct from brochure edition, upload date, copyright date and a year embedded only in a filename.
- `specVerified`, `verificationOrigin`, `independentlyRecheckedForM3`, `sourceUrls`, `verificationNotes`: reference-data provenance. None verifies ownership or measured ride performance.
- `historicalEdition`: the GT125 2023, QBIX 2023 and Fino Final Edition 2024 sources are useful for existing vehicles; do not present them as new current stock.

The Kawasaki Z500, ZX-10R and Vulcan S rows were conservatively changed to `modelYear: null` in this candidate. The earlier report ties their year to a named colour configuration. Keep that colour-year note; require an explicit vehicle-model-year source or the owner's year selection before pre-filling a vehicle year. This is a narrower verified field claim, not a change to their verified engine displacement.

Only starter configurations are materialized here. The earlier study also verifies additional City, City Hatchback, Mazda and BYD variants, including diesel alternatives. Do not drop those powertrain distinctions when adding variant rows later. The backend currently names the motorcycle category separately from the frontend `bigbike` token; use an explicit serialization boundary instead of silently changing saved categories.

## The user's three vehicles

1. **PCX160:** preserve the existing owned snapshot and its earlier 156.9 value. Offer the newer exact 156.93 primary configuration as an explicit selection. Leave the owner's year, RoadSync/Standard trim and registration details unknown until selected.
2. **S1000RR:** search aliases should include `S1000RR`, `S 1000 RR` and `s1000 rr`. The referenced BMW configuration is 999 cc; do not manufacture a year or M-package selection.
3. **Civic RS:** keep a manual/unresolved suggestion with `catalogId: null`, cc/powertrain unknown and configuration confirmation required. An RS badge is not sufficient to choose e:HEV, Turbo, hatchback, sedan or a year. Selecting a verified e:HEV RS row may populate 1993; merely recognizing the text may not.

## Catalog rules that affect M3 implementation

Scooters remain scooters by type: ADV350, Forza350, XMAX, Burgman 400 and C 400 GT are not big bikes because their cc exceeds a threshold. Conversely, the V-Strom SX is a motorcycle category despite its 249.1 cc. Garage classification is separate from ranking engine bands.

Preserve manufacturer precision: PCX160 156.93, Giorno+/Lead125 124.77, Scoopy 109.51, Burgman 400 399.9, GSX-8R 775.9, V-Strom SX 249.1 and Speed 400 398.15 must not be rounded into model-name badges. A Sprint S150 source publishes 155 cc and C400GT publishes 350; their marketing names are not measurements.

The EV starters in this candidate are Honda e:N1 150 kW, ATTO3 EXTENDED 150 kW, DOLPHIN Extended Range 150 kW, SEAL Premium 230 kW and SEALION7 Premium 230 kW, backed by the primary study's exact selected variants. DOLPHIN Standard Range 70 kW, SEAL Dynamic 150 kW/AWD 390 kW and SEALION7 AWD 390 kW are separate verified choices described there. Do not import generic SEO JSON: the SEALION7 page has conflicting generic power/range fields; the detailed traction table and brochure are authoritative for the selected variant. Tesla Model 3/Model Y and Mercedes EQA output remain null/unverified candidates here.

Yaris ATIV petrol PREMIUM, 1197 cc, is included. Its HEV variant is withheld until the manufacturer's extracted brochure column alignment is resolved visually; do not infer its engine from a nearby cell.

The shortest default add path can stay four taps: **plus → category → model row → save**. Keep brand filters/search on the model list, instead of requiring a separate brand page. Reveal trim/year only where a family has multiple verified configurations; unknown year remains a valid choice. Nickname, photo and color may be optional details in the same save sheet. “ไม่พบรุ่นของคุณ? เพิ่มเอง / Model not listed? Add your own” must allow unknown cc/kW and record manual/unverified provenance. Catalog source uncertainty should never force the rider to invent a value.

The current stored `GarageVehicle` has no nickname/photo/color/motor-kW fields. M3 should add them with an owner-scoped schema migration, maintain the captured ride vehicle snapshot and preserve account-switch/deletion fencing. Existing completed ride snapshots must not change when someone later edits the garage vehicle.

The M0 scooter material is already rendered and globally budgeted. Additional category loops belong to the later motion milestone; do not label a reused scooter video as a newly rendered car or big-bike composition.

## Validation before product import

The builder checks 72 distinct family IDs, category counts 21/25/26 and five EV rows whose cc is null and kW present. Candidate rows have official manufacturer/distributor sources; withheld rows are explicitly unverified. No manufacturer images/logos/brochures are copied into the editable JSON.

Before product import, spot-check selected variants, keep nullable year and decimals, verify the manual fallback and ambiguous Civic state, run catalog/domain serialization tests, and show the picker against real empty and existing owner garages. A verified catalog is not an anti-cheat speed ceiling and does not certify a ride. Native device interaction/performance acceptance remains a separate test.
