# Thailand garage catalog: manufacturer verification for v5

Research date: **1 October 2026**. This is a research handoff, not a change to the production catalog. It contains **72 distinct model families: 21 scooters, 25 motorcycles/big bikes, and 26 cars**. Extra engine/trim choices listed below do not inflate those totals. Coverage is curated for a Thailand starter garage; it is not every vehicle, every trim or a measured popularity ranking. A live official listing does not establish dealer stock.

All numerical specifications below come from the manufacturer or its authorized Thailand importer/distributor. Dealer pages were used only to discover links to Thai Honda's own brochures; no dealer specification supplies a catalog value. The previous PCX160 government-source exception is replaced by Thai Honda's primary brochure and product specification.

## Import contract

Use one stable `familyId` for counting/search, and one `catalogId` for an exact configuration. Keep `category: scooter | motorcycle | car`; `market: TH`; `brand`; `model`; `variant: string | null`; `modelYear: number | null`; `engineCc: number | null`; `motorPowerKw: number | null`; `powertrain: petrol | diesel | hybrid | electric`; `sourceUrl`; `sourceEdition: string | null`; `specVerified`; `modelYearVerified`; `verifiedAt`; and `verificationNotes`. A source's whole-number precision stays a whole number; never calculate additional decimals from bore/stroke. Do not infer power, maximum speed or anti-cheat ceilings from cc alone.

Table conventions:

- `V` means the listed engine displacement or maximum traction-motor power and the regional model identity are verified from the linked primary source. It does **not** claim all years or trims share them.
- `Y` in the year column means the source explicitly identifies that model year. `null` means the model year is unknown; an upload date, brochure revision date, copyright date, URL suffix or filename alone must not fill `modelYear`. A brochure edition can be retained separately in `sourceEdition`.
- `A` means a source-backed older model-year edition useful for existing vehicles; show it as an older year, not as a current new-car/new-bike offer. Rows without `A` are currently published regional configurations, with availability still unpromised.
- An EV has `engineCc: null` and the verified **maximum motor output in kW** below. Do not use battery kWh, charging kW or a made-up cc equivalent. Unknown electric output stays null and unverified.
- Hybrid scooters use `hybrid` for motor assistance; this is not a promise of electric-only driving. Full-hybrid cars keep their combustion-engine displacement; do not add engine and motor power unless a manufacturer explicitly publishes combined system output.

The default starter configuration in each family is specified below. Choosing another listed variant must keep its own configuration ID. Preserve all decimals, including 156.93, 124.77, 109.51, 399.9, 775.9, 249.1 and 398.15. Catalog verification is reference-data provenance, not proof of ownership or verified ride performance.

## Scooters: 21 distinct families

| Family ID suffix | Brand / model | Exact starter variant | Model year | cc | Powertrain | Flag / source |
| --- | --- | --- | --- | ---: | --- | --- |
| `honda-pcx160` | Honda PCX160 | RoadSync Type; Standard Type is another choice | null; 2026 brochure edition | 156.93 | petrol | V — [Thai Honda specification](https://www.thaihonda.co.th/honda/motorcycle/automatic/newpcx160-2026), [primary brochure](https://www.thaihonda.co.th/honda/laravel-filemanager/files/shares/2026/AW_PCX160_eCatalog_July2026-2.pdf) |
| `honda-adv160` | Honda ADV160 | ABS, brochure codes ADV160AT3TH / ADV160AT7TH | 2026 Y | 156.9 | petrol | V — [Thai Honda model identity](https://www.thaihonda.co.th/honda/motorcycle/automatic/new-adv160-2026), [primary brochure](https://www.thaihonda.co.th/honda/laravel-filemanager/files/shares/2026/AW_E_Cat_H2C_ADV160_2026_Edit_2.pdf) |
| `honda-adv350` | Honda ADV350 | Standard, ADV350AS3TH | null; 2025 brochure edition | 329.6 | petrol | V — [Thai Honda brochure](https://www.thaihonda.co.th/honda/laravel-filemanager/files/shares/E_Cat_ADV350_STD_2025.pdf) |
| `honda-forza350` | Honda Forza350 | ABS, NSS350AS2TH | null; 2026 brochure edition | 329.57 | petrol | V — [Thai Honda brochure](https://www.thaihonda.co.th/honda/laravel-filemanager/files/shares/2026/AW_HONDA__Forza_350_E-Catalog_2026.pdf) |
| `honda-giorno-plus` | Honda Giorno+ | ABS; CBS is another choice | 2026 Y | 124.77 | petrol | V — [Thai Honda specification](https://www.thaihonda.co.th/honda/motorcycle/automatic/new-honda-giorno-2026), [primary brochure](https://www.thaihonda.co.th/honda/laravel-filemanager/files/shares/2026/AW_GIORNO__Catalogue_Vertical_2026.pdf) |
| `honda-lead125` | Honda Lead125 | ABS, NHX125ATTH; CBS NHX125TTH is another choice | null; 2026 brochure edition | 124.77 | petrol | V — [Thai Honda specification](https://www.thaihonda.co.th/honda/motorcycle/automatic/new-honda-lead125-2026), [primary brochure](https://www.thaihonda.co.th/honda/laravel-filemanager/files/shares/2026/Catalogue_Lead125.pdf) |
| `honda-scoopy` | Honda Scoopy | Configuration code ACF110CBTTTH; do not infer marketing trim from code | 2026 Y | 109.51 | petrol | V — [Thai Honda specification](https://www.thaihonda.co.th/honda/motorcycle/automatic/new-honda-scoopy-2026), [primary brochure](https://www.thaihonda.co.th/honda/laravel-filemanager/files/shares/2026/Scoopy_2026_Catalogue_Vertical_New1.pdf) |
| `honda-click160` | Honda Click160 | ABS, ACB160CATVTH | null; 2026 brochure edition | 156.9 | petrol | V — [Thai Honda specification](https://www.thaihonda.co.th/honda/motorcycle/automatic/new-click-160-2026), [primary brochure](https://www.thaihonda.co.th/honda/laravel-filemanager/files/shares/2026/Honda_Catalog_CLICK160_Vertical2.pdf) |
| `yamaha-nmax` | Yamaha NMAX | Standard; Tech Max / 25th Anniversary are separate trim choices | 2026 Y | 155 | petrol | V — [Yamaha Thailand specification](https://www.yamaha-motor.co.th/commuter/nmax-2026/specification) |
| `yamaha-aerox` | Yamaha AEROX | SP | 2026 Y | 155 | petrol | V — [Yamaha Thailand specification](https://www.yamaha-motor.co.th/commuter/all-new-aerox-sp-2026/specification) |
| `yamaha-xmax` | Yamaha XMAX | Standard; Tech Max / 25th Anniversary are separate trim choices | 2026 Y | 292 | petrol | V — [Yamaha Thailand specification](https://www.yamaha-motor.co.th/commuter/xmax-2026/specification) |
| `yamaha-grand-filano` | Yamaha Grand Filano Hybrid | ABS Version; standard is another choice | 2026 Y | 125 | hybrid | V — [Yamaha Thailand specification](https://www.yamaha-motor.co.th/commuter/grand-filano-hybrid-2026/specification) |
| `yamaha-fazzio` | Yamaha Fazzio Hybrid | Smart Key Version; Lite Version is another choice | 2026 Y | 125 | hybrid | V — [Yamaha Thailand specification](https://www.yamaha-motor.co.th/commuter/fazzio-2026/specification), [hybrid identity](https://www.yamaha-motor.co.th/commuter/fazzio-2026/overview) |
| `yamaha-gt125` | Yamaha GT125 | Base configuration on the 2023 spec page | 2023 Y | 125 | petrol | V, A — [Yamaha Thailand specification](https://www.yamaha-motor.co.th/commuter/gt125-2023/specification) |
| `yamaha-qbix` | Yamaha QBIX | ABS | 2023 Y | 125 | petrol | V, A — [Yamaha Thailand specification](https://www.yamaha-motor.co.th/commuter/qbix-2023/specification) |
| `yamaha-fino` | Yamaha Fino | Final Edition | 2024 Y | 125 | petrol | V, A — [Yamaha Thailand specification](https://www.yamaha-motor.co.th/commuter/fino-final-edition-2024/specification) |
| `suzuki-burgman400` | Suzuki Burgman 400 | Base Thailand configuration | null | 399.9 | petrol | V — [Suzuki Motosales Thailand specification](https://www.suzukimotosales.co.th/bikes/burgman-400/) |
| `suzuki-burgman-street` | Suzuki Burgman Street | EX | null; brochure printed 01/2026 | 124.3 | petrol | V — [Suzuki Motosales Thailand specification](https://www.suzukimotosales.co.th/bikes/burgmanstreet125ex/), [current primary EX brochure](https://www.suzukimotosales.co.th/wp-content/uploads/2026/09/Burgman125_2026.pdf) |
| `suzuki-nex-crossover` | Suzuki Nex Crossover | Base Thailand configuration | null | 112.8 | petrol | V — [Suzuki Motosales Thailand specification](https://www.suzukimotosales.co.th/bikes/nex-crossover/) |
| `bmw-c400gt` | BMW C 400 GT | Base Thailand configuration | null | 350 | petrol | V — [BMW Motorrad Thailand technical data](https://www.bmw-motorrad.co.th/th/models/urban_mobility/c400gt/technicaldata.html) |
| `vespa-sprint` | Vespa Sprint | S 150 i-Get ABS | 2025 Y | 155 | petrol | V — [official Thailand model page](https://www.vespa.co.th/sprint/sprint-s-150-i-get-abs-my-25), [Thai distributor leaflet, spec page 3](https://vespa-website-cms-s3.s3.ap-southeast-1.amazonaws.com/Leaflet_Sprint_S_150_i_Get_ABS_MY_2025_10c93c0bd2.pdf) |

ADV350, Forza350, XMAX, Burgman 400 and C 400 GT remain **scooters** even above 300 cc or when a manufacturer's website groups them under big-bike sales. The vehicle type wins over displacement.

## Motorcycles / big bikes: 25 distinct families

| Family ID suffix | Brand / model | Exact starter variant | Model year | cc | Flag / primary source |
| --- | --- | --- | --- | ---: | --- |
| `bmw-s1000rr` | BMW S 1000 RR | Base Thailand configuration, not M 1000 RR | null | 999 | V — [BMW Motorrad technical data](https://www.bmw-motorrad.co.th/th/models/sport/s1000rr/technicaldata.html) |
| `bmw-r1300gs` | BMW R 1300 GS | Base Thailand configuration | null | 1300 | V — [BMW Motorrad technical data](https://www.bmw-motorrad.co.th/th/models/adventure/r1300gs/technicaldata.html) |
| `yamaha-r3` | Yamaha R3 | R3 | 2025 Y | 321 | V — [Yamaha Thailand specification](https://www.yamaha-motor.co.th/commuter/r3-2025/specification) |
| `yamaha-mt07` | Yamaha MT-07 | Manual transmission; do not label Y-AMT without its own configuration | null; 2025 brochure edition | 689 | V — [Yamaha Thailand brochure](https://www.yamaha-motor.co.th/docs/bigbike-documents/brochure-2025/1-1-online-brochure-mt-07-2025-%28edit%29.pdf?Status=Master&sfvrsn=8e8af1b0_2) |
| `suzuki-gsx8r` | Suzuki GSX-8R | Base Thailand configuration | null | 775.9 | V, precision note below — [Suzuki Thailand](https://www.suzukimotosales.co.th/bikes/gsx-8r/) |
| `suzuki-gsx8s` | Suzuki GSX-8S | Base Thailand configuration | null | 775.9 | V — [Suzuki Thailand specification](https://www.suzukimotosales.co.th/bikes/gsx-8s/) |
| `suzuki-hayabusa` | Suzuki Hayabusa | Gen 3 / GSX1300R | null | 1339.8 | V — [Suzuki Thailand detailed specification](https://www.suzukimotosales.co.th/bikes/hayabusa/) |
| `suzuki-vstrom800de` | Suzuki V-Strom 800DE | DE | null | 775.9 | V — [Suzuki Thailand specification](https://www.suzukimotosales.co.th/bikes/v-strom-800de/) |
| `suzuki-vstrom1050de` | Suzuki V-Strom 1050DE | DE; source slug is older 1050XT naming | null | 1037 | V, page-quality note below — [Suzuki Thailand specification](https://www.suzukimotosales.co.th/bikes/v-strom-1050xt-abs/) |
| `suzuki-vstromsx` | Suzuki V-Strom SX | Base Thailand configuration | null | 249.1 | V — [Suzuki Thailand specification](https://www.suzukimotosales.co.th/bikes/v-strom-sx/) |
| `suzuki-drz4s` | Suzuki DR-Z4S | S; not DR-Z4SM | null | 398 | V — [Suzuki Thailand specification](https://www.suzukimotosales.co.th/bikes/dr-z4s/) |
| `kawasaki-zx4r` | Kawasaki Ninja ZX-4R | ZX-4R; RR requires a separate configuration | null | 399 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/th/motorcycle/ninjazx4r) |
| `kawasaki-z900` | Kawasaki Z900 | Base regional configuration | null | 948 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/en/motorcycle/z900) |
| `kawasaki-ninja500` | Kawasaki Ninja 500 | SE | null | 451 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/en/motorcycle/ninja500se) |
| `kawasaki-z500` | Kawasaki Z500 | SE | 2026 Y; specifically named 2026 colour option | 451 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/en/motorcycle/z500se) |
| `kawasaki-kle500` | Kawasaki KLE500 | SE | null | 451 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/en/motorcycle/kle500se) |
| `kawasaki-ninja650` | Kawasaki Ninja 650 | Base regional configuration | null | 649 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/en/motorcycle/ninja650) |
| `kawasaki-versys650` | Kawasaki Versys 650 | Base regional configuration | null | 649 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/en/motorcycle/versys650) |
| `kawasaki-zx6r` | Kawasaki Ninja ZX-6R | Base regional configuration | null | 636 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/th/motorcycle/ninjazx6r) |
| `kawasaki-zx10r` | Kawasaki Ninja ZX-10R | Named 2025 colour configuration | 2025 Y | 998 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/en/motorcycle/ninjazx10r) |
| `kawasaki-z650` | Kawasaki Z650 | Base regional configuration | null | 649 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/en/motorcycle/z650) |
| `kawasaki-vulcan` | Kawasaki Vulcan S | Metallic Flat Spark Black, named 2026 colour option | 2026 Y | 649 | V — [Kawasaki Thailand specification](https://www.kawasaki.co.th/th/motorcycle/vulcans) |
| `triumph-speed400` | Triumph Speed 400 | Speed 400 | null | 398.15 | V — [Triumph Thailand technical specification](https://www.triumphmotorcycles.co.th/bikes/classic/speed-400/specification) |
| `triumph-trident660` | Triumph Trident 660 | Standard Trident 660; Triple Tribute is another trim | null; source has multiple editions | 660 | V — [Triumph Thailand technical specification](https://www.triumphmotorcycles.co.th/bikes/roadsters/trident/specification) |
| `ducati-monster` | Ducati Monster | V2 generation, MY26 | 2026 Y | 890 | V — [Ducati Thailand MY26 engine information](https://www.ducati.com/th/th/bikes/monster/monster-v2/insights) |

All 25 starter configurations above are petrol. Motorcycle here is an app garage category, not a legal Thai definition of “big bike.” A 249.1 cc V-Strom SX belongs here by its motorcycle type.

## Cars: 26 distinct families

For family counting, City vs City Hatchback are distinct named/body families, whereas City Turbo vs City e:HEV, Civic e:HEV vs Civic Turbo, and SEAL Dynamic vs Premium are variants within a family.

| Family ID suffix | Brand / model | Exact starter variant | Model year | cc / max motor kW | Powertrain | Flag / primary source |
| --- | --- | --- | --- | --- | --- | --- |
| `honda-civic` | Honda Civic | e:HEV RS; never infer this from “Civic RS” alone | null | 1993 cc | hybrid | V — [Honda Thailand specification](https://www.honda.co.th/civic/specification) |
| `honda-city` | Honda City | Turbo S; e:HEV variants are separately mapped below | null | 988 cc | petrol | V — [Honda Thailand specification](https://www.honda.co.th/en/city/specification) |
| `honda-city-hatchback` | Honda City Hatchback | e:HEV RS | null | 1498 cc | hybrid | V — [Honda Thailand specification](https://www.honda.co.th/cityhatchback/specification) |
| `honda-accord` | Honda Accord | e:HEV RS | null | 1993 cc | hybrid | V — [Honda Thailand specification](https://www.honda.co.th/accordehev/specification) |
| `honda-wrv` | Honda WR-V | RS; SV shares the listed engine | null | 1498 cc | petrol | V — [Honda Thailand specification](https://www.honda.co.th/wrv/specification) |
| `honda-brv` | Honda BR-V | EL; E shares the listed engine | null | 1498 cc | petrol | V — [Honda Thailand specification](https://www.honda.co.th/brv/specification) |
| `honda-hrv` | Honda HR-V | e:HEV RS | null | 1498 cc | hybrid | V — [Honda Thailand specification](https://www.honda.co.th/hrvehev/specification) |
| `honda-crv` | Honda CR-V | e:HEV RS 4WD | null | 1993 cc | hybrid | V — [Honda Thailand specification](https://www.honda.co.th/crv/specification) |
| `honda-en1` | Honda e:N1 | e:N1, front-wheel drive | null | 150 kW | electric | V — [Honda Thailand specification](https://www.honda.co.th/en1/specification) |
| `mazda-2` | Mazda2 Essential | Sedan 1.3 PRIME | null; 2025 brochure edition | 1299 cc | petrol | V — [Mazda Thailand specification](https://www.mazda.co.th/th/cars/mazda2-essential/spec), [primary brochure](https://www.mazda.co.th/s3fs-public/2025-03/brochure_mazda2_essential_26032025.pdf?VersionId=AfXNz7AmQsbwFurYSIj4Rc0LOJo9UwWw) |
| `mazda-3` | Mazda3 | Sedan 2.0 C | null; 2025 brochure edition | 1998 cc | petrol | V — [Mazda Thailand specification](https://www.mazda.co.th/th/cars/mazda3-sedan/spec) |
| `mazda-cx30` | Mazda CX-30 Essential | 2.0 PRIME | null; 2025 brochure edition | 1998 cc | petrol | V — [Mazda Thailand specification](https://www.mazda.co.th/th/cars/mazda-cx30-essential/spec) |
| `mazda-cx5` | Mazda CX-5 | 2.0 S | null | 1998 cc | petrol | V — [Mazda Thailand specification](https://www.mazda.co.th/th/cars/mazda-cx5/spec) |
| `mazda-cx8` | Mazda CX-8 | 2.5 S, 7-seat | null | 2488 cc | petrol | V — [Mazda Thailand specification](https://www.mazda.co.th/th/cars/mazda-cx8/spec) |
| `suzuki-swift` | Suzuki Swift | GL; source also lists GLX | null | 1197 cc | petrol | V — [Suzuki Motor Thailand specification](https://www.suzuki.co.th/model/swift/specification) |
| `suzuki-xl7` | Suzuki XL7 | GLX, K15B specification; do not label hybrid without a separate source | null | 1462 cc | petrol | V — [Suzuki Motor Thailand specification](https://www.suzuki.co.th/model/xl7/specification) |
| `toyota-camry` | Toyota Camry | HEV PREMIUM | null; 2025 brochure edition | 2487 cc | hybrid | V — [Toyota Thailand brochure](https://www.toyota.co.th/media/product/series/download/CAMRY_Catalog2025.pdf) |
| `toyota-yaris-cross` | Toyota Yaris Cross | HEV PREMIUM | null; 2026 brochure edition | 1496 cc | hybrid | V — [Toyota Thailand brochure](https://www.toyota.co.th/media/product/series/download/YarisCross_2026_Catalog.pdf) |
| `toyota-veloz` | Toyota Veloz | PREMIUM | null; 2024 brochure edition | 1496 cc | petrol | V — [Toyota Thailand brochure](https://www.toyota.co.th/media/product/series/download/Veloz2024_Catalog.pdf) |
| `toyota-yaris` | Toyota Yaris | Premium, hatchback | null; 2026 brochure edition | 1197 cc | petrol | V — [Toyota Thailand brochure](https://www.toyota.co.th/media/product/series/download/Yaris2026_Catalog.pdf) |
| `toyota-yaris-ativ` | Toyota Yaris ATIV | PREMIUM, petrol; hybrid starter withheld pending clarification below | null; 2026 brochure edition | 1197 cc | petrol | V — [Toyota Thailand brochure](https://www.toyota.co.th/media/product/series/download/YarisATIV2026_Catalog.pdf) |
| `bmw-3series-li` | BMW 3 Series Li | 320Li M Sport | null; specification effective 12 January 2026 | 1998 cc | petrol | V — [BMW Thailand specification](https://www.bmw.co.th/content/dam/bmw/marketTH/bmw_co_th/specsheet/3-20260112-01_EN_Li.pdf.asset.1768894796753.pdf) |
| `byd-atto3` | BYD ATTO 3 | EXTENDED, as named in the referenced brochure | null; MY2026 filename/edition alone is insufficient | 150 kW | electric | V — [Rêver Thailand official brochure](https://www.reverautomotive.com/media/models/new-atto3/brochure/bydatto3_MY2026.pdf) |
| `byd-dolphin` | BYD DOLPHIN | Extended Range | null | 150 kW | electric | V — [Rêver Thailand specification](https://www.reverautomotive.com/en/model/new-dolphin/overview), [primary brochure](https://www.reverautomotive.com/media/models/new-dolphin/brochure/e_Catalog_New_BYD_DOLPHIN_411c941ef9.pdf) |
| `byd-seal` | BYD SEAL | Premium, rear-wheel drive | null | 230 kW | electric | V — [Rêver Thailand specification](https://www.reverautomotive.com/en/model/seal/overview), [primary brochure](https://www.reverautomotive.com/media/models/seal/brochure/260923_BYD_Seal_Final_E_Catalog_TH_version_ca85324b35.pdf) |
| `byd-sealion7` | BYD SEALION 7 | Premium, rear-wheel drive | null | 230 kW | electric | V — [Rêver Thailand specification](https://www.reverautomotive.com/en/model/sealion7/overview), [current primary brochure](https://www.reverautomotive.com/media/models/sealion7/brochure/BYD_SEALION_7.pdf) |

Additional verified variant choices within these families:

| Family | Variant choice | Exact value / powertrain | Source |
| --- | --- | --- | --- |
| City | e:HEV V / SV / RS | 1498 cc, hybrid | Same Honda City specification above |
| City Hatchback | Turbo S | 988 cc, petrol | Same Honda City Hatchback specification above; do not invent a current Turbo RS from an older lineup |
| Mazda2 Essential | Sedan 1.3 ULTRA / SIGNATURE, Hatchback 1.3 PRIME / ULTRA / SIGNATURE SPORTS | 1299 cc, petrol | Same Mazda2 technical table above |
| Mazda2 Essential | Sedan XDL SIGNATURE / Hatchback XDL SIGNATURE SPORTS | 1499 cc, diesel | Same Mazda2 technical table above; requires the catalog type to support `diesel` |
| Mazda3 Sedan | 2.0 S / SP / CARBON EDITION | 1998 cc, petrol | Same Mazda3 technical table above |
| CX-30 Essential | 2.0 ULTRA / SIGNATURE | 1998 cc, petrol | Same CX-30 technical table above |
| CX-5 | 2.0 SP / XDL | 1998 cc petrol / 2191 cc diesel respectively | Same CX-5 technical table above |
| CX-8 | 2.5 SP 7-seat / 2.5 SP EXCLUSIVE 6-seat / XDL EXCLUSIVE 6-seat | 2488 cc petrol / 2488 cc petrol / 2191 cc diesel respectively | Same CX-8 technical table above |
| ATTO 3 | PREMIUM | 150 kW, electric | Same primary ATTO 3 brochure above; both PREMIUM and EXTENDED share motor output, with different battery capacities |
| DOLPHIN | Standard Range | 70 kW, electric | Same current Rêver technical table above; 150 kW is specifically Extended Range |
| SEAL | Dynamic / AWD Performance | 150 kW / 390 kW, electric | Same Rêver technical table above; charging power is a separate value |
| SEALION 7 | AWD Performance / AWD Ultimate | 390 kW for each, electric | Same current Rêver technical table/brochure above; Ultimate has a different battery, not a larger motor-output value |

## The owner's PCX160, S 1000 RR and Civic RS

- **PCX160:** do not assign the new 2026-edition configuration or its year to an existing vehicle automatically. Thai Honda's current primary table is 156.93 cc; the old researched approval rounded to 156.9. Keep an existing saved garage snapshot stable. Offer the newer verified configuration as an explicit selection, with year optional until confirmed.
- **S 1000 RR:** 999 cc is verified for the referenced Thailand configuration. No generation, year, factory option package or ownership document has been supplied. The app should not assume those details.
- **Civic RS:** retain `catalogId: null`, `engineCc: null`, `needsVariantConfirmation: true` until the owner selects the correct engine/body/year. Current Thai e:HEV RS is 1993 cc; an [earlier Honda Turbo RS hatchback specification](https://www.honda.co.th/specsheet/AW%20CIVIC%20RS%20Specsheet%20A4.pdf) publishes 1498 cc. The shared RS badge cannot identify the owner's engine or body style.

## Primary-source conflicts and limits

1. **GSX-8R precision:** Suzuki's own page publishes 775.9 in its engine summary and 776 cm³ in the detailed specification. Preserve 775.9 as the more precise manufacturer-published value with `verificationNotes: 'Manufacturer rounds detailed table to 776; summary publishes 775.9'`. Neither value was calculated. This is rounding ambiguity, not a new engine variant. GSX-8S and V-Strom 800DE tables themselves publish 775.9.
2. **Burgman Street:** the page's marketing summary says 125, but detailed engine specification and engine feature text publish **124.3**. Use the detail value. Likewise Sprint S 150 is 155 cc, BMW C 400 GT is 350 cc, Speed 400 is 398.15 cc, and V-Strom SX is 249.1 cc.
3. **V-Strom 1050DE page quality:** the current header and narrative identify DE and publish 1037 cc, but the URL and some ancillary geometry/testimonials retain XT-era content. Import only the verified model identity/engine cc; do not propagate its other dimensions, wheel or equipment values without a corrected DE source.
4. **SEALION 7 structured-data mismatch:** the current visible maximum-power hero and the detailed variant table publish 390 kW for AWD Ultimate/Performance and 230 kW for Premium. A generic embedded `maxPower` field still says 150 kW, while another field incorrectly labels 390 kW as driving range. The current brochure confirms the 390-kW AWD hero. Do not blindly import generic SEO/hero JSON; use the detailed traction-motor table, tied to its variant. The battery's 91.3 kWh and DC charging's 230 kW must not replace motor power.
5. **Yaris ATIV 2026 hybrid column alignment:** the indexed brochure header lists two HEV trims, while one extracted cc row exposes one 1496 cell followed by a five-column 1197 cell. The petrol PREMIUM choice is unambiguous at 1197; do not auto-import HEV PREMIUM/HEV GR SPORT until the actual visual table/another official corrected specification resolves the mismatch. This limitation does not imply the hybrid model is unavailable.
6. **Model year vs source edition:** many current Thailand sites and brochure fronts do not identify a model year. A 2026 upload of a 2025 brochure is not a 2026 vehicle. Null years above are deliberate and must remain selectable with “ไม่ระบุปี / Year not specified,” not a fake current-year default.
7. **Unverified candidates:** Honda CBR650R/CB650R, other Vespa/Lambretta trims, Mercedes EQA and Tesla Model 3/Model Y can be future additions. Their precise selected Thailand configuration/output has not been reverified for this report. Do not turn a marketing displacement badge or battery/charging value into `specVerified: true`. The curated list already reaches the requested family counts without those guesses.

Public manufacturer HTML/PDF evidence was retrieved into ignored `build/research/vehicle-*-v5.*` files. Several Honda brochures and manufacturer pages use image-only tables; Honda PCX160, ADV160 and Giorno+ spec crops, Suzuki's current Burgman Street EX brochure specification and ATTO 3's PREMIUM/EXTENDED table were inspected visually. Mazda's current spec tables were read from the public page's own `SpecJson`, including trim headers and cc rows, rather than from an unrelated cached layout. Keep only facts/source links in the shipped editable JSON; do not package manufacturer images, logos or downloaded brochures.

## Implementation handoff after the M0 gate

This research makes a 72-family starter catalog feasible without “all models” claims. Update the production `VehicleCatalogEntry` type to represent `motorPowerKw`, optional year, source edition and diesel; use separate family/configuration IDs; carry provenance into editable JSON. Migrate existing snapshots explicitly rather than silently editing user-owned vehicles. Group by category → brand → model, then reveal variant/year in a compact selection sheet. Provide **ไม่พบรุ่นของคุณ? เพิ่มเอง / Model not listed? Add your own** with nullable cc or kW, preserving `source: manual` and an unverified flag. Do not require a user to invent an engine or year to save their vehicle.

For ranking, classify scooters by engine band independently from vehicle type. A maxiscooter must never move into the big-bike garage group because of cc. EVs have a separate power-based class; hybrid cars retain engine cc and an explicit powertrain class. Catalog values are not a sufficient anti-cheat model: use cautious server-side plausibility bounds, GPS evidence and manual review rather than deriving speed ceilings directly from badge/cc.

Before importing: spot-check each selected variant against the linked official table, lint/typecheck, and verify the searchable picker shows exact decimals, EV kW, hybrid labels, nullable year, older-year entries, manual fallback and the unresolved Civic RS state. Verify three base category counts independently from row/configuration counts. No product source, package, backend or external app was modified for this research.
