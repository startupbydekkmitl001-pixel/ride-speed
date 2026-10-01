import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileRaceCourse,verifyRouteTime,RouteTimeError,rankElapsedIntervals,projectRaceCoordinate,raceGeodesicDistance} from '../functions/_shared/verify-route-time.mjs';

import {raceFixture} from './route-time-fixture.mjs';
const origin={latitude:13.7,longitude:100.5};
const point=(east,north)=>({latitude:origin.latitude+north/110625,longitude:origin.longitude+east/108186});
const gate=(index,kind,north)=>({index,kind,a:point(-25,north),b:point(25,north),forward_point:point(0,north+10),progress_min_m:north+25,progress_max_m:north+35});
const expectCode=(run,code)=>assert.throws(run,error=>error instanceof RouteTimeError&&error.code===code);

test('native original receipts produce conservative server-time route intervals with unknown provenance',()=>{
  const {evidence,context}=raceFixture();const result=verifyRouteTime(evidence,context);
  assert.equal(result.method,'route_time_v1');assert.equal(result.provenance_unknown,true);assert.ok(result.elapsed_lower_ms>=27000);assert.ok(result.elapsed_upper_ms<=33000);assert.equal(result.gate_intervals.length,3);assert.ok(result.start_interval.lower_ms>Date.parse(context.attempt.armed_at));assert.equal('samples' in result,false);
});
test('stable device wall offsets cancel, while cumulative wall/monotonic drift rejects',()=>{
  const plain=raceFixture(),offset=raceFixture({wallOffset:5000});assert.deepEqual(verifyRouteTime(offset.evidence,offset.context),verifyRouteTime(plain.evidence,plain.context));
  plain.evidence.samples.forEach((sample,i)=>{sample.received_wall_ms+=i*20;sample.timestamp_ms+=i*20;});expectCode(()=>verifyRouteTime(plain.evidence,plain.context),'EVIDENCE_CLOCK');
});
test('known mock anywhere rejects, null provenance remains unknown and browser cannot qualify',()=>{
  const {evidence,context}=raceFixture();evidence.samples[20].mocked=true;expectCode(()=>verifyRouteTime(evidence,context),'EVIDENCE_MOCKED');evidence.samples[20].mocked=null;evidence.platform='web';expectCode(()=>verifyRouteTime(evidence,context),'EVIDENCE_SOURCE');
});
test('original quality gaps and missing/truncated receipts cannot be removed or stitched',()=>{
  const a=raceFixture();a.evidence.samples[10].horizontal_accuracy_m=0;expectCode(()=>verifyRouteTime(a.evidence,a.context),'EVIDENCE_ACCURACY');
  const b=raceFixture();b.evidence.samples.splice(10,1);expectCode(()=>verifyRouteTime(b.evidence,b.context),'EVIDENCE_CAPTURE');
  const c=raceFixture();c.evidence.capture_truncated=true;expectCode(()=>verifyRouteTime(c.evidence,c.context),'EVIDENCE_TRUNCATED');
  const d=raceFixture();d.evidence.samples.slice(10).forEach(s=>{s.timestamp_ms+=501;s.received_wall_ms+=501;s.received_monotonic_ms+=501;});expectCode(()=>verifyRouteTime(d.evidence,d.context),'EVIDENCE_GAP');
});
test('directed gates reject reverse/skipped motion and whole uncertainty tubes reject shortcuts',()=>{
  const a=raceFixture();a.evidence.samples.reverse();expectCode(()=>verifyRouteTime(a.evidence,a.context),'EVIDENCE_CAPTURE');
  const b=raceFixture();b.evidence.samples[10].longitude=point(40,80).longitude;expectCode(()=>verifyRouteTime(b.evidence,b.context),'EVIDENCE_CORRIDOR');
  const c=raceFixture();c.context.approval.configuration.gates[1].forward_point=point(0,140);expectCode(()=>verifyRouteTime(c.evidence,c.context),'APPROVAL_REVOKED');
});
test('simple polygon compilation rejects self intersections and gates cannot override literal method caps',()=>{
  const {context}=raceFixture();const cfg=context.approval.configuration;
  expectCode(()=>compileRaceCourse({...cfg,boundary_polygon:[point(-40,-40),point(40,350),point(-40,350),point(40,-40)]}),'APPROVAL_REVOKED');
  expectCode(()=>compileRaceCourse({...cfg,maximum_accuracy_m:20}),'APPROVAL_REVOKED');
});
test('live timing subtracts server epoch after offset conversion; early brackets do not qualify',()=>{
  const plain=raceFixture({mode:'live'}),offset=raceFixture({mode:'live',wallOffset:-5000});const result=verifyRouteTime(plain.evidence,plain.context);assert.deepEqual(verifyRouteTime(offset.evidence,offset.context),result);assert.ok(result.elapsed_lower_ms>29000);
  plain.evidence.common_start_at=plain.context.attempt.common_start_at=new Date(plain.base+2100).toISOString();expectCode(()=>verifyRouteTime(plain.evidence,plain.context),'EVIDENCE_LATE_START');
});
test('missing original probe wall readings and old replay stamps cannot manufacture precision',()=>{
  const a=raceFixture();delete a.evidence.clock_probes[0].request_started_wall_ms;expectCode(()=>verifyRouteTime(a.evidence,a.context),'EVIDENCE_CLOCK');
  const b=raceFixture();b.context.clock_probes[1].server_sent_at=new Date(b.base+100000).toISOString();expectCode(()=>verifyRouteTime(b.evidence,b.context),'EVIDENCE_CLOCK');
});
test('interval overlaps form conservative connected tie clusters rather than midpoint winners',()=>{
  const ranked=rankElapsedIntervals([{attempt_id:'a',elapsed_lower_ms:10,elapsed_upper_ms:20},{attempt_id:'b',elapsed_lower_ms:19,elapsed_upper_ms:30},{attempt_id:'c',elapsed_lower_ms:29,elapsed_upper_ms:40},{attempt_id:'d',elapsed_lower_ms:50,elapsed_upper_ms:60}]);assert.deepEqual(ranked.map(x=>x.rank),[1,1,1,4]);
});
test('a concave boundary rejects an inter-fix shortcut even with both endpoints inside',()=>{
  const {evidence,context}=raceFixture();
  context.approval.configuration=compileRaceCourse({route_geometry:[point(0,-30),point(0,50),point(40,50),point(40,100),point(0,100),point(0,330)],boundary_polygon:[point(-60,-60),point(60,-60),point(60,360),point(-60,360),point(-60,95),point(15,95),point(15,55),point(-60,55)],staging_polygon:[point(-8,-25),point(8,-25),point(8,-10),point(-8,-10)],gates:[gate(0,'start',0),{...gate(1,'checkpoint',150),progress_min_m:255,progress_max_m:265},{...gate(2,'finish',300),progress_min_m:405,progress_max_m:415}],corridor_half_width_m:30,maximum_speed_mps:50});
  evidence.samples[8]={...evidence.samples[8],...point(0,100)};
  evidence.samples.forEach(s=>s.horizontal_accuracy_m=2);
  evidence.samples.slice(8).forEach(s=>{s.received_monotonic_ms+=500;s.received_wall_ms+=500;s.timestamp_ms+=500;});
  evidence.lifecycle[1].received_monotonic_ms+=500;evidence.lifecycle[1].received_wall_ms+=500;
  evidence.samples.slice(9).forEach(s=>Object.assign(s,point(0,100+(s.sequence-9)*10)));
  expectCode(()=>verifyRouteTime(evidence,context),'EVIDENCE_BOUNDARY');
});
test('observed corridor travel may exceed course length but is rejected above the explicit20km result bound',()=>{
 const fixture=raceFixture(),{evidence,context}=fixture,original=evidence.samples,extra=800;
 const coordinates=[...original.slice(0,10).map(s=>({latitude:s.latitude,longitude:s.longitude})),...Array.from({length:extra},(_,i)=>point(i%2?-15:15,70)),...original.slice(10).map(s=>({latitude:s.latitude,longitude:s.longitude}))];
 evidence.samples=coordinates.map((coordinate,i)=>({...original[0],...coordinate,sequence:i+1,received_monotonic_ms:fixture.baseMono+i*1000,received_wall_ms:fixture.base+i*1000,timestamp_ms:fixture.base+i*1000-50,speed_mps:null}));evidence.last_sequence=evidence.samples.length;evidence.lifecycle[1]={kind:'finish_observed',received_monotonic_ms:evidence.samples.at(-1).received_monotonic_ms,received_wall_ms:evidence.samples.at(-1).received_wall_ms};
 context.server_now=new Date(fixture.base+evidence.samples.length*1000).toISOString();expectCode(()=>verifyRouteTime(evidence,context),'EVIDENCE_DURATION');
 const accepted=raceFixture();accepted.context.attempt.arm_clock_probe_ids=[...accepted.evidence.arm_clock_probe_ids].reverse();expectCode(()=>verifyRouteTime(accepted.evidence,accepted.context),'EVIDENCE_CLOCK');
});
test('a future claimed native capture cannot qualify before authoritative server time or without a measured server stamp',()=>{
 const f=raceFixture();f.context.server_now=new Date(f.base+1000).toISOString();expectCode(()=>verifyRouteTime(f.evidence,f.context),'EVIDENCE_WINDOW');
 const g=raceFixture();delete g.context.server_now;expectCode(()=>verifyRouteTime(g.evidence,g.context),'EVIDENCE_WINDOW');
});
test('WGS84 projection error remains within the explicit0.25m margin across the bounded15km pilot domain',()=>{
 assert.ok(Math.abs(raceGeodesicDistance({latitude:0,longitude:0},{latitude:0,longitude:1})-111319.49079327357)<0.00001);
 assert.ok(Math.abs(raceGeodesicDistance({latitude:0,longitude:0},{latitude:1,longitude:0})-110574.38855779878)<0.00001);
 let maximum=0;
 for(const latitude of[-79,-45,0,13.7,45,79])for(const longitude of[-170,0,100.5,170])for(const distance of[100,1000,5000,15000])for(let angle=0;angle<360;angle+=15){
  const radians=angle*Math.PI/180,origin={latitude,longitude},target={latitude:latitude+Math.cos(radians)*distance/111000,longitude:longitude+Math.sin(radians)*distance/(111000*Math.cos(latitude*Math.PI/180))};
  const local=projectRaceCoordinate(origin,target),error=Math.abs(Math.hypot(local.x,local.y)-raceGeodesicDistance(origin,target));maximum=Math.max(maximum,error);
 }
 assert.ok(maximum<0.25,`Bounded numerical fixture maximum ${maximum}m`);
});
test('stable short reverse/repeated crossings of completed start, checkpoint and finish gates reject the whole original range',()=>{
 for(const north of[0,150,300]){
  const f=raceFixture(),values=[];for(let n=-20;n<north-1;n+=10)values.push(n);values.push(north-1,north+1,north-1,north+1);for(let n=north+10;n<=330;n+=10)values.push(n);
  const first=f.evidence.samples[0];f.evidence.samples=values.map((n,index)=>({...first,...f.point(0,n),sequence:index+1,received_monotonic_ms:f.baseMono+index*1000,received_wall_ms:f.base+index*1000,timestamp_ms:f.base+index*1000-50,horizontal_accuracy_m:0.1,speed_mps:null}));f.evidence.last_sequence=values.length;f.evidence.lifecycle[1]={kind:'finish_observed',received_monotonic_ms:f.evidence.samples.at(-1).received_monotonic_ms,received_wall_ms:f.evidence.samples.at(-1).received_wall_ms};f.context.server_now=new Date(f.base+values.length*1000).toISOString();
  expectCode(()=>verifyRouteTime(f.evidence,f.context),'EVIDENCE_GATE_DIRECTION');
 }
});
test('completed finite gate audit rejects diagonal chords whose endpoints lie beyond the gate width',()=>{
 const f=raceFixture(),coordinates=[[-20,0],[-10,0],[-1,0],[1,0],[-1,26],[1,0],...Array.from({length:33},(_,index)=>[(index+1)*10,0])];let elapsed=0;
 const first=f.evidence.samples[0];f.evidence.samples=coordinates.map(([north,east],index)=>{if(index)elapsed+=index===4||index===5?1500:1000;return{...first,...f.point(east,north),sequence:index+1,received_monotonic_ms:f.baseMono+elapsed,received_wall_ms:f.base+elapsed,timestamp_ms:f.base+elapsed-50,horizontal_accuracy_m:0.1,speed_mps:null};});f.evidence.last_sequence=coordinates.length;f.evidence.lifecycle[1]={kind:'finish_observed',received_monotonic_ms:f.evidence.samples.at(-1).received_monotonic_ms,received_wall_ms:f.evidence.samples.at(-1).received_wall_ms};f.context.server_now=new Date(f.base+elapsed+1000).toISOString();
 expectCode(()=>verifyRouteTime(f.evidence,f.context),'EVIDENCE_GATE_DIRECTION');
});
test('on-plane intermediate original fixes cannot hide an ambiguous completed finite-gate recrossing',()=>{
 const f=raceFixture(),coordinates=[[-20,0],[-10,0],[-1,0],[1,0],[0,13],[-1,26],[0,13],[1,0],...Array.from({length:33},(_,index)=>[(index+1)*10,0])];
 const first=f.evidence.samples[0];f.evidence.samples=coordinates.map(([north,east],index)=>({...first,...f.point(east,north),sequence:index+1,received_monotonic_ms:f.baseMono+index*1000,received_wall_ms:f.base+index*1000,timestamp_ms:f.base+index*1000-50,horizontal_accuracy_m:0.1,speed_mps:null}));f.evidence.last_sequence=coordinates.length;f.evidence.lifecycle[1]={kind:'finish_observed',received_monotonic_ms:f.evidence.samples.at(-1).received_monotonic_ms,received_wall_ms:f.evidence.samples.at(-1).received_wall_ms};f.context.server_now=new Date(f.base+coordinates.length*1000).toISOString();
 expectCode(()=>verifyRouteTime(f.evidence,f.context),'EVIDENCE_GATE_AMBIGUOUS');
});
