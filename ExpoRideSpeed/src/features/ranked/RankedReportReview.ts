import {freezeRankedFilter,rankedFilterKey,validateRankedPage} from './model';
import type {RankedCursor,RankedFilter,RankedPage,RankedReportRequest,RankedRow} from './types';
type Target=Readonly<{token:string;row:RankedRow}>;
export interface RankedReportReviewPort{ownerId:string;guard:()=>void;token:()=>string;page:(filter:RankedFilter,cursor:RankedCursor|null)=>Promise<RankedPage>}
/** A route carries one opaque token. Record authority stays in owner memory and
 * is re-read from the same real board before a report can be queued. */
export class RankedReportReview{
 private target:Target|null=null;private filter:RankedFilter|null=null;private version=0;private reviewed=false;private closed=false;private listeners=new Set<()=>void>();
 constructor(private port:RankedReportReviewPort){}
 getSnapshot=()=>this.target;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 private notify(){for(const fn of this.listeners)fn();}
 private guard(version=this.version){if(this.closed||version!==this.version)throw Error('RANKED_CHANGED');this.port.guard();}
 arm(page:RankedPage,recordId:string,userId:string):string{
  this.guard();const checked=validateRankedPage(page,this.port.ownerId,page.filter);
  const row=[...checked.items,...checked.podium,...(checked.self?[checked.self]:[])].find(r=>r.record_id===recordId&&r.user_id===userId);
  if(!row)throw Error('RANKED_RECORD_UNAVAILABLE');
  ++this.version;this.reviewed=false;this.filter=freezeRankedFilter(checked.filter);const token=this.port.token();
  this.target=Object.freeze({token,row});this.notify();return token;
 }
 current(token:string){try{this.guard();return this.target?.token===token;}catch{return false;}}
 clear(token?:string){if(token!==undefined&&this.target?.token!==token)return;++this.version;this.target=null;this.filter=null;this.reviewed=false;this.notify();}
 close(){this.clear();this.closed=true;this.listeners.clear();}
 assertReviewed(request:RankedReportRequest){this.guard();const row=this.target?.row;if(!this.reviewed||!row||request.record_id!==row.record_id||request.metric!==row.metric)throw Error('RANKED_CHANGED');}
 async review(token:string):Promise<RankedRow|null>{
  this.guard();if(!this.target||token!==this.target.token||!this.filter)throw Error('RANKED_CHANGED');
  const version=this.version,target=this.target,filter=this.filter;this.reviewed=false;let cursor:RankedCursor|null=null;
  for(let count=0;count<34;count++){
   this.guard(version);const value=await this.port.page(filter,cursor);this.guard(version);
   const page=validateRankedPage(value,this.port.ownerId,filter,cursor);
   if(rankedFilterKey(page.filter)!==rankedFilterKey(filter))throw Error('RANKED_CHANGED');
   const row=[...page.items,...page.podium,...(page.self?[page.self]:[])].find(r=>r.record_id===target.row.record_id&&r.user_id===target.row.user_id&&r.metric===target.row.metric);
   if(row){this.target=Object.freeze({token,row});this.reviewed=true;this.notify();return row;}
   if(!page.next_cursor)break;cursor=page.next_cursor;
  }
  this.guard(version);this.clear(token);return null;
 }
}
