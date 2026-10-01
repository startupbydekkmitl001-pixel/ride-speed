import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {communityErrorKey} from '../../lib/communityI18n';
import type {CommunityBasePort,CommunityGuard} from './uiTypes';
export function useCommunityUI<TPort extends CommunityBasePort>(port:TPort,options:{requireProfile?:boolean}={}){
 const requireProfile=options.requireProfile!==false;
 const latest=useRef(port),mounted=useRef(true),epoch=useRef(0),lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[operation,setOperation]=useState<string|null>(null);
 useLayoutEffect(()=>{latest.current=port;},[port]);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const invalidate=useCallback(()=>{epoch.current++;lock.current=false;setBusy(false);setError(null);setOperation(null);},[]);
 // A held promise cannot keep a reopened/foreground presentation locked. Durable operations stay in the parent.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{invalidate();},[port.generation,port.gate.focused,port.gate.foreground,port.gate.moving,invalidate]);
 const generation=port.generation,current=useCallback(()=>mounted.current&&latest.current.generation===generation&&latest.current.current(generation),[generation]);
 const guard=useCallback((kind:CommunityGuard='control')=>{const p=latest.current;if(!current())throw Error('ACCOUNT_CHANGED');if(!p.gate.signedIn&&kind!=='navigation')throw Error('COMMUNITY_AUTH_REQUIRED');if(!p.gate.focused||!p.gate.foreground)throw Error('COMMUNITY_REVIEW_REQUIRED');if(p.gate.moving)throw Error('COMMUNITY_MOVING');if(!p.ready&&kind!=='navigation')throw Error('LOCAL_READ_FAILED');if(kind==='control'&&(!p.gate.online||requireProfile&&!p.gate.profileReady))throw Error('COMMUNITY_UNAVAILABLE');p.guard(generation,kind);return p;},[current,generation,requireProfile]);
 const run=useCallback(async(task:(fresh:TPort)=>Promise<string|null|void>|string|null|void,kind:CommunityGuard='control')=>{let sequence:number|null=null;try{const p=guard(kind);if(lock.current&&kind!=='navigation')return;sequence=++epoch.current;lock.current=true;setBusy(true);setError(null);const result=await task(p);if(current()&&sequence===epoch.current&&latest.current.gate.focused&&latest.current.gate.foreground){if(typeof result==='string')setOperation(result);}}catch(value){if(current()&&(sequence===null||sequence===epoch.current))setError(communityErrorKey(value));}finally{if(current()&&sequence===epoch.current){lock.current=false;setBusy(false);}}},[current,guard]);
 const edit=useCallback(async(task:(fresh:TPort)=>Promise<boolean|void>)=>{try{const p=guard('edit'),success=await task(p);if(!current())return;if(success===false)throw Error('LOCAL_WRITE_FAILED');}catch(value){if(current())setError(communityErrorKey(value));}},[current,guard]);
 const canEdit=port.gate.signedIn&&port.ready&&port.gate.focused&&port.gate.foreground&&!port.gate.moving;
 return {latest,current,guard,run,edit,invalidate,busy,error,operation,setError,canEdit,canNavigate:port.gate.focused&&port.gate.foreground&&!port.gate.moving,enabled:canEdit&&port.gate.online&&(!requireProfile||port.gate.profileReady)};
}
