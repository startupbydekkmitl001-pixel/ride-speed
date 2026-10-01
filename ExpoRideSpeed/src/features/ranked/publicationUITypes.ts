import type {RankedOwnerRead,RankedOwnerSnapshot} from './RankedOwnerReader';
import type {StoredRankedOperation} from './publicationModel';
import type {RankedPublication,RankedPublicationRequest,RankedReportRequest,RankedRow} from './types';
export type PublicationTranslator=(key:string,values?:Record<string,string|number>)=>string;
export type PublicationGate=Readonly<{signedIn:boolean;active:boolean;moving:boolean;online:boolean}>;
export interface PublicationBasePort{generation:string;current:(generation:string)=>boolean;guard:(generation:string)=>void;gate:PublicationGate;ready:boolean;pending:readonly StoredRankedOperation[];latest:Readonly<{operation_id:string;status:'applied'|'rejected';error:string|null}>|null;error:string|null;retry:()=>Promise<void>;onBack:()=>void;onSignIn:()=>void}
export interface RankedPublicationPort extends PublicationBasePort{state:RankedOwnerSnapshot;refresh:()=>Promise<void>;loadMoreCandidates:()=>Promise<void>;loadMoreSettings:()=>Promise<void>;select:(metric:RankedPublication['metric'],id:string)=>Promise<void>;reviewPublication:()=>Promise<RankedPublication>;currentPublication:(value:RankedPublication)=>boolean;publish:(request:RankedPublicationRequest)=>Promise<string|null>}
export interface RankedReportPort extends PublicationBasePort{target:Readonly<{token:string;row:RankedRow}>|null;review:(token:string)=>Promise<RankedRow|null>;currentTarget:(token:string)=>boolean;report:(request:RankedReportRequest)=>Promise<string|null>}
export type {RankedOwnerRead};
