import type {GeoJSONSourceRef} from '@maplibre/maplibre-react-native';
import {memo,useLayoutEffect,useRef,useState} from 'react';
import Animated,{cancelAnimation,Easing,ReduceMotion,useAnimatedProps,useSharedValue,withDelay,withTiming} from 'react-native-reanimated';
import type {MapPeer} from './MapSurface.types';
import {mapIds,overlayLayers,peerClusterOptions} from './overlays';
import {PeerPresentation,samplePresentation,type PresentedPeer} from './peerPresentation';

type Runtime=typeof import('@maplibre/maplibre-react-native');
const empty:GeoJSON.FeatureCollection={type:'FeatureCollection',features:[]};
/** JSON is written directly to the SDK's animatable native ref, on the UI thread. */
export const NativePeerSource=memo(function NativePeerSource({runtime,peers,reducedMotion,layers,sourceRef,onPress}:{
  runtime:Runtime;peers:readonly MapPeer[];reducedMotion:boolean;layers:ReturnType<typeof overlayLayers>;
  sourceRef:React.Ref<GeoJSONSourceRef>;onPress:React.ComponentProps<Runtime['GeoJSONSource']>['onPress'];
}){
  const [Source]=useState(()=>Animated.createAnimatedComponent(runtime.GeoJSONSource));
  const history=useRef(new PeerPresentation());
  const frame=useSharedValue<readonly PresentedPeer[]>([]),clock=useSharedValue(0),visible=useSharedValue(0);
  useLayoutEffect(()=>{
    cancelAnimation(clock);cancelAnimation(visible);
    const now=performance.now(),next=history.current.update(peers,now,reducedMotion);
    frame.value=next;clock.value=now;visible.value=next.length?1:0;
    const deadline=Math.min(...next.flatMap(row=>row.motion?[row.motion.expiresMonotonicMs]:[]));
    const finish=Math.max(now,...next.flatMap(row=>row.motion?[row.motion.startMonotonicMs+row.motion.durationMs]:[]));
    if(!reducedMotion&&finish>now)clock.value=withTiming(finish,{duration:finish-now,easing:Easing.linear,reduceMotion:ReduceMotion.Never});
    // The UI thread also expires the source when JavaScript is busy. The provider
    // removes expired rows and supplies the next frame independently.
    if(Number.isFinite(deadline))visible.value=withDelay(Math.max(0,deadline-now),withTiming(0,{duration:0,reduceMotion:ReduceMotion.Never}),ReduceMotion.Never);
    return()=>{cancelAnimation(clock);cancelAnimation(visible);visible.value=0;};
  },[peers,reducedMotion,frame,clock,visible]);
  const animatedProps=useAnimatedProps(()=>({data:JSON.stringify(visible.value?samplePresentation(frame.value,clock.value):empty)}));
  const {Layer}=runtime;
  return <Source id={mapIds.peers} ref={sourceRef} data={empty} animatedProps={animatedProps} {...peerClusterOptions} onPress={onPress}>
    {layers.map(layer=><Layer key={layer.id} {...layer}/>)}
  </Source>;
});
