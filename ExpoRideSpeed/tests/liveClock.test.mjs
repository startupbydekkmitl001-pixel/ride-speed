import {test} from 'node:test';import assert from 'node:assert/strict';
import {liveModule,snapshot,positions,owner} from './helpers/live.mjs';
const c=liveModule('clockModel'),motion=liveModule('peerMotion');
test('request-start anchor consumes network delay and a delayed response cannot renew an expired point',()=>{
 const room=snapshot(),page=positions(),scope={userId:owner,generation:1},frame=c.authorizedPeerFrame(scope,room,page,100,16100);assert.equal(c.freshConvoyPeers(frame,16100).length,0);assert.equal(c.nextLiveExpiry(frame,16100),null);
 const fresh=c.authorizedPeerFrame(scope,room,page,100,300);assert.equal(c.freshConvoyPeers(fresh,14999).length,1);assert.equal(c.freshConvoyPeers(fresh,15100).length,0);assert.equal(c.nextLiveExpiry(fresh,300),15100);
});
test('wall-clock jumps do not affect live marker expiry and monotonic rewind makes it unknown',()=>{
 const room=snapshot(),page=positions(),frame=c.authorizedPeerFrame({userId:owner,generation:1},room,page,100,300),wall=Date.now;Date.now=()=>0;try{assert.equal(c.freshConvoyPeers(frame,301).length,1);assert.equal(c.freshConvoyPeers(frame,100).length,0);assert.equal(c.estimatedLiveServerNow(frame.clock,299),null);}finally{Date.now=wall;}assert.throws(()=>c.liveClock(page.server_now,500,400),/LIVE_CLOCK_UNCERTAIN/);
});
test('peer motion follows shortest antimeridian path without overshoot, stops at actual newest fix and hides at TTL',()=>{
 const p=positions().items[0],previous={position:{...p,longitude:179.9},expiresMonotonicMs:2000,topicGeneration:3},current={position:{...p,longitude:-179.9,sequence:2,captured_at:'2026-10-01T02:00:01.123456+00:00'},expiresMonotonicMs:2500,topicGeneration:3};
 const m=motion.createPeerMotion(previous,current,1000,false);assert.equal(m.durationMs,0,'implausible jump must snap, never animate');
 previous.position.longitude=179.9999;current.position.longitude=-179.9999;const valid=motion.createPeerMotion(previous,current,1000,false),half=motion.samplePeerMotion(valid,1500);assert.ok(Math.abs(half.longitude)>179.99);assert.deepEqual(motion.samplePeerMotion(valid,2300),{latitude:p.latitude,longitude:-179.9999});assert.equal(motion.samplePeerMotion(valid,2500),null);
});
test('new membership/consent/topic or a missed sequence and Reduce Motion snap to actual point',()=>{
 const p=positions().items[0],previous={position:p,expiresMonotonicMs:10000,topicGeneration:3},current={position:{...p,sequence:2,captured_at:'2026-10-01T02:00:01.123456+00:00',longitude:100.5001},expiresMonotonicMs:12000,topicGeneration:3};
 for(const next of [{...current,topicGeneration:4},{...current,position:{...current.position,consent_revision:3}},{...current,position:{...current.position,sequence:3}}])assert.equal(motion.createPeerMotion(previous,next,100,false).durationMs,0);assert.equal(motion.createPeerMotion(previous,current,100,true).durationMs,0);
});
