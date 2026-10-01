import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field, Glass, Icon, Row, Segments, T } from '../../components/ui';
import MapSurface from '../map/ActiveMapSurface';
import type { MapCamera, MapCoordinate, MapHandle, MapPin, MapStatus } from '../map/MapSurface.types';
import { mapCopy } from '../map/mapCopy';
import { useApp } from '../../state/AppState';
import { useRide } from '../../state/RideState';
import { useI18n } from '../../lib/i18n';
import {useScreenActivity} from '../../lib/useScreenActivity';
import { routeErrorKey } from '../../lib/i18n/m4';
import { addBuilderStop, applyRoadResult, builderDocument, builderHasSaveSource, needsRoadCalculation, moveBuilderPin, removeBuilderStop, reorderBuilderStop, RequestGate, reverseBuilderStops, roundTripBuilder, routeInputKey, routingProfile, undoBuilder, type BuilderHistory } from './builderModel';
import { RouteSheet } from './RouteSheet';
import { RoutingAttribution } from './RoutingAttribution';
import type { BuilderDraft, RoadResult, RoutingProfile, SearchResult } from './types';

export type RouteBuilderProps={
 value:BuilderDraft;onChange:(value:BuilderDraft)=>void;onSave:(value:BuilderDraft)=>Promise<boolean>;onClose:()=>void;
 search:(query:string,language:'th'|'en',signal?:AbortSignal)=>Promise<SearchResult>;
 calculate:(stops:readonly MapCoordinate[],profile:RoutingProfile,signal?:AbortSignal)=>Promise<RoadResult>;
 locked:boolean;consent:boolean;onRequestConsent:()=>Promise<boolean>;ownerGeneration:number;
 ready?:boolean;busy?:boolean;error?:string|null;online?:boolean;onLocate?:(signal?:AbortSignal)=>void;bottomOffset?:number;
 onOpenSaved?:()=>void;
 onSignIn?:()=>void;
};
const noPeers=[] as const;
export default function RouteBuilder(props:RouteBuilderProps){
 const {colors,dark,motion}=useApp(),{t,language}=useI18n(),ride=useRide(),insets=useSafeAreaInsets();
 const activity=useScreenActivity(),{active,generation:activityGeneration,capture,accepts,current:screenCurrent}=activity;
 const locked=props.locked||ride.movingLocked, latest=useRef({...props,locked});useLayoutEffect(()=>{latest.current={...props,locked};});
 const map=useRef<MapHandle>(null),history=useRef<BuilderHistory>({value:props.value,history:[]});
 const searchGate=useRef(new RequestGate()),roadGate=useRef(new RequestGate());
 const [selected,setSelected]=useState<string|null>(null),[sheet,setSheet]=useState<'search'|'stops'|'save'|null>(null),[query,setQuery]=useState('');
 const [searchState,setSearch]=useState<{key:string;loading:boolean;value:SearchResult|null;error:string|null}>({key:'',loading:false,value:null,error:null});
 const [historyDepth,setHistoryDepth]=useState(0);
 const [road,setRoad]=useState<{key:string;loading:boolean;error:string|null}>({key:'',loading:false,error:null}),[retry,setRetry]=useState(0),[mapRetry,setMapRetry]=useState(0);
 const [status,setStatus]=useState<MapStatus>({state:'loading'}),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState<string|null>(null),[saved,setSaved]=useState(false);
 const recenterIntent=useRef(false),recenterController=useRef<AbortController|null>(null);
 useEffect(()=>()=>{recenterController.current?.abort();recenterController.current=null;recenterIntent.current=false;},[active,activityGeneration]);
 const [panelHeight,setPanelHeight]=useState(240);
 const [initialCamera]=useState<MapCamera>(()=>({center:props.value.stops[0]?.coordinate??ride.userFix?.coordinate??{latitude:15.6,longitude:101.1},zoom:props.value.stops.length||ride.userFix?13:4.5,bearing:0,pitch:0}));
 const bottom=insets.bottom+(props.bottomOffset??88),mapInsets=useMemo(()=>({top:insets.top+130,left:24,right:68,bottom:bottom+panelHeight+24}),[insets.top,bottom,panelHeight]);
 const key=routeInputKey(props.value),currentRoad=road.key===key?road:null;
 const hasSaveSource=builderHasSaveSource(props.value),needsRoad=needsRoadCalculation(props.value);
 const normalizedQuery=query.normalize('NFC').trim().replace(/\s+/gu,' '),search=searchState.key===normalizedQuery?searchState:{loading:props.consent&&Array.from(normalizedQuery).length>=3,value:null,error:null};
 const searchIdentity=useRef(normalizedQuery);useLayoutEffect(()=>{searchIdentity.current=normalizedQuery;},[normalizedQuery]);
 const pins=useMemo<MapPin[]>(()=>props.value.stops.map((stop,index)=>({id:stop.id,coordinate:stop.coordinate,label:stop.label,order:index+1,role:index===0?'start':index===props.value.stops.length-1?'finish':'via'})),[props.value.stops]);
 const track=useMemo(()=>props.value.geometry?{kind:props.value.geometry.kind,segments:props.value.geometry.segments}:props.value.stops.length>1?{kind:'draft' as const,segments:[props.value.stops.map(stop=>stop.coordinate)]}:null,[props.value.geometry,props.value.stops]);
 const selectedStop=props.value.stops.find(stop=>stop.id===selected);
 useEffect(()=>()=>{searchGate.current.invalidate();roadGate.current.invalidate();},[]);
 const publish=useCallback((operation:(state:BuilderHistory)=>BuilderHistory)=>{
  const current=latest.current;if(!screenCurrent()||current.locked||current.busy||current.ready===false)return;
  const state=operation({value:current.value,history:history.current.history});
  if(state.value===current.value)return;
  history.current=state;setHistoryDepth(state.history.length);searchGate.current.invalidate();roadGate.current.invalidate();setSaved(false);setSaveError(null);current.onChange(state.value);
 },[screenCurrent]);
 const add=useCallback((coordinate:MapCoordinate,label?:string,placeId?:string)=>{
  const current=latest.current;if(current.locked)return;
  const index=current.value.stops.length;if(index>=12)return;
  const id=randomUUID();
  publish(state=>addBuilderStop(state,{id,coordinate,label:label??t(index===0?'m4.start':index===1?'m4.finish':'m4.via',{number:index}),...(placeId?{placeId}:{})}));
  setSelected(id);
 },[publish,t]);
 const move=useCallback((id:string,coordinate:MapCoordinate)=>publish(state=>moveBuilderPin(state,id,coordinate)),[publish]);
 const selectPin=useCallback((id:string)=>{if(screenCurrent()&&!latest.current.locked)setSelected(id);},[screenCurrent]);
 const focus=(coordinate:MapCoordinate)=>map.current?.setCamera({center:coordinate,zoom:15,durationMs:motion?300:0});
 const recenter=()=>{if(!screenCurrent()||locked)return;recenterController.current?.abort();recenterController.current=new AbortController();recenterIntent.current=true;props.onLocate?.(recenterController.current.signal);if(ride.userFix&&Date.now()-ride.userFix.timestampMs>=0&&Date.now()-ride.userFix.timestampMs<15000){focus(ride.userFix.coordinate);recenterIntent.current=false;}};
 useEffect(()=>{if(recenterIntent.current&&ride.userFix&&Date.now()-ride.userFix.timestampMs>=0&&Date.now()-ride.userFix.timestampMs<15000){map.current?.setCamera({center:ride.userFix.coordinate,zoom:15,durationMs:motion?300:0});recenterIntent.current=false;}},[ride.userFix,motion]);
 useEffect(()=>{
  const gate=searchGate.current;gate.invalidate();
  if(!active||sheet!=='search'||locked||!props.consent||props.online===false)return;
  const normalized=query.normalize('NFC').trim().replace(/\s+/gu,' ');
  if(Array.from(normalized).length<3)return;
  const controller=new AbortController(),ticket=gate.begin(normalized,props.ownerGeneration),activityTicket=capture();
  const timer=setTimeout(()=>{if(!accepts(activityTicket)||!gate.accepts(ticket,searchIdentity.current,latest.current.ownerGeneration)||latest.current.locked||!latest.current.consent||latest.current.online===false)return;setSearch({key:normalized,loading:true,value:null,error:null});void latest.current.search(normalized,language,controller.signal).then(value=>{
   if(!controller.signal.aborted&&accepts(activityTicket)&&latest.current.consent&&latest.current.online!==false&&gate.accepts(ticket,latest.current.locked?'':normalized,latest.current.ownerGeneration))setSearch({key:normalized,loading:false,value,error:null});
  }).catch(error=>{if(!controller.signal.aborted&&accepts(activityTicket)&&gate.accepts(ticket,normalized,latest.current.ownerGeneration)&&!latest.current.locked)setSearch({key:normalized,loading:false,value:null,error:routeErrorKey(error)});});},400);
  return()=>{clearTimeout(timer);controller.abort();gate.invalidate();};
 },[query,sheet,props.consent,props.online,props.ownerGeneration,locked,language,active,activityGeneration,capture,accepts]);
 useEffect(()=>{
  const gate=roadGate.current;gate.invalidate();
  if(!active||locked||!props.consent||props.online===false||!needsRoad)return;
  const ticket=gate.begin(key,props.ownerGeneration),controller=new AbortController(),activityTicket=capture();
  const timer=setTimeout(()=>{const current=latest.current;if(!accepts(activityTicket)||!gate.accepts(ticket,routeInputKey(current.value),current.ownerGeneration)||current.locked||!current.consent||current.online===false)return;setRoad({key,loading:true,error:null});void current.calculate(current.value.stops.map(stop=>stop.coordinate),routingProfile(current.value.category),controller.signal).then(result=>{
   const now=latest.current;if(controller.signal.aborted||!accepts(activityTicket)||now.locked||!now.consent||now.online===false||!gate.accepts(ticket,routeInputKey(now.value),now.ownerGeneration))return;
   const state=applyRoadResult({value:now.value,history:history.current.history},key,result);history.current=state;now.onChange(state.value);setRoad({key,loading:false,error:null});
  }).catch(error=>{const now=latest.current;if(!controller.signal.aborted&&accepts(activityTicket)&&!now.locked&&gate.accepts(ticket,routeInputKey(now.value),now.ownerGeneration))setRoad({key,loading:false,error:routeErrorKey(error)});});},400);
  return()=>{clearTimeout(timer);controller.abort();gate.invalidate();};
  // Pin identity plus proof eligibility avoids requesting again when a result supplies fresh proof.
 },[key,needsRoad,props.consent,props.online,props.ownerGeneration,locked,retry,active,activityGeneration,capture,accepts]);
 const ask=async()=>{const current=latest.current,activityTicket=capture();if(!accepts(activityTicket)||current.locked)return false;try{const allowed=current.consent||await current.onRequestConsent();return allowed&&accepts(activityTicket)&&latest.current.ownerGeneration===current.ownerGeneration&&!latest.current.locked;}catch(error){if(accepts(activityTicket)&&latest.current.ownerGeneration===current.ownerGeneration)setRoad({key:routeInputKey(latest.current.value),loading:false,error:routeErrorKey(error)});return false;}};
 const openSearch=async()=>{if(locked)return;setSheet('search');await ask();};
 const snap=async()=>{if(await ask())setRetry(value=>value+1);};
 const signIn=()=>{const current=latest.current;if(current.locked||!current.onSignIn)return;setSheet(null);Keyboard.dismiss();current.onSignIn();};
 const save=async()=>{
  const current=latest.current;if(current.locked||current.busy||saving)return;
  try{builderDocument(current.value);}catch(error){setSaveError(routeErrorKey(error));return;}
  setSaving(true);setSaveError(null);const generation=current.ownerGeneration;
  try{const success=await current.onSave(current.value);if(latest.current.ownerGeneration===generation&&!latest.current.locked&&success){setSaved(true);setSheet(null);Keyboard.dismiss();}}
  catch(error){if(latest.current.ownerGeneration===generation)setSaveError(routeErrorKey(error));}
  finally{if(latest.current.ownerGeneration===generation)setSaving(false);}
 };
 const geometry=props.value.geometry,cachedRoad=geometry?.kind==='road'&&!hasSaveSource,roadBusy=needsRoad&&props.consent&&props.online!==false&&!locked&&(currentRoad?.loading??true);
 const time=geometry?.durationSeconds==null?'—':geometry.durationSeconds<3600?t('m4.minutes',{count:Math.max(1,Math.round(geometry.durationSeconds/60))}):t('m4.hours',{hours:Math.floor(geometry.durationSeconds/3600),minutes:Math.round(geometry.durationSeconds%3600/60)});
 const hint=props.value.stops.length===0?t('m4.tapStart'):props.value.stops.length===1?t('m4.tapFinish'):props.value.stops.length===12?t('m4.pinLimit'):t('m4.tapNext');
 const mapProblem=status.state==='unsupported'?mapCopy[language][status.reason==='webgl2'?'webgl':'nativeModule']:status.state==='error'||status.state==='degraded'&&status.reason==='tiles'?t('m2.map.mapError'):null;
 return <View style={[styles.full,{backgroundColor:colors.bg}]}>
  <MapSurface ref={map} theme={dark?'dark':'light'} locale={language} initialCamera={initialCamera} contentInsets={mapInsets} mode={locked?'glance':'edit'} reducedMotion={!motion} online={props.online!==false} retryToken={mapRetry}
   track={track} pins={pins} selectedPinId={selected} peers={noPeers} userFix={ride.userFix} onStatus={setStatus} onPress={add} onLongPress={add} onMovePin={move} onSelectPin={selectPin} onUserGesture={()=>{recenterIntent.current=false;}} />
  <Glass style={[styles.top,{top:insets.top+12}]}><Row><Pressable accessibilityRole="button" accessibilityLabel={t('m4.close')} onPress={props.onClose} style={styles.target}><Icon name="arrow-back-outline" /></Pressable><T size={18} weight="semibold" style={{flex:1}}>{t('m4.title')}</T>{props.onOpenSaved&&<Pressable accessibilityRole="button" accessibilityLabel={t('nav.routes')} onPress={props.onOpenSaved} style={styles.target}><Icon name="bookmarks-outline" /></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel={t('m4.undo')} disabled={locked||!historyDepth} onPress={()=>publish(undoBuilder)} style={[styles.target,{opacity:locked||!historyDepth?0.35:1}]}><Icon name="arrow-undo-outline" /></Pressable></Row><Pressable accessibilityRole="button" accessibilityLabel={t('m4.search')} disabled={locked} onPress={()=>{void openSearch();}} style={[styles.search,{borderTopColor:colors.line}]}><Icon name="search-outline" size={20} /><T muted style={{flex:1}}>{t('m4.search')}</T><Icon name="add-outline" size={18} /></Pressable></Glass>
  <Glass style={[styles.tools,{top:insets.top+146}]}><Pressable accessibilityRole="button" accessibilityLabel={t('m4.overview')} onPress={()=>map.current?.fitCoordinates(geometry?.segments.flat()??props.value.stops.map(stop=>stop.coordinate),{padding:mapInsets,maxZoom:15,durationMs:motion?300:0})} style={styles.target}><Icon name="scan-outline" /></Pressable>{props.onLocate&&<Pressable accessibilityRole="button" accessibilityLabel={t('m4.recenter')} onPress={recenter} style={styles.target}><Icon name="locate-outline" /></Pressable>}</Glass>
  <View style={[styles.panelDock,{bottom}]} onLayout={event=>setPanelHeight(event.nativeEvent.layout.height)}><Glass style={styles.bottom}>
   <Row style={{justifyContent:'space-between'}}><T size={12} muted style={{flex:1}}>{roadBusy?t('m4.calculating'):cachedRoad?t('m4.cachedRoad'):geometry?t(geometry.kind==='road'?'m4.road':'m4.recorded'):t('m4.unsnapped')}</T>{roadBusy?<ActivityIndicator color={colors.accent}/>:hasSaveSource?<Icon name="checkmark-circle-outline" color={colors.good} size={19}/>:null}</Row>
   {geometry&&<Row style={styles.metrics}><View style={{flex:1}}><T size={12} muted>{t('m4.distance')}</T><T size={24} weight="semibold">{geometry.distanceMeters==null?'—':`${(geometry.distanceMeters/1000).toLocaleString(language,{maximumFractionDigits:1})} km`}</T></View><View style={{flex:1}}><T size={12} muted>{t('m4.time')}</T><T size={21} weight="semibold">{time}</T></View></Row>}
   <Pressable accessibilityRole="button" accessibilityLabel={t('m4.stops')} disabled={locked} onPress={()=>setSheet('stops')} style={styles.stops}><Icon name="git-branch-outline" size={19}/><View style={{flex:1}}><T size={14} weight="medium">{selectedStop?.label??t('m4.stopCount',{count:props.value.stops.length})}</T><T size={11} muted>{hint}</T></View><Icon name="chevron-forward-outline" size={16}/></Pressable>
   {locked?<><T size={12} style={{color:colors.accentText}}>{t('m4.locked')}</T><Button small secondary label={t('m4.toMap')} onPress={props.onClose}/></>:<Row>{geometry?.kind!=='recorded'&&!hasSaveSource&&<Button style={{flex:1}} small secondary label={t('m4.snap')} disabled={!needsRoad||roadBusy||props.online===false} onPress={()=>{void snap();}}/>}<Button style={{flex:1}} small label={saved?t('m4.saved'):t('m4.save')} icon={saved?'checkmark-outline':'bookmark-outline'} disabled={!hasSaveSource||props.ready===false||props.busy} onPress={()=>{setSaveError(null);setSheet('save');}}/></Row>}
   {(currentRoad?.error||props.error)&&<T size={12} style={{color:colors.danger}}>{t(currentRoad?.error?currentRoad.error as ReturnType<typeof routeErrorKey>:routeErrorKey(props.error))}</T>}
   {!locked&&props.onSignIn&&(currentRoad?.error==='m4.error.auth'||props.error&&routeErrorKey(props.error)==='m4.error.auth')&&<Button small secondary label={t('common.signInOrCreate')} icon="log-in-outline" onPress={signIn}/>}
   {currentRoad?.error&&!locked&&<Pressable accessibilityRole="button" onPress={()=>{void snap();}} style={{minHeight:44,justifyContent:'center'}}><T size={13} weight="medium">{t('m4.retry')}</T></Pressable>}
   {props.online===false&&<T size={11} muted>{t('m4.offline')}</T>}
   {geometry?.kind==='road'&&<RoutingAttribution attribution={geometry.attribution} disabled={locked}/>}
   {mapProblem&&<T size={11} style={{color:colors.accentText}}>{mapProblem}</T>}
   {status.state==='error'&&<Button small secondary label={t('m2.map.retryMap')} onPress={()=>setMapRetry(value=>value+1)}/>}
  </Glass></View>
  <RouteSheet visible={sheet==='search'&&!locked} title={t('m4.search')} onClose={()=>setSheet(null)}>
   <Field label={t('m4.search')} value={query} onChangeText={value=>{searchGate.current.invalidate();searchIdentity.current=value.normalize('NFC').trim().replace(/\s+/gu,' ');setQuery(value);}} maxLength={120} autoFocus editable={!locked} placeholder={t('m4.searchHint')}/>
   <T size={12} muted>{t('m4.searchCoverage')}</T>
   {!props.consent&&<Button secondary label={t('m4.consentAccept')} onPress={()=>{void ask();}}/>}
   {search.loading?<ActivityIndicator color={colors.accent}/>:search.value?.items.map(item=><Pressable key={item.id} accessibilityRole="button" onPress={()=>{if(latest.current.locked)return;add({latitude:item.latitude,longitude:item.longitude},Array.from(item.label).slice(0,80).join(''),item.id);focus(item);setSheet(null);Keyboard.dismiss();}} style={[styles.searchResult,{borderBottomColor:colors.line}]}><Icon name="location-outline"/><View style={{flex:1}}><T weight="medium">{item.label}</T><T size={12} muted>{item.subtitle}</T></View><Icon name="add-outline"/></Pressable>)}
   {search.value&&!search.value.items.length&&<T muted>{t('m4.searchEmpty')}</T>}{search.error&&<T style={{color:colors.danger}}>{t(search.error as ReturnType<typeof routeErrorKey>)}</T>}{search.value&&<RoutingAttribution attribution={search.value.attribution} disabled={locked}/>}
   {search.error==='m4.error.auth'&&props.onSignIn&&<Button secondary label={t('common.signInOrCreate')} icon="log-in-outline" onPress={signIn}/>}
  </RouteSheet>
  <RouteSheet visible={sheet==='stops'&&!locked} title={t('m4.stops')} onClose={()=>setSheet(null)}>
   <Row><Button small secondary style={{flex:1}} label={t('m4.reverse')} disabled={pins.length<2} onPress={()=>publish(reverseBuilderStops)}/><Button small secondary style={{flex:1}} label={t('m4.roundTrip')} disabled={pins.length<2||pins.length>=12} onPress={()=>publish(state=>roundTripBuilder(state,randomUUID()))}/></Row>
   {props.value.stops.map((stop,index)=><View key={stop.id} style={{gap:8,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:colors.line,paddingBottom:16}}><Pressable accessibilityRole="button" onPress={()=>{setSelected(stop.id);focus(stop.coordinate);setSheet(null);}} style={styles.stopHeading}><View style={[styles.number,{backgroundColor:colors.accent}]}><T weight="semibold" size={13} style={{color:colors.onAccent}}>{index+1}</T></View><T weight="medium" style={{flex:1}}>{t(index===0?'m4.start':index===pins.length-1?'m4.finish':'m4.via',{number:index})}</T><Icon name="locate-outline" size={19}/></Pressable><Field label={t('m4.renameStop')} value={stop.label} maxLength={80} onChangeText={label=>{if(!latest.current.locked)latest.current.onChange({...latest.current.value,stops:latest.current.value.stops.map(value=>value.id===stop.id?{...value,label}:value)});}}/><Row><Button small secondary style={{flex:1}} label={t('m4.up')} disabled={index===0} onPress={()=>publish(state=>reorderBuilderStop(state,stop.id,-1))}/><Button small secondary style={{flex:1}} label={t('m4.down')} disabled={index===pins.length-1} onPress={()=>publish(state=>reorderBuilderStop(state,stop.id,1))}/><Pressable accessibilityRole="button" accessibilityLabel={t('m4.remove')} onPress={()=>publish(state=>removeBuilderStop(state,stop.id))} style={styles.target}><Icon name="trash-outline" color={colors.danger}/></Pressable></Row></View>)}
   {!pins.length&&<T muted>{t('m4.tapStart')}</T>}
  </RouteSheet>
  <RouteSheet visible={sheet==='save'&&!locked} title={t('m4.save')} onClose={()=>{if(!saving)setSheet(null);}}>
   <Field label={t('m4.name')} value={props.value.title} placeholder={t('m4.namePlaceholder')} maxLength={80} editable={!saving} onChangeText={title=>{if(!latest.current.locked)latest.current.onChange({...latest.current.value,title});}}/>
   <T weight="medium">{t('m4.visibility')}</T><Segments items={(['private','friends','public'] as const).map(value=>({value,label:t(`m4.${value}`)}))} value={props.value.visibility} onChange={visibility=>{if(!latest.current.locked&&!saving)latest.current.onChange({...latest.current.value,visibility});}}/>
   <T size={13} muted>{t(props.value.visibility==='private'?'m4.privateHint':'m4.shareHint')}</T>{(saveError||props.error)&&<T style={{color:colors.danger}}>{t(saveError?saveError as ReturnType<typeof routeErrorKey>:routeErrorKey(props.error))}</T>}<Button label={t('m4.save')} busy={saving||props.busy} disabled={!props.value.title.trim()||props.ready===false} onPress={()=>{void save();}}/>
   {props.onSignIn&&(saveError==='m4.error.auth'||props.error&&routeErrorKey(props.error)==='m4.error.auth')&&<Button secondary label={t('common.signInOrCreate')} icon="log-in-outline" onPress={signIn}/>}
  </RouteSheet>
 </View>;
}
const styles=StyleSheet.create({full:{flex:1},top:{position:'absolute',left:20,right:20,paddingHorizontal:6,paddingTop:2,paddingBottom:4},target:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'},search:{minHeight:48,flexDirection:'row',alignItems:'center',gap:12,borderTopWidth:StyleSheet.hairlineWidth,paddingHorizontal:16},tools:{position:'absolute',right:20,padding:2},panelDock:{position:'absolute',left:20,right:20},bottom:{padding:18,gap:12},metrics:{paddingVertical:2},stops:{flexDirection:'row',gap:12,alignItems:'center',minHeight:50},searchResult:{minHeight:64,paddingVertical:12,flexDirection:'row',gap:12,alignItems:'center',borderBottomWidth:StyleSheet.hairlineWidth},stopHeading:{flexDirection:'row',alignItems:'center',gap:12,minHeight:44},number:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'}});
