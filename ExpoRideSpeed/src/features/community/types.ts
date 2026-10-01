import type {StartVehicleSnapshot} from '../rides/syncTypes';
import type {Coordinate} from '../routes/types';
import type {RouteCategory} from '../routes/syncTypes';
import type {CommunityPhotoDescriptor} from './content';
export type CommunityMode='latest'|'top_week'|'friends';
export type CommunityAudience='private'|'friends'|'public';
export type CommunityFilter=Readonly<{schema_version:1;mode:CommunityMode}>;
export type CommunityWindow=Readonly<{timezone:'Asia/Bangkok';starts_at:string|null;ends_at:string|null;as_of:string}>;
export type CommunityCursor=Readonly<{owner_id:string;mode:CommunityMode;feed_revision:string;starts_at:string|null;ends_at:string|null;as_of:string;after:{created_at:string;post_id:string;week_score:number|null}}>;
export type CommunityRideBinding=Readonly<{ride_id:string;ride_revision:number}>;
export type CommunityRouteBinding=Readonly<{route_id:string;route_revision:number}>;
/** Exact owned private M2 summaries remain self-reported after publication. */
export type CommunityRideSnapshot=CommunityRideBinding&Readonly<{summary_hash:string;started_at:string;ended_at:string;active_duration_ms:number;distance_m:number|null;max_speed_mps:number|null;average_speed_mps:number|null;speed_status:'self_reported';vehicle:StartVehicleSnapshot|null}>;
/** No owner stops, place IDs, private bounds or raw polyline are accepted in this projection. */
export type CommunityRouteSnapshot=(Readonly<{source:'ride';category:RouteCategory|null}>|Readonly<{source:'route';category:RouteCategory}>)&Readonly<{source_id:string;source_revision:number;title:string|null;segments:readonly (readonly Coordinate[])[];geometryStatus:'trimmed'|'hidden';privacyTrimMeters:200;geometryHash:string|null;provider:'geoapify'|'recorded'|'draft';attribution:string|null}>|Readonly<{source:'legacy';source_id:null;source_revision:number;title:string;category:RouteCategory;segments:readonly [];geometryStatus:'unavailable';privacyTrimMeters:null;geometryHash:null;provider:'unknown';attribution:null}>;
export type CommunityVerifiedMedia=Readonly<{media_id:string;validation:'decoded_jpeg_v1'}>&Readonly<CommunityPhotoDescriptor>;
/** Existing mixed-codec photos have no fabricated decoding provenance. */
export type CommunityLegacyMedia=Readonly<{media_id:string;validation:'legacy_unverified';mime:'image/jpeg'|'image/png'|'image/webp';sha256:null;byte_count:null;width:null;height:null;blurhash:null}>;
export type CommunityMedia=CommunityVerifiedMedia|CommunityLegacyMedia;
export type CommunityPost=Readonly<{
 post_id:string;owner_id:string;profile:Readonly<{name:string;handle:string}>;
 content_version:0|1;content_revision:number;engagement_revision:number;
 caption:string;description:string;visibility:CommunityAudience;created_at:string;updated_at:string;
 ride:CommunityRideSnapshot|null;route:CommunityRouteSnapshot|null;legacy_claimed_speed_kmh:number|null;
 media:readonly CommunityMedia[];engagement:Readonly<{likes:number;comments:number;liked:boolean;saved:boolean}>;week_score:number|null;
}>;
export type CommunityPage=Readonly<{owner_id:string;server_now:string;filter:CommunityFilter;window:CommunityWindow;feed_revision:string;items:readonly CommunityPost[];next_cursor:CommunityCursor|null}>;
export type CommunityDetail=Readonly<{owner_id:string;server_now:string;post:CommunityPost}>;
export type CommunityComment=Readonly<{comment_id:string;post_id:string;owner_id:string;profile:Readonly<{name:string;handle:string}>;body:string;created_at:string;can_delete:boolean}>;
export type CommunityCommentCursor=Readonly<{created_at:string;id:string}>;
export type CommunityCommentPage=Readonly<{owner_id:string;server_now:string;post_id:string;content_revision:number;items:readonly CommunityComment[];next_cursor:CommunityCommentCursor|null}>;
export type CommunityPublicationDocument=Readonly<{schema_version:1;caption:string;description:string;visibility:CommunityAudience;ride:CommunityRideBinding|null;route:CommunityRouteBinding|null;include_ride_route:boolean;media_ids:readonly string[]}>;
export type CommunityAttachmentSelection=Readonly<Pick<CommunityPublicationDocument,'ride'|'route'|'include_ride_route'>>;
export type CommunityAttachmentReview=Readonly<{owner_id:string;server_now:string;ride:CommunityRideSnapshot|null;route:CommunityRouteSnapshot|null}>;
export type CommunityReportReason='spam'|'harassment'|'privacy'|'dangerous'|'other';
export type CommunityRequest=Readonly<{schema_version:1}>&(
 |Readonly<{action:'publish';post_id:string;expected_revision:number;document:CommunityPublicationDocument}>
 |Readonly<{action:'audience';post_id:string;expected_revision:number;visibility:CommunityAudience}>
 |Readonly<{action:'delete_post';post_id:string;expected_revision:number}>
 |Readonly<{action:'like';post_id:string;expected_revision:number;liked:boolean}>
 |Readonly<{action:'save';post_id:string;expected_revision:number;saved:boolean}>
 |Readonly<{action:'comment';post_id:string;expected_revision:number;comment_id:string;body:string}>
 |Readonly<{action:'delete_comment';post_id:string;expected_revision:number;comment_id:string}>
 |Readonly<{action:'report';post_id:string;expected_revision:number;comment_id:string|null;reason:CommunityReportReason;detail:string}>
);
export type CommunityResult=
 |Readonly<{kind:'post';post_id:string;content_revision:number;engagement_revision:number;state:'published'|'deleted';visibility:CommunityAudience}>
 |Readonly<{kind:'like';post_id:string;content_revision:number;engagement_revision:number;liked:boolean;like_count:number}>
 |Readonly<{kind:'save';post_id:string;content_revision:number;saved:boolean}>
 |Readonly<{kind:'comment';post_id:string;content_revision:number;engagement_revision:number;comment_id:string;state:'published'|'deleted';comment_count:number}>
 |Readonly<{kind:'report';post_id:string;comment_id:string|null;reported:true}>;
export type CommunityOperation=Readonly<{operationId:string;request:CommunityRequest}>;
export type CommunityReceipt=Readonly<{owner_id:string;operation_id:string;request:CommunityRequest;applied_at:string;result:CommunityResult}>;
export type CommunityErrorCode='COMMUNITY_INVALID'|'COMMUNITY_AUTH_REQUIRED'|'COMMUNITY_PROFILE_REQUIRED'|'COMMUNITY_UNAVAILABLE'|'COMMUNITY_CHANGED'|'COMMUNITY_REVISION_CONFLICT'|'COMMUNITY_OPERATION_CONFLICT'|'COMMUNITY_SOURCE_CHANGED'|'COMMUNITY_MEDIA_UNAVAILABLE'|'COMMUNITY_MEDIA_INVALID'|'COMMUNITY_MEDIA_EXPIRED'|'COMMUNITY_DRAFT_UNAVAILABLE'|'COMMUNITY_RATE_LIMITED'|'COMMUNITY_CAPACITY'|'ACCOUNT_DELETION_PENDING';
export type CommunityErrorEnvelope=Readonly<{error:{code:Exclude<CommunityErrorCode,'COMMUNITY_RATE_LIMITED'>}}>|Readonly<{error:{code:'COMMUNITY_RATE_LIMITED';retry_after_ms:number}}>;
export type CommunityMutationResponse=CommunityReceipt|CommunityErrorEnvelope;
export type CommunityPostReservation=Readonly<{owner_id:string;post_id:string;revision:number;state:'draft'|'published'}>;
export type CommunityMediaReservation=Readonly<{post_id:string;media_id:string;bucket:'ride-post-media';path:string;expires_at:string;state:'reserved'|'committed'}>;
export type CommunityMediaCommit=Readonly<{post_id:string;media_id:string;descriptor:CommunityPhotoDescriptor}>;
export type CommunityMediaURL=Readonly<{postId:string;mediaId:string;sha256:string|null;url:string;expiresIn:60}>;
export type CommunityStoredOperation=CommunityOperation&Readonly<{queuedAt:string;lastError:string|null}>;
export type CommunityLatest=Readonly<{operationId:string;status:'applied'|'rejected';error:CommunityErrorCode|null}>;
