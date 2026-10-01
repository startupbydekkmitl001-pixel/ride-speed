import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Glass, Icon, Row, T } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { routeErrorKey } from '../../lib/i18n/m4';
import { useApp } from '../../state/AppState';
import { useRide } from '../../state/RideState';
import MapSurface from '../map/MapSurface';
import type { MapCamera, MapHandle, MapPin, MapStatus } from '../map/MapSurface.types';
import type { RouteLocalGeometry } from './localModel';
import type { RouteDocumentV1, RouteProjection } from './syncTypes';
import { RouteSheet } from './RouteSheet';
import { RoutingAttribution } from './RoutingAttribution';
export type RouteDetailItem={kind:'owner';document:RouteDocumentV1;geometry:RouteLocalGeometry|null;synced:boolean}|{kind:'shared';route:RouteProjection};
export type RouteDetailProps={item:RouteDetailItem;onClose:()=>void;onEdit?:()=>void;onDelete?:()=>Promise<boolean>;onPreviewShare?:()=>void;busy?:boolean;error?:string|null;online?:boolean;bottomOffset?:number};
const none=[] as const;
export default function RouteDetail({item,onClose,onEdit,onDelete,onPreviewShare,busy,error,online,bottomOffset=88}:RouteDetailProps){
 const {colors,dark,motion}=useApp(),{t,language}=useI18n(),ride=useRide(),insets=useSafeAreaInsets();
 const map=useRef<MapHandle>(null),[status,setStatus]=useState<MapStatus>({state:'loading'}),[confirm,setConfirm]=useState(false),[deleting,setDeleting]=useState(false);
 const [panelHeight,setPanelHeight]=useState(280);
 const owner=item.kind==='owner',title=owner?item.document.title:item.route.title,visibility=owner?item.document.visibility:item.route.visibility;
 const geometry=owner?item.geometry:item.route,segments=geometry?.segments??none;
 const provider=geometry?.provider??'draft';
 const pins=useMemo<MapPin[]>(()=>item.kind==='owner'?item.document.stops.map((stop,index)=>({id:`detail-${index}`,label:stop.label,coordinate:{latitude:stop.lat,longitude:stop.lng},order:index+1,role:index===0?'start':index===item.document.stops.length-1?'finish':'via'})):[],[item]);
 const mapInsets=useMemo(()=>({top:insets.top+88,left:24,right:24,bottom:insets.bottom+bottomOffset+panelHeight+24}),[insets.top,insets.bottom,bottomOffset,panelHeight]);
 const [initial]=useState<MapCamera>(()=>({center:segments[0]?.[0]??pins[0]?.coordinate??{latitude:15.6,longitude:101.1},zoom:segments.length||pins.length?12:4.5,bearing:0,pitch:0}));
 const track=useMemo(()=>provider==='draft'?null:{kind:provider==='geoapify'?'road' as const:'recorded' as const,segments},[provider,segments]);
 useEffect(()=>{if(status.state==='ready')map.current?.fitCoordinates(segments.flat().length?segments.flat():pins.map(pin=>pin.coordinate),{padding:mapInsets,maxZoom:15,durationMs:0});},[status.state,segments,pins,mapInsets]);
 const locked=ride.movingLocked,metrics=owner&&item.geometry?item.geometry:null;
 const remove=async()=>{if(locked||deleting||!onDelete)return;setDeleting(true);try{if(await onDelete())setConfirm(false);}finally{setDeleting(false);}};
 return <View style={[styles.full,{backgroundColor:colors.bg}]}>
  <MapSurface ref={map} theme={dark?'dark':'light'} locale={language} initialCamera={initial} contentInsets={mapInsets} mode={locked?'glance':'browse'} reducedMotion={!motion} online={online!==false} retryToken={0} track={track} pins={pins} selectedPinId={null} peers={none} userFix={ride.userFix} onStatus={setStatus}/>
  <Glass style={[styles.top,{top:insets.top+12}]}><Pressable accessibilityRole="button" accessibilityLabel={t('m4.close')} onPress={onClose} style={styles.target}><Icon name="arrow-back-outline"/></Pressable><T size={16} weight="semibold" numberOfLines={2} style={{flex:1}}>{title}</T><Pressable accessibilityRole="button" accessibilityLabel={t('m4.overview')} onPress={()=>map.current?.fitCoordinates(segments.flat().length?segments.flat():pins.map(pin=>pin.coordinate),{padding:mapInsets,maxZoom:15,durationMs:motion?300:0})} style={styles.target}><Icon name="scan-outline"/></Pressable></Glass>
  <View style={[styles.panelDock,{bottom:insets.bottom+bottomOffset}]} onLayout={event=>setPanelHeight(event.nativeEvent.layout.height)}><Glass style={styles.bottom}><ScrollView scrollEnabled={!locked} contentContainerStyle={{gap:14}}>
   <Row style={{justifyContent:'space-between'}}><T size={12} muted>{t(provider==='draft'?'m4.unsnapped':provider==='geoapify'?'m4.road':'m4.recorded')}</T><Row><Icon name={visibility==='private'?'lock-closed-outline':visibility==='friends'?'people-outline':'globe-outline'} size={16}/><T size={12}>{t(`m4.${visibility}`)}</T></Row></Row>
   <T size={26} weight="semibold">{title}</T>
   {metrics&&<Row><View style={{flex:1}}><T size={12} muted>{t('m4.distance')}</T><T size={22} weight="semibold">{metrics.distanceMeters===null?'—':`${(metrics.distanceMeters/1000).toLocaleString(language,{maximumFractionDigits:1})} km`}</T></View><View style={{flex:1}}><T size={12} muted>{t('m4.time')}</T><T size={22} weight="semibold">{metrics.durationSeconds===null?'—':t('m4.minutes',{count:Math.max(1,Math.round(metrics.durationSeconds/60))})}</T></View></Row>}
   {provider==='geoapify'&&owner&&<T size={11} muted>{t('m4.freeFlow')}</T>}
   {item.kind==='shared'&&<T size={12} muted>{t(item.route.geometryStatus==='hidden'?'m4.hiddenGeometry':'m4.sharedGeometry')}</T>}
   {owner&&<><T size={12} muted>{t(item.synced?'m4.synced':'m4.localSaved')}</T><T size={12} muted>{t(visibility==='private'?'m4.privateHint':'m4.shareHint')}</T></>}
   {provider==='geoapify'?<RoutingAttribution attribution={geometry?.attribution} disabled={locked}/>:geometry?.attribution&&<T size={10} muted>{geometry.attribution}</T>}
   {error&&<T size={12} style={{color:colors.danger}}>{t(routeErrorKey(error))}</T>}
   {locked?<><T size={12} style={{color:colors.accentText}}>{t('m4.locked')}</T><Button secondary small label={t('m4.toMap')} onPress={onClose}/></>:<>{owner&&onEdit&&<Button label={t('m4.edit')} icon="pencil-outline" disabled={busy} onPress={onEdit}/>} {owner&&onPreviewShare&&<Button secondary small label={t('m4.sharePreview')} disabled={busy||!item.synced||visibility==='private'} onPress={onPreviewShare}/>} {owner&&onDelete&&<Pressable accessibilityRole="button" onPress={()=>setConfirm(true)} disabled={busy} style={{minHeight:44,alignItems:'center',justifyContent:'center'}}><T size={13} style={{color:colors.danger}}>{t('m4.delete')}</T></Pressable>}</>}
  </ScrollView></Glass></View>
  <RouteSheet visible={confirm&&!locked} title={t('m4.delete')} onClose={()=>{if(!deleting)setConfirm(false);}}><T>{t('m4.deleteConfirm',{name:title})}</T><Button busy={deleting||busy} label={t('m4.delete')} onPress={()=>{void remove().catch(()=>{});}}/><Button secondary label={t('m4.cancel')} disabled={deleting} onPress={()=>setConfirm(false)}/></RouteSheet>
 </View>;
}
const styles=StyleSheet.create({full:{flex:1},top:{position:'absolute',left:20,right:20,flexDirection:'row',alignItems:'center',gap:8,padding:6},target:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},panelDock:{position:'absolute',left:20,right:20,maxHeight:'56%'},bottom:{padding:20,flexShrink:1,minHeight:0}});
