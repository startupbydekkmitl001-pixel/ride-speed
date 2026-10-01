import type { MapCoordinate } from '../map/MapSurface.types';
export type Coordinate = MapCoordinate;
export type RouteCategory = 'scooter' | 'motorcycle' | 'car' | 'bicycle';
export type RouteVisibility = 'private' | 'friends' | 'public';
export type RoutingProfile = 'scooter' | 'motorcycle' | 'drive';
export type SearchResult = { items: { id: string; label: string; subtitle: string; latitude: number; longitude: number }[]; attribution: string; cached: boolean };
export type RoadResult = {
  routeToken: string; requestHash: string; provider: 'geoapify'; profile: RoutingProfile;
  segments: MapCoordinate[][]; distanceMeters: number; durationSeconds: number;
  calculatedAt: string; attribution: string; cached: boolean;
};
export type RouteDocument = {
  schema_version: 1; title: string; category: RouteCategory; visibility: RouteVisibility;
  stops: { lat: number; lng: number; label: string; place_id?: string }[];
  source: { kind: 'road'; routeToken: string } | { kind: 'recorded'; segments: string[] } | { kind: 'draft' };
};
export type RouteSnapshot = {
  id: string; owner_id: string; revision: number; document: RouteDocument;
  segments: MapCoordinate[][]; distanceMeters: number|null; durationSeconds: number|null;
  geometryHash: string|null; provider: 'geoapify'|'recorded'|'draft';
  calculatedAt: string|null; attribution: string|null; updated_at: string;
};
export type BuilderStop = { id: string; label: string; coordinate: MapCoordinate; placeId?: string };
export type BuilderGeometry = {
  kind: 'road'|'recorded'; segments: readonly (readonly MapCoordinate[])[];
  distanceMeters: number|null; durationSeconds: number|null; attribution?: string;
  routeToken?: string; requestHash?: string;
  calculatedAt?: string|null;
  /** Independently encoded, owner-recorded parts. Required when saving recorded geometry. */
  recordedParts?: string[];
};
export type BuilderDraft = { title: string; category: RouteCategory; visibility: RouteVisibility; stops: BuilderStop[]; geometry: BuilderGeometry|null };
