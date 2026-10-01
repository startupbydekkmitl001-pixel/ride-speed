import React from 'react';
import {ActivityIndicator,Pressable,ScrollView,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button,Icon,Note,Panel,Row,T} from '../../../components/ui';
import {raceErrorKey} from '../../../lib/raceI18n';
import {theme} from '../../../lib/theme';
import {useApp} from '../../../state/AppState';
import type {RaceScreenProps,RaceTranslator} from '../uiTypes';
import {useRaceUI} from './useRaceUI';

export function RaceFrame({port,children,scroll=true}:Pick<RaceScreenProps,'port'>&{children:React.ReactNode;scroll?:boolean}){
 const {colors}=useApp(),insets=useSafeAreaInsets();
 const content=<View style={{paddingHorizontal:24,paddingTop:insets.top+16,paddingBottom:insets.bottom+100,gap:24}}>{children}</View>;
 return <View style={{flex:1,backgroundColor:colors.bg}}>{scroll?<ScrollView scrollEnabled={!port.gate.moving} keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1}}>{content}</ScrollView>:content}</View>;
}
export function RaceHeader({port,t,title,body}:RaceScreenProps&{title:string;body?:string}){
 const ui=useRaceUI(port);
 return <View style={{gap:14}}><Button small secondary icon="arrow-back-outline" label={t('m5c.back')} disabled={!port.gate.focused||!port.gate.foreground||port.gate.moving} onPress={()=>{try{if(!ui.current()||!ui.latest.current.gate.focused||ui.latest.current.gate.moving)return;ui.latest.current.onBack();}catch{/* Parent route guard decides navigation. */}}}/><T accessibilityRole="header" size={30} weight="semibold">{title}</T>{body&&<T muted>{body}</T>}</View>;
}
export function RaceReadState({port,t}:RaceScreenProps){
 const ui=useRaceUI(port),{colors}=useApp();
 if(!port.gate.signedIn)return <Panel><T>{t('m5c.signIn')}</T><Button label={t('m5c.signIn')} onPress={()=>{if(ui.current())ui.latest.current.onSignIn();}}/></Panel>;
 if(port.loading||!port.ready)return <View style={{gap:12}}>{port.loading?<Row><ActivityIndicator color={colors.accent}/><T muted>{t('m5c.loading')}</T></Row>:<Note error>{t('m5c.unavailable')}</Note>}<Button secondary label={t('m5c.refresh')} disabled={!port.gate.focused||!port.gate.foreground||port.gate.moving} onPress={()=>ui.run(p=>p.refresh(),'read')}/></View>;
 if(port.fresh&&!port.gate.profileReady)return <Panel><Note>{t('m5c.profileRequired')}</Note><Button label={t('m5c.editProfile')} onPress={()=>{if(ui.current())ui.latest.current.onEditProfile();}}/></Panel>;
 return <View style={{gap:8}}>{!port.gate.online&&<Note>{t('m5c.offline')}</Note>}{port.gate.moving&&<Note>{t('m5c.moving')}</Note>}{(!port.fresh||port.error)&&<Note error>{t(port.error?raceErrorKey(port.error):'m5c.unavailable')}</Note>}{!port.pilotEnabled&&<Note>{t('m5c.disabled')}</Note>}</View>;
}
export function ConsentChecks({safety,evidence,onSafety,onEvidence,disabled=false,t}:{safety:boolean;evidence:boolean;onSafety:(value:boolean)=>void;onEvidence:(value:boolean)=>void;disabled?:boolean;t:RaceTranslator}){
 const {colors}=useApp();
 return <View style={{gap:20}}>{[{value:safety,set:onSafety,label:'m5c.safetyLabel',body:'m5c.safetyBody'},{value:evidence,set:onEvidence,label:'m5c.evidenceLabel',body:'m5c.evidenceBody'}].map(check=><Pressable key={check.label} accessibilityRole="checkbox" accessibilityLabel={`${t(check.label)}. ${t(check.body)}`} accessibilityState={{checked:check.value,disabled}} disabled={disabled} onPress={()=>check.set(!check.value)} style={{minHeight:theme.material.minTarget,flexDirection:'row',alignItems:'flex-start',gap:12,opacity:disabled ? .5 : 1}}><Icon name={check.value?'checkbox-outline':'square-outline'} color={check.value?colors.accent:colors.muted}/><View style={{flex:1,gap:4}}><T weight="semibold">{t(check.label)}</T><T size={13} muted>{t(check.body)}</T></View></Pressable>)}</View>;
}
export function RaceOutcome({port,t,id}:{port:RaceScreenProps['port'];t:RaceTranslator;id:string|null}){
 if(!id)return null;const result=port.latest?.operation_id===id?port.latest:null;
 return <Note error={result?.status==='rejected'}>{t(result?.status==='rejected'?raceErrorKey(result.error):result?.status==='applied'?'m5c.applied':'m5c.queued')}</Note>;
}
export function PendingRaces({port,t}:RaceScreenProps){
 const ui=useRaceUI(port);
 if(!port.pending.length)return null;
 return <Panel><T weight="semibold">{t('m5c.pendingTitle')}</T><T size={13} muted>{t('m5c.pendingBody')}</T>{port.pending.map(operation=><View key={operation.operation_id} style={{gap:10}}><T>{t(`m5c.actions.${operation.request.action}`)}</T>{operation.last_error&&<Note error>{t(raceErrorKey(operation.last_error))}</Note>}<T size={12} muted>{t('m5c.retryBody')}</T><Button small secondary label={t('m5c.retry')} disabled={!ui.enabled||ui.busy||port.busy||!!port.retryAfterMs} onPress={()=>ui.run(async p=>{const exact=p.pending.find(x=>x.operation_id===operation.operation_id);if(!exact||JSON.stringify(exact.request)!==JSON.stringify(operation.request))throw Error('RACE_OPERATION_CONFLICT');await p.retry(operation.operation_id);})}/>{['attempt_arm','race_ready','race_schedule'].includes(operation.request.action)&&<><Note>{t('m5c.cancelActivationBody')}</Note><Button small secondary label={t('m5c.cancelActivation')} disabled={!ui.terminalEnabled||ui.busy} onPress={()=>ui.run(async p=>{if(!p.pending.some(x=>x.operation_id===operation.operation_id))throw Error('RACE_OPERATION_CONFLICT');await p.cancelActivation(operation.operation_id);},'terminal')}/></>}</View>)}{ui.error&&<Note error>{t(ui.error)}</Note>}</Panel>;
}
