import { authenticate, failure, HttpError, preflight, response } from '../_shared/http.ts';
import { readDeletionRequest, RequestError } from '../_shared/account-requests.mjs';
import { authenticateDeletionReceipt } from '../_shared/deletion-receipt.ts';

Deno.serve(async req => {
  let requestId: string|undefined,owner: string|undefined,lease: string|undefined;
  let admin: Awaited<ReturnType<typeof authenticate>>['admin']|undefined;
  try {
    const options=preflight(req);if(options)return options;
    let authenticated;
    try{authenticated=await authenticate(req);}catch(error){
      if(!(error instanceof HttpError)||error.status!==401)throw error;
      // A valid original token can outlive removal of its Auth row. Claims are
      // used only for this exact completed-receipt lookup; no mutation fallback.
      const receipt=await authenticateDeletionReceipt(req);
      requestId=(await readDeletionRequest(req)).requestId;
      const {data:completed,error:lookupError}=await receipt.admin.rpc('rs_completed_account_deletion',{p_owner:receipt.userId,p_request:requestId});
      if(lookupError)throw new HttpError(503,'DELETION_STATUS_UNAVAILABLE');
      if(completed===true)return response(req,{state:'deleted',requestId});
      throw new HttpError(401,'AUTH_REQUIRED');
    }
    admin=authenticated.admin;owner=authenticated.userId;
    requestId=(await readDeletionRequest(req)).requestId;
    // Authenticate derives the only owner. A durable UUID is reused on retries;
    // the job fences RPCs/uploads and rotates old sharing/presence grants first.
    const {data:job,error:claimError}=await admin.rpc('rs_begin_account_deletion',{p_owner:owner,p_request:requestId});
    if(claimError){
      const code=['DELETION_IN_PROGRESS','DELETION_REQUEST_CONFLICT'].find(code=>claimError.message.includes(code));
      throw new HttpError(code?409:503,code??'DELETION_DATABASE_FAILED');
    }
    if(job?.state==='deleted')return response(req,{state:'deleted',requestId});
    if(!job?.token||job.request_id!==requestId)throw new HttpError(503,'DELETION_DATABASE_FAILED');
    lease=job.token;
    let drained=false;
    // Keep each invocation bounded. Large accounts resume the same fenced job.
    for(let batch=0;batch<5;batch++){
      const {data:objects,error:listError}=await admin.rpc('rs_account_deletion_objects',{p_owner:owner,p_request:requestId,p_token:lease});
      if(listError||!Array.isArray(objects))throw new HttpError(503,'DELETION_STORAGE_FAILED');
      if(!objects.length){drained=true;break;}
      const buckets=new Map<string,string[]>();
      for(const object of objects){const paths=buckets.get(object.bucket)??[];paths.push(object.path);buckets.set(object.bucket,paths);}
      for(const [bucket,paths] of buckets){
        const {error:removeError}=await admin.storage.from(bucket).remove(paths);
        if(removeError)throw new HttpError(503,'DELETION_STORAGE_FAILED');
      }
    }
    if(!drained)throw new HttpError(503,'DELETION_STORAGE_FAILED');
    // Do not delete storage.objects with SQL: Storage API must remove binaries
    // first, and the DB refuses purge while any owner/queued object remains.
    const {error:purgeError}=await admin.rpc('rs_purge_account_data',{p_owner:owner,p_request:requestId,p_token:lease});
    if(purgeError)throw new HttpError(503,'DELETION_DATABASE_FAILED');
    const {error:authError}=await admin.auth.admin.deleteUser(owner);
    if(authError)throw new HttpError(503,'DELETION_AUTH_FAILED');
    // Auth's DELETE trigger atomically completes the minimal job receipt. This
    // remains true even if this final response is lost after successful deletion.
    return response(req,{state:'deleted',requestId});
  }catch(error){
    const known=error instanceof RequestError?new HttpError(error.status,error.code):error instanceof HttpError?error:new HttpError(503,'SERVICE_UNAVAILABLE');
    if(lease&&admin&&owner&&requestId){
      try{await admin.rpc('rs_release_account_deletion',{p_owner:owner,p_request:requestId,p_token:lease,p_error:known.code});}catch{/* Lease TTL allows a later retry. */}
    }
    if(requestId&&known.status>=409)return response(req,{error:known.code,requestId,retryable:known.code!=='DELETION_REQUEST_CONFLICT'},known.status);
    return failure(req,known);
  }
});
