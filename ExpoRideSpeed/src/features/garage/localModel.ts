import type { GarageVehicle } from '../../lib/domain';
import type { GarageDocumentV1, GarageSyncDraft, GarageSnapshot, GarageSyncAck } from './syncTypes';

export type GarageLocalSync = { revision:number|null; cleanFingerprint:string|null; pending:GarageSyncDraft|null };
export const blankGarageSync=():GarageLocalSync=>({revision:null,cleanFingerprint:null,pending:null});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
const nullable=(v:string|null|undefined)=>v?.trim()||null;

/** Exact canonical equality, rather than a lossy hash, protects dirty local edits. */
export function garageDocument(vehicles:readonly GarageVehicle[],selectedVehicleId:string|null):GarageDocumentV1 {
 return {schema_version:1,vehicles:vehicles.map(v=>({id:v.id,catalogId:nullable(v.catalogId),category:v.category,brand:v.brand.trim(),model:v.model.trim(),variant:nullable(v.variant),year:nullable(v.year),engineCc:v.engineCc,motorPowerKw:v.motorPowerKw??null,powertrain:v.powertrain??null,nickname:nullable(v.nickname),color:v.color?.toUpperCase()??null,photoPath:nullable(v.photoPath)})),selectedVehicleId};
}
export const fingerprintGarage=(document:GarageDocumentV1)=>JSON.stringify(garageDocument(document.vehicles.map(v=>({...v,year:v.year??'',variant:v.variant??undefined,nickname:v.nickname??undefined,color:v.color??undefined,photoPath:v.photoPath??undefined})),document.selectedVehicleId));
export function ownedGarage(document:GarageDocumentV1):{vehicles:GarageVehicle[];selectedVehicleId:string|null} {
 return {vehicles:document.vehicles.map(v=>({id:v.id,catalogId:v.catalogId,category:v.category,brand:v.brand,model:v.model,year:v.year??'',engineCc:v.engineCc,powertrain:v.powertrain,motorPowerKw:v.motorPowerKw,...(v.variant?{variant:v.variant}:{}),...(v.nickname?{nickname:v.nickname}:{}),...(v.color?{color:v.color}:{}),...(v.photoPath?{photoPath:v.photoPath}:{})})),selectedVehicleId:document.selectedVehicleId};
}
type Reconciliation={kind:'adopt';snapshot:GarageSnapshot}|{kind:'publish';revision:number}|{kind:'conflict';snapshot:GarageSnapshot}|{kind:'resume';draft:GarageSyncDraft};
export function reconcileGarage(document:GarageDocumentV1,sync:GarageLocalSync,remote:GarageSnapshot):Reconciliation {
 if(sync.pending)return {kind:'resume',draft:sync.pending};
 const local=fingerprintGarage(document),cloud=fingerprintGarage(remote.document);
 if(local===cloud)return {kind:'adopt',snapshot:remote};
 if(sync.revision===null){
  if(!document.vehicles.length)return {kind:'adopt',snapshot:remote};
  return remote.revision===0?{kind:'publish',revision:0}:{kind:'conflict',snapshot:remote};
 }
 if(remote.revision<sync.revision)throw Error('GARAGE_INVALID_RESPONSE');
 if(local===sync.cleanFingerprint)return {kind:'adopt',snapshot:remote};
 return remote.revision===sync.revision?{kind:'publish',revision:sync.revision}:{kind:'conflict',snapshot:remote};
}
export function acknowledgeGarage(sync:GarageLocalSync,ack:Pick<GarageSyncAck,'operation_id'|'applied_revision'|'current_revision'>):GarageLocalSync {
 const pending=sync.pending;
 if(!pending||ack.operation_id!==pending.operationId||ack.applied_revision!==pending.expectedRevision+1||ack.current_revision<ack.applied_revision)throw Error('GARAGE_INVALID_RESPONSE');
 // A newer remote revision is fetched separately; it is never overwrite permission.
 return {revision:ack.applied_revision,cleanFingerprint:fingerprintGarage(pending.document),pending:null};
}
function storedDocument(value:unknown):value is GarageDocumentV1 {
 if(!value||typeof value!=='object')return false;const d=value as GarageDocumentV1;
 if(d.schema_version!==1||!Array.isArray(d.vehicles)||d.vehicles.length>200||!(d.selectedVehicleId===null||typeof d.selectedVehicleId==='string'))return false;
 const ids=new Set<string>();const text=(v:unknown,max:number,empty=false)=>typeof v==='string'&&[...v].length<=(max)&&(empty||v.trim().length>0)&&!/[\u0000-\u001f\u007f]/.test(v);
 const optional=(v:unknown,max:number)=>v===null||text(v,max);const positive=(v:unknown,max:number)=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=max;
 for(const v of d.vehicles){
  if(!v||!text(v.id,100)||ids.has(v.id)||!['scooter','bigbike','car'].includes(v.category)||!text(v.brand,80)||!text(v.model,100)||!optional(v.catalogId,100)||!optional(v.variant,100)||!optional(v.year,30)||!optional(v.nickname,80)||!positive(v.engineCc,10000)||!positive(v.motorPowerKw,2000)||!(v.powertrain===null||['petrol','diesel','hybrid','electric'].includes(v.powertrain))||!(v.color===null||/^#[a-f\d]{6}$/i.test(v.color))||!(v.photoPath===null||typeof v.photoPath==='string'&&/^[a-f\d-]{36}\/[a-f\d-]{36}\.(jpg|png|webp)$/i.test(v.photoPath))||(v.powertrain==='electric'&&v.engineCc!==null))return false;
  ids.add(v.id);
 }
 return d.selectedVehicleId===null||ids.has(d.selectedVehicleId);
}
export function parseGarageSync(value:unknown,stripCloud=false):GarageLocalSync {
 if(stripCloud||!value||typeof value!=='object')return blankGarageSync();const v=value as GarageLocalSync;
 if(!(v.revision===null||Number.isSafeInteger(v.revision)&&v.revision>=0)||!(v.cleanFingerprint===null||typeof v.cleanFingerprint==='string'&&v.cleanFingerprint.length<=524288))return blankGarageSync();
 if(v.pending!==null&&(!v.pending||!uuid(v.pending.operationId)||!Number.isSafeInteger(v.pending.expectedRevision)||v.pending.expectedRevision<0||!storedDocument(v.pending.document)))return blankGarageSync();
 return {revision:v.revision,cleanFingerprint:v.cleanFingerprint,pending:v.pending?JSON.parse(JSON.stringify(v.pending)):null};
}
