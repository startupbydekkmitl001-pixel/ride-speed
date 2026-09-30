# Garage vehicle catalog — verification and integration contract

Verified on **30 September 2026**. Source module: `ExpoRideSpeed/src/data/vehicleCatalog.ts`.

This is a curated starter catalog of **32 records: 9 scooters, 10 motorcycles and 13 cars**. It covers all brands requested for this research, not every model, model year, trim, imported vehicle or vehicle sold worldwide. A live product page is evidence for the referenced configuration, not a promise of dealer stock. Vehicle data is reference material, not a speed limit or vehicle performance calibration.

## Data rules

- `engineCc` preserves the precision published in the specification. Do not replace 156.9 with the PCX160 badge, 399.9 with Burgman 400, or 398.15 with Speed 400. Several Yamaha specifications publish whole numbers; no extra decimals have been invented or calculated from bore and stroke.
- `engineCc: null` with `powertrain: 'electric'` means displacement does not apply. Show **ไฟฟ้า**, not **0 ซีซี**. A manual vehicle can also have null displacement because it is unknown; show **ยังไม่ระบุซีซี** for that case.
- `hybrid` includes mild motor assistance in Yamaha scooters as well as full hybrid cars; it does not imply electric-only driving capability.
- Only source-explicit model years are populated. A brochure revision date does not establish model year. The BMW 320Li sheet dated January 2026 therefore has no `modelYear`.
- `market: 'TH'` indicates the regional source/configuration. It does not prove that every trim listed internationally is sold locally.
- The three categories are garage navigation groups. R3 and Ninja ZX-4R are placed under the app's motorcycle/bigbike choice; this is not a legal engine-size classification. Maxi-scooters remain scooters.
- The current powertrain contract has no `diesel` member. Diesel trims have deliberately not been relabeled as petrol. Expand the type and verify specifications before adding them.
- The catalog stores facts and source links only. No manufacturer photography, logos, paid assets or third-party catalog code has been copied.

## Source ledger

The manufacturer or its Thai importer/distributor is the primary source, with one documented Thai government type-approval exception for PCX160. Values below are engine displacement in cc; electric entries have no combustion-engine displacement.

| Category | Brand / model / configuration | cc | Powertrain | Official source |
| --- | --- | ---: | --- | --- |
| Scooter | Honda PCX160 | 156.9 | Petrol | [Thai TISI type approval, WW150/A/PCX160, KF44E](https://appdb.tisi.go.th/tis_dev/p4_license_report/file/%E0%B8%977036_30_2915.pdf) |
| Scooter | Yamaha NMAX 2026 | 155 | Petrol | [Thai specification](https://www.yamaha-motor.co.th/commuter/nmax-2026/specification) |
| Scooter | Yamaha AEROX SP 2026 | 155 | Petrol | [Thai specification](https://www.yamaha-motor.co.th/commuter/all-new-aerox-sp-2026/specification) |
| Scooter | Yamaha XMAX 2026 | 292 | Petrol | [Thai specification](https://www.yamaha-motor.co.th/commuter/xmax-2026/specification) |
| Scooter | Yamaha GRAND FILANO HYBRID 2026 | 125 | Hybrid | [Thai specification](https://www.yamaha-motor.co.th/commuter/grand-filano-hybrid-2026/specification) |
| Scooter | Yamaha FAZZIO HYBRID 2026 | 125 | Hybrid | [Thai specification](https://www.yamaha-motor.co.th/commuter/fazzio-2026/specification), [hybrid model identity](https://www.yamaha-motor.co.th/commuter/fazzio-2026/overview) |
| Scooter | Vespa Sprint S 150 i-Get ABS MY25 | 155 | Petrol | [Thai leaflet, specification page 3](https://vespa-website-cms-s3.s3.ap-southeast-1.amazonaws.com/Leaflet_Sprint_S_150_i_Get_ABS_MY_2025_10c93c0bd2.pdf), linked from [Vespa Thailand](https://www.vespa.co.th/sprint/sprint-s-150-i-get-abs-my-25) |
| Scooter | Suzuki Burgman 400 | 399.9 | Petrol | [Suzuki Motosales Thailand](https://www.suzukimotosales.co.th/bikes/burgman-400/) |
| Scooter | BMW C 400 GT | 350 | Petrol | [BMW Motorrad Thailand technical data](https://www.bmw-motorrad.co.th/th/models/urban_mobility/c400gt/technicaldata.html) |
| Motorcycle | BMW S 1000 RR | 999 | Petrol | [BMW Motorrad Thailand technical data](https://www.bmw-motorrad.co.th/th/models/sport/s1000rr/technicaldata.html) |
| Motorcycle | BMW R 1300 GS | 1300 | Petrol | [BMW Motorrad Thailand](https://www.bmw-motorrad.co.th/th/models/adventure/r1300gs.html) |
| Motorcycle | Yamaha R3 2025 | 321 | Petrol | [Thai specification](https://www.yamaha-motor.co.th/commuter/r3-2025/specification) |
| Motorcycle | Yamaha MT-07 2025 | 689 | Petrol | [Thai manufacturer brochure](https://www.yamaha-motor.co.th/docs/bigbike-documents/brochure-2025/1-1-online-brochure-mt-07-2025-%28edit%29.pdf?Status=Master&sfvrsn=8e8af1b0_2) |
| Motorcycle | Suzuki GSX-8R | 776 | Petrol | [Suzuki Motosales Thailand](https://www.suzukimotosales.co.th/bikes/gsx-8r/) |
| Motorcycle | Kawasaki Ninja ZX-4R | 399 | Petrol | [Kawasaki Thailand](https://www.kawasaki.co.th/th/motorcycle/ninjazx4r) |
| Motorcycle | Kawasaki Z900 | 948 | Petrol | [Kawasaki Thailand](https://www.kawasaki.co.th/en/motorcycle/z900) |
| Motorcycle | Triumph Speed 400 | 398.15 | Petrol | [Triumph Thailand specification](https://www.triumphmotorcycles.co.th/bikes/classic/speed-400/specification) |
| Motorcycle | Triumph Trident 660 2025 | 660 | Petrol | [Triumph Thailand specification](https://www.triumphmotorcycles.co.th/bikes/roadsters/trident/specification) |
| Motorcycle | Ducati Monster V2 MY26 | 890 | Petrol | [Ducati Thailand model insights](https://www.ducati.com/th/th/bikes/monster/monster-v2/insights) |
| Car | Honda Civic e:HEV RS | 1993 | Hybrid | [Honda Thailand specification](https://www.honda.co.th/civic/specification) |
| Car | Honda City Turbo S | 988 | Petrol | [Honda Thailand specification](https://www.honda.co.th/en/city/specification) |
| Car | Honda City e:HEV RS | 1498 | Hybrid | [Honda Thailand specification](https://www.honda.co.th/en/city/specification) |
| Car | Honda Accord e:HEV RS | 1993 | Hybrid | [Honda Thailand specification](https://www.honda.co.th/accordehev/specification) |
| Car | Toyota Camry HEV 2025 | 2487 | Hybrid | [Toyota Thailand brochure](https://www.toyota.co.th/media/product/series/download/CAMRY_Catalog2025.pdf) |
| Car | Mazda3 Sedan 2.0 Skyactiv-G | 1998 | Petrol | [Mazda Thailand specification](https://www.mazda.co.th/cars/mazda3-sedan/spec) |
| Car | BMW 320Li M Sport | 1998 | Petrol | [BMW Thailand specification, effective 12 January 2026](https://www.bmw.co.th/content/dam/bmw/marketTH/bmw_co_th/specsheet/3-20260112-01_EN_Li.pdf.asset.1768894796753.pdf) |
| Car | Mercedes-Benz EQA | — | Electric | [Mercedes-Benz Thailand SUV range](https://www.mercedes-benz.co.th/th/passengercars/models/suv.html) |
| Car | Tesla Model 3 | — | Electric | [Tesla Thailand Model 3](https://www.tesla.com/th_th/model3-choose) |
| Car | Tesla Model Y | — | Electric | [Tesla Thailand Model Y](https://www.tesla.com/th_th/modely), [Thai model range](https://www.tesla.com/th_th/models) |
| Car | BYD ATTO 3 MY2026 | — | Electric | [Rêver Thailand brochure](https://www.reverautomotive.com/media/models/new-atto3/brochure/bydatto3_MY2026.pdf) |
| Car | BYD DOLPHIN | — | Electric | [Rêver Thailand](https://www.reverautomotive.com/model/new-dolphin/overview) |
| Car | BYD SEAL | — | Electric | [Rêver Thailand](https://www.reverautomotive.com/model/seal/overview) |

## User's existing garage

`USER_GARAGE_SUGGESTIONS` is a separate list for the user's PCX160, S 1000 RR and Civic RS. These are suggestions for confirmation, not automatic statements of verified ownership or model year.

- PCX160: `honda-pcx160-th`, 156.9 cc. The Thai product page was inaccessible to the research tool; the Thai government approval confirms the exact displacement. Honda's [current Colombian PCX160 2026 product specification](https://motocicletas.honda.com.co/motos-honda/scooter-y-semiautomatica/PCX-160-2026) independently agrees at 156.9 cc. No Colombian equipment or model year has been assigned to the user's Thai vehicle.
- S 1000 RR: `bmw-s1000rr-th`, 999 cc. No generation or year is assumed.
- Civic RS: **`catalogId: null`, `engineCc: null`, `needsVariantConfirmation: true`**. The current Thai Civic specification identifies e:HEV RS at 1,993 cc. Honda also has an [earlier official Turbo RS hatchback specification](https://www.honda.co.th/specsheet/AW%20CIVIC%20RS%20Specsheet%20A4.pdf) at 1,498 cc. This establishes that “Civic RS” alone is insufficient. It does not identify the user's body style, engine, trim year or vehicle. Do not automatically assign the current e:HEV catalog entry; let the user choose the correct engine/year or enter it manually.

## Garage picker and manual fallback contract

1. The first launch may show an empty garage with **เพิ่มรถ**. The same plus action remains available after adding a vehicle.
2. Choose **สกู๊ตเตอร์ / บิ๊กไบค์ / รถยนต์** using `VEHICLE_CATEGORIES`.
3. Filter brands with `getBrands(category)`; search using `searchVehicles(query, { category, brand })`. Brand and category filters combine. Search tolerates spaces and punctuation in names such as `S1000RR`, `GSX8R` and `eHEV`.
4. Rows should show brand, model, specific variant when present, optional source-explicit model year, and engine displacement or **ไฟฟ้า**. Retain decimals. Do not use the badge number as cc. Choosing a catalog record still requires the user to confirm it matches their car/bike.
5. Always offer **ไม่พบรุ่นของคุณ? เพิ่มเอง**. The `ManualVehicleDraft` contract requires category, brand and model; variant/year, cc and powertrain can remain unknown. Trim text, cap reasonable lengths, and validate any entered cc as a positive finite number. Do not require the user to invent a value to save a vehicle. Keep `source: 'manual'` separate from catalog provenance; never add a `verifiedAt` claim to user input.
6. Do not prevent addition of a second vehicle of the same model. A garage instance needs its own ID independent of `catalogId`. Store the chosen record's data snapshot and catalog ID so future catalog edits do not silently change an existing vehicle.
7. Suggested disclosure near the picker: **รุ่นที่คัดสรร · เพิ่มรุ่นอื่นเองได้**. Detailed provenance can live in model details, not each row. Never label the list **ทุกรุ่น**.

## Research limits and deliberately excluded entries

The reviewed 2026 Vespa Sprint Tech 180 leaflet was image-only; its marketing badge was not accepted as verified displacement. Toyota's large 2026 Corolla Cross and 2025 Yaris ATIV PDFs exceeded the research tool limit, and direct fetch returned 403. Those models were omitted rather than populated from older specs. Mercedes-Benz's individual EQA page could not be fetched; its current Thai SUV range explicitly identifies EQA as fully electric, which is sufficient for the generic EQA record with null displacement. Ducati's Panigale engine page contained inconsistent prose, so it was omitted; the Monster MY26 insights page explicitly verifies 890 cc. These omissions do not imply that the vehicles are unavailable.

Recheck live pages before expanding variants or shipping a future catalog revision. Keep old source-backed entries stable if users already selected them, and add a new ID when the engine configuration changes.
