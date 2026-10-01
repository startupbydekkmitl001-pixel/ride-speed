import test from 'node:test';
import assert from 'node:assert/strict';
import { createRide, beginCapture, activateCapture, acceptSample, endCapture, finishRide, persistedRide } from '../src/features/rides/journalModel.ts';
import { DurableRideQueue } from '../src/features/rides/DurableRideQueue.ts';
const sample = (second, longitude = 100 + second / 10000, extra = {}) => ({timestampMs:1700000000000 + second*1000,latitude:13,longitude,speedMps:10,horizontalAccuracyM:5,speedAccuracyMps:0.2,isSimulatedBySoftware:false,isProducedByAccessory:false,mocked:null,...extra});
const newRide = () => createRide('ride','owner',1700000000000,{id:'vehicle',category:'scooter',brand:'Honda',model:'PCX160',engineCc:156.93,catalogId:null,year:'2026'});
test('pause/restart retains immutable vehicle and never bridges geometry gaps',()=>{
 const r=newRide(); beginCapture(r,'capture1','segment1',0,'ios_core_location');
 acceptSample(r,sample(0),sample(0).timestampMs); acceptSample(r,sample(1),sample(1).timestampMs);
 endCapture(r,1000,1700000001000); beginCapture(r,'capture2','segment2',10000,'expo_location');
 acceptSample(r,sample(10,101),sample(10).timestampMs); acceptSample(r,sample(11,101.0001),sample(11).timestampMs);
 endCapture(r,11000,1700000011000); finishRide(r,1700000011000);
 assert.equal(r.activeDurationMs,2000); assert.equal(r.captures.length,2); assert.equal(r.fragments.length,2);
 assert.ok(r.distanceMeters<30); assert.equal(r.vehicle.model,'PCX160'); assert.equal(r.status,'complete');
});
test('poor, mocked, stale and teleported fixes are retained as receipts but split visible paths',()=>{
 const r=newRide(); beginCapture(r,'capture','segment',0,'ios_core_location');
 for(const s of [sample(0),sample(1),sample(2,100.0002,{mocked:true}),sample(3,100.0003),sample(4,101),sample(5,101.0001),sample(6,101.0002,{horizontalAccuracyM:80})])acceptSample(r,s,s.timestampMs);
 assert.equal(r.rawCount,7); assert.equal(r.rejectedCount,3); assert.equal(r.fragments.length,3); assert.ok(r.distanceMeters<30);
 assert.equal(acceptSample(r,sample(20),sample(20).timestampMs+5000).accepted,false);
});
test('backward wall clock cannot make negative duration or dishonest elapsed time',()=>{
 const r=newRide(); beginCapture(r,'capture','segment',50,'expo_location'); endCapture(r,1050,1699999999000); finishRide(r,1699999999000);
 assert.equal(r.activeDurationMs,1000); assert.equal(r.clockAnomaly,true); assert.equal(r.endedAtMs,1699999999000);
 assert.equal(r.captures[0].endedAtMs,1699999999000); assert.equal(r.startedAtMs,1700000000000);
});
test('failed journal job stays queued; retry writes original sample before finalization',async()=>{
 const events=[];let fail=true;const q=new DurableRideQueue();
 q.append('owner',async()=>{events.push('sample');if(fail)throw Error('disk');});
 q.append('owner',async()=>{events.push('finish');});
 await assert.rejects(q.drain());assert.deepEqual(events,['sample']);fail=false;await q.drain();assert.deepEqual(events,['sample','sample','finish']);
});
test('confirmed deletion closes old writes then removes owner after any in-flight job',async()=>{
 let release;const events=[];const q=new DurableRideQueue();
 q.append('A',()=>new Promise(resolve=>{release=()=>{events.push('A');resolve();};}));await Promise.resolve();
 const removal=q.closeOwner('A',async()=>{events.push('remove A');});q.append('A',async()=>events.push('late A'));q.append('B',async()=>events.push('B'));
 release();await removal;await q.drain();assert.deepEqual(events,['A','remove A','B']);
});
test('original acquisition and receipt monotonic times are persisted without reconstructing them from wall time',()=>{
 const r=newRide();beginCapture(r,'capture','segment',12,'ios_core_location',true);activateCapture(r,450,1700000000450);
 const receipt=acceptSample(r,sample(1),1700000001100,1099.75);endCapture(r,1400.5,1700000001401);
 const saved=JSON.parse(JSON.stringify(persistedRide(r)));assert.equal(saved.captures[0].startedMonotonicMs,450);assert.equal(saved.captures[0].endedMonotonicMs,1400.5);assert.equal(receipt.receivedMonotonicMs,1099.75);assert.equal(receipt.receivedAtMs,1700000001100);
});
test('missing legacy or invalid monotonic receipt data stays explicitly unknown, including rejected original fixes',()=>{
 const r=newRide();beginCapture(r,'capture','segment',0,'expo_location');const legacy=acceptSample(r,sample(0),sample(0).timestampMs);assert.equal(legacy.receivedMonotonicMs,null);
 const invalid=acceptSample(r,sample(1,100,{mocked:true}),sample(1).timestampMs,NaN);assert.equal(invalid.accepted,false);assert.equal(invalid.receivedMonotonicMs,null);assert.equal(invalid.sample.mocked,true);
});
