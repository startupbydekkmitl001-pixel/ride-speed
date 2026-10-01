import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {Button,Note,Row,T} from '../../components/ui';
import {useI18n} from '../../lib/i18n';
import {useScreenActivity} from '../../lib/useScreenActivity';
import {useApp} from '../../state/AppState';
import MapSurface from '../map/ActiveMapSurface';
import type {MapHandle,MapStatus} from '../map/MapSurface.types';
import {RouteSheet} from '../routes/RouteSheet';
import {RoutingAttribution} from '../routes/RoutingAttribution';
import type {CommunityPost} from './types';
import {communityPostBinding,type CommunityPostActions,type CommunityTranslator} from './uiTypes';
const none=[] as const,padding={top:20,right:20,bottom:20,left:20};
/** Only the server's trimmed fragments. No GPS, private stops or road requests. */
export function CommunityRoutePreview({post,port,t,onClose}:{post:CommunityPost|null;port:CommunityPostActions;t:CommunityTranslator;onClose:()=>void}){
 const {colors,dark,motion}=useApp(),{language}=useI18n(),activity=useScreenActivity(),map=useRef<MapHandle>(null),fitted=useRef<string|null>(null),latest=useRef({port,post}),tickets=useRef(new WeakMap<object,number|null>());
 const [status,setStatus]=useState<{key:string;value:MapStatus}|null>(null),[retry,setRetry]=useState(0);
 useLayoutEffect(()=>{latest.current={port,post};},[port,post]);
 const route=post?.route,key=post?`${port.generation}:${post.post_id}:${post.content_revision}:${route?.geometryHash}`:null;
 const coordinates=useMemo(()=>route?.geometryStatus==='trimmed'?route.segments.flat():[],[route]);
 const ticket={};useLayoutEffect(()=>{tickets.current.set(ticket,activity.capture());});
 const current=()=>activity.accepts(tickets.current.get(ticket)??null)&&!!post&&latest.current.post===post&&latest.current.port.current(port.generation)&&latest.current.port.postCurrent(communityPostBinding(post));
 const show=!!key&&!!post&&!!route&&route.geometryStatus==='trimmed'&&coordinates.length>1&&port.current(port.generation)&&port.postCurrent(communityPostBinding(post))&&activity.active&&!port.gate.moving;
 const state=status?.key===key?status.value:{state:'loading' as const};
 useEffect(()=>{if(show&&state.state==='ready'&&current()&&map.current&&fitted.current!==key){map.current.fitCoordinates(coordinates,{padding,maxZoom:16,durationMs:0});fitted.current=key;}});
 return <RouteSheet visible={show} title={route?.title??t('m7.routeOutline')} onClose={onClose}>{show&&route&&<>
  <T muted>{t('m7.privacyTrim')}</T><View accessibilityLabel={t('m7.routeOutline')} style={{height:360,borderRadius:24,overflow:'hidden',backgroundColor:colors.bg}}>
   <MapSurface key={key} ref={map} visible={show} theme={dark?'dark':'light'} locale={language} initialCamera={{center:coordinates[0],zoom:12,bearing:0,pitch:0}} contentInsets={padding} mode="browse" reducedMotion={!motion} online={port.gate.online} retryToken={retry} track={{kind:route.provider==='geoapify'?'road':route.provider==='recorded'?'recorded':'draft',segments:route.segments}} pins={none} selectedPinId={null} peers={none} userFix={null} onStatus={value=>{if(current())setStatus({key:key!,value});}}/>
  </View><View accessibilityLiveRegion="polite" style={{gap:10}}>{state.state==='loading'&&<Row><ActivityIndicator color={colors.accent}/><T>{t('m7.loading')}</T></Row>}{(!port.gate.online||state.state==='degraded')&&<Note>{t('m7.offline')}</Note>}{(state.state==='error'||state.state==='unsupported')&&<Note error>{t('m7.unavailable')}</Note>}{(state.state==='error'||state.state==='degraded')&&<Button secondary label={t('m7.refresh')} disabled={!port.gate.online} onPress={()=>{if(current()&&!latest.current.port.gate.moving){fitted.current=null;setStatus({key:key!,value:{state:'loading'}});setRetry(value=>value+1);}}}/>}</View>
  {route.provider==='geoapify'&&<RoutingAttribution attribution={route.attribution}/>}<Button secondary label={t('m7.close')} onPress={onClose}/>
 </>}</RouteSheet>;
}
