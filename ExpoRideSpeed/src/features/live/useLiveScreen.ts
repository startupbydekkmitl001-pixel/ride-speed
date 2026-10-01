import {useIsFocused} from 'expo-router';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {useAuth,isAccountCurrent} from '../../state/AuthState';
import {useLive} from '../../state/LiveState';
import {useRide} from '../../state/RideState';
import type {LiveContextValue} from './uiTypes';

/** Current UI intent only; authority and outgoing location remain provider-owned. */
export function useLiveScreen(){
 const auth=useAuth(),data:LiveContextValue=useLive(),ride=useRide(),focused=useIsFocused(),[active,setActive]=useState(AppState.currentState==='active');
 const latestRef=useRef({auth,data,moving:ride.movingLocked,focused,active}),mounted=useRef(true),lock=useRef(false),scope=auth.scope;
 useLayoutEffect(()=>{latestRef.current={auth,data,moving:ride.movingLocked,focused,active};},[auth,data,ride.movingLocked,focused,active]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const subscription=AppState.addEventListener('change',value=>{latestRef.current.active=value==='active';setActive(value==='active');});return()=>subscription.remove();},[]);
 const current=useCallback(()=>mounted.current&&latestRef.current.auth.scope===scope&&isAccountCurrent(scope),[scope]);
 const localGuard=useCallback(()=>{if(!current())throw Error('ACCOUNT_CHANGED');const value=latestRef.current;if(value.moving)throw Error('LIVE_MOVING_LOCKED');if(!value.active||!value.focused)throw Error('LIVE_INACTIVE');},[current]);
 const guard=useCallback((fresh=true)=>{localGuard();const value=latestRef.current;if(!value.auth.session)throw Error('LIVE_AUTH_REQUIRED');if(fresh&&(!value.data.ready||!value.data.fresh||!value.data.profileReady))throw Error(value.data.profileReady?'LIVE_UNAVAILABLE':'PROFILE_REQUIRED');},[localGuard]);
 const run=useCallback(async<T,>(task:()=>Promise<T>,fresh=true):Promise<T|undefined>=>{guard(fresh);if(lock.current)return;lock.current=true;try{return await task();}finally{lock.current=false;}},[guard]);
 return {auth,data,latestRef,current,localGuard,guard,run,focused,active,moving:ride.movingLocked,enabled:!!auth.session&&data.ready&&data.fresh&&data.profileReady&&!data.busy&&!ride.movingLocked&&focused&&active};
}
