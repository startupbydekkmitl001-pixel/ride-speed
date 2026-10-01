import type {Session} from '@supabase/supabase-js';
import {accountClient,isAccountCurrent,type AuthScope} from '../../state/AuthState';
import {getRouteOwner,getRouteProjection} from '../routes/syncService';
import {sharePreview} from '../routes/compatibilityModel';
import type {RouteCategory,RouteProjection} from '../routes/syncTypes';
import {getSocialSnapshot} from './service';
import {isSocialInstant} from './model';
import type {FriendRow,SocialCursor} from './types';

export type InvitationRoute={id:string;owner_id:string;title:string;revision:number;category:RouteCategory;approved_course_id:string|null;approved_revision:number|null;updated_at:string};
export type InvitationCourse={id:string;name:string;closed_course_approved:true};
export type InvitationSession={id:string;course_id:string;starts_at:string;ends_at:string;approved:true};
export type InvitationRouteCursor={updated_at:string;id:string};
export type InvitationSessionCursor={starts_at:string;id:string};
export type InvitationChoices={routes:InvitationRoute[];courses:InvitationCourse[];sessions:InvitationSession[];routeCursor:InvitationRouteCursor|null;courseCursor:string|null;sessionCursor:InvitationSessionCursor|null};
export type InvitationReviewInput={route:InvitationRoute;friend:FriendRow;mode:'group_ride'|'timed_race';startsAt:string;endsAt:string;sessionId:string|null};
export type InvitationReview=InvitationReviewInput&{shared:RouteProjection;course:InvitationCourse|null;session:InvitationSession|null};
const routeColumns='id,owner_id,title,revision,category,approved_course_id,approved_revision,updated_at';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function record(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('SOCIAL_INVALID_RESPONSE');return value as Record<string,unknown>;}
function exactKeys(value:Record<string,unknown>,keys:readonly string[]){if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw Error('SOCIAL_INVALID_RESPONSE');}
const integer=(value:unknown)=>Number.isInteger(value)&&Number(value)>=1&&Number(value)<=2147483647;
function text(value:unknown,max:number):value is string{return typeof value==='string'&&value.trim().length>0&&[...value].length<=max&&!/[\u0000-\u001f\u007f]/.test(value);}
const id=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
function routeRow(value:unknown,owner:string):InvitationRoute{
 const v=record(value);exactKeys(v,routeColumns.split(','));if(!id(v.id)||v.owner_id!==owner||!text(v.title,80)||!integer(v.revision)||!isSocialInstant(v.updated_at)||!['scooter','motorcycle','car','bicycle'].includes(String(v.category))||(v.approved_course_id!==null&&!id(v.approved_course_id))||(v.approved_revision!==null&&!integer(v.approved_revision)))throw Error('SOCIAL_INVALID_RESPONSE');return {...v} as InvitationRoute;
}
function courseRow(value:unknown):InvitationCourse{const v=record(value);exactKeys(v,['id','name','closed_course_approved']);if(!id(v.id)||!text(v.name,120)||v.closed_course_approved!==true)throw Error('SOCIAL_INVALID_RESPONSE');return {...v} as InvitationCourse;}
function sessionRow(value:unknown):InvitationSession{const v=record(value);exactKeys(v,['id','course_id','starts_at','ends_at','approved']);if(!id(v.id)||!id(v.course_id)||v.approved!==true||!isSocialInstant(v.starts_at)||!isSocialInstant(v.ends_at)||Date.parse(v.ends_at)<=Date.parse(v.starts_at))throw Error('SOCIAL_INVALID_RESPONSE');return {...v} as InvitationSession;}
function fence(scope:AuthScope,session:Session){if(!isAccountCurrent(scope)||!scope.userId||session.user.id!==scope.userId)throw Error('ACCOUNT_CHANGED');}
function bounded<T>(value:unknown,decode:(value:unknown)=>T):T[]{if(!Array.isArray(value)||value.length>31)throw Error('SOCIAL_INVALID_RESPONSE');return value.map(decode);}
function checked<T>(response:{data:T;error:unknown}){if(response.error)throw Error('SOCIAL_UNAVAILABLE');return response.data;}
/** Only owner route metadata / approved sessions. No legacy mutation is called. */
export async function getInvitationChoices(scope:AuthScope,session:Session):Promise<InvitationChoices>{
 fence(scope,session);const [routes,courses,sessions]=await Promise.all([getInvitationRoutePage(scope,session),getInvitationCoursePage(scope,session),getInvitationSessionPage(scope,session)]);fence(scope,session);
 return {routes:routes.routes,courses:courses.courses,sessions:sessions.sessions,routeCursor:routes.nextCursor,courseCursor:courses.nextCursor,sessionCursor:sessions.nextCursor};
}
export async function getInvitationRoutePage(scope:AuthScope,session:Session,cursor:InvitationRouteCursor|null=null){
 fence(scope,session);if(cursor&&(!id(cursor.id)||!isSocialInstant(cursor.updated_at)))throw Error('SOCIAL_INVALID');
 let query=accountClient(scope,session).from('rs_routes').select(routeColumns).eq('owner_id',scope.userId!).order('updated_at',{ascending:false}).order('id',{ascending:false}).limit(31);
 if(cursor)query=query.or(`updated_at.lt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.lt.${cursor.id})`);
 const response=await query;fence(scope,session);const all=bounded(checked(response),value=>routeRow(value,scope.userId!)),routes=all.slice(0,30),last=routes.at(-1);
 return {routes,nextCursor:all.length>30&&last?{updated_at:last.updated_at,id:last.id}:null};
}
export async function getInvitationCoursePage(scope:AuthScope,session:Session,cursor:string|null=null){
 fence(scope,session);if(cursor&&!id(cursor))throw Error('SOCIAL_INVALID');
 let query=accountClient(scope,session).from('rs_courses').select('id,name,closed_course_approved').eq('closed_course_approved',true).order('id').limit(31);if(cursor)query=query.gt('id',cursor);
 const response=await query;fence(scope,session);const all=bounded(checked(response),courseRow),courses=all.slice(0,30);
 return {courses,nextCursor:all.length>30?courses.at(-1)!.id:null};
}
export async function getInvitationSessionPage(scope:AuthScope,session:Session,cursor:InvitationSessionCursor|null=null){
 fence(scope,session);if(cursor&&(!id(cursor.id)||!isSocialInstant(cursor.starts_at)))throw Error('SOCIAL_INVALID');
 let query=accountClient(scope,session).from('rs_course_sessions').select('id,course_id,starts_at,ends_at,approved').eq('approved',true).gt('ends_at',new Date().toISOString()).order('starts_at').order('id').limit(31);
 if(cursor)query=query.or(`starts_at.gt.${cursor.starts_at},and(starts_at.eq.${cursor.starts_at},id.gt.${cursor.id})`);
 const response=await query;fence(scope,session);const all=bounded(checked(response),sessionRow),sessions=all.slice(0,30),last=sessions.at(-1);
 return {sessions,nextCursor:all.length>30&&last?{starts_at:last.starts_at,id:last.id}:null};
}
/** Review never adopts a newer generation or route revision behind the user's back. */
export async function reviewInvitation(scope:AuthScope,session:Session,input:InvitationReviewInput,now=Date.now()):Promise<InvitationReview>{
 fence(scope,session);const client=accountClient(scope,session),start=Date.parse(input.startsAt),end=Date.parse(input.endsAt);
 if(!Number.isFinite(now)||!Number.isFinite(start)||!Number.isFinite(end)||start<=now||end<=start||end-start>86400000)throw Error('SOCIAL_WINDOW_INVALID');
 const response=await client.from('rs_routes').select(routeColumns).eq('id',input.route.id).eq('owner_id',scope.userId!).maybeSingle();fence(scope,session);
 const currentRoute=checked(response);if(!currentRoute)throw Error('SOCIAL_ROUTE_CHANGED');const route=routeRow(currentRoute,scope.userId!);
 if(route.id!==input.route.id||route.revision!==input.route.revision||route.title!==input.route.title||route.category!==input.route.category)throw Error('SOCIAL_ROUTE_CHANGED');
 let cursor:SocialCursor|null=null,friend:FriendRow|undefined;const seen=new Set<string>();
 for(let pageNumber=0;pageNumber<10;pageNumber++){
  const page=await getSocialSnapshot(scope,session,30,cursor);fence(scope,session);if(!page.self.profile_ready)throw Error('PROFILE_REQUIRED');
  friend=page.items.find(value=>value.user_id===input.friend.user_id);if(friend)break;
  cursor=page.next_cursor;if(!cursor)break;const key=JSON.stringify(cursor);if(seen.has(key))throw Error('SOCIAL_INVALID_RESPONSE');seen.add(key);
 }
 if(!friend||friend.state!=='accepted'||friend.generation!==input.friend.generation||friend.handle!==input.friend.handle)throw Error('FRIEND_CHANGED');
 const [owner,shared]=await Promise.all([getRouteOwner(scope,session,route.id),getRouteProjection(scope,session,route.id)]);fence(scope,session);
 sharePreview(owner,shared);if(!shared||shared.revision!==route.revision)throw Error('SOCIAL_ROUTE_CHANGED');
 let course:InvitationCourse|null=null,courseSession:InvitationSession|null=null;
 if(input.mode==='timed_race'){
  if(!route.approved_course_id||route.approved_revision!==route.revision||!input.sessionId)throw Error('SOCIAL_COURSE_CHANGED');
  const [a,b]=await Promise.all([client.from('rs_courses').select('id,name,closed_course_approved').eq('id',route.approved_course_id).eq('closed_course_approved',true).maybeSingle(),client.from('rs_course_sessions').select('id,course_id,starts_at,ends_at,approved').eq('id',input.sessionId).eq('approved',true).maybeSingle()]);fence(scope,session);
  if(!checked(a)||!checked(b))throw Error('SOCIAL_COURSE_CHANGED');course=courseRow(a.data);courseSession=sessionRow(b.data);
  if(course.id!==route.approved_course_id||courseSession.id!==input.sessionId||courseSession.course_id!==course.id||Date.parse(courseSession.starts_at)>start||Date.parse(courseSession.ends_at)<end)throw Error('SOCIAL_COURSE_CHANGED');
 }else if(input.sessionId!==null)throw Error('SOCIAL_INVALID');
 return {...input,route,friend,shared,course,session:courseSession};
}
