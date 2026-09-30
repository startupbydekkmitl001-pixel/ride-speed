import { useEffect } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Button,Heading,Note,Panel,Row,Screen,T } from '../components/ui';
import { useRide } from '../state/RideState';
import { useApp } from '../state/AppState';
import { useAuth } from '../state/AuthState';
import { useI18n,type TranslationKey } from '../lib/i18n';
import { formatRideDuration,metricDistance,speedFactor } from '../features/speedometer/presentation';
export default function RideHistory(){
 const ride=useRide(),{data}=useApp(),{session}=useAuth(),{t,locale}=useI18n();
 const unit=t(data.unit==='mph'?'common.mph':'common.kmh');
 const distance=(meters:number|null)=>{const value=meters===null?null:metricDistance(meters,data.unit);return `${value?value.value.toFixed(2):'—'} ${t(data.unit==='mph'?'m2.hud.mi':'m2.hud.km')}`;};
 const speed=(mps:number|null)=>`${mps===null?'—':Math.round(mps*speedFactor(data.unit))} ${unit}`;
 const cloudOnly=ride.cloudHistory.filter(item=>!ride.history.some(local=>local.id===item.ride_id));
 const {refreshHistory}=ride;useEffect(()=>{void refreshHistory().catch(()=>{});},[refreshHistory]);
 return <Screen><Heading eyebrow={t('nav.map')} title={t('m2.ride.history')}/>
  {ride.error&&<><Note error>{t(ride.error as TranslationKey)}</Note><Button secondary label={t('m2.ride.retrySave')} onPress={()=>{void ride.retrySave();}}/></>}
  {!ride.history.length&&!ride.cloudHistory.length?<Panel><T muted>{t('m2.ride.emptyHistory')}</T><Button label={t('nav.map')} onPress={()=>router.replace('/')}/></Panel>:ride.history.map(item=><Panel key={item.id}>
   <Row><View style={{flex:1}}><T weight="semibold">{new Date(item.startedAtMs).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'})}</T><T size={13} muted>{item.vehicle?[item.vehicle.brand,item.vehicle.model].join(' '):t('speed.noVehicle')}</T></View><T numeric size={20}>{formatRideDuration(item.activeDurationMs/1000)}</T></Row>
   <Row><T numeric>{distance(item.acceptedCount?item.distanceMeters:null)}</T><T numeric>{speed(item.maxMps)}</T></Row>
   <T size={12} muted>{t(item.status==='interrupted'?'m2.ride.interrupted':item.status==='paused'?'m2.ride.paused':item.sync==='synced'?'m2.ride.synced':item.sync==='pending'?'m2.ride.syncPending':'m2.ride.savedLocal')}</T>
   <T size={12} muted>{t('m2.ride.selfReported')}</T>
   {item.syncError&&<Note error>{t(item.syncError as TranslationKey)}</Note>}
  </Panel>)}
  <T weight="semibold" size={20}>{t('m2.ride.cloudHistory')}</T>
  {!session&&<><Note>{t('m2.ride.signInToSync')}</Note><Button secondary label={t('common.signInOrCreate')} onPress={()=>router.push('/auth')}/></>}
  {ride.cloudError&&<Note error>{t('m2.sync.unavailable')}</Note>}
  {session&&!ride.cloudHistory.length&&!ride.cloudError&&<T muted>{t('m2.ride.cloudEmpty')}</T>}
  {cloudOnly.map(item=><Panel key={item.ride_id}><Row><View style={{flex:1}}><T weight="semibold">{new Date(item.payload.started_at).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'})}</T><T muted size={13}>{item.payload.vehicle?[item.payload.vehicle.brand,item.payload.vehicle.model].join(' '):t('speed.noVehicle')}</T></View><T numeric size={20}>{formatRideDuration(item.payload.active_duration_ms/1000)}</T></Row><Row><T numeric>{distance(item.payload.distance_m)}</T><T numeric>{speed(item.payload.max_speed_mps)}</T></Row><T muted size={12}>{t('m2.ride.synced')}</T><T muted size={12}>{t('m2.ride.selfReported')}</T></Panel>)}
  {session&&<Button secondary label={t('m2.ride.retrySync')} busy={ride.syncing} onPress={ride.retrySync}/>}
  {ride.cloudMore&&<Button secondary label={t('m2.ride.loadMore')} onPress={()=>{void ride.loadMoreCloud();}}/>}
  <Button secondary label={t('nav.map')} onPress={()=>router.back()}/>
 </Screen>;
}
