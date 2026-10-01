import {freezeRankedRequest,parseRankedOperations,rankedCanonical,rankedMutationErrors,validateRankedMutation,validateRankedOperation,validateRankedReceipt,type RankedOperation,type StoredRankedOperation} from './publicationModel';
import type {RankedMutationError,RankedReceipt,RankedRequest} from './types';
export interface RankedWritePort{
 ownerId:string;guard:()=>void;canSend:()=>boolean;read:()=>StoredRankedOperation[];
 update:(reduce:(fresh:StoredRankedOperation[])=>StoredRankedOperation[])=>Promise<void>;flush:()=>Promise<void>;
 operationId:()=>string;nowISO:()=>string;monotonicNow:()=>number;
 send:(operation:RankedOperation)=>Promise<RankedReceipt|RankedMutationError>;status:(operation:RankedOperation)=>Promise<RankedReceipt|null>;
 applied:(receipt:RankedReceipt)=>Promise<void>;
}
type Latest=Readonly<{operation_id:string;status:'applied'|'rejected';error:string|null}>;
type Snapshot=Readonly<{busy:boolean;pending:readonly StoredRankedOperation[];error:string|null;latest:Latest|null;retryAfterMs:number|null}>;
const localErrors=[...rankedMutationErrors,'RANKED_INVALID_RESPONSE','RANKED_CAPACITY','RANKED_INACTIVE','RANKED_MOVING','ACCOUNT_CHANGED','LOCAL_READ_FAILED','LOCAL_WRITE_FAILED'];
const safeError=(error:unknown)=>error instanceof Error&&localErrors.includes(error.message as typeof localErrors[number])?error.message:'RANKED_UNAVAILABLE';
const transient=new Set(['RANKED_UNAVAILABLE','RANKED_RATE_LIMITED','RANKED_AUTH_REQUIRED']);
const wire=(row:StoredRankedOperation):RankedOperation=>({owner_id:row.owner_id,operation_id:row.operation_id,request:row.request});
const key=(row:StoredRankedOperation)=>rankedCanonical(wire(row));
const lane=(row:StoredRankedOperation)=>`${row.request.action}:${row.request.metric}:${row.request.record_id}`;

/** Exact durable desired state. An unknown reply never becomes a successful share. */
export class RankedCoordinator{
 private state:Snapshot={busy:false,pending:[],error:null,latest:null,retryAfterMs:null};private listeners=new Set<()=>void>();
 private writes=Promise.resolve();private running:Promise<void>|null=null;private closed=false;private retryAt=0;
 constructor(private port:RankedWritePort){}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 close(){this.closed=true;this.listeners.clear();}
 private current(){if(this.closed)throw Error('ACCOUNT_CHANGED');this.port.guard();}
 private publish(patch:Partial<Snapshot>){if(this.closed)return;this.state={...this.state,...patch};for(const listener of this.listeners)listener();}
 private rows(){this.current();return parseRankedOperations(this.port.read(),this.port.ownerId);}
 private fail(error:unknown){try{this.current();this.publish({error:safeError(error)});}catch{/* Retired owner. */}}
 private commit(reduce:(fresh:StoredRankedOperation[])=>StoredRankedOperation[]){const work=this.writes.catch(()=>{}).then(async()=>{this.current();await this.port.update(fresh=>{this.current();return parseRankedOperations(reduce(parseRankedOperations(fresh,this.port.ownerId)),this.port.ownerId);});this.current();await this.port.flush();this.current();});this.writes=work.catch(()=>{});return work;}
 async enqueue(input:RankedRequest):Promise<string|null>{
  try{this.current();if(!this.port.canSend())throw Error('RANKED_INACTIVE');const request=freezeRankedRequest(input),op=validateRankedOperation({owner_id:this.port.ownerId,operation_id:this.port.operationId(),request},this.port.ownerId),row:StoredRankedOperation={...op,queued_at:this.port.nowISO(),last_error:null};
   await this.commit(rows=>[...rows,row]);this.publish({pending:this.rows(),error:null});await this.retry();this.current();return op.operation_id;
  }catch(error){this.fail(error);try{this.publish({pending:this.rows()});}catch{/* Preserve unread local bytes. */}return null;}
 }
 retry():Promise<void>{if(this.running)return this.running;const work=this.run();this.running=work;void work.then(()=>{if(this.running===work)this.running=null;},()=>{if(this.running===work)this.running=null;});return work;}
 private async status(row:StoredRankedOperation){this.current();if(!this.port.canSend())throw Error('RANKED_INACTIVE');const value=await this.port.status(wire(row));this.current();return value===null?null:validateRankedReceipt(value,this.port.ownerId,wire(row));}
 private async remember(row:StoredRankedOperation,error:unknown){const code=safeError(error);await this.commit(rows=>rows.map(value=>value.operation_id===row.operation_id&&key(value)===key(row)?{...value,last_error:code}:value));this.publish({pending:this.rows(),error:code});}
 private async remove(row:StoredRankedOperation){let removed:StoredRankedOperation|null=null,index=0;
  try{await this.commit(rows=>{index=rows.findIndex(value=>value.operation_id===row.operation_id);const found=rows[index];if(!found||key(found)!==key(row))throw Error('RANKED_INVALID_RESPONSE');removed=found;return rows.filter(value=>value.operation_id!==row.operation_id);});}
  catch(error){if(removed){const restore=removed;try{await this.commit(rows=>{if(rows.some(value=>value.operation_id===row.operation_id))return rows;const restored=[...rows];restored.splice(Math.min(index,restored.length),0,restore);return restored;});}catch{/* Dirty recovery must flush before any retry. */}}throw error;}
 }
 private async acknowledge(row:StoredRankedOperation,value:unknown){const receipt=validateRankedReceipt(value,this.port.ownerId,wire(row));await this.remove(row);this.current();this.publish({latest:{operation_id:row.operation_id,status:'applied',error:null},pending:this.rows(),error:null});try{await this.port.applied(receipt);this.current();}catch(error){this.fail(error);}}
 private async settle(row:StoredRankedOperation):Promise<boolean>{
  const previous=await this.status(row);if(previous){await this.acknowledge(row,previous);return true;}
  this.current();if(!this.port.canSend())throw Error('RANKED_INACTIVE');let response:RankedReceipt|RankedMutationError;
  try{response=validateRankedMutation(await this.port.send(wire(row)),this.port.ownerId,wire(row));this.current();}
  catch(error){this.current();const ack=await this.status(row);if(ack){await this.acknowledge(row,ack);return true;}await this.remember(row,error);return false;}
  if('error' in response){const ack=await this.status(row);if(ack){await this.acknowledge(row,ack);return true;}
   if(transient.has(response.error.code)){if(response.error.code==='RANKED_RATE_LIMITED'){const ms=response.error.retry_after_ms;this.retryAt=this.port.monotonicNow()+ms;this.publish({retryAfterMs:ms});}await this.remember(row,Error(response.error.code));return false;}
   await this.remove(row);this.publish({latest:{operation_id:row.operation_id,status:'rejected',error:response.error.code},pending:this.rows(),error:response.error.code});return true;
  }
  await this.acknowledge(row,response);return true;
 }
 private async run(){try{
  this.current();await this.writes;this.current();await this.port.flush();this.current();const rows=this.rows();this.publish({pending:rows});if(!this.port.canSend())return;
  const wait=this.retryAt-this.port.monotonicNow();if(wait>0){this.publish({retryAfterMs:wait});return;}this.publish({busy:true,retryAfterMs:null});const blocked=new Set<string>();let processed=0;
  for(const row of rows){this.current();if(!this.port.canSend())break;if(blocked.has(lane(row)))continue;if(processed++>=4)break;
   try{if(!await this.settle(row))blocked.add(lane(row));}catch(error){this.current();blocked.add(lane(row));this.fail(error);}
   if(this.retryAt>this.port.monotonicNow())break;
  }
 }catch(error){this.fail(error);}finally{try{this.current();this.publish({busy:false,pending:this.rows()});}catch{/* No replacement-account settlement. */}}}
}
