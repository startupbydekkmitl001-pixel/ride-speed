import {authenticate,failure,HttpError,preflight,response} from '../_shared/http.ts';
import {normalizeRouteProviderResult,readRouteServiceRequest,RouteProviderError,routeProviderDistance,routeProviderFailureReason,routeProviderURL} from '../_shared/route-provider.ts';
async function readProvider(response:Response):Promise<unknown>{
 if(!response.body)throw new HttpError(503,'PROVIDER_UNAVAILABLE');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 while(true){const{done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1048576){await reader.cancel();throw new HttpError(503,'PROVIDER_UNAVAILABLE');}chunks.push(value);}
 const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw new HttpError(503,'PROVIDER_UNAVAILABLE');}
}
Deno.serve(async(req:Request)=>{
 let stage='auth',upstreamStatus:number|null=null,databaseCode:string|null=null;
 try{
 const early=preflight(req);if(early)return early;const{userId,admin}=await authenticate(req);const request=await readRouteServiceRequest(req);
 const key=Deno.env.get('GEOAPIFY_API_KEY');if(!key)throw new HttpError(503,'SERVER_CONFIGURATION');
 stage='claim';const claim=await admin.rpc('rs_route_service_claim',{p_owner:userId,p_request:request});databaseCode=claim.error?.code??null;
 if(claim.error){const code=claim.error.message;if(code==='QUOTA_EXCEEDED'||code==='THROTTLED')throw new HttpError(429,code);if(code==='INVALID_REQUEST'||code==='ROUTE_DISTANCE_LIMIT')throw new HttpError(400,code);if(code==='ACCOUNT_DELETION_PENDING')throw new HttpError(409,code);throw new HttpError(503,'PROVIDER_UNAVAILABLE');}
 const data=claim.data;
 if(data?.state==='cached'&&data.result&&typeof data.result==='object')return response(req,{...data.result,cached:true});
 if(data?.state!=='claimed'||typeof data.lease!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(data.lease))throw new HttpError(503,'PROVIDER_UNAVAILABLE');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),8000);let normalized:Record<string,unknown>;
 try{
 stage='upstream';const upstream=await fetch(routeProviderURL(request,key),{signal:abort.signal,redirect:'error',headers:{Accept:'application/geo+json, application/json'}});upstreamStatus=upstream.status;
 if(!upstream.ok){if(upstream.status===404&&request.operation==='route')throw new HttpError(404,'NO_ROUTE');throw new HttpError(503,'PROVIDER_UNAVAILABLE');}
 stage='read';const body=await readProvider(upstream);
 if(request.operation==='route'){
 const distance=routeProviderDistance(body);
 if(distance!==null){stage='reconcile';const metered=await admin.rpc('rs_route_service_reconcile',{p_owner:userId,p_lease:data.lease,p_distance_m:distance});databaseCode=metered.error?.code??null;if(metered.error)throw new HttpError(503,'PROVIDER_UNAVAILABLE');}
 }
 stage='normalize';normalized=normalizeRouteProviderResult(request,body,new Date());
 }catch(error){if(error instanceof RouteProviderError||error instanceof HttpError)throw error;throw new HttpError(503,'PROVIDER_UNAVAILABLE');}finally{clearTimeout(timer);}
 stage='finish';const finished=await admin.rpc('rs_route_service_finish',{p_owner:userId,p_lease:data.lease,p_result:normalized});databaseCode=finished.error?.code??null;
 if(finished.error||!finished.data)throw new HttpError(finished.error?.message==='ACCOUNT_DELETION_PENDING'?409:503,finished.error?.message==='ACCOUNT_DELETION_PENDING'?'ACCOUNT_DELETION_PENDING':'PROVIDER_UNAVAILABLE');
 return response(req,{...finished.data,cached:false});
 }catch(error){
 // Coarse stages/statuses only: never log requests, user IDs, coordinates, URLs, bodies or error text.
 console.warn('route_service_failure',{stage,upstreamStatus,databaseCode:databaseCode&&/^[A-Z0-9_]{1,32}$/.test(databaseCode)?databaseCode:null,normalizationReason:stage==='normalize'?routeProviderFailureReason(error):null});
 return failure(req,error instanceof RouteProviderError?new HttpError(error.status,error.code):error);}
});
