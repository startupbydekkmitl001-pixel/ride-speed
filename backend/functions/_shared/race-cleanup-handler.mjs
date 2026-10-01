/** Service-only binary cleanup. SQL ACK checks Storage absence before forgetting. */
export function createRaceCleanupHandler({authorize,response,failure,HttpError}){
 return async req=>{
  try{
   if(req.method!=='POST')throw new HttpError(405,'POST_REQUIRED');const admin=await authorize(req);
   const repaired=await admin.rpc('rs_race_cleanup');if(repaired.error)throw new HttpError(503,'RACE_CLEANUP_UNAVAILABLE');
   const claim=await admin.rpc('rs_claim_race_evidence_cleanup',{p_limit:20});if(claim.error||!Array.isArray(claim.data))throw new HttpError(503,'RACE_CLEANUP_UNAVAILABLE');
   let removed=0,failed=0;
   for(const item of claim.data){
    if(item.bucket!=='ride-race-evidence'||typeof item.id!=='string'||typeof item.token!=='string'||typeof item.path!=='string'||!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/route-time-v1\.json$/.test(item.path))throw new HttpError(503,'RACE_CLEANUP_INVALID');
    const deletion=await admin.storage.from(item.bucket).remove([item.path]);
    if(deletion.error){failed++;await admin.rpc('rs_release_race_evidence_cleanup',{p_id:item.id,p_token:item.token});continue;}
    const ack=await admin.rpc('rs_ack_race_evidence_cleanup',{p_id:item.id,p_token:item.token});
    if(ack.error||ack.data!==true){failed++;await admin.rpc('rs_release_race_evidence_cleanup',{p_id:item.id,p_token:item.token});}else removed++;
   }
   return response(req,{removed,failed},failed?503:200);
  }catch(error){return failure(req,error);}
 };
}
