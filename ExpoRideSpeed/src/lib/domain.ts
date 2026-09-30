export type Category = "scooter" | "bigbike" | "car";
export type GarageVehicle = {
  id: string;
  catalogId: string | null;
  category: Category;
  brand: string;
  model: string;
  variant?: string;
  powertrain?: "petrol" | "hybrid" | "electric" | null;
  engineCc: number | null;
  year: string;
};
export type Stop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};
export type SavedRoute = {
  id: string;
  name: string;
  stops: Stop[];
  closedCourse: boolean;
  cloudId?: string;
  cloudRevision?: number;
  category?: "scooter" | "motorcycle" | "car" | "bicycle";
};
export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function validCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}
export function validateRoute(route: SavedRoute) {
  if (!route.name.trim() || route.name.length > 80)
    return "ตั้งชื่อเส้นทาง 1–80 ตัวอักษร";
  if (route.stops.length < 2 || route.stops.length > 12)
    return "เลือกจุดอย่างน้อย 2 จุด และไม่เกิน 12 จุด";
  if (
    route.stops.some(
      (s) => !s.name.trim() || !validCoordinate(s.latitude, s.longitude),
    )
  )
    return "ตรวจสอบชื่อและพิกัดของแต่ละจุด";
  return null;
}
export function moveStop(stops: Stop[], index: number, delta: number): Stop[] {
  const target = index + delta;
  if (
    index < 0 ||
    target < 0 ||
    index >= stops.length ||
    target >= stops.length
  )
    return stops;
  const copy = [...stops];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}
export function routeDistanceKm(stops: Stop[]) {
  return stops.slice(1).reduce((sum, stop, i) => {
    const from = stops[i],
      rad = Math.PI / 180;
    const a =
      Math.sin(((stop.latitude - from.latitude) * rad) / 2) ** 2 +
      Math.cos(from.latitude * rad) *
        Math.cos(stop.latitude * rad) *
        Math.sin(((stop.longitude - from.longitude) * rad) / 2) ** 2;
    return (
      sum + 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
    );
  }, 0);
}
