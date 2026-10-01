import type { BuilderDraft, BuilderGeometry, BuilderStop, Coordinate } from './types';

export type StoredBuilderDraft = { localId: string | null; value: BuilderDraft; baseFingerprint?:string };
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && [...value].length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const number = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
function coordinate(value: unknown): Coordinate | null {
 const p = object(value);
 return p && typeof p.latitude === 'number' && typeof p.longitude === 'number' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 ? { latitude:p.latitude, longitude:p.longitude } : null;
}
/** Incomplete drafts may have no title or fewer than two stops. They never certify server geometry. */
export function parseBuilderDraft(input: unknown, stripCloud = false): StoredBuilderDraft | null {
 try {
  if (JSON.stringify(input)?.length > 524288) return null;
  const stored = object(input), value = object(stored?.value);
  if (!stored || !value || !(stored.localId === null || text(stored.localId,100) && stored.localId.length > 0) || !text(value.title,80) || !['scooter','motorcycle','car','bicycle'].includes(String(value.category)) || !['private','friends','public'].includes(String(value.visibility)) || !Array.isArray(value.stops) || value.stops.length > 12) return null;
  if(stored.baseFingerprint!==undefined&&!(typeof stored.baseFingerprint==='string'&&stored.baseFingerprint.length>0&&stored.baseFingerprint.length<=524288))return null;
  const stops: BuilderStop[] = [], ids = new Set<string>();
  for (const raw of value.stops) {
   const stop = object(raw), point = coordinate(stop?.coordinate);
   if (!stop || !text(stop.id,100) || !stop.id || ids.has(stop.id) || !text(stop.label,80) || !point || stop.placeId !== undefined && !text(stop.placeId,300)) return null;
   ids.add(stop.id); stops.push({id:stop.id,label:stop.label,coordinate:point,...(stop.placeId ? {placeId:stop.placeId as string} : {})});
  }
  let geometry: BuilderGeometry | null = null;
  if (value.geometry !== null) {
   const g = object(value.geometry);
   if (!g || !['road','recorded'].includes(String(g.kind)) || !Array.isArray(g.segments) || g.segments.length > 32 || !(g.distanceMeters === null || number(g.distanceMeters,10000000)) || !(g.durationSeconds === null || number(g.durationSeconds,604800))) return null;
   const segments: Coordinate[][] = []; let count = 0;
   for (const part of g.segments) {
    if (!Array.isArray(part) || part.length < 1 || part.length > 4096 || (count += part.length) > 10000) return null;
    const points = part.map(coordinate); if (points.some(point => !point)) return null; segments.push(points as Coordinate[]);
   }
   if (g.attribution !== undefined && !text(g.attribution,500) || g.routeToken !== undefined && !uuid(g.routeToken) || g.requestHash !== undefined && !(typeof g.requestHash === 'string' && /^[a-f\d]{64}$/i.test(g.requestHash))) return null;
   if (g.recordedParts !== undefined && !(Array.isArray(g.recordedParts) && g.recordedParts.length <= 32 && g.recordedParts.every(part => typeof part === 'string' && part.length > 0 && part.length <= 65536 && /^[?-~]+$/.test(part)))) return null;
   if (g.calculatedAt !== undefined && g.calculatedAt !== null && !(text(g.calculatedAt,64) && Number.isFinite(Date.parse(g.calculatedAt)))) return null;
   geometry = {kind:g.kind as BuilderGeometry['kind'],segments,distanceMeters:g.distanceMeters as number|null,durationSeconds:g.durationSeconds as number|null,
    ...(g.attribution ? {attribution:g.attribution as string} : {}),
    ...(!stripCloud && g.routeToken ? {routeToken:g.routeToken as string} : {}),
    ...(!stripCloud && g.requestHash ? {requestHash:g.requestHash as string} : {}),
    ...(g.recordedParts ? {recordedParts:[...g.recordedParts as string[]]} : {})};
   if(g.calculatedAt!==undefined)geometry.calculatedAt=g.calculatedAt as string|null;
  }
  return {localId:stored.localId as string|null,value:{title:value.title,category:value.category as BuilderDraft['category'],visibility:stripCloud ? 'private' : value.visibility as BuilderDraft['visibility'],stops,geometry},...(!stripCloud&&stored.baseFingerprint?{baseFingerprint:stored.baseFingerprint as string}:{})};
 } catch { return null; }
}
