import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {failure,HttpError,response} from '../_shared/http.ts';
import {createCommunityCleanupHandler} from '../_shared/community-cleanup-handler.mjs';
function serviceKey():string{
 const direct=Deno.env.get('SUPABASE_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(direct)return direct;
 const named=Deno.env.get('SUPABASE_SECRET_KEYS');if(named){const values=JSON.parse(named);if(typeof values.default==='string')return values.default;}throw new HttpError(503,'SERVER_CONFIGURATION');
}
Deno.serve(createCommunityCleanupHandler({failure,HttpError,response,authorize:async(req:Request)=>{
 const configured=serviceKey(),bearer=req.headers.get('authorization');if(!bearer?.match(/^Bearer [^\s]+$/i))throw new HttpError(401,'SERVICE_AUTH_REQUIRED');
 const encoder=new TextEncoder(),actual=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(bearer.slice(7)))),expected=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(configured)));let mismatch=0;for(let n=0;n<actual.length;n++)mismatch|=actual[n]^expected[n];if(mismatch)throw new HttpError(401,'SERVICE_AUTH_REQUIRED');
 const url=Deno.env.get('SUPABASE_URL');if(!url)throw new HttpError(503,'SERVER_CONFIGURATION');return createClient(url,configured,{auth:{persistSession:false,autoRefreshToken:false}});
}}));
