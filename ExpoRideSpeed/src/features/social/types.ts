import type {RouteCategory,RouteProjection} from '../routes/syncTypes';

export type SocialCursor={updated_at:string;user_id:string};
export type BlockedCursor={user_id:string};
export type InvitationCursor={created_at:string;id:string};
export type FriendRow={user_id:string;handle:string;display_name:string;state:'pending'|'accepted';direction:'incoming'|'outgoing';generation:number;updated_at:string};
export type StatusRow={user_id:string;topic:string;online:boolean;expires_at:string|null};
export type SocialSelf={profile_ready:boolean;presence_opt_in:boolean;account_revision:number};
export type SocialPage={owner_id:string;server_now:string;self:SocialSelf;items:FriendRow[];statuses:StatusRow[];next_cursor:SocialCursor|null};
export type BlockedPerson={user_id:string;handle:string;display_name:string;block_token:string};
export type BlockedPage={owner_id:string;items:BlockedPerson[];next_cursor:BlockedCursor|null};
export type SafeRouteSnapshot={route_id:string;revision:number;title:string;category:RouteCategory}&Pick<RouteProjection,'segments'|'geometryStatus'|'privacyTrimMeters'|'geometryHash'|'provider'|'attribution'>;
export type InvitationMemberState='invited'|'accepted'|'declined'|'withdrawn';
export type InvitationRow={id:string;creator_id:string;creator_name:string|null;route_summary:{title:string;revision:number;category:RouteCategory}|null;route_snapshot:SafeRouteSnapshot|null;mode:'group_ride'|'timed_race';metric:'none'|'sustained_speed_3s';course_session_id:string|null;starts_at:string;ends_at:string;state:'open'|'cancelled';created_at:string;member:{state:InvitationMemberState;friendship_generation:number|null}|null;can_cancel:boolean};
export type InvitationPage={owner_id:string;server_now:string;items:InvitationRow[];next_cursor:InvitationCursor|null};
export type FriendVerb='accept'|'decline'|'cancel'|'remove'|'block';
export type InvitationVerb='accept'|'decline'|'withdraw'|'cancel';
export type SocialRequest={schema_version:1}&(
 |{action:'request_friend';handle:string}
 |{action:'friend_action';other_id:string;verb:FriendVerb;expected_generation:number|null}
 |{action:'unblock';other_id:string;block_token:string}
 |{action:'set_presence';enabled:boolean;expected_account_revision:number}
 |{action:'create_invitation';challenge_id:string;route_id:string;route_revision:number;reviewed_geometry_hash:string|null;mode:'group_ride'|'timed_race';session_id:string|null;starts_at:string;ends_at:string;recipient_id:string;friendship_generation:number}
 |{action:'invitation_action';challenge_id:string;verb:InvitationVerb;expected_member_state:InvitationMemberState|null;friendship_generation:number|null});
export type SocialOperation={operationId:string;request:SocialRequest};
export type SocialResult=
 |{kind:'friend';user_id:string;state:'incoming'|'outgoing'|'accepted'|'declined'|'cancelled'|'removed'|'blocked';generation:number|null}
 |{kind:'unblock';user_id:string;state:'unblocked'}
 |{kind:'presence';enabled:boolean;account_revision:number}
 |{kind:'invitation';challenge_id:string;state:'open'|'accepted'|'declined'|'withdrawn'|'cancelled'};
export type SocialReceipt={owner_id:string;operation_id:string;request:SocialRequest;applied_at:string;result:SocialResult};
export type SocialErrorCode='SOCIAL_INVALID'|'SOCIAL_TOO_LARGE'|'SOCIAL_OPERATION_CONFLICT'|'SOCIAL_UNAVAILABLE'|'SOCIAL_RATE_LIMITED'|'SOCIAL_AUTH_REQUIRED'|'PROFILE_REQUIRED'|'FRIEND_CHANGED'|'BLOCK_CHANGED'|'PRESENCE_CHANGED'|'INVITATION_CHANGED'|'INVITATION_UNAVAILABLE'|'ACCOUNT_DELETION_PENDING';
export type SocialMutationResponse=SocialReceipt|{error:{code:SocialErrorCode}};
export type StoredSocialOperation=SocialOperation&{queuedAt:string;lastError:string|null};
export type SocialLatest={operationId:string;status:'applied'|'rejected';error:SocialErrorCode|null};
export type SocialCoordinatorSnapshot={busy:boolean;pending:StoredSocialOperation[];error:string|null;latest:SocialLatest|null;reviewRequired:string[]};
export type SocialOwned={socialOperations:StoredSocialOperation[]};
export type SocialPort={guard:()=>void;hasSession:()=>boolean;read:()=>SocialOwned;write:(patch:Partial<SocialOwned>)=>Promise<void>;flush:()=>Promise<void>;operationUUID:()=>string;nowISO:()=>string;send:(operation:SocialOperation)=>Promise<SocialMutationResponse>;status:(operationId:string)=>Promise<SocialReceipt|null>;refresh:(receipt:SocialReceipt)=>Promise<void>;ownerId:string};
