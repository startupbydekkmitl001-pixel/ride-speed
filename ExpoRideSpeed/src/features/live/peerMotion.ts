import type {MapCoordinate} from '../map/MapSurface.types';
import type {AuthorizedPeer,PeerMotion} from './types';
export type {PeerMotion,PeerRenderKey} from './types';
function distance(a:MapCoordinate,b:MapCoordinate){const rad=Math.PI/180,dlat=(b.latitude-a.latitude)*rad,dlon=(b.longitude-a.longitude)*rad,h=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));}
export function createPeerMotion(previous:AuthorizedPeer|null,current:AuthorizedPeer,mono:number,reducedMotion:boolean):PeerMotion{
 const p=current.position,to={latitude:p.latitude,longitude:p.longitude},before=previous?.position,elapsed=before?Date.parse(p.captured_at)-Date.parse(before.captured_at):0;
 const continuous=!reducedMotion&&Number.isFinite(mono)&&!!previous&&previous.expiresMonotonicMs>mono&&current.expiresMonotonicMs>mono&&previous.topicGeneration===current.topicGeneration&&before?.user_id===p.user_id&&before.member_generation===p.member_generation&&before.consent_revision===p.consent_revision&&before.sequence+1===p.sequence&&elapsed>0&&elapsed<=3000&&distance({latitude:before.latitude,longitude:before.longitude},to)<=Math.max(40,elapsed/1000*100);
 return Object.freeze({key:Object.freeze({userId:p.user_id,memberGeneration:p.member_generation,consentRevision:p.consent_revision,topicGeneration:current.topicGeneration,sequence:p.sequence}),from:continuous?{latitude:before!.latitude,longitude:before!.longitude}:to,to,startMonotonicMs:mono,durationMs:continuous?Math.min(1000,elapsed):0,expiresMonotonicMs:current.expiresMonotonicMs});
}
/** Display-only worklet. Never write its interpolated output to GPS/evidence. */
export function samplePeerMotion(value:PeerMotion,mono:number):MapCoordinate|null{
 'worklet';
 if(!Number.isFinite(mono)||!Number.isFinite(value.startMonotonicMs)||!Number.isFinite(value.expiresMonotonicMs)||mono<value.startMonotonicMs||mono>=value.expiresMonotonicMs)return null;
 const progress=value.durationMs<=0?1:Math.min(1,Math.max(0,(mono-value.startMonotonicMs)/value.durationMs));if(progress===1)return value.to;const eased=progress*progress*(3-2*progress),delta=((value.to.longitude-value.from.longitude+540)%360)-180,longitude=((value.from.longitude+delta*eased+540)%360)-180;
 return {latitude:value.from.latitude+(value.to.latitude-value.from.latitude)*eased,longitude};
}
