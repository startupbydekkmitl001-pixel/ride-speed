import {router} from 'expo-router';
import {useCallback,useEffect,useLayoutEffect,useMemo,useSyncExternalStore} from 'react';
import {View} from 'react-native';
import {Button,Row,Screen,T} from '../../components/ui';
import {CommunityReader} from '../../features/community/CommunityReader';
import {CommunityFeed} from '../../features/community/CommunityFeed';
import {CommunityRoutePreview} from '../../features/community/CommunityRoutePreview';
import {getCommunityFeed} from '../../features/community/service';
import type {CommunityFeedPort,CommunityPostBinding} from '../../features/community/uiTypes';
import {useCommunityActions} from '../../features/community/useCommunityActions';
import {useCommunityHost} from '../../features/community/useCommunityHost';
import {useI18n,type TranslationKey} from '../../lib/i18n';
import {useApp} from '../../state/AppState';
import {useAuth} from '../../state/AuthState';
const blank={filter:{schema_version:1 as const,mode:'latest' as const},loaded:false,page:null,rows:[],read:{loading:false,fresh:false,error:null,hasMore:false,loaded:false},retryAfterMs:null},emptySubscribe=()=>()=>{},emptySnapshot=()=>blank;
const monotonicNow=()=>performance.now();
export default function CommunityRoute(){const auth=useAuth(),app=useApp(),{t}=useI18n();if(!auth.ready||!app.ready)return <Screen><T>{t('common.wait')}</T></Screen>;return <AccountCommunity key={auth.scope.generation}/>;}
function AccountCommunity(){
 const h=useCommunityHost(),{t}=useI18n(),{scope,guard,read}=h;
 const reader=useMemo(()=>scope.userId?new CommunityReader({ownerId:scope.userId,guard,monotonicNow,page:(filter,cursor)=>read(session=>getCommunityFeed(scope,session,filter,cursor))}):null,[scope,guard,read]);
 const state=useSyncExternalStore(reader?.subscribe??emptySubscribe,reader?.getSnapshot??emptySnapshot,reader?.getSnapshot??emptySnapshot);
 useEffect(()=>()=>reader?.close(),[reader]);
 useLayoutEffect(()=>{reader?.invalidate();},[reader,h.community.privacyKey,h.activity.generation,h.base.gate.moving]);
 useEffect(()=>{if(!reader||!h.base.ready||!h.base.gate.signedIn||!h.activity.active||h.base.gate.moving||h.community.privacyPending){reader?.suspend();return;}void reader.refresh().catch(()=>{});return()=>reader.suspend();},[reader,h.base.ready,h.base.gate.signedIn,h.activity.active,h.base.gate.moving,h.community.privacyKey,h.community.privacyPending,h.activity.generation]);
 const sourcePost=useCallback((binding:CommunityPostBinding)=>reader?.sourcePost(binding)??null,[reader]),findPost=useCallback((id:string,revision:number)=>{const post=reader?.getSnapshot().rows.find(row=>row.post_id===id&&row.content_revision===revision);return post?reader?.sourcePost({post_id:id,owner_id:post.owner_id,content_revision:revision})??null:null;},[reader]);
 const a=useCommunityActions(h,sourcePost,findPost),check=()=>h.base.guard(h.base.generation,'read');
 const port:CommunityFeedPort={...h.base,...a.actions,filter:state.filter,page:h.community.privacyPending?null:state.page,rows:h.community.privacyPending?[]:state.rows,read:h.community.privacyPending?{...state.read,fresh:false}:state.read,
  refresh:()=>read(async()=>{check();await reader?.refresh();check();}),loadMore:()=>read(async()=>{check();await reader?.loadMore();check();}),setFilter:filter=>read(async()=>{check();await reader?.setFilter(filter);check();}),onCompose:()=>{check();router.push('/compose');}};
 const translate=(key:string,values?:Record<string,string|number>)=>t(key as TranslationKey,values);
 return <View style={{flex:1}}><CommunityFeed port={port} t={translate} headerAccessory={<Row style={{flexWrap:"wrap",gap:8}}><Button small secondary icon="people-outline" label={t('m5a.friends')} disabled={!h.activity.active||h.base.gate.moving} onPress={()=>{if(h.base.current(h.base.generation)&&!h.latest.current.moving)router.push('/friends');}}/><Button small secondary icon="flag-outline" label={t('m5a.invitations')} disabled={!h.activity.active||h.base.gate.moving} onPress={()=>{if(h.base.current(h.base.generation)&&!h.latest.current.moving)router.push('/challenges');}}/></Row>}/><CommunityRoutePreview post={a.routePost} port={port} t={translate} onClose={a.closeRoute}/></View>;
}
