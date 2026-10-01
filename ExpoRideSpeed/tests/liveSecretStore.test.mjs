import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveSecretStore} from '../src/features/live/LiveSecretStore.ts';
const owner='10000000-0000-4000-8000-000000000001',resource='20000000-0000-4000-8000-000000000002',hash='a'.repeat(64);
const token='a'.repeat(42)+'A',code='ABCD1234',scope={userId:owner,generation:1};
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve};};
function setup(){const rows=new Map();let current=scope;let hold=null;const calls=[];
 const port={async getItem(k){return rows.get(k)??null;},async setItem(k,v){calls.push({k,v});if(hold)await hold.promise;rows.set(k,v);},async removeItem(k){rows.delete(k);}};
 const store=new LiveSecretStore(port,s=>s===current);
 return {rows,calls,store,switch(s){current=s;},hold(v){hold=v;}};
}
test('versioned code writes preserve the previous code until canonical hash changes',async()=>{
 const h=setup();await h.store.put(scope,'code',resource,hash,code);const next='b'.repeat(64);
 await h.store.put(scope,'code',resource,next,'BCDE2345');
 assert.equal(await h.store.get(scope,'code',resource,hash),code);assert.equal(await h.store.get(scope,'code',resource,next),'BCDE2345');
 assert.equal(await h.store.get(scope,'code',resource,'c'.repeat(64)),null);
});
test('delayed owner secret cannot appear in B or later A, and failed read never overwrites manifest',async()=>{
 const h=setup();await h.store.put(scope,'friend',resource,hash,token);h.switch({...scope,generation:2});
 await assert.rejects(h.store.get(scope,'friend',resource,hash),/ACCOUNT_CHANGED/);
 const fresh={...scope,generation:3};h.switch(fresh);assert.equal(await h.store.get(fresh,'friend',resource,hash),token);
 const key=[...h.rows.keys()].find(k=>k.endsWith('.index'));h.rows.set(key,'invalid recovery material');const before=h.calls.length;
 await assert.rejects(h.store.put(fresh,'code',resource,hash,code),/LOCAL_READ_FAILED/);assert.equal(h.calls.length,before);
});
test('closed owner fences held writes and deletes indexed bytes before returning',async()=>{
 const h=setup(),held=deferred();h.hold(held);const put=h.store.put(scope,'friend',resource,hash,token);
 await new Promise(r=>setImmediate(r));const removal=h.store.removeOwner(owner);held.resolve();
 await assert.rejects(put,/ACCOUNT_CHANGED/);await removal;assert.equal(h.rows.size,0);
 await assert.rejects(h.store.put(scope,'friend',resource,hash,token),/ACCOUNT_CHANGED/);
});
test('invalid raw code/token is rejected before any secret write',async()=>{
 const h=setup();await assert.rejects(h.store.put(scope,'code',resource,hash,'INVALID!'),/LIVE_INVALID/);
 await assert.rejects(h.store.put(scope,'friend',resource,hash,'short'),/LIVE_INVALID/);assert.equal(h.calls.length,0);
});
