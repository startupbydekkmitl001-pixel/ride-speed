import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,View} from 'react-native';
import {router} from 'expo-router';
import {Button,Heading,Icon,Note,Row,Screen,T} from '../components/ui';
import {useApp} from '../state/AppState';
import {useGarage} from '../state/GarageState';
import {useRide} from '../state/RideState';
import {useI18n} from '../lib/i18n';
import {useScreenActivity} from '../lib/useScreenActivity';
import {AmbientLoop,resolveAmbientAsset} from '../features/motion';
import VehicleStage from '../features/map/VehicleStage';
export default function MapVehicle(){
 const app=useApp(),garage=useGarage(),ride=useRide(),{t}=useI18n(),{active,generation,current,capture,accepts}=useScreenActivity(),[selection,setSelection]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const moving=useRef(ride.movingLocked),saving=useRef<object|null>(null);
 useLayoutEffect(()=>{moving.current=ride.movingLocked;},[ride.movingLocked]);
 // Retired OS/screen work may finish persisting, but cannot navigate or hold the UI.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{saving.current=null;setBusy(false);setError(false);return()=>{saving.current=null;};},[active,generation,ride.movingLocked]);
 const selected=garage.vehicles.find(row=>row.id===(selection??garage.activeId))??garage.vehicles[0];
 const save=async()=>{const ticket=capture();if(!selected||ticket===null||moving.current||saving.current)return;const lease={};saving.current=lease;setBusy(true);setError(false);const valid=()=>saving.current===lease&&accepts(ticket)&&!moving.current;try{const success=await garage.select(selected.id);if(valid()){if(success)router.back();else setError(true);}}catch{if(valid())setError(true);}finally{if(saving.current===lease){saving.current=null;if(accepts(ticket))setBusy(false);}}};
 if(ride.movingLocked)return <Screen scroll={false}><Heading eyebrow={t('nav.garage')} title={t('m3.movingTitle')}/><Note>{t('m3.movingBody')}</Note><Button label={t('liveMap.back')} onPress={()=>router.replace('/')}/></Screen>;
 return <Screen><Heading eyebrow={t('nav.garage')} title={t('liveMap.vehicle')} right={<Button small secondary label={t('common.close')} onPress={()=>router.back()}/>}/><T muted size={13}>{t('liveMap.modelNote')}</T>
  {selected?<>
   <View style={{backgroundColor:app.colors.surface,borderRadius:28,overflow:'hidden',padding:12}}><AmbientLoop asset={resolveAmbientAsset(`garage-${selected.category==='bigbike'?'bigbike':selected.category}`,app.dark?'dark':'light')} visible={active} style={[StyleSheet.absoluteFill,{opacity:.32}]}/><VehicleStage category={selected.category} color={selected.color??app.colors.accent}/><T size={24} weight="semibold" style={{padding:12}}>{selected.nickname||selected.model}</T></View>
   <View style={{gap:4,marginVertical:12}}>{garage.vehicles.map(vehicle=><Pressable key={vehicle.id} accessibilityRole="radio" accessibilityState={{checked:vehicle.id===selected.id,disabled:busy}} disabled={busy} onPress={()=>{if(current()&&!moving.current&&!saving.current)setSelection(vehicle.id);}} style={({pressed})=>({minHeight:64,padding:12,borderRadius:16,backgroundColor:vehicle.id===selected.id?app.colors.raised:undefined,opacity:pressed?.6:1})}><Row style={{gap:12}}><Icon name={vehicle.category==='car'?'car-sport-outline':'bicycle-outline'}/><View style={{flex:1}}><T weight="semibold">{vehicle.nickname||vehicle.model}</T><T muted size={12}>{vehicle.brand} · {vehicle.year}</T></View>{vehicle.id===selected.id&&<Icon name="checkmark-circle" color={app.colors.accent}/>}</Row></Pressable>)}</View>
   {error&&<Note>{t('liveMap.saveFailed')}</Note>}<Button label={t('liveMap.choose')} busy={busy} onPress={()=>{void save();}}/>
  </>:<Note>{t('liveMap.noVehicle')}</Note>}
  <Button secondary label={t('liveMap.openGarage')} onPress={()=>router.push('/garage')}/>
  {__DEV__&&<Button secondary label={t('liveMap.preview')} onPress={()=>router.push('/live-map-preview')}/>}
 </Screen>;
}
