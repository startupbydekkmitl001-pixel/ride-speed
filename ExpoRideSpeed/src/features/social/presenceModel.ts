import {isSocialInstant} from './model';
import type {StatusRow} from './types';
export type PresenceClock=Readonly<{serverTimeMs:number;monotonicTimeMs:number}>;
export type PresenceEvent={user_id:string;online:boolean;expires_at:string|null};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function socialPresenceTopic(value:unknown):string|null{return typeof value==='string'&&value.startsWith('rs-presence:')&&uuid.test(value.slice(12))?value:null;}
/** Broadcast permission is cached: events are hints to a fresh authorized RPC. */
export function validatePresenceEvent(value:unknown,expectedUserId:string):PresenceEvent|null{
 if(!uuid.test(expectedUserId)||!value||typeof value!=='object'||Array.isArray(value))return null;const event=value as Record<string,unknown>;
 if(Object.keys(event).length!==3||!['user_id','online','expires_at'].every(key=>Object.hasOwn(event,key))||event.user_id!==expectedUserId||typeof event.online!=='boolean'||(event.online?!isSocialInstant(event.expires_at):event.expires_at!==null&&!isSocialInstant(event.expires_at)))return null;
 return Object.freeze({user_id:expectedUserId,online:event.online,expires_at:event.expires_at as string|null});
}
export function presenceClock(serverNow:string,monotonicNowMs:number):PresenceClock{if(!isSocialInstant(serverNow)||!Number.isFinite(monotonicNowMs)||monotonicNowMs<0)throw Error('SOCIAL_INVALID_RESPONSE');return Object.freeze({serverTimeMs:Date.parse(serverNow),monotonicTimeMs:monotonicNowMs});}
/** Losing/rewinding the monotonic anchor makes presence unknown rather than fresh. */
export function freshSocialStatuses(rows:readonly StatusRow[],clock:PresenceClock|null,monotonicNowMs:number):StatusRow[]{
 const elapsed=clock?monotonicNowMs-clock.monotonicTimeMs:NaN;const valid=!!clock&&Number.isFinite(clock.serverTimeMs)&&Number.isFinite(clock.monotonicTimeMs)&&Number.isFinite(elapsed)&&elapsed>=0;
 return rows.map(row=>{const expiry=isSocialInstant(row.expires_at)?Date.parse(row.expires_at):NaN;const online=valid&&row.online&&expiry>clock!.serverTimeMs+elapsed&&expiry-clock!.serverTimeMs<=70001;return {...row,online,expires_at:online?row.expires_at:null};});
}
