import {communityFilterKey,freezeCommunityFilter,isCommunityId,validateCommunityComments,validateCommunityDetail,validateCommunityPage} from './model';
import type {CommunityComment,CommunityCommentCursor,CommunityCommentPage,CommunityCursor,CommunityDetail,CommunityFilter,CommunityPage,CommunityPost} from './types';
import type {CommunityPostBinding,CommunityRead} from './uiTypes';

export type CommunityReaderRead=CommunityRead&Readonly<{loaded:boolean}>;
type ReaderPort=Readonly<{ownerId:string;guard:()=>void;monotonicNow:()=>number}>;
export type CommunityReaderPort=ReaderPort&Readonly<{page:(filter:CommunityFilter,cursor:CommunityCursor|null)=>Promise<CommunityPage>}>;
export type CommunityDetailReaderPort=ReaderPort&Readonly<{detail:(postId:string)=>Promise<CommunityDetail>;comments:(postId:string,cursor:CommunityCommentCursor|null)=>Promise<CommunityCommentPage>}>;
export type CommunityReaderSnapshot=Readonly<{filter:CommunityFilter;loaded:boolean;page:CommunityPage|null;rows:readonly CommunityPost[];read:CommunityReaderRead;retryAfterMs:number|null}>;
export type CommunityDetailReaderSnapshot=Readonly<{postId:string|null;loaded:boolean;detail:CommunityDetail|null;read:CommunityReaderRead;comments:readonly CommunityComment[];commentsRead:CommunityReaderRead;commentsLoaded:boolean;retryAfterMs:number|null}>;
const unread=():CommunityReaderRead=>({loaded:false,loading:false,fresh:false,error:null,hasMore:false});
const capacity=300;
const errors=new Set(['ACCOUNT_CHANGED','ACCOUNT_DELETION_PENDING','COMMUNITY_AUTH_REQUIRED','COMMUNITY_PROFILE_REQUIRED','COMMUNITY_CHANGED','COMMUNITY_INVALID_RESPONSE','COMMUNITY_RATE_LIMITED','COMMUNITY_CAPACITY','COMMUNITY_UNAVAILABLE','COMMUNITY_INACTIVE','COMMUNITY_MOVING']);
function code(value:unknown){const message=(value as {message?:unknown}|null)?.message;return typeof message==='string'&&errors.has(message)?message:'COMMUNITY_UNAVAILABLE';}
function rate(value:unknown){const typed=value as {name?:unknown;message?:unknown;retryAfterMs?:unknown}|null;if(typed?.name!=='CommunityServiceError'||typed.message!=='COMMUNITY_RATE_LIMITED')return null;const ms=typed.retryAfterMs;return typeof ms==='number'&&Number.isSafeInteger(ms)&&ms>=1&&ms<=86400000?ms:null;}
function matches(row:CommunityPost,key:CommunityPostBinding){return row.post_id===key.post_id&&row.owner_id===key.owner_id&&row.content_revision===key.content_revision;}

/** A finite owner read cache. Private media authority comes only from current()
 * and is retired synchronously, even before an inactive port can be called. */
export class CommunityReader{
 private state:CommunityReaderSnapshot;private listeners=new Set<()=>void>();private version=0;private requestVersion=0;private closed=false;private cursor:CommunityCursor|null=null;private pages:readonly CommunityPage[]=[];private pending:Promise<void>|null=null;private pendingMore=false;private retryAt=0;
 constructor(private port:CommunityReaderPort,selected:CommunityFilter={schema_version:1,mode:'latest'}){if(!isCommunityId(port.ownerId))throw Error('COMMUNITY_INVALID');this.state={filter:freezeCommunityFilter(selected),loaded:false,page:null,rows:[],read:unread(),retryAfterMs:null};}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private publish(patch:Partial<CommunityReaderSnapshot>){this.state={...this.state,...patch};for(const fn of this.listeners)fn();}
 private guard(version=this.version,request?:number){if(this.closed||version!==this.version||request!==undefined&&request!==this.requestVersion)throw Error('COMMUNITY_CHANGED');this.port.guard();}
 private now(){const value=this.port.monotonicNow();if(!Number.isFinite(value)||value<0)throw Error('COMMUNITY_CHANGED');return value;}
 private allowed(){const remaining=this.retryAt-this.now();if(remaining>0){this.publish({retryAfterMs:remaining});return false;}if(this.state.retryAfterMs!==null)this.publish({retryAfterMs:null});return true;}
 private wait(error:unknown){const ms=rate(error);if(ms!==null){this.retryAt=Math.max(this.retryAt,this.now()+ms);this.publish({retryAfterMs:this.retryAt-this.now()});}}
 private retire(){++this.version;++this.requestVersion;this.pending=null;this.pages=[];}
 invalidate(){if(this.closed)return;this.retire();this.cursor=null;this.publish({loaded:false,page:null,rows:[],read:unread()});}
 suspend(){if(this.closed)return;this.retire();this.publish({read:{...this.state.read,loading:false,fresh:false}});}
 close(){if(this.closed)return;this.invalidate();this.closed=true;this.listeners.clear();}
 current(binding:CommunityPostBinding){return this.sourcePost(binding)!==null;}
 sourcePost(binding:CommunityPostBinding):CommunityPost|null{try{this.guard();if(!this.state.read.fresh||this.state.read.error)return null;return this.state.rows.find(row=>matches(row,binding))??null;}catch{return null;}}
 sourcePage(binding:CommunityPostBinding):CommunityPage|null{if(!this.current(binding))return null;return this.pages.find(page=>page.items.some(row=>matches(row,binding)))??null;}
 async setFilter(selected:CommunityFilter){this.guard();const filter=freezeCommunityFilter(selected);if(communityFilterKey(filter)===communityFilterKey(this.state.filter))return;this.invalidate();this.publish({filter});await this.refresh();}
 refresh=()=>this.read(false);
 loadMore=()=>this.read(true);
 private read(more:boolean):Promise<void>{
  try{this.guard();}catch(error){return Promise.reject(error);}
  if(this.pending&&(more||!this.pendingMore))return this.pending;
  if(!this.allowed()||more&&(!this.state.read.fresh||!this.cursor))return Promise.resolve();
  const version=this.version,request=++this.requestVersion,filter=this.state.filter,cursor=more?this.cursor:null;
  this.publish({read:{...this.state.read,loading:true,error:null,...(!more?{fresh:false}:{})}});
  const run=async()=>{try{
   this.guard(version,request);const raw=await this.port.page(filter,cursor);this.guard(version,request);
   const page=validateCommunityPage(raw,this.port.ownerId,filter,cursor),prior=more?this.state.rows:[],seen=new Set(prior.map(row=>row.post_id));
   if(page.items.some(row=>seen.has(row.post_id)))throw Error('COMMUNITY_CHANGED');
   const rows=Object.freeze([...prior,...page.items]);if(rows.length>capacity)throw Error('COMMUNITY_CAPACITY');
   this.pages=more?[...this.pages,page]:[page];this.cursor=page.next_cursor;
   this.publish({loaded:true,page,rows,read:{loaded:true,loading:false,fresh:true,error:null,hasMore:!!this.cursor},retryAfterMs:null});
  }catch(error){try{
   this.guard(version,request);this.wait(error);const failure=code(error);
   if(more&&failure==='COMMUNITY_CHANGED'){
    this.cursor=null;this.pages=[];this.pending=null;
    this.publish({page:null,rows:[],read:{...this.state.read,loading:false,fresh:false,error:failure,hasMore:false}});
    // One canonical first-page attempt; its failure is not recursively retried.
    await this.read(false);
   }else this.publish({read:{...this.state.read,loading:false,fresh:false,error:failure}});
  }catch{/* Retired owner/activity replies cannot change even error state. */}}
  finally{if(this.pending===promise)this.pending=null;}};
  const promise=Promise.resolve().then(run);this.pending=promise;this.pendingMore=more;return promise;
 }
}

/** Detail and child comments share an exact selected parent/content revision.
 * A detail getter or mutation receipt cannot stand in for a child page. */
export class CommunityDetailReader{
 private state:CommunityDetailReaderSnapshot={postId:null,loaded:false,detail:null,read:unread(),comments:[],commentsRead:unread(),commentsLoaded:false,retryAfterMs:null};private listeners=new Set<()=>void>();private version=0;private detailVersion=0;private commentsVersion=0;private closed=false;private cursor:CommunityCommentCursor|null=null;private refreshing:Promise<void>|null=null;private more:Promise<void>|null=null;private retryAt=0;
 constructor(private port:CommunityDetailReaderPort){if(!isCommunityId(port.ownerId))throw Error('COMMUNITY_INVALID');}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private publish(patch:Partial<CommunityDetailReaderSnapshot>){this.state={...this.state,...patch};for(const fn of this.listeners)fn();}
 private guard(version=this.version){if(this.closed||version!==this.version)throw Error('COMMUNITY_CHANGED');this.port.guard();}
 private now(){const value=this.port.monotonicNow();if(!Number.isFinite(value)||value<0)throw Error('COMMUNITY_CHANGED');return value;}
 private allowed(){const remaining=this.retryAt-this.now();if(remaining>0){this.publish({retryAfterMs:remaining});return false;}if(this.state.retryAfterMs!==null)this.publish({retryAfterMs:null});return true;}
 private wait(error:unknown){const ms=rate(error);if(ms!==null){this.retryAt=Math.max(this.retryAt,this.now()+ms);this.publish({retryAfterMs:this.retryAt-this.now()});}}
 private retire(){++this.version;++this.detailVersion;++this.commentsVersion;this.refreshing=null;this.more=null;this.cursor=null;}
 invalidate(){if(this.closed)return;this.retire();this.publish({loaded:false,detail:null,read:unread(),comments:[],commentsRead:unread(),commentsLoaded:false});}
 suspend(){this.invalidate();}
 close(){if(this.closed)return;this.invalidate();this.closed=true;this.listeners.clear();}
 current(binding:CommunityPostBinding){return this.sourcePost(binding)!==null;}
 sourcePost(binding:CommunityPostBinding):CommunityPost|null{try{this.guard();const row=this.state.detail?.post;return this.state.read.fresh&&!this.state.read.error&&row&&matches(row,binding)?row:null;}catch{return null;}}
 async select(postId:string){this.guard();if(!isCommunityId(postId))throw Error('COMMUNITY_INVALID');if(this.state.postId!==postId){this.invalidate();this.publish({postId});}await this.refresh();}
 refresh=():Promise<void>=>{
  try{this.guard();}catch(error){return Promise.reject(error);}
  if(this.refreshing)return this.refreshing;
  if(!this.state.postId||!this.allowed())return Promise.resolve();
  const version=this.version,detailVersion=++this.detailVersion,postId=this.state.postId;++this.commentsVersion;this.more=null;this.cursor=null;
  this.publish({read:{...this.state.read,loading:true,fresh:false,error:null},comments:[],commentsRead:{...this.state.commentsRead,loading:false,fresh:false,error:null,hasMore:false}});
  const run=async()=>{try{
   this.guard(version);const raw=await this.port.detail(postId);this.guard(version);if(detailVersion!==this.detailVersion)return;
   const detail=validateCommunityDetail(raw,this.port.ownerId,postId);
   this.publish({loaded:true,detail,read:{loaded:true,loading:false,fresh:true,error:null,hasMore:false},retryAfterMs:null});
   await this.readComments(false,version,detailVersion);
  }catch(error){try{this.guard(version);if(detailVersion!==this.detailVersion)return;this.wait(error);this.publish({read:{...this.state.read,loading:false,fresh:false,error:code(error)}});}catch{/* Old private parent is not adopted. */}}
  finally{if(this.refreshing===promise)this.refreshing=null;}};
  const promise=Promise.resolve().then(run);this.refreshing=promise;return promise;
 };
 loadMoreComments=():Promise<void>=>{
  try{this.guard();}catch(error){return Promise.reject(error);}
  if(this.refreshing)return this.refreshing;if(this.more)return this.more;
  if(!this.state.read.fresh||!this.state.commentsRead.fresh||!this.cursor||!this.allowed())return Promise.resolve();
  return this.readComments(true,this.version,this.detailVersion);
 };
 private readComments(append:boolean,version:number,detailVersion:number):Promise<void>{
  const parent=this.state.detail?.post;if(!parent||!this.state.read.fresh)return Promise.resolve();
  if(!this.allowed())return Promise.resolve();const request=++this.commentsVersion,cursor=append?this.cursor:null,postId=parent.post_id,revision=parent.content_revision;
  this.publish({commentsRead:{...this.state.commentsRead,loading:true,error:null,...(!append?{fresh:false}:{})}});
  const current=()=>{this.guard(version);if(request!==this.commentsVersion||detailVersion!==this.detailVersion||!this.state.read.fresh||this.state.detail?.post.post_id!==postId||this.state.detail.post.content_revision!==revision)throw Error('COMMUNITY_CHANGED');};
  const run=async()=>{try{
   current();const raw=await this.port.comments(postId,cursor);current();const page=validateCommunityComments(raw,this.port.ownerId,postId,cursor);
   if(page.content_revision!==revision)throw Error('COMMUNITY_CHANGED');
   const prior=append?this.state.comments:[],seen=new Set(prior.map(row=>row.comment_id));if(page.items.some(row=>seen.has(row.comment_id)))throw Error('COMMUNITY_CHANGED');
   const comments=Object.freeze([...prior,...page.items]);if(comments.length>capacity)throw Error('COMMUNITY_CAPACITY');this.cursor=page.next_cursor;
   this.publish({comments,commentsLoaded:true,commentsRead:{loaded:true,loading:false,fresh:true,error:null,hasMore:!!this.cursor},retryAfterMs:null});
  }catch(error){try{
   current();this.wait(error);const failure=code(error);
   if(failure==='COMMUNITY_CHANGED'){this.cursor=null;this.publish({detail:null,read:{...this.state.read,fresh:false,error:failure},comments:[],commentsRead:{...this.state.commentsRead,loading:false,fresh:false,error:failure,hasMore:false}});}
   else this.publish({commentsRead:{...this.state.commentsRead,loading:false,fresh:false,error:failure}});
  }catch{/* Held child pages cannot revive a changed/retired parent. */}}
  finally{if(this.more===promise)this.more=null;}};
  const promise=Promise.resolve().then(run);if(append)this.more=promise;return promise;
 }
}
