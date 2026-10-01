import type { RouteDeleteDraft, RouteDocumentV1, RoutePage, RouteProjection, RouteSnapshot, RouteSyncAck, RouteSyncDraft } from './syncTypes';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const categories=['scooter','motorcycle','car','bicycle'],visibilities=['private','friends','public'];
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,required:readonly string[],optional:readonly string[]=[])=>required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&[...v].length>=1&&[...v].length<=max&&!!v.trim()&&!/[\u0000-\u001f\u007f]/.test(v)&&!/[\uD800-\uDFFF]/u.test(v);
const enumValue=(v:unknown,values:readonly string[])=>typeof v==='string'&&values.includes(v);
const integer=(v:unknown,low=0,high=2147483647):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=low&&v<=high;
const number=(v:unknown,max:number,nullable=true)=>v===null?nullable:typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const stamp=(v:unknown):v is string=>typeof v==='string'&&v.length<=50&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
/** PostgreSQL ordering keeps microseconds; Date.parse alone rounds away cursor identity. */
export function compareRouteTimestamps(a:string,b:string):number{
 if(!stamp(a)||!stamp(b))invalid('ROUTE_SYNC_INVALID_RESPONSE');
 const micros=(v:string)=>BigInt(Date.parse(v))*1000n+BigInt(Number((v.match(/\.(\d{1,6})(?:Z|[+-])/i)?.[1]??'').padEnd(6,'0'))%1000);
 const left=micros(a),right=micros(b);return left<right?-1:left>right?1:0;
}
function invalid(code='ROUTE_INVALID'):never{throw Error(code);}
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.freeze(v);for(const child of Object.values(v))freeze(child);}return v;}
function databaseJSON(v:unknown):string{if(Array.isArray(v))return '['+v.map(databaseJSON).join(', ')+']';if(object(v))return '{'+Object.entries(v).map(([k,x])=>JSON.stringify(k)+': '+databaseJSON(x)).join(', ')+'}';return JSON.stringify(v);}
function coordinate(v:unknown):boolean{return object(v)&&keys(v,['latitude','longitude'])&&typeof v.latitude==='number'&&Number.isFinite(v.latitude)&&Math.abs(v.latitude)<=90&&typeof v.longitude==='number'&&Number.isFinite(v.longitude)&&Math.abs(v.longitude)<=180;}
function segments(v:unknown):boolean{if(!Array.isArray(v)||v.length>32)return false;let count=0;for(const p of v){if(!Array.isArray(p)||p.length<1||p.length>4096||!p.every(coordinate))return false;count+=p.length;}return count<=10000&&new TextEncoder().encode(databaseJSON(v)).byteLength<=1048576;}
/** Decode each recording part independently; never join across a pause or invalid fix. */
export function decodeRoutePolyline(encoded:unknown):readonly {latitude:number;longitude:number}[]{
 if(typeof encoded!=='string'||!encoded||encoded.length>65536)invalid();let cursor=0,lat=0,lng=0;const points:{latitude:number;longitude:number}[]=[];
 while(cursor<encoded.length){const deltas:number[]=[];for(let axis=0;axis<2;axis++){let value=0,shift=0,groups=0,digit=0;do{if(cursor>=encoded.length||++groups>7)invalid();digit=encoded.charCodeAt(cursor++)-63;if(digit<0||digit>63)invalid();value+=(digit&31)*2**shift;shift+=5;}while(digit>=32);if(groups>1&&digit===0||value>4294967295)invalid();deltas.push(value%2?-Math.floor(value/2)-1:Math.floor(value/2));}lat+=deltas[0];lng+=deltas[1];if(Math.abs(lat)>9000000||Math.abs(lng)>18000000||points.length>=4096)invalid();points.push({latitude:lat/1e5,longitude:lng/1e5});}return freeze(points);
}
export function validateRouteDocument(value:unknown):RouteDocumentV1{
 if(!object(value)||!keys(value,['schema_version','title','category','visibility','stops','source'])||value.schema_version!==1||!text(value.title,80)||!enumValue(value.category,categories)||!enumValue(value.visibility,visibilities)||!Array.isArray(value.stops)||value.stops.length>12)invalid();
 for(const stop of value.stops){if(!object(stop)||!keys(stop,['lat','lng','label'],['place_id'])||!coordinate({latitude:stop.lat,longitude:stop.lng})||!text(stop.label,80)||Object.hasOwn(stop,'place_id')&&!text(stop.place_id,300))invalid();}
 const source=value.source;if(!object(source)||source.kind!=='draft'&&value.stops.length<2)invalid();
 if(source.kind==='road'){if(!keys(source,['kind','routeToken'])||typeof source.routeToken!=='string'||!uuid.test(source.routeToken))invalid();}
 else if(source.kind==='recorded'){if(!keys(source,['kind','segments'])||!Array.isArray(source.segments)||source.segments.length<1||source.segments.length>32)invalid();let n=0;for(const part of source.segments){n+=decodeRoutePolyline(part).length;if(n>10000)invalid('ROUTE_TOO_LARGE');}}
 else if(source.kind!=='draft'||!keys(source,['kind']))invalid();
 if(new TextEncoder().encode(databaseJSON(value)).byteLength>524288)invalid('ROUTE_TOO_LARGE');
 return freeze(JSON.parse(JSON.stringify(value))) as RouteDocumentV1;
}
export function freezeRouteDraft(value:unknown):RouteSyncDraft{
 if(!object(value)||!keys(value,['operationId','routeId','expectedRevision','document'])||typeof value.operationId!=='string'||!uuid.test(value.operationId)||typeof value.routeId!=='string'||!uuid.test(value.routeId)||!integer(value.expectedRevision,0,2147483646))invalid();
 return freeze({operationId:value.operationId,routeId:value.routeId,expectedRevision:value.expectedRevision,document:validateRouteDocument(value.document)});
}
export function freezeRouteDeleteDraft(value:unknown):RouteDeleteDraft{
 if(!object(value)||!keys(value,['operationId','routeId','expectedRevision'])||typeof value.operationId!=='string'||!uuid.test(value.operationId)||typeof value.routeId!=='string'||!uuid.test(value.routeId)||!integer(value.expectedRevision,1))invalid();return freeze({...value}) as RouteDeleteDraft;
}
export function validateRouteOperation(value:unknown,operationId:string):RouteSyncAck|null{
 if(!uuid.test(operationId))invalid();if(value===null)return null;
 if(!object(value)||!keys(value,['operation_id','route_id','action','applied_revision','current_revision','document_sha256','synced_at'])||value.operation_id!==operationId||typeof value.route_id!=='string'||!uuid.test(value.route_id)||!enumValue(value.action,['save','delete'])||!integer(value.applied_revision,1)||!stamp(value.synced_at)||value.current_revision!==null&&!integer(value.current_revision,value.applied_revision)||value.action==='save'&&(typeof value.document_sha256!=='string'||!hash.test(value.document_sha256))||value.action==='delete'&&(value.document_sha256!==null||value.current_revision!==null))invalid('ROUTE_SYNC_INVALID_RESPONSE');return freeze({...value}) as RouteSyncAck;
}
export function validateRouteAck(value:unknown,draft:RouteSyncDraft|RouteDeleteDraft,action:'save'|'delete'):RouteSyncAck{
 const ack=validateRouteOperation(value,draft.operationId);if(!ack||ack.route_id!==draft.routeId||ack.action!==action||ack.applied_revision!==draft.expectedRevision+(action==='save'?1:0))invalid('ROUTE_SYNC_INVALID_RESPONSE');return ack;
}
export function validateRouteSnapshot(value:unknown,ownerId:string):RouteSnapshot|null{
 if(value===null)return null;try{
 if(!object(value)||!keys(value,['id','owner_id','revision','document','segments','distanceMeters','durationSeconds','geometryHash','provider','calculatedAt','attribution','updated_at'])||typeof value.id!=='string'||!uuid.test(value.id)||value.owner_id!==ownerId||!integer(value.revision,1)||!stamp(value.updated_at)||!segments(value.segments)||!number(value.distanceMeters,10000000)||!number(value.durationSeconds,604800)||!enumValue(value.provider,['geoapify','recorded','draft'])||value.geometryHash!==null&&(typeof value.geometryHash!=='string'||!hash.test(value.geometryHash))||value.calculatedAt!==null&&!stamp(value.calculatedAt)||value.attribution!==null&&!text(value.attribution,300))invalid();
 const document=validateRouteDocument(value.document);
 if(value.provider==='geoapify'&&(document.source.kind!=='road'||value.distanceMeters===null||value.durationSeconds===null||value.calculatedAt===null||value.attribution===null)||value.provider==='recorded'&&document.source.kind!=='recorded'||value.provider==='draft'&&(document.source.kind!=='draft'||(value.segments as unknown[]).length!==0||value.geometryHash!==null||value.distanceMeters!==null||value.durationSeconds!==null||value.calculatedAt!==null)||value.provider!=='draft'&&((value.segments as unknown[]).length===0||value.geometryHash===null))invalid();
 return freeze({...value,document,segments:JSON.parse(JSON.stringify(value.segments))}) as RouteSnapshot;
 }catch{return invalid('ROUTE_SYNC_INVALID_RESPONSE');}
}
export function validateRoutePage(value:unknown,ownerId:string):RoutePage{
 if(!object(value)||!keys(value,['items','next_cursor'])||!Array.isArray(value.items)||value.items.length>50)invalid('ROUTE_SYNC_INVALID_RESPONSE');const items=value.items.map(x=>validateRouteSnapshot(x,ownerId));if(items.some(x=>x===null))invalid('ROUTE_SYNC_INVALID_RESPONSE');
 const seen=new Set<string>();let previous:RouteSnapshot|null=null;for(const item of items){if(!item||seen.has(item.id)||previous&&(compareRouteTimestamps(previous.updated_at,item.updated_at)<0||compareRouteTimestamps(previous.updated_at,item.updated_at)===0&&previous.id<=item.id))invalid('ROUTE_SYNC_INVALID_RESPONSE');seen.add(item.id);previous=item;}
 const cursor=value.next_cursor;if(cursor!==null&&(!object(cursor)||!keys(cursor,['updated_at','id'])||!previous||cursor.updated_at!==previous.updated_at||cursor.id!==previous.id))invalid('ROUTE_SYNC_INVALID_RESPONSE');return freeze({items,next_cursor:cursor}) as RoutePage;
}
export function validateRouteProjection(value:unknown):RouteProjection|null{
 if(value===null)return null;if(!object(value)||!keys(value,['id','owner_id','revision','title','category','visibility','segments','geometryStatus','privacyTrimMeters','geometryHash','provider','attribution'])||typeof value.id!=='string'||!uuid.test(value.id)||typeof value.owner_id!=='string'||!uuid.test(value.owner_id)||!integer(value.revision,1)||!text(value.title,80)||!enumValue(value.category,categories)||!enumValue(value.visibility,visibilities)||!segments(value.segments)||!enumValue(value.geometryStatus,['trimmed','hidden'])||value.privacyTrimMeters!==200||!enumValue(value.provider,['geoapify','recorded','draft'])||value.attribution!==null&&!text(value.attribution,300))invalid('ROUTE_SYNC_INVALID_RESPONSE');
 if(value.geometryStatus==='hidden'?value.geometryHash!==null||(value.segments as unknown[]).length!==0:typeof value.geometryHash!=='string'||!hash.test(value.geometryHash)||(value.segments as unknown[]).length===0||(value.segments as unknown[][]).some(p=>p.length<2))invalid('ROUTE_SYNC_INVALID_RESPONSE');return freeze(JSON.parse(JSON.stringify(value))) as RouteProjection;
}
export async function sendRouteOperation(value:RouteSyncDraft|RouteDeleteDraft,action:'save'|'delete',api:{send:(draft:RouteSyncDraft|RouteDeleteDraft)=>Promise<unknown>;status:(operationId:string)=>Promise<unknown>},current:()=>void):Promise<RouteSyncAck>{
 current();const draft=action==='save'?freezeRouteDraft(value):freezeRouteDeleteDraft(value);let result:unknown;
 try{result=await api.send(draft);current();}catch(error){current();const message=error instanceof Error?error.message:'';if(message.startsWith('ROUTE_')&&message!=='ROUTE_SYNC_UNAVAILABLE'||message==='ACCOUNT_CHANGED'||message==='ACCOUNT_DELETION_PENDING')throw error;const receipt=await api.status(draft.operationId);current();if(receipt===null)throw error;return validateRouteAck(receipt,draft,action);}return validateRouteAck(result,draft,action);
}
