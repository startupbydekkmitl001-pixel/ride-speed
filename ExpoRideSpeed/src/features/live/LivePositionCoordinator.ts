import type {LiveCaptureBinding,LiveCaptureEvent,LiveCaptureFix} from './captureTypes';
import {authorizedPeerFrame,estimatedLiveServerNow,freshConvoyPeers,nextLiveExpiry} from './clockModel';
import {canonicalLive,freezeLiveSample,liveErrors,validateConvoyEvent,validateConvoyPositionMutation,validateConvoySnapshot,validateLivePublishMutation} from './model';
import type {AuthorizedPeerFrame,ConvoySnapshot,LiveClientErrorCode,LiveClock,LiveErrorCode,LivePositionPort,LiveSenderBinding,PeerPosition} from './types';
export type {LivePositionPort,LiveSenderBinding,AuthorizedPeerFrame,LiveClock} from './types';
type Receive={room:ConvoySnapshot;clock:LiveClock;scope:LiveSenderBinding['scope'];key:string};
const safe=new Set<string>([...liveErrors,'LIVE_INVALID_RESPONSE','LIVE_CLOCK_UNCERTAIN','ACCOUNT_CHANGED']);
const code=(e:unknown):LiveErrorCode|LiveClientErrorCode=>e instanceof Error&&safe.has(e.message)?e.message as LiveErrorCode|LiveClientErrorCode:'LIVE_UNAVAILABLE';
const sameCapture=(a:LiveCaptureBinding,b:LiveCaptureBinding)=>a.scope===b.scope&&a.generation===b.generation&&a.captureId===b.captureId&&a.rideId===b.rideId&&a.segmentId===b.segmentId&&a.platform===b.platform;
const revokeErrors=new Set<LiveErrorCode>(['LIVE_AUTH_REQUIRED','LIVE_DISABLED','ACCOUNT_DELETION_PENDING','CONVOY_UNAVAILABLE','CONVOY_CHANGED','LOCATION_CONSENT_REQUIRED','LOCATION_CONSENT_CHANGED','POSITION_SEQUENCE']);
/** One volatile newest-fix slot and authoritative latest-point reads. No GPS queue or watcher. */
export class LivePositionCoordinator{
 private sender:LiveSenderBinding|null=null;private candidate:LiveCaptureFix|null=null;private sendEpoch=0;private readEpoch=0;private closed=false;
 private sending:Promise<void>|null=null;private reading:Promise<void>|null=null;private refreshing:Promise<void>|null=null;
 private lastSend=-Infinity;private lastRead=-Infinity;private sendBackoff=0;private readBackoff=0;
 private lease:string|null=null;private sequence=0;private consumed=-1;private receive:Receive|null=null;private frame:AuthorizedPeerFrame|null=null;
 private peerHeads=new Map<string,PeerPosition>();private peerDeadlines=new Map<string,number>();
 constructor(private port:LivePositionPort){}
 getFrame=()=>this.frame;
 getNextExpiry=()=>this.frame?nextLiveExpiry(this.frame,this.port.monotonicNow()):null;
 private error(e:unknown){if(this.closed)return;try{this.port.onError(code(e));}catch{/* Rendering cannot leak a rejected timer promise. */}}
 private replace(frame:AuthorizedPeerFrame|null){if(this.closed)return;if(this.frame===frame)return;this.frame=frame;try{this.port.onPeers(frame);}catch{/* A renderer cannot authorize or retain a transport candidate. */}}
 private clearSender(){this.sendEpoch++;this.sender=null;this.candidate=null;this.consumed=-1;}
 private clearReceiver(){this.readEpoch++;this.receive=null;this.peerHeads.clear();this.peerDeadlines.clear();this.replace(null);}
 suspend(){this.clearSender();this.clearReceiver();}
 close(){this.suspend();this.closed=true;}
 private roomCurrent(room:ConvoySnapshot,clock:LiveClock|null|undefined,mono:number){
  if(!clock||clock.serverTimeMs!==Date.parse(room.server_now)){this.error(Error('LIVE_CLOCK_UNCERTAIN'));return false;}
  const now=estimatedLiveServerNow(clock,mono);if(now===null){this.error(Error('LIVE_CLOCK_UNCERTAIN'));return false;}
  return room.state==='active'&&room.self_state==='accepted'&&!!room.topic&&now<Date.parse(room.expires_at)&&now<Date.parse(room.host_lease_until);
 }
 private canSend(binding:LiveSenderBinding,mono:number){
  const p=this.port.policy(),r=binding.room,c=r.self_consent,i=binding.intent;
  if(this.closed||p.scope!==binding.scope||!p.signedIn||!p.hydrated||!p.foreground||!p.online||p.ghost||p.closed||!this.port.current(binding))return false;
  if(r.owner_id!==binding.scope.userId||binding.capture.scope!==binding.scope||!this.roomCurrent(r,binding.roomClock,mono))return false;
  const now=estimatedLiveServerNow(binding.roomClock,mono)!;
  return Number.isInteger(i.armedGeneration)&&i.armedGeneration>=0&&i.captureId===binding.capture.captureId&&i.captureId===c.capture_id&&i.leaseId===c.lease_id&&i.consentRevision===c.revision&&i.memberGeneration===r.self_generation&&i.topicGeneration===r.topic_generation&&c.precision==='precise'&&c.expires_at!==null&&now<Date.parse(c.expires_at);
 }
 bind(binding:LiveSenderBinding|null){
  if(this.closed)return;
  try{
   if(!binding){this.clearSender();return;}
   validateConvoySnapshot(binding.room,binding.scope.userId!,binding.room.id);
   if(!this.canSend(binding,this.port.monotonicNow())){this.clearSender();return;}
   const same=this.sender&&sameCapture(this.sender.capture,binding.capture)&&this.sender.intent.armedGeneration===binding.intent.armedGeneration&&this.sender.intent.leaseId===binding.intent.leaseId&&this.sender.intent.consentRevision===binding.intent.consentRevision&&this.sender.room.topic_generation===binding.room.topic_generation;
   if(!same){this.sendEpoch++;this.candidate=null;this.consumed=-1;}
   if(this.lease!==binding.intent.leaseId){this.lease=binding.intent.leaseId;this.sequence=binding.room.self_consent.last_sequence;this.lastSend=-Infinity;}else this.sequence=Math.max(this.sequence,binding.room.self_consent.last_sequence);
   this.sender=binding;
  }catch(e){this.clearSender();this.error(e);}
 }
 private freshFix(fix:LiveCaptureFix,mono:number){
  const s=fix.sample,wall=this.port.wallNow();
  if(!Number.isInteger(fix.journalSequence)||fix.journalSequence<0||!Number.isFinite(fix.receivedMonotonicMs)||!Number.isFinite(fix.receivedWallMs)||mono<fix.receivedMonotonicMs||mono-fix.receivedMonotonicMs>3000||!Number.isFinite(wall)||!Number.isFinite(s.timestampMs)||wall-s.timestampMs>3000||s.timestampMs-wall>500)throw Error('LOCATION_STALE');
  if(!Number.isFinite(s.latitude)||Math.abs(s.latitude)>90||!Number.isFinite(s.longitude)||Math.abs(s.longitude)>180||s.horizontalAccuracyM===null||!Number.isFinite(s.horizontalAccuracyM)||s.horizontalAccuracyM<=0||s.horizontalAccuracyM>20||s.mocked!==null&&s.mocked!==false||s.isSimulatedBySoftware!==null&&s.isSimulatedBySoftware!==false)throw Error('LOCATION_QUALITY');
 }
 accept(event:LiveCaptureEvent){
  if(this.closed)return;
  try{
   if(event.kind==='invalidated'){this.clearSender();return;}
   const binding=this.sender;if(!binding)return;
   if(event.kind==='active'){if(!sameCapture(event.binding,binding.capture))this.clearSender();return;}
   const capture=event.kind==='sample'?event.fix.binding:event.binding;if(!sameCapture(capture,binding.capture))return;
   if(event.kind==='unavailable'){this.candidate=null;this.error(Error('LOCATION_QUALITY'));return;}
   const mono=this.port.monotonicNow();if(!this.canSend(binding,mono)){this.clearSender();return;}
   this.freshFix(event.fix,mono);if(event.fix.journalSequence<=this.consumed||this.candidate&&event.fix.journalSequence<=this.candidate.journalSequence)return;
   this.candidate=Object.freeze({...event.fix,sample:Object.freeze({...event.fix.sample})});
  }catch(e){this.candidate=null;this.error(e);}
 }
 private receiverEligible(r:Receive,mono:number){const p=this.port.policy();return !this.closed&&p.scope===r.scope&&p.signedIn&&p.hydrated&&p.foreground&&p.online&&!p.closed&&p.receiveEnabled&&p.mapFocused&&r.room.owner_id===p.scope.userId&&this.roomCurrent(r.room,r.clock,mono);}
 setReceive(room:ConvoySnapshot|null,enabled:boolean,focused:boolean,clock:LiveClock|null){
  if(this.closed)return;
  try{
   if(!room||!enabled||!focused){this.clearReceiver();return;}
   const p=this.port.policy();validateConvoySnapshot(room,p.scope.userId!,room.id);if(!clock||!this.roomCurrent(room,clock,this.port.monotonicNow())){this.clearReceiver();return;}
   const key=canonicalLive({id:room.id,revision:room.revision,topic:room.topic,topic_generation:room.topic_generation,change_revision:room.change_revision,self_generation:room.self_generation,members:room.members,host_lease_until:room.host_lease_until});
   const next={room,clock,scope:p.scope,key};if(!this.receiverEligible(next,this.port.monotonicNow())){this.clearReceiver();return;}
   const old=this.receive;if(old&&old.scope===next.scope&&old.key===key&&old.clock===clock)return;
   this.readEpoch++;if(!old||old.scope!==next.scope||old.key!==key){this.peerHeads.clear();this.peerDeadlines.clear();this.replace(null);}this.receive=next;
  }catch(e){this.clearReceiver();this.error(e);}
 }
 private expire(mono:number){
  if(!this.frame)return;const fresh=freshConvoyPeers(this.frame,mono);
  if(!fresh.length){this.replace(null);return;}if(fresh.length<this.frame.peers.length){const ids=new Set(fresh.map(p=>p.user_id));this.replace(Object.freeze({...this.frame,peers:Object.freeze(this.frame.peers.filter(p=>ids.has(p.position.user_id)))}));}
 }
 private refreshRoom(id:string){
  if(this.refreshing||this.closed)return;const task=Promise.resolve().then(()=>this.port.refreshRoom(id)).then(()=>{},e=>this.error(e));this.refreshing=task;void task.then(()=>{if(this.refreshing===task)this.refreshing=null;});
 }
 invalidation(value:unknown){
  if(this.closed)return;const room=this.receive?.room??this.sender?.room;if(!room)return;const event=validateConvoyEvent(value,room);if(!event)return;
  if(event.kind==='room_changed'){this.suspend();const p=this.port.policy();if(p.signedIn&&p.hydrated&&p.foreground&&p.online&&!p.closed)this.refreshRoom(room.id);}
 }
 private async send(binding:LiveSenderBinding,fix:LiveCaptureFix,epoch:number){
  try{
   const mono=this.port.monotonicNow();if(epoch!==this.sendEpoch||this.sender!==binding||!this.canSend(binding,mono))return;this.freshFix(fix,mono);
   if(this.sequence>=2147483647){this.clearSender();throw Error('POSITION_SEQUENCE');}
   const s=fix.sample,sample=freezeLiveSample({schema_version:1,convoy_id:binding.room.id,topic_generation:binding.room.topic_generation,member_generation:binding.intent.memberGeneration,consent_revision:binding.intent.consentRevision,lease_id:binding.intent.leaseId,capture_id:binding.capture.captureId,sequence:++this.sequence,latitude:s.latitude,longitude:s.longitude,accuracy_m:s.horizontalAccuracyM,heading_deg:null,captured_at:new Date(s.timestampMs).toISOString(),source:{platform:binding.capture.platform,mocked:s.mocked,simulated:s.isSimulatedBySoftware}});
   this.consumed=fix.journalSequence;this.lastSend=mono;
   const result=await this.port.publish(sample);if(this.closed||epoch!==this.sendEpoch||this.sender!==binding||!this.canSend(binding,this.port.monotonicNow()))return;
   const checked=validateLivePublishMutation(result,binding.scope.userId!,sample);
   if('error' in checked){if(revokeErrors.has(checked.error.code)){this.error(Error(checked.error.code));this.clearSender();this.refreshRoom(binding.room.id);return;}if(checked.error.code==='LIVE_RATE_LIMITED')this.sendBackoff=this.port.monotonicNow()+5000;throw Error(checked.error.code);}
  }catch(e){if(!this.closed&&epoch===this.sendEpoch)this.error(e);else if(code(e)==='POSITION_SEQUENCE')this.error(e);}
 }
 private async read(r:Receive,epoch:number,start:number){
  try{
   if(epoch!==this.readEpoch||this.receive!==r||!this.receiverEligible(r,start))return;this.lastRead=start;
   const raw=await this.port.read(r.room),mono=this.port.monotonicNow();if(this.closed||epoch!==this.readEpoch||this.receive!==r||!this.receiverEligible(r,mono))return;
   const result=validateConvoyPositionMutation(raw,r.scope.userId!,r.room);if('error' in result){if(revokeErrors.has(result.error.code)){this.clearReceiver();this.refreshRoom(r.room.id);}throw Error(result.error.code);}
   for(const p of result.items){const old=this.peerHeads.get(p.user_id);if(old&&p.member_generation===old.member_generation&&(p.consent_revision<old.consent_revision||p.consent_revision===old.consent_revision&&(p.sequence<old.sequence||p.sequence===old.sequence&&canonicalLive(p)!==canonicalLive(old))))throw Error('POSITION_SEQUENCE');}
   const incoming=authorizedPeerFrame(r.scope,r.room,result,start,mono),frame=Object.freeze({...incoming,peers:Object.freeze(incoming.peers.map(peer=>{const p=peer.position,key=`${p.user_id}:${p.member_generation}:${p.consent_revision}:${p.sequence}`,previous=this.peerDeadlines.get(key),expiresMonotonicMs=Math.min(peer.expiresMonotonicMs,previous??Infinity);this.peerDeadlines.set(key,expiresMonotonicMs);return Object.freeze({...peer,expiresMonotonicMs});}))});for(const p of result.items){const old=this.peerHeads.get(p.user_id);if(old&&p.sequence!==old.sequence){this.peerDeadlines.delete(`${old.user_id}:${old.member_generation}:${old.consent_revision}:${old.sequence}`);}this.peerHeads.set(p.user_id,p);}this.replace(freshConvoyPeers(frame,mono).length?frame:null);
  }catch(e){if(!this.closed&&epoch===this.readEpoch){this.replace(null);this.readBackoff=this.port.monotonicNow()+5000;this.error(e);}else if(!this.closed&&revokeErrors.has(code(e) as LiveErrorCode))this.error(e);}
 }
 tick():Promise<void>{
  if(this.closed)return Promise.resolve();
  try{
   const mono=this.port.monotonicNow(),p=this.port.policy();if(!Number.isFinite(mono)||mono<0){this.suspend();this.error(Error('LIVE_CLOCK_UNCERTAIN'));return Promise.resolve();}
   if(!p.signedIn||!p.hydrated||!p.foreground||p.closed){this.suspend();return Promise.resolve();}
   this.expire(mono);const tasks:Promise<void>[]=[];
   const sender=this.sender;if(sender&&!this.canSend(sender,mono)){this.clearSender();}
   if(!p.online){this.candidate=null;this.replace(null);return Promise.resolve();}
   if(this.sender&&this.candidate&&!this.sending&&mono-this.lastSend>=1000&&mono>=this.sendBackoff){const binding=this.sender,fix=this.candidate,epoch=this.sendEpoch;this.candidate=null;const task=Promise.resolve().then(()=>this.send(binding,fix,epoch));this.sending=task;void task.then(()=>{if(this.sending===task)this.sending=null;});tasks.push(task);}
   const r=this.receive;if(r&&!this.receiverEligible(r,mono))this.clearReceiver();
   if(this.receive&&!this.reading&&mono-this.lastRead>=1000&&mono>=this.readBackoff){const room=this.receive,epoch=this.readEpoch,task=Promise.resolve().then(()=>this.read(room,epoch,mono));this.reading=task;void task.then(()=>{if(this.reading===task)this.reading=null;});tasks.push(task);}
   return Promise.all(tasks).then(()=>{});
  }catch(e){this.suspend();this.error(e);return Promise.resolve();}
 }
}
