import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import {Image} from 'expo-image';
import {Button} from '../../components/ui';
import {theme} from '../../lib/theme';
import {communityPostBinding,type CommunityMediaProps} from './uiTypes';
import {PhotoPlaceholder} from './CommunityParts';
/** No URL/prefetch before viewability; obsolete private images are hidden before their async effect cleans up. */
export function CommunityMediaView({post,media,port,t,visible}:CommunityMediaProps){
 const key=`${port.generation}:${post.post_id}:${post.content_revision}:${media.media_id}:${media.sha256??'legacy'}`,binding={...communityPostBinding(post),media_id:media.media_id,sha256:media.sha256};
 const [retryState,setRetryState]=useState({key:'',count:0}),attempt=retryState.key===key?retryState.count:0,[value,setValue]=useState<{key:string;url:string|null;failed:boolean}>({key:'',url:null,failed:false}),latest=useRef({port,visible,key,url:value.url});
 useLayoutEffect(()=>{latest.current={port,visible,key,url:value.url};},[port,visible,key,value.url]);
 const active=visible&&port.gate.focused&&port.gate.foreground&&!port.gate.moving&&port.current(port.generation)&&port.postCurrent(binding);
 useEffect(()=>{let alive=true;if(!active)return;const generation=port.generation,pinned=key;
  const valid=()=>alive&&latest.current.key===pinned&&latest.current.visible&&latest.current.port.gate.focused&&latest.current.port.gate.foreground&&!latest.current.port.gate.moving&&latest.current.port.current(generation)&&latest.current.port.postCurrent(binding);
  void port.getMediaURL(binding,attempt>0).then(url=>{if(valid())setValue({key:pinned,url,failed:!url});}).catch(()=>{if(valid())setValue({key:pinned,url:null,failed:true});});return()=>{alive=false;};
 // Binding primitives intentionally define the immutable asset request, not newly allocated DTO object identity.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[active,key,attempt,port.getMediaURL]);
 const shown=active&&value.key===key?value:null,url=shown?.url??null;
 const fail=()=>{if(latest.current.key!==key||latest.current.url!==url||!url)return;if(attempt===0&&latest.current.port.gate.online)setRetryState({key,count:1});else setValue({key,url:null,failed:true});};
 const retry=()=>{const p=latest.current.port;if(latest.current.key!==key||!latest.current.visible||!p.current(port.generation)||!p.postCurrent(binding)||!p.gate.focused||!p.gate.foreground||p.gate.moving)return;try{p.guard(port.generation,'read');setRetryState(n=>({key,count:(n.key===key?n.count:0)+1}));}catch{/* Parent policy leaves the neutral placeholder visible. */}};
 return <View style={{aspectRatio:media.width&&media.height?media.width/media.height:1.5,minHeight:144,maxHeight:360,borderRadius:theme.radius.small,overflow:'hidden'}}>{url?<Image recyclingKey={key} source={{uri:url}} placeholder={media.blurhash?{blurhash:media.blurhash}:undefined} cachePolicy="none" contentFit="cover" transition={0} accessibilityLabel={t('m7.photo',{index:post.media.findIndex(m=>m.media_id===media.media_id)+1,count:post.media.length})} style={{width:'100%',height:'100%'}} onError={fail}/>:<PhotoPlaceholder label={t(shown?.failed?'m7.photoUnavailable':'m7.photoLoading')}/>}{shown?.failed&&active&&<Button small secondary label={t('m7.photoRetry')} disabled={!port.gate.online||port.gate.moving} onPress={retry}/>}</View>;
}
