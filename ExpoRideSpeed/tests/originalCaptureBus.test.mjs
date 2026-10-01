import test from 'node:test';
import assert from 'node:assert/strict';
import {OriginalCaptureBus} from '../src/features/races/OriginalCaptureBus.ts';
const scope=Object.freeze({userId:'A',generation:1});
const binding={scope,rideId:'ride',captureId:'capture',segmentId:'segment',platform:'ios',provider:'ios_core_location',startedWallMs:1000,startedMonotonicMs:0};
const receipt=(seq,extra={})=>({seq,captureId:'capture',segmentId:'segment',accepted:false,receivedAtMs:1000+seq,receivedMonotonicMs:seq,sample:{latitude:13,longitude:100,timestampMs:1000+seq,speedMps:null,horizontalAccuracyM:80,speedAccuracyMps:null,isSimulatedBySoftware:null,isProducedByAccessory:null,mocked:true},...extra});
test('passive original bus preserves bad and unknown raw fixes without replaying them or starting a watcher',()=>{
 const bus=new OriginalCaptureBus(()=>true),events=[];bus.bind(binding);bus.accept(receipt(0));bus.subscribe(e=>events.push(e));assert.deepEqual(events.map(e=>e.kind),['active']);
 const raw=receipt(1);bus.accept(raw);raw.sample.latitude=99;assert.equal(events[1].kind,'receipt');assert.equal(events[1].receipt.accepted,false);assert.equal(events[1].receipt.sample.mocked,true);assert.equal(events[1].receipt.sample.isSimulatedBySoftware,null);assert.equal(events[1].receipt.sample.latitude,13);assert.ok(Object.isFrozen(events[1].receipt.sample));assert.ok(Object.isFrozen(events[1].receipt));
});
test('capture/account validity is checked synchronously; a new generation cannot borrow a previous raw receipt',()=>{
 let valid=true;const bus=new OriginalCaptureBus(()=>valid),events=[];bus.subscribe(e=>events.push(e));bus.bind(binding);const first=bus.getBinding();valid=false;assert.equal(bus.getBinding(),null);bus.accept(receipt(0));assert.equal(events.length,1);
 valid=true;bus.invalidate('background');bus.bind({...binding,scope:{userId:'A',generation:3}});assert.notEqual(bus.getBinding().generation,first.generation);bus.accept({...receipt(0),captureId:'old'});assert.equal(events.filter(e=>e.kind==='receipt').length,0);
});
test('missing metadata remains unknown and passive listener exceptions cannot break recording',()=>{
 const bus=new OriginalCaptureBus(()=>true),events=[];bus.subscribe(()=>{throw Error('consumer');});bus.subscribe(e=>events.push(e));bus.bind(binding);const old=receipt(0);delete old.receivedMonotonicMs;bus.accept(old);assert.equal(events.at(-1).receipt.receivedMonotonicMs,null);bus.close();bus.accept(receipt(1));assert.equal(bus.getBinding(),null);assert.equal(events.at(-1).kind,'invalidated');
});
