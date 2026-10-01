import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const path=new URL('../src/features/races/raceClock.ts',import.meta.url),module={exports:{}};
const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{module,exports:module.exports,Date,Math,Number,Object,Map,Set,Error});
const {CompetitiveRaceClock,armRaceSchedule,raceScheduleDecision,parseRaceClockInstant}=module.exports;
const base=Date.parse('2026-10-01T02:00:00Z'),stamp=mono=>new Date(base+mono).toISOString();
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<0.01,`${actual} != ${expected}`);
function probe(clock,start,up,down=up){const ticket=clock.beginProbe(start);assert.ok(ticket);const received=start+up+down;return clock.observe(ticket,{serverNow:stamp(start+up),requestStartedMono:start,receivedMono:received},received);}
function narrow(clock){for(const start of [0,100,200])probe(clock,start,20);return clock.read(250);}

test('asymmetric latency encloses server time and intersection tightens without assuming half RTT offset',()=>{
 const c=new CompetitiveRaceClock();const a=probe(c,0,15,185);near(a.lowerServerMs,base+15);near(a.upperServerMs,base+215);near(a.displayServerMs,base+115);assert.equal(a.canArm,false);
 probe(c,300,185,15);const third=probe(c,600,30,170);near(third.lowerServerMs,base+785);near(third.upperServerMs,base+815);near(third.halfWidthMs,15);assert.equal(third.canArm,true);assert.ok(third.lowerServerMs<=base+800&&third.upperServerMs>=base+800);
});
test('three one-use probes are required and exactly100ms halfwidth qualifies while wider uncertainty blocks',()=>{
 const c=new CompetitiveRaceClock();probe(c,0,100);probe(c,300,100);assert.equal(c.read(500).canArm,false);assert.equal(probe(c,600,100).canArm,true);near(c.read(800).halfWidthMs,100);
 const d=new CompetitiveRaceClock();for(const start of [0,300,600])probe(d,start,101);assert.equal(d.read(802).canArm,false);assert.equal(d.read(802).reason,'uncertain');
 const e=new CompetitiveRaceClock(),ticket=e.beginProbe(0),sample={serverNow:stamp(20),requestStartedMono:0,receivedMono:40};e.observe(ticket,sample,40);e.observe(ticket,sample,50);assert.equal(e.read(50).sampleCount,1);
});
test('bounded recent probes widen conservatively after an old narrow probe expires and request latency consumes age',()=>{
 const c=new CompetitiveRaceClock();narrow(c);for(const start of [1000,2000,3000,4000,4500])probe(c,start,150);const reading=c.read(4900);assert.equal(reading.sampleCount,5);near(reading.halfWidthMs,150);assert.equal(reading.canArm,false);
 const d=new CompetitiveRaceClock(),ticket=d.beginProbe(0);const result=d.observe(ticket,{serverNow:stamp(1),requestStartedMono:0,receivedMono:5001},5001);assert.equal(result.accepted,false);assert.equal(d.read(5001).canArm,false);
});
test('disjoint server intervals invalidate a schedule and require explicit fresh resync',()=>{
 const c=new CompetitiveRaceClock(),reading=narrow(c),ticket=armRaceSchedule(reading,stamp(1000));assert.ok(ticket);const query=c.beginProbe(300),jump=c.observe(query,{serverNow:stamp(1320),requestStartedMono:300,receivedMono:340},340);assert.equal(jump.status,'invalid');assert.equal(jump.reason,'disjoint');assert.equal(raceScheduleDecision(jump,stamp(1000),ticket).state,'invalidated');assert.equal(c.beginProbe(400),null);
 c.reset(500);for(const start of [500,600,700])probe(c,start,20);assert.equal(c.read(750).canArm,true);assert.equal(raceScheduleDecision(c.read(750),stamp(1000),ticket).state,'invalidated');assert.ok(armRaceSchedule(c.read(750),stamp(1000)));
});
test('background/rewind fences held replies and old tickets, while wall-clock changes are never consulted',()=>{
 const c=new CompetitiveRaceClock(),reading=narrow(c),ticket=armRaceSchedule(reading,stamp(1000)),held=c.beginProbe(300);c.invalidate('background',310);c.reset(400);for(const start of [400,500,600])probe(c,start,20);const before=c.read(650),reply=c.observe(held,{serverNow:stamp(320),requestStartedMono:300,receivedMono:700},700);assert.equal(reply.accepted,false);assert.equal(reply.sampleCount,before.sampleCount);assert.equal(raceScheduleDecision(c.read(700),stamp(1000),ticket).state,'invalidated');
 const oldNow=Date.now;Date.now=()=>-9000000000000;try{near(c.read(710).displayServerMs,base+710);}finally{Date.now=oldNow;}
 const rewind=c.read(709);assert.equal(rewind.reason,'monotonic_rewind');assert.equal(rewind.canArm,false);
});
test('stale clock cannot be renewed by a held pre-expiry request or begin an epoch after its start',()=>{
 const c=new CompetitiveRaceClock(),reading=narrow(c),ticket=armRaceSchedule(reading,stamp(1000)),held=c.beginProbe(300);const stale=c.read(5301);assert.equal(stale.reason,'stale');assert.equal(c.observe(held,{serverNow:stamp(320),requestStartedMono:300,receivedMono:5400},5400).accepted,false);assert.equal(raceScheduleDecision(c.read(5400),stamp(1000),ticket).state,'invalidated');
 c.reset(5500);for(const start of [5500,5600,5700])probe(c,start,20);const late=c.read(5750);assert.equal(armRaceSchedule(late,stamp(1000)),null);assert.equal(raceScheduleDecision(late,stamp(1000)).state,'missed');
});
test('previously confirmed future epoch has waiting/due/missed windows without backdating a late schedule',()=>{
 const c=new CompetitiveRaceClock(),reading=narrow(c),ticket=armRaceSchedule(reading,stamp(1000));assert.equal(raceScheduleDecision(c.read(900),stamp(1000),ticket).state,'waiting');assert.equal(raceScheduleDecision(c.read(1000),stamp(1000),ticket).state,'due');assert.equal(raceScheduleDecision(c.read(1321),stamp(1000),ticket).state,'missed');assert.equal(armRaceSchedule(c.read(1321),stamp(1000)),null);
 const fresh=new CompetitiveRaceClock();for(const start of [900,1000,1100])probe(fresh,start,20);assert.equal(raceScheduleDecision(fresh.read(1150),stamp(1000)).state,'missed');assert.equal(armRaceSchedule(fresh.read(1150),stamp(1000)),null);assert.equal(raceScheduleDecision(c.read(1100),stamp(1001),ticket).state,'invalidated');
});
test('strict UTC stamps, finite ordered times, mismatched/foreign probes and bounded outstanding work never manufacture authority',()=>{
 for(const value of ['2026-02-30T02:00:00Z','2026-10-01T25:00:00Z','2026-10-01T02:00:00+07:00','2026-10-01 02:00:00Z','2026-10-01T02:00:00.1234567Z','2026-10-01T02:00:00Z\n','garbage'])assert.equal(parseRaceClockInstant(value),null);
 near(parseRaceClockInstant('2026-10-01T02:00:00.123456+00:00'),base+123.456);
 const c=new CompetitiveRaceClock(),tickets=Array.from({length:9},()=>c.beginProbe(0));assert.ok(tickets.slice(0,8).every(Boolean));assert.equal(tickets[8],null);
 const foreign={...tickets[0]};assert.equal(c.observe(foreign,{serverNow:stamp(20),requestStartedMono:0,receivedMono:40},40).accepted,false);const bad=c.observe(tickets[0],{serverNow:stamp(20),requestStartedMono:1,receivedMono:40},40);assert.equal(bad.reason,'invalid_sample');assert.equal(bad.canArm,false);
 for(const mono of [NaN,Infinity,-1]){const d=new CompetitiveRaceClock();assert.equal(d.beginProbe(mono),null);assert.equal(d.read(0).canArm,false);}
 const d=new CompetitiveRaceClock(),p=d.beginProbe(10);assert.equal(d.observe(p,{serverNow:stamp(20),requestStartedMono:10,receivedMono:9},20).reason,'invalid_sample');
});
test('overlapping async probes adopted out of order keep conservative latency bounds and one-use identities',async()=>{
 const c=new CompetitiveRaceClock(),pending=[];const schedule=(start,server,receive)=>{const p=c.beginProbe(start);let complete;const wait=new Promise(resolve=>{complete=resolve;});pending.push(()=>complete());return wait.then(()=>c.observe(p,{serverNow:stamp(server),requestStartedMono:start,receivedMono:receive},receive));};
 const oldest=schedule(0,15,400),fast=schedule(20,30,40),next=schedule(40,60,80);pending[1]();assert.equal((await fast).sampleCount,1);pending[2]();assert.equal((await next).sampleCount,2);pending[0]();const adopted=await oldest;assert.equal(adopted.canArm,true);near(adopted.lowerServerMs,base+390);near(adopted.upperServerMs,base+410);near(adopted.displayServerMs,base+400);
});
test('fresh response held across baseline expiry cannot silently reauthorize an old arm ticket',async()=>{
 const c=new CompetitiveRaceClock(),reading=narrow(c),armed=armRaceSchedule(reading,stamp(7000)),p=c.beginProbe(4900);let complete;const held=new Promise(resolve=>{complete=resolve;}).then(()=>c.observe(p,{serverNow:stamp(4910),requestStartedMono:4900,receivedMono:5300},5300));
 assert.equal(c.read(5201).reason,'stale');complete();assert.equal((await held).accepted,false);assert.equal(raceScheduleDecision(c.read(5300),stamp(7000),armed).state,'invalidated');
});
test('a pre-epoch ticket tolerates a skipped narrow presentation frame only within300ms; no late arming',()=>{
 const c=new CompetitiveRaceClock();for(const start of [0,10,20])probe(c,start,5);const estimate=c.read(30),ticket=armRaceSchedule(estimate,stamp(1000));assert.ok(ticket);
 assert.equal(raceScheduleDecision(c.read(1050),stamp(1000),ticket).state,'due');
 assert.equal(armRaceSchedule(c.read(1050),stamp(1000)),null);
 assert.equal(raceScheduleDecision(c.read(1050),stamp(1000)).state,'missed');
 assert.equal(raceScheduleDecision(c.read(1295),stamp(1000),ticket).state,'due');
 assert.equal(raceScheduleDecision(c.read(1301),stamp(1000),ticket).state,'missed');
});
