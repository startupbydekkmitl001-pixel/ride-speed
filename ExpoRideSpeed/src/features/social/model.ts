import {compareRouteTimestamps,validateRouteProjection} from '../routes/syncModel';
import type {BlockedPage,InvitationPage,InvitationRow,SocialMutationResponse,SocialOperation,SocialPage,SocialReceipt,SocialRequest,StoredSocialOperation} from './types';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const stampPattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:Record<string,unknown>,required:readonly string[])=>required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key));
const id=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
const integer=(value:unknown,low=0):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=low&&value<=2147483647;
export function isSocialInstant(value:unknown):value is string{
 if(typeof value!=='string'||value.length>50||!stampPattern.test(value)||!Number.isFinite(Date.parse(value)))return false;
 const year=Number(value.slice(0,4)),month=Number(value.slice(5,7)),day=Number(value.slice(8,10));
 const monthDays=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];return year>=1&&month>=1&&month<=12&&day>=1&&day<=monthDays[month-1];
}
const stamp=isSocialInstant;
const micros=(value:string)=>BigInt(Date.parse(value))*1000n+BigInt(Number((value.match(/\.(\d{1,6})(?:Z|[+-])/)?.[1]??'').padEnd(6,'0'))%1000);
const windowValid=(start:string,end:string)=>micros(end)>micros(start)&&micros(end)-micros(start)<=86400000000n;
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&[...value].length>=1&&[...value].length<=max&&!!value.trim()&&!/[\u0000-\u001f\u007f]/.test(value)&&!/[\uD800-\uDFFF]/u.test(value);
const handle=(value:unknown):value is string=>typeof value==='string'&&/^[a-z0-9_]{3,24}$/.test(value);
const topic=(value:unknown)=>typeof value==='string'&&value.startsWith('rs-presence:')&&id(value.slice(12));
const codes=['SOCIAL_INVALID','SOCIAL_TOO_LARGE','SOCIAL_OPERATION_CONFLICT','SOCIAL_UNAVAILABLE','SOCIAL_RATE_LIMITED','SOCIAL_AUTH_REQUIRED','PROFILE_REQUIRED','FRIEND_CHANGED','BLOCK_CHANGED','PRESENCE_CHANGED','INVITATION_CHANGED','INVITATION_UNAVAILABLE','ACCOUNT_DELETION_PENDING'] as const;
const storedErrors=new Set<string>([...codes,'SOCIAL_INVALID_RESPONSE','SOCIAL_REVIEW_REQUIRED','ACCOUNT_CHANGED','LOCAL_READ_FAILED','LOCAL_WRITE_FAILED']);
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(object(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
function fail(code='SOCIAL_INVALID'):never{throw Error(code);}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}
export function freezeSocialRequest(value:unknown):SocialRequest{
 if(!object(value)||value.schema_version!==1)fail();let result:Record<string,unknown>={...value};
 switch(value.action){
  case 'request_friend':{if(!keys(value,['schema_version','action','handle'])||typeof value.handle!=='string')fail();const handle=value.handle.trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(handle))fail();result.handle=handle;break;}
  case 'friend_action':if(!keys(value,['schema_version','action','other_id','verb','expected_generation'])||!id(value.other_id)||!['accept','decline','cancel','remove','block'].includes(String(value.verb))||typeof value.verb!=='string'||(value.expected_generation===null?value.verb!=='block':!integer(value.expected_generation,1)))fail();break;
  case 'unblock':if(!keys(value,['schema_version','action','other_id','block_token'])||!id(value.other_id)||!id(value.block_token))fail();break;
  case 'set_presence':if(!keys(value,['schema_version','action','enabled','expected_account_revision'])||typeof value.enabled!=='boolean'||!integer(value.expected_account_revision))fail();break;
  case 'create_invitation':{
   if(!keys(value,['schema_version','action','challenge_id','route_id','route_revision','reviewed_geometry_hash','mode','session_id','starts_at','ends_at','recipient_id','friendship_generation'])||!id(value.challenge_id)||!id(value.route_id)||!integer(value.route_revision,1)||value.reviewed_geometry_hash!==null&&(typeof value.reviewed_geometry_hash!=='string'||!hash.test(value.reviewed_geometry_hash))||!stamp(value.starts_at)||!stamp(value.ends_at)||!windowValid(value.starts_at,value.ends_at)||!id(value.recipient_id)||!integer(value.friendship_generation,1)||!(value.mode==='group_ride'&&value.session_id===null||value.mode==='timed_race'&&id(value.session_id)))fail();break;}
  case 'invitation_action':if(!keys(value,['schema_version','action','challenge_id','verb','expected_member_state','friendship_generation'])||!id(value.challenge_id)||typeof value.verb!=='string'||!['accept','decline','withdraw','cancel'].includes(value.verb)||(value.verb==='cancel'?value.expected_member_state!==null||value.friendship_generation!==null:typeof value.expected_member_state!=='string'||!['invited','accepted','declined','withdrawn'].includes(value.expected_member_state)||!integer(value.friendship_generation,1)))fail();break;
  default:fail();
 }
 if(bytes(result)>16384)fail('SOCIAL_TOO_LARGE');return freeze(result) as SocialRequest;
}
export function freezeSocialOperation(value:unknown):SocialOperation{if(!object(value)||!keys(value,['operationId','request'])||!id(value.operationId))fail();return freeze({operationId:value.operationId,request:freezeSocialRequest(value.request)});}
export function parseSocialOperations(value:unknown,stripCloud=false):StoredSocialOperation[]{
 if(stripCloud||value===undefined)return [];if(!Array.isArray(value))fail();if(value.length>32||bytes(value)>131072)fail('SOCIAL_TOO_LARGE');const seen=new Set<string>();
 return freeze(value.map(item=>{if(!object(item)||!keys(item,['operationId','request','queuedAt','lastError'])||!stamp(item.queuedAt)||item.lastError!==null&&(typeof item.lastError!=='string'||!storedErrors.has(item.lastError)))fail();const operation=freezeSocialOperation({operationId:item.operationId,request:item.request});if(canonical(operation.request)!==canonical(item.request)||seen.has(operation.operationId))fail();seen.add(operation.operationId);return {...operation,queuedAt:item.queuedAt,lastError:item.lastError as string|null};}));
}
export function validateSocialPage(value:unknown,ownerId:string):SocialPage{
 try{
  if(!id(ownerId)||!object(value)||!keys(value,['owner_id','server_now','self','items','statuses','next_cursor'])||value.owner_id!==ownerId||!stamp(value.server_now)||!object(value.self)||!keys(value.self,['profile_ready','presence_opt_in','account_revision'])||typeof value.self.profile_ready!=='boolean'||typeof value.self.presence_opt_in!=='boolean'||!integer(value.self.account_revision)||!value.self.profile_ready&&value.self.presence_opt_in||!Array.isArray(value.items)||value.items.length>30||!Array.isArray(value.statuses)||value.statuses.length>30)fail();
  const seen=new Map<string,Record<string,unknown>>();let previous:Record<string,unknown>|null=null;
  for(const row of value.items){if(!object(row)||!keys(row,['user_id','handle','display_name','state','direction','generation','updated_at'])||!id(row.user_id)||row.user_id===ownerId||seen.has(row.user_id)||!handle(row.handle)||!text(row.display_name,40)||!['pending','accepted'].includes(String(row.state))||typeof row.state!=='string'||!['incoming','outgoing'].includes(String(row.direction))||typeof row.direction!=='string'||!integer(row.generation,1)||!stamp(row.updated_at)||previous&&(compareRouteTimestamps(previous.updated_at as string,row.updated_at)<0||compareRouteTimestamps(previous.updated_at as string,row.updated_at)===0&&(previous.user_id as string)<=row.user_id))fail();seen.set(row.user_id,row);previous=row;}
  const statuses=new Set<string>();for(const row of value.statuses){if(!object(row)||!keys(row,['user_id','topic','online','expires_at'])||!id(row.user_id)||statuses.has(row.user_id)||seen.get(row.user_id)?.state!=='accepted'||!topic(row.topic)||typeof row.online!=='boolean'||(row.online?!stamp(row.expires_at):row.expires_at!==null))fail();statuses.add(row.user_id);}
  const cursor=value.next_cursor;if(cursor!==null&&(!object(cursor)||!keys(cursor,['updated_at','user_id'])||!previous||cursor.updated_at!==previous.updated_at||cursor.user_id!==previous.user_id))fail();return freeze(JSON.parse(JSON.stringify(value))) as SocialPage;
 }catch{return fail('SOCIAL_INVALID_RESPONSE');}
}
export function validateBlockedPage(value:unknown,ownerId:string):BlockedPage{
 try{if(!id(ownerId)||!object(value)||!keys(value,['owner_id','items','next_cursor'])||value.owner_id!==ownerId||!Array.isArray(value.items)||value.items.length>30)fail();let previous:string|null=null;
 for(const row of value.items){if(!object(row)||!keys(row,['user_id','handle','display_name','block_token'])||!id(row.user_id)||row.user_id===ownerId||previous!==null&&row.user_id<=previous||!handle(row.handle)||!text(row.display_name,40)||!id(row.block_token))fail();previous=row.user_id;}
 const cursor=value.next_cursor;if(cursor!==null&&(!object(cursor)||!keys(cursor,['user_id'])||!previous||cursor.user_id!==previous))fail();return freeze(JSON.parse(JSON.stringify(value))) as BlockedPage;
 }catch{return fail('SOCIAL_INVALID_RESPONSE');}
}
function invitation(value:unknown,ownerId:string):InvitationRow{
 if(!object(value)||!keys(value,['id','creator_id','creator_name','route_summary','route_snapshot','mode','metric','course_session_id','starts_at','ends_at','state','created_at','member','can_cancel'])||!id(value.id)||!id(value.creator_id)||value.creator_name!==null&&!text(value.creator_name,40)||!stamp(value.starts_at)||!stamp(value.ends_at)||!windowValid(value.starts_at,value.ends_at)||!stamp(value.created_at)||typeof value.state!=='string'||!['open','cancelled'].includes(value.state)||typeof value.can_cancel!=='boolean'||value.can_cancel&&(value.creator_id!==ownerId||value.state!=='open')||!(value.mode==='group_ride'&&value.metric==='none'&&value.course_session_id===null||value.mode==='timed_race'&&value.metric==='sustained_speed_3s'&&id(value.course_session_id)))fail();
 if(value.creator_id===ownerId){if(value.member!==null)fail();}else if(!object(value.member)||!keys(value.member,['state','friendship_generation'])||typeof value.member.state!=='string'||!['invited','accepted','declined','withdrawn'].includes(value.member.state)||!integer(value.member.friendship_generation,1))fail();
 const summary=value.route_summary;if(summary!==null&&(!object(summary)||!keys(summary,['title','revision','category'])||!text(summary.title,80)||!integer(summary.revision,1)||typeof summary.category!=='string'||!['scooter','motorcycle','car','bicycle'].includes(summary.category)))fail();
 const snapshot=value.route_snapshot;if(snapshot!==null){if(!object(snapshot)||!keys(snapshot,['route_id','revision','title','category','segments','geometryStatus','privacyTrimMeters','geometryHash','provider','attribution'])||!id(snapshot.route_id)||!object(summary)||summary.title!==snapshot.title||summary.revision!==snapshot.revision||summary.category!==snapshot.category)fail();validateRouteProjection({id:snapshot.route_id,owner_id:value.creator_id,visibility:'private',revision:snapshot.revision,title:snapshot.title,category:snapshot.category,segments:snapshot.segments,geometryStatus:snapshot.geometryStatus,privacyTrimMeters:snapshot.privacyTrimMeters,geometryHash:snapshot.geometryHash,provider:snapshot.provider,attribution:snapshot.attribution});}
 return freeze(JSON.parse(JSON.stringify(value))) as InvitationRow;
}
export function validateInvitationPage(value:unknown,ownerId:string):InvitationPage{
 try{if(!id(ownerId)||!object(value)||!keys(value,['owner_id','server_now','items','next_cursor'])||value.owner_id!==ownerId||!stamp(value.server_now)||!Array.isArray(value.items)||value.items.length>30)fail();const rows=value.items.map(row=>invitation(row,ownerId)),seen=new Set<string>();let previous:InvitationRow|null=null;
 for(const row of rows){if(seen.has(row.id)||previous&&(compareRouteTimestamps(previous.created_at,row.created_at)<0||compareRouteTimestamps(previous.created_at,row.created_at)===0&&previous.id<=row.id))fail();seen.add(row.id);previous=row;}
 const cursor=value.next_cursor;if(cursor!==null&&(!object(cursor)||!keys(cursor,['created_at','id'])||!previous||cursor.created_at!==previous.created_at||cursor.id!==previous.id))fail();return freeze({...value,items:rows}) as InvitationPage;
 }catch{return fail('SOCIAL_INVALID_RESPONSE');}
}
export function validateSocialOperation(value:unknown,ownerId:string,operationId:string):SocialReceipt|null{
 if(!id(ownerId)||!id(operationId))fail();if(value===null)return null;
 try{if(!object(value)||!keys(value,['owner_id','operation_id','request','applied_at','result'])||value.owner_id!==ownerId||value.operation_id!==operationId||!stamp(value.applied_at))fail();const request=freezeSocialRequest(value.request);if(canonical(request)!==canonical(value.request))fail();const result=value.result;if(!object(result))fail();
 switch(request.action){
  case 'request_friend':if(!keys(result,['kind','user_id','state','generation'])||result.kind!=='friend'||!id(result.user_id)||result.user_id===ownerId||typeof result.state!=='string'||!['incoming','outgoing','accepted'].includes(result.state)||!integer(result.generation,1))fail();break;
  case 'friend_action':{const state={accept:'accepted',decline:'declined',cancel:'cancelled',remove:'removed',block:'blocked'}[request.verb];if(!keys(result,['kind','user_id','state','generation'])||result.kind!=='friend'||result.user_id!==request.other_id||result.user_id===ownerId||result.state!==state||(result.generation===null?request.verb!=='block'||request.expected_generation!==null:!integer(result.generation,1)))fail();break;}
  case 'unblock':if(!keys(result,['kind','user_id','state'])||result.kind!=='unblock'||result.user_id!==request.other_id||result.user_id===ownerId||result.state!=='unblocked')fail();break;
  case 'set_presence':if(!keys(result,['kind','enabled','account_revision'])||result.kind!=='presence'||result.enabled!==request.enabled||!integer(result.account_revision,request.expected_account_revision))fail();break;
  case 'create_invitation':if(!keys(result,['kind','challenge_id','state'])||result.kind!=='invitation'||result.challenge_id!==request.challenge_id||result.state!=='open')fail();break;
  case 'invitation_action':{const state={accept:'accepted',decline:'declined',withdraw:'withdrawn',cancel:'cancelled'}[request.verb];if(!keys(result,['kind','challenge_id','state'])||result.kind!=='invitation'||result.challenge_id!==request.challenge_id||result.state!==state)fail();break;}
 }
 return freeze({...value,request,result:{...result}}) as SocialReceipt;
 }catch{return fail('SOCIAL_INVALID_RESPONSE');}
}
export function validateSocialReceipt(value:unknown,ownerId:string,operation:SocialOperation):SocialReceipt{const expected=freezeSocialOperation(operation),receipt=validateSocialOperation(value,ownerId,expected.operationId);if(!receipt||canonical(receipt.request)!==canonical(expected.request))fail('SOCIAL_INVALID_RESPONSE');return receipt;}
export function validateSocialMutation(value:unknown,ownerId:string,operation:SocialOperation):SocialMutationResponse{
 freezeSocialOperation(operation);if(!id(ownerId))fail();if(object(value)&&Object.hasOwn(value,'error')){if(!keys(value,['error'])||!object(value.error)||!keys(value.error,['code'])||typeof value.error.code!=='string'||!(codes as readonly string[]).includes(value.error.code))fail('SOCIAL_INVALID_RESPONSE');return freeze(JSON.parse(JSON.stringify(value))) as SocialMutationResponse;}return validateSocialReceipt(value,ownerId,operation);
}
