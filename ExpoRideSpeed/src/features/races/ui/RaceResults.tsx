import React from 'react';
import {ActivityIndicator,View} from 'react-native';
import {Button,Empty,Note,Panel,Row,T} from '../../../components/ui';
import {useApp} from '../../../state/AppState';
import type {RaceScreenProps} from '../uiTypes';
import {assertRace,intervalLabel,raceBinding,rankedIntervals} from './presentationModel';
import {RaceFrame,RaceHeader,RaceReadState} from './RaceSurface';
import {useRaceUI} from './useRaceUI';

export default function RaceResults({port,t}:RaceScreenProps){
 const ui=useRaceUI(port),{colors}=useApp(),race=port.race,results=race&&port.results?.race_id===race.id?port.results:null,binding=race?raceBinding(race):null;
 const fresh=port.ready&&port.fresh&&port.detailFresh&&port.resultsFresh&&!port.resultsError&&!port.resultsLoading;
 const entries=rankedIntervals((results?.items??[]).filter(result=>race&&result.approval_id===race.approval.id&&result.config_hash===race.approval.config_hash));
 return <RaceFrame port={port}><RaceHeader port={port} t={t} title={t('m5c.results')} body={race?.route_summary.title}/><RaceReadState port={port} t={t}/><Button small secondary label={t('m5c.refresh')} disabled={!ui.enabled} onPress={()=>ui.run(async p=>{if(!binding)return;assertRace(p,binding);await p.loadResults(binding);},'read')}/>{port.resultsLoading&&<Row><ActivityIndicator color={colors.accent}/><T>{t('m5c.resultsLoading')}</T></Row>}{port.resultsError&&<Note error>{t('m5c.unavailable')}</Note>}<T weight="semibold">{t('m5c.quality')}</T><Note>{t('m5c.qualityBody')}</Note>
 <Note>{t('m5c.attemptTimes')}</Note>{entries.map(({result,rank,tied})=>{const person=race?.members.find(m=>m.user_id===result.owner_id);return <Panel key={result.attempt_id}><Row style={{alignItems:'flex-start'}}><T numeric size={28}>{rank}</T><View style={{flex:1,gap:4}}><T size={20} weight="semibold">{person?.profile.name??t('m5c.riderUnavailable')}</T><T size={12} muted>{t('m5c.elapsed')}</T><T numeric size={26}>{intervalLabel(result.elapsed_lower_ms,result.elapsed_upper_ms)} {t('m5c.secondsUnit')}</T>{tied&&<T size={13} muted>{t('m5c.tie')}</T>}</View></Row><Row style={{flexWrap:'wrap',gap:18}}><View><T muted size={12}>{t('m5c.distance')}</T><T numeric>{(result.distance_m/1000).toFixed(2)} km</T></View><View><T muted size={12}>{t('m5c.averageSpeed')}</T><T numeric>{Math.round(result.average_speed_mps*3.6)} km/h</T></View><View><T muted size={12}>{t('m5c.topSpeed')}</T><T numeric>{result.maximum_speed_mps===null?t('m5c.speedUnavailable'):Math.round(result.maximum_speed_mps*3.6)+' km/h'}</T></View></Row>{result.provenance_unknown&&<Note>{t('m5c.unknownProvenance')}</Note>}</Panel>;})}
 {fresh&&results&&!entries.length&&<Empty icon="flag-outline" title={t('m5c.resultsEmpty')} body={t('m5c.resultsBody')}/>}
 {results&&<View style={{gap:16}}>{results.statuses.map(status=><Row key={status.user_id} style={{justifyContent:'space-between',alignItems:'flex-start'}}><T style={{flex:1}}>{race?.members.find(m=>m.user_id===status.user_id)?.profile.name??t('m5c.riderUnavailable')}</T><T muted size={13}>{t(`m5c.resultStates.${status.state}`)}</T></Row>)}</View>}
 {binding&&race&&['finished','expired','cancelled'].includes(race.state)&&<><Note>{t('m5c.rematchBody')}</Note><Button label={t('m5c.rematch')} disabled={!ui.enabled||!port.pilotEnabled} onPress={()=>ui.run(async p=>{assertRace(p,binding);await p.rematch(binding);})}/></>}{ui.error&&<Note error>{t(ui.error)}</Note>}</RaceFrame>;
}
export {RaceResults};
