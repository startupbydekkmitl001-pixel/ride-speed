import {memo} from 'react';
import {Pressable,View} from 'react-native';
import {T} from '../../components/ui';
import {useI18n} from '../../lib/i18n';
import {useApp} from '../../state/AppState';
import type {MapPeer} from './MapSurface.types';

export const LiveFriendsRail=memo(function LiveFriendsRail({peers,onSelect,limit=3}:{peers:readonly MapPeer[];onSelect:(id:string)=>void;limit?:number}){
 const {colors}=useApp(),{t}=useI18n();
 if(!peers.length)return null;
 return <View accessibilityLabel={t('liveMap.shared')} style={{gap:8}}>
  {peers.slice(0,limit).map(peer=><Pressable key={peer.id} accessibilityRole="button" accessibilityLabel={t('liveMap.focus',{name:peer.name})} onPress={()=>onSelect(peer.id)}
   style={({pressed})=>({width:52,height:52,alignItems:'center',justifyContent:'center',opacity:pressed?.65:1})}>
   <View style={{width:44,height:44,borderRadius:22,borderWidth:2,borderColor:colors.good,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'}}>
    <T size={18} weight="semibold" numberOfLines={1}>{peer.name.trim().slice(0,1).toUpperCase()}</T>
   </View>
  </Pressable>)}
 </View>;
});
