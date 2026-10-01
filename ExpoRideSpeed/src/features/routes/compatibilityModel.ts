import { validateRouteProjection } from './syncModel';
import type { RouteCategory, RouteProjection, RouteSnapshot } from './syncTypes';

export type ShareSnapshot = {
 title:string; revision:number; category:RouteCategory; route_id:string|null;
 geometry:Pick<RouteProjection,'segments'|'geometryStatus'|'privacyTrimMeters'|'geometryHash'|'provider'|'attribution'>|null;
};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
/** Old metadata is useful history, but raw legacy pins never become shared geometry. */
export function parseShareSnapshot(input:unknown):ShareSnapshot|null {
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const v=input as Record<string,unknown>;
 if(typeof v.title!=='string'||![...v.title].length||[...v.title].length>80||!v.title.trim()||/[\u0000-\u001f\u007f]/.test(v.title)||!Number.isInteger(v.revision)||(v.revision as number)<1||(v.revision as number)>2147483647||!['scooter','motorcycle','car','bicycle'].includes(String(v.category)))return null;
 const routeId=v.route_id??v.id,route_id=typeof routeId==='string'&&uuid.test(routeId)?routeId:null;
 const result:ShareSnapshot={title:v.title,revision:v.revision as number,category:v.category as RouteCategory,route_id,geometry:null};
 if('stops' in v||'bounds' in v||'routeToken' in v||!route_id)return result;
 try{
  const projection=validateRouteProjection({id:route_id,owner_id:'00000000-0000-4000-8000-000000000001',revision:v.revision,title:v.title,category:v.category,visibility:'private',segments:v.segments,geometryStatus:v.geometryStatus,privacyTrimMeters:v.privacyTrimMeters,geometryHash:v.geometryHash,provider:v.provider,attribution:v.attribution});
  if(projection)result.geometry={segments:projection.segments,geometryStatus:projection.geometryStatus,privacyTrimMeters:projection.privacyTrimMeters,geometryHash:projection.geometryHash,provider:projection.provider,attribution:projection.attribution};
 }catch{/* Invalid or historical geometry stays unavailable; no raw fallback. */}
 return result;
}
export function isReviewableShareSnapshot(input:unknown):boolean{const parsed=parseShareSnapshot(input);return parsed!==null&&parsed.geometry!==null;}
/** The preview must refer to the same owner version the publish RPC will receive. */
export function sharePreview(owner:RouteSnapshot|null,projection:RouteProjection|null):ShareSnapshot {
 if(!owner||!projection||owner.id!==projection.id||owner.owner_id!==projection.owner_id||owner.revision!==projection.revision||owner.document.title!==projection.title||owner.document.category!==projection.category)throw Error('ROUTE_REVISION_CONFLICT');
 const result=parseShareSnapshot(projection);if(!result?.geometry)throw Error('ROUTE_SYNC_INVALID_RESPONSE');return result;
}
