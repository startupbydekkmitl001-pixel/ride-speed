import type {RankedCategory,RankedClassKey,RankedPeriod} from './presentationModel';
export type {RankedCategory,RankedClassKey,RankedPeriod} from './presentationModel';
export type RankedMetric='sustained_speed'|'route_time';
export type RankedScope='global'|'friends';
export type RankedCourseKey=Readonly<{approval_id:string;config_hash:string;mode:'async'|'live'}>;
export type RankedFilter=Readonly<{schema_version:1;period:RankedPeriod;metric:RankedMetric;category:RankedCategory;class_key:'all'|RankedClassKey;scope:RankedScope;course:RankedCourseKey|null}>;
export type RankedWindow=Readonly<{timezone:'Asia/Bangkok';starts_at:string;ends_at:string;as_of:string}>;
export type RankedCursor=Readonly<{owner_id:string;filter_hash:string;board_revision:string;starts_at:string;ends_at:string;as_of:string;after_position:number}>;
type RankedRowBase=Readonly<{record_id:string;user_id:string;rank:number;position:number;tied:boolean;profile:{name:string;handle:string};category:RankedCategory;class_key:RankedClassKey;class_scheme_version:1;metadata_authority:'self_reported'|'unknown';completed_at:string;verified_at:string;provenance_unknown:boolean}>;
export type RankedSpeedRow=RankedRowBase&Readonly<{metric:'sustained_speed';method:'sustained_min_3s_v1';sustained_kmh:number;quality:'submitted_evidence_consistency'}>;
export type RankedTimeRow=RankedRowBase&Readonly<{metric:'route_time';method:'route_time_v1';elapsed_lower_ms:number;elapsed_upper_ms:number;quality:'native_evidence_consistency';course:RankedCourseKey}>;
export type RankedRow=RankedSpeedRow|RankedTimeRow;
export type RankedPage=Readonly<{owner_id:string;server_now:string;filter:RankedFilter;period:RankedWindow;board_revision:string;capabilities:{speed:boolean;route_time:boolean;publication:boolean};items:readonly RankedRow[];podium:readonly RankedRow[];self:RankedRow|null;self_status:'ranked'|'private'|'unclassified'|'no_record';next_cursor:RankedCursor|null}>;
/** Discovery is operator-approved separately from private race/course evidence access. */
export type RankedCourse=RankedCourseKey&Readonly<{title:string;category:RankedCategory;route_revision:number}>;
export type RankedCourseCursor=Readonly<{approval_id:string;mode:'async'|'live'}>;
export type RankedCoursePage=Readonly<{owner_id:string;server_now:string;items:readonly RankedCourse[];next_cursor:RankedCourseCursor|null}>;
export type RankedErrorCode='RANKED_INVALID'|'RANKED_AUTH_REQUIRED'|'RANKED_PROFILE_REQUIRED'|'RANKED_UNAVAILABLE'|'RANKED_CHANGED'|'RANKED_COURSE_UNAVAILABLE'|'RANKED_RATE_LIMITED'|'ACCOUNT_DELETION_PENDING';
export type RankedErrorEnvelope={error:{code:Exclude<RankedErrorCode,'RANKED_RATE_LIMITED'>}}|{error:{code:'RANKED_RATE_LIMITED';retry_after_ms:number}};
/** Separate explicit publication; verification/evidence consent never shares a result. */
export type RankedAudience='private'|'friends'|'global';
export type RankedPublication=Readonly<{owner_id:string;metric:RankedMetric;record_id:string;revision:number;audience:RankedAudience;updated_at:string|null}>;
export type RankedPublicationRequest=Readonly<{schema_version:1;action:'publication_set';metric:RankedMetric;record_id:string;expected_revision:number;audience:RankedAudience}>;
export type RankedReportRequest=Readonly<{schema_version:1;action:'report_record';metric:RankedMetric;record_id:string;reason:'suspected_cheating'|'unsafe_activity'|'harassment'|'other';detail:string}>;
export type RankedRequest=RankedPublicationRequest|RankedReportRequest;
export type RankedReportResult=Readonly<{report_id:string;metric:RankedMetric;record_id:string;state:'received';created_at:string}>;
export type RankedReceipt=Readonly<{owner_id:string;operation_id:string;request:RankedRequest;applied_at:string;result:RankedPublication|RankedReportResult}>;
export type RankedMutationErrorCode=RankedErrorCode|'RANKED_OPERATION_CONFLICT'|'RANKED_PUBLICATION_CHANGED'|'RANKED_RECORD_UNAVAILABLE';
export type RankedMutationError={error:{code:Exclude<RankedMutationErrorCode,'RANKED_RATE_LIMITED'>}}|{error:{code:'RANKED_RATE_LIMITED';retry_after_ms:number}};
type RankedOwnBase=Omit<RankedRowBase,'user_id'|'rank'|'position'|'tied'|'profile'>&Readonly<{publication:Pick<RankedPublication,'revision'|'audience'|'updated_at'>}>;
export type RankedOwnRecord=(RankedOwnBase&Readonly<{metric:'sustained_speed';method:'sustained_min_3s_v1';sustained_kmh:number;quality:'submitted_evidence_consistency'}>)|(RankedOwnBase&Readonly<{metric:'route_time';method:'route_time_v1';elapsed_lower_ms:number;elapsed_upper_ms:number;quality:'native_evidence_consistency';course:RankedCourseKey}>);
export type RankedOwnCursor=Readonly<{completed_at:string;record_id:string;metric:RankedMetric}>;
export type RankedOwnPage=Readonly<{owner_id:string;server_now:string;items:readonly RankedOwnRecord[];next_cursor:RankedOwnCursor|null}>;
/** Existing owned settings remain discoverable even when record qualification expires. */
export type RankedPublicationCursor=Readonly<{updated_at:string;record_id:string;metric:RankedMetric}>;
export type RankedPublicationPage=Readonly<{owner_id:string;server_now:string;items:readonly RankedPublication[];next_cursor:RankedPublicationCursor|null}>;
