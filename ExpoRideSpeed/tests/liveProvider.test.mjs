import test from 'node:test';
import assert from 'node:assert/strict';
import {liveProviderHarness} from './helpers/liveProvider.mjs';
import {owner,roomId,uuid,hold,tick,copy,positions} from './helpers/live.mjs';

test('actual live provider makes no transport before owned hydration; receive alone never acquires GPS or grants sending',async()=>{
 const h=liveProviderHarness({hydrated:false});await h.settle();assert.equal(h.reads.length,0);assert.equal(h.sends.length,0);assert.equal(h.publishes.length,0);
 h.behavior.hydrated=true;h.render();await h.settle();let state=await h.open();assert.equal(state.ready,true);assert.equal(state.captureReady,false);
 state.setReceive(true);await h.settle();h.pulse(1000);state=await h.settle();assert.equal(h.positionReads.length,1);assert.equal(state.peers.length,1);assert.equal(h.behavior.gpsRequests,0);assert.equal(h.sends.length,0);assert.equal(h.publishes.length,0);assert.equal(state.share.armed,false);
 state.setReceive(false);state=h.render();assert.equal(state.peerFrame,null);assert.equal(state.peers.length,0);
});

test('passive capture pause does not stop an independently enabled receiver',async()=>{
 const h=liveProviderHarness();await h.settle();await h.open();h.bind();await h.settle();h.state.setReceive(true);await h.settle();h.pulse(1000);let state=await h.settle();assert.equal(state.peers.length,1);assert.equal(h.positionReads.length,1);
 h.bus.invalidate('pause');state=await h.settle();assert.equal(state.receiveEnabled,true);h.clock(1100);h.pulse(1000);state=await h.settle();assert.equal(h.positionReads.length,2,'paused own GPS must not disable independent viewing');assert.equal(h.behavior.gpsRequests,0);
});

test('actual live provider requires persisted control and canonical consent before publishing one actual capture fix',async()=>{
 const h=liveProviderHarness();await h.settle();await h.open();h.bind();await h.settle();const id=await h.state.grantLocation(900,h.review());let state=await h.settle();assert.ok(id);assert.equal(state.share.armed,true);assert.equal(state.pending.length,0);assert.equal(h.publishes.length,0);
 h.sample();h.pulse(1000);state=await h.settle();assert.equal(h.publishes.length,1);assert.equal(h.publishes[0].sample.capture_id,state.captureId);assert.equal(h.behavior.gpsRequests,0);
 h.background();state=h.render();assert.equal(state.share.armed,false);assert.equal(state.peerFrame,null);h.pulse(1000);await h.settle();assert.equal(h.publishes.length,1);h.foreground();await h.settle();h.sample(2);h.pulse(1000);await h.settle();assert.equal(h.publishes.length,1,'foreground return cannot restore disclosure authority');
});

test('canonical grant topic rotation and peer consent rotation rebind only the unchanged foreground lease',async()=>{
 const h=liveProviderHarness();await h.settle();await h.open();h.bind();await h.settle();const original=h.canonical.topic_generation;await h.state.grantLocation(900,h.review());let state=await h.settle();assert.equal(state.room.topic_generation,original+1);assert.equal(state.share.armed,true);h.sample();h.pulse(1000);await h.settle();assert.equal(h.publishes[0].sample.topic_generation,original+1);assert.equal(h.publishes[0].sample.sequence,1);
 const prior=h.clients.at(-1),room=copy(h.canonical),lease=room.self_consent.lease_id;h.rotateRoom();const event={schema_version:1,convoy_id:roomId,topic_generation:room.topic_generation,change_revision:h.canonical.change_revision,kind:'room_changed'};prior.channels[0].handlers[0].fn({payload:event});state=await h.settle();assert.equal(prior.closed,true);assert.equal(state.room.topic_generation,original+2);assert.equal(state.room.self_consent.lease_id,lease);assert.equal(state.share.armed,true);h.clock(1100);h.sample(2);h.pulse(1000);await h.settle();assert.equal(h.publishes.length,2);assert.equal(h.publishes[1].sample.topic_generation,original+2);assert.equal(h.publishes[1].sample.sequence,2);assert.equal(h.sends.length,1,'peer topic refresh must not issue another disclosure/grant');
 h.background();h.foreground();await h.settle();h.rotateRoom();await h.state.refresh();await h.settle();assert.equal(h.state.share.armed,false,'topic refresh cannot revive interrupted authority');
});

test('held grant ACK cannot arm after background, capture pause, account generation or confirmed deletion',async()=>{
 for(const boundary of ['background','pause','account','delete']){
  const h=liveProviderHarness();await h.settle();await h.open();h.bind();await h.settle();const held=hold();h.behavior.sendHold=held;const waiting=h.state.grantLocation(900,h.review());await tick();await h.settle();assert.equal(h.sends.length,1);
  if(boundary==='background')h.background();if(boundary==='pause')h.bus.invalidate('pause');if(boundary==='account'){h.switch(uuid(22));h.switch(owner);}if(boundary==='delete')h.delete();
  held.resolve();await waiting;let state=await h.settle();assert.equal(state.share.armed,false,boundary);assert.equal(state.peerFrame,null,boundary);h.sample(2);h.pulse(1000);await h.settle();assert.equal(h.publishes.length,0,boundary);
  if(boundary==='delete'){assert.equal(state.ready,false);await assert.rejects(()=>state.refresh(),/ACCOUNT_CHANGED/);}
 }
});

test('stop during held grant cancels its exact frozen operation before a late ACK can arm',async()=>{
 const h=liveProviderHarness();await h.settle();await h.open();h.bind();await h.settle();const held=hold();h.behavior.sendHold=held;const grant=h.state.grantLocation(900,h.review());await tick();await h.settle();const op=h.sends[0].op;
 const stop=h.state.stopSharing();await tick();await h.settle();assert.equal(h.cancels.length,1);assert.equal(h.cancels[0].op.operationId,op.operationId);assert.deepEqual(copy(h.cancels[0].op.request),copy(op.request));assert.equal(h.state.share.armed,false);
 held.resolve();await Promise.all([grant,stop]);const state=await h.settle();assert.equal(state.share.armed,false);assert.equal(state.pending.length,0);assert.equal(h.canonical.self_consent.precision,'none');h.sample();h.pulse(1000);await h.settle();assert.equal(h.publishes.length,0);
});

test('secret bytes are persisted before a control intent, and code rotation keeps the canonical old hash until ACK',async()=>{
 const h=liveProviderHarness();h.seedCode('1234ABCD');await h.settle();await h.open();assert.equal(await h.state.getRoomCode(roomId),'1234ABCD');
 const held=hold();h.behavior.secretHold=held;const create=h.state.createFriendLink(3600);await tick();assert.equal(h.sends.length,0);assert.equal(h.owned.get(owner).length,0);held.resolve();await create;await h.settle();assert.equal(h.sends.length,1);assert.equal(h.secretEvents[0].id,h.sends[0].op.request.link_id);
 h.behavior.secretHold=null;const ack=hold();h.behavior.sendHold=ack;const rotate=h.state.rotateCode(h.state.room);await tick();await h.settle();assert.equal(await h.state.getRoomCode(roomId),'1234ABCD','new secret must not replace canonical issued code before receipt');ack.resolve();await rotate;await h.settle();const code=await h.state.getRoomCode(roomId);assert.equal(typeof code,'string');assert.notEqual(code,'1234ABCD');assert.equal(code.length,8);
});

test('secret storage failure never enqueues an unrecoverable invite token',async()=>{
 const h=liveProviderHarness();await h.settle();h.behavior.secretFailure=true;await assert.rejects(()=>h.state.createFriendLink(3600),/LOCAL_WRITE_FAILED/);assert.equal(h.sends.length,0);assert.equal(h.owned.get(owner).length,0);
});

test('the acknowledged private link uses only the installed allowlisted app scheme',async()=>{
 for(const [scheme,expected] of [['ridespeed-dev','ridespeed-dev'],['ridespeed','ridespeed'],['untrusted','ridespeed'],[undefined,'ridespeed']]){
  const h=liveProviderHarness({scheme});await h.settle();await h.state.createFriendLink(3600);const state=await h.settle();const url=await state.getFriendLinkUrl(state.links[0].id);assert.equal(new URL(url).protocol,`${expected}:`);assert.equal(new URL(url).search,'');assert.equal(h.sends.length,1);
 }
});

test('explicit recovery retries a nonsensitive saved control with the same immutable operation ID',async()=>{
 const h=liveProviderHarness();await h.settle();const send=h.service.mutateLive;let failed=false;h.service.mutateLive=async(...args)=>{if(!failed){failed=true;h.sends.push({requested:args[0],op:args[2]});throw Error('LIVE_UNAVAILABLE');}return send(...args);};
 const id=await h.state.createFriendLink(3600);let state=await h.settle();assert.ok(id);assert.equal(state.pending.length,1);const frozen=copy(state.pending[0]);assert.equal(h.sends.length,1);await state.retry(id);state=await h.settle();assert.equal(h.sends.length,2);assert.equal(h.sends[1].op.operationId,id);assert.deepEqual(copy(h.sends[1].op.request),frozen.request);assert.equal(state.pending.length,0);assert.equal(state.latest.status,'applied');
});

test('incoming guest review survives sign-in but not a signed account switch; no automatic friend request',async()=>{
 const h=liveProviderHarness({guest:true}),link=`ridespeed://friend/v1/${uuid(7)}#token=${'A'.repeat(43)}`;await h.settle();assert.equal(h.incoming.captureIncomingLink(link),true);let state=h.render();assert.ok(state.incomingFriendIntent);assert.equal(state.ready,false);assert.equal(h.sends.length,0);assert.equal(h.reads.length,0);
 h.switch(owner);state=await h.settle();assert.ok(state.incomingFriendIntent);assert.equal(h.sends.length,0);assert.deepEqual(copy(state.consumeIncomingFriendIntent()),{linkId:uuid(7),token:'A'.repeat(43)});assert.equal(h.render().incomingFriendIntent,null);
 h.incoming.captureIncomingLink(link);h.switch(uuid(22));h.switch(owner);state=await h.settle();assert.equal(state.incomingFriendIntent,null);
});

test('a held prior-owner read cannot replace the new generation or reopen a deleted identity',async()=>{
 const h=liveProviderHarness();await h.settle();const retained=h.state,held=hold();h.behavior.readHold={kind:'room',scope:h.scope,promise:held.promise};const wait=retained.openRoom(roomId);await tick();h.switch(uuid(22));h.switch(owner);h.behavior.readHold=null;await h.settle();held.resolve({...copy(h.canonical),title:'stale fixture'});await wait;const state=await h.settle();assert.equal(state.room,null);assert.equal(state.ready,true);await assert.rejects(()=>retained.openRoom(roomId),/ACCOUNT_CHANGED/);
 h.delete();const after=h.render();assert.equal(after.ready,false);assert.equal(after.room,null);
});

test('retained prior-account receive-off and stop-sharing callbacks cannot change the current account view',async()=>{
 const h=liveProviderHarness();await h.settle();await h.open();const retained=h.state,other=uuid(22);h.switch(other);await h.settle();const get=h.service.getConvoy;h.service.getConvoy=async(requested,...args)=>requested.userId===other?{...copy(h.canonical),owner_id:other,host_id:other,members:h.canonical.members.map(member=>member.user_id===owner?{...copy(member),user_id:other,handle:'other_owner',display_name:'Fixture other'}:copy(member))}:get(requested,...args);
 h.service.getConvoyPositions=async requested=>({...positions(),owner_id:requested.userId});await h.state.openRoom(roomId);await h.settle();h.state.setReceive(true);await h.settle();h.pulse(1000);await h.settle();assert.equal(h.state.receiveEnabled,true);assert.equal(h.state.peers.length,1);const frame=h.state.peerFrame;
 assert.throws(()=>retained.setReceive(false),/ACCOUNT_CHANGED/);assert.equal(h.render().receiveEnabled,true);await assert.rejects(()=>retained.stopSharing(),/ACCOUNT_CHANGED/);assert.equal(h.render().peerFrame,frame);assert.equal(h.state.peers.length,1);assert.equal(h.sends.length,0);assert.equal(h.cancels.length,0);
});
