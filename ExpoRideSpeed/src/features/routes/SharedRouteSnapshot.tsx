import React,{useEffect,useMemo,useRef,useState} from 'react';
import {View} from 'react-native';
import {Button,Note,Row,T} from '../../components/ui';
import {useApp} from '../../state/AppState';
import {useRide} from '../../state/RideState';
import {useI18n} from '../../lib/i18n';
import MapSurface from '../map/ActiveMapSurface';
import type {MapCamera,MapHandle,MapStatus} from '../map/MapSurface.types';
import {parseShareSnapshot} from './compatibilityModel';
const none=[] as const;
const insets={top:12,right:12,bottom:12,left:12};
/** Never accepts owner stops or draws an endpoint connector in a shared preview. */
export default function SharedRouteSnapshot({value,invitation=false,map:showMap=true}:{value:unknown;invitation?:boolean;map?:boolean}){
 const {dark,motion,colors}=useApp(),{movingLocked}=useRide(),{t,language}=useI18n();
 const snapshot=useMemo(()=>parseShareSnapshot(value),[value]),geometry=snapshot?.geometry;
 const map=useRef<MapHandle>(null),[status,setStatus]=useState<MapStatus>({state:'loading'});
 const [expanded,setExpanded]=useState(false),[retry,setRetry]=useState(0);
 const segments=geometry?.segments??none;
 const camera=useMemo<MapCamera>(()=>({center:segments[0]?.[0]??{latitude:15.6,longitude:101.1},zoom:12,bearing:0,pitch:0}),[segments]);
 const fitted=useRef<typeof segments|null>(null);
 useEffect(()=>{const handle=map.current;if(handle&&status.state==='ready'&&segments.length&&fitted.current!==segments){handle.fitCoordinates(segments.flat(),{padding:insets,maxZoom:15,durationMs:0});fitted.current=segments;}},[status.state,segments]);
 if(!snapshot)return <Note error>{t('m4.compatibility.invalid')}</Note>;
 return <View style={{gap:12}}><Row style={{justifyContent:'space-between',flexWrap:'wrap'}}><T size={18} weight="semibold">{snapshot.title}</T><T size={12} muted>{t('m4.compatibility.revision',{revision:snapshot.revision,category:t(`m4.compatibility.category.${snapshot.category}`)})}</T></Row>
  {!geometry?<Note>{t('m4.compatibility.unavailable')}</Note>:geometry.geometryStatus==='hidden'?<Note>{t('m4.compatibility.hidden')}</Note>:<>
   {(showMap||expanded)?<View style={{height:220,borderRadius:20,overflow:'hidden',backgroundColor:colors.bg}}><MapSurface ref={map} theme={dark?'dark':'light'} locale={language} initialCamera={camera} contentInsets={insets} mode={movingLocked?'glance':'browse'} reducedMotion={!motion} online retryToken={retry} track={{kind:geometry.provider==='geoapify'?'road':'recorded',segments}} pins={none} selectedPinId={null} peers={none} userFix={null} onStatus={setStatus}/></View>:<Button small secondary label={t('m4.sharePreview')} disabled={movingLocked} onPress={()=>setExpanded(true)}/>}
   {(status.state==='error'||status.state==='unsupported'||status.state==='degraded')&&<Note>{t('m2.map.mapError')}</Note>}
   {status.state==='error'&&<Button small secondary label={t('common.retry')} disabled={movingLocked} onPress={()=>setRetry(value=>value+1)}/>}
   <T muted size={12}>{t('m4.compatibility.trimmed')}</T><T muted size={12}>{t('m4.compatibility.segmentCount',{count:segments.length})}</T>
  </>}
  {geometry?.attribution&&<T size={11} muted>{geometry.attribution}</T>}
  {invitation&&geometry&&<T muted size={12}>{t('m4.compatibility.snapshot')}</T>}
 </View>;
}
