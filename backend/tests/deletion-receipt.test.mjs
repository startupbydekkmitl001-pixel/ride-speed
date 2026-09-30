import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createClient } from '@supabase/supabase-js';

const user='00000000-0000-4000-8000-000000000011',url='https://receipt-test.supabase.co',kid='local-test-key';
class HttpError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
let pair,jwk,authenticateDeletionReceipt;
const base64=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
async function jwt(overrides={}){
  const claims={iss:`${url}/auth/v1`,sub:user,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+600,...overrides};
  const unsigned=`${base64({alg:'ES256',typ:'JWT',kid})}.${base64(claims)}`;
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(unsigned));
  return `${unsigned}.${Buffer.from(signature).toString('base64url')}`;
}
const request=token=>new Request('https://example.test/delete',{method:'POST',headers:{authorization:`Bearer ${token}`}});
before(async()=>{
  pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid,alg:'ES256',use:'sig'};
  const source=await readFile(new URL('../functions/_shared/deletion-receipt.ts',import.meta.url),'utf8');
  const executable=stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm,'').replace(/\bexport (?=(?:async )?function)/g,''),{mode:'strip'});
  const state={HttpError,Deno:{env:{get:key=>({SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:'local-test-publishable',SUPABASE_SECRET_KEY:'local-test-service'})[key]}},
    createReceiptClient:(project,key,options)=>createClient(project,key,{...options,global:{fetch:async target=>{
      if(String(target).endsWith('/.well-known/jwks.json'))return Response.json({keys:[jwk]});
      // Simulates an Auth user already removed. Cryptographic claims verification
      // must recover only the read-only receipt identity, never a user/session.
      if(String(target).endsWith('/user'))return Response.json({message:'User not found',code:'user_not_found'},{status:401});
      throw Error(`Unexpected network boundary ${String(target)}`);
    }}})};
  runInNewContext(`${executable}\nglobalThis.result=authenticateDeletionReceipt;`,state);
  authenticateDeletionReceipt=state.result;
});
test('receipt identity uses the real SDK ES256 signature verifier after Auth user removal',async()=>{
  const verified=await authenticateDeletionReceipt(request(await jwt()));
  assert.equal(verified.userId,user);assert.ok(verified.admin);
});
test('tampered JWT cannot query a deletion receipt',async()=>{
  const valid=await jwt(),parts=valid.split('.');
  parts[1]=base64({...JSON.parse(Buffer.from(parts[1],'base64url').toString()),sub:'00000000-0000-4000-8000-000000000012'});
  await assert.rejects(authenticateDeletionReceipt(request(parts.join('.'))),error=>error.code==='AUTH_REQUIRED'&&error.status===401);
});
for(const [name,claims] of [['expired',{exp:1}],['foreign issuer',{iss:'https://foreign.supabase.co/auth/v1'}],['wrong audience',{aud:'anon'}],['wrong role',{role:'service_role'}],['invalid subject',{sub:'not-a-uuid'}]])test(`receipt verifier rejects ${name} even with a valid signature`,async()=>{
  await assert.rejects(authenticateDeletionReceipt(request(await jwt(claims))),error=>error.code==='AUTH_REQUIRED'&&error.status===401);
});
