import type { SpeedSnapshot } from "../../speedEngine";

export type SpeedUnits = "kmh" | "mph";
export type RideMetrics = { distanceMeters: number; durationSeconds: number; averageMps: number | null };
export const speedFactor = (units: SpeedUnits) => units === "mph" ? 2.2369362920544 : 3.6;
const nonnegative = (value: number | null) => value !== null && Number.isFinite(value) && value >= 0;
export function presentSpeed(snapshot: SpeedSnapshot, units: SpeedUnits) {
  const factor = speedFactor(units);
  const converted = nonnegative(snapshot.liveMps) ? snapshot.liveMps! * factor : null;
  // Refuse an unrenderable value rather than inventing a capped speed.
  const live = snapshot.quality === "good" && converted !== null && converted <= 9999 ? converted : null;
  const maximum = nonnegative(snapshot.maxMps) && snapshot.maxMps! * factor <= 9999 ? snapshot.maxMps! * factor : null;
  const signal = snapshot.quality === "noFix" ? "noFix" : snapshot.quality === "weak" ? "weak" : live === null ? "confirming" : "good";
  return { live, maximum, signal } as const;
}
export function speedScale(live: number | null, maximum: number | null, units: SpeedUnits): number {
  const step = units === "mph" ? 40 : 60, base = units === "mph" ? 160 : 240;
  return Math.max(base, Math.ceil(Math.max(live ?? 0, maximum ?? 0) / step) * step);
}
export function formatRideDuration(value: number): string | null {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return null;
  const seconds = Math.floor(value), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60, remainder = seconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
export function metricDistance(value: number, units: SpeedUnits): { value: number; unit: "km" | "mi" } | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return { value: value / (units === "mph" ? 1609.344 : 1000), unit: units === "mph" ? "mi" : "km" };
}
/** Ten glyphs plus a closing zero permit uninterrupted 9→0 carries without layout changes. */
export function rollingDigitPosition(value: number, place: number): number {
  "worklet";
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const digit = Math.floor(safe / place) % 10;
  const fraction = place === 1 ? safe % 1 : Math.max(0, safe % place - (place - 1));
  return digit + Math.min(1, fraction);
}
