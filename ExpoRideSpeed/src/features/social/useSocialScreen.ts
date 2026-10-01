import {useIsFocused} from 'expo-router';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AppState,Platform} from 'react-native';
import {useAuth,isAccountCurrent} from '../../state/AuthState';
import {useRide} from '../../state/RideState';
import {useSocial} from '../../state/SocialState';

/** UI intent fence. Provider repeats these checks before durable mutation/egress. */
export function useSocialScreen(){
 const auth=useAuth(),social=useSocial(),ride=useRide(),focused=useIsFocused();
 const [active,setActive]=useState(AppState.currentState==='active');
 const [online,setOnline]=useState<boolean|null>(()=>Platform.OS==='web'?navigator.onLine:null);
 const live=useRef({auth,social,moving:ride.movingLocked,focused,active,online});
 const mounted=useRef(true),lock=useRef(false),scope=auth.scope;
 useLayoutEffect(()=>{live.current={auth,social,moving:ride.movingLocked,focused,active,online};},[auth,social,ride.movingLocked,focused,active,online]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const subscription=AppState.addEventListener('change',value=>{live.current.active=value==='active';setActive(value==='active');});return()=>subscription.remove();},[]);
 useEffect(()=>{if(Platform.OS!=='web')return;const update=()=>{live.current.online=navigator.onLine;setOnline(navigator.onLine);};window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 const current=useCallback(()=>mounted.current&&live.current.auth.scope===scope&&isAccountCurrent(scope),[scope]);
 const guard=useCallback((mutation=true)=>{
  if(!current())throw Error('ACCOUNT_CHANGED');
  const value=live.current;
  if(value.moving)throw Error('SOCIAL_MOVING_LOCKED');
  if(!value.focused||!value.active)throw Error('SOCIAL_INACTIVE');
  if(!value.auth.session)throw Error('SOCIAL_AUTH_REQUIRED');
  if(mutation&&(!value.social.ready||!value.social.fresh||!value.social.profileReady||value.social.pages.friends.error||value.online===false))throw Error(value.social.profileReady?'SOCIAL_UNAVAILABLE':'PROFILE_REQUIRED');
 },[current]);
 const run=useCallback(async<T,>(task:()=>Promise<T>):Promise<T|undefined>=>{guard();if(lock.current)return;lock.current=true;try{return await task();}finally{lock.current=false;}},[guard]);
 const enabled=!!auth.session&&social.ready&&social.fresh&&social.profileReady&&!social.pages.friends.error&&!social.busy&&!ride.movingLocked&&focused&&active&&online!==false;
 return {auth,social,live,current,guard,run,enabled,moving:ride.movingLocked,online,focused,active};
}
