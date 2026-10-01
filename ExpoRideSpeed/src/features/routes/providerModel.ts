import type { Coordinate, RoadResult, RoutingProfile, SearchResult } from './types';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash=/^[0-9a-f]{64}$/;
const object=(value:unknown):Record<string,unknown>=>{
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('ROUTE_PROVIDER_INVALID_RESPONSE');
  return value as Record<string,unknown>;
};
function exact(value:Record<string,unknown>,keys:string[]){if(Object.keys(value).length!==keys.length||keys.some(key=>!(key in value)))throw new Error('ROUTE_PROVIDER_INVALID_RESPONSE');}
function text(value:unknown,max:number,empty=false):string{if(typeof value!=='string'||(!empty&&!value.trim())||Array.from(value).length>max||/[\u0000-\u001f\u007f]/.test(value))throw new Error('ROUTE_PROVIDER_INVALID_RESPONSE');return value;}
function coordinate(value:unknown):Coordinate{
  const raw=object(value);exact(raw,['latitude','longitude']);
  if(typeof raw.latitude!=='number'||typeof raw.longitude!=='number'||!Number.isFinite(raw.latitude)||!Number.isFinite(raw.longitude)||Math.abs(raw.latitude)>90||Math.abs(raw.longitude)>180)throw new Error('ROUTE_PROVIDER_INVALID_RESPONSE');
  return {latitude:raw.latitude,longitude:raw.longitude};
}
export function searchRequest(query:string,language:'th'|'en',consent:boolean,proximity?:Coordinate){
  const normalized=query.normalize('NFC').trim().replace(/\s+/gu,' ');
  if(!consent||!['th','en'].includes(language)||Array.from(normalized).length<3||Array.from(normalized).length>120||/[\u0000-\u001f\u007f]/.test(normalized))throw new Error('INVALID_REQUEST');
  let near:Coordinate|undefined;
  try{if(proximity)near=coordinate(proximity);}catch{throw new Error('INVALID_REQUEST');}
  return {operation:'search' as const,query:normalized,language,consent:true as const,...(near?{proximity:near}:{})};
}
export function roadRequest(stops:readonly Coordinate[],profile:RoutingProfile,consent:boolean){
  if(!consent||!['scooter','motorcycle','drive'].includes(profile)||stops.length<2||stops.length>12)throw new Error('INVALID_REQUEST');
  let points:Coordinate[];try{points=stops.map(point=>coordinate(point));}catch{throw new Error('INVALID_REQUEST');}
  return {operation:'route' as const,stops:points,profile,consent:true as const};
}
export function parseSearchResult(value:unknown):SearchResult {
  const raw=object(value);exact(raw,['items','attribution','cached']);
  if(!Array.isArray(raw.items)||raw.items.length>5||typeof raw.cached!=='boolean')throw new Error('ROUTE_PROVIDER_INVALID_RESPONSE');
  return {items:raw.items.map(item=>{const point=object(item);exact(point,['id','label','subtitle','latitude','longitude']);return {id:text(point.id,300),label:text(point.label,240),subtitle:text(point.subtitle,500,true),...coordinate({latitude:point.latitude,longitude:point.longitude})};}),attribution:text(raw.attribution,240),cached:raw.cached};
}
export function parseRoadResult(value:unknown,profile:RoutingProfile):RoadResult {
  const raw=object(value);exact(raw,['routeToken','requestHash','provider','profile','segments','distanceMeters','durationSeconds','calculatedAt','attribution','cached']);
  if(typeof raw.routeToken!=='string'||!uuid.test(raw.routeToken)||typeof raw.requestHash!=='string'||!hash.test(raw.requestHash)||raw.provider!=='geoapify'||raw.profile!==profile||typeof raw.cached!=='boolean'||!Array.isArray(raw.segments)||!raw.segments.length||raw.segments.length>32)throw new Error('ROUTE_PROVIDER_INVALID_RESPONSE');
  if(typeof raw.distanceMeters!=='number'||!Number.isFinite(raw.distanceMeters)||raw.distanceMeters<0||raw.distanceMeters>450000||typeof raw.durationSeconds!=='number'||!Number.isFinite(raw.durationSeconds)||raw.durationSeconds<0||raw.durationSeconds>604800)throw new Error('ROUTE_PROVIDER_INVALID_RESPONSE');
  const calculatedAt=text(raw.calculatedAt,40);
  if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|\+00:00)$/.test(calculatedAt)||!Number.isFinite(Date.parse(calculatedAt)))throw new Error('ROUTE_PROVIDER_INVALID_RESPONSE');
  let count=0;
  const segments=raw.segments.map(part=>{if(!Array.isArray(part)||part.length<2||part.length>4096||(count+=part.length)>10000)throw new Error('ROUTE_PROVIDER_INVALID_RESPONSE');return part.map(coordinate);});
  return {routeToken:raw.routeToken,requestHash:raw.requestHash,provider:'geoapify',profile,segments,distanceMeters:raw.distanceMeters,durationSeconds:raw.durationSeconds,calculatedAt,attribution:text(raw.attribution,240),cached:raw.cached};
}
export const routeProviderCodes=['AUTH_REQUIRED','INVALID_REQUEST','REQUEST_TOO_LARGE','ROUTE_DISTANCE_LIMIT','NO_ROUTE','QUOTA_EXCEEDED','THROTTLED','PROVIDER_UNAVAILABLE','SERVER_CONFIGURATION','ACCOUNT_DELETION_PENDING','ACCOUNT_CHANGED','ROUTE_PROVIDER_INVALID_RESPONSE'] as const;
export function safeProviderCode(value:unknown):string{return typeof value==='string'&&routeProviderCodes.some(code=>code===value)?value:'PROVIDER_UNAVAILABLE';}
