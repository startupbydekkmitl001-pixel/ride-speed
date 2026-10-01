import {test} from 'node:test';
import assert from 'node:assert/strict';
import {raceModule,snapshot,attempt,owner,uuid,copy} from './helpers/races.mjs';

const module=()=>raceModule('countdownCueModel');
function port(){
 const race={...snapshot(),state:'countdown',schedule_epoch:uuid(70),common_start_at:'2026-10-01T02:00:10.123456+00:00'};
 return {ownerId:owner,generation:'A1',ready:true,detailFresh:true,detailError:null,pilotEnabled:true,current:g=>g==='A1',gate:{signedIn:true,profileReady:true,native:true,foreground:true,focused:true,moving:false,online:true},race,attempt:{...attempt(),schedule_epoch:race.schedule_epoch,common_start_at:race.common_start_at},course:{race_id:race.id,approval_id:race.approval.id,config_hash:race.approval.config_hash,route_geometry_hash:race.approval.route_geometry_hash},courseError:null,eligibility:{captureReady:true,clockReady:true},countdown:{phase:'countdown',secondsRemaining:5,uncertaintyMs:60,error:null,observedMonotonicMs:0}};
}
function frame(p,seconds,phase='countdown'){p.countdown={...p.countdown,phase,secondsRemaining:seconds};return module().countdownCueFrame(p);}

test('an authorized current schedule emits each visible 3/2/1 and start at most once',()=>{
 const {RaceCountdownCueLedger}=module(),ledger=new RaceCountdownCueLedger(),p=port();
 assert.equal(ledger.observe(frame(p,5),0),null);
 assert.equal(ledger.observe(frame(p,3),2000),3);
 assert.equal(ledger.observe(frame(p,3),2020),null);
 assert.equal(ledger.observe(frame(p,2),3000),2);
 assert.equal(ledger.observe(frame(p,1),4000),1);
 assert.equal(ledger.observe(frame(p,null,'running'),5000),'start');
 assert.equal(ledger.observe(frame(p,null,'running'),5100),null);
});
test('missed numeric steps are never replayed and entering an already running race is silent',()=>{
 const {RaceCountdownCueLedger}=module(),p=port(),ledger=new RaceCountdownCueLedger();
 ledger.observe(frame(p,7),0);
 assert.equal(ledger.observe(frame(p,1),6000),1);
 assert.equal(ledger.observe(frame(p,null,'running'),7000),'start');
 assert.equal(new RaceCountdownCueLedger().observe(frame(p,null,'running'),8000),null);
});
test('late countdown jumps, clock rewinds, and missing final step cannot produce a late start',()=>{
 const {RaceCountdownCueLedger}=module();
 for(const scenario of ['late','rewind','skipped']){
  const ledger=new RaceCountdownCueLedger(),p=port();ledger.observe(frame(p,3),1000);
  if(scenario==='late'){assert.equal(ledger.observe(frame(p,2),6000),null);assert.equal(ledger.observe(frame(p,1),7000),null);}
  if(scenario==='rewind')assert.equal(ledger.observe(frame(p,2),900),null);
  assert.equal(ledger.observe(frame(p,null,'running'),8000),null,scenario);
 }
 const ledger=new RaceCountdownCueLedger(),p=port();ledger.observe(frame(p,1),0);
 assert.equal(ledger.observe(frame(p,null,'running'),1301),null);
});
test('suspension, remount and owner ABA never reactivate the same schedule',()=>{
 const {RaceCountdownCueLedger}=module(),ledger=new RaceCountdownCueLedger(),p=port(),first=frame(p,3);
 assert.equal(ledger.observe(first,0),3);ledger.suspend(first.scheduleKey);
 assert.equal(ledger.observe(frame(p,2),1000),null);
 const later=copy(p);later.generation='A2';later.current=()=>true;
 assert.equal(ledger.observe(frame(later,1),2000),null);
 later.race.schedule_epoch=uuid(71);later.attempt.schedule_epoch=uuid(71);
 assert.equal(ledger.observe(frame(later,3),3000),3,'a genuinely new canonical schedule is independent');
});
test('changing capture, accepted generation or approved configuration mutes an existing schedule',()=>{
 const {RaceCountdownCueLedger}=module();
 for(const change of [p=>{p.attempt.capture_id=uuid(99);},p=>{p.race.self_member.member_generation++;p.attempt.member_generation++;},p=>{p.race.approval.config_hash='c'.repeat(64);p.course.config_hash='c'.repeat(64);p.attempt.config_hash='c'.repeat(64);}]){
  const ledger=new RaceCountdownCueLedger(),p=port();assert.equal(ledger.observe(frame(p,3),0),3);change(p);
  assert.equal(ledger.observe(frame(p,2),1000),null);assert.equal(ledger.observe(frame(p,1),2000),null);
 }
});
test('pilot, native, movement, consent, freshness, own attempt and decent clock are required',()=>{
 const {countdownCueFrame}=module();assert.ok(countdownCueFrame(port()));
 const changes=[p=>p.pilotEnabled=false,p=>p.gate.native=false,p=>p.gate.signedIn=false,p=>p.gate.foreground=false,p=>p.gate.focused=false,p=>p.gate.moving=true,p=>p.gate.online=false,p=>p.detailFresh=false,p=>p.detailError='RACE_UNAVAILABLE',p=>p.race.self_member.state='withdrawn',p=>p.race.self_member.evidence_consent_version=null,p=>p.attempt.owner_id=uuid(98),p=>p.attempt.member_generation++,p=>p.attempt.schedule_epoch=uuid(98),p=>p.attempt.common_start_at='2026-10-01T02:00:11Z',p=>p.attempt.state='dnf',p=>p.course.config_hash='c'.repeat(64),p=>p.eligibility.clockReady=false,p=>p.eligibility.captureReady=false,p=>p.countdown.uncertaintyMs=101,p=>p.countdown.uncertaintyMs=null,p=>p.countdown.error='RACE_CLOCK_UNAVAILABLE',p=>p.countdown.phase='invalid'];
 for(const change of changes){const p=port();change(p);assert.equal(countdownCueFrame(p),null,String(change));}
});
test('same server UTC instant is compatible while a changed schedule instant is fenced',()=>{
 const {countdownCueFrame}=module(),p=port();p.attempt.common_start_at='2026-10-01T02:00:10.123456Z';assert.ok(countdownCueFrame(p));
 p.attempt.common_start_at='2026-10-01T02:00:10.123457Z';assert.equal(countdownCueFrame(p),null);
});
test('the optional cue ledger is bounded and never evicts duplicate suppression to admit a new cue',()=>{
 const {RaceCountdownCueLedger}=module(),ledger=new RaceCountdownCueLedger(2),p=port();
 const original=frame(p,3);assert.equal(ledger.observe(original,0),3);
 p.race.schedule_epoch=uuid(71);p.attempt.schedule_epoch=uuid(71);assert.equal(ledger.observe(frame(p,3),1000),3);
 p.race.schedule_epoch=uuid(72);p.attempt.schedule_epoch=uuid(72);assert.equal(ledger.observe(frame(p,3),2000),null);
 assert.equal(ledger.observe(original,3000),null);
});
