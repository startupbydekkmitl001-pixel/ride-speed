import {freezeCommunityRequest,validateCommunityError} from './model';
import {communityCanonical,communityLocalErrors,communityWire,parseCommunityOperations,validateOwnedCommunityReceipt,type OwnedCommunityOperation} from './localModel';
import type {CommunityLatest,CommunityMutationResponse,CommunityReceipt,CommunityRequest} from './types';
export interface CommunityWritePort{
 ownerId:string;guard:()=>void;canSend:()=>boolean;read:()=>OwnedCommunityOperation[];
 update:(reduce:(fresh:OwnedCommunityOperation[])=>OwnedCommunityOperation[])=>Promise<void>;flush:()=>Promise<void>;
 operationId:()=>string;nowISO:()=>string;monotonicNow:()=>number;
 send:(operation:OwnedCommunityOperation)=>Promise<CommunityMutationResponse>;status:(operation:OwnedCommunityOperation)=>Promise<CommunityReceipt|null>;
 applied:(receipt:CommunityReceipt)=>Promise<void>;
}
type Snapshot=Readonly<{busy:boolean;pending:readonly OwnedCommunityOperation[];error:string|null;latest:CommunityLatest|null;retryAfterMs:number|null}>;
const safeError=(e:unknown)=>e instanceof Error&&communityLocalErrors.includes(e.message as typeof communityLocalErrors[number])?e.message:'COMMUNITY_UNAVAILABLE';
const transient=new Set(['COMMUNITY_UNAVAILABLE','COMMUNITY_RATE_LIMITED','COMMUNITY_AUTH_REQUIRED']);
const exact=(row:OwnedCommunityOperation)=>communityCanonical({owner_id:row.owner_id,...communityWire(row)});
/** All controls on one post share a FIFO lane. Unknown publish/privacy outcomes
 * cannot be bypassed by a later audience/delete/engagement operation. */
export class CommunityCoordinator{
 private state:Snapshot={busy:false,pending:[],error:null,latest:null,retryAfterMs:null};private listeners=new Set<()=>void>();
 private writes=Promise.resolve();private running:Promise<void>|null=null;private closed=false;private retryAt=0;
 constructor(private port:CommunityWritePort){}
 getSnapshot=()=>this.state;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 close(){this.closed=true;this.listeners.clear();}
 private current(){if(this.closed)throw Error('ACCOUNT_CHANGED');this.port.guard();}
 private publish(patch:Partial<Snapshot>){if(this.closed)return;this.state={...this.state,...patch};for(const fn of this.listeners)fn();}
 private rows(){this.current();return parseCommunityOperations(this.port.read(),this.port.ownerId);}
 private fail(error:unknown){try{this.current();this.publish({error:safeError(error)});}catch{/* Retired owner. */}}
 private commit(reduce:(fresh:OwnedCommunityOperation[])=>OwnedCommunityOperation[]){const work=this.writes.catch(()=>{}).then(async()=>{this.current();await this.port.update(fresh=>{this.current();return parseCommunityOperations(reduce(parseCommunityOperations(fresh,this.port.ownerId)),this.port.ownerId);});this.current();await this.port.flush();this.current();});this.writes=work.catch(()=>{});return work;}
 async enqueue(input:CommunityRequest,operationId?:string,accept:()=>void=()=>{}):Promise<string|null>{try{
  this.current();accept();if(!this.port.canSend())throw Error('COMMUNITY_INACTIVE');const row:OwnedCommunityOperation={owner_id:this.port.ownerId,operationId:operationId??this.port.operationId(),request:freezeCommunityRequest(input),queuedAt:this.port.nowISO(),lastError:null};parseCommunityOperations([row],this.port.ownerId);
  await this.commit(rows=>{accept();const previous=rows.find(v=>v.operationId===row.operationId);if(previous){if(exact(previous)!==exact(row))throw Error('COMMUNITY_OPERATION_CONFLICT');return rows;}return [...rows,row];});this.publish({pending:this.rows(),error:null});accept();await this.retry();this.current();return row.operationId;
 }catch(error){this.fail(error);try{this.publish({pending:this.rows()});}catch{/* Preserve corrupt local bytes. */}return null;}}
 retry():Promise<void>{if(this.running)return this.running;const work=this.run();this.running=work;void work.then(()=>{if(this.running===work)this.running=null;},()=>{if(this.running===work)this.running=null;});return work;}
 private async status(row:OwnedCommunityOperation){this.current();if(!this.port.canSend())throw Error('COMMUNITY_INACTIVE');const value=await this.port.status(row);this.current();return value===null?null:validateOwnedCommunityReceipt(value,this.port.ownerId,row);}
 private async remember(row:OwnedCommunityOperation,e:unknown){const code=safeError(e);await this.commit(rows=>rows.map(v=>v.operationId===row.operationId&&exact(v)===exact(row)?{...v,lastError:code}:v));this.publish({pending:this.rows(),error:code});}
 private async remove(row:OwnedCommunityOperation){let removed:OwnedCommunityOperation|null=null,index=0;try{
  await this.commit(rows=>{index=rows.findIndex(v=>v.operationId===row.operationId);const found=rows[index];if(!found||exact(found)!==exact(row))throw Error('COMMUNITY_INVALID_RESPONSE');removed=found;return rows.filter(v=>v.operationId!==row.operationId);});
 }catch(error){if(removed){const restore=removed;try{await this.commit(rows=>{if(rows.some(v=>v.operationId===row.operationId))return rows;const result=[...rows];result.splice(Math.min(index,result.length),0,restore);return result;});}catch{/* Retry must flush dirty recovery before egress. */}}throw error;}}
 private async acknowledge(row:OwnedCommunityOperation,value:unknown){const receipt=validateOwnedCommunityReceipt(value,this.port.ownerId,row);await this.port.applied(receipt);this.current();await this.remove(row);this.current();this.publish({latest:{operationId:row.operationId,status:'applied',error:null},pending:this.rows(),error:null});}
 private async settle(row:OwnedCommunityOperation):Promise<boolean>{const previous=await this.status(row);if(previous){await this.acknowledge(row,previous);return true;}
  this.current();if(!this.port.canSend())throw Error('COMMUNITY_INACTIVE');let response:CommunityMutationResponse;
  try{const raw=await this.port.send(row);response=validateCommunityError(raw)??validateOwnedCommunityReceipt(raw,this.port.ownerId,row);this.current();}
  catch(e){this.current();const receipt=await this.status(row);if(receipt){await this.acknowledge(row,receipt);return true;}await this.remember(row,e);return false;}
  if('error' in response){const receipt=await this.status(row);if(receipt){await this.acknowledge(row,receipt);return true;}
   if(transient.has(response.error.code)){if(response.error.code==='COMMUNITY_RATE_LIMITED'){const ms=response.error.retry_after_ms;this.retryAt=this.port.monotonicNow()+ms;this.publish({retryAfterMs:ms});}await this.remember(row,Error(response.error.code));return false;}
   await this.remove(row);this.publish({latest:{operationId:row.operationId,status:'rejected',error:response.error.code},pending:this.rows(),error:response.error.code});return true;
  }await this.acknowledge(row,response);return true;
 }
 private async run(){try{this.current();await this.writes;this.current();await this.port.flush();this.current();const rows=this.rows();this.publish({pending:rows});if(!this.port.canSend())return;const wait=this.retryAt-this.port.monotonicNow();if(wait>0){this.publish({retryAfterMs:wait});return;}this.publish({busy:true,retryAfterMs:null});const blocked=new Set<string>();let count=0;
  for(const row of rows){this.current();if(!this.port.canSend())break;if(blocked.has(row.request.post_id))continue;if(count++>=4)break;try{if(!await this.settle(row))blocked.add(row.request.post_id);}catch(e){this.current();blocked.add(row.request.post_id);this.fail(e);}if(this.retryAt>this.port.monotonicNow())break;}
 }catch(e){this.fail(e);}finally{try{this.current();this.publish({busy:false,pending:this.rows()});}catch{/* No replacement owner settlement. */}}}
}
