import type {JournalReceipt} from '../rides/journalModel';
import type {CaptureInvalidation,LiveCaptureBinding,LiveCaptureEvent,LiveCapturePort} from './captureTypes';

/** Passive, memory-only tap. It never starts acquisition or replays a stored fix. */
export class LiveCaptureBus implements LiveCapturePort{
 private binding:LiveCaptureBinding|null=null;
 private generation=0;
 private closed=false;
 private listeners=new Set<(event:LiveCaptureEvent)=>void>();
 private readonly current:(binding:LiveCaptureBinding)=>boolean;
 constructor(current:(binding:LiveCaptureBinding)=>boolean){this.current=current;}
 getBinding():LiveCaptureBinding|null{return !this.closed&&this.binding&&this.current(this.binding)?this.binding:null;}
 subscribe(listener:(event:LiveCaptureEvent)=>void){
  if(this.closed)return()=>{};
  this.listeners.add(listener);const binding=this.getBinding();
  if(binding)this.notifyOne(listener,{kind:'active',binding});
  return()=>{this.listeners.delete(listener);};
 }
 bind(value:Omit<LiveCaptureBinding,'generation'>){
  if(this.closed)return;
  const old=this.getBinding();
  if(old&&old.scope===value.scope&&old.rideId===value.rideId&&old.captureId===value.captureId&&old.segmentId===value.segmentId)return;
  const binding=Object.freeze({...value,generation:++this.generation});
  if(!this.current(binding)){this.binding=null;return;}
  this.binding=binding;this.notify({kind:'active',binding});
 }
 accept(receipt:JournalReceipt,monotonicMs:number,wallMs:number){
  const binding=this.getBinding();
  if(!binding||binding.captureId!==receipt.captureId||binding.segmentId!==receipt.segmentId)return;
  const s=receipt.sample,age=wallMs-s.timestampMs;
  const good=receipt.accepted&&Number.isInteger(receipt.seq)&&receipt.seq>=0&&Number.isFinite(monotonicMs)&&monotonicMs>=0&&Number.isFinite(wallMs)
   &&Number.isFinite(s.latitude)&&Math.abs(s.latitude)<=90&&Number.isFinite(s.longitude)&&Math.abs(s.longitude)<=180
   &&Number.isFinite(s.timestampMs)&&age>=-500&&age<=3000&&s.horizontalAccuracyM!==null
   &&Number.isFinite(s.horizontalAccuracyM)&&s.horizontalAccuracyM>0&&s.horizontalAccuracyM<=20
   &&s.mocked!==true&&s.isSimulatedBySoftware!==true;
  if(!good){this.notify({kind:'unavailable',binding,reason:'sample_quality'});return;}
  const fix=Object.freeze({binding,journalSequence:receipt.seq,receivedMonotonicMs:monotonicMs,receivedWallMs:wallMs,sample:Object.freeze({...s})});
  this.notify({kind:'sample',fix});
 }
 invalidate(reason:CaptureInvalidation){
  if(this.closed)return;
  this.binding=null;const generation=++this.generation;
  this.notify({kind:'invalidated',generation,reason});
 }
 close(){if(this.closed)return;this.invalidate('unmount');this.closed=true;this.listeners.clear();}
 private notifyOne(listener:(event:LiveCaptureEvent)=>void,event:LiveCaptureEvent){try{listener(event);}catch{/* A passive consumer cannot break private recording. */}}
 private notify(event:LiveCaptureEvent){for(const listener of [...this.listeners])this.notifyOne(listener,event);}
}
