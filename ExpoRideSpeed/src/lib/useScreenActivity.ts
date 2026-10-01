import {useIsFocused} from 'expo-router';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';

/** Screen work is revoked synchronously by an OS event, before React renders. */
export function useScreenActivity(){
 const focused=useIsFocused(),[state,setState]=useState({foreground:AppState.currentState==='active',generation:0}),foreground=state.foreground;
 const life=useRef({focused,foreground,mounted:true,version:0});
 useLayoutEffect(()=>{const value=life.current;if(value.focused!==focused||value.foreground!==foreground)++value.version;value.focused=focused;value.foreground=foreground;},[focused,foreground]);
 useEffect(()=>{const value=life.current;value.mounted=true;const subscription=AppState.addEventListener('change',status=>{const next=status==='active';if(value.foreground===next)return;++value.version;value.foreground=next;setState({foreground:next,generation:value.version});});return()=>{value.mounted=false;++value.version;subscription.remove();};},[]);
 const current=useCallback(()=>{const value=life.current;return value.mounted&&value.focused&&value.foreground&&AppState.currentState==='active';},[]);
 const capture=useCallback(()=>current()?life.current.version:null,[current]);
 const accepts=useCallback((ticket:number|null)=>ticket!==null&&current()&&ticket===life.current.version,[current]);
 return{active:focused&&foreground,generation:state.generation,current,capture,accepts};
}
