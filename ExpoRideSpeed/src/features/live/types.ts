import type {AuthScope} from '../../state/AuthState';
import type {MapCoordinate} from '../map/MapSurface.types';
import type {SafeRouteSnapshot} from '../social/types';
import type {LiveCaptureBinding} from './captureTypes';
export type {SafeRouteSnapshot} from '../social/types';
export type LiveErrorCode='LIVE_INVALID'|'LIVE_TOO_LARGE'|'LIVE_OPERATION_CONFLICT'|'LIVE_OPERATION_CANCELLED'|'LIVE_UNAVAILABLE'|'LIVE_RATE_LIMITED'|'LIVE_AUTH_REQUIRED'|'LIVE_DISABLED'|'LIVE_CAPACITY'|'PROFILE_REQUIRED'|'FRIEND_CHANGED'|'FRIEND_LINK_UNAVAILABLE'|'CONVOY_UNAVAILABLE'|'CONVOY_CHANGED'|'CONVOY_FULL'|'LOCATION_CONSENT_REQUIRED'|'LOCATION_CONSENT_CHANGED'|'LOCATION_STALE'|'LOCATION_QUALITY'|'POSITION_SEQUENCE'|'ACCOUNT_DELETION_PENDING';
export type LiveClientErrorCode='LIVE_INVALID_RESPONSE'|'LIVE_CLOCK_UNCERTAIN'|'LIVE_REVIEW_REQUIRED'|'ACCOUNT_CHANGED'|'LOCAL_READ_FAILED'|'LOCAL_WRITE_FAILED';
export type LiveRequest={schema_version:1}&(
 |{action:'friend_link_create';link_id:string;token_hash:string;ttl_seconds:3600|86400}
 |{action:'friend_link_revoke';link_id:string;expected_revision:number}
 |{action:'friend_link_request';proof_id:string;issuer_id:string}
 |{action:'convoy_create';convoy_id:string;title:string;route_id:string;route_revision:number;reviewed_geometry_hash:string|null;code_hash:string;ttl_seconds:3600}
 |{action:'convoy_join';convoy_id:string;proof_id:string;expected_room_revision:number;host_friendship_generation:number}
 |{action:'convoy_member';convoy_id:string;other_id:string;verb:'approve'|'decline'|'remove'|'leave';expected_room_revision:number;expected_member_generation:number;expected_member_state:'requested'|'accepted'}
 |{action:'convoy_start';convoy_id:string;expected_room_revision:number}
 |{action:'convoy_end';convoy_id:string;expected_room_revision:number;verb:'end'|'cancel'}
 |{action:'convoy_code_rotate';convoy_id:string;expected_room_revision:number;code_hash:string}
 |{action:'location_grant';convoy_id:string;expected_room_revision:number;expected_member_generation:number;expected_consent_revision:number;capture_id:string;duration_seconds:900|3600;precision:'precise'}
 |{action:'location_revoke';convoy_id:string;expected_member_generation:number;expected_consent_revision:number;expected_lease_id:string|null});
export type LiveResult=
 |{kind:'friend_link';link_id:string;revision:number;state:'active'|'revoked';expires_at:string}
 |{kind:'friend';user_id:string;state:'incoming'|'outgoing'|'accepted';generation:number}
 |{kind:'convoy';convoy_id:string;revision:number;state:'lobby'|'active'|'ended'|'cancelled'}
 |{kind:'member';convoy_id:string;user_id:string;room_revision:number;state:'requested'|'accepted'|'declined'|'left'|'removed';generation:number}
 |{kind:'consent';convoy_id:string;revision:number;precision:'none'|'precise';lease_id:string|null;capture_id:string|null;expires_at:string|null};
export type LiveOperation={operationId:string;request:LiveRequest};
export type StoredLiveOperation=LiveOperation&{queuedAt:string;lastError:LiveErrorCode|LiveClientErrorCode|null};
export type LiveReceipt={owner_id:string;operation_id:string;request:LiveRequest;applied_at:string;result:LiveResult};
export type LiveErrorEnvelope={error:{code:LiveErrorCode}};
export type LiveMutation=LiveReceipt|LiveErrorEnvelope;
export type LiveGrantCancellation={owner_id:string;operation_id:string;request:Extract<LiveRequest,{action:'location_grant'}>;state:'cancelled';cancelled_at:string};
export type LiveGrantCancellationMutation=LiveReceipt|LiveGrantCancellation|LiveErrorEnvelope;
export type LiveLatest={operationId:string;status:'applied'|'rejected';error:LiveErrorCode|null;receipt:LiveReceipt|null};
export type LiveCoordinatorSnapshot={busy:boolean;pending:StoredLiveOperation[];error:LiveErrorCode|LiveClientErrorCode|null;latest:LiveLatest|null;reviewRequired:string[]};
export type LiveOwned={operations:StoredLiveOperation[]};
export interface LiveControlPort{
 ownerId:string;current():boolean;eligible():boolean;read():LiveOwned;
 update(reducer:(fresh:LiveOwned)=>LiveOwned):Promise<void>;flush():Promise<void>;
 send(operation:LiveOperation):Promise<LiveMutation>;status(operationId:string):Promise<LiveReceipt|null>;
 cancelGrant(operation:LiveOperation):Promise<LiveGrantCancellationMutation>;
 refresh(receipt:LiveReceipt):Promise<void>;operationId():string;nowISO():string;
}
export type FriendLink={id:string;revision:number;state:'active';expires_at:string};
export type FriendLinks={owner_id:string;server_now:string;items:FriendLink[]};
export type FriendLinkPreview={proof_id:string;link_id:string;issuer_id:string;handle:string;display_name:string;expires_at:string};
export type FriendLinkResolution={owner_id:string;server_now:string;preview:FriendLinkPreview|null};
export type ConvoyCodePreview={proof_id:string;convoy_id:string;host_id:string;host_name:string;title:string;room_revision:number;host_friendship_generation:number;expires_at:string};
export type ConvoyCodeResolution={owner_id:string;server_now:string;preview:ConvoyCodePreview|null};
export type FriendLinkResolutionResponse=FriendLinkResolution|LiveErrorEnvelope;
export type ConvoyCodeResolutionResponse=ConvoyCodeResolution|LiveErrorEnvelope;
export type ConvoySummary={id:string;host_id:string;title:string;revision:number;state:'lobby'|'active';self_state:'requested'|'accepted';expires_at:string};
export type ConvoyList={owner_id:string;server_now:string;items:ConvoySummary[]};
export type ConvoyMember={user_id:string;handle:string;display_name:string;role:'host'|'member';state:'requested'|'accepted';generation:number;host_friendship_generation:number|null};
export type LocationConsent={revision:number;precision:'none'|'precise';lease_id:string|null;capture_id:string|null;expires_at:string|null;last_sequence:number};
export type ConvoySnapshot={owner_id:string;server_now:string;id:string;host_id:string;title:string;revision:number;state:'lobby'|'active'|'ended'|'cancelled';expires_at:string;host_lease_until:string;route_snapshot:SafeRouteSnapshot;viewer_role:'host'|'member'|'applicant';self_state:'requested'|'accepted';self_generation:number;members:ConvoyMember[];topic:string|null;topic_generation:number;change_revision:number;self_consent:LocationConsent;self_code:{generation:number;hash:string;expires_at:string}|null};
export type LiveSample={schema_version:1;convoy_id:string;topic_generation:number;member_generation:number;consent_revision:number;lease_id:string;capture_id:string;sequence:number;latitude:number;longitude:number;accuracy_m:number;heading_deg:number|null;captured_at:string;source:{platform:'ios'|'android'|'web';mocked:boolean|null;simulated:boolean|null}};
export type PeerPosition={user_id:string;display_name:string;latitude:number;longitude:number;accuracy_m:number;heading_deg:number|null;captured_at:string;received_at:string;expires_at:string;member_generation:number;consent_revision:number;sequence:number;authority:'unverified_live'};
export type LivePublishAck={owner_id:string;convoy_id:string;lease_id:string;sequence:number;received_at:string;expires_at:string};
export type LivePublishMutation=LivePublishAck|LiveErrorEnvelope;
export type ConvoyPositions={owner_id:string;convoy_id:string;server_now:string;topic_generation:number;change_revision:number;items:PeerPosition[]};
export type ConvoyPositionMutation=ConvoyPositions|LiveErrorEnvelope;
export type ConvoyHeartbeat={owner_id:string;convoy_id:string;server_now:string;host_lease_until:string};
export type ConvoyHeartbeatMutation=ConvoyHeartbeat|LiveErrorEnvelope;
export type ConvoyEvent={schema_version:1;convoy_id:string;topic_generation:number;change_revision:number;kind:'positions_changed'|'room_changed'};
export type LiveClock=Readonly<{serverTimeMs:number;requestStartMonotonicMs:number;adoptedMonotonicMs:number}>;
export type AuthorizedPeer=Readonly<{position:PeerPosition;expiresMonotonicMs:number;topicGeneration:number}>;
export type AuthorizedPeerFrame=Readonly<{scope:AuthScope;convoyId:string;topicGeneration:number;changeRevision:number;clock:LiveClock;roomExpiresAt:string;hostLeaseUntil:string;peers:readonly AuthorizedPeer[]}>;
export type LivePolicy=Readonly<{scope:AuthScope;signedIn:boolean;hydrated:boolean;foreground:boolean;online:boolean;ghost:boolean;closed:boolean;receiveEnabled:boolean;mapFocused:boolean}>;
export type LocalShareIntent=Readonly<{armedGeneration:number;captureId:string;leaseId:string;consentRevision:number;memberGeneration:number;topicGeneration:number}>;
export type LiveSenderBinding=Readonly<{scope:AuthScope;room:ConvoySnapshot;roomClock:LiveClock;capture:LiveCaptureBinding;intent:LocalShareIntent}>;
export interface LivePositionPort{
 monotonicNow():number;wallNow():number;policy():LivePolicy;current(binding:LiveSenderBinding):boolean;
 publish(sample:LiveSample):Promise<LivePublishMutation>;read(room:ConvoySnapshot):Promise<ConvoyPositionMutation>;
 refreshRoom(convoyId:string):Promise<ConvoySnapshot|null>;
 onPeers(frame:AuthorizedPeerFrame|null):void;onError(code:LiveErrorCode|LiveClientErrorCode):void;
}
export type PeerRenderKey=Readonly<{userId:string;memberGeneration:number;consentRevision:number;topicGeneration:number;sequence:number}>;
export type PeerMotion=Readonly<{key:PeerRenderKey;from:MapCoordinate;to:MapCoordinate;startMonotonicMs:number;durationMs:number;expiresMonotonicMs:number}>;
