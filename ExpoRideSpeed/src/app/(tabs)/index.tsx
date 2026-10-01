import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { router,useFocusEffect } from 'expo-router';
import { ActivityIndicator,Platform,Pressable,ScrollView,StyleSheet,View,useWindowDimensions } from 'react-native';
import * as Location from 'expo-location';
import * as Orientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass,Icon,Button,Note,Row,T,type IconName } from '../../components/ui';
import { GlassGroup } from '../../components/glass';
import MapSurface from '../../features/map/ActiveMapSurface';
import type { MapHandle,MapStatus,MapCamera,MapTrack,MapPin } from '../../features/map/MapSurface.types';
import { SpeedometerHUD } from '../../features/speedometer';
import { OnboardingEntry } from '../../features/onboarding';
import { useApp } from '../../state/AppState';
import { useRide } from '../../state/RideState';
import { useOnline } from '../../state/OnlineState';
import { useAuth } from '../../state/AuthState';
import { useLive } from '../../state/LiveState';
import { useGarage } from '../../state/GarageState';
import { LiveFriendsRail } from '../../features/map/LiveFriendsRail';
import { errorKey,useI18n,type TranslationKey } from '../../lib/i18n';
import {useScreenActivity} from '../../lib/useScreenActivity';
const initialCamera:MapCamera={center:{latitude:13.7563,longitude:100.5018},zoom:11,bearing:0,pitch:0};
const noPins:MapPin[]=[];
const fixAge=(timestamp:number)=>Date.now()-timestamp;
function MapControl({label,icon,onPress,disabled=false,primary=false}:{label:string;icon:IconName;onPress:()=>void;disabled?:boolean;primary?:boolean}){
 const {colors}=useApp();
 return <Glass style={{borderRadius:28}}><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>({width:52,height:52,alignItems:'center',justifyContent:'center',backgroundColor:primary?colors.accent:undefined,opacity:disabled?.4:pressed?.6:1})}><Icon name={icon} color={primary?colors.onAccent:undefined}/></Pressable></Glass>;
}
function MapHome(){
 const app=useApp(),ride=useRide(),online=useOnline(),live=useLive(),{t,language}=useI18n(),insets=useSafeAreaInsets();
 const garage=useGarage(),vehicle=garage.vehicles.find(row=>row.id===garage.activeId);
 const {active:screenActive,current:screenCurrent,capture,accepts}=useScreenActivity();
 const map=useRef<MapHandle>(null),centered=useRef(false),follow=useRef(false),idleController=useRef<AbortController|null>(null);
 const [status,setStatus]=useState<MapStatus>({state:'loading'}),[retry,setRetry]=useState(0),[expanded,setExpanded]=useState(false),[layers,setLayers]=useState(false),[permission,setPermission]=useState<TranslationKey|null>(null);
 const {width,height,fontScale}=useWindowDimensions();
 const sidePanel=Platform.OS==='web'&&!expanded&&width>=720&&height<640;
 const panelWidth=Math.min(fontScale>1.3?524:360,Math.max(280,width-408));
 const panelInset=92+panelWidth+12;
 const moving=ride.movingLocked;
 const iconTerminals=sidePanel&&moving&&(fontScale>2||(fontScale>1.3&&panelWidth<524&&!ride.active&&!!ride.ride&&ride.ride.status!=='complete'));
 const iconPause=iconTerminals||(sidePanel&&ride.active&&fontScale>1.3&&fontScale<=2&&panelWidth<524);
 const stackedRideControls=sidePanel&&!iconPause&&(fontScale>2||panelWidth<(fontScale>1.3?524:328));
 const onlineCount=online.presence.filter(row=>row.online).length;
 const captureMessage=ride.message?errorKey(ride.message,'ride'):null;
 const {ready:rideReady,locate:locateOnce}=ride;
 useFocusEffect(useCallback(()=>{const controller=new AbortController();idleController.current=controller;if(!expanded&&rideReady&&screenCurrent())void locateOnce(controller.signal);return()=>{controller.abort();if(idleController.current===controller)idleController.current=null;};},[rideReady,locateOnce,screenCurrent,expanded]));
 useEffect(()=>{const fix=ride.userFix;if(!fix)return;if(!centered.current||follow.current){centered.current=true;map.current?.setCamera({center:fix.coordinate,zoom:15,durationMs:app.motion?550:0});}},[ride.userFix,app.motion]);
 useEffect(()=>{if(Platform.OS==='web')return;void(expanded&&screenActive?Orientation.unlockAsync():Orientation.lockAsync(Orientation.OrientationLock.PORTRAIT_UP)).catch(()=>{});return()=>{void Orientation.lockAsync(Orientation.OrientationLock.PORTRAIT_UP).catch(()=>{});};},[expanded,screenActive]);
 const fragments=ride.ride?.fragments;
 const track=useMemo<MapTrack|null>(()=>fragments?.length?{kind:'recorded',segments:fragments.map(f=>f.points)}:null,[fragments]);
 const bottom=insets.bottom+92;
 const contentInsets=useMemo(()=>({top:insets.top+90,right:sidePanel?panelInset:20,bottom:sidePanel?bottom:bottom+260,left:20}),[insets.top,bottom,sidePanel,panelInset]);
 const onUserGesture=useCallback(()=>{follow.current=false;},[]);
 const focusPeer=(id:string)=>{if(!screenCurrent())return;const peer=live.peers.find(row=>row.id===id);if(!peer||peer.sample&&performance.now()>=peer.sample.expiresMonotonicMs)return;follow.current=false;map.current?.setCamera({center:peer.coordinate,zoom:16,pitch:40,durationMs:app.motion?450:0});};
 const zoom=async(delta:number)=>{const ticket=capture(),current=await map.current?.getCamera();if(current&&accepts(ticket))map.current?.setCamera({zoom:Math.max(0,Math.min(22,current.zoom+delta)),durationMs:app.motion?260:0});};
 const recenter=()=>{if(moving&&!ride.active){void ride.locate(idleController.current?.signal);return;}const fix=ride.userFix,age=fix?fixAge(fix.timestampMs):Infinity;if(fix&&age>=0&&age<15000&&screenCurrent()){follow.current=true;map.current?.setCamera({center:fix.coordinate,zoom:15,durationMs:app.motion?400:0});}else if(!moving)void locate();};
 const locate=async()=>{const ticket=capture(),signal=idleController.current?.signal;if(moving||!accepts(ticket)||signal?.aborted)return;follow.current=true;setPermission(null);try{const p=await Location.requestForegroundPermissionsAsync();if(!accepts(ticket)||signal?.aborted)return;if(!p.granted){setPermission('m2.map.locationDenied');return;}if(Platform.OS==='ios'&&p.ios?.accuracy==='reduced'){setPermission('m2.map.preciseRequired');return;}await ride.locate(signal);if(accepts(ticket)&&ride.userFix)map.current?.setCamera({center:ride.userFix.coordinate,zoom:15,durationMs:app.motion?400:0});}catch{if(accepts(ticket)&&!signal?.aborted)setPermission('m2.map.locationDenied');}};
 const onStatus=useCallback((value:MapStatus)=>setStatus(value),[]);
 const pauseRide=()=>{void ride.pause().catch(()=>setPermission('m2.ride.stopError'));};
 const compactControls=<Row style={{gap:8,...(iconTerminals?{justifyContent:'space-between' as const}:{}),...(stackedRideControls?{flexDirection:'column' as const,alignItems:'stretch' as const}:{})}}>
  {ride.active?<>
   {iconPause?<MapControl label={t('m2.ride.pause')} icon="pause" disabled={ride.busy} onPress={pauseRide}/>:<Button secondary style={stackedRideControls?undefined:{flex:1}} label={t('m2.ride.pause')} icon="pause" busy={ride.busy} onPress={pauseRide}/>}
   {iconTerminals?<MapControl primary label={t('m2.ride.finish')} icon="stop" disabled={ride.busy} onPress={()=>{void ride.finish();}}/>:<Button style={stackedRideControls?undefined:{flex:1}} label={t('m2.ride.finish')} icon={iconPause?undefined:'stop'} busy={ride.busy} onPress={()=>{void ride.finish();}}/>}
  </>:iconTerminals?<MapControl label={t(ride.ride&&ride.ride.status!=='complete'?'m2.ride.resume':'m2.ride.start')} icon="play" disabled={ride.busy||!ride.ready||!!ride.error} onPress={()=>{void ride.start();}}/>:<Button style={stackedRideControls?undefined:{flex:1}} label={t(ride.ride&&ride.ride.status!=='complete'?'m2.ride.resume':'m2.ride.start')} icon="play" busy={ride.busy} disabled={!ride.ready||!!ride.error} onPress={()=>{void ride.start();}}/>}
  {!ride.active&&ride.ride&&ride.ride.status!=='complete'&&(iconTerminals?<MapControl primary label={t('m2.ride.finish')} icon="stop" disabled={ride.busy} onPress={()=>{void ride.finish();}}/>:<Button secondary label={t('m2.ride.finish')} busy={ride.busy} onPress={()=>{void ride.finish();}}/>)}
 </Row>;
 const captureNotice=(permission||ride.error||captureMessage||status.state==='error'||status.state==='unsupported'||status.state==='degraded')&&<View style={{backgroundColor:app.colors.bg,borderRadius:16,padding:12,gap:8}}><T size={13}>{t(permission??(ride.error as TranslationKey)??captureMessage??'m2.map.mapError')}</T><Button small secondary label={t('common.retry')} onPress={()=>{setPermission(null);setRetry(n=>n+1);void ride.retrySave();}}/></View>;
 const recoveryNotice=ride.ride?.status==='interrupted'&&<Note>{t('m2.ride.recoveryBody')}</Note>;
 const instrument=<SpeedometerHUD snapshot={ride.snapshot} metrics={ride.metrics} units={app.data.unit} expanded={expanded} glanceOnly={sidePanel&&moving} backgroundMotionAllowed={!moving} onToggleExpanded={()=>setExpanded(v=>!v)} onUnitsChange={unit=>app.update({unit})}/>;
 const routeActions=!expanded&&<Row style={{gap:8}}><Button small secondary style={{flex:1}} label={t('m2.map.planRoute')} icon="git-branch-outline" disabled={moving} onPress={()=>router.push('/routes')}/><Button small secondary style={{flex:1}} label={t('m2.map.challenge')} icon="flag-outline" disabled={moving} onPress={()=>router.push('/races')}/></Row>;
 const foregroundNotice=<T size={11} style={{textAlign:'center',color:app.colors.muted}}>{t(moving&&!ride.active?'m2.ride.checkStoppedHint':'m2.ride.foregroundOnly')}</T>;
 const layerControls=<View style={{backgroundColor:app.colors.surface,borderRadius:24,padding:20,gap:12,borderWidth:1,borderColor:app.colors.line}}><T weight="semibold">{t('m2.map.layers')}</T><T muted size={13}>{t('m2.map.baseStyle')}</T><Button small label={t(app.dark?'profile.themeLight':'profile.themeDark')} onPress={()=>{app.update({theme:app.dark?'light':'dark'});setLayers(false);}}/><Button small secondary label={t('m2.map.close')} onPress={()=>setLayers(false)}/></View>;
 return <View style={{flex:1,backgroundColor:app.colors.bg}}>
  <View pointerEvents={expanded?'none':'auto'} accessibilityElementsHidden={expanded} importantForAccessibility={expanded?'no-hide-descendants':'auto'} style={[StyleSheet.absoluteFill,{opacity:expanded?0:1}]}><MapSurface ref={map} visible={!expanded} theme={app.dark?'dark':'light'} locale={language} initialCamera={initialCamera} contentInsets={contentInsets} mode={moving?'glance':'browse'} reducedMotion={!app.motion} online={true} retryToken={retry} track={track} pins={noPins} selectedPinId={null} peers={live.peers} userFix={ride.userFix} vehicleCategory={vehicle?.category} onStatus={onStatus} onUserGesture={onUserGesture} onSelectPeer={focusPeer}/></View>
  {!expanded&&<>
   <View pointerEvents="box-none" style={{position:'absolute',top:insets.top+16,left:20,right:sidePanel?panelInset:20,gap:12}}>
    <Glass style={{borderRadius:28}}><Pressable accessibilityRole="button" accessibilityLabel={t('m2.map.planRoute')} disabled={moving} onPress={()=>router.push('/routes')} style={{minHeight:56,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:12}}><Icon name="search-outline"/><T muted style={{flex:1}}>{t('m2.map.planRoute')}</T><Icon name="arrow-forward" size={18}/></Pressable></Glass>
    {status.state==='loading'&&<Row><ActivityIndicator color={app.colors.accent}/><T size={12} muted>{t('m2.map.loading')}</T></Row>}
    {!sidePanel&&<Pressable accessibilityRole="button" accessibilityLabel={t('liveMap.vehicle')} disabled={moving} onPress={()=>router.push('/map-vehicle')} style={{alignSelf:'flex-start',maxWidth:'75%',minHeight:44,flexDirection:'row',gap:8,alignItems:'center',backgroundColor:app.colors.glassScrim,borderRadius:22,paddingHorizontal:14}}><Icon name={vehicle?.category==='car'?'car-sport-outline':'bicycle-outline'} size={18}/><T size={12} numberOfLines={1} style={{flexShrink:1}}>{vehicle?.nickname||vehicle?.model||t('liveMap.noVehicle')}</T><Icon name="chevron-down" size={12}/></Pressable>}
   </View>
   <View pointerEvents="box-none" style={{position:'absolute',top:insets.top+(sidePanel?96:152),left:20}}><Glass style={{borderRadius:28}}><GlassGroup style={{gap:12}}><View><MapControl label={onlineCount?t('m5a.mapLoadedOnline',{count:onlineCount}):t('m2.map.friendsOnline')} icon="people-outline" disabled={moving} onPress={()=>router.push('/friends')}/>{!!onlineCount&&<View style={{position:'absolute',top:-3,right:-3,borderRadius:10,backgroundColor:app.colors.good,paddingHorizontal:5}}><T numeric size={11} style={{color:app.colors.bg}}>{onlineCount}</T></View>}</View><MapControl label={t('m5b.convoy')} icon="navigate-outline" disabled={moving} onPress={()=>router.push('/convoy')}/>{live.incomingFriendIntent&&<MapControl label={t('m5b.reviewLink')} icon="qr-code-outline" disabled={moving} onPress={()=>router.push('/friend-links')}/>}</GlassGroup></Glass></View>
   <View pointerEvents="box-none" style={{position:'absolute',top:insets.top+96,right:20}}><Glass style={{borderRadius:28}}><GlassGroup style={{gap:8}}>
    <LiveFriendsRail peers={live.peers} onSelect={focusPeer} limit={sidePanel?0:Math.min(3,Math.max(0,Math.floor((height-bottom-500)/60)))}/>
    <MapControl label={t(moving&&!ride.active?'m2.ride.checkStopped':'m2.map.recenter')} icon="locate-outline" disabled={ride.locating||(moving&&ride.active&&!ride.userFix)} onPress={recenter}/>
    <MapControl label={t('liveMap.zoomIn')} icon="add" onPress={()=>{void zoom(1);}}/>
    <MapControl label={t('liveMap.zoomOut')} icon="remove" onPress={()=>{void zoom(-1);}}/>
    <MapControl label={t('m2.map.layers')} icon="layers-outline" disabled={moving} onPress={()=>setLayers(!layers)}/>
    {!sidePanel&&<MapControl label={t('m2.ride.history')} icon="time-outline" disabled={moving} onPress={()=>router.push('/ride-history')}/>}
   </GlassGroup></Glass></View>
  </>}
  {expanded&&<View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:app.colors.bg}]}/>}
  {sidePanel?<View pointerEvents="box-none" style={{position:'absolute',top:insets.top+16,right:92,width:panelWidth,bottom:bottom}}>
   {moving&&instrument}
   <ScrollView style={{flex:1,minHeight:0}} contentContainerStyle={{gap:12}} scrollEnabled={!moving} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">{!moving&&instrument}{layers&&layerControls}{captureNotice}{recoveryNotice}{routeActions}{foregroundNotice}</ScrollView>
   <View style={{gap:12,paddingTop:12,flexShrink:0}}>{compactControls}</View>
  </View>:<View pointerEvents="box-none" style={{position:'absolute',left:20,right:20,bottom:bottom,gap:12,...(expanded?{top:insets.top+12,justifyContent:'center' as const}:{})}}>
   {captureNotice}{recoveryNotice}{instrument}{compactControls}{routeActions}{foregroundNotice}
  </View>}
  {layers&&!sidePanel&&<View style={{position:'absolute',top:insets.top+165,left:20,right:84}}>{layerControls}</View>}
 </View>;
}
export default function MapScreen(){const {scope}=useAuth();return <OnboardingEntry><MapHome key={scope.generation}/></OnboardingEntry>;}
