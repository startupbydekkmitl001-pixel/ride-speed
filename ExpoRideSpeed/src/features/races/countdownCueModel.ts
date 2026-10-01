import {authorizedRaceCourse} from './courseMapModel';
import {isRaceId} from './model';
import {parseRaceClockInstant} from './raceClock';
import type {RaceScreenPort} from './uiTypes';

export type RaceCountdownCue=3|2|1|'start';
export type RaceCountdownCueFrame=Readonly<{
 scheduleKey:string;authorityKey:string;phase:'countdown'|'running';seconds:number|null;observedMonotonicMs:number;
}>;

// Preserve PostgreSQL microseconds when comparing the exact scheduled instant.
function instantKey(value:string|null):string|null{
 if(value===null)return null;
 const match=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value);
 return match&&Number.isFinite(parseRaceClockInstant(value))?`${match[1]}.${(match[2]??'').padEnd(6,'0')}`:null;
}

/** Optional presentation feedback only; never creates clock, capture or race authority. */
export function countdownCueFrame(port:RaceScreenPort):RaceCountdownCueFrame|null{
 const {race,attempt,countdown,gate}=port,course=authorizedRaceCourse(port);
 const instant=instantKey(race?.common_start_at??null),uncertainty=countdown.uncertaintyMs,observed=countdown.observedMonotonicMs;
 if(!course||!port.pilotEnabled||!gate.native||!gate.profileReady||!gate.online||gate.moving||
  !port.eligibility.captureReady||!port.eligibility.clockReady||countdown.error||
  uncertainty===null||!Number.isFinite(uncertainty)||uncertainty<0||uncertainty>100||observed===null||!Number.isFinite(observed)||observed<0||
  !race||race.mode!=='live'||!['countdown','running'].includes(race.state)||
  !isRaceId(race.schedule_epoch)||!instant||!attempt||attempt.state!=='armed'||!attempt.armed_at||
  attempt.owner_id!==port.ownerId||attempt.race_id!==race.id||
  attempt.member_generation!==race.self_member.member_generation||
  attempt.approval_id!==race.approval.id||attempt.config_hash!==race.approval.config_hash||
  attempt.schedule_epoch!==race.schedule_epoch||instantKey(attempt.common_start_at)!==instant||
  !['countdown','running'].includes(countdown.phase))return null;
 const seconds=countdown.phase==='countdown'?countdown.secondsRemaining:null;
 if(countdown.phase==='countdown'&&(seconds===null||!Number.isInteger(seconds)||seconds<1||seconds>1800))return null;
 return {
  scheduleKey:[port.ownerId,race.id,race.schedule_epoch].join(':'),
  authorityKey:[course.key,attempt.id,attempt.capture_id,attempt.member_generation,instant].join(':'),
  phase:countdown.phase as 'countdown'|'running',seconds,observedMonotonicMs:observed,
 };
}

type Entry={authorityKey:string;phase:'countdown'|'running';seconds:number|null;observedAt:number;muted:boolean;issued:Set<RaceCountdownCue>};
/** A bounded, memory-only deduplicator. Suspended schedules never resume cues. */
export class RaceCountdownCueLedger{
 private readonly entries=new Map<string,Entry>();
 constructor(private readonly capacity=128){}
 suspend(scheduleKey:string|null):void{
  if(!scheduleKey)return;
  const entry=this.entries.get(scheduleKey);
  if(entry)entry.muted=true;
  else if(this.entries.size<this.capacity)this.entries.set(scheduleKey,{authorityKey:'',phase:'running',seconds:null,observedAt:0,muted:true,issued:new Set()});
 }
 observe(frame:RaceCountdownCueFrame,monotonicNow:number):RaceCountdownCue|null{
  let entry=this.entries.get(frame.scheduleKey);
  if(!Number.isFinite(monotonicNow)||monotonicNow<0){this.suspend(frame.scheduleKey);return null;}
  if(!entry){
   // Preserve all duplicate records rather than evicting one and replaying a cue.
   if(this.entries.size>=this.capacity)return null;
   entry={authorityKey:frame.authorityKey,phase:frame.phase,seconds:frame.seconds,observedAt:monotonicNow,muted:false,issued:new Set()};
   this.entries.set(frame.scheduleKey,entry);
   if(frame.phase==='running')return null;
  }else{
   if(entry.muted)return null;
   const elapsed=monotonicNow-entry.observedAt;
   if(entry.authorityKey!==frame.authorityKey||elapsed<0||
    (entry.phase==='running'&&frame.phase!=='running')||
    (frame.phase==='countdown'&&entry.seconds!==null&&frame.seconds!==null&&frame.seconds>entry.seconds)){
    entry.muted=true;return null;
   }
   if(frame.phase==='running'){
    const eligible=entry.phase==='countdown'&&entry.seconds===1&&elapsed<=1300;
    entry.phase='running';entry.seconds=null;entry.observedAt=monotonicNow;
    if(eligible&&!entry.issued.has('start')){entry.issued.add('start');return 'start';}
    return null;
   }
   if(frame.seconds===entry.seconds)return null;
   // A missed step is dropped. A delayed obsolete presentation is muted entirely.
   if(entry.seconds===null||frame.seconds===null||elapsed>(entry.seconds-frame.seconds)*1000+300){entry.muted=true;return null;}
   entry.seconds=frame.seconds;entry.observedAt=monotonicNow;
  }
  if(frame.seconds===3||frame.seconds===2||frame.seconds===1){
   if(!entry.issued.has(frame.seconds)){entry.issued.add(frame.seconds);return frame.seconds;}
  }
  return null;
 }
}
