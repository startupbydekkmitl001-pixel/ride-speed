import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {communityModule,owner,peer,uuid,hold} from './communityFixtures.mjs';

const {CommunityPhotoStore}=communityModule('CommunityPhotoStore');
const bytes=Uint8Array.from([255,216,1,2,3,255,217]);
const descriptor={mime:'image/jpeg',sha256:createHash('sha256').update(bytes).digest('hex'),byte_count:bytes.length,width:1,height:1,blurhash:null};
const key=n=>({post_id:uuid(100+n),media_id:uuid(200+n)});
const tick=()=>new Promise(done=>setImmediate(done));
function fixture(){
 let current={userId:owner,generation:1},activity=0,active=true,refs=[],failRemoval=false,onRemove=null;
 const rows=new Map(),events=[],token=(o,k)=>`${o}/${k.post_id}/${k.media_id}`;
 const disk={
  async read(o,k){return rows.get(token(o,k))??null;},
  async list(o){events.push(['list',o]);return [...rows.keys()].filter(v=>v.startsWith(o+'/')).map(v=>({post_id:v.split('/')[1],media_id:v.split('/')[2]}));},
  async writeNew(o,k,v){events.push(['write',o,k.media_id]);if(rows.has(token(o,k)))throw Error('LOCAL_WRITE_FAILED');rows.set(token(o,k),Uint8Array.from(v));},
  async remove(o,k){events.push(['remove',o,k.media_id]);if(failRemoval)throw Error('LOCAL_WRITE_FAILED');if(onRemove)await onRemove(k);rows.delete(token(o,k));},
  async removeOwner(o){for(const v of [...rows.keys()])if(v.startsWith(o+'/'))rows.delete(v);},
 };
 const store=new CommunityPhotoStore({current:s=>s===current,disk,sha256:async v=>createHash('sha256').update(v).digest('hex')});
 return {store,rows,events,get scope(){return current;},get refs(){return refs;},set refs(v){refs=v;},references:()=>refs,failRemove(v){failRemoval=v;},onRemove(fn){onRemove=fn;},lease(){const scope=current,epoch=activity;return()=>{if(scope!==current)throw Error('ACCOUNT_CHANGED');if(!active||epoch!==activity)throw Error('COMMUNITY_INACTIVE');};},backgroundReturn(){active=false;++activity;active=true;++activity;},switch(){current={userId:peer,generation:2};}};
}

test('held adoption keeps the storage lane until durable metadata succeeds so prune cannot delete a candidate being adopted',async()=>{
 const f=fixture(),scope=f.scope,k=key(1),wait=hold();let entered=false;
 const adopt=f.store.putAndAdopt(scope,k,bytes,descriptor,async()=>{entered=true;await wait.promise;f.refs=[k];});
 await tick();assert.equal(entered,true);const listCount=f.events.filter(v=>v[0]==='list').length;
 const prune=f.store.prune(scope,f.references);await tick();assert.equal(f.events.filter(v=>v[0]==='list').length,listCount);
 wait.resolve();await adopt;await prune;assert.equal(f.rows.size,1);assert.equal(f.events.some(v=>v[0]==='remove'),false);
 assert.deepEqual(await f.store.read(scope,k,descriptor),bytes);
});
test('ambiguous adoption failure preserves referenced bytes while failed unreferenced adoption is recoverably pruned',async()=>{
 const f=fixture(),scope=f.scope,a=key(1),b=key(2);
 await assert.rejects(f.store.putAndAdopt(scope,a,bytes,descriptor,async()=>{f.refs=[a];throw Error('LOCAL_WRITE_FAILED');}),/LOCAL_WRITE_FAILED/);
 await assert.rejects(f.store.putAndAdopt(scope,b,bytes,descriptor,async()=>{throw Error('LOCAL_WRITE_FAILED');}),/LOCAL_WRITE_FAILED/);
 assert.equal(f.rows.size,2);await f.store.prune(scope,f.references);assert.equal(f.rows.size,1);
 assert.deepEqual(await f.store.read(scope,a,descriptor),bytes);await assert.rejects(f.store.read(scope,b,descriptor),/COMMUNITY_PHOTO_UNAVAILABLE/);
});
test('orphan cleanup failure keeps exact bytes for retry and never removes another owner or a live draft reference',async()=>{
 const f=fixture(),scope=f.scope,a=key(1),b=key(2);await f.store.put(scope,a,bytes,descriptor);await f.store.put(scope,b,bytes,descriptor);
 f.rows.set(`${peer}/${a.post_id}/${a.media_id}`,Uint8Array.from(bytes));f.refs=[a];f.failRemove(true);
 await assert.rejects(f.store.prune(scope,f.references),/LOCAL_WRITE_FAILED/);assert.equal(f.rows.size,3);
 f.failRemove(false);await f.store.prune(scope,f.references);assert.equal(f.rows.size,2);assert.equal(f.rows.has(`${peer}/${a.post_id}/${a.media_id}`),true);
 assert.deepEqual(await f.store.read(scope,a,descriptor),bytes);
});
test('prune checks fresh metadata again before each unlink after a previous disk removal awaits',async()=>{
 const f=fixture(),scope=f.scope,a=key(1),b=key(2);await f.store.put(scope,a,bytes,descriptor);await f.store.put(scope,b,bytes,descriptor);
 f.onRemove(async k=>{if(k.media_id===a.media_id){await tick();f.refs=[b];}});await f.store.prune(scope,f.references);
 assert.equal(f.rows.size,1);assert.deepEqual(await f.store.read(scope,b,descriptor),bytes);assert.equal(f.events.filter(v=>v[0]==='remove').length,1);
});
test('activity ABA retires held adoption and owner replacement prevents adoption or pruning through an old callback',async()=>{
 const f=fixture(),scope=f.scope,k=key(1),wait=hold(),guard=f.lease();
 const work=f.store.putAndAdopt(scope,k,bytes,descriptor,async()=>{await wait.promise;guard();f.refs=[k];},guard);
 await tick();f.backgroundReturn();wait.resolve();await assert.rejects(work,/COMMUNITY_INACTIVE/);assert.equal(f.refs.length,0);assert.equal(f.rows.size,1);
 await assert.rejects(f.store.prune(scope,f.references,guard),/COMMUNITY_INACTIVE/);f.switch();
 await assert.rejects(f.store.prune(scope,f.references),/ACCOUNT_CHANGED/);let called=false;
 await assert.rejects(f.store.putAndAdopt(scope,key(2),bytes,descriptor,async()=>{called=true;}),/ACCOUNT_CHANGED/);assert.equal(called,false);
 await f.store.prune(f.scope,()=>[]);assert.equal(f.rows.size,1);
});
test('same immutable candidate can be adopted again after local failure without a second write or nested-lane deadlock',async()=>{
 const f=fixture(),scope=f.scope,k=key(1);await f.store.put(scope,k,bytes,descriptor);let adopted=0;
 await f.store.putAndAdopt(scope,k,bytes,descriptor,async()=>{adopted++;f.refs=[k];});assert.equal(adopted,1);assert.equal(f.events.filter(v=>v[0]==='write').length,1);
 const changed=Uint8Array.from([1,2,3]),next={...descriptor,byte_count:3,sha256:createHash('sha256').update(changed).digest('hex')};
 await assert.rejects(f.store.putAndAdopt(scope,k,changed,next,async()=>{adopted++;}),/COMMUNITY_PHOTO_INVALID/);assert.equal(adopted,1);
});
test('held disk removal repeats the activity lease before another unlink and unread metadata is never treated as no references',async()=>{
 const f=fixture(),scope=f.scope,a=key(1),b=key(2);await f.store.put(scope,a,bytes,descriptor);await f.store.put(scope,b,bytes,descriptor);
 await assert.rejects(f.store.prune(scope,()=>{throw Error('LOCAL_READ_FAILED');}),/LOCAL_READ_FAILED/);assert.equal(f.events.some(v=>v[0]==='remove'),false);
 const guard=f.lease();f.onRemove(async()=>{await tick();f.backgroundReturn();});await assert.rejects(f.store.prune(scope,f.references,guard),/COMMUNITY_INACTIVE/);
 assert.equal(f.events.filter(v=>v[0]==='remove').length,1);assert.equal(f.rows.size,1);
});
