import catalogData from "./vehicleCatalog.json";

/** Curated reference configurations; neither ownership nor dealer inventory. */
export type VehicleCategory = "scooter" | "bigbike" | "car";
export type VehiclePowertrain = "petrol" | "diesel" | "hybrid" | "electric";
export interface VehicleCatalogEntry {
  readonly id: string;
  readonly familyId: string;
  readonly brand: string;
  readonly model: string;
  readonly variant?: string;
  readonly category: VehicleCategory;
  readonly engineCc: number | null;
  readonly motorPowerKw: number | null;
  readonly powertrain: VehiclePowertrain;
  readonly market: "TH" | "global";
  readonly modelYear?: string;
  readonly sourceUrl: string;
  readonly sourceUrls: readonly string[];
  readonly sourceEdition?: string | null;
  readonly verifiedAt: string;
  readonly specVerified: boolean;
  readonly modelYearVerified: boolean;
  readonly historicalEdition: boolean;
  readonly verificationNotes: readonly string[];
  readonly searchAliases: readonly string[];
}
export const CATALOG_VERIFIED_AT = catalogData.verifiedAt;
export const VEHICLE_CATEGORIES: readonly {
  id: VehicleCategory;
  labelKey: "m3.category.scooter" | "m3.category.bigbike" | "m3.category.car";
}[] = [
  { id: "scooter", labelKey: "m3.category.scooter" },
  { id: "bigbike", labelKey: "m3.category.bigbike" },
  { id: "car", labelKey: "m3.category.car" },
];
export const VEHICLE_CATALOG: readonly VehicleCatalogEntry[] =
  catalogData.entries.map((entry) => ({
    ...entry,
    category: entry.category as VehicleCategory,
    powertrain: entry.powertrain as VehiclePowertrain,
    market: entry.market as "TH",
    variant: entry.variant ?? undefined,
    modelYear: entry.modelYear ?? undefined,
  }));
export interface VehicleSearchFilters {
  category?: VehicleCategory;
  brand?: string;
}
function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\-_.:+]+/g, "");
}
export function getBrands(category: VehicleCategory): string[] {
  return [
    ...new Set(
      VEHICLE_CATALOG.filter((entry) => entry.category === category).map(
        (entry) => entry.brand,
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
}
/** Compact aliases work; category and brand filters combine with AND. */
export function searchVehicles(
  query = "",
  filters: VehicleSearchFilters = {},
): VehicleCatalogEntry[] {
  const terms = query.trim().split(/\s+/).map(normalizeSearch).filter(Boolean);
  const brand = filters.brand ? normalizeSearch(filters.brand) : "";
  return VEHICLE_CATALOG.filter((entry) => {
    if (filters.category && entry.category !== filters.category) return false;
    if (brand && normalizeSearch(entry.brand) !== brand) return false;
    const text = normalizeSearch(
      [
        entry.brand,
        entry.model,
        entry.variant ?? "",
        entry.modelYear ?? "",
        entry.engineCc ?? "",
        entry.motorPowerKw ?? "",
        entry.powertrain,
        ...entry.searchAliases,
      ].join(" "),
    );
    return terms.every((term) => text.includes(term));
  });
}
/** Aliases resolve reference facts only. Never rewrite a saved owner snapshot. */
export function getCatalogVehicle(id: string): VehicleCatalogEntry | undefined {
  const canonical = (catalogData.aliases as Record<string, string>)[id] ?? id;
  return VEHICLE_CATALOG.find((entry) => entry.id === canonical);
}
export function getVehicleVariants(
  entry: VehicleCatalogEntry,
): VehicleCatalogEntry[] {
  return VEHICLE_CATALOG.filter(
    (candidate) => candidate.familyId === entry.familyId,
  );
}
export interface ManualVehicleDraft {
  category: VehicleCategory;
  brand: string;
  model: string;
  variant?: string;
  modelYear?: string;
  engineCc: number | null;
  motorPowerKw?: number | null;
  powertrain: VehiclePowertrain | null;
  source: "manual";
}
export interface UserGarageSuggestion {
  readonly label: string;
  readonly category: VehicleCategory;
  readonly catalogId: string | null;
  readonly engineCc: number | null;
  readonly needsVariantConfirmation: boolean;
}
export const USER_GARAGE_SUGGESTIONS: readonly UserGarageSuggestion[] = [
  {
    label: "PCX160",
    category: "scooter",
    catalogId: "honda-pcx160-starter-th-v5",
    engineCc: 156.93,
    needsVariantConfirmation: true,
  },
  {
    label: "S 1000 RR",
    category: "bigbike",
    catalogId: "bmw-s1000rr-starter-th-v5",
    engineCc: 999,
    needsVariantConfirmation: true,
  },
  {
    label: "Civic RS",
    category: "car",
    catalogId: null,
    engineCc: null,
    needsVariantConfirmation: true,
  },
];
