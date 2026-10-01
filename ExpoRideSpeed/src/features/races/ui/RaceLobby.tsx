import React,{useEffect,useState} from 'react';
import {View} from 'react-native';
import {Button,Glass,Note,Panel,Row,T} from '../../../components/ui';
import {useApp} from '../../../state/AppState';
import {AmbientLoop} from '../../motion';
import {resolveAmbientAsset} from '../../motion/assets';
import {RouteSheet} from '../../routes/RouteSheet';
import RaceCourseMap from '../RaceCourseMap';
import type {RaceAttemptBinding,RaceScreenProps} from '../uiTypes';
import {assertAttempt,assertMember,assertRace,attemptBinding,memberBinding,raceBinding} from './presentationModel';
import {ConsentChecks,RaceFrame,RaceHeader,RaceOutcome,RaceReadState} from './RaceSurface';
import {useRaceUI} from './useRaceUI';
import {useRaceCountdownHaptics} from './useRaceCountdownHaptics';

export default function RaceLobby({port,t}:RaceScreenProps){
 useRaceCountdownHaptics(port);
 const ui=useRaceUI(port),{dark}=useApp(),[armReview,setArmReview]=useState<RaceAttemptBinding|null>(null),[reviewKind,setReviewKind]=useState<'arm'|'ready'>('arm'),[safety,setSafety]=useState(false),[evidence,setEvidence]=useState(false);
 // Consent is presentation of a current capture, and must be cleared on inactivity.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{setArmReview(null);setSafety(false);setEvidence(false);},[port.generation,port.gate.focused,port.gate.foreground,port.gate.moving]);
 const race=port.race,attempt=port.attempt,binding=race?raceBinding(race):null,member=race?memberBinding(race):null,activeAttempt=attempt&&race&&attempt.race_id===race.id&&attempt.owner_id===port.ownerId;
 const enable=ui.enabled&&port.detailFresh&&!port.detailError&&port.pilotEnabled&&!ui.busy&&!port.busy;
 const showClock=race?.mode==='live'&&['countdown','running'].includes(race.state);
 const confirm=()=>ui.run(async p=>{if(!armReview||!safety||!evidence)throw Error('RACE_CONSENT');assertAttempt(p,armReview);if(!p.gate.native||!p.eligibility.captureReady)throw Error('RACE_CAPTURE_MISMATCH');if(reviewKind==='ready'&&!p.eligibility.stageReady)throw Error('RACE_STAGE_UNAVAILABLE');if(reviewKind==='ready'&&!p.eligibility.clockReady)throw Error('RACE_CLOCK_UNAVAILABLE');return reviewKind==='ready'?p.readyAttempt(armReview,{acknowledgement_version:1,evidence_consent_version:1}):p.arm(armReview,{acknowledgement_version:1,evidence_consent_version:1});});
 return <RaceFrame port={port}><RaceHeader port={port} t={t} title={t(race?.mode==='live'?'m5c.lobby':'m5c.prepareAttempt')}/><RaceReadState port={port} t={t}/>{race&&<>
  <View style={{borderRadius:24,overflow:'hidden',minHeight:showClock?230:150,padding:24,gap:14}}><AmbientLoop asset={resolveAmbientAsset('challenge-lobby',dark?'dark':'light')} visible={port.gate.focused&&port.gate.foreground} style={{position:'absolute',top:0,left:0,right:0,bottom:0}}/><T size={24} weight="semibold">{race.route_summary.title}</T><T muted>{t(`m5c.states.${race.state}`)}</T>{showClock&&<Glass><View style={{padding:20,gap:8,alignItems:'center'}}><T weight="semibold">{t('m5c.countdown')}</T>{port.countdown.phase==='countdown'&&port.countdown.secondsRemaining!==null?<T numeric size={64} accessibilityLiveRegion="polite">{Math.max(0,Math.ceil(port.countdown.secondsRemaining))}</T>:<T size={20}>{t(port.countdown.phase==='running'?'m5c.running':port.countdown.phase==='invalid'?'m5c.clockInvalid':port.countdown.phase==='preparing'?'m5c.clockPreparing':'m5c.clockWaiting')}</T>}{port.countdown.uncertaintyMs!==null&&<T muted size={12}>{t('m5c.clockUncertainty',{ms:Math.ceil(port.countdown.uncertaintyMs)})}</T>}</View></Glass>}<Note>{t('m5c.countdownBody')}</Note></View>
  {port.countdown.error&&<Note error>{t('m5c.clockInvalid')}</Note>}<RaceCourseMap port={port} t={t}/><View style={{gap:16}}><T size={20} weight="semibold">{t('m5c.members')}</T>{race.members.map(person=><Row key={person.user_id} style={{justifyContent:'space-between',flexWrap:'wrap'}}><View style={{flex:1}}><T weight="medium">{person.profile.name}</T><T size={12} muted>@{person.profile.handle}</T></View><T size={13} muted>{t(person.ready?'m5c.ready':`m5c.memberStates.${person.state}`)}</T></Row>)}</View>
  {!port.gate.native&&<Note>{t('m5c.nativeOnly')}</Note>}{port.gate.native&&!port.eligibility.captureReady&&<Note>{t('m5c.captureRequired')}</Note>}{port.gate.native&&!port.eligibility.stageReady&&<Note>{t('m5c.stageRequired')}</Note>}{port.gate.native&&!port.eligibility.clockReady&&<Note>{t('m5c.clockRequired')}</Note>}
  {activeAttempt&&attempt&&<Panel>
   <T weight="semibold">{t('m5c.attempt',{ordinal:attempt.ordinal})}</T><T>{t(`m5c.attemptStates.${attempt.state}`)}</T>
   {attempt.state==='reserved'&&<Button label={t('m5c.prepareAttempt')} disabled={!enable||!port.gate.native} onPress={()=>{try{const p=ui.guard();const exact=attemptBinding(attempt);assertAttempt(p,exact);setReviewKind('arm');setArmReview(exact);setSafety(false);setEvidence(false);}catch{ui.setError('m5c.errors.changed');}}}/>}
   {attempt.state==='armed'&&race.mode==='live'&&member&&!race.self_ready&&<Button label={t('m5c.ready')} disabled={!enable||!port.eligibility.stageReady||!port.eligibility.clockReady} onPress={()=>{try{const p=ui.guard();assertMember(p,member);const exact=attemptBinding(attempt);assertAttempt(p,exact);setReviewKind('ready');setArmReview(exact);setSafety(false);setEvidence(false);}catch{ui.setError('m5c.errors.changed');}}}/>}
   {attempt.state==='armed'&&<><Note>{t('m5c.finishBody')}</Note><Button label={t('m5c.finishAttempt')} disabled={!ui.terminalEnabled} onPress={()=>ui.run(async p=>{const exact=attemptBinding(attempt);assertAttempt(p,exact);return p.finishAttempt(exact);},'terminal')}/></>}
   {['reserved','armed'].includes(attempt.state)&&<Button secondary label={t('m5c.stopAttempt')} disabled={!ui.terminalEnabled} onPress={()=>ui.run(async p=>{const exact=attemptBinding(attempt);assertAttempt(p,exact);return p.abort(exact);},'terminal')}/>}
   {['upload_pending','queued','verifying'].includes(attempt.state)&&<><Note>{t('m5c.pendingEvidence')}</Note><Note>{t('m5c.retryEvidenceBody')}</Note><Button secondary label={t('m5c.retryEvidence')} disabled={!ui.terminalEnabled} onPress={()=>ui.run(async p=>{const exact=attemptBinding(attempt);assertAttempt(p,exact);return p.finishAttempt(exact);},'terminal')}/></>}{attempt.rejection_code&&<Note error>{t('m5c.errors.quality')}</Note>}
  </Panel>}
  {member&&race.self_ready&&<Button secondary label={t('m5c.unready')} disabled={!ui.terminalEnabled} onPress={()=>ui.run(async p=>{assertMember(p,member);return p.unready(member);},'terminal')}/>}
  {binding&&race.mode==='live'&&race.self_member.role==='host'&&race.state==='lobby'&&<><Note>{t('m5c.scheduleBody')}</Note><Button label={t('m5c.schedule')} disabled={!enable||!port.eligibility.canSchedule} onPress={()=>ui.run(async p=>{assertRace(p,binding);if(!p.eligibility.canSchedule)throw Error('RACE_NOT_READY');return p.schedule(binding);})}/></>}
 </>}{ui.error&&<Note error>{t(ui.error)}</Note>}<RaceOutcome port={port} t={t} id={ui.operation}/><RouteSheet visible={!!armReview&&port.gate.focused&&port.gate.foreground&&!port.gate.moving} title={t(reviewKind==='ready'?'m5c.ready':'m5c.armTitle')} onClose={()=>setArmReview(null)}><Note>{t('m5c.reserveBody')}</Note><ConsentChecks t={t} safety={safety} evidence={evidence} onSafety={setSafety} onEvidence={setEvidence} disabled={!enable}/><Button label={t(reviewKind==='ready'?'m5c.ready':'m5c.confirmArm')} disabled={!enable||!safety||!evidence||!port.gate.native||!port.eligibility.captureReady||(reviewKind==='ready'&&(!port.eligibility.stageReady||!port.eligibility.clockReady))} busy={ui.busy} onPress={confirm}/>{ui.error&&<Note error>{t(ui.error)}</Note>}<RaceOutcome port={port} t={t} id={ui.operation}/></RouteSheet></RaceFrame>;
}
export {RaceLobby};
