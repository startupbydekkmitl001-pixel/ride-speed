import {classesForCategory} from './presentationModel';
import {isRankedId,rankedErrors} from './model';
import type {RankedMetric,RankedMutationError,RankedOwnCursor,RankedOwnPage,RankedOwnRecord,RankedPublication,RankedPublicationCursor,RankedPublicationPage,RankedReceipt,RankedRequest} from './types';

export type RankedOperation=Readonly<{owner_id:string;operation_id:string;request:RankedRequest}>;
export type StoredRankedOperation=RankedOperation&Readonly<{queued_at:string;last_error:string|null}>;
export const rankedMutationErrors=[...rankedErrors,'RANKED_OPERATION_CONFLICT','RANKED_PUBLICATION_CHANGED','RANKED_RECORD_UNAVAILABLE'] as const;
const localErrors=[...rankedMutationErrors,'RANKED_INVALID_RESPONSE','RANKED_CAPACITY','RANKED_INACTIVE','RANKED_MOVING','ACCOUNT_CHANGED','LOCAL_READ_FAILED','LOCAL_WRITE_FAILED'];
function fail():never{throw Error('RANKED_INVALID_RESPONSE');}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))fail();const v=value as Record<string,unknown>;if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();return v;}
function choice(value:unknown,options:readonly unknown[]){if(!options.includes(value))fail();}
function id(value:unknown):string{if(!isRankedId(value))fail();return value;}
function integer(value:unknown,min=0,max=2147483647):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)fail();return value;}
function number(value:unknown,min:number,max:number):number{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail();return value;}
function utc(value:unknown):string{if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(Date.parse(value)).toISOString().slice(0,19)!==value.slice(0,19))fail();return value;}
function instant(value:string){const match=/^(.*?)(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value)!;return `${match[1]}.${(match[2]??'').padEnd(6,'0')}`;}
function metric(value:unknown):RankedMetric{choice(value,['sustained_speed','route_time']);return value as RankedMetric;}
function clone<T>(value:T):T{const copy=JSON.parse(JSON.stringify(value));function freeze(v:unknown){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}}freeze(copy);return copy;}
export function rankedCanonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(rankedCanonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${rankedCanonical((value as Record<string,unknown>)[k])}`).join(',')}}`;return JSON.stringify(value);}
function request(value:unknown){const action=(value as Record<string,unknown>|null)?.action;
 const v=object(value,action==='publication_set'?['schema_version','action','metric','record_id','expected_revision','audience']:['schema_version','action','metric','record_id','reason','detail']);choice(v.schema_version,[1]);metric(v.metric);id(v.record_id);
 if(action==='publication_set'){integer(v.expected_revision);choice(v.audience,['private','friends','global']);}
 else{choice(v.action,['report_record']);choice(v.reason,['suspected_cheating','unsafe_activity','harassment','other']);if(typeof v.detail!=='string'||[...v.detail].length>500||/[\u0000-\u001f\u007f]/u.test(v.detail)||/[\uD800-\uDFFF]/u.test(v.detail))fail();}
 return value as RankedRequest;
}
export function freezeRankedRequest(value:RankedRequest):RankedRequest{try{return clone(request(value));}catch{throw Error('RANKED_INVALID');}}
function publicationState(value:unknown){const v=object(value,['revision','audience','updated_at']);integer(v.revision);choice(v.audience,['private','friends','global']);if(v.revision===0){if(v.audience!=='private'||v.updated_at!==null)fail();}else utc(v.updated_at);return v;}
export function validateRankedPublication(value:unknown,owner:string,selected:RankedMetric,recordId:string):RankedPublication{
 const v=object(value,['owner_id','metric','record_id','revision','audience','updated_at']);if(id(v.owner_id)!==owner||metric(v.metric)!==selected||id(v.record_id)!==recordId)fail();publicationState({revision:v.revision,audience:v.audience,updated_at:v.updated_at});return clone(value as RankedPublication);
}
export function validateRankedOperation(value:unknown,owner:string):RankedOperation{const v=object(value,['owner_id','operation_id','request']);if(id(v.owner_id)!==owner)fail();id(v.operation_id);request(v.request);return clone(value as RankedOperation);}
export function parseRankedOperations(value:unknown,owner?:string|null):StoredRankedOperation[]{if(value===undefined)return [];if(!Array.isArray(value))fail();if(value.length>32||new TextEncoder().encode(JSON.stringify(value)).byteLength>131072)throw Error('RANKED_CAPACITY');const seen=new Set<string>();return value.map(candidate=>{
 const v=object(candidate,['owner_id','operation_id','request','queued_at','last_error']),ownerId=id(v.owner_id);if(owner!==undefined&&ownerId!==owner)fail();const op=validateRankedOperation({owner_id:ownerId,operation_id:v.operation_id,request:v.request},ownerId);if(seen.has(op.operation_id))fail();seen.add(op.operation_id);utc(v.queued_at);if(v.last_error!==null&&!localErrors.includes(v.last_error as typeof localErrors[number]))fail();return clone(candidate as StoredRankedOperation);
 });}
export function validateRankedMutationError(value:unknown):RankedMutationError|null{
 if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,'error'))return null;
 const v=object(value,['error']),e=v.error as Record<string,unknown>;object(e,e?.code==='RANKED_RATE_LIMITED'?['code','retry_after_ms']:['code']);choice(e.code,rankedMutationErrors);if(e.code==='RANKED_RATE_LIMITED')integer(e.retry_after_ms,1,86400000);return clone(value as RankedMutationError);
}
export function validateRankedReceipt(value:unknown,owner:string,operation:RankedOperation):RankedReceipt{
 validateRankedOperation(operation,owner);const v=object(value,['owner_id','operation_id','request','applied_at','result']);if(id(v.owner_id)!==owner||id(v.operation_id)!==operation.operation_id||rankedCanonical(request(v.request))!==rankedCanonical(operation.request))fail();utc(v.applied_at);
 if(operation.request.action==='publication_set'){const result=validateRankedPublication(v.result,owner,operation.request.metric,operation.request.record_id);if(result.audience!==operation.request.audience||result.revision!==operation.request.expected_revision+1||result.updated_at!==v.applied_at)fail();}
 else{const r=object(v.result,['report_id','metric','record_id','state','created_at']);id(r.report_id);if(metric(r.metric)!==operation.request.metric||id(r.record_id)!==operation.request.record_id)fail();choice(r.state,['received']);if(instant(utc(r.created_at))>instant(v.applied_at as string))fail();}
 return clone(value as RankedReceipt);
}
export function validateRankedMutation(value:unknown,owner:string,operation:RankedOperation){return validateRankedMutationError(value)??validateRankedReceipt(value,owner,operation);}
export function validateRankedOwnCursor(value:unknown):RankedOwnCursor|null{if(value===null)return null;const v=object(value,['completed_at','record_id','metric']);utc(v.completed_at);id(v.record_id);metric(v.metric);return clone(value as RankedOwnCursor);}
function recordKey(v:RankedOwnCursor){return `${instant(v.completed_at)}:${v.record_id}:${v.metric}`;}
const common=['record_id','metric','method','quality','category','class_key','class_scheme_version','metadata_authority','completed_at','verified_at','provenance_unknown','publication'];
function ownRecord(value:unknown,now:string):RankedOwnRecord{
 const selected=(value as Record<string,unknown>|null)?.metric;
 const v=object(value,[...common,...(selected==='sustained_speed'?['sustained_kmh']:['elapsed_lower_ms','elapsed_upper_ms','course'])]);metric(selected);id(v.record_id);choice(v.category,['scooter','motorcycle','car']);choice(v.class_key,classesForCategory(v.category as RankedOwnRecord['category']));choice(v.class_scheme_version,[1]);choice(v.metadata_authority,['unknown','self_reported']);if(typeof v.provenance_unknown!=='boolean')fail();
 const completed=utc(v.completed_at),verified=utc(v.verified_at);if(instant(completed)>instant(verified)||instant(verified)>instant(now))fail();const pub=publicationState(v.publication);if(pub.updated_at!==null&&instant(utc(pub.updated_at))>instant(now))fail();
 if(selected==='sustained_speed'){choice(v.method,['sustained_min_3s_v1']);choice(v.quality,['submitted_evidence_consistency']);number(v.sustained_kmh,0,500);if(v.metadata_authority!=='unknown'||v.class_key!==`${v.category}:unknown`||v.provenance_unknown!==true)fail();}
 else{choice(v.method,['route_time_v1']);choice(v.quality,['native_evidence_consistency']);const lower=number(v.elapsed_lower_ms,10000,1800000),upper=number(v.elapsed_upper_ms,10000,1800000);if(upper<lower)fail();const c=object(v.course,['approval_id','config_hash','mode']);id(c.approval_id);if(typeof c.config_hash!=='string'||!/^[a-f0-9]{64}$/.test(c.config_hash))fail();choice(c.mode,['async','live']);}
 return value as RankedOwnRecord;
}
export function validateRankedOwnPage(value:unknown,owner:string,previous:RankedOwnCursor|null=null):RankedOwnPage{
 const p=object(value,['owner_id','server_now','items','next_cursor']);if(id(p.owner_id)!==owner)fail();const now=utc(p.server_now);if(!Array.isArray(p.items)||p.items.length>30)fail();if(previous)validateRankedOwnCursor(previous);
 const rows=p.items.map(v=>ownRecord(v,now)),seen=new Set<string>();let last=previous?recordKey(previous):null;
 for(const row of rows){const key=recordKey(row),identity=`${row.metric}:${row.record_id}`;if(last!==null&&key>=last||seen.has(identity))fail();seen.add(identity);last=key;}
 const next=validateRankedOwnCursor(p.next_cursor);if(next&&(!rows.length||recordKey(next)!==last))fail();return clone(value as RankedOwnPage);
}
export function validateRankedPublicationCursor(value:unknown):RankedPublicationCursor|null{if(value===null)return null;const v=object(value,['updated_at','record_id','metric']);utc(v.updated_at);id(v.record_id);metric(v.metric);return clone(value as RankedPublicationCursor);}
function publicationKey(v:RankedPublicationCursor){return `${instant(v.updated_at)}:${v.record_id}:${v.metric}`;}
/** Saved settings are not qualification or current leaderboard authority. */
export function validateRankedPublicationPage(value:unknown,owner:string,previous:RankedPublicationCursor|null=null):RankedPublicationPage{
 const p=object(value,['owner_id','server_now','items','next_cursor']);if(id(p.owner_id)!==owner)fail();const now=utc(p.server_now);if(!Array.isArray(p.items)||p.items.length>30)fail();if(previous)validateRankedPublicationCursor(previous);
 const seen=new Set<string>();let last=previous?publicationKey(previous):null;
 for(const input of p.items){const row=input as RankedPublication,v=validateRankedPublication(input,owner,metric(row?.metric),id(row?.record_id));if(v.revision<1||v.updated_at===null||instant(v.updated_at)>instant(now))fail();const key=publicationKey({...v,updated_at:v.updated_at}),identity=`${v.metric}:${v.record_id}`;if(last!==null&&key>=last||seen.has(identity))fail();seen.add(identity);last=key;}
 const next=validateRankedPublicationCursor(p.next_cursor);if(next&&(!p.items.length||publicationKey(next)!==last))fail();return clone(value as RankedPublicationPage);
}
