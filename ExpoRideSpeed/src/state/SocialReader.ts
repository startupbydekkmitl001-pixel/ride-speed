import type { BlockedCursor, BlockedPage, BlockedPerson, FriendRow, InvitationCursor, InvitationPage, InvitationRow, SocialCursor, SocialPage, StatusRow } from '../features/social/types';

export type SocialPageState = {loading:boolean;error:string|null;hasMore:boolean};
type Bucket = 'friends'|'blocked'|'invitations';
export type SocialReadSnapshot = {
 loaded:boolean;loading:boolean;fresh:boolean;self:SocialPage['self']|null;
 friends:FriendRow[];statuses:StatusRow[];blocked:BlockedPerson[];invitations:InvitationRow[];
 serverNow:string|null;serverAnchorAt:number;receivedAt:number;error:string|null;
 pages:Record<Bucket,SocialPageState>;
};
type Port = {
 guard():void;now():number;
 social(cursor:SocialCursor|null):Promise<SocialPage>;
 blocked(cursor:BlockedCursor|null):Promise<BlockedPage>;
 invitations(cursor:InvitationCursor|null):Promise<InvitationPage>;
};
const page = ():SocialPageState=>({loading:false,error:null,hasMore:false});
const blank = ():SocialReadSnapshot=>({loaded:false,loading:false,fresh:false,self:null,friends:[],statuses:[],blocked:[],invitations:[],serverNow:null,serverAnchorAt:0,receivedAt:0,error:null,pages:{friends:page(),blocked:page(),invitations:page()}});
const errorCode=(error:unknown)=>error instanceof Error&&/^(SOCIAL_|ACCOUNT_|PROFILE_|LOCAL_)[A-Z_]+$/.test(error.message)?error.message:'SOCIAL_UNAVAILABLE';
const mergeById=<T>(older:T[],newer:T[],key:(item:T)=>string):T[]=>[...new Map([...older,...newer].map(item=>[key(item),item])).values()];

/** Owns paged reads only. A failed or stale read never creates an absent profile. */
export class SocialReader {
 private value=blank();private listeners=new Set<()=>void>();private closed=false;
 private generation=0;private refreshing:Promise<void>|null=null;
 private cursors:{friends:SocialCursor|null;blocked:BlockedCursor|null;invitations:InvitationCursor|null}={friends:null,blocked:null,invitations:null};
 private blockedLoaded=false;private more=new Map<Bucket,Promise<void>>();
 constructor(private port:Port){}
 getSnapshot=()=>this.value;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 close(){this.closed=true;++this.generation;this.listeners.clear();}
 suspend(){if(this.closed)return;try{this.current();++this.generation;this.refreshing=null;this.more.clear();this.publish({loading:false,fresh:false,statuses:[],pages:{friends:{...this.value.pages.friends,loading:false},blocked:{...this.value.pages.blocked,loading:false},invitations:{...this.value.pages.invitations,loading:false}}});}catch{}}
 private current(generation=this.generation){if(this.closed)throw Error('ACCOUNT_CHANGED');this.port.guard();if(generation!==this.generation)throw Error('ACCOUNT_CHANGED');}
 private publish(patch:Partial<SocialReadSnapshot>){this.current();this.value={...this.value,...patch};this.listeners.forEach(listener=>listener());}
 private updatePage(bucket:Bucket,patch:Partial<SocialPageState>){this.publish({pages:{...this.value.pages,[bucket]:{...this.value.pages[bucket],...patch}}});}
 invalidateStatuses(){if(this.closed)return;try{this.publish({fresh:false,statuses:[]});}catch{}}
 prunePeer(id:string){if(this.closed)return;try{this.suspend();this.publish({friends:this.value.friends.filter(row=>row.user_id!==id),statuses:this.value.statuses.filter(row=>row.user_id!==id),invitations:this.value.invitations.filter(row=>row.creator_id!==id)});}catch{}}
 refresh=():Promise<void>=>{
  if(this.refreshing)return this.refreshing;
  try{this.current();}catch{return Promise.resolve();}
  const generation=++this.generation;this.more.clear();this.publish({loading:true});
  const buckets:Bucket[]=this.blockedLoaded?['friends','invitations','blocked']:['friends','invitations'];
  buckets.forEach(bucket=>this.updatePage(bucket,{loading:true,error:null}));
  const pending=(async()=>{
   const results=await Promise.allSettled(buckets.map(bucket=>{const anchor=this.port.now();return Promise.resolve().then(()=>{this.current(generation);return this.fetch(bucket,null);}).then(result=>({result,anchor}));}));
   try{this.current(generation);}catch{return;}
   results.forEach((result,index)=>{
    const bucket=buckets[index];
    if(result.status==='fulfilled')this.adopt(bucket,result.value.result,false,result.value.anchor);
    else{const error=errorCode(result.reason);this.updatePage(bucket,{loading:false,error});if(bucket==='friends')this.publish({fresh:false,statuses:[],error});}
   });
   this.publish({loading:false});
  })().finally(()=>{if(this.refreshing===pending)this.refreshing=null;});
  this.refreshing=pending;return pending;
 };
 private fetch(bucket:Bucket,cursor:SocialCursor|BlockedCursor|InvitationCursor|null):Promise<SocialPage|BlockedPage|InvitationPage>{
  if(bucket==='friends')return this.port.social(cursor as SocialCursor|null);
  if(bucket==='blocked')return this.port.blocked(cursor as BlockedCursor|null);
  return this.port.invitations(cursor as InvitationCursor|null);
 }
 private adopt(bucket:Bucket,result:SocialPage|BlockedPage|InvitationPage,append:boolean,anchor:number){
  this.current();
  if(bucket==='friends'){
   const next=result as SocialPage;
   const friends=append?mergeById(this.value.friends,next.items,row=>row.user_id):next.items;
   const accepted=new Set(friends.filter(row=>row.state==='accepted').map(row=>row.user_id));
   const statuses=(append?mergeById(this.value.statuses,next.statuses,row=>row.user_id):next.statuses).filter(row=>accepted.has(row.user_id));
   this.cursors.friends=next.next_cursor;
   // Request-start anchoring is conservative: network/batch delays consume TTL.
   this.publish({loaded:true,fresh:true,self:next.self,friends,statuses,serverNow:next.server_now,serverAnchorAt:anchor,receivedAt:this.port.now(),error:null});
  }else if(bucket==='blocked'){
   const next=result as BlockedPage;this.blockedLoaded=true;this.cursors.blocked=next.next_cursor;
   this.publish({blocked:append?mergeById(this.value.blocked,next.items,row=>row.user_id):next.items});
  }else{
   const next=result as InvitationPage;this.cursors.invitations=next.next_cursor;
   this.publish({invitations:append?mergeById(this.value.invitations,next.items,row=>row.id):next.items});
  }
  this.updatePage(bucket,{loading:false,error:null,hasMore:this.cursors[bucket]!==null});
 }
 private loadMore(bucket:Bucket):Promise<void>{
  const previous=this.more.get(bucket);if(previous)return previous;
  try{this.current();}catch{return Promise.resolve();}
  if(this.refreshing)return this.refreshing;
  const first=bucket==='blocked'&&!this.blockedLoaded,cursor=this.cursors[bucket];
  if(!first&&!cursor)return Promise.resolve();
  const generation=this.generation,anchor=this.port.now();this.updatePage(bucket,{loading:true,error:null});
  const pending=(async()=>{
   try{const result=await this.fetch(bucket,first?null:cursor);this.current(generation);this.adopt(bucket,result,!first,anchor);}
   catch(error){try{this.current(generation);this.updatePage(bucket,{loading:false,error:errorCode(error)});if(bucket==='friends')this.publish({fresh:false,statuses:[]});}catch{}}
  })().finally(()=>{if(this.more.get(bucket)===pending)this.more.delete(bucket);});
  this.more.set(bucket,pending);return pending;
 }
 loadMoreFriends=()=>this.loadMore('friends');
 loadMoreBlocked=()=>this.loadMore('blocked');
 loadMoreInvitations=()=>this.loadMore('invitations');
}
