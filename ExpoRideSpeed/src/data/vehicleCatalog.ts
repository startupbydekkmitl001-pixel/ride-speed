/** Curated reference data, not an exhaustive list or a live dealer inventory. */
export type VehicleCategory = 'scooter' | 'bigbike' | 'car';
export type VehiclePowertrain = 'petrol' | 'hybrid' | 'electric';

export interface VehicleCatalogEntry {
  readonly id: string;
  readonly brand: string;
  readonly model: string;
  readonly variant?: string;
  readonly category: VehicleCategory;
  /** Manufacturer-published precision. Null means not applicable or not verified. */
  readonly engineCc: number | null;
  readonly powertrain: VehiclePowertrain;
  readonly market: 'TH' | 'global';
  /** Only populated when the source explicitly identifies a model year. */
  readonly modelYear?: string;
  readonly sourceUrl: string;
  /** ISO date of source verification, not a model year or availability guarantee. */
  readonly verifiedAt: string;
}

export const CATALOG_VERIFIED_AT = '2026-09-30';

export const VEHICLE_CATEGORIES: readonly {
  id: VehicleCategory;
  label: string;
}[] = [
  { id: 'scooter', label: 'สกู๊ตเตอร์' },
  { id: 'bigbike', label: 'บิ๊กไบค์' },
  { id: 'car', label: 'รถยนต์' },
];

function thVehicle(
  data: Omit<VehicleCatalogEntry, 'market' | 'verifiedAt'>,
): VehicleCatalogEntry {
  return { ...data, market: 'TH', verifiedAt: CATALOG_VERIFIED_AT };
}

export const VEHICLE_CATALOG: readonly VehicleCatalogEntry[] = [
  thVehicle({
    id: 'honda-pcx160-th', brand: 'Honda', model: 'PCX160',
    category: 'scooter', engineCc: 156.9, powertrain: 'petrol',
    // Thai type approval corroborates Honda's manufacturer specification.
    sourceUrl: 'https://appdb.tisi.go.th/tis_dev/p4_license_report/file/%E0%B8%977036_30_2915.pdf',
  }),
  thVehicle({
    id: 'yamaha-nmax-2026-th', brand: 'Yamaha', model: 'NMAX',
    category: 'scooter', engineCc: 155, powertrain: 'petrol', modelYear: '2026',
    sourceUrl: 'https://www.yamaha-motor.co.th/commuter/nmax-2026/specification',
  }),
  thVehicle({
    id: 'yamaha-aerox-sp-2026-th', brand: 'Yamaha', model: 'AEROX', variant: 'SP',
    category: 'scooter', engineCc: 155, powertrain: 'petrol', modelYear: '2026',
    sourceUrl: 'https://www.yamaha-motor.co.th/commuter/all-new-aerox-sp-2026/specification',
  }),
  thVehicle({
    id: 'yamaha-xmax-2026-th', brand: 'Yamaha', model: 'XMAX',
    category: 'scooter', engineCc: 292, powertrain: 'petrol', modelYear: '2026',
    sourceUrl: 'https://www.yamaha-motor.co.th/commuter/xmax-2026/specification',
  }),
  thVehicle({
    id: 'yamaha-grand-filano-hybrid-2026-th', brand: 'Yamaha', model: 'GRAND FILANO HYBRID',
    category: 'scooter', engineCc: 125, powertrain: 'hybrid', modelYear: '2026',
    sourceUrl: 'https://www.yamaha-motor.co.th/commuter/grand-filano-hybrid-2026/specification',
  }),
  thVehicle({
    id: 'yamaha-fazzio-hybrid-2026-th', brand: 'Yamaha', model: 'FAZZIO HYBRID',
    category: 'scooter', engineCc: 125, powertrain: 'hybrid', modelYear: '2026',
    sourceUrl: 'https://www.yamaha-motor.co.th/commuter/fazzio-2026/specification',
  }),
  thVehicle({
    id: 'vespa-sprint-s150-2025-th', brand: 'Vespa', model: 'Sprint S 150', variant: 'i-Get ABS',
    category: 'scooter', engineCc: 155, powertrain: 'petrol', modelYear: '2025',
    sourceUrl: 'https://vespa-website-cms-s3.s3.ap-southeast-1.amazonaws.com/Leaflet_Sprint_S_150_i_Get_ABS_MY_2025_10c93c0bd2.pdf',
  }),
  thVehicle({
    id: 'suzuki-burgman400-th', brand: 'Suzuki', model: 'Burgman 400',
    category: 'scooter', engineCc: 399.9, powertrain: 'petrol',
    sourceUrl: 'https://www.suzukimotosales.co.th/bikes/burgman-400/',
  }),
  thVehicle({
    id: 'bmw-c400gt-th', brand: 'BMW', model: 'C 400 GT',
    category: 'scooter', engineCc: 350, powertrain: 'petrol',
    sourceUrl: 'https://www.bmw-motorrad.co.th/th/models/urban_mobility/c400gt/technicaldata.html',
  }),
  thVehicle({
    id: 'bmw-s1000rr-th', brand: 'BMW', model: 'S 1000 RR',
    category: 'bigbike', engineCc: 999, powertrain: 'petrol',
    sourceUrl: 'https://www.bmw-motorrad.co.th/th/models/sport/s1000rr/technicaldata.html',
  }),
  thVehicle({
    id: 'bmw-r1300gs-th', brand: 'BMW', model: 'R 1300 GS',
    category: 'bigbike', engineCc: 1300, powertrain: 'petrol',
    sourceUrl: 'https://www.bmw-motorrad.co.th/th/models/adventure/r1300gs.html',
  }),
  thVehicle({
    id: 'yamaha-r3-2025-th', brand: 'Yamaha', model: 'R3',
    category: 'bigbike', engineCc: 321, powertrain: 'petrol', modelYear: '2025',
    sourceUrl: 'https://www.yamaha-motor.co.th/commuter/r3-2025/specification',
  }),
  thVehicle({
    id: 'yamaha-mt07-2025-th', brand: 'Yamaha', model: 'MT-07',
    category: 'bigbike', engineCc: 689, powertrain: 'petrol', modelYear: '2025',
    sourceUrl: 'https://www.yamaha-motor.co.th/docs/bigbike-documents/brochure-2025/1-1-online-brochure-mt-07-2025-%28edit%29.pdf?Status=Master&sfvrsn=8e8af1b0_2',
  }),
  thVehicle({
    id: 'suzuki-gsx8r-th', brand: 'Suzuki', model: 'GSX-8R',
    category: 'bigbike', engineCc: 776, powertrain: 'petrol',
    sourceUrl: 'https://www.suzukimotosales.co.th/bikes/gsx-8r/',
  }),
  thVehicle({
    id: 'kawasaki-ninja-zx4r-th', brand: 'Kawasaki', model: 'Ninja ZX-4R',
    category: 'bigbike', engineCc: 399, powertrain: 'petrol',
    sourceUrl: 'https://www.kawasaki.co.th/th/motorcycle/ninjazx4r',
  }),
  thVehicle({
    id: 'kawasaki-z900-th', brand: 'Kawasaki', model: 'Z900',
    category: 'bigbike', engineCc: 948, powertrain: 'petrol',
    sourceUrl: 'https://www.kawasaki.co.th/en/motorcycle/z900',
  }),
  thVehicle({
    id: 'triumph-speed400-th', brand: 'Triumph', model: 'Speed 400',
    category: 'bigbike', engineCc: 398.15, powertrain: 'petrol',
    sourceUrl: 'https://www.triumphmotorcycles.co.th/bikes/classic/speed-400/specification',
  }),
  thVehicle({
    id: 'triumph-trident660-2025-th', brand: 'Triumph', model: 'Trident 660',
    category: 'bigbike', engineCc: 660, powertrain: 'petrol', modelYear: '2025',
    sourceUrl: 'https://www.triumphmotorcycles.co.th/bikes/roadsters/trident/specification',
  }),
  thVehicle({
    id: 'ducati-monster-v2-2026-th', brand: 'Ducati', model: 'Monster', variant: 'V2',
    category: 'bigbike', engineCc: 890, powertrain: 'petrol', modelYear: '2026',
    sourceUrl: 'https://www.ducati.com/th/th/bikes/monster/monster-v2/insights',
  }),
  thVehicle({
    id: 'honda-civic-ehev-rs-th', brand: 'Honda', model: 'Civic', variant: 'e:HEV RS',
    category: 'car', engineCc: 1993, powertrain: 'hybrid',
    sourceUrl: 'https://www.honda.co.th/civic/specification',
  }),
  thVehicle({
    id: 'honda-city-turbo-s-th', brand: 'Honda', model: 'City', variant: 'Turbo S',
    category: 'car', engineCc: 988, powertrain: 'petrol',
    sourceUrl: 'https://www.honda.co.th/en/city/specification',
  }),
  thVehicle({
    id: 'honda-city-ehev-rs-th', brand: 'Honda', model: 'City', variant: 'e:HEV RS',
    category: 'car', engineCc: 1498, powertrain: 'hybrid',
    sourceUrl: 'https://www.honda.co.th/en/city/specification',
  }),
  thVehicle({
    id: 'honda-accord-ehev-rs-th', brand: 'Honda', model: 'Accord', variant: 'e:HEV RS',
    category: 'car', engineCc: 1993, powertrain: 'hybrid',
    sourceUrl: 'https://www.honda.co.th/accordehev/specification',
  }),
  thVehicle({
    id: 'toyota-camry-hev-2025-th', brand: 'Toyota', model: 'Camry', variant: 'HEV',
    category: 'car', engineCc: 2487, powertrain: 'hybrid', modelYear: '2025',
    sourceUrl: 'https://www.toyota.co.th/media/product/series/download/CAMRY_Catalog2025.pdf',
  }),
  thVehicle({
    id: 'mazda-mazda3-sedan-20-th', brand: 'Mazda', model: 'Mazda3 Sedan', variant: '2.0 Skyactiv-G',
    category: 'car', engineCc: 1998, powertrain: 'petrol',
    sourceUrl: 'https://www.mazda.co.th/cars/mazda3-sedan/spec',
  }),
  thVehicle({
    id: 'bmw-320li-msport-th', brand: 'BMW', model: '320Li', variant: 'M Sport',
    category: 'car', engineCc: 1998, powertrain: 'petrol',
    sourceUrl: 'https://www.bmw.co.th/content/dam/bmw/marketTH/bmw_co_th/specsheet/3-20260112-01_EN_Li.pdf.asset.1768894796753.pdf',
  }),
  thVehicle({
    id: 'mercedes-benz-eqa-th', brand: 'Mercedes-Benz', model: 'EQA',
    category: 'car', engineCc: null, powertrain: 'electric',
    sourceUrl: 'https://www.mercedes-benz.co.th/th/passengercars/models/suv.html',
  }),
  thVehicle({
    id: 'tesla-model3-th', brand: 'Tesla', model: 'Model 3',
    category: 'car', engineCc: null, powertrain: 'electric',
    sourceUrl: 'https://www.tesla.com/th_th/model3-choose',
  }),
  thVehicle({
    id: 'tesla-modely-th', brand: 'Tesla', model: 'Model Y',
    category: 'car', engineCc: null, powertrain: 'electric',
    sourceUrl: 'https://www.tesla.com/th_th/modely',
  }),
  thVehicle({
    id: 'byd-atto3-2026-th', brand: 'BYD', model: 'ATTO 3',
    category: 'car', engineCc: null, powertrain: 'electric', modelYear: '2026',
    sourceUrl: 'https://www.reverautomotive.com/media/models/new-atto3/brochure/bydatto3_MY2026.pdf',
  }),
  thVehicle({
    id: 'byd-dolphin-th', brand: 'BYD', model: 'DOLPHIN',
    category: 'car', engineCc: null, powertrain: 'electric',
    sourceUrl: 'https://www.reverautomotive.com/model/new-dolphin/overview',
  }),
  thVehicle({
    id: 'byd-seal-th', brand: 'BYD', model: 'SEAL',
    category: 'car', engineCc: null, powertrain: 'electric',
    sourceUrl: 'https://www.reverautomotive.com/model/seal/overview',
  }),
];

export interface VehicleSearchFilters {
  category?: VehicleCategory;
  brand?: string;
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\-_.:]+/g, '');
}

export function getBrands(category: VehicleCategory): string[] {
  return [...new Set(VEHICLE_CATALOG.filter((entry) => entry.category === category)
    .map((entry) => entry.brand))].sort((a, b) => a.localeCompare(b));
}

/** Match compact names such as S1000RR, GSX8R and eHEV; filters combine with AND. */
export function searchVehicles(
  query = '',
  filters: VehicleSearchFilters = {},
): VehicleCatalogEntry[] {
  const terms = query.trim().split(/\s+/).map(normalizeSearch).filter(Boolean);
  const brand = filters.brand ? normalizeSearch(filters.brand) : '';
  return VEHICLE_CATALOG.filter((entry) => {
    if (filters.category && entry.category !== filters.category) return false;
    if (brand && normalizeSearch(entry.brand) !== brand) return false;
    const searchable = normalizeSearch([
      entry.brand, entry.model, entry.variant ?? '', entry.modelYear ?? '',
      entry.engineCc ?? '', entry.powertrain,
    ].join(' '));
    return terms.every((term) => searchable.includes(term));
  });
}

export function getCatalogVehicle(id: string): VehicleCatalogEntry | undefined {
  return VEHICLE_CATALOG.find((entry) => entry.id === id);
}

/** Missing-model input stays separate from verified catalog records. */
export interface ManualVehicleDraft {
  category: VehicleCategory;
  brand: string;
  model: string;
  variant?: string;
  modelYear?: string;
  engineCc: number | null;
  powertrain: VehiclePowertrain | null;
  source: 'manual';
}

export interface UserGarageSuggestion {
  readonly label: string;
  readonly category: VehicleCategory;
  readonly catalogId: string | null;
  readonly engineCc: number | null;
  readonly needsVariantConfirmation: boolean;
  readonly note?: string;
}

/** Suggestions based on the user's named vehicles; never silently create ownership. */
export const USER_GARAGE_SUGGESTIONS: readonly UserGarageSuggestion[] = [
  {
    label: 'PCX160', category: 'scooter', catalogId: 'honda-pcx160-th',
    engineCc: 156.9, needsVariantConfirmation: false,
  },
  {
    label: 'S 1000 RR', category: 'bigbike', catalogId: 'bmw-s1000rr-th',
    engineCc: 999, needsVariantConfirmation: false,
  },
  {
    label: 'Civic RS', category: 'car', catalogId: null,
    engineCc: null, needsVariantConfirmation: true,
    note: 'เลือกรุ่นเครื่องยนต์และปีรถของคุณก่อนระบุซีซี',
  },
];
