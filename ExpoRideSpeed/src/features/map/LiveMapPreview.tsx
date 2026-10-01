import {useEffect,useMemo,useRef,useState} from 'react';
import {View} from 'react-native';
import {router} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button,Glass,Row,T} from '../../components/ui';
import {useApp} from '../../state/AppState';
import {useI18n} from '../../lib/i18n';
import {useScreenActivity} from '../../lib/useScreenActivity';
import MapSurface from './ActiveMapSurface';
import {LiveFriendsRail} from './LiveFriendsRail';
import {previewSamples} from './previewSamples';
import type {MapHandle,MapPeer,MapStatus} from './MapSurface.types';
const camera={center:{latitude:13.7465,longitude:100.5399},zoom:15.6,bearing:-18,pitch:45};
export function LiveMapPreview(){
 const app=useApp(),{t,language}=useI18n(),insets=useSafeAreaInsets(),{active}=useScreenActivity(),map=useRef<MapHandle>(null);
 const [playing,setPlaying]=useState(true),[shown,setShown]=useState(true),[peers,setPeers]=useState<MapPeer[]>([]),[status,setStatus]=useState<MapStatus>({state:'loading'}),[retry,setRetry]=useState(0);
 const frame=useRef({sequence:0,step:0});
 useEffect(()=>{if(!active)return;const update=()=>{frame.current.sequence++;if(playing)frame.current.step++;setPeers(previewSamples(frame.current.sequence,frame.current.step,performance.now(),[1,2,3].map(number=>t('liveMap.previewRide',{number}))));};update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[active,playing,t]);
 const displayed=useMemo(()=>shown&&active?peers:[],[shown,active,peers]);
 const padding=useMemo(()=>({top:insets.top+160,right:84,bottom:insets.bottom+196,left:24}),[insets]);
 const focus=(id:string)=>{const peer=displayed.find(row=>row.id===id);if(peer)map.current?.setCamera({center:peer.coordinate,zoom:16.3,durationMs:app.motion?400:0});};
 return <View style={{flex:1,backgroundColor:app.colors.bg}}>
  <MapSurface ref={map} visible={active} theme={app.dark?'dark':'light'} locale={language} initialCamera={camera} contentInsets={padding} mode="browse" reducedMotion={!app.motion} online retryToken={retry} track={null} pins={[]} selectedPinId={null} peers={displayed} userFix={null} onStatus={setStatus} onSelectPeer={focus}/>
  <Glass style={{position:'absolute',top:insets.top+16,left:20,right:20,padding:14,gap:6}}><T size={11} weight="semibold" style={{color:app.colors.accentText}}>{t('liveMap.previewLabel')}</T><T size={23} weight="semibold">{t('liveMap.preview')}</T><T size={12} muted>{t('liveMap.previewBody')}</T></Glass>
  <View style={{position:'absolute',top:insets.top+175,right:20}}><LiveFriendsRail peers={displayed} onSelect={focus}/></View>
  <Glass style={{position:'absolute',bottom:insets.bottom+20,left:20,right:20,padding:16,gap:12}}>
   {status.state==='loading'&&<T muted size={12}>{t('m2.map.loading')}</T>}
   {['error','unsupported','degraded'].includes(status.state)&&<><T size={12}>{t('m2.map.mapError')}</T><Button small secondary label={t('common.retry')} onPress={()=>setRetry(value=>value+1)}/></>}
   <Row style={{gap:8}}><Button small style={{flex:1}} label={t(playing?'liveMap.pause':'liveMap.play')} icon={playing?'pause':'play'} onPress={()=>setPlaying(!playing)}/><Button small secondary style={{flex:1}} label={t(shown?'liveMap.hide':'liveMap.show')} onPress={()=>setShown(!shown)}/></Row>
   <Button small secondary label={t('liveMap.back')} onPress={()=>router.replace('/')}/>
  </Glass>
 </View>;
}
