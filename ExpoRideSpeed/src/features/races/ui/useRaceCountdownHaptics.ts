import {useEffect,useLayoutEffect,useRef} from 'react';
import {Platform} from 'react-native';
import * as Haptics from 'expo-haptics';
import {useScreenActivity} from '../../../lib/useScreenActivity';
import {countdownCueFrame,RaceCountdownCueLedger} from '../countdownCueModel';
import type {RaceCountdownCue} from '../countdownCueModel';
import type {RaceScreenPort} from '../uiTypes';

// Shared across Lobby remounts, with no persisted location, consent or clock state.
const ledger=new RaceCountdownCueLedger();

function dispatch(cue:RaceCountdownCue):void{
 try{
  const response=Platform.OS==='android'
   ?Haptics.performAndroidHapticsAsync(cue==='start'?Haptics.AndroidHaptics.Confirm:Haptics.AndroidHaptics.Clock_Tick)
   :Haptics.impactAsync(cue==='start'?Haptics.ImpactFeedbackStyle.Medium:Haptics.ImpactFeedbackStyle.Light);
  void response.catch(()=>{/* OS settings, Low Power Mode and unavailable hardware may suppress feedback. */});
 }catch{/* Optional feedback never blocks countdown, stopping or evidence recovery. */}
}

/** No timer and no per-frame state. React receives the parent's integer countdown bins. */
export function useRaceCountdownHaptics(port:RaceScreenPort):void{
 const {capture,accepts,generation}=useScreenActivity(),latest=useRef(port),active=useRef<{key:string;ticket:number|null}|null>(null);
 useLayoutEffect(()=>{latest.current=port;},[port]);
 useEffect(()=>()=>{ledger.suspend(active.current?.key??null);active.current=null;},[]);
 useEffect(()=>{
  const previous=active.current;
  // This also catches a complete OS background/resume before React renders.
  if(previous&&!accepts(previous.ticket))ledger.suspend(previous.key);
  const ticket=capture();
  const suspend=()=>{ledger.suspend(active.current?.key??null);};
  if(ticket===null||latest.current!==port||!['ios','android'].includes(Platform.OS)){suspend();return;}
  try{
   port.guard(port.generation,'control');
   const frame=countdownCueFrame(port);
   if(!frame){suspend();return;}
   if(previous&&previous.key!==frame.scheduleKey)ledger.suspend(previous.key);
   active.current={key:frame.scheduleKey,ticket};
   const now=performance.now();
   const cue=ledger.observe(frame,now);
   if(!cue)return;
   // Use the controller's original observation, never render/commit time. A delayed
   // render or passive effect cannot make an obsolete countdown bin fresh again.
   const sourceAge=now-frame.observedMonotonicMs;
   if(!Number.isFinite(sourceAge)||sourceAge<0||sourceAge>300){suspend();return;}
   // Repeat both guards immediately at the native dispatch boundary. Failed calls are never retried.
   if(!accepts(ticket)||latest.current!==port||!countdownCueFrame(latest.current)){suspend();return;}
   port.guard(port.generation,'control');
   dispatch(cue);
  }catch{suspend();}
 },[port,generation,capture,accepts]);
}
