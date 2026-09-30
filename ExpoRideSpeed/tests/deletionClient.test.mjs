import test from 'node:test';
import assert from 'node:assert/strict';
import { finishAccountDeletion, parseDeletionReceipt, requestAccountDeletion } from '../src/features/profile/deletion.ts';
import { readStoredProfile } from '../src/features/profile/model.ts';
const id='00000000-0000-4000-8000-000000000001';
test('a lost deletion response retries the identical request, and only matching deleted receipts succeed',async()=>{
  const calls=[];let lost=true;
  const invoke=async body=>{calls.push(body);if(lost){lost=false;throw new Error('network');}return{state:'deleted',requestId:id};};
  await assert.rejects(requestAccountDeletion(id,invoke,()=>{}),/network/);
  await requestAccountDeletion(id,invoke,()=>{});
  assert.deepEqual(calls,[{confirmation:'DELETE',requestId:id},{confirmation:'DELETE',requestId:id}]);
  await assert.rejects(requestAccountDeletion(id,async()=>({state:'deleted',requestId:'other'}),()=>{}),/DELETION_INVALID_RESPONSE/);
  await assert.rejects(requestAccountDeletion(id,async()=>({state:'pending',requestId:id}),()=>{}),/DELETION_INVALID_RESPONSE/);
});
test('an account change cannot become another account deletion or a success notice',async()=>{
  let active=true,calls=0;
  const ensure=()=>{if(!active)throw new Error('ACCOUNT_CHANGED');};
  await assert.rejects(requestAccountDeletion(id,async()=>{calls++;active=false;return{state:'deleted',requestId:id};},ensure),/ACCOUNT_CHANGED/);
  await assert.rejects(requestAccountDeletion(id,async()=>{calls++;},ensure),/ACCOUNT_CHANGED/);
  assert.equal(calls,1);
});
test('durable deletion receipts reject corrupt values and retain requested/deleted identity',()=>{
  assert.equal(parseDeletionReceipt('{broken'),null);
  assert.equal(parseDeletionReceipt(JSON.stringify({requestId:id,state:'unknown'})),null);
  assert.equal(parseDeletionReceipt(JSON.stringify({requestId:'-'.repeat(36),state:'deleted'})),null);
  assert.deepEqual(parseDeletionReceipt(JSON.stringify({requestId:id,state:'requested'})),{requestId:id,state:'requested'});
});

test('a malformed local deleted receipt cannot skip server confirmation and clear owner data',async()=>{
  let cleanup=0;
  await assert.rejects(finishAccountDeletion({requestId:'-'.repeat(36),state:'deleted'},async()=>{},()=>{},async()=>{},async()=>{cleanup++;}),/DELETION_INVALID_REQUEST/);
  assert.equal(cleanup,0);
});
test('device profile persists full compressed photo but never accepts cloud signed URLs',()=>{
  const photo='data:image/jpeg;base64,'+'A'.repeat(10001);
  assert.equal(readStoredProfile(JSON.stringify({displayName:'อาร์นัล',photoUri:photo})).photoUri,photo);
  assert.equal(readStoredProfile(JSON.stringify({photoUri:'https://project/storage/v1/object/sign/token'})).photoUri,null);
});

test('unconfirmed deletion, including an expired session, retains owner data and a requested receipt',async()=>{
  for (const failure of ['AUTH_REQUIRED','DELETION_AUTH_FAILED','network']) {
    let cleanups=0;const receipts=[];
    await assert.rejects(finishAccountDeletion({requestId:id,state:'requested'},async()=>{throw new Error(failure);},()=>{},async receipt=>{receipts.push(receipt);},async()=>{cleanups++;}),new RegExp(failure));
    assert.equal(cleanups,0);assert.deepEqual(receipts,[{requestId:id,state:'requested'}]);
  }
});
test('confirmed deletion persists its receipt before cleanup and retries cleanup without another server request',async()=>{
  let saved=null,calls=0,cleanups=0;
  const invoke=async()=>{calls++;return{requestId:id,state:'deleted'};};
  const persist=async receipt=>{saved=receipt;};
  const cleanup=async()=>{cleanups++;assert.equal(saved.state,'deleted');if(cleanups===1)throw new Error('local failure');};
  await assert.rejects(finishAccountDeletion({requestId:id,state:'requested'},invoke,()=>{},persist,cleanup),/local failure/);
  await finishAccountDeletion(saved,invoke,()=>{},persist,cleanup);
  assert.equal(calls,1);assert.equal(cleanups,2);
});
