import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { readAvatarRequest, readDeletionRequest, RequestError } from '../functions/_shared/account-requests.mjs';

const owner='00000000-0000-4000-8000-000000000011', friend='00000000-0000-4000-8000-000000000012';
const requestId='20000000-0000-4000-8000-000000000011';
const token='30000000-0000-4000-8000-000000000011';
class HttpError extends Error { constructor(status,code){super(code);this.status=status;this.code=code;} }
const response=(_req,body,status=200)=>Response.json(body,{status});
const failure=(req,e)=>response(req,{error:e instanceof HttpError||e instanceof RequestError?e.code:'SERVICE_UNAVAILABLE'},e.status??503);
async function handlerFor(name,context){
  // Only the external service boundary is stubbed; execute the maintained handler.
  const source=await readFile(new URL(`../functions/${name}/index.ts`,import.meta.url),'utf8');
  const executable=stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm,''),{mode:'strip'});
  let handler;
  runInNewContext(executable,{Deno:{serve:fn=>{handler=fn;}},HttpError,RequestError,readAvatarRequest,readDeletionRequest,preflight:()=>null,response,failure,Error,...context});
  return handler;
}
function deletionBoundary(fail){
  const calls=[]; let list=0;
  const admin={rpc:async(name,args)=>{
    calls.push(name);
    assert.equal(args.p_owner,owner); assert.equal(args.p_request,requestId);
    if(name==='rs_begin_account_deletion') return fail==='claim'?{error:{message:'DELETION_IN_PROGRESS'}}:{data:{state:'storage_pending',request_id:requestId,token},error:null};
    if(name==='rs_account_deletion_objects') return {data:list++===0?[{bucket:'ride-avatars',path:`${owner}/old.jpg`},{bucket:'ride-evidence',path:`${friend}/challenge/samples.bin`}]:[],error:null};
    if(name==='rs_purge_account_data') return {error:fail==='purge'?{message:'DELETION_ASSETS_REMAIN'}:null};
    if(name==='rs_release_account_deletion') return {error:null};
    throw Error(`Unexpected RPC ${name}`);
  },storage:{from:bucket=>({remove:async paths=>{
    calls.push(`storage:${bucket}`); assert.ok(paths.every(path=>typeof path==='string'));
    return {error:fail==='storage'?{message:'unavailable'}:null};
  }})},auth:{admin:{deleteUser:async id=>{assert.equal(id,owner);calls.push('auth.delete');return {error:fail==='auth'?{message:'unavailable'}:null};}}}};
  return {calls,authenticate:async()=>({userId:owner,admin})};
}
const deleteRequest=body=>new Request('https://example.test/delete',{method:'POST',body:JSON.stringify(body??{confirmation:'DELETE',requestId})});
test('account deletion removes private binaries then SQL dependencies then Auth identity',async()=>{
  const boundary=deletionBoundary();
  const handler=await handlerFor('delete-account',boundary);
  const res=await handler(deleteRequest());
  assert.equal(res.status,200);assert.deepEqual(await res.json(),{state:'deleted',requestId});
  assert.deepEqual(boundary.calls,['rs_begin_account_deletion','rs_account_deletion_objects','storage:ride-avatars','storage:ride-evidence','rs_account_deletion_objects','rs_purge_account_data','auth.delete']);
});
for(const [fail,code] of [['storage','DELETION_STORAGE_FAILED'],['purge','DELETION_DATABASE_FAILED'],['auth','DELETION_AUTH_FAILED'],['claim','DELETION_IN_PROGRESS']]) test(`deletion ${fail} failure stays retryable with a fenced receipt`,async()=>{
  const boundary=deletionBoundary(fail),handler=await handlerFor('delete-account',boundary),res=await handler(deleteRequest());
  assert.equal(res.status,fail==='claim'?409:503); assert.deepEqual(await res.json(),{error:code,requestId,retryable:true});
  if(fail==='storage'||fail==='purge') assert.equal(boundary.calls.includes('auth.delete'),false);
  if(fail!=='claim') assert.equal(boundary.calls.at(-1),'rs_release_account_deletion');
});
test('deletion rejects foreign-owner fields before any service mutation',async()=>{
  const boundary=deletionBoundary(),handler=await handlerFor('delete-account',boundary);
  const res=await handler(deleteRequest({confirmation:'DELETE',requestId,userId:friend}));
  assert.equal(res.status,400);assert.deepEqual(boundary.calls,[]);
});
test('lost final response recovers only an exact completed read-only receipt with verified claims',async()=>{
  const calls=[];
  const handler=await handlerFor('delete-account',{
    authenticate:async()=>{throw new HttpError(401,'AUTH_REQUIRED');},
    authenticateDeletionReceipt:async()=>({userId:owner,admin:{rpc:async(name,args)=>{
      calls.push(name);assert.equal(name,'rs_completed_account_deletion');assert.equal(args.p_owner,owner);assert.equal(args.p_request,requestId);return {data:true,error:null};
    }}})
  });
  const res=await handler(deleteRequest());assert.equal(res.status,200);assert.deepEqual(await res.json(),{state:'deleted',requestId});
  assert.deepEqual(calls,['rs_completed_account_deletion']);
});
test('a valid signed token without an exact completed receipt cannot resume deletion mutations',async()=>{
  const calls=[];
  const handler=await handlerFor('delete-account',{
    authenticate:async()=>{throw new HttpError(401,'AUTH_REQUIRED');},
    authenticateDeletionReceipt:async()=>({userId:owner,admin:{rpc:async(name)=>{calls.push(name);return {data:false,error:null};}}})
  });
  const res=await handler(deleteRequest());assert.equal(res.status,401);assert.deepEqual(calls,['rs_completed_account_deletion']);
});
test('avatar signer uses caller-scoped lookup and only the server reservation path',async()=>{
  const calls=[],path=`${friend}/10000000-0000-4000-8000-000000000011.jpg`,avatarId='10000000-0000-4000-8000-000000000011';
  const handler=await handlerFor('profile-avatar-url',{authenticate:async()=>({userId:owner,userClient:{rpc:async(name,args)=>{calls.push(name);assert.equal(args.p_owner,friend);return {data:{avatar_id:avatarId,path},error:null};}},admin:{storage:{from:bucket=>({createSignedUrl:async(p,ttl)=>{calls.push('sign');assert.equal(bucket,'ride-avatars');assert.equal(p,path);assert.equal(ttl,60);return {data:{signedUrl:'https://project.test/storage/v1/object/sign/ride-avatars/safe?token=short'},error:null};}})}}})});
  const res=await handler(new Request('https://example.test/avatar',{method:'POST',body:JSON.stringify({userId:friend})}));
  assert.equal(res.status,200);assert.deepEqual(await res.json(),{url:'https://project.test/storage/v1/object/sign/ride-avatars/safe?token=short',expiresIn:60,avatarId});assert.deepEqual(calls,['rs_avatar_for_view','sign']);
});
test('unauthorized avatar lookup cannot invoke a privileged signer',async()=>{
  let signed=false;
  const handler=await handlerFor('profile-avatar-url',{authenticate:async()=>({userId:owner,userClient:{rpc:async()=>({data:null,error:null})},admin:{storage:{from:()=>({createSignedUrl:async()=>{signed=true;}})}}})});
  const res=await handler(new Request('https://example.test/avatar',{method:'POST',body:'{}'}));
  assert.equal(res.status,404);assert.equal(signed,false);
});
