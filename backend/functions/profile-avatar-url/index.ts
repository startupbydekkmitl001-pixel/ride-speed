import { authenticate, failure, HttpError, preflight, response } from '../_shared/http.ts';
import { readAvatarRequest, RequestError } from '../_shared/account-requests.mjs';

Deno.serve(async req => {
  try {
    const options=preflight(req);if(options)return options;
    const {userId,userClient,admin}=await authenticate(req);
    const body=await readAvatarRequest(req),owner=body.userId??userId;
    // Caller JWT + the friendship/block authorization RPC. The path never comes
    // from the request, and even private avatar metadata stays owner-scoped.
    const {data:avatar,error}=await userClient.rpc('rs_avatar_for_view',{p_owner:owner});
    if(error)throw new HttpError(503,'AVATAR_LOOKUP_FAILED');
    if(!avatar)throw new HttpError(404,'AVATAR_UNAVAILABLE');
    let url: string|null=null;
    if(avatar.path&&avatar.avatar_id){
      const {data,error:signedError}=await admin.storage.from('ride-avatars').createSignedUrl(avatar.path,60);
      if(signedError||!data?.signedUrl)throw new HttpError(503,'AVATAR_UNAVAILABLE');
      url=data.signedUrl;
    }
    // Bounded best-effort housekeeping; only server-issued obsolete/expired
    // paths can enter this list. A cleanup outage never loses the current photo.
    if(owner===userId){
      try {
        const {data:old,error:cleanupError}=await admin.rpc('rs_avatar_cleanup_objects',{p_owner:userId});
        if(!cleanupError&&Array.isArray(old)&&old.length)await admin.storage.from('ride-avatars').remove(old.map(item=>item.path));
      }catch{/* Retry on the next self-avatar refresh; account deletion also drains all objects. */}
    }
    return response(req,{url,expiresIn:60,avatarId:avatar.avatar_id??null});
  }catch(error){return failure(req,error instanceof RequestError?new HttpError(error.status,error.code):error);}
});
