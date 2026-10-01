import type { SavedRoute } from '../../lib/domain';
import type { RouteDeleteDraft, RouteDocumentV1, RouteSnapshot, RouteSyncDraft } from './syncTypes';
import { freezeRouteDeleteDraft, freezeRouteDraft, validateRouteDocument } from './syncModel';

export type RouteLocalGeometry = Pick<RouteSnapshot, 'segments'|'distanceMeters'|'durationSeconds'|'geometryHash'|'provider'|'calculatedAt'|'attribution'>;
export type RoutePending = {action:'save';draft:RouteSyncDraft}|{action:'delete';draft:RouteDeleteDraft};
export type RouteSourceError = 'ROUTE_SOURCE_EXPIRED'|'ROUTE_SOURCE_UNAVAILABLE'|'ROUTE_SOURCE_MISMATCH';
export type RouteLocalSync = {
  cloudId:string|null; revision:number|null; cleanFingerprint:string|null; pending:RoutePending|null;
  deleted:boolean; serverDeleted:boolean; blocked:{fingerprint:string;error:RouteSourceError}|null;
};
export type RouteLocalRecord = {localId:string; document:RouteDocumentV1; geometry:RouteLocalGeometry|null; sync:RouteLocalSync};
export type RouteRecordInput = {localId:string; document:RouteDocumentV1; geometry?:RouteLocalGeometry|null; expectedFingerprint?:string|null};
export const ROUTE_MAX_RECORDS=1000,ROUTE_MAX_LIVE=200;
export const blankRouteSync = ():RouteLocalSync => ({cloudId:null,revision:null,cleanFingerprint:null,pending:null,deleted:false,serverDeleted:false,blocked:null});
export const routeUUID = (value:unknown):value is string => typeof value==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0&&Array.from(value).length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function fail():never{throw Error('ROUTE_LOCAL_INVALID');}
const detach=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function document(value:unknown):RouteDocumentV1 {
  const valid=validateRouteDocument(value);
  // One ordering for exact dirty equality; provider proof remains unchanged.
  return {
    schema_version:1,title:valid.title,category:valid.category,visibility:valid.visibility,
    stops:valid.stops.map(stop=>({lat:stop.lat,lng:stop.lng,label:stop.label,...(stop.place_id!==undefined?{place_id:stop.place_id}:{})})),
    source:valid.source.kind==='road'?{kind:'road',routeToken:valid.source.routeToken}:valid.source.kind==='recorded'?{kind:'recorded',segments:[...valid.source.segments]}:{kind:'draft'},
  };
}
/** Exact canonical equality prevents hash collisions from declaring an edit clean. */
export const fingerprintRoute=(value:RouteDocumentV1):string=>JSON.stringify(document(value));
function fingerprint(value:unknown):string|null {
  if(value===null)return null;
  if(typeof value!=='string'||value.length>524288)fail();
  try{return fingerprintRoute(JSON.parse(value as string));}catch{return fail();}
}
export function parseRouteGeometry(value:unknown):RouteLocalGeometry|null {
  if(value===null||value===undefined)return null;if(!object(value)||!Array.isArray(value.segments)||value.segments.length>32)fail();
  let count=0;
  const segments=(value.segments as unknown[]).map(part=>{
    if(!Array.isArray(part)||part.length<1||part.length>4096)fail();count+=part.length;if(count>10000)fail();
    return part.map(point=>{if(!object(point)||typeof point.latitude!=='number'||!Number.isFinite(point.latitude)||Math.abs(point.latitude)>90||typeof point.longitude!=='number'||!Number.isFinite(point.longitude)||Math.abs(point.longitude)>180)fail();return {latitude:point.latitude as number,longitude:point.longitude as number};});
  });
  const metric=(v:unknown)=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0;
  const date=(v:unknown)=>v===null||typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
  if(!metric(value.distanceMeters)||!metric(value.durationSeconds)||!(value.geometryHash===null||typeof value.geometryHash==='string'&&/^[a-f\d]{64}$/i.test(value.geometryHash))||!['geoapify','recorded','draft'].includes(value.provider as string)||!date(value.calculatedAt)||!(value.attribution===null||text(value.attribution,500)))fail();
  return {segments,distanceMeters:value.distanceMeters as number|null,durationSeconds:value.durationSeconds as number|null,geometryHash:value.geometryHash as string|null,provider:value.provider as RouteLocalGeometry['provider'],calculatedAt:value.calculatedAt as string|null,attribution:value.attribution as string|null};
}
export function routeRecord(input:RouteRecordInput):RouteLocalRecord {
  if(!text(input.localId,100))fail();return {localId:input.localId,document:document(input.document),geometry:parseRouteGeometry(input.geometry),sync:blankRouteSync()};
}
export function snapshotRecord(snapshot:RouteSnapshot,localId=snapshot.id):RouteLocalRecord {
  if(!routeUUID(snapshot.id)||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||snapshot.revision>2147483647)fail();
  const record=routeRecord({localId,document:snapshot.document,geometry:snapshot});
  return {...record,sync:{...blankRouteSync(),cloudId:snapshot.id,revision:snapshot.revision,cleanFingerprint:fingerprintRoute(record.document)}};
}
function parseSync(value:unknown):RouteLocalSync {
  if(!object(value))fail();const cloudId=value.cloudId,revision=value.revision;
  if(!(cloudId===null||routeUUID(cloudId))||!(revision===null||Number.isSafeInteger(revision)&&Number(revision)>=0&&Number(revision)<=2147483647)||(cloudId===null)!==(revision===null)||typeof value.deleted!=='boolean'||typeof value.serverDeleted!=='boolean'||value.serverDeleted&&!value.deleted)fail();
  const cleanFingerprint=fingerprint(value.cleanFingerprint);
  let pending:RoutePending|null=null;
  if(value.pending!==null){
    if(!object(value.pending)||!['save','delete'].includes(value.pending.action as string))fail();
    const action=value.pending.action as 'save'|'delete';
    const draft=action==='save'?freezeRouteDraft(value.pending.draft):freezeRouteDeleteDraft(value.pending.draft);
    if(draft.routeId!==cloudId||draft.expectedRevision!==revision||value.serverDeleted||action==='delete'&&!value.deleted)fail();
    pending=action==='save'?{action,draft:draft as RouteSyncDraft}:{action,draft:draft as RouteDeleteDraft};
  }
  let blocked:RouteLocalSync['blocked']=null;
  if(value.blocked!==null&&value.blocked!==undefined){
    if(!object(value.blocked)||!['ROUTE_SOURCE_EXPIRED','ROUTE_SOURCE_UNAVAILABLE','ROUTE_SOURCE_MISMATCH'].includes(value.blocked.error as string))fail();
    const key=fingerprint(value.blocked.fingerprint);if(key===null||pending)fail();blocked={fingerprint:key,error:value.blocked.error as RouteSourceError};
  }
  if(cloudId===null&&(cleanFingerprint!==null||pending!==null||value.serverDeleted))fail();
  return {cloudId:cloudId as string|null,revision:revision as number|null,cleanFingerprint,pending,deleted:value.deleted,serverDeleted:value.serverDeleted,blocked};
}
function legacyRecord(value:unknown,stripCloud:boolean):RouteLocalRecord {
  if(!object(value)||!text(value.id,100)||!text(value.name,80)||!Array.isArray(value.stops)||value.stops.length>12)fail();
  const stops=value.stops.map(stop=>{if(!object(stop)||!text(stop.name,80)||typeof stop.latitude!=='number'||!Number.isFinite(stop.latitude)||Math.abs(stop.latitude)>90||typeof stop.longitude!=='number'||!Number.isFinite(stop.longitude)||Math.abs(stop.longitude)>180)fail();return {lat:stop.latitude as number,lng:stop.longitude as number,label:stop.name as string};});
  const record=routeRecord({localId:value.id,document:{schema_version:1,title:value.name,category:['scooter','motorcycle','car','bicycle'].includes(value.category as string)?value.category as RouteDocumentV1['category']:'scooter',visibility:'private',stops,source:{kind:'draft'}}});
  if(!stripCloud&&value.cloudId!==undefined){if(!routeUUID(value.cloudId)||!Number.isSafeInteger(value.cloudRevision)||Number(value.cloudRevision)<1||Number(value.cloudRevision)>2147483647)fail();record.sync={...record.sync,cloudId:value.cloudId,revision:value.cloudRevision as number};}
  return record;
}
/** Existing canonical data is authoritative, including an empty array. Bad retries fail hydration. */
export function parseRouteRecords(value:unknown,legacyRoutes?:unknown,stripCloud=false):RouteLocalRecord[] {
  try{
    if(value===undefined){
      if(legacyRoutes===undefined)return [];if(!Array.isArray(legacyRoutes)||legacyRoutes.length>ROUTE_MAX_RECORDS)fail();
      return unique(legacyRoutes.map(route=>legacyRecord(route,stripCloud)));
    }
    if(!Array.isArray(value)||value.length>ROUTE_MAX_RECORDS)fail();
    const result=value.map(row=>{
      if(!object(row)||!text(row.localId,100))fail();
      const record=routeRecord({localId:row.localId,document:row.document as RouteDocumentV1,geometry:row.geometry as RouteLocalGeometry|null});
      record.sync=parseSync(row.sync);
      if(stripCloud){record.sync={...blankRouteSync(),deleted:record.sync.deleted};record.document={...record.document,visibility:'private',...(record.document.source.kind==='road'?{source:{kind:'draft' as const}}:{})};}
      return record;
    });return unique(result);
  }catch{return fail();}
}
function unique(records:RouteLocalRecord[]):RouteLocalRecord[]{
  if(records.filter(record=>!record.sync.deleted).length>ROUTE_MAX_LIVE)fail();
  const ids=new Set<string>(),cloud=new Set<string>(),operations=new Set<string>();for(const record of records){if(ids.has(record.localId)||record.sync.cloudId&&cloud.has(record.sync.cloudId)||record.sync.pending&&operations.has(record.sync.pending.draft.operationId))fail();ids.add(record.localId);if(record.sync.cloudId)cloud.add(record.sync.cloudId);if(record.sync.pending)operations.add(record.sync.pending.draft.operationId);}return records;
}
/** Compatibility contains owned private pins only; no geometry or course approval is invented. */
export function compatibleRoutes(records:readonly RouteLocalRecord[]):SavedRoute[] {
  return records.filter(record=>!record.sync.deleted).map(record=>({id:record.localId,name:record.document.title,stops:record.document.stops.map((stop,index)=>({id:`${record.localId}:${index}`,name:stop.label,latitude:stop.lat,longitude:stop.lng})),closedCourse:false,category:record.document.category,...(record.sync.cloudId&&record.sync.revision&&record.sync.revision>0?{cloudId:record.sync.cloudId,cloudRevision:record.sync.revision}:{})}));
}
export const copyRouteRecord=(record:RouteLocalRecord):RouteLocalRecord=>detach(record);
