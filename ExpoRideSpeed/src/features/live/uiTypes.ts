import type {ConvoySnapshot,ConvoySummary,LiveLatest,LiveRequest,StoredLiveOperation,FriendLink,FriendLinkResolution as FriendResolution,ConvoyCodeResolution as CodeResolution,LiveErrorEnvelope,FriendLinkPreview as FriendPreview,ConvoyCodePreview as CodePreview} from './types';

export type FriendLinkRow=FriendLink;
export type IncomingFriendIntent=Readonly<{linkId:string;token:string}>;
export type FriendLinkPreview=FriendPreview;
export type ConvoyCodePreview=CodePreview;
export type FriendLinkResolution=FriendResolution;
export type ConvoyCodeResolution=CodeResolution;
export type LocationGrantReview=Readonly<{roomId:string;roomRevision:number;memberGeneration:number;consentRevision:number;captureId:string}>;
export type ConvoyCreateReview=Readonly<{title:string;routeId:string;routeRevision:number;geometryHash:string|null}>;

/** UI boundary only. The provider repeats Auth, lifecycle, storage and wire checks. */
export interface LiveContextValue {
 ready:boolean;loading:boolean;fresh:boolean;profileReady:boolean;busy:boolean;
 summaries:readonly ConvoySummary[];room:ConvoySnapshot|null;links:readonly FriendLinkRow[];
 pending:readonly StoredLiveOperation[];latest:LiveLatest|null;error:string|null;reviewRequired:readonly string[];
 secretPersistence:'secure'|'session';incomingFriendIntent:IncomingFriendIntent|null;
 consumeIncomingFriendIntent():IncomingFriendIntent|null;
 refresh():Promise<void>;openRoom(id:string):Promise<void>;
 mutate(request:LiveRequest):Promise<string|null>;retry(reviewedOperationId?:string):Promise<void>;
 resolveFriendLink(intent:IncomingFriendIntent):Promise<FriendLinkResolution|LiveErrorEnvelope>;
 resolveCode(code:string):Promise<ConvoyCodeResolution|LiveErrorEnvelope>;
 createFriendLink(ttl:3600|86400):Promise<string|null>;
 createConvoy(review:ConvoyCreateReview):Promise<string|null>;
 rotateCode(room:ConvoySnapshot):Promise<string|null>;
 getFriendLinkUrl(linkId:string):Promise<string|null>;getRoomCode(convoyId:string):Promise<string|null>;
 receiveEnabled:boolean;setReceive(enabled:boolean):void;
 share:Readonly<{armed:boolean;pending:boolean;expiresAt:string|null;error:string|null}>;
 captureReady:boolean;captureId:string|null;ghost:boolean;presenceReady:boolean;
 grantLocation(duration:900|3600,review:LocationGrantReview):Promise<string|null>;
 stopSharing():Promise<void>;
}
