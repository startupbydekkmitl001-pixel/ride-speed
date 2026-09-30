import type { GarageVehicle } from '../../lib/domain';
import type { GarageSnapshot,GarageSyncAck,GarageSyncDraft } from './syncTypes';
import { validateGarageDocument,freezeGarageDraft } from './syncModel';
import { acknowledgeGarage,garageDocument,fingerprintGarage,ownedGarage,reconcileGarage,type GarageLocalSync } from './localModel';

export type GarageOwned={vehicles:GarageVehicle[];selectedVehicleId:string|null;garageSync:GarageLocalSync};
export type GarageStatus='local'|'loading'|'synced'|'pending'|'conflict'|'error';
type Snapshot={status:GarageStatus;error:string|null;conflict:GarageSnapshot|null};
export type GaragePort={guard:()=>void;hasSession:()=>boolean;read:()=>GarageOwned;flush:()=>Promise<void>;write:(patch:Partial<GarageOwned>)=>Promise<void>;operation:()=>string;fetch:()=>Promise<GarageSnapshot>;send:(draft:GarageSyncDraft)=>Promise<GarageSyncAck>};
/** Network waits never hold the mutation queue; every ACK derives from fresh owner data. */
export class GarageCoordinator {
 private state:Snapshot={status:'local',error:null,conflict:null};private listeners=new Set<()=>void>();private writes=Promise.resolve();private running:Promise<void>|null=null;private closed=false;
 constructor(private port:GaragePort){}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private current(){if(this.closed)throw Error('ACCOUNT_CHANGED');this.port.guard();}
 private publish(patch:Partial<Snapshot>){if(this.closed)return;this.state={...this.state,...patch};this.listeners.forEach(fn=>fn());}
 private commit(change:(current:GarageOwned)=>Partial<GarageOwned>):Promise<void>{
  const work=this.writes.catch(()=>{}).then(async()=>{this.current();await this.port.write(change(this.port.read()));this.current();});this.writes=work.catch(()=>{});return work;
 }
 private fail(error:unknown){try{this.current();}catch{return;}this.publish({status:'error',error:error instanceof Error?error.message:'GARAGE_SYNC_UNAVAILABLE'});}
 close(){this.closed=true;this.listeners.clear();}
 async save(vehicle:GarageVehicle,options?:{existingOnly?:boolean}):Promise<boolean>{
  try{await this.commit(old=>{const existing=old.vehicles.some(v=>v.id===vehicle.id);if(options?.existingOnly&&!existing)throw Error('GARAGE_VEHICLE_CHANGED');if(!existing&&old.vehicles.length>=200)throw Error('GARAGE_TOO_LARGE');
   const vehicles=existing?old.vehicles.map(v=>v.id===vehicle.id?{...vehicle}:v):[...old.vehicles,{...vehicle}];const selectedVehicleId=existing?old.selectedVehicleId:vehicle.id;validateGarageDocument(garageDocument(vehicles,selectedVehicleId));return {vehicles,selectedVehicleId};});
   if(this.state.status!=='conflict')this.publish({status:this.port.hasSession()?'pending':'local',error:null});return true;
  }catch(error){this.fail(error);return false;}
 }
 async remove(id:string):Promise<boolean>{try{await this.commit(old=>{const vehicles=old.vehicles.filter(v=>v.id!==id);return {vehicles,selectedVehicleId:old.selectedVehicleId===id?vehicles[0]?.id??null:old.selectedVehicleId};});if(this.state.status!=='conflict')this.publish({status:this.port.hasSession()?'pending':'local',error:null});return true;}catch(error){this.fail(error);return false;}}
 async select(id:string|null):Promise<boolean>{try{await this.commit(old=>{if(id!==null&&!old.vehicles.some(v=>v.id===id))throw Error('GARAGE_INVALID');return {selectedVehicleId:id};});if(this.state.status!=='conflict')this.publish({status:this.port.hasSession()?'pending':'local',error:null});return true;}catch(error){this.fail(error);return false;}}
 async attachPhoto(id:string,expectedPath:string|undefined,path:string,targetCurrent:()=>void=()=>{}):Promise<boolean>{
  try{await this.commit(old=>{targetCurrent();const target=old.vehicles.find(v=>v.id===id);if(!target||target.photoPath!==expectedPath)throw Error('GARAGE_PHOTO_TARGET_CHANGED');const vehicles=old.vehicles.map(v=>v.id===id?{...v,photoPath:path}:v);validateGarageDocument(garageDocument(vehicles,old.selectedVehicleId));return {vehicles};});if(this.state.status!=='conflict')this.publish({status:this.port.hasSession()?'pending':'local',error:null});return true;}catch(error){this.fail(error);return false;}
 }
 sync():Promise<void>{if(this.running)return this.running;const work=this.runSync();this.running=work;void work.finally(()=>{if(this.running===work)this.running=null;});return work;}
 private async runSync(){
  try{this.current();if(!this.port.hasSession()){this.publish({status:'local',error:null});return;}if(this.state.conflict||this.state.error==='GARAGE_PHOTO_EXPIRED')return;
   this.publish({status:'loading',error:null});await this.writes;await this.port.flush();this.current();
   // Bounded drain. Later edits trigger another explicit/foreground/online pass.
   for(let count=0;count<3;count++){
    this.current();let local=this.port.read(),pending=local.garageSync.pending;
    if(pending){
     let ack:GarageSyncAck;
     try{ack=await this.port.send(pending);}catch(error){
      // This precise authenticated response proves rejection. A timeout never retires an operation.
      if(error instanceof Error&&error.message==='GARAGE_PHOTO_EXPIRED'){
       await this.commit(old=>old.garageSync.pending?.operationId===pending!.operationId?{garageSync:{...old.garageSync,pending:null}}:{});
       this.publish({status:'error',error:'GARAGE_PHOTO_EXPIRED'});return;
      }throw error;
     }this.current();
     await this.commit(old=>({garageSync:acknowledgeGarage(old.garageSync,ack)}));
    }
    const remote=await this.port.fetch();this.current();local=this.port.read();
    const result=reconcileGarage(garageDocument(local.vehicles,local.selectedVehicleId),local.garageSync,remote);
    if(result.kind==='resume')continue;
    if(result.kind==='conflict'){this.publish({status:'conflict',error:'GARAGE_REVISION_CONFLICT',conflict:remote});return;}
    if(result.kind==='adopt'){
     await this.commit(old=>{const fresh=reconcileGarage(garageDocument(old.vehicles,old.selectedVehicleId),old.garageSync,remote);if(fresh.kind!=='adopt')return {};
      return {...ownedGarage(remote.document),garageSync:{revision:remote.revision,cleanFingerprint:fingerprintGarage(remote.document),pending:null}};});
     const latest=this.port.read();if(fingerprintGarage(garageDocument(latest.vehicles,latest.selectedVehicleId))===latest.garageSync.cleanFingerprint){this.publish({status:'synced',error:null,conflict:null});return;}continue;
    }
    await this.commit(old=>{
     if(old.garageSync.pending)return {};
     const fresh=reconcileGarage(garageDocument(old.vehicles,old.selectedVehicleId),old.garageSync,remote);
     if(fresh.kind!=='publish')return {};
     const draft=freezeGarageDraft({operationId:this.port.operation(),expectedRevision:fresh.revision,document:garageDocument(old.vehicles,old.selectedVehicleId)});
     return {garageSync:{...old.garageSync,revision:fresh.revision,pending:draft}};
    });
   }
   this.publish({status:'pending',error:null});
  }catch(error){
   if(error instanceof Error&&error.message==='GARAGE_REVISION_CONFLICT'){
    try{this.current();const remote=await this.port.fetch();this.current();this.publish({status:'conflict',error:'GARAGE_REVISION_CONFLICT',conflict:remote});return;}catch(next){this.fail(next);return;}
   }this.fail(error);
  }
 }
 async resolveConflict(choice:'cloud'|'local'){
  if(!this.state.conflict)return;
  try{this.current();const remote=await this.port.fetch();this.current();
   await this.commit(()=>choice==='cloud'?{...ownedGarage(remote.document),garageSync:{revision:remote.revision,cleanFingerprint:fingerprintGarage(remote.document),pending:null}}:{garageSync:{revision:remote.revision,cleanFingerprint:fingerprintGarage(remote.document),pending:null}});
   this.publish({conflict:null,error:null,status:choice==='cloud'?'synced':'pending'});await this.sync();
  }catch(error){this.fail(error);}
 }
}
