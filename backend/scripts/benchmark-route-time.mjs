/** Local bounded verifier benchmark. No network, users, approvals or Storage.
 * Run from backend: deno run scripts/benchmark-route-time.mjs */
import process from 'node:process';
import {compileRaceCourse,verifyRouteTime} from '../functions/_shared/verify-route-time.mjs';
const id=n=>`90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const point=(east,north)=>({latitude:13.7+north/110625,longitude:100.5+east/108186});
const base=Date.UTC(2026,9,1,4),mono=1000;
const gates=Array.from({length:16},(_,index)=>{const north=index*680;return {index,kind:index===0?'start':index===15?'finish':'checkpoint',a:point(-25,north),b:point(25,north),forward_point:point(0,north+10),progress_min_m:north+25,progress_max_m:north+35};});
const polygon=[];
//128 distinct vertices on a convex rectangle, without duplicate corners.
for(let i=0;i<32;i++)polygon.push(point(-60+i*120/32,-60));
for(let i=0;i<32;i++)polygon.push(point(60,-60+i*10350/32));
for(let i=0;i<32;i++)polygon.push(point(60-i*120/32,10290));
for(let i=0;i<32;i++)polygon.push(point(-60,10290-i*10350/32));
const configuration=compileRaceCourse({route_geometry:Array.from({length:512},(_,i)=>point(0,-30+i*10260/511)),boundary_polygon:polygon,staging_polygon:[point(-8,-25),point(8,-25),point(8,-10),point(-8,-10)],gates,corridor_half_width_m:30,maximum_speed_mps:50});
const count=8000,clock=Array.from({length:3},(_,i)=>({probe_id:id(10+i),clock_generation:id(20),request_started_monotonic_ms:mono-500+i*100,received_monotonic_ms:mono-480+i*100,request_started_wall_ms:base-500+i*100,received_wall_ms:base-480+i*100}));
const samples=Array.from({length:count},(_,i)=>({sequence:i+1,received_monotonic_ms:mono+i*100,received_wall_ms:base+i*100,timestamp_ms:base+i*100-50,...point(0,-20+i*10240/(count-1)),speed_mps:12.8,horizontal_accuracy_m:1,speed_accuracy_mps:null,is_simulated_by_software:null,is_produced_by_accessory:null,mocked:null}));
const evidence={schema_version:1,method:'route_time_v1',race_id:id(2),attempt_id:id(3),approval_id:id(5),config_hash:'a'.repeat(64),mode:'async',schedule_epoch:null,common_start_at:null,source:'ride_journal_v1',platform:'android',provider:'expo_location',ride_id:id(7),capture_id:id(4),first_sequence:1,last_sequence:count,capture_truncated:false,foreground_continuous:true,clock_anomaly:false,clock_generation:id(20),arm_clock_probe_ids:clock.map(x=>x.probe_id),lifecycle:[{kind:'armed',received_monotonic_ms:mono-100,received_wall_ms:base-100},{kind:'finish_observed',received_monotonic_ms:mono+(count-1)*100,received_wall_ms:base+(count-1)*100}],clock_probes:clock,samples};
const context={server_now:new Date(base+1800000).toISOString(),attempt:{id:id(3),owner_id:id(1),race_id:id(2),approval_id:id(5),config_hash:'a'.repeat(64),platform:'android',provider:'expo_location',capture_id:id(4),ride_id:id(7),armed_at:new Date(base-1000).toISOString(),arm_clock_probe_ids:evidence.arm_clock_probe_ids,clock_generation:evidence.clock_generation,mode:'async',schedule_epoch:null,common_start_at:null},approval:{id:id(5),config_hash:'a'.repeat(64),configuration,starts_at:new Date(base-60000).toISOString(),ends_at:new Date(base+1800000).toISOString()},clock_probes:clock.map(p=>({probe_id:p.probe_id,owner_id:id(1),race_id:id(2),capture_id:id(4),clock_generation:id(20),server_received_at:new Date(base+p.request_started_monotonic_ms-mono+10).toISOString(),server_sent_at:new Date(base+p.request_started_monotonic_ms-mono+10).toISOString()}))};
const cpu=process.cpuUsage(),start=performance.now(),heap=process.memoryUsage().heapUsed;
const result=verifyRouteTime(evidence,context);
const usage=process.cpuUsage(cpu),wallMs=performance.now()-start;
if(result.sample_count!==8000||result.gate_intervals.length!==16)throw Error('BENCHMARK_RESULT_INVALID');
console.log(JSON.stringify({runtime:typeof Deno==='undefined'?process.version:`Deno ${Deno.version.deno}`,samples:count,vertices:512,boundaryVertices:128,gates:16,wallMs,cpuMs:(usage.user+usage.system)/1000,heapIncrementMiB:(process.memoryUsage().heapUsed-heap)/1048576,evidenceBytes:new TextEncoder().encode(JSON.stringify(evidence)).byteLength,hostedCpuLimitMs:2000,localTargetCpuMs:1000,scope:'local algorithm benchmark; not hosted CPU or native timing proof'}));
