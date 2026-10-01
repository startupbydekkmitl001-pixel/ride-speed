import {authenticate,preflight,response,HttpError} from '../_shared/http.ts';
import {createCommunityCommitHandler} from '../_shared/community-media-handler.mjs';
import {decode} from '../_shared/vendor/jpeg-js-0.4.4-strict.mjs';
import {encode} from 'npm:blurhash@2.0.5';
Deno.serve(createCommunityCommitHandler({authenticate,preflight,response,decode,encodeBlurhash:encode,
 projectUrl:()=>{const value=Deno.env.get('SUPABASE_URL');if(!value)throw new HttpError(503,'SERVER_CONFIGURATION');return value;},
 digest:async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))).map(n=>n.toString(16).padStart(2,'0')).join(''),
}));
