import React,{useEffect} from 'react';
import {StyleSheet,View,useWindowDimensions} from 'react-native';
import Animated,{cancelAnimation,ReduceMotion,useAnimatedStyle,useSharedValue,withSequence,withTiming} from 'react-native-reanimated';
import {Button,Glass,Note,Panel,Row,T} from '../../components/ui';
import {theme} from '../../lib/theme';
import {useApp} from '../../state/AppState';
import {AmbientLoop} from '../motion';
import {resolveAmbientAsset} from '../motion/assets';
import {elapsedBoundsLabel} from './presentationModel';
import type {RankedRow} from './types';
import type {RankedScreenProps,RankedTranslator} from './uiTypes';

export function metricLabel(row:RankedRow,units:'kmh'|'mph',t:RankedTranslator){
 if(row.metric==='route_time')return `${elapsedBoundsLabel(row.elapsed_lower_ms,row.elapsed_upper_ms)} ${t('m6.seconds')}`;
 return `${(row.sustained_kmh*(units==='mph'?1/1.609344:1)).toFixed(1)} ${units==='mph'?'mph':'km/h'}`;
}
function AnimatedRank({rank,change,t}:{rank:number;change:number;t:RankedTranslator}){
 const {motion}=useApp(),flip=useSharedValue(0);
 useEffect(()=>{flip.value=motion&&change!==0?withSequence(withTiming(1,{duration:120,reduceMotion:ReduceMotion.System}),withTiming(0,{duration:180,reduceMotion:ReduceMotion.System})):0;return()=>cancelAnimation(flip);},[rank,change,motion,flip]);
 const animated=useAnimatedStyle(()=>({opacity:1-flip.value*.45,transform:[{perspective:400},{rotateX:`${flip.value*70}deg`}]}));
 return <Animated.View style={animated}><T numeric size={28} accessibilityLabel={t('m6.rank',{rank})} accessibilityLiveRegion={change?'polite':undefined}>{rank}</T></Animated.View>;
}
export function RankedPodium({rows,port,t,visible}:{rows:readonly RankedRow[];visible:boolean}&RankedScreenProps){
 const {colors,dark}=useApp(),{width,fontScale}=useWindowDimensions(),stack=width<400||fontScale>1.25;
 if(!rows.length)return null;
 return <View style={{gap:12}}><T accessibilityRole="header" size={18} weight="semibold">{t('m6.podiumTitle')}</T><View style={{flexDirection:stack?'column':'row',gap:10,alignItems:'stretch'}}>{rows.map(record=>{
  const role=record.rank===1?'podium-first':record.rank===2?'podium-second':'podium-third';
  return <View key={record.record_id} style={{flex:stack?undefined:1,minWidth:0,borderRadius:theme.radius.card,overflow:'hidden',backgroundColor:colors.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.line}}><AmbientLoop asset={resolveAmbientAsset(role,dark?'dark':'light')} visible={visible&&port.gate.focused&&port.gate.foreground&&!port.gate.moving} style={StyleSheet.absoluteFill}/><View style={{padding:16,gap:10}}><AnimatedRank rank={record.rank} change={port.rankChanges[record.record_id]??0} t={t}/><T weight="semibold" size={16} numberOfLines={2}>{record.profile.name}</T><T numeric size={20}>{metricLabel(record,port.units,t)}</T>{record.tied&&<T size={12} muted>{t('m6.tied')}</T>}</View></View>;
 })}</View></View>;
}
export function RankedListRow({record,port,t,report}:{record:RankedRow;report:()=>void}&RankedScreenProps){
 const {colors}=useApp(),value=metricLabel(record,port.units,t),change=port.rankChanges[record.record_id]??0;
 return <View style={{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.line,paddingVertical:18,gap:10}}><Row style={{alignItems:'flex-start'}}><View style={{minWidth:44}}><AnimatedRank rank={record.rank} change={change} t={t}/></View><View style={{flex:1,gap:4}}><T weight="semibold" accessibilityLabel={t('m6.rowLabel',{rank:record.rank,name:record.profile.name,value,class:t(`m6.class.${record.class_key}`)})}>{record.profile.name}</T><T size={12} muted>@{record.profile.handle}</T><T size={12} muted>{t(`m6.class.${record.class_key}`)}</T><T numeric size={21}>{value}</T>{record.tied&&<T size={12} muted>{t('m6.tied')}</T>}{change!==0&&<T size={12} muted>{t(change>0?'m6.rankUp':'m6.rankDown',{count:Math.abs(change)})}</T>}</View></Row>{record.provenance_unknown&&<Note>{t('m6.provenanceUnknown')}</Note>}{port.onReport&&<Button small secondary icon="flag-outline" label={t('m6.report')} disabled={!port.read.fresh||!!port.read.error||!port.gate.online||!port.gate.focused||!port.gate.foreground||port.gate.moving} onPress={report}/>}</View>;
}
export function OwnRank({port,t,publication,stale}:{publication:()=>void;stale:boolean}&RankedScreenProps){
 const own=port.page?.self;
 return <Glass style={{padding:14,gap:8}}><Row style={{justifyContent:'space-between',alignItems:'flex-start'}}><View style={{flex:1,gap:3}}><T size={12} muted>{t('m6.yourRank')}</T>{own?<><T numeric size={24}>{metricLabel(own,port.units,t)}</T>{own.tied&&<T size={12} muted>{t('m6.tied')}</T>}</>:<T size={13}>{t(`m6.self.${port.page?.self_status??'no_record'}`)}</T>}</View>{own&&<AnimatedRank rank={own.rank} change={port.rankChanges[own.record_id]??0} t={t}/>}</Row>{stale&&<T size={12} muted>{t('m6.stale')}</T>}{!own&&port.onManagePublication&&<Button small secondary label={t('m6.managePublication')} disabled={!port.gate.online||!port.gate.focused||!port.gate.foreground||port.gate.moving} onPress={publication}/>}</Glass>;
}
export function RankedSignIn({t,onSignIn,disabled}:{t:RankedTranslator;onSignIn:()=>void;disabled:boolean}){return <Panel><T>{t('m6.signInBody')}</T><Button label={t('m6.signIn')} disabled={disabled} onPress={onSignIn}/></Panel>;}
