import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useScreenActivity} from '../../lib/useScreenActivity';
import type {PublicationBasePort} from './publicationUITypes';
/** Local form leases never authorize a provider mutation after screen exit. */
export function usePublicationAction(port:PublicationBasePort){
 const activity=useScreenActivity(),latest=useRef(port),epoch=useRef(0),locked=useRef(false);const[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 useLayoutEffect(()=>{latest.current=port;},[port]);
 const editTicket=activity.capture(),editGeneration=port.generation;
 // A retained local setter carries the render's activity lease just like a
 // transport task. It never acquires a fresh lease for an obsolete callback.
 const canEdit=()=>{try{const current=latest.current;if(editTicket===null||!activity.accepts(editTicket)||!current.current(editGeneration)||!current.ready||!current.gate.signedIn||!current.gate.active||current.gate.moving||!current.gate.online||locked.current)return false;current.guard(editGeneration);return true;}catch{return false;}};
 const invalidate=useCallback(()=>{++epoch.current;locked.current=false;setBusy(false);setError(null);},[]);
 // A policy boundary retires unfinished form work and releases its spinner.
 // These are transport leases, not animation/render-derived state.
 // eslint-disable-next-line react-hooks/set-state-in-effect,react-hooks/exhaustive-deps
 useLayoutEffect(()=>{invalidate();return()=>{++epoch.current;locked.current=false;};},[port.generation,port.gate.active,port.gate.moving,activity.generation,invalidate]);
 const run=async<T,>(task:(guard:()=>void)=>Promise<T>):Promise<T|null>=>{
  const snapshot=latest.current,ticket=activity.capture(),version=epoch.current,generation=snapshot.generation;
  const guard=()=>{if(version!==epoch.current||ticket===null||!activity.accepts(ticket)||!latest.current.current(generation))throw Error('RANKED_CHANGED');latest.current.guard(generation);if(!latest.current.gate.online)throw Error('RANKED_UNAVAILABLE');};
  try{guard();if(locked.current)return null;locked.current=true;setBusy(true);setError(null);const value=await task(guard);guard();return value;}catch(value){if(version===epoch.current&&activity.accepts(ticket))setError(value instanceof Error?value.message:'RANKED_UNAVAILABLE');return null;}finally{if(version===epoch.current){locked.current=false;setBusy(false);}}
 };
 return {busy,error,run,invalidate,canEdit};
}
