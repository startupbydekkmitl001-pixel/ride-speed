import {verifyRouteTime,RouteTimeError} from './verify-route-time.mjs';
/** Tests exercise the canonical handler without credentials or hosted access. */
export function createRaceVerificationHandler({authenticate,readId,preflight,response,failure,HttpError,digest}) {
 return async req=>{
  let lease=null;
  try {
   const options=preflight(req);if(options)return options;
   const {userId,userClient,admin}=await authenticate(req),attemptId=await readId(req,'attempt_id');
   const own=await userClient.rpc('rs_get_race_attempt',{p_attempt:attemptId});
   if(own.error)throw new HttpError(503,'RACE_LOOKUP_FAILED');const attempt=own.data;
   if(!attempt||attempt.error||attempt.owner_id!==userId)throw new HttpError(403,'RACE_ATTEMPT_UNAVAILABLE');
   if(['verified','rejected','aborted','dnf'].includes(attempt.state)) {
    let result=null;
    if(attempt.state==='verified'){
     const rows=await userClient.rpc('rs_race_results',{p_race:attempt.race_id});if(rows.error||rows.data?.error)throw new HttpError(503,'RACE_RESULT_UNAVAILABLE');
     result=rows.data?.items?.find(item=>item.attempt_id===attemptId&&item.owner_id===userId)??null;
    }
    return response(req,{attempt,result});
   }
   const claim=await admin.rpc('rs_claim_race_attempt',{p_attempt:attemptId,p_owner:userId});
   if(claim.error)throw new HttpError(503,'RACE_CLAIM_FAILED');if(!claim.data)throw new HttpError(409,'RACE_NOT_QUEUED_OR_BUSY');
   const context=claim.data,reservation=context.evidence;
   if(typeof context.token!=='string'||context.attempt?.owner_id!==userId||context.attempt?.id!==attemptId||reservation?.bucket!=='ride-race-evidence'||reservation.attempt_id!==attemptId||reservation.path!==`${userId}/${attemptId}/route-time-v1.json`)throw new HttpError(503,'RACE_CLAIM_INVALID');
   lease={admin,attemptId,token:context.token};
   const download=await admin.storage.from(reservation.bucket).download(reservation.path);
   if(download.error||!download.data)throw new HttpError(503,'RACE_EVIDENCE_DOWNLOAD_FAILED');const blob=download.data;
   if(blob.size>2097152||blob.size!==reservation.byte_length)throw new RouteTimeError('EVIDENCE_SIZE');const bytes=await blob.arrayBuffer();
   if(bytes.byteLength>2097152||bytes.byteLength!==reservation.byte_length)throw new RouteTimeError('EVIDENCE_SIZE');
   const actualDigest=await digest(bytes);if(actualDigest!==reservation.sha256)throw new RouteTimeError('EVIDENCE_DIGEST');
   let evidence;try{evidence=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new RouteTimeError('EVIDENCE_SCHEMA');}
   if(evidence.first_sequence!==reservation.first_sequence||evidence.last_sequence!==reservation.last_sequence||evidence.capture_id!==reservation.capture_id||!Array.isArray(evidence.samples)||evidence.samples.length!==reservation.sample_count)throw new RouteTimeError('EVIDENCE_CAPTURE');
   const result={...verifyRouteTime(evidence,context),evidence_sha256:actualDigest};
   const finalized=await admin.rpc('rs_finalize_race_attempt',{p_attempt:attemptId,p_token:context.token,p_result:result});
   if(finalized.error||!finalized.data)throw new HttpError(409,'RACE_ELIGIBILITY_OR_LEASE_CHANGED');lease=null;return response(req,finalized.data);
  }catch(error){
   if(lease){
    if(error instanceof RouteTimeError){
     const rejected=await lease.admin.rpc('rs_reject_race_attempt',{p_attempt:lease.attemptId,p_token:lease.token,p_code:error.code});
     if(!rejected.error&&rejected.data===true)return response(req,{error:error.code},422);return response(req,{error:'RACE_ELIGIBILITY_OR_LEASE_CHANGED'},409);
    }
    await lease.admin.rpc('rs_release_race_attempt',{p_attempt:lease.attemptId,p_token:lease.token});
   }
   return failure(req,error);
  }
 };
}
