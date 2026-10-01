import {liveClock} from '../features/live/clockModel';
import type {ConvoyList,ConvoySnapshot,ConvoySummary,FriendLink,FriendLinks,LiveClock} from '../features/live/types';

export type LiveReadState=Readonly<{loaded:boolean;loading:boolean;fresh:boolean;roomFresh:boolean;links:readonly FriendLink[];summaries:readonly ConvoySummary[];room:ConvoySnapshot|null;roomClock:LiveClock|null;error:string|null;receivedAt:number}>;
type Port={guard():void;now():number;links():Promise<FriendLinks>;rooms():Promise<ConvoyList>;room(id:string):Promise<ConvoySnapshot|null>};
const blank=():LiveReadState=>({loaded:false,loading:false,fresh:false,roomFresh:false,links:[],summaries:[],room:null,roomClock:null,error:null,receivedAt:0});
const safe=new Set(['LIVE_DISABLED','LIVE_UNAVAILABLE','LIVE_RATE_LIMITED','LIVE_AUTH_REQUIRED','ACCOUNT_CHANGED','LOCAL_READ_FAILED','LIVE_INVALID_RESPONSE','LIVE_CLOCK_UNCERTAIN','CONVOY_UNAVAILABLE','ACCOUNT_DELETION_PENDING']);
const errorCode=(e:unknown)=>e instanceof Error&&safe.has(e.message)?e.message:'LIVE_UNAVAILABLE';
/** Room reads keep their own request-start clock; cached lists cannot authorize GPS. */
export class LiveReader{
 private port:Port;private state=blank();private listeners=new Set<()=>void>();private epoch=0;private closed=false;
 private selected:string|null=null;private running:Promise<void>|null=null;
 constructor(port:Port){this.port=port;}
 getSnapshot=()=>this.state;
 subscribe=(f:()=>void)=>{this.listeners.add(f);return()=>{this.listeners.delete(f);};};
 private guard(){if(this.closed)throw Error('ACCOUNT_CHANGED');this.port.guard();}
 private publish(patch:Partial<LiveReadState>){this.guard();this.state={...this.state,...patch};for(const f of this.listeners){try{f();}catch{/* A subscriber cannot change canonical authority. */}}}
 suspend(){if(this.closed)return;this.epoch++;this.running=null;this.publish({loading:false,fresh:false,roomFresh:false,room:null,roomClock:null});}
 close(){this.closed=true;this.epoch++;this.running=null;this.selected=null;this.state=blank();this.listeners.clear();}
 open(id:string){this.guard();if(this.selected!==id){this.suspend();this.selected=id;}return this.refresh();}
 refresh():Promise<void>{
  try{this.guard();}catch{return Promise.resolve();}if(this.running)return this.running;
  const epoch=this.epoch,task=Promise.resolve().then(()=>this.read(epoch));this.running=task;
  void task.finally(()=>{if(this.running===task)this.running=null;});return task;
 }
 private current(epoch:number){this.guard();return this.epoch===epoch;}
 private async read(epoch:number){
  try{if(!this.current(epoch))return;this.publish({loading:true,fresh:false,roomFresh:false,error:null});
   const [links,rooms]=await Promise.all([Promise.resolve().then(()=>this.port.links()),Promise.resolve().then(()=>this.port.rooms())]);
   if(!this.current(epoch))return;
   let room:ConvoySnapshot|null=null,clock:LiveClock|null=null;
   if(this.selected){const start=this.port.now();room=await this.port.room(this.selected);if(!this.current(epoch))return;if(room)clock=liveClock(room.server_now,start,this.port.now());}
   if(!this.current(epoch))return;this.publish({loaded:true,loading:false,fresh:true,roomFresh:!!this.selected,links:links.items,summaries:rooms.items,room,roomClock:clock,error:null,receivedAt:this.port.now()});
  }catch(error){try{if(this.current(epoch))this.publish({loading:false,fresh:false,roomFresh:false,room:null,roomClock:null,error:errorCode(error)});}catch{/* Closed account or replaced foreground generation. */}}
 }
}
