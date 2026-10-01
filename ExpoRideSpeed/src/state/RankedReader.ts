import {freezeRankedFilter,rankedFilterKey} from '../features/ranked/model';
import type {RankedCourse,RankedCourseCursor,RankedCoursePage,RankedCursor,RankedFilter,RankedPage,RankedRow} from '../features/ranked/types';
import type {RankedReadState} from '../features/ranked/uiTypes';
export interface RankedReadPort{
 guard:()=>void;monotonicNow:()=>number;
 page:(filter:RankedFilter,cursor:RankedCursor|null)=>Promise<RankedPage>;
 courses:(cursor:RankedCourseCursor|null)=>Promise<RankedCoursePage>;
}
type Snapshot=Readonly<{filter:RankedFilter;loaded:boolean;page:RankedPage|null;rows:readonly RankedRow[];read:RankedReadState;courses:readonly RankedCourse[];coursesRead:RankedReadState;rankChanges:Readonly<Record<string,number>>}>;
const blankRead=():RankedReadState=>({loading:false,fresh:false,error:null,hasMore:false});
/** Scoped, finite reads. A cache is presentation only, never rank authority. */
export class RankedReader{
 private state:Snapshot;private version=0;private closed=false;private listeners=new Set<()=>void>();
 private cursor:RankedCursor|null=null;private courseCursor:RankedCourseCursor|null=null;private retryAt=0;
 private sourcePages:RankedPage[]=[];
 constructor(private port:RankedReadPort,filter:RankedFilter){this.state={filter:freezeRankedFilter(filter),loaded:false,page:null,rows:[],read:blankRead(),courses:[],coursesRead:blankRead(),rankChanges:{}};}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private guard(v=this.version){this.port.guard();if(this.closed||v!==this.version)throw Error('RANKED_CHANGED');}
 private publish(patch:Partial<Snapshot>){if(this.closed)return;this.state={...this.state,...patch};for(const listener of this.listeners)listener();}
 private error(error:unknown){const code=error instanceof Error?error.message:'';return ['RANKED_INVALID','RANKED_INVALID_RESPONSE','RANKED_AUTH_REQUIRED','RANKED_PROFILE_REQUIRED','RANKED_CHANGED','RANKED_COURSE_UNAVAILABLE','RANKED_RATE_LIMITED','ACCOUNT_DELETION_PENDING'].includes(code)?code:'RANKED_UNAVAILABLE';}
 private wait(error:unknown){if(error instanceof Error&&error.message==='RANKED_RATE_LIMITED'){const ms=(error as Error&{retryAfterMs?:number|null}).retryAfterMs;this.retryAt=this.port.monotonicNow()+(typeof ms==='number'&&Number.isFinite(ms)&&ms>0?Math.min(ms,86400000):60000);}}
 suspend(){++this.version;this.publish({read:{...this.state.read,loading:false,fresh:false},coursesRead:{...this.state.coursesRead,loading:false,fresh:false}});}
 close(){this.suspend();this.closed=true;this.listeners.clear();}
 /** Only an exact row in the current authoritative board can open a report. */
 sourcePage(recordId:string,userId:string):RankedPage|null{this.guard();if(!this.state.read.fresh)return null;return this.sourcePages.find(p=>p.board_revision===this.state.page?.board_revision&&[...p.items,...p.podium,...(p.self?[p.self]:[])].some(r=>r.record_id===recordId&&r.user_id===userId))??null;}
 invalidate(){++this.version;this.cursor=null;this.sourcePages=[];this.publish({loaded:false,page:null,rows:[],read:{...blankRead(),error:'RANKED_CHANGED'},rankChanges:{}});}
 async setFilter(value:RankedFilter){this.guard();const filter=freezeRankedFilter(value);if(rankedFilterKey(filter)===rankedFilterKey(this.state.filter))return;
  ++this.version;this.cursor=null;this.sourcePages=[];this.publish({filter,loaded:false,page:null,rows:[],read:blankRead(),rankChanges:{}});await this.refresh();
 }
 refresh=()=>this.read(false);
 loadMore=()=>this.read(true);
 private async read(more:boolean){const v=this.version,filter=this.state.filter;
  try{
   this.guard(v);if(this.state.read.loading||this.port.monotonicNow()<this.retryAt||more&&(!this.state.read.fresh||!this.cursor))return;
   const cursor=more?this.cursor:null;this.publish({read:{...this.state.read,loading:true,error:null}});
   const page=await this.port.page(filter,cursor);this.guard(v);
   if(page.owner_id!==this.state.page?.owner_id&&more||rankedFilterKey(page.filter)!==rankedFilterKey(filter)||more&&page.board_revision!==this.state.page?.board_revision)throw Error('RANKED_CHANGED');
   const rows=more?[...this.state.rows,...page.items]:page.items;
   if(rows.length>1000||new Set(rows.map(row=>row.user_id)).size!==rows.length||new Set(rows.map(row=>row.record_id)).size!==rows.length)throw Error('RANKED_CHANGED');
   const previous=this.state.page,changes:Record<string,number>={};
   if(!more&&previous&&previous.owner_id===page.owner_id&&rankedFilterKey(previous.filter)===rankedFilterKey(filter)&&Date.parse(previous.period.starts_at)===Date.parse(page.period.starts_at)&&Date.parse(previous.period.ends_at)===Date.parse(page.period.ends_at)){
    const old=new Map([...this.state.rows,...(previous.self?[previous.self]:[])].map(row=>[row.user_id,row.rank]));
    for(const row of [...rows,...(page.self?[page.self]:[])]){const before=old.get(row.user_id);if(before!==undefined&&before!==row.rank)changes[row.record_id]=before-row.rank;}
   }
   this.sourcePages=more?[...this.sourcePages,page]:[page];this.cursor=page.next_cursor;this.publish({loaded:true,page,rows,read:{loading:false,fresh:true,error:null,hasMore:!!this.cursor},rankChanges:more?this.state.rankChanges:changes});
  }catch(error){try{
   this.guard(v);this.wait(error);const code=this.error(error);if(code==='RANKED_CHANGED')this.cursor=null;
   this.publish({read:{...this.state.read,loading:false,fresh:false,error:code,hasMore:code==='RANKED_CHANGED'?false:this.state.read.hasMore},rankChanges:{}});
   // One fresh first page after a stale cursor. Never recurse on its failure.
   if(more&&code==='RANKED_CHANGED')await this.read(false);
  }catch{/* A held retired read cannot publish. */}}
 }
 async loadCourses(more=false){const v=this.version;
  try{
   this.guard(v);if(this.state.coursesRead.loading||this.port.monotonicNow()<this.retryAt||more&&(!this.state.coursesRead.fresh||!this.courseCursor))return;
   this.publish({coursesRead:{...this.state.coursesRead,loading:true,error:null}});const result=await this.port.courses(more?this.courseCursor:null);this.guard(v);
   const courses=more?[...this.state.courses,...result.items]:result.items;
   if(courses.length>1000||new Set(courses.map(c=>`${c.approval_id}:${c.mode}`)).size!==courses.length)throw Error('RANKED_CHANGED');
   this.courseCursor=result.next_cursor;this.publish({courses,coursesRead:{loading:false,fresh:true,error:null,hasMore:!!this.courseCursor}});
  }catch(error){try{this.guard(v);this.wait(error);this.publish({coursesRead:{...this.state.coursesRead,loading:false,fresh:false,error:this.error(error)}});}catch{/* Retired course discovery. */}}
 }
}
