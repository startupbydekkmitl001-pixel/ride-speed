import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAvatarRequest, readDeletionRequest, RequestError } from '../functions/_shared/account-requests.mjs';

const id='00000000-0000-4000-8000-000000000011';
const request=body=>new Request('https://example.test/account',{method:'POST',body:JSON.stringify(body)});
test('deletion requires exact typed confirmation and a canonical retry UUID; never accepts an owner',async()=>{
  assert.deepEqual(await readDeletionRequest(request({confirmation:'DELETE',requestId:id.toUpperCase()})),{confirmation:'DELETE',requestId:id});
  for(const body of [{confirmation:'delete',requestId:id},{confirmation:'DELETE'},{confirmation:'DELETE',requestId:'anything'},{confirmation:'DELETE',requestId:id,userId:id},null,[]]) {
    await assert.rejects(readDeletionRequest(request(body)),error=>error instanceof RequestError && error.code==='INVALID_REQUEST');
  }
});
test('avatar request accepts self or one valid user ID, never a storage path',async()=>{
  assert.deepEqual(await readAvatarRequest(request({})),{});
  assert.deepEqual(await readAvatarRequest(request({userId:id})),{userId:id});
  for(const body of [{path:`${id}/anything.jpg`},{userId:id,path:'foreign'},{userId:null},{userId:'bad'},[],null]) await assert.rejects(readAvatarRequest(request(body)),/INVALID_REQUEST/);
});
test('request bytes are bounded independently of Content-Length and invalid UTF-8 is rejected',async()=>{
  const oversized=new Request('https://example.test/account',{method:'POST',body:new ReadableStream({start(c){c.enqueue(new Uint8Array(4097));c.close();}}),duplex:'half',headers:{'content-length':'10'}});
  await assert.rejects(readAvatarRequest(oversized),error=>error.status===413&&error.code==='REQUEST_TOO_LARGE');
  const malformed=new Request('https://example.test/account',{method:'POST',body:new Uint8Array([0xff])});
  await assert.rejects(readDeletionRequest(malformed),/INVALID_REQUEST/);
});
