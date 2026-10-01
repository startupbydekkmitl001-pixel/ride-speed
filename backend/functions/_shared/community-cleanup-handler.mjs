/** Service only; deletes binary through Storage before exact lease ACK. */
export function createCommunityCleanupHandler({authorize,response,failure,HttpError}){
 return async req=>{try{
  if(req.method!=='POST')throw new HttpError(405,'POST_REQUIRED');const admin=await authorize(req);
  const claim=await admin.rpc('rs_claim_community_media_cleanup',{p_limit:20});if(claim.error||!Array.isArray(claim.data)||claim.data.length>20)throw new HttpError(503,'COMMUNITY_CLEANUP_UNAVAILABLE');let removed=0,failed=0;
  for(const item of claim.data){
   if(!['ride-post-media','ride-community'].includes(item.bucket)||typeof item.token!=='string'||!/^[a-f0-9-]{36}$/.test(item.token)||typeof item.path!=='string'||!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{1,100}\.(jpg|jpeg|png|webp)$/.test(item.path))throw new HttpError(503,'COMMUNITY_CLEANUP_UNAVAILABLE');
   const args={p_bucket:item.bucket,p_path:item.path,p_token:item.token};try{
    const deletion=await admin.storage.from(item.bucket).remove([item.path]);if(deletion.error)throw Error('remove');
    const ack=await admin.rpc('rs_ack_community_media_cleanup',args);if(ack.error)throw Error('ack');removed++;
   }catch{failed++;try{await admin.rpc('rs_release_community_media_cleanup',args);}catch{/* next expiry retry */}}
  }
  return response(req,{removed,failed},failed?503:200);
 }catch(error){return failure(req,error);}};
}
