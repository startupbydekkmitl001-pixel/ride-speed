import type {AuthScope} from '../../state/AuthState';
import type {Capture,JournalReceipt,JournalRide} from '../rides/journalModel';
import type {CaptureInvalidation} from '../live/captureTypes';

export type OriginalCaptureBinding=Readonly<{
 scope:AuthScope;rideId:string;captureId:string;segmentId:string;generation:number;
 platform:'ios'|'android'|'web';provider:Capture['provider'];
 startedWallMs:number;startedMonotonicMs:number|null;
}>;
export type OriginalCaptureReceipt=Readonly<Omit<JournalReceipt,'sample'> & {sample:Readonly<JournalReceipt['sample']>}>;
export type OriginalCaptureEvent=
 |{kind:'active';binding:OriginalCaptureBinding}
 |{kind:'receipt';binding:OriginalCaptureBinding;receipt:OriginalCaptureReceipt}
 |{kind:'invalidated';generation:number;reason:CaptureInvalidation};
export type OriginalCaptureRead={ride:JournalRide;capture:Capture;receipts:JournalReceipt[]};
export interface OriginalCapturePort {
 getBinding():OriginalCaptureBinding|null;
 subscribe(listener:(event:OriginalCaptureEvent)=>void):()=>void;
}

/** Passive original receipts, including failed quality checks. This starts no GPS acquisition. */
export class OriginalCaptureBus implements OriginalCapturePort {
 private binding:OriginalCaptureBinding|null=null;
 private generation=0;
 private closed=false;
 private listeners=new Set<(event:OriginalCaptureEvent)=>void>();
 private readonly current:(binding:OriginalCaptureBinding)=>boolean;
 constructor(current:(binding:OriginalCaptureBinding)=>boolean){this.current=current;}
 getBinding(){return !this.closed&&this.binding&&this.current(this.binding)?this.binding:null;}
 subscribe(listener:(event:OriginalCaptureEvent)=>void){
  if(this.closed)return()=>{};
  this.listeners.add(listener);const binding=this.getBinding();if(binding)this.notifyOne(listener,{kind:'active',binding});
  return()=>{this.listeners.delete(listener);};
 }
 bind(value:Omit<OriginalCaptureBinding,'generation'>){
  if(this.closed)return;const old=this.getBinding();
  if(old&&old.scope===value.scope&&old.rideId===value.rideId&&old.captureId===value.captureId&&old.segmentId===value.segmentId&&old.provider===value.provider&&old.startedWallMs===value.startedWallMs&&old.startedMonotonicMs===value.startedMonotonicMs)return;
  const binding=Object.freeze({...value,generation:++this.generation});
  if(!this.current(binding)){this.binding=null;return;}this.binding=binding;this.notify({kind:'active',binding});
 }
 accept(value:JournalReceipt){
  const binding=this.getBinding();if(!binding||binding.captureId!==value.captureId||binding.segmentId!==value.segmentId)return;
  // Missing legacy monotonic references stay unknown; wall time is never used to manufacture them.
  const receipt=Object.freeze({...value,receivedMonotonicMs:value.receivedMonotonicMs??null,sample:Object.freeze({...value.sample})});
  this.notify({kind:'receipt',binding,receipt});
 }
 invalidate(reason:CaptureInvalidation){if(this.closed)return;this.binding=null;this.notify({kind:'invalidated',generation:++this.generation,reason});}
 close(){if(this.closed)return;this.invalidate('unmount');this.closed=true;this.listeners.clear();}
 private notifyOne(listener:(event:OriginalCaptureEvent)=>void,event:OriginalCaptureEvent){try{listener(event);}catch{/* A passive consumer cannot interrupt private recording. */}}
 private notify(event:OriginalCaptureEvent){for(const listener of [...this.listeners])this.notifyOne(listener,event);}
}
