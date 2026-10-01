/** Countdown consistency intervals, never sensor or competitive-result proof.
 * Caller supplies monotonic observations; this model never reads Date.now(). */
export const raceClockLimits=Object.freeze({maxSamples:5,maxOutstanding:8,maxAgeMs:5000,minSamples:3,maxHalfWidthMs:100,firstPresentationLateMs:300});
export type RaceClockSample=Readonly<{serverNow:string;requestStartedMono:number;receivedMono:number}>;
export type RaceClockProbe=Readonly<{generation:number;id:number;requestStartedMono:number}>;
export type RaceClockReason='no_samples'|'insufficient_samples'|'uncertain'|'stale'|'background'|'suspended'|'disjoint'|'monotonic_rewind'|'invalid_sample';
export type RaceClockEstimate=Readonly<{
 status:'valid'|'uncertain'|'invalid';reason:RaceClockReason|null;generation:number;
 observedMono:number;sampleCount:number;canArm:boolean;lowerServerMs:number|null;
 upperServerMs:number|null;displayServerMs:number|null;halfWidthMs:number|null;
}>;
export type RaceClockObservation=RaceClockEstimate&Readonly<{accepted:boolean}>;
export type RaceArmTicket=Readonly<{generation:number;startsAt:string;startServerMs:number;armedAtMono:number}>;
export type RaceScheduleDecision=Readonly<{
 state:'unarmed'|'waiting'|'due'|'missed'|'uncertain'|'invalidated';
 displayRemainingMs:number|null;
}>;
type Interval={probe:RaceClockProbe;lowerOffset:number;upperOffset:number};
const monotonic=(value:number)=>Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;

/** Strict UTC, including PostgreSQL's six-digit fractional timestamps. Retain
 * sub-millisecond precision rather than silently truncating with Date.parse. */
export function parseRaceClockInstant(value:unknown):number|null{
 if(typeof value!=='string')return null;
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value);if(!match)return null;
 const whole=Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);if(!Number.isFinite(whole))return null;
 const date=new Date(whole),parts=[date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate(),date.getUTCHours(),date.getUTCMinutes(),date.getUTCSeconds()];
 if(parts.some((part,index)=>part!==Number(match[index+1])))return null;
 return whole+(match[7]?Number(`0.${match[7]}`)*1000:0);
}

/** Explicit resync is required after a discontinuity. A probe is a one-use
 * object issued by this instance and cannot cross a lifecycle generation. */
export class CompetitiveRaceClock{
 private generation=1;private nextId=1;private lastMono:number|null=null;
 private invalidReason:RaceClockReason|null=null;private established=false;
 private pending=new Map<number,RaceClockProbe>();private intervals:Interval[]=[];
 private stop(reason:RaceClockReason){this.generation++;this.invalidReason=reason;this.established=false;this.pending.clear();this.intervals=[];}
 private touch(now:number):boolean{
  if(!monotonic(now)){this.stop('invalid_sample');return false;}
  if(this.lastMono!==null&&now<this.lastMono){this.stop('monotonic_rewind');return false;}
  this.lastMono=now;return true;
 }
 private prune(now:number){
  for(const [id,probe] of this.pending)if(now-probe.requestStartedMono>=raceClockLimits.maxAgeMs)this.pending.delete(id);
  const before=this.intervals.length;this.intervals=this.intervals.filter(value=>now-value.probe.requestStartedMono<raceClockLimits.maxAgeMs);
  if(before>this.intervals.length&&this.established&&this.intervals.length<raceClockLimits.minSamples)this.stop('stale');
 }
 reset(now:number){if(!monotonic(now))throw Error('RACE_CLOCK_INVALID');this.generation++;this.lastMono=now;this.invalidReason=null;this.established=false;this.pending.clear();this.intervals=[];}
 invalidate(reason:'background'|'suspended',now:number){if(this.touch(now))this.stop(reason);}
 beginProbe(now:number):RaceClockProbe|null{
  if(!this.touch(now))return null;this.prune(now);if(this.invalidReason||this.pending.size>=raceClockLimits.maxOutstanding)return null;
  if(!Number.isSafeInteger(this.nextId)){this.stop('invalid_sample');return null;}
  const probe=Object.freeze({generation:this.generation,id:this.nextId++,requestStartedMono:now});this.pending.set(probe.id,probe);return probe;
 }
 observe(probe:RaceClockProbe,sample:RaceClockSample,now:number=sample.receivedMono):RaceClockObservation{
  if(!this.touch(now))return {...this.estimate(now),accepted:false};this.prune(now);
  if(this.invalidReason||!probe||probe.generation!==this.generation||this.pending.get(probe.id)!==probe)return {...this.estimate(now),accepted:false};
  this.pending.delete(probe.id);const stamp=parseRaceClockInstant(sample.serverNow);
  if(stamp===null||sample.requestStartedMono!==probe.requestStartedMono||!monotonic(sample.receivedMono)||sample.receivedMono<probe.requestStartedMono||sample.receivedMono>now){this.stop('invalid_sample');return {...this.estimate(now),accepted:false};}
  if(now-probe.requestStartedMono>=raceClockLimits.maxAgeMs)return {...this.estimate(now),accepted:false};
  const value:Interval={probe,lowerOffset:stamp-sample.receivedMono,upperOffset:stamp-probe.requestStartedMono};
  const values=[...this.intervals,value].sort((a,b)=>a.probe.requestStartedMono-b.probe.requestStartedMono||a.probe.id-b.probe.id).slice(-raceClockLimits.maxSamples);
  if(!values.includes(value))return {...this.estimate(now),accepted:false};
  const lower=Math.max(...values.map(v=>v.lowerOffset)),upper=Math.min(...values.map(v=>v.upperOffset));
  if(lower>upper){this.stop('disjoint');return {...this.estimate(now),accepted:false};}
  this.intervals=values;this.established ||=values.length>=raceClockLimits.minSamples;
  return {...this.estimate(now),accepted:true};
 }
 read(now:number):RaceClockEstimate{if(this.touch(now))this.prune(now);return this.estimate(now);}
 private estimate(now:number):RaceClockEstimate{
  const count=this.intervals.length,empty={generation:this.generation,observedMono:now,sampleCount:count,canArm:false,lowerServerMs:null,upperServerMs:null,displayServerMs:null,halfWidthMs:null};
  if(this.invalidReason||!count)return Object.freeze({...empty,status:'invalid',reason:this.invalidReason??'no_samples'});
  const lower=Math.max(...this.intervals.map(v=>v.lowerOffset))+now,upper=Math.min(...this.intervals.map(v=>v.upperOffset))+now,halfWidth=(upper-lower)/2;
  const canArm=count>=raceClockLimits.minSamples&&halfWidth<=raceClockLimits.maxHalfWidthMs;
  return Object.freeze({...empty,status:canArm?'valid':'uncertain',reason:canArm?null:count<raceClockLimits.minSamples?'insufficient_samples':'uncertain',canArm,lowerServerMs:lower,upperServerMs:upper,displayServerMs:lower+(upper-lower)/2,halfWidthMs:halfWidth});
 }
}

/** Call only after canonical epoch/capture/member confirmation by the caller.
 * Entire interval must be before start; a newly delivered late epoch is missed. */
export function armRaceSchedule(clock:RaceClockEstimate,startsAt:string):RaceArmTicket|null{
 const start=parseRaceClockInstant(startsAt);
 if(start===null||!clock.canArm||clock.status!=='valid'||clock.upperServerMs===null||clock.upperServerMs>=start)return null;
 return Object.freeze({generation:clock.generation,startsAt,startServerMs:start,armedAtMono:clock.observedMono});
}
export function raceScheduleDecision(clock:RaceClockEstimate,startsAt:string,ticket:RaceArmTicket|null=null):RaceScheduleDecision{
 const start=parseRaceClockInstant(startsAt),remaining=start!==null&&clock.displayServerMs!==null?start-clock.displayServerMs:null;
 if(start===null||ticket&&(ticket.generation!==clock.generation||ticket.startsAt!==startsAt||ticket.startServerMs!==start||clock.observedMono<ticket.armedAtMono))return {state:'invalidated',displayRemainingMs:null};
 if(!clock.canArm||clock.status!=='valid'||clock.lowerServerMs===null||clock.upperServerMs===null)return {state:ticket?'invalidated':'uncertain',displayRemainingMs:null};
 if(!ticket)return {state:clock.upperServerMs<start?'unarmed':'missed',displayRemainingMs:remaining};
 // This is a first presentation allowance for an already issued future ticket.
 // It does not arm a late ticket or establish a sensor/gate crossing timestamp.
 return {state:clock.upperServerMs<start?'waiting':clock.lowerServerMs<=start||clock.upperServerMs<=start+raceClockLimits.firstPresentationLateMs?'due':'missed',displayRemainingMs:remaining};
}
