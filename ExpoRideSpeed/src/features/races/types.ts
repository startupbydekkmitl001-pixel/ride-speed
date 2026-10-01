import type {StartVehicleSnapshot} from '../rides/syncTypes';
export type ImmutableVehicleSnapshot=StartVehicleSnapshot;
export type NativeRacePlatform='ios'|'android';
export type RaceMode='async'|'live';
export type RaceState='open'|'lobby'|'countdown'|'running'|'finished'|'cancelled'|'expired';
export type AttemptState='reserved'|'armed'|'upload_pending'|'queued'|'verifying'|'verified'|'rejected'|'aborted'|'dnf';
export type RaceTerminalReason='host_cancelled'|'host_expired'|'membership_changed'|'blocked'|'approval_revoked'|'session_ended'|'account_deleted'|'deadline';
export type AttemptTerminalReason=RaceTerminalReason|'user_stop'|'background'|'capture_changed'|'quality'|'storage_error'|'clock_invalid'|'late_start';
export type RaceEvidenceCode='EVIDENCE_SCHEMA'|'EVIDENCE_DIGEST'|'EVIDENCE_SIZE'|'EVIDENCE_SOURCE'|'EVIDENCE_MOCKED'|'EVIDENCE_ACCURACY'|'EVIDENCE_TIMESTAMP'|'EVIDENCE_CLOCK'|'EVIDENCE_CLOCK_PRECISION'|'EVIDENCE_CLOCK_STALE'|'EVIDENCE_GAP'|'EVIDENCE_TRUNCATED'|'EVIDENCE_CAPTURE'|'EVIDENCE_FOREGROUND'|'EVIDENCE_TELEPORT'|'EVIDENCE_ACCELERATION'|'EVIDENCE_BOUNDARY'|'EVIDENCE_CORRIDOR'|'EVIDENCE_PROGRESS'|'EVIDENCE_GATE_DIRECTION'|'EVIDENCE_GATE_ORDER'|'EVIDENCE_GATE_AMBIGUOUS'|'EVIDENCE_STAGING'|'EVIDENCE_LATE_START'|'EVIDENCE_WINDOW'|'EVIDENCE_DURATION'|'APPROVAL_REVOKED'|'MEMBERSHIP_CHANGED'|'ACCOUNT_DELETION';
export type RaceErrorCode='RACE_INVALID'|'RACE_TOO_LARGE'|'RACE_AUTH_REQUIRED'|'RACE_PROFILE_REQUIRED'|'RACE_DISABLED'|'RACE_RATE_LIMITED'|'RACE_UNAVAILABLE'|'RACE_OPERATION_CONFLICT'|'RACE_OPERATION_CANCELLED'|'RACE_CHANGED'|'RACE_MEMBER_CHANGED'|'RACE_FRIEND_CHANGED'|'RACE_BLOCKED'|'RACE_APPROVAL_UNAVAILABLE'|'RACE_SESSION_UNAVAILABLE'|'RACE_CAPACITY'|'RACE_ATTEMPT_ACTIVE'|'RACE_ATTEMPT_LIMIT'|'RACE_ATTEMPT_CHANGED'|'RACE_CAPTURE_MISMATCH'|'RACE_STAGE_UNAVAILABLE'|'RACE_CLOCK_UNAVAILABLE'|'RACE_READY_CHANGED'|'RACE_NOT_READY'|'RACE_TOO_LATE'|'RACE_EVIDENCE_BOUND'|'RACE_EVIDENCE_UNAVAILABLE'|'RACE_UPLOAD_EXPIRED'|'ACCOUNT_DELETION_PENDING';
export type RaceClientErrorCode='RACE_INVALID_RESPONSE'|'RACE_REVIEW_REQUIRED'|'ACCOUNT_CHANGED'|'LOCAL_READ_FAILED'|'LOCAL_WRITE_FAILED';
export type RaceErrorEnvelope={error:{code:Exclude<RaceErrorCode,'RACE_RATE_LIMITED'>}}|{error:{code:'RACE_RATE_LIMITED';retry_after_ms:number}};
export type FriendBinding={user_id:string;friendship_generation:number};
export type RaceCreate={schema_version:1;action:'race_create';race_id:string;mode:RaceMode;approval_id:string;route_id:string;route_revision:number;reviewed_projection_hash:string;starts_at:string;ends_at:string;friends:FriendBinding[];acknowledgement_version:1;evidence_consent_version:1};
export type RaceMemberActionBase={schema_version:1;action:'member_action';race_id:string;expected_revision:number;expected_member_generation:number;expected_friendship_generation:number};
export type RaceMemberAction=(RaceMemberActionBase&{decision:'accept';acknowledgement_version:1;evidence_consent_version:1})|(RaceMemberActionBase&{decision:'decline'|'withdraw'});
export type AttemptReserve={schema_version:1;action:'attempt_reserve';race_id:string;expected_revision:number;expected_member_generation:number;attempt_id:string;ride_id:string;capture_id:string;platform:NativeRacePlatform;provider:'ios_core_location'|'expo_location';vehicle_local_id:string|null};
export type AttemptArm={schema_version:1;action:'attempt_arm';attempt_id:string;expected_revision:number;stage_proof_id:string;capture_id:string;clock_probe_ids:string[]};
export type AttemptAbort={schema_version:1;action:'attempt_abort';attempt_id:string;expected_revision:number;reason:'user_stop'|'background'|'capture_changed'|'quality'|'storage_error'|'clock_invalid'|'late_start'};
export type RaceReady={schema_version:1;action:'race_ready';race_id:string;expected_revision:number;expected_member_generation:number;expected_ready_revision:number;lobby_epoch:string;attempt_id:string;capture_id:string;stage_proof_id:string;clock_probe_ids:string[]};
export type RaceUnready={schema_version:1;action:'race_unready';race_id:string;expected_member_generation:number;expected_ready_revision:number;expected_ready_lease_id:string};
export type ReadyBinding={user_id:string;member_generation:number;ready_revision:number;ready_lease_id:string;attempt_id:string};
export type RaceSchedule={schema_version:1;action:'race_schedule';race_id:string;expected_revision:number;lobby_epoch:string;ready:ReadyBinding[]};
export type RaceCancel={schema_version:1;action:'race_cancel';race_id:string;expected_revision:number;reason:'user_cancel'};
export type EvidenceBind={schema_version:1;action:'evidence_bind';attempt_id:string;expected_revision:number;capture_id:string;first_sequence:number;last_sequence:number;sample_count:number;byte_length:number;sha256:string};
export type EvidenceQueue={schema_version:1;action:'evidence_queue';attempt_id:string;expected_revision:number;sha256:string};
export type RaceRequest=RaceCreate|RaceMemberAction|AttemptReserve|AttemptArm|AttemptAbort|RaceReady|RaceUnready|RaceSchedule|RaceCancel|EvidenceBind|EvidenceQueue;
export type RaceActivation=AttemptArm|RaceReady|RaceSchedule;
export type RaceOperation={operation_id:string;request:RaceRequest};
export type StoredRaceOperation=RaceOperation&{queued_at:string;last_error:RaceErrorCode|RaceClientErrorCode|null};
export type ApprovalSummary={id:string;route_id:string;route_revision:number;route_geometry_hash:string;config_hash:string;course_id:string;session_id:string;method:'route_time_v1';category:'scooter'|'motorcycle'|'car';starts_at:string;ends_at:string;distance_m:number;maximum_duration_s:number};
export type RaceMember={user_id:string;role:'host'|'member';state:'invited'|'accepted'|'declined'|'withdrawn';member_generation:number;friendship_generation:number|null;profile:{name:string;handle:string;avatar_id:string|null};evidence_consent_version:1|null;consented_at:string|null;ready_revision:number;ready:boolean;ready_until:string|null};
export type SelfReady={revision:number;lease_id:string;attempt_id:string;until:string};
export type SafeRouteSnapshot={route_id:string;revision:number;title:string;category:'scooter'|'motorcycle'|'car';segments:{latitude:number;longitude:number}[][];geometryStatus:'trimmed'|'hidden';privacyTrimMeters:200;geometryHash:string|null;provider:'draft'|'geoapify'|'recorded';attribution:string|null};
export type RaceSnapshot={id:string;creator_id:string;revision:number;mode:RaceMode;metric:'route_time';method:'route_time_v1';state:RaceState;approval:ApprovalSummary;route_summary:{title:string;revision:number;category:string};route_snapshot:SafeRouteSnapshot;starts_at:string;ends_at:string;lobby_epoch:string;common_start_at:string|null;schedule_epoch:string|null;topic:string|null;topic_generation:number;host_lease_until:string|null;self_member:RaceMember;members:RaceMember[];self_ready:SelfReady|null;schedule_ready:ReadyBinding[]|null;updated_at:string;terminal_reason:RaceTerminalReason|null};
export type EvidenceReservation={bucket:'ride-race-evidence';path:string;attempt_id:string;capture_id:string;sha256:string;byte_length:number;first_sequence:number;last_sequence:number;sample_count:number;upload_deadline:string};
export type AttemptSnapshot={id:string;owner_id:string;race_id:string;revision:number;ordinal:number;member_generation:number;approval_id:string;config_hash:string;platform:NativeRacePlatform;provider:'ios_core_location'|'expo_location';ride_id:string;capture_id:string;state:AttemptState;armed_at:string|null;schedule_epoch:string|null;common_start_at:string|null;vehicle:ImmutableVehicleSnapshot|null;evidence:EvidenceReservation|null;rejection_code:RaceEvidenceCode|null;terminal_reason:AttemptTerminalReason|null;terminal_at:string|null;updated_at:string};
export type RaceControlResult=
 |{action:'race_create'|'member_action'|'race_cancel';race:RaceSnapshot}
 |{action:'attempt_reserve'|'attempt_arm'|'attempt_abort';attempt:AttemptSnapshot}
 |{action:'race_ready'|'race_unready';race_id:string;member_generation:number;ready_revision:number;ready_lease_id:string|null;ready_until:string|null;lobby_epoch:string;attempt_id:string|null}
 |{action:'race_schedule';race:RaceSnapshot;common_start_at:string;schedule_epoch:string;scheduled_members:ReadyBinding[]}
 |{action:'evidence_bind';attempt:AttemptSnapshot;reservation:EvidenceReservation}
 |{action:'evidence_queue';attempt:AttemptSnapshot};
export type RaceReceipt={owner_id:string;operation_id:string;request:RaceRequest;applied_at:string;result:RaceControlResult};
export type RaceMutation=RaceReceipt|RaceErrorEnvelope;
export type RaceActivationCancellation={kind:'cancelled';owner_id:string;operation_id:string;request:RaceActivation;cancelled_at:string};
export type RaceCancellationMutation=RaceReceipt|RaceActivationCancellation|RaceErrorEnvelope;
export type RaceCursor={before:string;before_id:string};
export type RacePage={owner_id:string;server_now:string;items:RaceSnapshot[];next_cursor:RaceCursor|null};
export type RaceAttemptPage={owner_id:string;race_id:string;items:AttemptSnapshot[]};
export type ApprovalPage={owner_id:string;server_now:string;items:ApprovalSummary[]};
export type RaceClockProbe={owner_id:string;probe_id:string;race_id:string;capture_id:string;clock_generation:string;server_received_at:string;server_sent_at:string};
export type RaceClockBinding=Pick<RaceClockProbe,'probe_id'|'race_id'|'capture_id'|'clock_generation'>;
export type StageSample={schema_version:1;race_id:string;member_generation:number;attempt_id:string;capture_id:string;lobby_epoch:string;sequence:number;platform:NativeRacePlatform;provider:'ios_core_location'|'expo_location';timestamp_ms:number;received_wall_ms:number;received_monotonic_ms:number;latitude:number;longitude:number;horizontal_accuracy_m:number;is_simulated_by_software:boolean|null;is_produced_by_accessory:boolean|null;mocked:boolean|null};
export type StageProof={owner_id:string;race_id:string;attempt_id:string;capture_id:string;lobby_epoch:string;member_generation:number;sequence:number;proof_id:string;received_at:string;expires_at:string};
export type RaceHeartbeat={owner_id:string;race_id:string;member_generation:number;server_received_at:string;server_sent_at:string;host_lease_until:string|null;ready_revision:number;ready_lease_id:string|null;ready_until:string|null};
export type RaceHeartbeatInput={race_id:string;member_generation:number;ready_lease_id:string|null;attempt_id:string|null;stage_proof_id:string|null;clock_probe_ids:string[]|null};
export type RaceCoordinate={latitude:number;longitude:number};
export type DirectedGate={index:number;kind:'start'|'checkpoint'|'finish';a:RaceCoordinate;b:RaceCoordinate;forward_point:RaceCoordinate;progress_min_m:number;progress_max_m:number};
export type RaceCourseConfiguration={schema_version:1;method:'route_time_v1';origin:RaceCoordinate;route_geometry:RaceCoordinate[];boundary_polygon:RaceCoordinate[];staging_polygon:RaceCoordinate[];gates:DirectedGate[];corridor_half_width_m:number;maximum_speed_mps:number;projection:'wgs84_ecef_enu_v1';geometry_error_margin_m:0.25;maximum_accuracy_m:15;maximum_gap_ms:1500;maximum_crossing_span_ms:3000;maximum_duration_ms:1800000;minimum_duration_ms:10000;maximum_acceleration_mps2:15;maximum_backtrack_m:5;whole_capture_residual_ms:250;server_time_drift_allowance_ms:250;live_start_gate_window_ms:10000};
export type RaceCourseSnapshot={race_id:string;approval_id:string;config_hash:string;route_geometry_hash:string;configuration:RaceCourseConfiguration};
export type RaceInterval={lower_ms:number;upper_ms:number};
export type RaceResult={attempt_id:string;owner_id:string;race_id:string;approval_id:string;config_hash:string;method:'route_time_v1';quality:'native_evidence_consistency';platform:NativeRacePlatform;provenance_unknown:boolean;elapsed_lower_ms:number;elapsed_upper_ms:number;start_interval:RaceInterval;finish_interval:RaceInterval;gate_intervals:(RaceInterval&{index:number})[];distance_m:number;maximum_speed_mps:number|null;average_speed_mps:number;sample_count:number;max_gap_ms:number;evidence_sha256:string;verified_at:string};
export type RaceResultStatus={user_id:string;state:'not_started'|'in_progress'|'processing'|'verified'|'rejected'|'dnf';terminal_reason:AttemptTerminalReason|null};
export type RaceResults={owner_id:string;race_id:string;server_now:string;items:RaceResult[];statuses:RaceResultStatus[]};
export type RaceOwned={operations:StoredRaceOperation[]};
export type RaceLatest={operation_id:string;status:'applied'|'rejected';error:RaceErrorCode|null;receipt:RaceReceipt|null};
export type RaceCoordinatorSnapshot={busy:boolean;pending:StoredRaceOperation[];error:RaceErrorCode|RaceClientErrorCode|null;latest:RaceLatest|null;reviewRequired:string[];retryAfterMs:number|null};
export interface RaceControlPort{ownerId:string;current:()=>boolean;eligible:()=>boolean;read:()=>RaceOwned;update:(reduce:(fresh:RaceOwned)=>RaceOwned)=>Promise<void>;flush:()=>Promise<void>;operationId:()=>string;nowISO:()=>string;monotonicNow:()=>number;send:(op:RaceOperation)=>Promise<RaceMutation>;status:(id:string)=>Promise<RaceReceipt|null>;cancelActivation:(op:RaceOperation)=>Promise<RaceCancellationMutation>;refresh:(receipt:RaceReceipt)=>Promise<void>}
