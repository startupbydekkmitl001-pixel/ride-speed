import type {CommunityComment,CommunityDetail,CommunityFilter,CommunityLatest,CommunityMedia,CommunityPage,CommunityPost,CommunityPublicationDocument,CommunityRequest,CommunityRideBinding,CommunityRideSnapshot,CommunityRouteBinding,CommunityRouteSnapshot,CommunityStoredOperation,CommunityVerifiedMedia} from './types';
export type CommunityTranslator=(key:string,values?:Record<string,string|number>)=>string;
export type CommunityRead=Readonly<{loading:boolean;fresh:boolean;error:string|null;hasMore:boolean}>;
export type CommunityPostBinding=Readonly<{post_id:string;owner_id:string;content_revision:number}>;
export type CommunityMediaBinding=CommunityPostBinding&Readonly<{media_id:string;sha256:string|null}>;
export type CommunityGuard='read'|'edit'|'control'|'navigation';
export interface CommunityBasePort{
 ownerId:string|null;generation:string;current:(generation:string)=>boolean;guard:(generation:string,kind:CommunityGuard)=>void;
 gate:Readonly<{signedIn:boolean;profileReady:boolean;focused:boolean;foreground:boolean;moving:boolean;online:boolean}>;
 ready:boolean;units:'kmh'|'mph';locale:'th'|'en';pending:readonly CommunityStoredOperation[];latest:CommunityLatest|null;busy:boolean;
 mutate:(request:CommunityRequest)=>Promise<string|null>;retry:(operationId?:string)=>Promise<void>;
 onSignIn:()=>void;
}
export interface CommunityPostActions extends CommunityBasePort{
 read:CommunityRead;
 /** Parent hides a blocked/removed or superseded row synchronously, before waiting for another read. */
 postCurrent:(binding:CommunityPostBinding)=>boolean;
 getMediaURL:(binding:CommunityMediaBinding,refresh?:boolean)=>Promise<string|null>;
 onOpenPost:(binding:CommunityPostBinding)=>void;
 onOpenRoute:(binding:CommunityPostBinding)=>void;
 onShare:(binding:CommunityPostBinding)=>Promise<void>;
 blockAuthor:(binding:CommunityPostBinding)=>Promise<string|null>;
}
export interface CommunityFeedPort extends CommunityPostActions{
 filter:CommunityFilter;page:CommunityPage|null;rows:readonly CommunityPost[];read:CommunityRead;
 refresh:()=>Promise<void>;loadMore:()=>Promise<void>;setFilter:(filter:CommunityFilter)=>Promise<void>;onCompose:()=>void;
}
export interface CommunityDetailPort extends CommunityPostActions{
 detail:CommunityDetail|null;read:CommunityRead;comments:readonly CommunityComment[];commentsRead:CommunityRead;
 refresh:()=>Promise<void>;loadMoreComments:()=>Promise<void>;commentUUID:()=>string;onBack:()=>void;
}
export type CommunityDraftPhoto=Readonly<{media_id:string;previewUri:string|null;descriptor:CommunityVerifiedMedia|null;state:'local'|'uploading'|'validating'|'ready'|'error';progress:number|null;error:string|null}>;
export type CommunityComposerDraft=Readonly<{draft_id:string;revision:number;document:CommunityPublicationDocument;photos:readonly CommunityDraftPhoto[];status:'local'|'preparing'|'pending'|'published';operationId:string|null;error:string|null}>;
/** Owner-only chooser statistics are real, but the canonical review supplies the immutable digest. */
export type CommunityRideChoice=Readonly<{binding:CommunityRideBinding;summary:Omit<CommunityRideSnapshot,'summary_hash'>}>;
export type CommunityRouteChoice=Readonly<{binding:CommunityRouteBinding;title:string;category:Exclude<CommunityRouteSnapshot['category'],null>}>;
export type CommunityPublishReview=Readonly<{review_id:string;draft_id:string;draft_revision:number;post_id:string;expected_revision:number;document:CommunityPublicationDocument;ride:CommunityRideSnapshot|null;route:CommunityRouteSnapshot|null;media:readonly CommunityVerifiedMedia[]}>;
export type CommunityDraftPatch=Partial<Pick<CommunityPublicationDocument,'caption'|'description'|'visibility'|'ride'|'route'|'include_ride_route'>>;
/** Review/upload can finish without publishing. Publish first persists the exact frozen operation. */
export interface CommunityComposerPort extends CommunityBasePort{
 draft:CommunityComposerDraft;rides:readonly CommunityRideChoice[];routes:readonly CommunityRouteChoice[];ridesRead:CommunityRead;routesRead:CommunityRead;
 changeDraft:(patch:CommunityDraftPatch)=>Promise<boolean>;choosePhotos:()=>Promise<void>;removePhoto:(mediaId:string)=>Promise<void>;movePhoto:(mediaId:string,direction:-1|1)=>Promise<void>;
 refreshChoices:()=>Promise<void>;loadMoreRides:()=>Promise<void>;loadMoreRoutes:()=>Promise<void>;
 reviewPublish:()=>Promise<CommunityPublishReview>;publish:(review:CommunityPublishReview)=>Promise<string|null>;
 onClose:()=>void;
 onOpenPublished?:()=>void;
}
export type CommunityFeedProps={port:CommunityFeedPort;t:CommunityTranslator;headerAccessory?:import('react').ReactNode};
export type CommunityDetailProps={port:CommunityDetailPort;t:CommunityTranslator};
export type CommunityComposerProps={port:CommunityComposerPort;t:CommunityTranslator};
export type CommunityMediaProps={post:CommunityPost;media:CommunityMedia;port:CommunityPostActions;t:CommunityTranslator;visible:boolean;onOpen?:()=>void};
export const communityPostBinding=(post:CommunityPost):CommunityPostBinding=>({post_id:post.post_id,owner_id:post.owner_id,content_revision:post.content_revision});
