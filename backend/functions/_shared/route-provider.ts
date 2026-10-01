export class RouteProviderError extends Error{
 status:number;code:string;reason:RouteProviderReason|null;constructor(status:number,code:string,reason:RouteProviderReason|null=null){super(code);this.status=status;this.code=code;this.reason=reason;}
}
const reasons=['collection','no_route','feature','geometry_type','part_count','properties','distance_units_lowercase_meters','distance_units_m','distance_units_absent','distance_units_imperial','distance_units_other','distance','distance_limit','duration','part_size','coordinate_dimensions','coordinate_bounds','point_limit'] as const;
type RouteProviderReason=typeof reasons[number];
/** Static diagnostics only; never reflect provider values, URLs or error text. */
export function routeProviderFailureReason(error:unknown):RouteProviderReason|null{return error instanceof RouteProviderError&&reasons.includes(error.reason as RouteProviderReason)?error.reason:null;}
type Coordinate={latitude:number;longitude:number};
export type RouteProviderRequest={operation:'search';query:string;language:'th'|'en';consent:true;proximity?:Coordinate}|{operation:'route';stops:Coordinate[];profile:'scooter'|'motorcycle'|'drive';consent:true};
const attribution='© OpenStreetMap contributors · Powered by Geoapify';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,required:string[],optional:string[]=[])=>required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&[...v].length>=1&&[...v].length<=max&&!!v.trim()&&!/[\u0000-\u001f\u007f]/.test(v)&&!/[\uD800-\uDFFF]/u.test(v);
const number=(v:unknown,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
function coordinate(v:unknown):v is Coordinate{return object(v)&&keys(v,['latitude','longitude'])&&typeof v.latitude==='number'&&Number.isFinite(v.latitude)&&Math.abs(v.latitude)<=90&&typeof v.longitude==='number'&&Number.isFinite(v.longitude)&&Math.abs(v.longitude)<=180;}
function unavailable(reason:RouteProviderReason):never{throw new RouteProviderError(503,'PROVIDER_UNAVAILABLE',reason);}
/** Extract only known metric work for conservative budget reconciliation, even if too long to return. */
export function routeProviderDistance(value:unknown):number|null{
 if(!object(value)||value.type!=='FeatureCollection'||!Array.isArray(value.features)||!object(value.features[0])||!object(value.features[0].properties))return null;const p=value.features[0].properties;
 return (p.distance_units==='Meters'||p.distance_units==='meters')&&number(p.distance,1000000000)?p.distance as number:null;
}
export async function readRouteServiceRequest(req:Request):Promise<RouteProviderRequest>{
 if(!req.body)throw new RouteProviderError(400,'INVALID_REQUEST');const reader=req.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 while(true){const{done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384){await reader.cancel();throw new RouteProviderError(413,'REQUEST_TOO_LARGE');}chunks.push(value);}
 const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}let body:unknown;
 try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw new RouteProviderError(400,'INVALID_REQUEST');}
 if(!object(body)||body.consent!==true)throw new RouteProviderError(400,'INVALID_REQUEST');
 if(body.operation==='search'&&keys(body,['operation','query','language','consent'],['proximity'])&&typeof body.query==='string'&&(body.language==='th'||body.language==='en')&&(!Object.hasOwn(body,'proximity')||coordinate(body.proximity))){
 const query=body.query.normalize('NFC').replace(/\s+/g,' ').trim();if(!text(query,120)||[...query].length<3)throw new RouteProviderError(400,'INVALID_REQUEST');
 return{operation:'search',query,language:body.language,consent:true,...(body.proximity?{proximity:{latitude:Math.round((body.proximity as Coordinate).latitude*100)/100,longitude:Math.round((body.proximity as Coordinate).longitude*100)/100}}:{})};
 }
 if(body.operation==='route'&&keys(body,['operation','stops','profile','consent'])&&['scooter','motorcycle','drive'].includes(String(body.profile))&&typeof body.profile==='string'&&Array.isArray(body.stops)&&body.stops.length>=2&&body.stops.length<=12&&body.stops.every(coordinate))return{operation:'route',stops:body.stops.map(p=>({...p})),profile:body.profile as 'scooter'|'motorcycle'|'drive',consent:true};
 throw new RouteProviderError(400,'INVALID_REQUEST');
}
/** Fixed allowlisted upstream endpoint; no caller-controlled URL or paid extras. */
export function routeProviderURL(request:RouteProviderRequest,key:string):string{
 const url=new URL(request.operation==='route'?'https://api.geoapify.com/v1/routing':'https://api.geoapify.com/v1/geocode/autocomplete');url.searchParams.set('apiKey',key);
 if(request.operation==='route'){url.searchParams.set('waypoints',request.stops.map(p=>`${p.latitude},${p.longitude}`).join('|'));url.searchParams.set('mode',request.profile);url.searchParams.set('format','geojson');url.searchParams.set('units','metric');url.searchParams.set('traffic','free_flow');}
 else{url.searchParams.set('text',request.query);url.searchParams.set('lang',request.language);url.searchParams.set('limit','5');url.searchParams.set('format','geojson');url.searchParams.set('filter','countrycode:th');if(request.proximity)url.searchParams.set('bias',`proximity:${request.proximity.longitude},${request.proximity.latitude}`);}
 return url.href;
}
/** Whitelist normalized fields; upstream request properties can contain secret-bearing parameters. */
export function normalizeRouteProviderResult(request:RouteProviderRequest,value:unknown,now:Date):Record<string,unknown>{
 if(!object(value)||value.type!=='FeatureCollection'||!Array.isArray(value.features))unavailable('collection');
 if(request.operation==='search'){
 const items:{id:string;label:string;subtitle:string;latitude:number;longitude:number}[]=[];const seen=new Set<string>();
 for(const feature of value.features.slice(0,5)){
 if(!object(feature)||!object(feature.properties)||!object(feature.geometry)||feature.geometry.type!=='Point'||!Array.isArray(feature.geometry.coordinates)||feature.geometry.coordinates.length!==2)continue;
 const p=feature.properties,c=feature.geometry.coordinates,label=p.address_line1??p.formatted,subtitle=p.address_line2??'';
 if(!text(p.place_id,300)||!text(label,300)||typeof subtitle!=='string'||[...subtitle].length>300||/[\u0000-\u001f\u007f]/.test(subtitle)||!coordinate({latitude:c[1],longitude:c[0]})||seen.has(p.place_id))continue;
 seen.add(p.place_id);items.push({id:p.place_id,label,subtitle,latitude:c[1],longitude:c[0]});
 }return{items,attribution};
 }
 if(value.features.length===0)throw new RouteProviderError(404,'NO_ROUTE','no_route');const feature=value.features[0];
 if(!object(feature)||!object(feature.geometry))unavailable('feature');
 if(feature.geometry.type!=='MultiLineString')unavailable('geometry_type');
 if(!Array.isArray(feature.geometry.coordinates)||feature.geometry.coordinates.length<1||feature.geometry.coordinates.length>32)unavailable('part_count');
 if(!object(feature.properties))unavailable('properties');
 const p=feature.properties;if(typeof p.distance==='number'&&Number.isFinite(p.distance)&&p.distance>450000)throw new RouteProviderError(400,'ROUTE_DISTANCE_LIMIT','distance_limit');
 // Hosted Geoapify returned lowercase `meters`; docs show `Meters`. Both are SI metres.
 if(p.distance_units!=='Meters'&&p.distance_units!=='meters'){
  if(!Object.hasOwn(p,'distance_units'))unavailable('distance_units_absent');
  if(p.distance_units==='m')unavailable('distance_units_m');
  if(['Miles','miles','mi','imperial'].includes(String(p.distance_units)))unavailable('distance_units_imperial');
  unavailable('distance_units_other');
 }
 if(!number(p.distance,450000))unavailable('distance');if(!number(p.time,604800))unavailable('duration');const segments:Coordinate[][]=[];let count=0;
 for(const part of feature.geometry.coordinates){if(!Array.isArray(part)||part.length<2||part.length>4096)unavailable('part_size');const segment:Coordinate[]=[];for(const pair of part){if(!Array.isArray(pair)||pair.length!==2)unavailable('coordinate_dimensions');if(!coordinate({latitude:pair[1],longitude:pair[0]}))unavailable('coordinate_bounds');segment.push({latitude:pair[1],longitude:pair[0]});}count+=segment.length;if(count>10000)unavailable('point_limit');segments.push(segment);}
 return{provider:'geoapify',profile:request.profile,segments,distanceMeters:p.distance,durationSeconds:p.time,calculatedAt:now.toISOString(),attribution};
}
