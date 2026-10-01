import type {AuthScope} from '../../state/AuthState';
import {isLiveInstant,validateConvoyPositions} from './model';
import type {AuthorizedPeerFrame,ConvoyPositions,ConvoySnapshot,LiveClock,PeerPosition} from './types';
export type {LiveClock,AuthorizedPeerFrame,AuthorizedPeer} from './types';
export function liveClock(serverNow:string,requestStart:number,adopted:number):LiveClock{
 if(!isLiveInstant(serverNow)||!Number.isFinite(requestStart)||requestStart<0||!Number.isFinite(adopted)||adopted<requestStart)throw Error('LIVE_CLOCK_UNCERTAIN');return Object.freeze({serverTimeMs:Date.parse(serverNow),requestStartMonotonicMs:requestStart,adoptedMonotonicMs:adopted});
}
export function estimatedLiveServerNow(clock:LiveClock,mono:number):number|null{
 if(!Number.isFinite(clock.serverTimeMs)||!Number.isFinite(clock.requestStartMonotonicMs)||!Number.isFinite(clock.adoptedMonotonicMs)||clock.requestStartMonotonicMs<0||clock.adoptedMonotonicMs<clock.requestStartMonotonicMs||!Number.isFinite(mono)||mono<clock.adoptedMonotonicMs)return null;return clock.serverTimeMs+mono-clock.requestStartMonotonicMs;
}
export function authorizedPeerFrame(scope:AuthScope,room:ConvoySnapshot,input:ConvoyPositions,requestStart:number,adopted:number):AuthorizedPeerFrame{
 const page=validateConvoyPositions(input,scope.userId!,room),clock=liveClock(page.server_now,requestStart,adopted),bound=Math.min(Date.parse(room.expires_at),Date.parse(room.host_lease_until));
 return Object.freeze({scope,convoyId:room.id,topicGeneration:page.topic_generation,changeRevision:page.change_revision,clock,roomExpiresAt:room.expires_at,hostLeaseUntil:room.host_lease_until,peers:Object.freeze(page.items.map(position=>Object.freeze({position,topicGeneration:page.topic_generation,expiresMonotonicMs:requestStart+Math.min(Date.parse(position.expires_at),bound)-clock.serverTimeMs})))});
}
export function freshConvoyPeers(frame:AuthorizedPeerFrame,mono:number):readonly PeerPosition[]{
 const now=estimatedLiveServerNow(frame.clock,mono);if(now===null||now>=Date.parse(frame.roomExpiresAt)||now>=Date.parse(frame.hostLeaseUntil))return [];return frame.peers.filter(p=>p.topicGeneration===frame.topicGeneration&&Number.isFinite(p.expiresMonotonicMs)&&mono<p.expiresMonotonicMs&&Date.parse(p.position.expires_at)>now).map(p=>p.position);
}
/** Absolute monotonic deadline; callers subtract their current monotonic clock. */
export function nextLiveExpiry(frame:AuthorizedPeerFrame,mono:number):number|null{
 if(!freshConvoyPeers(frame,mono).length)return null;const bound=frame.clock.requestStartMonotonicMs+Math.min(Date.parse(frame.roomExpiresAt),Date.parse(frame.hostLeaseUntil))-frame.clock.serverTimeMs;const deadlines=frame.peers.map(p=>Math.min(p.expiresMonotonicMs,bound)).filter(v=>Number.isFinite(v)&&v>mono);return deadlines.length?Math.min(...deadlines):null;
}
