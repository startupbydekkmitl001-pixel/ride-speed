import React,{useEffect,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {Button,Note,Row,T} from '../../../components/ui';
import {useApp} from '../../../state/AppState';
import {RouteSheet} from '../../routes/RouteSheet';
import SharedRouteSnapshot from '../../routes/SharedRouteSnapshot';
import RaceCourseMap from '../RaceCourseMap';
import {authorizedRaceCourse} from '../courseMapModel';
import type {RaceMemberBinding,RaceScreenProps} from '../uiTypes';
import {assertMember,assertRace,displayInstant,memberBinding,raceBinding} from './presentationModel';
import {RaceLobby} from './RaceLobby';
import {ConsentChecks,PendingRaces,RaceFrame,RaceHeader,RaceOutcome,RaceReadState} from './RaceSurface';
import {useRaceUI} from './useRaceUI';

export default function RaceDetail({port,t}:RaceScreenProps){
 const ui=useRaceUI(port),{colors}=useApp(),[consentReview,setConsentReview]=useState<{kind:'accept'|'reserve';binding:RaceMemberBinding}|null>(null),[safety,setSafety]=useState(false),[evidence,setEvidence]=useState(false),[cancelReview,setCancelReview]=useState(false);
 // Revoke the reviewed generation/consent when lifecycle invalidates the dialog.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{setConsentReview(null);setCancelReview(false);setSafety(false);setEvidence(false);},[port.generation,port.gate.focused,port.gate.foreground,port.gate.moving]);
 const race=port.race,binding=race?raceBinding(race):null,member=race?memberBinding(race):null,eligible=ui.enabled&&port.detailFresh&&!port.detailError&&!ui.busy&&!port.busy;
 const consent=()=>ui.run(async p=>{if(!consentReview||!safety||!evidence)throw Error('RACE_CONSENT');const r=assertMember(p,consentReview.binding);if(!p.pilotEnabled)throw Error('RACE_DISABLED');if(consentReview.kind==='accept'){if(r.self_member.state!=='invited')throw Error('RACE_MEMBER_CHANGED');return p.memberAction(consentReview.binding,'accept',{acknowledgement_version:1,evidence_consent_version:1});}if(!p.gate.native||r.self_member.state!=='accepted')throw Error('RACE_CAPTURE_MISMATCH');return p.reserve(consentReview.binding,{acknowledgement_version:1,evidence_consent_version:1});});
 const review=(kind:'accept'|'reserve')=>{try{if(!member)return;const p=ui.guard();assertMember(p,member);setConsentReview({kind,binding:member});setSafety(false);setEvidence(false);}catch{ui.setError('m5c.errors.changed');}};
 if(race&&port.attempt?.race_id===race.id&&['reserved','armed','upload_pending','queued','verifying'].includes(port.attempt.state))return <RaceLobby port={port} t={t}/>;
 return <RaceFrame port={port}><RaceHeader port={port} t={t} title={t('m5c.detail')}/><RaceReadState port={port} t={t}/>{port.detailLoading&&<ActivityIndicator color={colors.accent}/>}<Button small secondary label={t('m5c.refresh')} disabled={!port.gate.signedIn||port.gate.moving||!port.gate.focused||!port.gate.foreground} onPress={()=>ui.run(p=>p.refresh(),'read')}/>{port.detailError&&<Note error>{t('m5c.unavailable')}</Note>}{race&&<>
  <View style={{gap:12}}><T accessibilityRole="header" size={26} weight="semibold">{race.route_summary.title}</T><T muted>{t(`m5c.${race.mode}`)} · {t(`m5c.states.${race.state}`)}</T><T size={13} muted>{displayInstant(race.starts_at)}{'\n'}{displayInstant(race.ends_at)}</T>{!authorizedRaceCourse(port)&&<SharedRouteSnapshot value={race.route_snapshot} invitation/>}<Note>{t('m5c.routePrivate')}</Note></View>
  <View style={{gap:16}}><T size={20} weight="semibold">{t('m5c.members')}</T>{race.members.map(person=><Row key={person.user_id} style={{justifyContent:'space-between',alignItems:'flex-start'}}><View style={{flex:1,gap:3}}><T weight="medium">{person.profile.name}</T><T size={12} muted>@{person.profile.handle}{person.user_id===port.ownerId?' · '+t('m5c.you'):''}</T></View><T size={13} muted>{t(`m5c.memberStates.${person.state}`)}</T></Row>)}</View>
  {member&&race.self_member.state==='invited'&&<View style={{gap:12}}><Button label={t('m5c.accept')} disabled={!eligible||!port.pilotEnabled} onPress={()=>review('accept')}/><Button secondary label={t('m5c.decline')} disabled={!ui.terminalEnabled} onPress={()=>ui.run(async p=>{assertMember(p,member);return p.memberAction(member,'decline');},'terminal')}/></View>}
  {member&&race.self_member.state==='accepted'&&<><T size={20} weight="semibold">{t('m5c.course')}</T><Note>{t('m5c.courseBody')}</Note><Button secondary label={t('m5c.loadCourse')} disabled={!eligible||port.courseLoading} busy={port.courseLoading} onPress={()=>ui.run(async p=>{assertMember(p,member);await p.loadCourse(member);},'read')}/>{port.courseLoading&&<T muted>{t('m5c.courseLoading')}</T>}{port.courseError&&<Note error>{t('m5c.unavailable')}</Note>}<RaceCourseMap port={port} t={t}/>
  {!port.gate.native?<Note>{t('m5c.nativeOnly')}</Note>:port.eligibility.attemptLimitReached?<Note>{t('m5c.attemptLimit')}</Note>:['open','lobby'].includes(race.state)&&<><Button label={t('m5c.reserveAttempt')} disabled={!eligible||!port.pilotEnabled||!port.eligibility.captureReady} onPress={()=>review('reserve')}/>{!port.eligibility.captureReady&&<Note>{t('m5c.recordFromMap')}</Note>}</>}
  {race.self_member.role==='member'&&['open','lobby','countdown','running'].includes(race.state)&&<Button secondary label={t('m5c.withdraw')} disabled={!ui.terminalEnabled} onPress={()=>ui.run(async p=>{assertMember(p,member);return p.memberAction(member,'withdraw');},'terminal')}/>}</>}
  {binding&&<Button secondary label={t('m5c.results')} disabled={!eligible} onPress={()=>ui.run(async p=>{assertRace(p,binding);await p.loadResults(binding);},'read')}/>}
  {binding&&race.self_member.role==='host'&&['open','lobby','countdown','running'].includes(race.state)&&<Button secondary label={t('m5c.cancelRace')} disabled={!ui.terminalEnabled} onPress={()=>{if(ui.current())setCancelReview(true);}}/>}
 </>}<PendingRaces port={port} t={t}/>{ui.error&&<Note error>{t(ui.error)}</Note>}<RaceOutcome port={port} t={t} id={ui.operation}/>
 <RouteSheet visible={!!consentReview&&port.gate.focused&&port.gate.foreground&&!port.gate.moving} title={t(consentReview?.kind==='accept'?'m5c.acceptTitle':'m5c.reserveTitle')} onClose={()=>setConsentReview(null)}>{consentReview?.kind==='reserve'&&<Note>{t('m5c.reserveBody')}</Note>}<ConsentChecks t={t} safety={safety} evidence={evidence} onSafety={setSafety} onEvidence={setEvidence} disabled={!eligible}/><Button label={t(consentReview?.kind==='accept'?'m5c.accept':'m5c.reserveAttempt')} disabled={!eligible||!safety||!evidence||!port.pilotEnabled} busy={ui.busy} onPress={consent}/>{ui.error&&<Note error>{t(ui.error)}</Note>}<RaceOutcome port={port} t={t} id={ui.operation}/></RouteSheet>
 <RouteSheet visible={cancelReview&&port.gate.focused&&port.gate.foreground} title={t('m5c.cancelRaceTitle')} onClose={()=>setCancelReview(false)}><T>{t('m5c.cancelRaceBody')}</T><Button label={t('m5c.confirmCancel')} disabled={!ui.terminalEnabled} onPress={()=>ui.run(async p=>{if(!binding)throw Error('RACE_CHANGED');assertRace(p,binding);return p.cancel(binding);},'terminal')}/>{ui.error&&<Note error>{t(ui.error)}</Note>}</RouteSheet>
 </RaceFrame>;
}
export {RaceDetail};
