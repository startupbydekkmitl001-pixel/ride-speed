import type {
  VehicleCatalogEntry,
  VehicleCategory,
  VehiclePowertrain,
} from "../../data/vehicleCatalog";
import type { GarageVehicle } from "../../lib/domain";

export interface VehicleDraft {
  category: VehicleCategory;
  catalogId: string | null;
  brand: string;
  model: string;
  variant: string;
  powertrain: VehiclePowertrain | null;
  engineCcInput: string;
  motorPowerKwInput: string;
  year: string;
  nickname: string;
  color: string;
}
export function blankVehicleDraft(category: VehicleCategory): VehicleDraft {
  return {
    category,
    catalogId: null,
    brand: "",
    model: "",
    variant: "",
    powertrain: null,
    engineCcInput: "",
    motorPowerKwInput: "",
    year: "",
    nickname: "",
    color: "",
  };
}
export function draftFromCatalog(
  entry: Pick<
    VehicleCatalogEntry,
    | "id"
    | "category"
    | "brand"
    | "model"
    | "variant"
    | "powertrain"
    | "engineCc"
    | "modelYear"
  > & { motorPowerKw?: number | null },
): VehicleDraft {
  return {
    ...blankVehicleDraft(entry.category),
    catalogId: entry.id,
    brand: entry.brand,
    model: entry.model,
    variant: entry.variant ?? "",
    powertrain: entry.powertrain,
    engineCcInput: entry.engineCc?.toString() ?? "",
    motorPowerKwInput: entry.motorPowerKw?.toString() ?? "",
  };
}
export function draftFromVehicle(vehicle: GarageVehicle): VehicleDraft {
  return {
    ...blankVehicleDraft(vehicle.category),
    catalogId: vehicle.catalogId,
    brand: vehicle.brand,
    model: vehicle.model,
    variant: vehicle.variant ?? "",
    powertrain: vehicle.powertrain ?? null,
    engineCcInput: vehicle.engineCc?.toString() ?? "",
    motorPowerKwInput: vehicle.motorPowerKw?.toString() ?? "",
    year: vehicle.year,
    nickname: vehicle.nickname ?? "",
    color: vehicle.color ?? "",
  };
}
function positiveNumber(text: string, max: number): number | null | false {
  const raw = text.trim();
  if (!raw) return null;
  const cleaned = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?$/.test(raw)
    ? raw.replace(/,/g, "")
    : raw;
  if (!/^\d+(?:\.\d{1,3})?$/.test(cleaned)) return false;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 && value <= max ? value : false;
}
export type VehicleDraftError =
  | "m3.validation.name"
  | "m3.validation.year"
  | "m3.validation.spec"
  | "m3.validation.color"
  | "m3.error.vehicleChanged";
export function buildGarageVehicle(
  draft: VehicleDraft,
  id: string,
  currentYear: number,
  existing?: GarageVehicle,
  currentVehicles?: readonly GarageVehicle[],
): { vehicle: GarageVehicle | null; error: VehicleDraftError | null } {
  if (existing && currentVehicles) {
    const existingId = existing.id;
    const current = currentVehicles.find(
      (vehicle) => vehicle.id === existingId,
    );
    if (!current) return { vehicle: null, error: "m3.error.vehicleChanged" };
    existing = current;
  }
  const brand = draft.brand.trim(),
    model = draft.model.trim(),
    year = draft.year.trim();
  if (
    !brand ||
    !model ||
    brand.length > 50 ||
    model.length > 70 ||
    draft.variant.trim().length > 70 ||
    draft.nickname.trim().length > 40 ||
    [brand, model, draft.variant, draft.nickname].some((text) =>
      /[\u0000-\u001f]/.test(text),
    )
  )
    return { vehicle: null, error: "m3.validation.name" };
  if (
    year &&
    (!/^\d{4}$/.test(year) ||
      !(
        (Number(year) >= 1900 && Number(year) <= currentYear + 1) ||
        (Number(year) >= 2443 && Number(year) <= currentYear + 544)
      ))
  )
    return { vehicle: null, error: "m3.validation.year" };
  const value = positiveNumber(
    draft.powertrain === "electric"
      ? draft.motorPowerKwInput
      : draft.engineCcInput,
    draft.powertrain === "electric" ? 2000 : 10000,
  );
  if (value === false) return { vehicle: null, error: "m3.validation.spec" };
  const color = draft.color.trim().toUpperCase();
  if (color && !/^#[0-9A-F]{6}$/.test(color))
    return { vehicle: null, error: "m3.validation.color" };
  return {
    error: null,
    vehicle: {
      ...existing,
      id: existing?.id ?? id,
      catalogId: draft.catalogId,
      category: draft.category,
      brand,
      model,
      variant: draft.variant.trim() || undefined,
      powertrain: draft.powertrain,
      engineCc: draft.powertrain === "electric" ? null : value,
      motorPowerKw: draft.powertrain === "electric" ? value : null,
      year,
      nickname: draft.nickname.trim() || undefined,
      color: color || undefined,
    },
  };
}
export function vehicleDisplayName(
  vehicle: Pick<GarageVehicle, "model" | "nickname">,
): string {
  return vehicle.nickname?.trim() || vehicle.model;
}
export function vehicleMeasure(
  vehicle: Pick<GarageVehicle, "engineCc" | "motorPowerKw" | "powertrain">,
): { value: number | null; unit: "cc" | "kw" } {
  return vehicle.powertrain === "electric"
    ? { value: vehicle.motorPowerKw ?? null, unit: "kw" }
    : { value: vehicle.engineCc, unit: "cc" };
}
