import {test} from 'node:test';import assert from 'node:assert/strict';
import {liveModule,owner,peer,roomId,captureId,leaseId,uuid,stamp,snapshot,positions,hold,tick,copy} from './helpers/live.mjs';
const {LivePositionCoordinator}=liveModule('LivePositionCoordinator'),{liveClock}=liveModule('clockModel');
function setup(){
 let mono=100,wall=Date.parse(stamp),scope={userId:owner,generation:1},room=snapshot(),clock=liveClock(room.server_now,100,100),policy={scope,signedIn:true,hydrated:true,foreground:true,online:true,ghost:false,closed:false,receiveEnabled:true,mapFocused:true};
 const capture={scope,rideId:uuid(7),captureId,segmentId:uuid(8),generation:3,platform:'android'},binding={scope,room,roomClock:clock,capture,intent:{armedGeneration:8,captureId,leaseId,consentRevision:2,memberGeneration:2,topicGeneration:3}},sent=[],reads=[],frames=[],errors=[],refresh=[];
 const iso=ms=>new Date(ms).toISOString();
 const ack=s=>({owner_id:owner,convoy_id:roomId,lease_id:s.lease_id,sequence:s.sequence,received_at:s.captured_at,expires_at:iso(Date.parse(s.captured_at)+15000)});
 let publish=s=>Promise.resolve(ack(s)),read=()=>Promise.resolve(positions());
 const port={monotonicNow:()=>mono,wallNow:()=>wall,policy:()=>policy,current:b=>b.scope===policy.scope&&!policy.closed,publish:s=>{sent.push(s);return publish(s);},read:r=>{reads.push(r);return read(r);},refreshRoom:id=>{refresh.push(id);return Promise.resolve(null);},onPeers:f=>frames.push(f),onError:e=>errors.push(e)};
 const coordinator=new LivePositionCoordinator(port);
 const fix=(seq,change={})=>({binding:capture,journalSequence:seq,receivedMonotonicMs:mono,receivedWallMs:wall,sample:{timestampMs:wall,latitude:13.73,longitude:100.5,speedMps:0,horizontalAccuracyM:8,speedAccuracyMps:null,isSimulatedBySoftware:null,isProducedByAccessory:null,mocked:null,...change}});
 return {coordinator,binding,capture,room,clock,scope,policy,sent,reads,frames,errors,refresh,ack,fix,setClock:(m,w=Date.parse(stamp)+m-100)=>{mono=m;wall=w;},publish:f=>publish=f,read:f=>read=f};
}
test('only newest actual fix publishes once at 1Hz; a held request consumes no parallel slot or old-body retry',async()=>{
 const h=setup(),held=hold();h.publish(()=>held.promise);h.coordinator.bind(h.binding);h.coordinator.accept({kind:'sample',fix:h.fix(1)});const first=h.coordinator.tick();await tick();assert.equal(h.sent.length,1);assert.equal(h.sent[0].sequence,1);assert.equal(h.sent[0].source.mocked,null);assert.equal(h.sent[0].heading_deg,null);
 h.setClock(1100);h.coordinator.accept({kind:'sample',fix:h.fix(2,{longitude:100.5001})});h.coordinator.accept({kind:'sample',fix:h.fix(3,{longitude:100.5002})});await h.coordinator.tick();assert.equal(h.sent.length,1);held.reject(Error('network secret'));await first;h.publish(s=>Promise.resolve(h.ack(s)));await h.coordinator.tick();assert.equal(h.sent.length,2);assert.equal(h.sent[1].longitude,100.5002);assert.equal(h.sent[1].sequence,2);await h.coordinator.tick();assert.equal(h.sent.length,2);assert.ok(!h.errors.includes('network secret'));
});
test('quality clears a pending slot without disarming continuously current consent; stale source timestamps never become send time',async()=>{
 const h=setup();h.coordinator.bind(h.binding);h.coordinator.accept({kind:'sample',fix:h.fix(1)});h.coordinator.accept({kind:'unavailable',binding:h.capture,reason:'sample_quality'});await h.coordinator.tick();assert.equal(h.sent.length,0);assert.equal(h.errors.at(-1),'LOCATION_QUALITY');
 h.coordinator.accept({kind:'sample',fix:h.fix(2,{horizontalAccuracyM:0})});await h.coordinator.tick();assert.equal(h.sent.length,0);h.coordinator.accept({kind:'sample',fix:h.fix(3,{mocked:true})});await h.coordinator.tick();assert.equal(h.sent.length,0);
 h.coordinator.accept({kind:'sample',fix:h.fix(4)});h.setClock(3201);await h.coordinator.tick();assert.equal(h.sent.length,0);h.setClock(4201);h.coordinator.accept({kind:'sample',fix:h.fix(5)});await h.coordinator.tick();assert.equal(h.sent.length,1);assert.equal(h.sent[0].captured_at,new Date(Date.parse(stamp)+4101).toISOString());
});
test('missing or expired canonical room clock cannot authorize sender or reader even after wall-clock rewind',async()=>{
 const h=setup();h.coordinator.bind({...h.binding,roomClock:null});h.coordinator.accept({kind:'sample',fix:h.fix(1)});h.coordinator.setReceive(h.room,true,true,null);await h.coordinator.tick();assert.equal(h.sent.length,0);assert.equal(h.reads.length,0);assert.ok(h.errors.includes('LIVE_CLOCK_UNCERTAIN'));
 h.coordinator.bind(h.binding);h.coordinator.setReceive(h.room,true,true,h.clock);h.setClock(45100,0);h.coordinator.accept({kind:'sample',fix:h.fix(2)});await h.coordinator.tick();assert.equal(h.sent.length,0);assert.equal(h.reads.length,0);assert.equal(h.coordinator.getFrame(),null);
});
test('capture invalidation, account ABA, foreground loss and later active binding never rearm old sender',async()=>{
 for(const boundary of ['capture','account','background']){const h=setup(),held=hold();h.publish(()=>held.promise);h.coordinator.bind(h.binding);h.coordinator.accept({kind:'sample',fix:h.fix(1)});const first=h.coordinator.tick();await tick();
 if(boundary==='capture')h.coordinator.accept({kind:'invalidated',generation:4,reason:'pause'});if(boundary==='account')h.policy.scope={userId:owner,generation:2};if(boundary==='background')h.policy.foreground=false;
 h.setClock(1100);h.coordinator.accept({kind:'sample',fix:h.fix(2)});await h.coordinator.tick();held.resolve(h.ack(h.sent[0]));await first;h.policy.scope=h.scope;h.policy.foreground=true;h.coordinator.accept({kind:'active',binding:{...h.capture,generation:4}});h.coordinator.accept({kind:'sample',fix:h.fix(3)});await h.coordinator.tick();assert.equal(h.sent.length,1);}
});
test('same lease retains local sequence after topic rotation and response loss; max sequence never wraps',async()=>{
 const h=setup();h.room.self_consent.last_sequence=40;h.coordinator.bind(h.binding);h.coordinator.accept({kind:'sample',fix:h.fix(1)});h.publish(()=>Promise.reject(Error('lost')));await h.coordinator.tick();assert.equal(h.sent[0].sequence,41);
 h.setClock(1100);const rotated={...h.room,topic:`rs-convoy:${uuid(30)}`,topic_generation:4};h.coordinator.bind({...h.binding,room:rotated,intent:{...h.binding.intent,topicGeneration:4}});h.publish(s=>Promise.resolve(h.ack(s)));h.coordinator.accept({kind:'sample',fix:h.fix(2)});await h.coordinator.tick();assert.equal(h.sent[1].sequence,42);
 h.setClock(2100);h.coordinator.bind({...h.binding,room:{...h.room,self_consent:{...h.room.self_consent,last_sequence:2147483647}}});h.coordinator.accept({kind:'sample',fix:h.fix(3)});await h.coordinator.tick();assert.equal(h.sent.length,2);assert.equal(h.errors.at(-1),'POSITION_SEQUENCE');
});
test('receiver off/rotation discards held reads; GPS-free room hint clears immediately and cannot authorize its refresh response',async()=>{
 const h=setup(),held=hold();h.read(()=>held.promise);h.coordinator.setReceive(h.room,true,true,h.clock);const first=h.coordinator.tick();await tick();h.coordinator.setReceive(h.room,false,true,h.clock);held.resolve(positions());await first;assert.equal(h.coordinator.getFrame(),null);
 h.setClock(1100);h.read(()=>Promise.resolve(positions()));h.coordinator.setReceive(h.room,true,true,h.clock);await h.coordinator.tick();assert.equal(h.coordinator.getFrame().peers.length,1);
 h.coordinator.invalidation({schema_version:1,convoy_id:roomId,topic_generation:3,change_revision:5,kind:'room_changed',latitude:13});assert.ok(h.coordinator.getFrame());h.coordinator.invalidation({schema_version:1,convoy_id:roomId,topic_generation:3,change_revision:5,kind:'room_changed'});assert.equal(h.coordinator.getFrame(),null);await tick();assert.deepEqual(h.refresh,[roomId]);h.setClock(2100);await h.coordinator.tick();assert.equal(h.reads.length,2);
});
test('expiry fires while publication and read are both held; slow old page cannot resurrect expired points',async()=>{
 const h=setup();h.coordinator.setReceive(h.room,true,true,h.clock);await h.coordinator.tick();assert.equal(h.coordinator.getNextExpiry(),15100);const held=hold(),send=hold();h.setClock(1100);h.read(()=>held.promise);h.publish(()=>send.promise);h.coordinator.bind(h.binding);h.coordinator.accept({kind:'sample',fix:h.fix(1)});const work=h.coordinator.tick();await tick();h.setClock(15100);await h.coordinator.tick();assert.equal(h.coordinator.getFrame(),null);assert.equal(h.coordinator.getNextExpiry(),null);held.resolve(positions());send.resolve(h.ack(h.sent[0]));await work;assert.equal(h.coordinator.getFrame(),null);
});
test('typed read failure clears markers and backs off; synchronous port throws stay contained and peer sequence cannot rewind',async()=>{
 const h=setup();h.coordinator.setReceive(h.room,true,true,h.clock);await h.coordinator.tick();h.setClock(1100);h.read(()=>({error:{code:'LIVE_RATE_LIMITED'}}));await h.coordinator.tick();assert.equal(h.coordinator.getFrame(),null);h.setClock(2100);await h.coordinator.tick();assert.equal(h.reads.length,2);
 h.setClock(6100);h.read(()=>{throw Error('sensitive transport text');});await assert.doesNotReject(h.coordinator.tick());assert.equal(h.errors.at(-1),'LIVE_UNAVAILABLE');h.setClock(11100);const newer=positions();newer.items[0].sequence=3;h.read(()=>Promise.resolve(newer));await h.coordinator.tick();assert.equal(h.coordinator.getFrame().peers[0].position.sequence,3);h.setClock(12100);h.read(()=>Promise.resolve(positions()));await h.coordinator.tick();assert.equal(h.coordinator.getFrame(),null);assert.equal(h.errors.at(-1),'POSITION_SEQUENCE');
});
test('receive requires current hydrated foreground focused opt-in; ghost only disables sending, not independently opted-in viewing',async()=>{
 for(const flag of ['signedIn','hydrated','foreground','online','receiveEnabled','mapFocused']){const h=setup();h.policy[flag]=false;h.coordinator.setReceive(h.room,true,true,h.clock);await h.coordinator.tick();assert.equal(h.reads.length,0);}
 const h=setup();h.policy.ghost=true;h.coordinator.bind(h.binding);h.coordinator.accept({kind:'sample',fix:h.fix(1)});h.coordinator.setReceive(h.room,true,true,h.clock);await h.coordinator.tick();assert.equal(h.sent.length,0);assert.equal(h.reads.length,1);h.coordinator.close();h.setClock(1100);await h.coordinator.tick();assert.equal(h.coordinator.getFrame(),null);
});
