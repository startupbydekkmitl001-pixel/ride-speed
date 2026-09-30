import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
import * as model from '../src/features/garage/localModel.ts';
const require=createRequire(import.meta.url),ts=require('typescript'),module={exports:{}};
const syncModule={exports:{}};new Function('module','exports',ts.transpileModule(readFileSync(new URL('../src/features/garage/syncModel.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(syncModule,syncModule.exports);
const source=readFileSync(new URL('../src/features/garage/GarageCoordinator.ts',import.meta.url),'utf8');
new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='./localModel'?model:name==='./syncModel'?syncModule.exports:require(name),module,module.exports);
const {GarageCoordinator}=module.exports,copy=v=>JSON.parse(JSON.stringify(v));
const vehicle=id=>({id,catalogId:null,category:'scooter',brand:'Honda',model:'PCX160',year:'',engineCc:156.9,powertrain:'petrol'});
const pause=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function fixture({vehicles=[],cloudVehicles=[],revision=0,session=true}={}){
 let owned={vehicles,selectedVehicleId:vehicles[0]?.id??null,garageSync:model.blankGarageSync()},remote={revision,document:model.garageDocument(cloudVehicles,cloudVehicles[0]?.id??null),updated_at:null},valid=true,failDisk=false,readHold=null,sendHold=null,writeHold=null,sequence=0;
 const disk={owned:copy(owned)},calls=[],receipts=new Map();
 const port={guard(){if(!valid)throw Error('ACCOUNT_CHANGED');},hasSession:()=>session,read:()=>owned,flush:async()=>{if(failDisk)throw Error('LOCAL_WRITE_FAILED');disk.owned=copy(owned);},write:async patch=>{owned={...owned,...copy(patch)};if(writeHold)await writeHold.promise;if(failDisk)throw Error('LOCAL_WRITE_FAILED');disk.owned=copy(owned);},operation:()=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12,'0')}`,
  async fetch(){if(readHold)await readHold.promise;return copy(remote);},async send(draft){calls.push(copy(draft));if(sendHold)await sendHold.promise;if(receipts.has(draft.operationId))return receipts.get(draft.operationId);if(draft.expectedRevision!==remote.revision)throw Error('GARAGE_REVISION_CONFLICT');remote={revision:remote.revision+1,document:copy(draft.document),updated_at:null};const ack={operation_id:draft.operationId,applied_revision:remote.revision,current_revision:remote.revision};receipts.set(draft.operationId,ack);return ack;},
 };
 const coordinator=new GarageCoordinator(port);
 return {coordinator,port,disk,calls,get owned(){return owned;},get remote(){return remote;},invalidate(){valid=false;},failDisk(v){failDisk=v;},holdWrite(){return writeHold=pause();},holdRead(){return readHold=pause();},holdSend(){return sendHold=pause();},remoteEdit(rows){remote={revision:remote.revision+1,document:model.garageDocument(rows,rows[0]?.id??null),updated_at:null};}};
}
test('empty new device adopts real garage and makes no publication',async()=>{const h=fixture({cloudVehicles:[vehicle('cloud')],revision:3});await h.coordinator.sync();assert.equal(h.owned.vehicles[0].id,'cloud');assert.equal(h.calls.length,0);assert.equal(h.coordinator.getSnapshot().status,'synced');});
test('unbound local garage conflicts with existing remote instead of overwriting',async()=>{const h=fixture({vehicles:[vehicle('local')],cloudVehicles:[vehicle('cloud')],revision:3});await h.coordinator.sync();assert.equal(h.coordinator.getSnapshot().status,'conflict');assert.equal(h.owned.vehicles[0].id,'local');assert.equal(h.calls.length,0);});
test('local edit during initial cloud read is preserved and conflicts',async()=>{const h=fixture({cloudVehicles:[vehicle('cloud')],revision:2});const hold=h.holdRead(),work=h.coordinator.sync();await h.coordinator.save(vehicle('local'));hold.resolve();await work;assert.equal(h.owned.vehicles[0].id,'local');assert.equal(h.coordinator.getSnapshot().status,'conflict');});
test('pending request stays immutable while a newer edit waits behind its ACK',async()=>{const h=fixture({vehicles:[vehicle('first')]});const hold=h.holdSend(),work=h.coordinator.sync();await new Promise(r=>setImmediate(r));await h.coordinator.save(vehicle('second'));hold.resolve();await work;assert.equal(h.calls[0].document.vehicles.length,1);assert.equal(h.calls.at(-1).document.vehicles.length,2);assert.equal(h.remote.document.vehicles.length,2);});
test('disk failure before send blocks egress and preserves visible retry draft',async()=>{const h=fixture({vehicles:[vehicle('local')]});h.failDisk(true);await h.coordinator.sync();assert.equal(h.calls.length,0);assert.equal(h.coordinator.getSnapshot().error,'LOCAL_WRITE_FAILED');h.failDisk(false);await h.coordinator.sync();assert.equal(h.remote.document.vehicles[0].id,'local');});
test('ACK disk failure preserves newer edits and never rewrites old pending draft',async()=>{const h=fixture({vehicles:[vehicle('first')]});const hold=h.holdSend(),work=h.coordinator.sync();await new Promise(r=>setImmediate(r));await h.coordinator.save(vehicle('second'));h.failDisk(true);hold.resolve();await work;assert.equal(h.calls.length,1);assert.equal(h.owned.vehicles.length,2);h.failDisk(false);await h.coordinator.sync();assert.equal(h.remote.document.vehicles.length,2);});
test('late account response cannot publish after scope changes',async()=>{const h=fixture({cloudVehicles:[vehicle('cloud')],revision:2});const hold=h.holdRead(),work=h.coordinator.sync();h.invalidate();hold.resolve();await work;assert.equal(h.owned.vehicles.length,0);assert.equal(h.calls.length,0);});
test('explicit local conflict choice publishes against freshly fetched revision',async()=>{const h=fixture({vehicles:[vehicle('local')],cloudVehicles:[vehicle('cloud')],revision:2});await h.coordinator.sync();h.remoteEdit([vehicle('newer')]);await h.coordinator.resolveConflict('local');assert.equal(h.remote.document.vehicles[0].id,'local');assert.equal(h.calls[0].expectedRevision,3);});
test('select/remove are owner durable and never mutate completed ride snapshot',async()=>{const h=fixture({vehicles:[vehicle('one'),vehicle('two')],session:false});const snapshot=copy(h.owned.vehicles[0]);await h.coordinator.select('two');await h.coordinator.remove('two');assert.equal(h.owned.selectedVehicleId,'one');assert.deepEqual(snapshot,vehicle('one'));assert.equal(h.calls.length,0);});
test('closed coordinator rejects retained mutation callbacks',async()=>{const h=fixture();h.coordinator.close();assert.equal(await h.coordinator.save(vehicle('late')),false);assert.equal(h.owned.vehicles.length,0);});
test('queued edit cannot recreate a vehicle deleted before its commit',async()=>{
 const h=fixture({vehicles:[vehicle('v')],session:false}),hold=h.holdWrite();
 const remove=h.coordinator.remove('v');await new Promise(r=>setImmediate(r));
 const edit=h.coordinator.save({...vehicle('v'),nickname:'stale editor'},{existingOnly:true});hold.resolve();await remove;
 assert.equal(await edit,false);assert.equal(h.owned.vehicles.length,0);assert.equal(h.coordinator.getSnapshot().error,'GARAGE_VEHICLE_CHANGED');
});
test('definitive expired photo rejection retires only that operation and blocks republishing until repaired',async()=>{
 const h=fixture({vehicles:[vehicle('v')]});h.port.send=async draft=>{h.calls.push(copy(draft));throw Error('GARAGE_PHOTO_EXPIRED');};
 await h.coordinator.sync();assert.equal(h.calls.length,1);assert.equal(h.owned.garageSync.pending,null);assert.equal(h.disk.owned.garageSync.pending,null);
 await h.coordinator.sync();assert.equal(h.calls.length,1);assert.equal(h.owned.vehicles[0].id,'v');
});
test('unknown photo upload response keeps the immutable operation for receipt recovery',async()=>{
 const h=fixture({vehicles:[vehicle('v')]});h.port.send=async draft=>{h.calls.push(copy(draft));throw Error('NETWORK_ERROR');};
 await h.coordinator.sync();const first=copy(h.owned.garageSync.pending);await h.coordinator.sync();assert.deepEqual(h.calls[1],first);assert.deepEqual(h.owned.garageSync.pending,first);
});
test('photo attachment derives fresh metadata after stalled writes and cannot resurrect removed target',async()=>{
 const h=fixture({vehicles:[{...vehicle('v'),nickname:'Original'}],session:false}),hold=h.holdWrite();
 const first=h.coordinator.save({...vehicle('v'),nickname:'Original',color:'#FF5A1F'});await new Promise(r=>setImmediate(r));
 const edit=h.coordinator.save({...vehicle('v'),nickname:'Edited while disk stalled'});
 const attachment=h.coordinator.attachPhoto('v',undefined,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg');hold.resolve();await Promise.all([first,edit,attachment]);
 assert.equal(h.owned.vehicles[0].nickname,'Edited while disk stalled');assert.ok(h.owned.vehicles[0].photoPath);
 await h.coordinator.remove('v');assert.equal(await h.coordinator.attachPhoto('v',undefined,'unused'),false);assert.equal(h.owned.vehicles.length,0);
});
