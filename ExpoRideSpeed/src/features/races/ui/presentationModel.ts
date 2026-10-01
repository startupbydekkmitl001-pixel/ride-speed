import type {AttemptSnapshot,RaceResult,RaceSnapshot} from '../types';
import type {RaceAttemptBinding,RaceBinding,RaceCreateSelection,RaceMemberBinding,RaceScreenPort,ReviewedRaceCreation} from '../uiTypes';
export function raceBinding(race:RaceSnapshot):RaceBinding{return {race_id:race.id,expected_revision:race.revision,lobby_epoch:race.lobby_epoch};}
export function memberBinding(race:RaceSnapshot):RaceMemberBinding{return {...raceBinding(race),expected_member_generation:race.self_member.member_generation,expected_friendship_generation:race.self_member.friendship_generation};}
export function attemptBinding(attempt:AttemptSnapshot):RaceAttemptBinding{return {attempt_id:attempt.id,expected_revision:attempt.revision,race_id:attempt.race_id,member_generation:attempt.member_generation,capture_id:attempt.capture_id};}
export function assertRace(port:RaceScreenPort,binding:RaceBinding){const r=port.race;if(!r||r.id!==binding.race_id||r.revision!==binding.expected_revision||r.lobby_epoch!==binding.lobby_epoch)throw Error('RACE_CHANGED');return r;}
export function assertMember(port:RaceScreenPort,binding:RaceMemberBinding){const r=assertRace(port,binding);if(r.self_member.member_generation!==binding.expected_member_generation||r.self_member.friendship_generation!==binding.expected_friendship_generation)throw Error('RACE_MEMBER_CHANGED');return r;}
export function assertAttempt(port:RaceScreenPort,binding:RaceAttemptBinding){const a=port.attempt;if(!a||a.id!==binding.attempt_id||a.revision!==binding.expected_revision||a.race_id!==binding.race_id||a.capture_id!==binding.capture_id||a.member_generation!==binding.member_generation||port.race?.self_member.member_generation!==binding.member_generation)throw Error('RACE_CAPTURE_MISMATCH');return a;}
export function assertSelection(port:RaceScreenPort,s:RaceCreateSelection){
 if(!port.routesPage.fresh||port.routesPage.error||!port.friendsPage.fresh||port.friendsPage.error||!port.routes.some(r=>r.id===s.route_id&&r.revision===s.route_revision))throw Error('RACE_CHANGED');
 if(s.friends.length<1||s.friends.length>3||new Set(s.friends.map(f=>f.user_id)).size!==s.friends.length||s.friends.some(f=>!port.friends.some(current=>current.user_id===f.user_id&&current.friendship_generation===f.friendship_generation)))throw Error('RACE_FRIEND_CHANGED');
 const a=port.approvals.items.find(a=>a.id===s.approval_id&&a.route_id===s.route_id&&a.route_revision===s.route_revision);
 if(!port.approvals.fresh||port.approvals.error||!a)throw Error('RACE_APPROVAL_UNAVAILABLE');
 const start=Date.parse(s.starts_at),end=Date.parse(s.ends_at);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>86400000||start<Date.parse(a.starts_at)||end>Date.parse(a.ends_at))throw Error('RACE_WINDOW');
}
export function assertReview(port:RaceScreenPort,r:ReviewedRaceCreation){assertSelection(port,r);if(r.approval.id!==r.approval_id||r.projection.route_id!==r.route_id||r.projection.revision!==r.route_revision||!/^[a-f0-9]{64}$/.test(r.reviewed_projection_hash))throw Error('RACE_CHANGED');}
export function selectionMatches(a:RaceCreateSelection,b:RaceCreateSelection){return a.mode===b.mode&&a.route_id===b.route_id&&a.route_revision===b.route_revision&&a.approval_id===b.approval_id&&a.starts_at===b.starts_at&&a.ends_at===b.ends_at&&a.friends.length===b.friends.length&&a.friends.every((friend,index)=>friend.user_id===b.friends[index].user_id&&friend.friendship_generation===b.friends[index].friendship_generation);}
/** Closed intervals form connected tie clusters. Midpoints never break ties. */
export function rankedIntervals(results:readonly RaceResult[]){
 const sorted=[...results].sort((a,b)=>a.elapsed_lower_ms-b.elapsed_lower_ms||a.elapsed_upper_ms-b.elapsed_upper_ms||a.verified_at.localeCompare(b.verified_at)||a.attempt_id.localeCompare(b.attempt_id));
 const groups:RaceResult[][]=[];let upper=-Infinity;
 for(const result of sorted){if(!groups.length||result.elapsed_lower_ms>upper){groups.push([result]);upper=result.elapsed_upper_ms;}else{groups.at(-1)!.push(result);upper=Math.max(upper,result.elapsed_upper_ms);}}
 let rank=1;return groups.flatMap(group=>{const value=group.map(result=>({result,rank,tied:group.length>1}));rank+=group.length;return value;});
}
/** Round outwards to seconds: never advertise sub-second certainty from GPS brackets. */
export function intervalLabel(lower:number,upper:number){return `${Math.floor(lower/1000)}–${Math.ceil(upper/1000)}`;}
export function displayInstant(value:string){return value.replace('T',' ').replace('Z',' UTC');}
