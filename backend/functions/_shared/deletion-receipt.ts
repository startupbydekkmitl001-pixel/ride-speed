import { createClient as createReceiptClient } from 'npm:@supabase/supabase-js@2.117.2';
import { HttpError } from './http.ts';

// Kept separate from the getUser-authenticated mutation helper: a removed Auth
// identity may only read its exact completed receipt, never resume any mutation.
function receiptKey(kind: 'PUBLISHABLE'|'SECRET'): string {
  const single=Deno.env.get(`SUPABASE_${kind}_KEY`);if(single)return single;
  const named=Deno.env.get(`SUPABASE_${kind}_KEYS`);
  if(named){
    try{
      const keys=JSON.parse(named);
      if(typeof keys.default==='string')return keys.default;
      const first=Object.values(keys).find(value=>typeof value==='string');if(first)return first as string;
    }catch{throw new HttpError(503,'SERVER_CONFIGURATION');}
  }
  const legacy=Deno.env.get(kind==='SECRET'?'SUPABASE_SERVICE_ROLE_KEY':'SUPABASE_ANON_KEY');
  if(!legacy)throw new HttpError(503,'SERVER_CONFIGURATION');return legacy;
}

export async function authenticateDeletionReceipt(req: Request) {
  const bearer=req.headers.get('authorization');
  if(!bearer?.match(/^Bearer [^\s]+$/i))throw new HttpError(401,'AUTH_REQUIRED');
  const url=Deno.env.get('SUPABASE_URL');if(!url)throw new HttpError(503,'SERVER_CONFIGURATION');
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const client=createReceiptClient(url,receiptKey('PUBLISHABLE'),options);
  // This verifies the actual signature against this project's JWKS. No decoded
  // JWT, user-supplied JWKS, allowExpired flag or session-only identity is used.
  let verified;
  try{verified=await client.auth.getClaims(bearer.slice(7));}catch{throw new HttpError(401,'AUTH_REQUIRED');}
  const claims=verified.data?.claims,header=verified.data?.header;
  const now=Math.floor(Date.now()/1000);
  if(verified.error||!claims||!header||!['ES256','RS256'].includes(header.alg)
    ||claims.iss!==`${url.replace(/\/$/,'')}/auth/v1`||claims.aud!=='authenticated'||claims.role!=='authenticated'
    ||typeof claims.exp!=='number'||!Number.isFinite(claims.exp)||claims.exp<=now
    ||typeof claims.sub!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(claims.sub)
    ||(claims.nbf!==undefined&&(typeof claims.nbf!=='number'||claims.nbf>now)))throw new HttpError(401,'AUTH_REQUIRED');
  return {userId:claims.sub.toLowerCase(),admin:createReceiptClient(url,receiptKey('SECRET'),options)};
}
