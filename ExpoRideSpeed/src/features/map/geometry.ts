import type { MapCamera, MapCameraCommand, MapCoordinate, MapFitOptions, MapFix, MapInsets, MapPeer, MapPin, MapTrack } from './MapSurface.types';

export type LngLat = [number, number];
export function validCoordinate(value: MapCoordinate | null | undefined): value is MapCoordinate {
  return !!value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}
export function toLngLat(value: MapCoordinate): LngLat | null {
  return validCoordinate(value) ? [value.longitude, value.latitude] : null;
}
export function fromLngLat(value: readonly number[]): MapCoordinate | null {
  if (value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) return null;
  // Renderers may return a repeated world; app storage always uses [-180, 180].
  const coordinate = { longitude: ((value[0] + 180) % 360 + 360) % 360 - 180, latitude: value[1] };
  return validCoordinate(coordinate) ? coordinate : null;
}
const collection = <G extends GeoJSON.Geometry>(features: GeoJSON.Feature<G>[]): GeoJSON.FeatureCollection<G> => ({ type: 'FeatureCollection', features });
export function trackData(track: MapTrack | null): GeoJSON.FeatureCollection<GeoJSON.MultiLineString> {
  const lines: LngLat[][] = [];
  for (const segment of track?.segments ?? []) {
    let part: LngLat[] = [];
    const flush = () => { if (part.length > 1) lines.push(part); part = []; };
    for (const coordinate of segment) {
      const point = toLngLat(coordinate);
      if (point) part.push(point); else flush();
    }
    flush();
  }
  return collection(lines.length && track ? [{ type: 'Feature', id: 'ride-track', properties: { kind: track.kind }, geometry: { type: 'MultiLineString', coordinates: lines } }] : []);
}
export function pinsData(pins: readonly MapPin[], selectedId: string | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const seen = new Set<string>(), features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const pin of pins) {
    const coordinate = toLngLat(pin.coordinate);
    if (!coordinate || !pin.id || seen.has(pin.id)) continue;
    seen.add(pin.id);
    features.push({ type: 'Feature', id: pin.id, properties: { id: pin.id, label: pin.label, role: pin.role, order: pin.order, selected: pin.id === selectedId }, geometry: { type: 'Point', coordinates: coordinate } });
  }
  return collection(features);
}
export function peersData(peers: readonly MapPeer[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const seen = new Set<string>(), features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const peer of peers) {
    const coordinate = toLngLat(peer.coordinate);
    if (!coordinate || !peer.id || seen.has(peer.id) || !['online', 'riding'].includes(peer.presence) || !Number.isFinite(peer.updatedAtMs) || peer.updatedAtMs <= 0) continue;
    seen.add(peer.id);
    features.push({ type: 'Feature', id: peer.id, properties: { id: peer.id, name: peer.name, presence: peer.presence }, geometry: { type: 'Point', coordinates: coordinate } });
  }
  return collection(features);
}
export function fixData(fix: MapFix | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const coordinate = fix && toLngLat(fix.coordinate);
  if (!fix || !coordinate || typeof fix.accuracyMeters !== 'number' || !Number.isFinite(fix.accuracyMeters) || fix.accuracyMeters < 0 || !Number.isFinite(fix.timestampMs) || fix.timestampMs <= 0) return collection([]);
  return collection([{ type: 'Feature', id: 'rider-position', properties: { accuracy: fix.accuracyMeters, heading: fix.headingDegrees }, geometry: { type: 'Point', coordinates: coordinate } }]);
}
export type FitIntent = { kind: 'center'; center: LngLat; zoom: number } | { kind: 'bounds'; bounds: [number, number, number, number]; maxZoom: number };
export function fitIntent(coordinates: readonly MapCoordinate[], options: MapFitOptions = {}): FitIntent | null {
  const points = coordinates.map(toLngLat).filter((point): point is LngLat => !!point);
  if (!points.length) return null;
  const maxZoom = Number.isFinite(options.maxZoom) ? Math.max(0, Math.min(22, options.maxZoom!)) : 16;
  if (points.every(point => point[0] === points[0][0] && point[1] === points[0][1])) return { kind: 'center', center: points[0], zoom: maxZoom };
  const longitudes = points.map(point => (point[0] + 360) % 360).sort((a, b) => a - b);
  let gap = -1, startIndex = 0;
  for (let i = 0; i < longitudes.length; i++) {
    const next = i === longitudes.length - 1 ? longitudes[0] + 360 : longitudes[i + 1];
    if (next - longitudes[i] > gap) { gap = next - longitudes[i]; startIndex = (i + 1) % longitudes.length; }
  }
  const start = longitudes[startIndex], west = start > 180 ? start - 360 : start;
  return { kind: 'bounds', bounds: [west, Math.min(...points.map(point => point[1])), west + 360 - gap, Math.max(...points.map(point => point[1]))], maxZoom };
}
export function safeInsets(value: MapInsets): MapInsets {
  const safe = (number: number) => Number.isFinite(number) ? Math.max(0, number) : 0;
  return { top: safe(value.top), right: safe(value.right), bottom: safe(value.bottom), left: safe(value.left) };
}
/** Native fitBounds has no maxZoom option. Cap only a fit that would zoom too far. */
export function cappedFitCamera(bounds: [number, number, number, number], viewport: { width: number; height: number }, insets: MapInsets, maxZoom: number): { center: MapCoordinate; zoom: number } | null {
  const padding = safeInsets(insets), width = viewport.width - padding.left - padding.right, height = viewport.height - padding.top - padding.bottom;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const mercatorY = (latitude: number) => { const radians = Math.min(85.05112878, Math.max(-85.05112878, latitude)) * Math.PI / 180; return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2; };
  const [west, south, east, north] = bounds, yNorth = mercatorY(north), ySouth = mercatorY(south);
  const zoom = Math.log2(Math.min(width / (512 * Math.max((east - west) / 360, Number.EPSILON)), height / (512 * Math.max(ySouth - yNorth, Number.EPSILON))));
  if (zoom <= maxZoom) return null;
  const center = fromLngLat([(west + east) / 2, Math.atan(Math.sinh(Math.PI * (1 - yNorth - ySouth))) * 180 / Math.PI]);
  return center ? { center, zoom: maxZoom } : null;
}
export function safeCamera(value: MapCamera): MapCamera | null {
  if (!validCoordinate(value.center) || !Number.isFinite(value.zoom) || !Number.isFinite(value.bearing) || !Number.isFinite(value.pitch)) return null;
  return { center: value.center, zoom: Math.min(22, Math.max(0, value.zoom)), bearing: value.bearing, pitch: Math.min(60, Math.max(0, value.pitch)) };
}
export function cameraCommand(value: MapCameraCommand, current: MapCamera, reducedMotion: boolean) {
  const camera = safeCamera({ ...current, ...value });
  if (!camera) return null;
  const duration = reducedMotion ? 0 : Number.isFinite(value.durationMs) ? Math.max(0, value.durationMs!) : 300;
  return { ...camera, duration };
}
export function mapWorkerUrl(origin: string, basePath: string): string | null {
  if (basePath && (!basePath.startsWith('/') || basePath.startsWith('//') || /[?#\\]/.test(basePath))) return null;
  try {
    const app = new URL(origin), worker = new URL(`${basePath.replace(/\/$/, '')}/maplibre/maplibre-gl-worker.mjs`, app.origin);
    return worker.origin === app.origin ? worker.href : null;
  } catch { return null; }
}
