import test from 'node:test';
import assert from 'node:assert/strict';
import {socialModule,uuid,owner,stamp,operation,receipt,copy,hold,tick} from './helpers/social.mjs';
const {SocialCoordinator}=socialModule('SocialCoordinator');
function fixture(rows=[]){
 let owned={socialOperations:copy(rows)},disk=copy(owned),valid=true,fail=false,session=true,sequence=10,sendHold=null,statusHold=null,sendError=null,statusError=null,response=null,lose=false,refreshError=false,ackFail=false;
 const calls=[],receipts=new Map(),port={ownerId:owner,guard(){if(!valid)throw Error('ACCOUNT_CHANGED');},hasSession:()=>session,read:()=>owned,
  async write(patch){owned={...owned,...copy(patch)};if(fail)throw Error('LOCAL_WRITE_FAILED');disk=copy(owned);},async flush(){if(fail)throw Error('LOCAL_WRITE_FAILED');disk=copy(owned);},operationUUID:()=>uuid(sequence++),nowISO:()=>stamp,
  async send(op){calls.push({kind:'send',op:copy(op),disk:copy(disk)});if(sendHold)await sendHold.promise;if(sendError)throw Error(sendError);if(response)return copy(response);const result=receipt(op);receipts.set(op.operationId,result);if(ackFail)fail=true;if(lose)throw Error('lost connection');return result;},
  async status(id){calls.push({kind:'status',id});if(statusHold)await statusHold.promise;if(statusError)throw Error(statusError);return copy(receipts.get(id)??null);},
  async refresh(ack){calls.push({kind:'refresh',ack:copy(ack),disk:copy(disk)});if(refreshError)throw Error('private detail');},
 };
 return {port,calls,receipts,get owned(){return owned;},get disk(){return disk;},invalidate:()=>{valid=false;},fail:v=>{fail=v;},session:v=>{session=v;},sendHold:()=>sendHold=hold(),statusHold:()=>statusHold=hold(),sendError:v=>{sendError=v;},statusError:v=>{statusError=v;},response:v=>{response=v;},lose:v=>{lose=v;},refreshError:v=>{refreshError=v;},ackFail:v=>{ackFail=v;}};
}
test('durable social enqueue precedes egress and canonical refresh follows durable receipt removal',async()=>{
 assert.equal(typeof SocialCoordinator,'function');const h=fixture(),c=new SocialCoordinator(h.port),id=await c.enqueue(operation().request);
 assert.equal(id,uuid(10));const sent=h.calls.find(x=>x.kind==='send');assert.equal(sent.disk.socialOperations[0].operationId,id);assert.deepEqual(h.owned.socialOperations,[]);
 const refresh=h.calls.find(x=>x.kind==='refresh');assert.deepEqual(refresh.disk.socialOperations,[]);assert.equal(refresh.ack.operation_id,id);assert.deepEqual(c.getSnapshot().latest,{operationId:id,status:'applied',error:null});
});
test('lost send recovers exact durable receipt and restart never replaces reviewed request or operation UUID',async()=>{
 assert.equal(typeof SocialCoordinator,'function');const h=fixture(),c=new SocialCoordinator(h.port);h.lose(true);h.statusError('offline');const id=await c.enqueue(operation().request);assert.equal(h.owned.socialOperations.length,1);const stored=copy(h.disk.socialOperations);
 c.close();h.statusError(null);h.lose(false);const restarted=new SocialCoordinator({...h.port,read:()=>({socialOperations:stored}),write:async patch=>{stored.splice(0,stored.length,...copy(patch.socialOperations));}});await restarted.retry();assert.deepEqual(stored,[]);assert.equal(h.calls.filter(x=>x.kind==='send').length,1);assert.equal(restarted.getSnapshot().latest.operationId,id);
});
test('only typed business rejection plus confirmed null retires; generic same-message errors stay unknown',async()=>{
 assert.equal(typeof SocialCoordinator,'function');const h=fixture(),c=new SocialCoordinator(h.port);h.sendError('FRIEND_CHANGED');await c.enqueue(operation().request);assert.equal(h.owned.socialOperations.length,1);assert.equal(c.getSnapshot().latest,null);
 h.sendError(null);h.response({error:{code:'FRIEND_CHANGED'}});h.statusError('offline');await c.retry();assert.equal(h.owned.socialOperations.length,1);
 h.statusError(null);await c.retry();assert.equal(h.owned.socialOperations.length,0);assert.equal(c.getSnapshot().latest.status,'rejected');assert.equal(c.getSnapshot().latest.error,'FRIEND_CHANGED');
});
test('unreadable or failed local storage prevents egress; failed ACK persistence restores immutable pending',async()=>{
 assert.equal(typeof SocialCoordinator,'function');const h=fixture(),c=new SocialCoordinator(h.port);h.fail(true);assert.equal(await c.enqueue(operation().request),null);assert.equal(h.calls.length,0);
 h.fail(false);await c.retry();assert.equal(h.owned.socialOperations.length,0);h.ackFail(true);const id=await c.enqueue(operation().request);assert.equal(h.owned.socialOperations[0].operationId,id);assert.equal(c.getSnapshot().latest.operationId,uuid(10));
 h.ackFail(false);h.fail(false);await c.retry();assert.deepEqual(h.owned.socialOperations,[]);assert.equal(c.getSnapshot().latest.operationId,id);
 const unread=new SocialCoordinator({...h.port,read(){throw Error('LOCAL_READ_FAILED');}});await unread.retry();assert.equal(unread.getSnapshot().error,'LOCAL_READ_FAILED');
});
test('restored handle request checks receipt only until explicit review retry; unknown same lane blocks later intent',async()=>{
 assert.equal(typeof SocialCoordinator,'function');const row={...operation(),queuedAt:stamp,lastError:null},h=fixture([row]),c=new SocialCoordinator(h.port);await c.retry();assert.equal(h.calls.filter(x=>x.kind==='send').length,0);assert.deepEqual(c.getSnapshot().reviewRequired,[row.operationId]);await c.retry(row.operationId);assert.equal(h.calls.filter(x=>x.kind==='send').length,1);
});
test('owner closure fences delayed receipts and refresh cannot cause a resend after durable ACK',async()=>{
 assert.equal(typeof SocialCoordinator,'function');const h=fixture(),c=new SocialCoordinator(h.port),held=h.sendHold(),work=c.enqueue(operation().request);await tick();const before=copy(h.owned);h.invalidate();c.close();held.resolve();await work;assert.deepEqual(h.owned,before);assert.equal(h.calls.filter(x=>x.kind==='refresh').length,0);
 const next=fixture(),other=new SocialCoordinator(next.port);next.refreshError(true);await other.enqueue(operation().request);assert.deepEqual(next.owned.socialOperations,[]);assert.equal(other.getSnapshot().latest.status,'applied');await other.retry();assert.equal(next.calls.filter(x=>x.kind==='send').length,1);assert.equal(other.getSnapshot().error,'SOCIAL_UNAVAILABLE');
});
test('later queued intents survive an earlier ACK reducer and its failed-persistence restoration',async()=>{
 const h=fixture(),c=new SocialCoordinator(h.port),held=h.sendHold(),first=c.enqueue(operation().request);await tick();
 const second=c.enqueue({schema_version:1,action:'request_friend',handle:'other'});await tick();h.ackFail(true);held.resolve();const [firstId,secondId]=await Promise.all([first,second]);
 assert.deepEqual(h.owned.socialOperations.map(row=>row.operationId),[firstId,secondId]);assert.equal(h.owned.socialOperations[1].request.handle,'other');
 h.ackFail(false);h.fail(false);await c.retry();assert.deepEqual(h.owned.socialOperations,[]);assert.equal(h.calls.filter(x=>x.kind==='send').length,2);
});
test('one unknown target lane blocks its later mutation while independent target recovery continues',async()=>{
 const first={...operation({schema_version:1,action:'friend_action',other_id:uuid(2),verb:'remove',expected_generation:1},uuid(10)),queuedAt:stamp,lastError:null};
 const second={...operation({schema_version:1,action:'friend_action',other_id:uuid(2),verb:'block',expected_generation:1},uuid(11)),queuedAt:stamp,lastError:null};
 const third={...operation({schema_version:1,action:'unblock',other_id:uuid(3),block_token:uuid(4)},uuid(12)),queuedAt:stamp,lastError:null};
 const h=fixture([first,second,third]),c=new SocialCoordinator(h.port);h.port.send=async op=>{h.calls.push({kind:'send',op:copy(op)});if(op.operationId===uuid(10))throw Error('network');return receipt(op,{kind:'unblock',user_id:uuid(3),state:'unblocked'});};
 await c.retry();assert.deepEqual(h.calls.filter(x=>x.kind==='send').map(x=>x.op.operationId),[uuid(10),uuid(12)]);assert.deepEqual(h.owned.socialOperations.map(x=>x.operationId),[uuid(10),uuid(11)]);
});
test('malformed or foreign receipt cannot remove pending; a typed rejection cannot defeat a matching applied receipt',async()=>{
 const h=fixture(),c=new SocialCoordinator(h.port);h.response({...receipt(),owner_id:uuid(9)});const id=await c.enqueue(operation().request);assert.equal(h.owned.socialOperations[0].operationId,id);assert.equal(c.getSnapshot().latest,null);assert.equal(c.getSnapshot().error,'SOCIAL_INVALID_RESPONSE');
 h.response({error:{code:'SOCIAL_RATE_LIMITED'}});h.port.send=async op=>{const ack=receipt(op);h.receipts.set(op.operationId,ack);return {error:{code:'SOCIAL_RATE_LIMITED'}};};await c.retry();assert.deepEqual(h.owned.socialOperations,[]);assert.equal(c.getSnapshot().latest.status,'applied');
});
test('each retry pass bounds network intents and never writes an unreadable owner into an empty outbox',async()=>{
 const rows=Array.from({length:6},(_,i)=>({...operation({schema_version:1,action:'unblock',other_id:uuid(2+i),block_token:uuid(20+i)},uuid(10+i)),queuedAt:stamp,lastError:null}));
 const h=fixture(rows),c=new SocialCoordinator(h.port);h.port.send=async op=>{h.calls.push({kind:'send',op:copy(op)});return receipt(op,{kind:'unblock',user_id:op.request.other_id,state:'unblocked'});};await c.retry();assert.equal(h.calls.filter(x=>x.kind==='send').length,4);assert.equal(h.owned.socialOperations.length,2);await c.retry();assert.equal(h.owned.socialOperations.length,0);
 const before=copy(h.owned);h.port.read=()=>{throw Error('LOCAL_READ_FAILED');};await c.retry();assert.deepEqual(h.owned,before);assert.equal(c.getSnapshot().error,'LOCAL_READ_FAILED');
});
test('a read failure after a pending send releases busy without guessing empty data, and recovery flushes first',async()=>{
 const h=fixture(),c=new SocialCoordinator(h.port),read=h.port.read;h.port.send=async()=>{h.port.read=()=>{throw Error('LOCAL_READ_FAILED');};throw Error('network');};await c.enqueue(operation().request);assert.equal(c.getSnapshot().busy,false);assert.equal(c.getSnapshot().pending.length,1);assert.equal(c.getSnapshot().error,'LOCAL_READ_FAILED');
 h.port.read=read;h.port.send=async op=>receipt(op);await c.retry();assert.deepEqual(h.owned.socialOperations,[]);assert.equal(c.getSnapshot().error,null);
});
test('presence account refresh is invoked only with validated durable receipt and never after failed ACK removal',async()=>{
 const h=fixture(),c=new SocialCoordinator(h.port);h.port.send=async op=>{h.fail(true);return receipt(op,{kind:'presence',enabled:true,account_revision:3});};const id=await c.enqueue({schema_version:1,action:'set_presence',enabled:true,expected_account_revision:2});assert.equal(h.calls.filter(x=>x.kind==='refresh').length,0);assert.equal(h.owned.socialOperations[0].operationId,id);
 h.fail(false);h.receipts.set(id,receipt(h.owned.socialOperations[0],{kind:'presence',enabled:true,account_revision:3}));await c.retry();assert.equal(h.calls.find(x=>x.kind==='refresh').ack.result.kind,'presence');assert.deepEqual(h.calls.find(x=>x.kind==='refresh').disk.socialOperations,[]);
});
