import {router} from 'expo-router';
import {useEffect,useLayoutEffect,useMemo,useSyncExternalStore} from 'react';
import {Button,Heading,Note,Screen,T} from '../components/ui';
import {CommunityOwnerReader} from '../features/community/CommunityOwnerReader';
import {CommunityOwnerScreen,type CommunityOwnerScreenPort} from '../features/community/CommunityOwnerScreen';
import {getCommunityOwnerPost,getCommunityOwnerPosts} from '../features/community/communityOwnerService';
import type {CommunityOwnerPost} from '../features/community/communityOwnerModel';
import {useCommunityHost} from '../features/community/useCommunityHost';
import {useI18n,type TranslationKey} from '../lib/i18n';
import {useApp} from '../state/AppState';
import {useAuth} from '../state/AuthState';
const monotonicNow=()=>performance.now();
export default function CommunityPostsRoute(){const auth=useAuth(),app=useApp(),{t}=useI18n();if(!auth.ready||!app.ready)return <Screen><T>{t('common.wait')}</T></Screen>;if(!auth.session)return <Screen><Heading eyebrow="" title={t('m7.owner.title' as TranslationKey)}/><Note>{t('m7.signInBody')}</Note><Button label={t('m7.signIn')} onPress={()=>router.push('/auth')}/></Screen>;return <AccountCommunityPosts key={auth.scope.generation}/>;}
function AccountCommunityPosts(){const h=useCommunityHost(),{t}=useI18n(),{scope}=h,ownerGuard=h.guard,capturedRead=h.read;
 // Guarded captured ports dispatch only after this owner screen is active.
 const reader=useMemo(()=>new CommunityOwnerReader({ownerId:scope.userId!,guard:()=>ownerGuard(false),monotonicNow,page:cursor=>capturedRead(session=>getCommunityOwnerPosts(scope,session,cursor),false),detail:id=>capturedRead(session=>getCommunityOwnerPost(scope,session,id),false)}),[scope,ownerGuard,capturedRead]);
 const snapshot=useSyncExternalStore(reader.subscribe,reader.getSnapshot,reader.getSnapshot);
 useLayoutEffect(()=>reader.invalidate(),[reader,h.activity.generation,h.community.privacyKey,h.base.gate.moving]);
 useEffect(()=>{if(h.activity.active&&h.community.ready&&!h.base.gate.moving)void reader.refresh().catch(()=>{});return()=>reader.suspend();},[reader,h.activity.active,h.activity.generation,h.community.ready,h.community.privacyKey,h.base.gate.moving]);
 useEffect(()=>()=>reader.close(),[reader]);
 const port:CommunityOwnerScreenPort={...h.base,rows:snapshot.rows,read:snapshot.read,detailRead:snapshot.detailRead,
  refresh:()=>{h.base.guard(h.base.generation,'read');return h.read(async()=>{await reader.refresh();},false);},loadMore:()=>{h.base.guard(h.base.generation,'read');return h.read(async()=>{await reader.loadMore();},false);},
  reviewPost:async id=>{h.base.guard(h.base.generation,'control');return h.read(async(_session,current)=>{await reader.select(id);current();const row=reader.getSnapshot().detail?.post;if(!row||!reader.current(row))throw Error(reader.getSnapshot().detailRead.error??'COMMUNITY_UNAVAILABLE');return row;});},
  currentPost:(post:CommunityOwnerPost)=>h.base.current(h.base.generation)&&!h.latest.current.community.privacyPending&&reader.current(post),
  apply:async(post,action,visibility,callerGuard=()=>{})=>{h.base.guard(h.base.generation,'control');const current=h.ticket(),check=()=>{current();callerGuard();if(!reader.current(post))throw Error('COMMUNITY_CHANGED');};check();if(post.content_revision<1||!['published','hidden'].includes(post.state))throw Error('COMMUNITY_CHANGED');const request=action==='audience'?{schema_version:1 as const,action,post_id:post.post_id,expected_revision:post.content_revision,visibility:visibility!}:{schema_version:1 as const,action,post_id:post.post_id,expected_revision:post.content_revision};const id=await h.latest.current.community.mutate(request,check);current();reader.invalidate();return id;},
  onBack:()=>{if(h.base.current(h.base.generation)&&!h.base.gate.moving)router.back();},
 };
 return <CommunityOwnerScreen port={port} t={(key,values)=>t(key as TranslationKey,values)}/>;
}
