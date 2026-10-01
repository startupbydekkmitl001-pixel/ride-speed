import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveCaptureBus} from '../src/features/live/LiveCaptureBus.ts';

const scope={userId:'test-owner',generation:1};
const base={scope,rideId:'ride',captureId:'capture',segmentId:'segment',platform:'ios'};
const sample={timestampMs:10000,latitude:13,longitude:100,speedMps:0,horizontalAccuracyM:5,speedAccuracyMps:null,isSimulatedBySoftware:null,isProducedByAccessory:null,mocked:null};
const receipt=(extra={})=>({seq:2,captureId:'capture',segmentId:'segment',accepted:true,receivedAtMs:10000,sample:{...sample},...extra});
function setup(){let current=true;const bus=new LiveCaptureBus(()=>current),events=[];bus.subscribe(e=>events.push(e));return {bus,events,setCurrent(v){current=v;}};}

test('startup receipts are never replayed; only future exact bound receipts emit immutable detached fixes',()=>{
 const h=setup();h.bus.accept(receipt(),100,10000);assert.equal(h.events.length,0);
 h.bus.bind(base);const r=receipt();h.bus.accept(r,101,10000);
 const fix=h.events.at(-1).fix;assert.equal(fix.binding.scope,scope);assert.equal(fix.journalSequence,2);
 assert.equal(fix.binding.captureId,'capture');assert.equal(fix.sample.mocked,null);
 r.sample.latitude=40;assert.equal(fix.sample.latitude,13);assert.equal(Object.isFrozen(fix.sample),true);
 const replay=[];h.bus.subscribe(e=>replay.push(e));assert.equal(replay.filter(e=>e.kind==='sample').length,0);
});

test('foreign, old and stopped receipts cannot enter the passive channel',()=>{
 const h=setup();h.bus.bind(base);h.bus.accept(receipt({captureId:'old'}),100,10000);h.bus.accept(receipt({segmentId:'old'}),100,10000);
 assert.equal(h.events.filter(e=>e.kind==='sample').length,0);h.setCurrent(false);
 assert.equal(h.bus.getBinding(),null);h.bus.accept(receipt(),101,10000);assert.equal(h.events.filter(e=>e.kind==='sample').length,0);
 h.bus.invalidate('pause');h.setCurrent(true);h.bus.accept(receipt(),102,10000);assert.equal(h.bus.getBinding(),null);
});

test('quality loss clears the candidate without replay, while mock/zero/old receipts never emit samples',()=>{
 const h=setup();h.bus.bind(base);
 for(const raw of [receipt({accepted:false}),receipt({sample:{...sample,horizontalAccuracyM:0}}),receipt({sample:{...sample,mocked:true}}),receipt({sample:{...sample,timestampMs:1}})])h.bus.accept(raw,100,10000);
 assert.equal(h.events.filter(e=>e.kind==='sample').length,0);assert.equal(h.events.filter(e=>e.kind==='unavailable').length,4);
 assert.ok(h.bus.getBinding());h.bus.accept(receipt(),101,10000);assert.equal(h.events.at(-1).kind,'sample');
});

test('generation advances before invalidation listeners, and consumer exceptions cannot break capture',()=>{
 const h=setup();h.bus.subscribe(()=>{throw Error('consumer failed');});h.bus.bind(base);const generation=h.bus.getBinding().generation;
 h.bus.subscribe(e=>{if(e.kind==='invalidated')assert.equal(h.bus.getBinding(),null);});h.bus.invalidate('background');
 h.bus.bind(base);assert.ok(h.bus.getBinding().generation>generation);h.bus.accept(receipt(),100,10000);assert.equal(h.events.at(-1).kind,'sample');
 h.bus.close();h.bus.bind(base);h.bus.accept(receipt(),101,10000);assert.equal(h.bus.getBinding(),null);
});
