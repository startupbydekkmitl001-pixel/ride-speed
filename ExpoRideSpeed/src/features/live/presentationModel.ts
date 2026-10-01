import type {ConvoyMember,ConvoySnapshot,LiveRequest} from './types';
import type {ConvoyCodePreview,FriendLinkPreview,LocationGrantReview} from './uiTypes';

function currentRoom(reviewed:ConvoySnapshot,current:ConvoySnapshot|null,actor:string,now:number){
 if(!current||current.id!==reviewed.id||current.owner_id!==actor||current.revision!==reviewed.revision||current.self_generation!==reviewed.self_generation||current.self_state!=='accepted'||!['lobby','active'].includes(current.state)||Date.parse(current.expires_at)<=now||Date.parse(current.host_lease_until)<=now)throw Error('CONVOY_CHANGED');
 return current;
}
export function convoyMemberRequest(reviewed:ConvoySnapshot,member:ConvoyMember,verb:'approve'|'decline'|'remove'|'leave',current:ConvoySnapshot|null,actor:string,now:number):LiveRequest{
 const room=currentRoom(reviewed,current,actor,now),fresh=room.members.find(value=>value.user_id===member.user_id);
 if(!fresh||fresh.generation!==member.generation||fresh.state!==member.state||fresh.role!==member.role||fresh.host_friendship_generation!==member.host_friendship_generation)throw Error('CONVOY_CHANGED');
 if(verb==='leave'){if(room.host_id===actor||member.user_id!==actor||fresh.state!=='accepted')throw Error('CONVOY_CHANGED');}
 else if(room.viewer_role!=='host'||room.host_id!==actor||member.user_id===actor||(verb==='remove'?fresh.state!=='accepted':fresh.state!=='requested'))throw Error('CONVOY_CHANGED');
 return {schema_version:1,action:'convoy_member',convoy_id:room.id,other_id:member.user_id,verb,expected_room_revision:reviewed.revision,expected_member_generation:member.generation,expected_member_state:member.state};
}
export function convoyRoomRequest(reviewed:ConvoySnapshot,verb:'start'|'end'|'cancel',current:ConvoySnapshot|null,actor:string,now:number):LiveRequest{
 const room=currentRoom(reviewed,current,actor,now);if(room.viewer_role!=='host'||room.host_id!==actor)throw Error('CONVOY_CHANGED');
 if(verb==='start'){if(room.state!=='lobby'||room.members.filter(value=>value.state==='accepted').length<2)throw Error('CONVOY_CHANGED');return {schema_version:1,action:'convoy_start',convoy_id:room.id,expected_room_revision:reviewed.revision};}
 if((verb==='end'&&room.state!=='active')||(verb==='cancel'&&room.state!=='lobby'))throw Error('CONVOY_CHANGED');
 return {schema_version:1,action:'convoy_end',convoy_id:room.id,expected_room_revision:reviewed.revision,verb};
}
export function friendLinkRequest(preview:FriendLinkPreview,now:number):LiveRequest{
 if(!Number.isFinite(Date.parse(preview.expires_at))||Date.parse(preview.expires_at)<=now)throw Error('FRIEND_LINK_UNAVAILABLE');
 return {schema_version:1,action:'friend_link_request',proof_id:preview.proof_id,issuer_id:preview.issuer_id};
}
export function convoyJoinRequest(preview:ConvoyCodePreview,now:number):LiveRequest{
 if(!Number.isFinite(Date.parse(preview.expires_at))||Date.parse(preview.expires_at)<=now)throw Error('CONVOY_UNAVAILABLE');
 return {schema_version:1,action:'convoy_join',convoy_id:preview.convoy_id,proof_id:preview.proof_id,expected_room_revision:preview.room_revision,host_friendship_generation:preview.host_friendship_generation};
}
export function locationReview(room:ConvoySnapshot,captureId:string|null,ghost:boolean,now:number):LocationGrantReview{
 if(ghost||!captureId||room.state!=='active'||room.self_state!=='accepted'||Date.parse(room.expires_at)<=now||Date.parse(room.host_lease_until)<=now)throw Error('LOCATION_CONSENT_REQUIRED');
 return {roomId:room.id,roomRevision:room.revision,memberGeneration:room.self_generation,consentRevision:room.self_consent.revision,captureId};
}
export function assertLocationReview(review:LocationGrantReview,room:ConvoySnapshot|null,captureId:string|null,ghost:boolean,now:number):void{
 if(!room)throw Error('LOCATION_CONSENT_CHANGED');const fresh=locationReview(room,captureId,ghost,now);
 if(Object.keys(fresh).some(key=>fresh[key as keyof LocationGrantReview]!==review[key as keyof LocationGrantReview]))throw Error('LOCATION_CONSENT_CHANGED');
}
