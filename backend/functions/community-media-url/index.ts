import {authenticate,preflight,response,HttpError} from '../_shared/http.ts';
import {createCommunityURLHandler} from '../_shared/community-media-handler.mjs';
Deno.serve(createCommunityURLHandler({authenticate,preflight,response,
 projectUrl:()=>{const value=Deno.env.get('SUPABASE_URL');if(!value)throw new HttpError(503,'SERVER_CONFIGURATION');return value;},
}));
