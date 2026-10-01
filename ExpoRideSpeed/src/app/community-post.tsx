import {router,useLocalSearchParams} from 'expo-router';
import {randomUUID} from 'expo-crypto';
import {useCallback,useEffect,useLayoutEffect,useMemo,useSyncExternalStore} from 'react';
import {View} from 'react-native';
import {Button,Note,Screen,T} from '../components/ui';
import {CommunityDetail} from '../features/community/CommunityDetail';
import {CommunityDetailReader} from '../features/community/CommunityReader';
import {CommunityRoutePreview} from '../features/community/CommunityRoutePreview';
import {isCommunityId} from '../features/community/model';
import {getCommunityComments,getCommunityPost} from '../features/community/service';
import type {CommunityDetailPort,CommunityPostBinding} from '../features/community/uiTypes';
import {useCommunityActions} from '../features/community/useCommunityActions';
import {useCommunityHost} from '../features/community/useCommunityHost';
import {useI18n,type TranslationKey} from '../lib/i18n';
import {useApp} from '../state/AppState';
import {useAuth} from '../state/AuthState';
const blank={postId:null,loaded:false,detail:null,read:{loading:false,fresh:false,error:null,hasMore:false,loaded:false},comments:[],commentsRead:{loading:false,fresh:false,error:null,hasMore:false,loaded:false},commentsLoaded:false,retryAfterMs:null},emptySubscribe=()=>()=>{},emptySnapshot=()=>blank;
const monotonicNow=()=>performance.now();
export function communityPostParam(value:Record<string,unknown>):string|null{return Object.keys(value).length===1&&isCommunityId(value.postId)?value.postId:null;}
export default function CommunityPostRoute(){const auth=useAuth(),app=useApp(),params=useLocalSearchParams(),{t}=useI18n(),postId=communityPostParam(params);if(!auth.ready||!app.ready)return <Screen><T>{t('common.wait')}</T></Screen>;if(!postId)return <Screen><Note error>{t('m7.unavailable')}</Note><Button secondary label={t('m7.back')} onPress={()=>router.back()}/></Screen>;return <AccountPost key={`${auth.scope.generation}:${postId}`} postId={postId}/>;}
function AccountPost({postId}:{postId:string}){
 const h=useCommunityHost(),{t}=useI18n(),{scope,guard,read}=h;
 const reader=useMemo(()=>scope.userId?new CommunityDetailReader({ownerId:scope.userId,guard,monotonicNow,detail:id=>read(session=>getCommunityPost(scope,session,id)),comments:(id,cursor)=>read(session=>getCommunityComments(scope,session,id,cursor))}):null,[scope,guard,read]);
 const state=useSyncExternalStore(reader?.subscribe??emptySubscribe,reader?.getSnapshot??emptySnapshot,reader?.getSnapshot??emptySnapshot);
 useEffect(()=>()=>reader?.close(),[reader]);
 useLayoutEffect(()=>{reader?.invalidate();},[reader,h.community.privacyKey,h.activity.generation,h.base.gate.moving,postId]);
 useEffect(()=>{if(!reader||!h.base.ready||!h.base.gate.signedIn||!h.activity.active||h.base.gate.moving||h.community.privacyPending){reader?.suspend();return;}void reader.select(postId).catch(()=>{});return()=>reader.suspend();},[reader,postId,h.base.ready,h.base.gate.signedIn,h.activity.active,h.base.gate.moving,h.community.privacyKey,h.community.privacyPending,h.activity.generation]);
 const sourcePost=useCallback((binding:CommunityPostBinding)=>reader?.sourcePost(binding)??null,[reader]),findPost=useCallback((id:string,revision:number)=>{const post=reader?.getSnapshot().detail?.post;return post&&post.post_id===id&&post.content_revision===revision?reader?.sourcePost({post_id:id,owner_id:post.owner_id,content_revision:revision})??null:null;},[reader]);
 const a=useCommunityActions(h,sourcePost,findPost),check=()=>h.base.guard(h.base.generation,'read');
 const port:CommunityDetailPort={...h.base,...a.actions,detail:h.community.privacyPending?null:state.detail,read:h.community.privacyPending?{...state.read,fresh:false}:state.read,comments:h.community.privacyPending?[]:state.comments,commentsRead:h.community.privacyPending?{...state.commentsRead,fresh:false}:state.commentsRead,
  refresh:()=>read(async()=>{check();await reader?.refresh();check();}),loadMoreComments:()=>read(async()=>{check();await reader?.loadMoreComments();check();}),commentUUID:randomUUID,onBack:()=>{if(h.activity.current())router.back();}};
 const translate=(key:string,values?:Record<string,string|number>)=>t(key as TranslationKey,values);
 return <View style={{flex:1}}><CommunityDetail port={port} t={translate}/><CommunityRoutePreview post={a.routePost} port={port} t={translate} onClose={a.closeRoute}/></View>;
}
