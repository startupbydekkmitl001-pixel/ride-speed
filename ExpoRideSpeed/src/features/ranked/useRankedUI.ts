import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {rankedErrorKey} from '../../lib/rankedI18n';
import {rankedFilterKey} from './model';
import type {RankedScreenPort} from './uiTypes';
export function useRankedUI(port:RankedScreenPort){
 const latest=useRef(port),mounted=useRef(true),epoch=useRef(0),lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 useLayoutEffect(()=>{latest.current=port;},[port]);
 useEffect(()=>{const ownedEpoch=epoch;mounted.current=true;return()=>{mounted.current=false;ownedEpoch.current++;};},[]);
 const filterKey=rankedFilterKey(port.filter);
 // A backgrounded/retired request must release only its transient presentation, never parent data.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{epoch.current++;lock.current=false;setBusy(false);setError(null);},[port.generation,port.gate.focused,port.gate.foreground,port.gate.moving,filterKey]);
 const generation=port.generation;
 const current=useCallback(()=>mounted.current&&latest.current.generation===generation&&latest.current.current(generation),[generation]);
 const guard=useCallback((kind:'read'|'filter'|'navigation'|'publication'='read')=>{
  const p=latest.current;if(!current())throw Error('ACCOUNT_CHANGED');if(!p.gate.focused||!p.gate.foreground)throw Error('RANKED_CHANGED');if(p.gate.moving)throw Error('RANKED_MOVING');
  if(kind!=='navigation'&&!p.gate.signedIn)throw Error('RANKED_AUTH_REQUIRED');if((kind==='filter'||kind==='publication')&&(!p.ready||!p.gate.online))throw Error('RANKED_UNAVAILABLE');
  p.guard(generation,kind);return p;
 },[current,generation]);
 const run=useCallback(async(task:(p:RankedScreenPort)=>void|Promise<void>,kind:'read'|'filter'|'navigation'|'publication'='read')=>{
  let sequence:number|null=null;
  try{const p=guard(kind);if(lock.current)return;sequence=++epoch.current;lock.current=true;setBusy(true);setError(null);await task(p);}
  catch(value){if(current()&&(sequence===null||sequence===epoch.current))setError(rankedErrorKey(value));}
  finally{if(current()&&sequence===epoch.current){lock.current=false;setBusy(false);}}
 },[current,guard]);
 const active=port.gate.focused&&port.gate.foreground&&!port.gate.moving;
 return {latest,guard,run,current,busy,error,setError,active,enabled:active&&port.gate.signedIn&&port.ready&&port.gate.online};
}
