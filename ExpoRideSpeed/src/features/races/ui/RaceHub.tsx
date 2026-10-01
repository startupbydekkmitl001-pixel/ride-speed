import React,{useEffect,useState} from 'react';
import {ActivityIndicator,FlatList,RefreshControl,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button,Empty,Note,Panel,Row,T} from '../../../components/ui';
import {raceErrorKey} from '../../../lib/raceI18n';
import {useApp} from '../../../state/AppState';
import type {RaceScreenProps} from '../uiTypes';
import {displayInstant} from './presentationModel';
import RaceCreate from './RaceCreate';
import {PendingRaces,RaceHeader,RaceOutcome,RaceReadState} from './RaceSurface';
import {useRaceUI} from './useRaceUI';

export default function RaceHub({port,t,startCreate=false}:RaceScreenProps&{startCreate?:boolean}){
 const ui=useRaceUI(port),{colors}=useApp(),insets=useSafeAreaInsets(),[create,setCreate]=useState(startCreate);
 // Invalidate the open editor when the parent reports an inactive screen or movement.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{if(!port.gate.focused||!port.gate.foreground||port.gate.moving)setCreate(false);},[port.generation,port.gate.focused,port.gate.foreground,port.gate.moving]);
 // A rematch is only a navigation intent to review new bindings, never a creation.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{setCreate(startCreate);},[startCreate,port.generation]);
 const loaded=port.ready&&port.fresh&&port.gate.signedIn&&port.racesPage.fresh&&!port.racesPage.error;
 return <View style={{flex:1,backgroundColor:colors.bg}}><FlatList data={port.gate.signedIn&&port.ready?port.races:[]} keyExtractor={race=>race.id} scrollEnabled={!port.gate.moving} contentContainerStyle={{paddingHorizontal:24,paddingTop:insets.top+16,paddingBottom:insets.bottom+120,gap:18}} refreshControl={<RefreshControl refreshing={port.loading||port.racesPage.loading} tintColor={colors.accent} onRefresh={()=>ui.run(p=>p.refresh(),'read')}/>} ListHeaderComponent={<View style={{gap:24}}><RaceHeader port={port} t={t} title={t('m5c.title')} body={t('m5c.body')}/><RaceReadState port={port} t={t}/><Button label={t('m5c.newTrial')} icon="add-outline" disabled={!ui.enabled||ui.busy||port.busy} onPress={()=>{try{ui.guard('read');setCreate(true);}catch(value){ui.setError(raceErrorKey(value));}}}/><Button small secondary label={t('m5c.refresh')} disabled={!port.gate.signedIn||port.gate.moving||!port.gate.foreground||!port.gate.focused} onPress={()=>ui.run(p=>p.refresh(),'read')}/><PendingRaces port={port} t={t}/>{ui.error&&<Note error>{t(ui.error)}</Note>}<RaceOutcome port={port} t={t} id={ui.operation}/></View>} renderItem={({item:race})=><Panel><Row style={{justifyContent:'space-between',alignItems:'flex-start'}}><View style={{flex:1,gap:4}}><T size={20} weight="semibold">{race.route_summary.title}</T><T size={13} muted>{t(`m5c.${race.mode}`)} · {t(`m5c.states.${race.state}`)}</T></View><T numeric size={13}>{race.members.filter(m=>m.state==='accepted').length}/4</T></Row><T size={12} muted>{displayInstant(race.starts_at)}{'\n'}{displayInstant(race.ends_at)}</T><Button small secondary label={t('m5c.open')} disabled={!ui.enabled||ui.busy} onPress={()=>ui.run(async p=>{const current=p.races.find(x=>x.id===race.id);if(!current||current.revision!==race.revision||current.self_member.member_generation!==race.self_member.member_generation)throw Error('RACE_CHANGED');await p.openRace(race.id);},'read')}/></Panel>} ListEmptyComponent={port.racesPage.loading?<ActivityIndicator color={colors.accent}/>:loaded?<Empty icon="flag-outline" title={t('m5c.emptyTitle')} body={t('m5c.emptyBody')}/>:null} ListFooterComponent={<View style={{gap:12}}>{port.racesPage.error&&<Note error>{t('m5c.unavailable')}</Note>}{port.racesPage.hasMore&&<Button secondary small label={t('m5c.more')} disabled={!ui.enabled||ui.busy} busy={port.racesPage.loading} onPress={()=>ui.run(p=>p.loadMore(),'read')}/>}</View>}/><RaceCreate port={port} t={t} visible={create} onClose={()=>setCreate(false)}/></View>;
}
export {RaceHub};
