import {bangkokPeriodBounds,classesForCategory} from './presentationModel';
import type * as T from './types';
export const rankedErrors=['RANKED_INVALID','RANKED_AUTH_REQUIRED','RANKED_PROFILE_REQUIRED','RANKED_UNAVAILABLE','RANKED_CHANGED','RANKED_COURSE_UNAVAILABLE','RANKED_RATE_LIMITED','ACCOUNT_DELETION_PENDING'] as const;
function fail():never{throw Error('RANKED_INVALID_RESPONSE');}
function obj(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))fail();const v=value as Record<string,unknown>;if(Object.keys(v).length!==keys.length||keys.some(key=>!Object.hasOwn(v,key)))fail();return v;}
function choice(value:unknown,values:readonly unknown[]){if(!values.includes(value))fail();}
function text(value:unknown,max=120){if(typeof value!=='string'||!value.trim()||[...value].length>max||/[\u0000-\u001f\u007f]/u.test(value))fail();return value;}
function num(value:unknown,min:number,max:number){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail();return value;}
function int(value:unknown,min=1,max=1000000){const n=num(value,min,max);if(!Number.isSafeInteger(n))fail();return n;}
function bool(value:unknown){if(typeof value!=='boolean')fail();}
export const isRankedId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function id(value:unknown){if(!isRankedId(value))fail();return value;}
function hash(value:unknown){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();}
function utc(value:unknown){if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value))fail();const stamp=Date.parse(value);if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,19)!==value.slice(0,19))fail();return value;}
function instantKey(value:string){const match=/^(.*?)(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value)!;return `${match[1]}.${(match[2]??'').padEnd(6,'0')}`;}
function arr(value:unknown,max:number):unknown[]{if(!Array.isArray(value)||value.length>max)fail();return value;}
function clone<TValue>(value:TValue):TValue{const copy=JSON.parse(JSON.stringify(value));function freeze(v:unknown){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}}freeze(copy);return copy;}
function canonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;return JSON.stringify(value);}
function course(value:unknown){const c=obj(value,['approval_id','config_hash','mode']);id(c.approval_id);hash(c.config_hash);choice(c.mode,['async','live']);return c;}
function filter(value:unknown){const f=obj(value,['schema_version','period','metric','category','class_key','scope','course']);choice(f.schema_version,[1]);choice(f.period,['today','week','month']);choice(f.metric,['sustained_speed','route_time']);choice(f.category,['scooter','motorcycle','car']);choice(f.scope,['global','friends']);choice(f.class_key,['all',...classesForCategory(f.category as T.RankedCategory)]);if(f.metric==='sustained_speed'&&f.course!==null)fail();if(f.course!==null)course(f.course);return f;}
export function rankedFilterKey(value:T.RankedFilter){return canonical(value);}
export function freezeRankedFilter(value:T.RankedFilter):T.RankedFilter{try{filter(value);return clone(value);}catch{throw Error('RANKED_INVALID');}}
export function validateRankedCursor(value:unknown,owner:string):T.RankedCursor|null{if(value===null)return null;const c=obj(value,['owner_id','filter_hash','board_revision','starts_at','ends_at','as_of','after_position']);if(id(c.owner_id)!==owner)fail();hash(c.filter_hash);hash(c.board_revision);utc(c.starts_at);utc(c.ends_at);utc(c.as_of);int(c.after_position);if(Date.parse(c.ends_at as string)<=Date.parse(c.starts_at as string))fail();return clone(value as T.RankedCursor);}
export function validateRankedCourseCursor(value:unknown):T.RankedCourseCursor|null{if(value===null)return null;const c=obj(value,['approval_id','mode']);id(c.approval_id);choice(c.mode,['async','live']);return clone(value as T.RankedCourseCursor);}
export function validateRankedError(value:unknown):T.RankedErrorEnvelope|null{if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,'error'))return null;const envelope=obj(value,['error']);if(!envelope.error||typeof envelope.error!=='object'||Array.isArray(envelope.error))fail();const e=envelope.error as Record<string,unknown>;obj(e,e.code==='RANKED_RATE_LIMITED'?['code','retry_after_ms']:['code']);choice(e.code,rankedErrors);if(e.code==='RANKED_RATE_LIMITED')int(e.retry_after_ms,1,86400000);return clone(value as T.RankedErrorEnvelope);}
const common=['record_id','user_id','rank','position','tied','profile','category','class_key','class_scheme_version','metadata_authority','completed_at','verified_at','provenance_unknown','metric','method','quality'];
function row(value:unknown,f:T.RankedFilter,window:T.RankedWindow):T.RankedRow{
 const metric=(value as Record<string,unknown>|null)?.metric;
 const r=obj(value,[...common,...(metric==='sustained_speed'?['sustained_kmh']:['elapsed_lower_ms','elapsed_upper_ms','course'])]);
 id(r.record_id);id(r.user_id);int(r.rank);int(r.position);if((r.rank as number)>(r.position as number))fail();bool(r.tied);bool(r.provenance_unknown);
 const profile=obj(r.profile,['name','handle']);text(profile.name,80);if(!/^[a-z0-9_]{3,24}$/.test(text(profile.handle,24)))fail();
 if(r.category!==f.category||r.metric!==f.metric)fail();choice(r.class_key,classesForCategory(f.category));if(f.class_key!=='all'&&r.class_key!==f.class_key)fail();choice(r.class_scheme_version,[1]);choice(r.metadata_authority,['unknown','self_reported']);
 const completed=utc(r.completed_at),verified=utc(r.verified_at);if(instantKey(completed)<instantKey(window.starts_at)||instantKey(completed)>=instantKey(window.ends_at)||instantKey(completed)>instantKey(window.as_of)||instantKey(verified)>instantKey(window.as_of))fail();
 if(metric==='sustained_speed'){choice(r.method,['sustained_min_3s_v1']);choice(r.quality,['submitted_evidence_consistency']);num(r.sustained_kmh,0,500);if(r.metadata_authority!=='unknown'||r.class_key!==`${f.category}:unknown`||r.provenance_unknown!==true)fail();}
 else{choice(r.method,['route_time_v1']);choice(r.quality,['native_evidence_consistency']);const lower=num(r.elapsed_lower_ms,10000,1800000),upper=num(r.elapsed_upper_ms,10000,1800000);if(upper<lower||!f.course||canonical(course(r.course))!==canonical(f.course))fail();}
 return value as T.RankedRow;
}
/** Canonical server ranks remain authoritative. This decoder never ranks a local page. */
export function validateRankedPage(value:unknown,owner:string,expected:T.RankedFilter,previous:T.RankedCursor|null=null):T.RankedPage{
 const p=obj(value,['owner_id','server_now','filter','period','board_revision','capabilities','items','podium','self','self_status','next_cursor']);if(id(p.owner_id)!==owner)fail();const serverNow=utc(p.server_now);filter(p.filter);if(canonical(p.filter)!==canonical(expected))fail();hash(p.board_revision);
 const window=obj(p.period,['timezone','starts_at','ends_at','as_of']);choice(window.timezone,['Asia/Bangkok']);utc(window.starts_at);utc(window.ends_at);const asOf=utc(window.as_of),bounds=bangkokPeriodBounds(new Date(Date.parse(asOf)).toISOString(),expected.period);
 if(Date.parse(window.starts_at as string)!==Date.parse(bounds.starts_at)||Date.parse(window.ends_at as string)!==Date.parse(bounds.ends_at)||instantKey(asOf)>instantKey(serverNow))fail();
 if(previous){validateRankedCursor(previous,owner);if(previous.board_revision!==p.board_revision||instantKey(previous.starts_at)!==instantKey(window.starts_at as string)||instantKey(previous.ends_at)!==instantKey(window.ends_at as string)||instantKey(previous.as_of)!==instantKey(asOf))fail();}
 const capabilities=obj(p.capabilities,['speed','route_time','publication']);Object.values(capabilities).forEach(bool);
 const period=window as T.RankedWindow,items=arr(p.items,30).map(v=>row(v,expected,period)),podium=arr(p.podium,3).map(v=>row(v,expected,period)),self=p.self===null?null:row(p.self,expected,period);
 choice(p.self_status,['ranked','private','unclassified','no_record']);if((p.self_status==='ranked')!==(self!==null)||self&&self.user_id!==owner)fail();
 let lastPosition=previous?.after_position??0,lastRank=0;const users=new Set<string>(),records=new Set<string>();
 for(const item of items){if(item.position<=lastPosition||item.rank<lastRank||users.has(item.user_id)||records.has(item.record_id))fail();lastPosition=item.position;lastRank=item.rank;users.add(item.user_id);records.add(item.record_id);}
 if(podium.some((entry,index)=>entry.position!==index+1)||new Set(podium.map(x=>x.user_id)).size!==podium.length)fail();
 const seen=new Map<string,string>();for(const item of [...items,...podium,...(self?[self]:[])]){const proof=canonical(item),old=seen.get(item.record_id);if(old&&old!==proof)fail();seen.set(item.record_id,proof);}
 const next=validateRankedCursor(p.next_cursor,owner);if(next&&(!items.length||next.after_position!==lastPosition||next.board_revision!==p.board_revision||instantKey(next.starts_at)!==instantKey(period.starts_at)||instantKey(next.ends_at)!==instantKey(period.ends_at)||instantKey(next.as_of)!==instantKey(asOf)||previous&&next.filter_hash!==previous.filter_hash))fail();
 return clone(value as T.RankedPage);
}
export function validateRankedCourses(value:unknown,owner:string,previous:T.RankedCourseCursor|null=null):T.RankedCoursePage{
 const p=obj(value,['owner_id','server_now','items','next_cursor']);if(id(p.owner_id)!==owner)fail();utc(p.server_now);if(previous)validateRankedCourseCursor(previous);
 let last=previous?`${previous.approval_id}:${previous.mode}`:'';
 const items=arr(p.items,30);for(const value of items){const c=obj(value,['approval_id','config_hash','mode','title','category','route_revision']);id(c.approval_id);hash(c.config_hash);choice(c.mode,['async','live']);text(c.title,120);choice(c.category,['scooter','motorcycle','car']);int(c.route_revision,1,2147483647);const key=`${c.approval_id}:${c.mode}`;if(key<=last)fail();last=key;}
 const next=validateRankedCourseCursor(p.next_cursor);if(next&&(!items.length||`${next.approval_id}:${next.mode}`!==last))fail();return clone(value as T.RankedCoursePage);
}
