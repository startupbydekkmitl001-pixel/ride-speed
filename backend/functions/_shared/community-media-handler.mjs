import {CommunityJpegError,verifyCommunityJpeg} from './community-jpeg.mjs';
const id=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const codes=new Set(['COMMUNITY_INVALID','COMMUNITY_AUTH_REQUIRED','COMMUNITY_PROFILE_REQUIRED','COMMUNITY_UNAVAILABLE','COMMUNITY_CHANGED','COMMUNITY_REVISION_CONFLICT','COMMUNITY_OPERATION_CONFLICT','COMMUNITY_SOURCE_CHANGED','COMMUNITY_MEDIA_UNAVAILABLE','COMMUNITY_MEDIA_INVALID','COMMUNITY_MEDIA_EXPIRED','COMMUNITY_DRAFT_UNAVAILABLE','COMMUNITY_RATE_LIMITED','COMMUNITY_CAPACITY','ACCOUNT_DELETION_PENDING']);
export class CommunityMediaError extends Error{constructor(code,status=400,retry=null){super(code);this.code=code;this.status=status;this.retry=retry;}}
const unavailable=()=>new CommunityMediaError('COMMUNITY_MEDIA_UNAVAILABLE',503);
export async function readCommunityMediaRequest(req){
 if(!req.body)throw new CommunityMediaError('COMMUNITY_INVALID');const reader=req.body.getReader(),chunks=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new CommunityMediaError('COMMUNITY_INVALID',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}let body;
 try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new CommunityMediaError('COMMUNITY_INVALID');}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==2||!id(body.postId)||!id(body.mediaId))throw new CommunityMediaError('COMMUNITY_INVALID');return body;
}
function rpcError(error){if(error?.code==='CM001'&&codes.has(error.message))return new CommunityMediaError(error.message,error.message==='ACCOUNT_DELETION_PENDING'?409:400);return unavailable();}
function envelope(value){if(value?.error&&codes.has(value.error.code)){const retry=value.error.code==='COMMUNITY_RATE_LIMITED'&&Number.isInteger(value.error.retry_after_ms)&&value.error.retry_after_ms>0?value.error.retry_after_ms:null;throw new CommunityMediaError(value.error.code,retry?429:404,retry);}}
export function communityMediaFailure(req,error,response){
 const code=error instanceof CommunityMediaError?error.code:error?.code==='AUTH_REQUIRED'?'COMMUNITY_AUTH_REQUIRED':error?.code==='INVALID_REQUEST'?'COMMUNITY_INVALID':'COMMUNITY_UNAVAILABLE';
 const status=error instanceof CommunityMediaError?error.status:error?.code==='AUTH_REQUIRED'?401:error?.status===405?405:503;
 return response(req,{error:code==='COMMUNITY_RATE_LIMITED'?{code,retry_after_ms:error.retry}:{code}},status);
}
export function communitySignedURL(value,projectUrl,bucket,path){
 try{const url=new URL(value),project=new URL(projectUrl);if(url.protocol!=='https:'||url.origin!==project.origin||url.username||url.password||url.hash||url.pathname!==`/storage/v1/object/sign/${bucket}/${path}`||url.searchParams.getAll('token').length!==1||!url.searchParams.get('token')||[...url.searchParams.keys()].some(x=>x!=='token'))throw unavailable();return url.toString();}catch{throw unavailable();}
}
/** Hard stream cap before allocating/decode. No caller supplied URL or path. */
export async function readCommunityObject(url,expectedSize,fetcher=fetch){
 if(!Number.isInteger(expectedSize)||expectedSize<1||expectedSize>1048576)throw unavailable();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let reader;
 try{const result=await fetcher(url,{signal:controller.signal,redirect:'error',headers:{Accept:'image/jpeg'}});if(!result.ok||!result.body)throw unavailable();const declared=result.headers.get('content-length');if(declared!==null&&(!/^[0-9]{1,10}$/.test(declared)||Number(declared)!==expectedSize))throw unavailable();reader=result.body.getReader();const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>expectedSize||size>1048576){await reader.cancel();throw new CommunityMediaError('COMMUNITY_MEDIA_INVALID');}chunks.push(value);}
  if(size!==expectedSize)throw new CommunityMediaError('COMMUNITY_MEDIA_INVALID');const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
 }catch(error){if(error instanceof CommunityMediaError)throw error;throw unavailable();}finally{clearTimeout(timer);try{reader?.releaseLock();}catch{/* already cancelled */}}
}
export function createCommunityCommitHandler({authenticate,preflight,response,projectUrl,decode,encodeBlurhash,digest,fetcher=fetch,uuid=()=>crypto.randomUUID()}){
 return async req=>{let context,body,token,claimed=false;try{
  const options=preflight(req);if(options)return options;context=await authenticate(req);body=await readCommunityMediaRequest(req);token=uuid();if(!id(token)||!id(context.userId))throw unavailable();
  const {data:claim,error}=await context.admin.rpc('rs_claim_community_media',{p_owner:context.userId,p_post:body.postId,p_media:body.mediaId,p_token:token});if(error)throw rpcError(error);
  if(claim?.post_id!==body.postId||claim.media_id!==body.mediaId)throw unavailable();
  if(claim.state==='committed')return response(req,{post_id:body.postId,media_id:body.mediaId,descriptor:claim.descriptor});
  const path=`${context.userId}/${body.postId}/${body.mediaId}.jpg`;if(claim.state!=='reserved'||claim.bucket!=='ride-post-media'||claim.path!==path||claim.token!==token)throw unavailable();claimed=true;
  const {data:signed,error:signError}=await context.admin.storage.from('ride-post-media').createSignedUrl(path,60);if(signError||!signed?.signedUrl)throw unavailable();
  const url=communitySignedURL(signed.signedUrl,projectUrl(),'ride-post-media',path),bytes=await readCommunityObject(url,claim.declared?.byte_count,fetcher);
  let descriptor;try{descriptor=await verifyCommunityJpeg(bytes,claim.declared,{decode,encodeBlurhash,digest});}catch(error){if(error instanceof CommunityJpegError)throw new CommunityMediaError('COMMUNITY_MEDIA_INVALID');throw error;}
  const {data:result,error:finishError}=await context.admin.rpc('rs_finish_community_media',{p_owner:context.userId,p_post:body.postId,p_media:body.mediaId,p_token:token,p_descriptor:descriptor});if(finishError)throw rpcError(finishError);
  if(result?.post_id!==body.postId||result.media_id!==body.mediaId||JSON.stringify(result.descriptor)!==JSON.stringify(descriptor)){
   // JSONB key order is not identity. Compare the six frozen fields explicitly.
   if(result?.post_id!==body.postId||result.media_id!==body.mediaId||['mime','sha256','byte_count','width','height','blurhash'].some(k=>result.descriptor?.[k]!==descriptor[k]))throw unavailable();
  }
  claimed=false;return response(req,{post_id:body.postId,media_id:body.mediaId,descriptor});
 }catch(error){if(claimed&&context&&body){try{await context.admin.rpc('rs_release_community_media',{p_owner:context.userId,p_post:body.postId,p_media:body.mediaId,p_token:token,p_invalid:error instanceof CommunityMediaError&&error.code==='COMMUNITY_MEDIA_INVALID'});}catch{/* exact lease expires; no raw error is logged */}}return communityMediaFailure(req,error,response);}};
}
export function createCommunityURLHandler({authenticate,preflight,response,projectUrl}){
 return async req=>{try{const options=preflight(req);if(options)return options;const context=await authenticate(req),body=await readCommunityMediaRequest(req),args={p_post_id:body.postId,p_media_id:body.mediaId};
  const {data:asset,error}=await context.userClient.rpc('rs_community_media_for_view',args);if(error)throw rpcError(error);envelope(asset);
  if(asset?.post_id!==body.postId||asset.media_id!==body.mediaId||!['ride-community','ride-post-media'].includes(asset.bucket)||typeof asset.path!=='string')throw unavailable();
  const {data:signed,error:signError}=await context.admin.storage.from(asset.bucket).createSignedUrl(asset.path,60);if(signError||!signed?.signedUrl)throw unavailable();const url=communitySignedURL(signed.signedUrl,projectUrl(),asset.bucket,asset.path);
  const fresh=await context.userClient.rpc('rs_community_media_for_view',args);if(fresh.error)throw rpcError(fresh.error);envelope(fresh.data);if(!fresh.data||['post_id','media_id','bucket','path','sha256'].some(k=>fresh.data[k]!==asset[k]))throw unavailable();
  return response(req,{postId:body.postId,mediaId:body.mediaId,sha256:asset.sha256,url,expiresIn:60});
 }catch(error){return communityMediaFailure(req,error,response);}};
}
