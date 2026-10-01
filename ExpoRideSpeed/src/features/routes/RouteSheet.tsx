import React, { useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, T } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { theme } from '../../lib/theme';
import { useApp } from '../../state/AppState';
export function RouteSheet({visible,title,onClose,children}:{visible:boolean;title:string;onClose:()=>void;children:React.ReactNode}) {
 const {colors,motion}=useApp(),{t}=useI18n(),insets=useSafeAreaInsets(),entrance=useSharedValue(1);
 useEffect(()=>{entrance.value=visible?(motion?withTiming(0,{duration:theme.motion.stateMs,reduceMotion:ReduceMotion.System}):0):1;return()=>cancelAnimation(entrance);},[visible,motion,entrance]);
 const position=useAnimatedStyle(()=>({transform:[{translateY:entrance.value*32}],opacity:1-entrance.value}));
 return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
  <KeyboardAvoidingView style={styles.full} behavior={Platform.OS==='ios'?'padding':undefined}>
   <Pressable accessibilityRole="button" accessibilityLabel={t('m4.cancel')} onPress={onClose} style={[StyleSheet.absoluteFill,{backgroundColor:colors.glassScrim}]} />
   <Animated.View accessibilityViewIsModal style={[styles.sheet,position,{backgroundColor:colors.raised,borderColor:colors.line,paddingBottom:insets.bottom+24,maxHeight:'88%'}]}>
    <View style={styles.header}><T size={24} weight="semibold" style={{flex:1}}>{title}</T><Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.target}><Icon name="close-outline" /></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
   </Animated.View>
  </KeyboardAvoidingView>
 </Modal>;
}
export function RouteProviderConsent({visible,onDecision}:{visible:boolean;onDecision:(allowed:boolean)=>void}){
 const {t}=useI18n();
 return <RouteSheet visible={visible} title={t('m4.consentTitle')} onClose={()=>onDecision(false)}><T>{t('m4.consentBody')}</T><Button label={t('m4.consentAccept')} onPress={()=>onDecision(true)} /><Button secondary label={t('m4.consentDecline')} onPress={()=>onDecision(false)} /></RouteSheet>;
}
const styles=StyleSheet.create({full:{flex:1,justifyContent:'flex-end'},sheet:{borderTopLeftRadius:32,borderTopRightRadius:32,borderWidth:StyleSheet.hairlineWidth,paddingTop:14},header:{flexDirection:'row',gap:8,alignItems:'center',paddingHorizontal:24},content:{paddingHorizontal:24,paddingTop:14,gap:18},target:{minHeight:44,minWidth:44,justifyContent:'center',alignItems:'center'}});
