import {freezeSocialOperation,freezeSocialRequest,parseSocialOperations,validateSocialMutation,validateSocialReceipt} from './model';
import type {SocialCoordinatorSnapshot,SocialErrorCode,SocialMutationResponse,SocialOperation,SocialOwned,SocialPort,SocialRequest,StoredSocialOperation} from './types';
export type {SocialPort,SocialCoordinatorSnapshot,SocialLatest,StoredSocialOperation} from './types';
const safeErrors=new Set(['SOCIAL_INVALID','SOCIAL_TOO_LARGE','SOCIAL_OPERATION_CONFLICT','SOCIAL_INVALID_RESPONSE','SOCIAL_UNAVAILABLE','SOCIAL_RATE_LIMITED','SOCIAL_AUTH_REQUIRED','SOCIAL_REVIEW_REQUIRED','PROFILE_REQUIRED','FRIEND_CHANGED','BLOCK_CHANGED','PRESENCE_CHANGED','INVITATION_CHANGED','INVITATION_UNAVAILABLE','ACCOUNT_CHANGED','ACCOUNT_DELETION_PENDING','LOCAL_READ_FAILED','LOCAL_WRITE_FAILED']);
const errorCode=(value:unknown)=>value instanceof Error&&safeErrors.has(value.message)?value.message:'SOCIAL_UNAVAILABLE';
const lane=(request:SocialRequest)=>request.action==='set_presence'?'presence':request.action==='request_friend'?`handle:${request.handle}`:request.action==='friend_action'||request.action==='unblock'?`friend:${request.other_id}`:`invitation:${request.challenge_id}`;
const asOperation=(operation:SocialOperation)=>freezeSocialOperation({operationId:operation.operationId,request:operation.request});
const key=(operation:SocialOperation)=>JSON.stringify(asOperation(operation));

/** Only a validated server envelope plus exact absent receipt can retire a rejected intent. */
export class SocialCoordinator{
 private state:SocialCoordinatorSnapshot={busy:false,pending:[],error:null,latest:null,reviewRequired:[]};
 private listeners=new Set<()=>void>();private writes=Promise.resolve();private running:Promise<void>|null=null;private closed=false;
 private reviewed=new Set<string>();private unattempted=new Set<string>();
 constructor(private port:SocialPort){}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 close(){this.closed=true;this.listeners.clear();}
 private current(){if(this.closed)throw Error('ACCOUNT_CHANGED');this.port.guard();}
 private rows(){this.current();return parseSocialOperations(this.port.read().socialOperations);}
 private publish(patch:Partial<SocialCoordinatorSnapshot>){if(this.closed)return;this.state={...this.state,...patch};this.listeners.forEach(listener=>listener());}
 private fail(value:unknown){try{this.current();}catch{return;}this.publish({error:errorCode(value)});}
 private async commit(change:(old:SocialOwned)=>Partial<SocialOwned>){
  const work=this.writes.catch(()=>{}).then(async()=>{this.current();const patch=change({socialOperations:this.rows()});await this.port.write(patch);this.current();await this.port.flush();this.current();});
  this.writes=work.catch(()=>{});return work;
 }
 async enqueue(input:SocialRequest):Promise<string|null>{
  let operationId:string|null=null;
  try{this.current();if(!this.port.hasSession())throw Error('SOCIAL_AUTH_REQUIRED');const request=freezeSocialRequest(input),operation=freezeSocialOperation({operationId:this.port.operationUUID(),request});operationId=operation.operationId;
   const row:StoredSocialOperation={...operation,queuedAt:this.port.nowISO(),lastError:null};parseSocialOperations([row]);this.reviewed.add(operationId);this.unattempted.add(operationId);
   await this.commit(old=>({socialOperations:parseSocialOperations([...old.socialOperations,row])}));this.publish({pending:this.rows(),error:null});await this.retry();this.current();return operationId;
  }catch(error){this.fail(error);try{this.publish({pending:this.rows()});}catch{/* Failed reads never become empty writes. */}return null;}
 }
 retry(reviewedOperationId?:string):Promise<void>{
  if(reviewedOperationId!==undefined){try{const row=this.rows().find(value=>value.operationId===reviewedOperationId);if(!row||row.request.action!=='request_friend')throw Error('SOCIAL_INVALID');this.reviewed.add(reviewedOperationId);}catch(error){this.fail(error);return Promise.resolve();}}
  if(this.running)return this.running;const work=this.run();this.running=work;void work.then(()=>{if(this.running===work)this.running=null;},()=>{if(this.running===work)this.running=null;});return work;
 }
 private async remove(row:StoredSocialOperation){
  let removed:StoredSocialOperation|null=null,index=0;
  try{await this.commit(old=>{index=old.socialOperations.findIndex(value=>value.operationId===row.operationId);const current=old.socialOperations[index];if(!current||key(current)!==key(row))throw Error('SOCIAL_INVALID_RESPONSE');removed=current;return {socialOperations:old.socialOperations.filter(value=>value.operationId!==row.operationId)};});}
  catch(error){if(removed){const previous=removed;try{await this.commit(old=>{if(old.socialOperations.some(value=>value.operationId===row.operationId))return {};const rows=[...old.socialOperations];rows.splice(Math.min(index,rows.length),0,previous);return {socialOperations:parseSocialOperations(rows)};});}catch{/* Restore remains dirty; the next retry flushes before egress. */}}throw error;}
  this.reviewed.delete(row.operationId);this.unattempted.delete(row.operationId);
 }
 private async acknowledge(row:StoredSocialOperation,value:unknown){
  const receipt=validateSocialReceipt(value,this.port.ownerId,asOperation(row));await this.remove(row);this.current();this.publish({latest:{operationId:row.operationId,status:'applied',error:null},error:null,pending:this.rows()});
  // Refresh carries validated proof only after durable removal. Read failure does not resend.
  try{await this.port.refresh(receipt);this.current();}catch(error){this.current();this.fail(error);}
 }
 private async status(row:StoredSocialOperation){const value=await this.port.status(row.operationId);this.current();return value===null?null:validateSocialReceipt(value,this.port.ownerId,asOperation(row));}
 private async remember(row:StoredSocialOperation,error:unknown){const code=errorCode(error);await this.commit(old=>({socialOperations:old.socialOperations.map(value=>value.operationId===row.operationId&&key(value)===key(row)?{...value,lastError:code}:value)}));this.fail(error);}
 private async settle(row:StoredSocialOperation):Promise<boolean>{
  if(!this.unattempted.has(row.operationId)){
   const previous=await this.status(row);if(previous){await this.acknowledge(row,previous);return true;}
   if(row.request.action==='request_friend'&&!this.reviewed.has(row.operationId)){this.publish({reviewRequired:[...new Set([...this.state.reviewRequired,row.operationId])]});return false;}
  }
  let response:SocialMutationResponse;
  this.unattempted.delete(row.operationId);
  try{const operation=asOperation(row);response=validateSocialMutation(await this.port.send(operation),this.port.ownerId,operation);this.current();}
  catch(error){this.current();const previous=await this.status(row);if(previous){await this.acknowledge(row,previous);return true;}await this.remember(row,error);return false;}
  if('error' in response){const previous=await this.status(row);if(previous){await this.acknowledge(row,previous);return true;}await this.remove(row);this.publish({latest:{operationId:row.operationId,status:'rejected',error:response.error.code as SocialErrorCode},error:response.error.code,pending:this.rows()});return true;}
  await this.acknowledge(row,response);return true;
 }
 private async run(){
  try{this.current();await this.writes;this.current();await this.port.flush();this.current();const rows=this.rows();this.publish({busy:true,pending:rows,reviewRequired:[]});if(!this.port.hasSession())return;
   const blocked=new Set<string>();let processed=0;
   for(const row of rows){this.current();if(blocked.has(lane(row.request)))continue;if(processed++>=4)break;
    try{if(!await this.settle(row))blocked.add(lane(row.request));}catch(error){this.current();blocked.add(lane(row.request));this.fail(error);}
   }
  }catch(error){this.fail(error);}finally{try{this.current();let pending=this.state.pending;try{pending=this.rows();}catch(error){this.fail(error);}this.publish({busy:false,pending});}catch{/* Closed owners never publish into their replacement. */}}
 }
}
