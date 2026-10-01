import type { GarageVehicle } from '../../lib/domain';
import type { RideEvidenceSample } from '../../../modules/ride-location/src/sessionSupport';
import type { RideSummaryV1 } from './syncTypes';

export type Coordinate = { latitude:number;longitude:number };
export type Capture = { id:string;segmentId:string;provider:'ios_core_location'|'expo_location';count:number;truncated:boolean;startedAtMs:number;endedAtMs:number|null;startedMonotonicMs?:number|null;endedMonotonicMs?:number|null };
export type Fragment = { segmentId:string;captureId:string;partIndex:number;points:Coordinate[] };
export type JournalRide = {
 id:string;ownerId:string;startedAtMs:number;endedAtMs:number|null;status:'recording'|'paused'|'complete'|'interrupted';
 activeDurationMs:number;clockAnomaly:boolean;vehicle:GarageVehicle|null;captures:Capture[];
 rawCount:number;acceptedCount:number;rejectedCount:number;distanceMeters:number;maxMps:number|null;
 fragments:Fragment[];revision:number;sync:'local'|'pending'|'synced';operationId:string|null;
 summary?:RideSummaryV1;syncError?:string;
};
export type JournalReceipt = { seq:number;captureId:string;segmentId:string;sample:RideEvidenceSample;accepted:boolean;receivedAtMs:number;receivedMonotonicMs?:number|null;partIndex?:number };
type PrivateProgress = { monotonicStart:number;previous:RideEvidenceSample|null;breakPath:boolean;lastTimestamp:number|null;waiting:boolean };
const progress=new WeakMap<JournalRide,PrivateProgress>();
const originalMonotonic=(value:number|undefined)=>value!==undefined&&Number.isFinite(value)&&value>=0?value:null;
export const createRide=(id:string,ownerId:string,startedAtMs:number,vehicle:GarageVehicle|null):JournalRide=>({id,ownerId,startedAtMs,endedAtMs:null,status:'paused',activeDurationMs:0,clockAnomaly:false,vehicle:vehicle?{...vehicle}:null,captures:[],rawCount:0,acceptedCount:0,rejectedCount:0,distanceMeters:0,maxMps:null,fragments:[],revision:0,sync:'local',operationId:null});
export function beginCapture(ride:JournalRide,id:string,segmentId:string,monotonicMs:number,provider:Capture['provider'],waiting=false) {
 if(ride.status==='complete'||ride.status==='recording')throw Error('RIDE_STATE');
 ride.status='recording';ride.captures.push({id,segmentId,provider,count:0,truncated:false,startedAtMs:Date.now(),endedAtMs:null,startedMonotonicMs:waiting?null:originalMonotonic(monotonicMs),endedMonotonicMs:null});
 progress.set(ride,{monotonicStart:monotonicMs,previous:null,breakPath:true,lastTimestamp:null,waiting});
}
export function activateCapture(ride:JournalRide,monotonicMs:number,wallMs:number){const p=progress.get(ride),c=ride.captures.at(-1);if(!p||!c)return;p.waiting=false;p.monotonicStart=monotonicMs;c.startedAtMs=wallMs;c.startedMonotonicMs=originalMonotonic(monotonicMs);if(ride.captures.length===1&&ride.rawCount===0)ride.startedAtMs=wallMs;}
export function haversine(a:Coordinate,b:Coordinate):number {
 const rad=Math.PI/180,dlat=(b.latitude-a.latitude)*rad,dlon=(b.longitude-a.longitude)*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2;
 return 6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
export function acceptSample(ride:JournalRide,sample:RideEvidenceSample,receivedAtMs:number,receivedMonotonicMs?:number):JournalReceipt {
 const p=progress.get(ride),c=ride.captures.at(-1);if(!p||!c||ride.status!=='recording')throw Error('RIDE_STATE');
 const age=receivedAtMs-sample.timestampMs;
 let accepted=Number.isFinite(sample.latitude)&&Math.abs(sample.latitude)<=90&&Number.isFinite(sample.longitude)&&Math.abs(sample.longitude)<=180
  &&Number.isFinite(sample.timestampMs)&&age>=-500&&age<=3000&&(p.lastTimestamp===null||sample.timestampMs>p.lastTimestamp)
  &&sample.horizontalAccuracyM!==null&&Number.isFinite(sample.horizontalAccuracyM)&&sample.horizontalAccuracyM>=0&&sample.horizontalAccuracyM<=20
  &&sample.mocked!==true&&sample.isSimulatedBySoftware!==true;
 if(Number.isFinite(sample.timestampMs)&& (p.lastTimestamp===null||sample.timestampMs>p.lastTimestamp))p.lastTimestamp=sample.timestampMs;
 let distance=0;
 if(accepted&&p.previous) {
  const gap=sample.timestampMs-p.previous.timestampMs;distance=haversine(p.previous,sample);
  if(gap>3000){p.breakPath=true;distance=0;}
  else if(distance>Math.max(40,(gap/1000)*100)){accepted=false;distance=0;}
 }
 const receipt:JournalReceipt={seq:ride.rawCount,captureId:c.id,segmentId:c.segmentId,sample:{...sample},accepted,receivedAtMs,receivedMonotonicMs:originalMonotonic(receivedMonotonicMs)};
 ride.rawCount++;c.count++;if(c.count>8000)c.truncated=true;
 if(!accepted){ride.rejectedCount++;p.previous=null;p.breakPath=true;return receipt;}
 ride.acceptedCount++;
 if(p.breakPath||!ride.fragments.length){ride.fragments.push({segmentId:c.segmentId,captureId:c.id,partIndex:ride.fragments.filter(f=>f.captureId===c.id).length,points:[]});p.breakPath=false;}
 const fragment=ride.fragments.at(-1)!;fragment.points.push({latitude:sample.latitude,longitude:sample.longitude});receipt.partIndex=fragment.partIndex;
 // Sub-three-metre jitter does not accumulate distance while stopped.
 if(distance>=3)ride.distanceMeters+=distance;p.previous=sample;return receipt;
}
export function currentDuration(ride:JournalRide,monotonicMs:number):number {
 const p=progress.get(ride);return ride.activeDurationMs+(ride.status==='recording'&&p&&!p.waiting?Math.max(0,monotonicMs-p.monotonicStart):0);
}
export function endCapture(ride:JournalRide,monotonicMs:number,wallMs:number) {
 if(ride.status!=='recording')return;
 ride.activeDurationMs=currentDuration(ride,monotonicMs);ride.status='paused';const c=ride.captures.at(-1)!;c.endedAtMs=wallMs;c.endedMonotonicMs=originalMonotonic(monotonicMs);
 if(wallMs<ride.startedAtMs||!Number.isFinite(monotonicMs))ride.clockAnomaly=true;progress.delete(ride);
}
export function finishRide(ride:JournalRide,wallMs:number) {
 if(ride.status==='recording')throw Error('RIDE_STATE');
 ride.clockAnomaly ||=wallMs<ride.startedAtMs;ride.endedAtMs=wallMs;ride.status='complete';ride.sync=ride.ownerId==='guest'?'local':'pending';
}
/** Small active checkpoints avoid rewriting a growing path for every GPS fix. */
export function persistedRide(ride:JournalRide):JournalRide {return {...ride,fragments:ride.status==='recording'?[]:ride.fragments};}
export function restoreFragments(ride:JournalRide,receipts:JournalReceipt[]) {
 const parts=new Map<string,Fragment>();
 for(const r of receipts){if(!r.accepted||r.partIndex===undefined)continue;const key=r.captureId+':'+r.partIndex;let f=parts.get(key);if(!f){f={captureId:r.captureId,segmentId:r.segmentId,partIndex:r.partIndex,points:[]};parts.set(key,f);}f.points.push({latitude:r.sample.latitude,longitude:r.sample.longitude});}
 ride.fragments=[...parts.values()];
}
/** Polyline5 encodes only accepted geometry; raw receipts remain local. */
export function encodePolyline(points:readonly Coordinate[]):string {
 let lastLat=0,lastLon=0,result='';
 const encode=(delta:number)=>{let v=delta<0?~(delta<<1):delta<<1;let out='';while(v>=0x20){out+=String.fromCharCode((0x20|(v&0x1f))+63);v>>>=5;}return out+String.fromCharCode(v+63);};
 for(const p of points){const lat=Math.round(p.latitude*1e5),lon=Math.round(p.longitude*1e5);result+=encode(lat-lastLat)+encode(lon-lastLon);lastLat=lat;lastLon=lon;}
 return result;
}
