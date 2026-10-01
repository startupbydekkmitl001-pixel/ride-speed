import type {Session} from '@supabase/supabase-js';
import {router} from 'expo-router';
import {useCallback,useLayoutEffect,useRef} from 'react';
import {Platform} from 'react-native';
import {useI18n} from '../../lib/i18n';
import {useScreenActivity} from '../../lib/useScreenActivity';
import {useApp} from '../../state/AppState';
import {isAccountCurrent,useAuth} from '../../state/AuthState';
import {useCommunity} from '../../state/CommunityState';
import {useRide} from '../../state/RideState';
import {useSocial} from '../../state/SocialState';
import type {CommunityBasePort} from './uiTypes';
export function useCommunityHost(){
 const auth=useAuth(),app=useApp(),community=useCommunity(),social=useSocial(),ride=useRide(),activity=useScreenActivity(),{language}=useI18n(),{scope}=auth;
 const alive=useRef(true),latest=useRef({auth,app,community,social,moving:ride.movingLocked}),generation=`${scope.generation}:${activity.generation}:${community.privacyKey}`,generationRef=useRef(generation),renderEpoch=useRef<number|null>(activity.capture()),policy=useRef({moving:ride.movingLocked,privacyKey:community.privacyKey,version:0});
 useLayoutEffect(()=>{latest.current={auth,app,community,social,moving:ride.movingLocked};generationRef.current=generation;},[auth,app,community,social,ride.movingLocked,generation]);
 useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[scope]);
 useLayoutEffect(()=>{renderEpoch.current=activity.capture();});
 useLayoutEffect(()=>{if(policy.current.moving!==ride.movingLocked||policy.current.privacyKey!==community.privacyKey)++policy.current.version;policy.current.moving=ride.movingLocked;policy.current.privacyKey=community.privacyKey;},[ride.movingLocked,community.privacyKey]);
 const screenCurrent=activity.current;
 const accepts=activity.accepts;
 const guard=useCallback((privacy=true)=>{const value=latest.current;if(!alive.current||!isAccountCurrent(scope)||!screenCurrent()||!accepts(renderEpoch.current))throw Error('COMMUNITY_CHANGED');if(value.moving)throw Error('COMMUNITY_MOVING');if(!value.auth.ready||!value.auth.session||value.auth.session.user.id!==scope.userId)throw Error('COMMUNITY_AUTH_REQUIRED');if(!value.app.ready||!value.community.ready||value.app.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');value.community.guardOwner();if(privacy&&value.community.privacyPending)throw Error('COMMUNITY_CHANGED');},[scope,screenCurrent,accepts]);
 const capture=activity.capture;
 const ticket=useCallback((privacy=true)=>{guard(privacy);const boundary=latest.current.community.privacyKey,policyVersion=policy.current.version,epoch=capture();if(epoch===null)throw Error('COMMUNITY_CHANGED');return()=>{guard(privacy);if(!accepts(epoch)||latest.current.community.privacyKey!==boundary||policy.current.version!==policyVersion)throw Error('COMMUNITY_CHANGED');};},[guard,capture,accepts]);
 const read=useCallback(async<T,>(task:(session:Session,current:()=>void)=>Promise<T>,privacy=true)=>{const current=ticket(privacy),session=latest.current.auth.session!;current();const result=await task(session,current);current();return result;},[ticket]);
 const current=useCallback((value:string)=>alive.current&&isAccountCurrent(scope)&&screenCurrent()&&accepts(renderEpoch.current)&&value===generationRef.current,[scope,screenCurrent,accepts]);
 const base:CommunityBasePort={ownerId:scope.userId,generation,current,guard:(value,kind)=>{if(!current(value))throw Error('COMMUNITY_CHANGED');if(kind==='navigation'&&!latest.current.auth.session){if(latest.current.moving)throw Error('COMMUNITY_MOVING');return;}guard(kind!=='control'||!latest.current.community.privacyPending);},gate:{signedIn:!!auth.session,profileReady:social.profileReady,focused:activity.active,foreground:activity.active,moving:ride.movingLocked,online:Platform.OS!=='web'||typeof navigator==='undefined'||navigator.onLine},ready:auth.ready&&app.ready&&community.ready,units:app.data.unit,locale:language,pending:community.pending,latest:community.latest,busy:community.busy,
  mutate:()=>Promise.reject(Error('COMMUNITY_CHANGED')),retry:()=>read(async(_session,check)=>{check();await latest.current.community.retry();check();},false),onSignIn:()=>{if(current(generation)&&!latest.current.moving)router.push('/auth');}};
 return{auth,app,community,social,activity,scope,guard,ticket,read,base,latest};
}
