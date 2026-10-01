import type {ApprovalSummary,AttemptSnapshot,FriendBinding,RaceCourseSnapshot,RaceLatest,RaceMode,RaceResults,RaceSnapshot,SafeRouteSnapshot,StoredRaceOperation} from './types';

export type RaceTranslator=(key:string,values?:Record<string,string|number>)=>string;
export type RacePageState={loading:boolean;fresh:boolean;error:string|null;hasMore:boolean};
export type RaceRouteOption={id:string;revision:number;title:string;category:'scooter'|'motorcycle'|'car'};
export type RaceFriendOption=FriendBinding&{name:string;handle:string};
export type RaceCreateSelection={mode:RaceMode;route_id:string;route_revision:number;approval_id:string;starts_at:string;ends_at:string;friends:FriendBinding[]};
export type ReviewedRaceCreation=RaceCreateSelection&{approval:ApprovalSummary;projection:SafeRouteSnapshot;reviewed_projection_hash:string};
export type RaceConsent={acknowledgement_version:1;evidence_consent_version:1};
export type RaceBinding={race_id:string;expected_revision:number;lobby_epoch:string};
export type RaceMemberBinding=RaceBinding&{expected_member_generation:number;expected_friendship_generation:number|null};
export type RaceAttemptBinding={attempt_id:string;expected_revision:number;race_id:string;member_generation:number;capture_id:string};
export type RaceCountdownPresentation={phase:'idle'|'preparing'|'waiting'|'countdown'|'running'|'invalid';secondsRemaining:number|null;uncertaintyMs:number|null;error:string|null;observedMonotonicMs:number|null};
export type RaceScreenGate={signedIn:boolean;profileReady:boolean;native:boolean;foreground:boolean;focused:boolean;moving:boolean;online:boolean};

/** UI only. Parent repeats current AuthScope/CAS/lifecycle guards before and after I/O.
 * Operation IDs mean durably queued; only matching receipt/canonical state means applied.
 * Capture/clock/evidence authority remains entirely in the parent. */
export interface RaceScreenPort{
 ownerId:string|null;generation:string;gate:RaceScreenGate;
 current:(generation:string)=>boolean;
 guard:(generation:string,kind:'read'|'control'|'terminal')=>void;
 ready:boolean;fresh:boolean;loading:boolean;busy:boolean;error:string|null;pilotEnabled:boolean;
 races:RaceSnapshot[];racesPage:RacePageState;
 routes:RaceRouteOption[];routesPage:RacePageState;
 friends:RaceFriendOption[];friendsPage:RacePageState;
 approvals:{route_id:string|null;route_revision:number|null;items:ApprovalSummary[];loading:boolean;fresh:boolean;error:string|null};
 race:RaceSnapshot|null;detailLoading:boolean;detailFresh:boolean;detailError:string|null;
 course:RaceCourseSnapshot|null;courseLoading:boolean;courseError:string|null;
 attempt:AttemptSnapshot|null;results:RaceResults|null;resultsLoading:boolean;resultsFresh:boolean;resultsError:string|null;
 countdown:RaceCountdownPresentation;
 eligibility:{captureReady:boolean;stageReady:boolean;clockReady:boolean;canSchedule:boolean;attemptLimitReached:boolean};
 pending:StoredRaceOperation[];latest:RaceLatest|null;reviewRequired:string[];retryAfterMs:number|null;
 refresh:()=>Promise<void>;loadMore:()=>Promise<void>;loadMoreRoutes:()=>Promise<void>;loadMoreFriends:()=>Promise<void>;
 openRace:(id:string)=>Promise<void>;loadApprovals:(route:RaceRouteOption)=>Promise<void>;
 reviewCreate:(selection:RaceCreateSelection)=>Promise<ReviewedRaceCreation>;
 create:(review:ReviewedRaceCreation,consent:RaceConsent)=>Promise<string|null>;
 memberAction:(binding:RaceMemberBinding,decision:'accept'|'decline'|'withdraw',consent?:RaceConsent)=>Promise<string|null>;
 loadCourse:(binding:RaceMemberBinding)=>Promise<void>;loadResults:(binding:RaceBinding)=>Promise<void>;
 reserve:(binding:RaceMemberBinding,consent:RaceConsent)=>Promise<string|null>;
 arm:(binding:RaceAttemptBinding,consent:RaceConsent)=>Promise<string|null>;
 readyAttempt:(binding:RaceAttemptBinding,consent:RaceConsent)=>Promise<string|null>;
 unready:(binding:RaceMemberBinding)=>Promise<string|null>;
 schedule:(binding:RaceBinding)=>Promise<string|null>;
 cancel:(binding:RaceBinding)=>Promise<string|null>;
 abort:(binding:RaceAttemptBinding)=>Promise<string|null>;
 retry:(reviewedOperationId:string)=>Promise<void>;
 cancelActivation:(operationId:string)=>Promise<void>;
 finishAttempt:(binding:RaceAttemptBinding)=>Promise<string|null>;
 rematch:(binding:RaceBinding)=>Promise<void>;
 onSignIn:()=>void;onEditProfile:()=>void;onBack:()=>void;
}
export type RaceScreenProps={port:RaceScreenPort;t:RaceTranslator};
