import type {OriginalCaptureBinding,OriginalCaptureRead} from './OriginalCaptureBus';
import type {AttemptSnapshot,RaceMode,RaceSnapshot} from './types';

export type EvidenceClockProbe={probe_id:string;clock_generation:string;request_started_monotonic_ms:number;request_started_wall_ms:number;received_monotonic_ms:number;received_wall_ms:number};
export type EvidenceLifecycle={kind:'armed'|'finish_observed';received_monotonic_ms:number;received_wall_ms:number};
export type RaceEvidenceInput={
 binding:OriginalCaptureBinding;read:OriginalCaptureRead;
 race:Pick<RaceSnapshot,'id'|'mode'|'schedule_epoch'|'common_start_at'|'approval'>;
 attempt:Pick<AttemptSnapshot,'id'|'owner_id'|'race_id'|'approval_id'|'config_hash'|'ride_id'|'capture_id'|'platform'|'provider'|'state'|'schedule_epoch'|'common_start_at'>;
 clockGeneration:string;armClockProbeIds:readonly string[];clockProbes:readonly EvidenceClockProbe[];lifecycle:readonly EvidenceLifecycle[];
};
export type FrozenRaceEvidence=Readonly<{text:string;byteLength:number;firstSequence:number;lastSequence:number;sampleCount:number}>;
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const clock=(value:unknown):value is number=>finite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
const fail=():never=>{throw Error('RACE_EVIDENCE_UNAVAILABLE');};
const numberOrNull=(value:unknown)=>value===null||value===undefined?null:finite(value)?value:fail();
const flag=(value:unknown)=>value===null||value===undefined?null:typeof value==='boolean'?value:fail();
const instant=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)&&Number.isFinite(Date.parse(value));

/** Freeze only original, drained receipts. Failed-quality observations remain in the evidence. */
export function buildRaceEvidence(input:RaceEvidenceInput):FrozenRaceEvidence {
 const {binding,read,race,attempt}=input,c=read.capture,rows=read.receipts;
 if(!binding.scope.userId||!['ios','android'].includes(binding.platform)||attempt.platform!==binding.platform||attempt.provider!==binding.provider||attempt.owner_id!==binding.scope.userId||read.ride.ownerId!==binding.scope.userId||attempt.ride_id!==binding.rideId||read.ride.id!==binding.rideId||attempt.capture_id!==binding.captureId||c.id!==binding.captureId||c.segmentId!==binding.segmentId||c.provider!==binding.provider||c.startedAtMs!==binding.startedWallMs||c.startedMonotonicMs!==binding.startedMonotonicMs||!clock(c.startedMonotonicMs)||c.truncated||read.ride.clockAnomaly||!['armed','upload_pending'].includes(attempt.state))fail();
 if(attempt.race_id!==race.id||attempt.approval_id!==race.approval.id||attempt.config_hash!==race.approval.config_hash||!['async','live'].includes(race.mode)||[race.id,attempt.id,attempt.approval_id,binding.rideId,binding.captureId,input.clockGeneration].some(v=>!uuid(v))||!/^[a-f\d]{64}$/.test(attempt.config_hash))fail();
 if(attempt.schedule_epoch!==race.schedule_epoch||attempt.common_start_at!==race.common_start_at||(race.mode==='async'?(race.schedule_epoch!==null||race.common_start_at!==null):(!uuid(race.schedule_epoch)||!instant(race.common_start_at))))fail();
 if(rows.length<4||rows.length>8000||c.count>8000||c.count<rows.length)fail();
 const samples=rows.map((r,index)=>{
  const s=r.sample;if(!Number.isSafeInteger(r.seq)||r.seq<0||index&&r.seq!==rows[index-1].seq+1||r.captureId!==c.id||r.segmentId!==c.segmentId||!clock(r.receivedAtMs)||!clock(r.receivedMonotonicMs)||r.receivedMonotonicMs<c.startedMonotonicMs!||index&&r.receivedMonotonicMs<rows[index-1].receivedMonotonicMs!||!clock(s.timestampMs)||!finite(s.latitude)||Math.abs(s.latitude)>90||!finite(s.longitude)||Math.abs(s.longitude)>180)fail();
  return {sequence:r.seq,received_wall_ms:r.receivedAtMs,received_monotonic_ms:r.receivedMonotonicMs,timestamp_ms:s.timestampMs,latitude:s.latitude,longitude:s.longitude,speed_mps:numberOrNull(s.speedMps),horizontal_accuracy_m:numberOrNull(s.horizontalAccuracyM),speed_accuracy_mps:numberOrNull(s.speedAccuracyMps),is_simulated_by_software:flag(s.isSimulatedBySoftware),is_produced_by_accessory:flag(s.isProducedByAccessory),mocked:flag(s.mocked)};
 });
 const lifecycle=input.lifecycle.map(value=>{if(!clock(value.received_wall_ms)||!clock(value.received_monotonic_ms))fail();return {kind:value.kind,received_monotonic_ms:value.received_monotonic_ms,received_wall_ms:value.received_wall_ms};});
 if(lifecycle.length!==2||lifecycle[0].kind!=='armed'||lifecycle[1].kind!=='finish_observed'||lifecycle[0].received_monotonic_ms<c.startedMonotonicMs!||lifecycle[1].received_monotonic_ms<=lifecycle[0].received_monotonic_ms||lifecycle[0].received_monotonic_ms>samples[0].received_monotonic_ms!||lifecycle[1].received_monotonic_ms<samples.at(-1)!.received_monotonic_ms!)fail();
 const seen=new Set<string>(),probes=input.clockProbes.map(value=>{if(!uuid(value.probe_id)||seen.has(value.probe_id)||value.clock_generation!==input.clockGeneration||![value.request_started_monotonic_ms,value.request_started_wall_ms,value.received_monotonic_ms,value.received_wall_ms].every(clock)||value.received_monotonic_ms<value.request_started_monotonic_ms)fail();seen.add(value.probe_id);return {probe_id:value.probe_id,clock_generation:value.clock_generation,request_started_monotonic_ms:value.request_started_monotonic_ms,request_started_wall_ms:value.request_started_wall_ms,received_monotonic_ms:value.received_monotonic_ms,received_wall_ms:value.received_wall_ms};});
 if(probes.length<3||probes.length>(race.mode==='async'?5:24)||input.armClockProbeIds.length<3||input.armClockProbeIds.length>5||new Set(input.armClockProbeIds).size!==input.armClockProbeIds.length||input.armClockProbeIds.some(value=>!seen.has(value)))fail();
 const evidence={schema_version:1,method:'route_time_v1',race_id:race.id,attempt_id:attempt.id,approval_id:attempt.approval_id,config_hash:attempt.config_hash,mode:race.mode as RaceMode,schedule_epoch:race.schedule_epoch,common_start_at:race.common_start_at,source:'ride_journal_v1',platform:binding.platform,provider:binding.provider,ride_id:binding.rideId,capture_id:binding.captureId,first_sequence:samples[0].sequence,last_sequence:samples.at(-1)!.sequence,capture_truncated:false,foreground_continuous:true,clock_anomaly:false,clock_generation:input.clockGeneration,arm_clock_probe_ids:[...input.armClockProbeIds],lifecycle,clock_probes:probes,samples};
 const text=JSON.stringify(evidence),byteLength=new TextEncoder().encode(text).byteLength;if(byteLength>2097152)fail();
 return Object.freeze({text,byteLength,firstSequence:evidence.first_sequence,lastSequence:evidence.last_sequence,sampleCount:samples.length});
}
