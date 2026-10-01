import {useEffect,useMemo,useState} from 'react';
import {View} from 'react-native';
import {Canvas,Oval,Vertices} from '@shopify/react-native-skia';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import {cancelAnimation,useDerivedValue,useSharedValue,withSpring} from 'react-native-reanimated';
import {IconButton,Row,T} from '../../components/ui';
import {useApp} from '../../state/AppState';
import {useI18n} from '../../lib/i18n';
import {theme} from '../../lib/theme';
import {useScreenActivity} from '../../lib/useScreenActivity';
import type {Category} from '../../lib/domain';
import {projectVehicle,vehicleMesh} from './vehicleMesh';
export default function VehicleStage({category,color}:{category:Category;color:string}){
 const {motion,colors}=useApp(),{t}=useI18n(),[width,setWidth]=useState(340),yaw=useSharedValue(-.62),origin=useSharedValue(0);
 const mesh=useMemo(()=>vehicleMesh(category,color),[category,color]);
 const frame=useDerivedValue(()=>projectVehicle(mesh,yaw.value,width,240)),vertices=useDerivedValue(()=>frame.value.vertices),paints=useDerivedValue(()=>frame.value.colors);
 const {active}=useScreenActivity();
 useEffect(()=>{if(!active)cancelAnimation(yaw);return()=>cancelAnimation(yaw);},[active,yaw]);
 const pan=Gesture.Pan().enabled(active).activeOffsetX([-8,8]).failOffsetY([-12,12]).onStart(()=>{cancelAnimation(yaw);origin.set(yaw.get());}).onUpdate(event=>{yaw.set(origin.get()+event.translationX/100);});
 const rotate=(amount:number)=>{if(active)yaw.set(motion?withSpring(yaw.get()+amount,theme.motion.spring):yaw.get()+amount);};
 return <View onLayout={event=>setWidth(event.nativeEvent.layout.width)}>
  <GestureDetector gesture={pan}><Canvas style={{width:'100%',height:240}} accessible={false}><Oval x={width*.17} y={166} width={width*.66} height={24} color={colors.line}/><Vertices mode="triangles" vertices={vertices} colors={paints}/></Canvas></GestureDetector>
  <Row style={{justifyContent:'center',gap:20}}><IconButton name="chevron-back" label={t('liveMap.rotateLeft')} onPress={()=>rotate(-Math.PI/4)}/><T muted size={12}>{t('liveMap.rotate')}</T><IconButton name="chevron-forward" label={t('liveMap.rotateRight')} onPress={()=>rotate(Math.PI/4)}/></Row>
 </View>;
}
