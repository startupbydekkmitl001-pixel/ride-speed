import {useEffect,useMemo,useRef} from 'react';
import {View} from 'react-native';
import {IconButton,Row,T} from '../../components/ui';
import {useI18n} from '../../lib/i18n';
import type {Category} from '../../lib/domain';
import {projectVehicle,vehicleMesh} from './vehicleMesh';
export default function VehicleStage({category,color}:{category:Category;color:string}){
 const {t}=useI18n(),canvas=useRef<HTMLCanvasElement>(null),angle=useRef(-.62),drag=useRef<{x:number;yaw:number}|null>(null),draw=useRef(()=>{});
 const mesh=useMemo(()=>vehicleMesh(category,color),[category,color]);
 useEffect(()=>{const element=canvas.current;if(!element)return;const render=()=>{const width=element.clientWidth,height=240,dpr=Math.min(2,window.devicePixelRatio||1);element.width=width*dpr;element.height=height*dpr;const ctx=element.getContext('2d');if(!ctx)return;ctx.scale(dpr,dpr);const frame=projectVehicle(mesh,angle.current,width,height);ctx.fillStyle='#77777725';ctx.beginPath();ctx.ellipse(width/2,178,width*.33,12,0,0,Math.PI*2);ctx.fill();for(let i=0;i<frame.vertices.length;i+=3){ctx.fillStyle=frame.colors[i];ctx.beginPath();frame.vertices.slice(i,i+3).forEach((p,j)=>{if(j===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.closePath();ctx.fill();}};draw.current=render;render();const resize=new ResizeObserver(render);resize.observe(element);return()=>{resize.disconnect();draw.current=()=>{};};},[mesh]);
 return <View><canvas ref={canvas} aria-label={t('liveMap.modelNote')} style={{width:'100%',height:240,touchAction:'pan-y',cursor:'grab'}}
  onPointerDown={event=>{drag.current={x:event.clientX,yaw:angle.current};event.currentTarget.setPointerCapture(event.pointerId);}}
  onPointerMove={event=>{if(drag.current){angle.current=drag.current.yaw+(event.clientX-drag.current.x)/100;draw.current();}}}
  onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}/>
  <Row style={{justifyContent:'center',gap:20}}><IconButton name="chevron-back" label={t('liveMap.rotateLeft')} onPress={()=>{angle.current-=Math.PI/4;draw.current();}}/><T muted size={12}>{t('liveMap.rotate')}</T><IconButton name="chevron-forward" label={t('liveMap.rotateRight')} onPress={()=>{angle.current+=Math.PI/4;draw.current();}}/></Row>
 </View>;
}
