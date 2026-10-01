import React from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { T } from '../../components/ui';
import { useApp } from '../../state/AppState';
import { useI18n } from '../../lib/i18n';
const providerUrl='https://www.geoapify.com/';
/** Keep the provider's data-source credit and a real follow-link next to its information. */
export function RoutingAttribution({attribution,disabled=false}:{attribution?:string|null;disabled?:boolean}){
 const {colors}=useApp(),{t}=useI18n();
 return <View style={{gap:0}}>{attribution&&<T size={10} muted>{attribution}</T>}
  {Platform.OS==='web'?<a href={providerUrl} target="_blank" rel="noopener noreferrer" aria-disabled={disabled} onClick={event=>{if(disabled)event.preventDefault();}} style={{color:colors.muted,minHeight:44,display:'flex',alignItems:'center',fontFamily:'Anuphan-400',fontSize:11,textDecoration:'underline'}}>{t('m4.providerCredit')}</a>:<Pressable accessibilityRole="link" accessibilityLabel={t('m4.providerCredit')} accessibilityState={{disabled}} disabled={disabled} onPress={()=>{void Linking.openURL(providerUrl).catch(()=>{});}} style={{minHeight:44,justifyContent:'center'}}><T size={11} muted style={{textDecorationLine:'underline'}}>{t('m4.providerCredit')}</T></Pressable>}
 </View>;
}
