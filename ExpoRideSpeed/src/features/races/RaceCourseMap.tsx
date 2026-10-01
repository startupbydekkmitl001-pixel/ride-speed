import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,StyleSheet,View} from 'react-native';
import {Button,Note,Row,T} from '../../components/ui';
import {useI18n,type TranslationKey} from '../../lib/i18n';
import {useScreenActivity} from '../../lib/useScreenActivity';
import {useApp} from '../../state/AppState';
import MapSurface from '../map/ActiveMapSurface';
import type {MapHandle,MapStatus} from '../map/MapSurface.types';
import {authorizedRaceCourse,authorizedRaceMember,raceCourseMapGeometry} from './courseMapModel';
import {memberBinding} from './ui/presentationModel';
import type {RaceScreenProps} from './uiTypes';
const none=[] as const,insets={top:16,left:16,right:16,bottom:16};

/** Private static geometry only. This component never captures or shares GPS. */
export default function RaceCourseMap({port,t}:RaceScreenProps){
 const {colors,dark,motion}=useApp(),{language,t:translate}=useI18n(),activity=useScreenActivity();
 const latest=useRef(port),map=useRef<MapHandle>(null),fitted=useRef<string|null>(null),tickets=useRef(new WeakMap<object,number|null>());
 const [state,setState]=useState<{key:string|null;value:MapStatus}>({key:null,value:{state:'loading'}}),[retry,setRetry]=useState(0),[selected,setSelected]=useState<string|null>(null);
 useLayoutEffect(()=>{latest.current=port;},[port]);
 const authority=authorizedRaceCourse(port),geometry=useMemo(()=>{
  if(!port.course)return null;
  try{return raceCourseMapGeometry(port.course,(key,values)=>translate(key as TranslationKey,values));}catch{return null;}
 },[port.course,translate]);
 const key=authority?.key??null,status=state.key===key?state.value:{state:'loading' as const};
 const {capture,accepts,active}=activity;
 // Capture after the activity hook adopts focus, with a distinct ticket per boundary.
 const ticket={};
 useLayoutEffect(()=>{tickets.current.set(ticket,capture());});
 const activeTicket=()=>accepts(tickets.current.get(ticket)??null);
 const current=()=>activeTicket()&&!!key&&authorizedRaceCourse(latest.current)?.key===key;
 useEffect(()=>{const handle=map.current;if(handle&&geometry&&status.state==='ready'&&current()&&fitted.current!==key){handle.fitCoordinates(geometry.coordinates,{padding:insets,maxZoom:16,durationMs:0});fitted.current=key;}});
 const overview=()=>{if(!current()||latest.current.gate.moving||!geometry)return;map.current?.fitCoordinates(geometry.coordinates,{padding:insets,maxZoom:16,durationMs:motion?250:0});setSelected(null);};
 const loadCourse=()=>{
  const value=latest.current;
  if(!activeTicket()||!authorizedRaceMember(value)||value.gate.moving||!value.gate.online)return;
  try{value.guard(value.generation,'read');void value.loadCourse(memberBinding(value.race!)).catch(()=>{});}
  catch{/* Parent read guard reports current availability. */}
 };
 if(!authority||!geometry||!active)return <View style={{gap:12}}><Note>{t('m5c.mapUnavailable')}</Note>{authorizedRaceMember(port)&&!port.course&&<Button secondary small label={t('m5c.loadCourse')} disabled={port.gate.moving||!port.gate.online||port.courseLoading} busy={port.courseLoading} onPress={loadCourse}/>}</View>;
 return <View style={{gap:14}}>
  <Row style={{justifyContent:'space-between',alignItems:'center',gap:12}}><T accessibilityRole="header" weight="semibold" size={20}>{t('m5c.courseMap')}</T><Button secondary small icon="scan-outline" label={t('m5c.mapOverview')} disabled={port.gate.moving} onPress={overview}/></Row>
  <View accessibilityLabel={t('m5c.mapAccessible',{count:geometry.pins.length})} style={[styles.map,{backgroundColor:colors.bg,borderColor:colors.line}]}>
   <MapSurface key={key} ref={map} theme={dark?'dark':'light'} locale={language} initialCamera={geometry.camera} contentInsets={insets} mode={port.gate.moving?'glance':'browse'} reducedMotion={!motion} online={port.gate.online} retryToken={retry} track={geometry.track} pins={geometry.pins} selectedPinId={selected} peers={none} userFix={null} onStatus={value=>{if(current())setState({key,value});}} onSelectPin={id=>{if(current()&&!latest.current.gate.moving&&geometry.pins.some(pin=>pin.id===id))setSelected(id);}}/>
  </View>
  <View accessibilityLiveRegion="polite" style={{gap:10}}>{status.state==='loading'&&<Row><ActivityIndicator color={colors.accent}/><T muted>{t('m5c.mapLoading')}</T></Row>}{(!port.gate.online||status.state==='degraded')&&<Note>{t('m5c.mapOffline')}</Note>}{status.state==='unsupported'&&<Note error>{t('m5c.mapUnsupported')}</Note>}{status.state==='error'&&<Note error>{t('m5c.mapError')}</Note>}{(status.state==='error'||status.state==='degraded')&&<Button secondary small label={t('m5c.mapRetry')} disabled={port.gate.moving||!port.gate.online} onPress={()=>{if(current()&&!latest.current.gate.moving&&latest.current.gate.online){fitted.current=null;setState({key,value:{state:'loading'}});setRetry(value=>value+1);}}}/>}</View>
  <T muted size={13}>{t('m5c.mapLegend')}</T><View style={{gap:10}}>{geometry.gates.map(gate=><Row key={gate.id} style={{justifyContent:'space-between',gap:12}}><T weight={selected===gate.id?'semibold':'regular'}>{t(`m5c.gate${gate.kind==='start'?'Start':gate.kind==='finish'?'Finish':'Checkpoint'}`,{number:gate.number})}</T><T numeric muted size={12}>{t('m5c.gateDirection',{degrees:gate.directionDegrees})}</T></Row>)}</View>
  <T muted size={12}>{t('m5c.gates',{count:geometry.gates.length})}{' · '}{t('m5c.corridor',{meters:port.course!.configuration.corridor_half_width_m})}</T><Note>{t('m5c.staging')}</Note><T muted size={12}>{t('m5c.mapPrivacy')}</T>
 </View>;
}
const styles=StyleSheet.create({map:{height:340,borderRadius:24,borderWidth:StyleSheet.hairlineWidth,overflow:'hidden'}});
