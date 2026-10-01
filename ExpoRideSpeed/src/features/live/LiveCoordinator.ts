import {canonicalLive,freezeLiveOperation,freezeLiveRequest,liveErrors,parseLiveOperations,validateLiveGrantCancellation,validateLiveMutation,validateLiveReceipt} from './model';
import type {LiveClientErrorCode,LiveControlPort,LiveCoordinatorSnapshot,LiveErrorCode,LiveOperation,LiveOwned,LiveRequest,StoredLiveOperation} from './types';
export type {LiveControlPort,LiveCoordinatorSnapshot,LiveOwned,LiveLatest,StoredLiveOperation} from './types';
const safe=new Set<string>([...liveErrors,'LIVE_INVALID_RESPONSE','LIVE_CLOCK_UNCERTAIN','LIVE_REVIEW_REQUIRED','ACCOUNT_CHANGED','LOCAL_READ_FAILED','LOCAL_WRITE_FAILED']);
function code(value:unknown):LiveErrorCode|LiveClientErrorCode{return value instanceof Error&&safe.has(value.message)?value.message as LiveErrorCode|LiveClientErrorCode:'LIVE_UNAVAILABLE';}
const sensitive=(r:LiveRequest)=>r.action==='location_grant'||r.action==='convoy_join'||r.action==='friend_link_request';
const lane=(r:LiveRequest)=>'convoy_id' in r?`room:${r.convoy_id}`:'link_id' in r?`link:${r.link_id}`:`friend:${r.issuer_id}`;
const operation=(r:LiveOperation)=>freezeLiveOperation({operationId:r.operationId,request:r.request});
const identity=(r:LiveOperation)=>canonicalLive(operation(r));
/** Durable control intents; live coordinates never enter this queue. */
export class LiveCoordinator{
 private state:LiveCoordinatorSnapshot={busy:false,pending:[],error:null,latest:null,reviewRequired:[]};
 private listeners=new Set<()=>void>();private reviewed=new Set<string>();private unattempted=new Set<string>();
 private writes=Promise.resolve();private running:Promise<void>|null=null;private again=false;private closed=false;
 private cancelling=new Set<string>();private cancellations=new Map<string,Promise<boolean>>();private settled=new Set<string>();
 private settlements=new Map<string,Promise<void>>();
 constructor(private port:LiveControlPort){}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 suspend(){this.reviewed.clear();this.unattempted.clear();}
 close(){this.closed=true;this.suspend();this.listeners.clear();}
 private guard(){if(this.closed||!this.port.current())throw Error('ACCOUNT_CHANGED');}
 private network(){this.guard();return this.port.eligible();}
 private rows(){this.guard();return parseLiveOperations(this.port.read().operations);}
 private publish(patch:Partial<LiveCoordinatorSnapshot>){if(this.closed||!this.port.current())return;this.state={...this.state,...patch};for(const listener of this.listeners){try{listener();}catch{/* A subscriber cannot undo durable settlement. */}}}
 private fail(error:unknown){try{this.guard();this.publish({error:code(error)});}catch{/* Owner closed. */}}
 private commit(reducer:(fresh:LiveOwned)=>LiveOwned){
  const task=this.writes.catch(()=>{}).then(async()=>{this.guard();this.rows();await this.port.update(fresh=>{this.guard();return reducer({operations:parseLiveOperations(fresh.operations)});});this.guard();await this.port.flush();this.guard();});this.writes=task.catch(()=>{});return task;
 }
 async enqueue(input:LiveRequest):Promise<string|null>{
  try{this.guard();if(!this.network())throw Error('LIVE_AUTH_REQUIRED');const request=freezeLiveRequest(input),op=freezeLiveOperation({operationId:this.port.operationId(),request}),row:StoredLiveOperation={...op,queuedAt:this.port.nowISO(),lastError:null};parseLiveOperations([row]);this.reviewed.add(op.operationId);this.unattempted.add(op.operationId);
   await this.commit(old=>({operations:parseLiveOperations([...old.operations,row])}));this.publish({pending:this.rows(),error:null});await this.retry();this.guard();return op.operationId;
  }catch(error){this.fail(error);try{this.publish({pending:this.rows()});}catch{/* Unread owner never becomes writable empty. */}return null;}
 }
 retry(reviewedOperationId?:string):Promise<void>{
  if(reviewedOperationId!==undefined){try{this.guard();if(!this.network())throw Error('LIVE_AUTH_REQUIRED');const row=this.rows().find(r=>r.operationId===reviewedOperationId);if(!row||!sensitive(row.request))throw Error('LIVE_INVALID');if(this.cancelling.has(reviewedOperationId))throw Error('LIVE_REVIEW_REQUIRED');this.reviewed.add(reviewedOperationId);}catch(error){this.fail(error);return Promise.resolve();}}
  if(this.running){this.again=true;return this.running;}const task=this.runPasses();this.running=task;void task.then(()=>{if(this.running===task)this.running=null;},()=>{if(this.running===task)this.running=null;});return task;
 }
 private async remove(row:StoredLiveOperation){
  let removed:StoredLiveOperation|null=null,index=0;
  try{await this.commit(old=>{index=old.operations.findIndex(v=>v.operationId===row.operationId);const present=old.operations[index];if(!present||identity(present)!==identity(row))throw Error('LIVE_INVALID_RESPONSE');removed=present;return {operations:old.operations.filter(v=>v.operationId!==row.operationId)};});}
  catch(error){if(removed){const previous=removed;try{await this.commit(old=>{if(old.operations.some(v=>v.operationId===row.operationId))return old;const rows=[...old.operations];rows.splice(Math.min(index,rows.length),0,previous);return {operations:parseLiveOperations(rows)};});}catch{/* Retry flushes the restored dirty row before network. */}}throw error;}
  this.reviewed.delete(row.operationId);this.unattempted.delete(row.operationId);
 }
 private async settleDurably(row:StoredLiveOperation,publish:()=>void):Promise<boolean>{
  const running=this.settlements.get(row.operationId);if(running){await running;return false;}if(this.settled.has(row.operationId))return false;
  const task=Promise.resolve().then(async()=>{this.guard();if(this.settled.has(row.operationId))return;await this.remove(row);this.noteSettled(row.operationId);this.guard();publish();});this.settlements.set(row.operationId,task);
  try{await task;return true;}finally{if(this.settlements.get(row.operationId)===task)this.settlements.delete(row.operationId);}
 }
 private async acknowledge(row:StoredLiveOperation,value:unknown){
  const receipt=validateLiveReceipt(value,this.port.ownerId,operation(row)),won=await this.settleDurably(row,()=>this.publish({pending:this.rows(),latest:{operationId:row.operationId,status:'applied',error:null,receipt},error:null}));
  if(won&&this.network()){try{await this.port.refresh(receipt);this.guard();}catch(error){this.fail(error);}}
 }
 private async status(row:StoredLiveOperation){if(!this.network())return undefined;const value=await this.port.status(row.operationId);this.guard();return value===null?null:validateLiveReceipt(value,this.port.ownerId,operation(row));}
 private async remember(row:StoredLiveOperation,error:unknown){const lastError=code(error);await this.commit(old=>({operations:old.operations.map(v=>v.operationId===row.operationId&&identity(v)===identity(row)?{...v,lastError}:v)}));this.fail(error);}
 private async settle(row:StoredLiveOperation):Promise<boolean>{
  if(this.settled.has(row.operationId))return true;
  if(!this.network())return false;
  if(!this.unattempted.has(row.operationId)){
   const previous=await this.status(row);if(previous){await this.acknowledge(row,previous);return true;}if(previous===undefined||!this.network())return false;
   if(sensitive(row.request)&&(!this.reviewed.has(row.operationId)||this.cancelling.has(row.operationId))){this.publish({reviewRequired:[...new Set([...this.state.reviewRequired,row.operationId])]});return false;}
  }
  if(!this.network())return false;this.unattempted.delete(row.operationId);let response;
  try{const op=operation(row);response=validateLiveMutation(await this.port.send(op),this.port.ownerId,op);this.guard();}
  catch(error){this.guard();const previous=await this.status(row);if(previous){await this.acknowledge(row,previous);return true;}await this.remember(row,error);return false;}
  if('error' in response){const previous=await this.status(row);if(previous){await this.acknowledge(row,previous);return true;}if(previous===undefined||!this.network()){await this.remember(row,Error(response.error.code));return false;}await this.settleDurably(row,()=>this.publish({pending:this.rows(),latest:{operationId:row.operationId,status:'rejected',error:response.error.code,receipt:null},error:response.error.code}));return true;}
  await this.acknowledge(row,response);return true;
 }
 private noteSettled(id:string){this.settled.add(id);this.cancelling.delete(id);while(this.settled.size>64)this.settled.delete(this.settled.values().next().value!);}
 cancelGrant(operationId:string):Promise<boolean>{
  const running=this.cancellations.get(operationId);if(running)return running;
  const task=this.cancel(operationId);this.cancellations.set(operationId,task);void task.then(()=>{if(this.cancellations.get(operationId)===task)this.cancellations.delete(operationId);});return task;
 }
 private async cancel(operationId:string):Promise<boolean>{
  let row:StoredLiveOperation|undefined;
  try{
   this.guard();row=this.rows().find(v=>v.operationId===operationId);if(!row){if(this.settled.has(operationId))return true;throw Error('LIVE_INVALID');}if(row.request.action!=='location_grant')throw Error('LIVE_INVALID');
   this.cancelling.add(operationId);this.reviewed.delete(operationId);this.unattempted.delete(operationId);
   await this.writes;this.guard();await this.port.flush();this.guard();if(!this.network())throw Error('LIVE_AUTH_REQUIRED');
   const result=validateLiveGrantCancellation(await this.port.cancelGrant(operation(row)),this.port.ownerId,operation(row));this.guard();if(this.settled.has(operationId))return true;
   if('error' in result){const previous=await this.status(row);if(previous){await this.acknowledge(row,previous);return true;}throw Error(result.error.code);}
   if('result' in result){await this.acknowledge(row,result);return true;}
   await this.settleDurably(row,()=>this.publish({pending:this.rows(),latest:{operationId,status:'rejected',error:'LIVE_OPERATION_CANCELLED',receipt:null},error:'LIVE_OPERATION_CANCELLED'}));return true;
  }catch(e){if(this.settled.has(operationId)){try{this.guard();return true;}catch{return false;}}if(row){try{await this.remember(row,e);}catch(error){this.fail(error);}}else this.fail(e);return false;}
 }
 private async runPasses(){do{this.again=false;await this.run();}while(this.again&&!this.closed&&this.port.current()&&this.port.eligible());}
 private async run(){
  try{this.guard();await this.writes;this.guard();await this.port.flush();this.guard();const rows=this.rows();this.publish({busy:true,pending:rows,reviewRequired:[]});if(!this.network())return;const blocked=new Set<string>();let processed=0;
   for(const row of rows){if(!this.network())break;const key=lane(row.request);if(blocked.has(key))continue;if(processed++>=4)break;try{if(!await this.settle(row))blocked.add(key);}catch(error){this.guard();blocked.add(key);this.fail(error);}}
  }catch(error){this.fail(error);}finally{try{this.guard();this.publish({busy:false,pending:this.rows()});}catch(error){this.fail(error);}}
 }
}
