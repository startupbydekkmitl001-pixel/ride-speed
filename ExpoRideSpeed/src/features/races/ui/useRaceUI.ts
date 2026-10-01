import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {raceErrorKey} from '../../../lib/raceI18n';
import type {RaceScreenPort} from '../uiTypes';
export function useRaceUI(port:RaceScreenPort){
 const latest=useRef(port),mounted=useRef(true),lock=useRef(false),epoch=useRef(0),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[operation,setOperation]=useState<string|null>(null);
 const invalidate=useCallback(()=>{epoch.current++;lock.current=false;setBusy(false);setError(null);setOperation(null);},[]);
 useLayoutEffect(()=>{latest.current=port;},[port]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 // Lifecycle invalidation must reset presentation even when a held request never settles.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{invalidate();},[port.generation,port.gate.focused,port.gate.foreground,port.gate.moving,invalidate]);
 const generation=port.generation;
 const current=useCallback(()=>mounted.current&&latest.current.generation===generation&&latest.current.current(generation),[generation]);
 const guard=useCallback((kind:'read'|'control'|'terminal'='control')=>{
  const p=latest.current;if(!current())throw Error('ACCOUNT_CHANGED');
  if(!p.gate.signedIn)throw Error('RACE_AUTH_REQUIRED');
  if(!p.gate.focused||!p.gate.foreground)throw Error('RACE_REVIEW_REQUIRED');
  if(kind!=='terminal'&&p.gate.moving)throw Error('RACE_MOVING');
  if(kind==='control'&&(!p.ready||!p.fresh||!p.gate.online||!p.gate.profileReady))throw Error('RACE_UNAVAILABLE');
  p.guard(generation,kind);return p;
 },[current,generation]);
 const run=useCallback(async(task:(fresh:RaceScreenPort)=>Promise<string|null|void>,kind:'read'|'control'|'terminal'='control')=>{
  let sequence:number|null=null;
  try{const p=guard(kind);if(lock.current&&kind!=='terminal')return;sequence=++epoch.current;lock.current=true;setBusy(true);setError(null);const result=await task(p);if(current()&&sequence===epoch.current&&latest.current.gate.focused&&latest.current.gate.foreground){if(typeof result==='string')setOperation(result);}}
  catch(value){if(current()&&(sequence===null||sequence===epoch.current))setError(raceErrorKey(value));}
  finally{if(current()&&sequence===epoch.current){lock.current=false;setBusy(false);}}
 },[current,guard]);
 const enabled=port.gate.signedIn&&port.ready&&port.fresh&&port.gate.profileReady&&port.gate.online&&port.gate.focused&&port.gate.foreground&&!port.gate.moving;
 const terminalEnabled=port.gate.signedIn&&port.ready&&port.gate.focused&&port.gate.foreground;
 return {latest,current,guard,run,invalidate,enabled,terminalEnabled,busy,error,operation,setError};
}
