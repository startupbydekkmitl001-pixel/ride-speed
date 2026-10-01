import type {RankedCourse,RankedFilter,RankedPage,RankedRow} from './types';
export type RankedTranslator=(key:string,values?:Record<string,string|number>)=>string;
export type RankedReadState=Readonly<{loading:boolean;fresh:boolean;error:string|null;hasMore:boolean}>;
export type RankedRecordBinding=Readonly<{record_id:string;user_id:string;metric:RankedRow['metric'];board_revision:string}>;
/** Parent rechecks the captured account, screen activity and exact record/filter after every IO. */
export interface RankedScreenPort{
 ownerId:string|null;generation:string;current:(generation:string)=>boolean;guard:(generation:string,kind:'read'|'filter'|'navigation'|'publication')=>void;
 gate:{signedIn:boolean;focused:boolean;foreground:boolean;moving:boolean;online:boolean};
 ready:boolean;filter:RankedFilter;page:RankedPage|null;rows:readonly RankedRow[];read:RankedReadState;
 courses:readonly RankedCourse[];coursesRead:RankedReadState;units:'kmh'|'mph';locale:'th'|'en';
 /** Signed deltas only for the same owner+period+filter. A changed filter is not movement. */
 rankChanges:Readonly<Record<string,number>>;
 refresh:()=>Promise<void>;loadMore:()=>Promise<void>;loadMoreCourses:()=>Promise<void>;setFilter:(filter:RankedFilter)=>Promise<void>;
 onSignIn:()=>void;onBack?:()=>void;onManagePublication?:()=>void;
 onReport?:(binding:RankedRecordBinding)=>void;
}
export type RankedScreenProps={port:RankedScreenPort;t:RankedTranslator};
