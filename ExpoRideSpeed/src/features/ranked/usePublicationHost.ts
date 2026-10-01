import {router} from 'expo-router';
import {useCallback,useLayoutEffect,useRef} from 'react';
import {Platform} from 'react-native';
import type {Session} from '@supabase/supabase-js';
import {useScreenActivity} from '../../lib/useScreenActivity';
import {useApp} from '../../state/AppState';
import {isAccountCurrent,useAuth} from '../../state/AuthState';
import {useRanked} from '../../state/RankedState';
import {useRide} from '../../state/RideState';
import type {PublicationBasePort} from './publicationUITypes';
export function usePublicationHost(){
 const auth=useAuth(),app=useApp(),ranked=useRanked(),ride=useRide(),activity=useScreenActivity(),{scope}=auth;
 const alive=useRef(true),latest=useRef({auth,app,ranked,moving:ride.movingLocked}),generation=`${scope.generation}:${activity.generation}`,generationRef=useRef(generation);
 const screenCurrent=activity.current;
 useLayoutEffect(()=>{latest.current={auth,app,ranked,moving:ride.movingLocked};generationRef.current=generation;},[auth,app,ranked,ride.movingLocked,generation]);
 useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[scope]);
 const guard=useCallback(()=>{const state=latest.current;if(!alive.current||!isAccountCurrent(scope)||!screenCurrent())throw Error('RANKED_CHANGED');if(state.moving)throw Error('RANKED_MOVING');if(!state.auth.ready||!state.auth.session||state.auth.session.user.id!==scope.userId)throw Error('RANKED_AUTH_REQUIRED');if(!state.app.ready||!state.ranked.ready||state.app.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');},[scope,screenCurrent]);
 const capture=activity.capture,accepts=activity.accepts;
 const read=useCallback(async<T,>(task:(session:Session)=>Promise<T>)=>{guard();const ticket=capture();if(ticket===null)throw Error('RANKED_CHANGED');const session=latest.current.auth.session!;const result=await task(session);guard();if(!accepts(ticket))throw Error('RANKED_CHANGED');return result;},[guard,capture,accepts]);
 const current=(g:string)=>alive.current&&isAccountCurrent(scope)&&activity.current()&&g===generationRef.current;
 const base:PublicationBasePort={generation,current,guard:g=>{if(!current(g))throw Error('RANKED_CHANGED');guard();},gate:{signedIn:!!auth.session,active:activity.active,moving:ride.movingLocked,online:Platform.OS!=='web'||typeof navigator==='undefined'||navigator.onLine},ready:auth.ready&&app.ready&&ranked.ready,pending:ranked.pending,latest:ranked.latest,error:ranked.error,
  retry:()=>read(async()=>{await latest.current.ranked.retry();}),onBack:()=>{if(activity.current())router.back();},onSignIn:()=>{if(activity.current()&&!latest.current.moving)router.push('/auth');}};
 return {auth,app,ranked,activity,scope,guard,read,base};
}
