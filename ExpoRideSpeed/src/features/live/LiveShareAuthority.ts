import {canonicalLive,freezeLiveRequest} from './model';
import type {LiveCaptureBinding} from './captureTypes';
import type {ConvoySnapshot,LiveReceipt,LiveRequest,LocalShareIntent} from './types';
type Grant=Extract<LiveRequest,{action:'location_grant'}>;
/** The only source of send authority is this foreground, memory-only review. */
export class LiveShareAuthority{
 private reviewValue:{binding:LiveCaptureBinding;request:Grant;topic:number}|null=null;
 private intent:LocalShareIntent|null=null;private generation=0;
 private armedBinding:LiveCaptureBinding|null=null;private armedExpiresAt:string|null=null;private armedRoomId:string|null=null;
 private listeners=new Set<()=>void>();
 get=()=>this.intent;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 private notify(){for(const fn of this.listeners){try{fn();}catch{/* Listener does not confer send authority. */}}}
 review(binding:LiveCaptureBinding,request:Grant,topic:number){this.suspend();this.reviewValue={binding,request:freezeLiveRequest(request) as Grant,topic};}
 suspend(){this.generation++;this.reviewValue=null;this.intent=null;this.armedBinding=null;this.armedExpiresAt=null;this.armedRoomId=null;this.notify();}
 rebind(binding:LiveCaptureBinding|null,room:ConvoySnapshot|null,eligible:boolean):LocalShareIntent|null{
  const intent=this.intent,armed=this.armedBinding;
  if(!intent||!armed)return null;
  if(!eligible||!binding||!room||binding.scope!==armed.scope||binding.generation!==armed.generation||binding.captureId!==armed.captureId||binding.rideId!==armed.rideId||binding.segmentId!==armed.segmentId||room.id!==this.armedRoomId||room.owner_id!==armed.scope.userId||room.state!=='active'||room.self_state!=='accepted'||room.self_generation!==intent.memberGeneration||room.self_consent.precision!=='precise'||room.self_consent.lease_id!==intent.leaseId||room.self_consent.capture_id!==intent.captureId||room.self_consent.revision!==intent.consentRevision||room.self_consent.expires_at!==this.armedExpiresAt||room.topic_generation<intent.topicGeneration||!room.topic){this.suspend();return null;}
  if(room.topic_generation!==intent.topicGeneration){this.intent=Object.freeze({...intent,topicGeneration:room.topic_generation});this.notify();}
  return this.intent;
 }
 arm(binding:LiveCaptureBinding|null,request:LiveRequest,receipt:LiveReceipt,room:ConvoySnapshot|null,eligible:boolean):LocalShareIntent|null{
  const review=this.reviewValue;
  if(!eligible||!review||!binding||request.action!=='location_grant'||canonicalLive(request)!==canonicalLive(review.request)||binding.scope!==review.binding.scope||binding.generation!==review.binding.generation||binding.captureId!==review.binding.captureId||binding.rideId!==review.binding.rideId||binding.segmentId!==review.binding.segmentId||!room||room.owner_id!==binding.scope.userId||room.id!==request.convoy_id||room.state!=='active'||room.self_state!=='accepted'||room.self_generation!==request.expected_member_generation||room.topic_generation<review.topic||!room.topic||receipt.result.kind!=='consent'||receipt.result.precision!=='precise'||!receipt.result.lease_id||room.self_consent.precision!=='precise'||room.self_consent.lease_id!==receipt.result.lease_id||room.self_consent.revision!==receipt.result.revision||room.self_consent.capture_id!==binding.captureId||room.self_consent.expires_at!==receipt.result.expires_at)return null;
  this.reviewValue=null;this.armedBinding=binding;this.armedExpiresAt=receipt.result.expires_at;this.armedRoomId=room.id;this.intent=Object.freeze({armedGeneration:this.generation,captureId:binding.captureId,leaseId:receipt.result.lease_id,consentRevision:receipt.result.revision,memberGeneration:room.self_generation,topicGeneration:room.topic_generation});this.notify();return this.intent;
 }
}
