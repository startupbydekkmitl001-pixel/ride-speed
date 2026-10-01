import React,{createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import * as Location from 'expo-location';
import { randomUUID } from 'expo-crypto';
import { AppState,Platform } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import RideLocation from '../../modules/ride-location';
import { useRideSession,locationCapture } from '../useRideSession';
import { useApp } from './AppState';
import { useAuth,isAccountCurrent,type AuthScope } from './AuthState';
import { DurableRideQueue } from '../features/rides/DurableRideQueue';
import { journalPort } from '../features/rides/journalPort';
import { acceptSample,activateCapture,beginCapture,createRide,currentDuration,endCapture,finishRide,persistedRide,type JournalRide,type JournalReceipt } from '../features/rides/journalModel';
import type { MapFix } from '../features/map/MapSurface.types';
import { toRideSummary } from '../features/rides/syncModel';
import { syncRideSummary,listRideSummaries } from '../features/rides/syncService';
import type { RideHistoryItem,RideHistoryCursor } from '../features/rides/syncTypes';
import { errorKey } from '../lib/i18n';
import { LiveCaptureBus } from '../features/live/LiveCaptureBus';
import type { LiveCapturePort } from '../features/live/captureTypes';
import {OriginalCaptureBus,type OriginalCaptureBinding,type OriginalCapturePort,type OriginalCaptureRead} from '../features/races/OriginalCaptureBus';

const queue=new DurableRideQueue();
const closedListeners=new Set<(owner:string)=>void>();
const mono=()=>performance.now();
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
export async function clearRideAccount(scope:AuthScope){if(scope.userId){const removal=queue.closeOwner(scope.userId,()=>journalPort.removeOwner(scope.userId!));for(const listener of closedListeners)listener(scope.userId);await removal;}}
type RideState=ReturnType<typeof useRideSession>&{
 ready:boolean;busy:boolean;error:string|null;ride:JournalRide|null;history:JournalRide[];
 metrics:{distanceMeters:number;durationSeconds:number;averageMps:number|null};userFix:MapFix|null;locating:boolean;
 pause:()=>Promise<void>;resume:()=>Promise<string|null>;finish:()=>Promise<void>;retrySave:()=>Promise<void>;refreshHistory:()=>Promise<void>;locate:(signal?:AbortSignal)=>Promise<void>;
 movingLocked:boolean;setPassengerOverride:()=>void;
 liveCapture:LiveCapturePort;
 originalCapture:OriginalCapturePort;readOriginalCapture:(binding:OriginalCaptureBinding,firstSequence:number,lastSequence:number)=>Promise<OriginalCaptureRead>;
 cloudHistory:RideHistoryItem[];cloudMore:boolean;cloudError:boolean;syncing:boolean;retrySync:()=>void;loadMoreCloud:()=>Promise<void>;
};
const Context=createContext<RideState|null>(null);
function Awake(){useKeepAwake();return null;}
export function RideProvider({children}:{children:React.ReactNode}){
 const {scope,session,ready:authReady}=useAuth(),{vehicle}=useApp();
 const [owned,setOwned]=useState<{scope:AuthScope;ride:JournalRide|null;history:JournalRide[];ready:boolean;error:string|null;durationMs:number}|null>(null);
 const [busy,setBusy]=useState(false),[fix,setFix]=useState<{scope:AuthScope;value:MapFix}|null>(null),[locating,setLocating]=useState(false);
 const [moving,setMoving]=useState(false),[passenger,setPassenger]=useState(false);
 const [captureOwner,setCaptureOwner]=useState<{scope:AuthScope;rideId:string}|null>(null);
 const [attemptOwner,setAttemptOwner]=useState<AuthScope|null>(null);
 const boundCapture=useRef<{scope:AuthScope;rideId:string}|null>(null);
 const [cloud,setCloud]=useState<{scope:AuthScope;items:RideHistoryItem[];cursor:RideHistoryCursor|null;error:boolean}|null>(null),[syncTick,setSyncTick]=useState(0),[syncing,setSyncing]=useState(false);
 const syncRunning=useRef<AuthScope|null>(null),cloudRunning=useRef<AuthScope|null>(null);
 const lastSyncAttempt=useRef<{scope:AuthScope;signature:string;tick:number;session:typeof session}|null>(null);
 const current=useRef<{scope:AuthScope;ride:JournalRide}|null>(null),operation=useRef(false),idle=useRef<Promise<void>|null>(null),alive=useRef(true);
 const captureRef=useRef<ReturnType<typeof useRideSession>>(null!);
 const liveReady=useRef(false),liveForeground=useRef(AppState.currentState==='active'),liveScope=useRef(scope);
 // Construction only stores the guard. Refs are read by subsequent capture events.
 // eslint-disable-next-line react-hooks/refs
 const [liveCapture]=useState(()=>new LiveCaptureBus(binding=>{const r=current.current,c=r?.ride.captures.at(-1);return alive.current&&liveReady.current&&liveForeground.current&&!!binding.scope.userId&&isAccountCurrent(binding.scope)&&!queue.isClosed(binding.scope.userId)&&r?.scope===binding.scope&&r.ride.status==='recording'&&boundCapture.current?.scope===binding.scope&&boundCapture.current.rideId===r.ride.id&&c?.id===binding.captureId&&c.segmentId===binding.segmentId;}));
 // This raw tap preserves failed observations under the recorder's owner/lifecycle guard.
 // eslint-disable-next-line react-hooks/refs
 const [originalCapture]=useState(()=>new OriginalCaptureBus(binding=>{const r=current.current,c=r?.ride.captures.at(-1);return alive.current&&liveReady.current&&liveForeground.current&&!!binding.scope.userId&&isAccountCurrent(binding.scope)&&!queue.isClosed(binding.scope.userId)&&r?.scope===binding.scope&&r.ride.status==='recording'&&boundCapture.current?.scope===binding.scope&&boundCapture.current.rideId===r.ride.id&&c?.id===binding.captureId&&c.segmentId===binding.segmentId&&c.provider===binding.provider&&!c.truncated;}));
 useLayoutEffect(()=>liveCapture.subscribe(event=>{if(event.kind==='invalidated')originalCapture.invalidate(event.reason);}),[liveCapture,originalCapture]);
 useLayoutEffect(()=>{if(liveScope.current!==scope){liveCapture.invalidate('account_changed');liveScope.current=scope;}liveReady.current=authReady&&!!session&&owned?.scope===scope&&owned.ready&&!owned.error;},[authReady,session,scope,owned,liveCapture]);
 useEffect(()=>{const changed=(value:string)=>{liveForeground.current=value==='active'&&(Platform.OS!=='web'||typeof document==='undefined'||document.visibilityState!=='hidden');if(!liveForeground.current)liveCapture.invalidate('background');};const listener=AppState.addEventListener('change',changed);const visible=()=>changed(AppState.currentState);if(Platform.OS==='web'&&typeof document!=='undefined')document.addEventListener('visibilitychange',visible);return()=>{listener.remove();if(Platform.OS==='web'&&typeof document!=='undefined')document.removeEventListener('visibilitychange',visible);};},[liveCapture]);
 useEffect(()=>{const closed=(owner:string)=>{if(owner!==scope.userId||!isAccountCurrent(scope))return;liveCapture.invalidate('account_deleted');setOwned({scope,ride:null,history:[],ready:false,error:null,durationMs:0});setCloud(null);setFix(null);setMoving(false);setSyncing(false);void captureRef.current.stopAsync().catch(()=>{});};closedListeners.add(closed);return()=>{closedListeners.delete(closed);};},[scope,liveCapture]);
 const publish=useCallback(()=>{const r=current.current;if(r&&isAccountCurrent(r.scope))setOwned(old=>({scope:r.scope,ride:{...r.ride,fragments:old?.ride?.rawCount===r.ride.rawCount?old.ride.fragments:[...r.ride.fragments]},history:old?.scope===r.scope?old.history:[],ready:true,error:old?.scope===r.scope?old.error:null,durationMs:currentDuration(r.ride,mono())}));},[]);
 const persist=useCallback((ride:JournalRide,receipt?:JournalReceipt)=>{
  const checkpoint=clone(persistedRide({...ride,activeDurationMs:currentDuration(ride,mono())}));queue.append(ride.ownerId,()=>journalPort.save(checkpoint,receipt));
  void queue.drain().catch(()=>{const r=current.current;if(r?.ride.id===ride.id&&isAccountCurrent(r.scope)){liveReady.current=false;liveCapture.invalidate('storage_error');setOwned(old=>old?{...old,error:'m2.ride.storageError'}:old);if(r.ride.status==='recording')captureRef.current.stop();}});
 },[liveCapture]);
 const capture=useRideSession({
  onAcquired(native){const r=current.current;if(r&&isAccountCurrent(r.scope)&&!queue.isClosed(r.ride.ownerId)&&r.ride.status==='recording'){activateCapture(r.ride,mono(),Date.now());r.ride.captures.at(-1)!.provider=native?'ios_core_location':'expo_location';persist(r.ride);publish();}},
  onSample(sample){const r=current.current;if(!r||!isAccountCurrent(r.scope)||queue.isClosed(r.ride.ownerId)||r.ride.status!=='recording')return;
   if(queue.pending>=128||r.ride.rawCount>=100000){liveCapture.invalidate('capture_limit');r.ride.captures.at(-1)!.truncated=true;captureRef.current.stop();setOwned(old=>old?{...old,error:'m2.ride.captureLimit'}:old);return;}
   const receivedMonotonicMs=mono(),receivedWallMs=Date.now();
   const receipt=acceptSample(r.ride,sample,receivedWallMs,receivedMonotonicMs);persist(r.ride,receipt);
   if(boundCapture.current?.scope===r.scope&&boundCapture.current.rideId===r.ride.id){const c=r.ride.captures.at(-1)!,platform=Platform.OS==='ios'?'ios':Platform.OS==='android'?'android':'web';liveCapture.bind({scope:r.scope,rideId:r.ride.id,captureId:receipt.captureId,segmentId:receipt.segmentId,platform});liveCapture.accept(receipt,receivedMonotonicMs,receivedWallMs);if(c.truncated)originalCapture.invalidate('capture_limit');else{originalCapture.bind({scope:r.scope,rideId:r.ride.id,captureId:c.id,segmentId:c.segmentId,platform,provider:c.provider,startedWallMs:c.startedAtMs,startedMonotonicMs:c.startedMonotonicMs??null});originalCapture.accept(receipt);}}
   if(receipt.accepted)setFix({scope:r.scope,value:{coordinate:{latitude:sample.latitude,longitude:sample.longitude},accuracyMeters:sample.horizontalAccuracyM!,timestampMs:sample.timestampMs,headingDegrees:null}});
   publish();
  },
  onSnapshot(snapshot){const r=current.current;if(!r||!isAccountCurrent(r.scope)||queue.isClosed(r.ride.ownerId)||r.ride.status!=='recording')return;
   if(snapshot.liveMps!==null&&snapshot.quality==='good')setMoving(snapshot.liveMps>10/3.6);
   const max=snapshot.maxMps;if(max!==null&&Number.isFinite(max)&&(r.ride.maxMps===null||max>r.ride.maxMps)){r.ride.maxMps=max;persist(r.ride);publish();}
  },
  onUnavailable(){liveCapture.invalidate('source_error');},
  onStopped(message){liveCapture.invalidate(message?'source_error':'stop');const r=current.current;if(!r||r.ride.status!=='recording')return;endCapture(r.ride,mono(),Date.now());if(message)r.ride.status='interrupted';persist(r.ride);publish();},
 });
 useLayoutEffect(()=>{captureRef.current=capture;},[capture]);
 const refreshHistory=useCallback(async()=>{await queue.drain();const history=await journalPort.list(scope.userId??'guest');if(!isAccountCurrent(scope)||!alive.current)return;
  for(const r of history)if(r.status==='recording'&&current.current?.ride.id!==r.id){r.status='interrupted';persist(r);}await queue.drain();if(!isAccountCurrent(scope))return;
  if(current.current?.scope!==scope){const pending=history.find(r=>r.status==='paused'||r.status==='interrupted');if(pending)current.current={scope,ride:pending};}
  else if(current.current.ride.status==='complete'){const saved=history.find(r=>r.id===current.current!.ride.id);if(saved)current.current={scope,ride:saved};}
  const selected=current.current?.scope===scope?current.current.ride:null;
  setOwned({scope,ride:selected?{...selected}:null,history,ready:true,error:null,durationMs:selected?currentDuration(selected,mono()):0});
 },[scope,persist]);
 useEffect(()=>{
  if(!authReady||!isAccountCurrent(scope))return;let valid=true;
  void(async()=>{await captureRef.current.stopAsync();await queue.drain();if(!valid||!isAccountCurrent(scope))return;setFix(null);setBusy(false);setMoving(false);setPassenger(false);setOwned({scope,ride:null,history:[],ready:false,error:null,durationMs:0});current.current=null;const history=await journalPort.list(scope.userId??'guest');
   if(!valid||!isAccountCurrent(scope))return;
   setLocating(false);setSyncing(false);
   for(const ride of history)if(ride.status==='recording'){ride.status='interrupted';ride.captures.at(-1)!.endedAtMs=null;persist(ride);}
   await queue.drain();if(!valid||!isAccountCurrent(scope))return;
   const pending=history.find(r=>r.status==='paused'||r.status==='interrupted')??null;if(pending)current.current={scope,ride:pending};
   setOwned({scope,ride:pending,history,ready:true,error:null,durationMs:pending?.activeDurationMs??0});
  })().catch(()=>{if(valid&&isAccountCurrent(scope))setOwned({scope,ride:null,history:[],ready:false,error:'m2.ride.storageError',durationMs:0});});
  return()=>{valid=false;};
 },[authReady,scope,persist]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;liveCapture.invalidate('unmount');originalCapture.invalidate('unmount');void captureRef.current.stopAsync().then(()=>queue.drain()).catch(()=>{});};},[liveCapture,originalCapture]);
 useEffect(()=>{if(!capture.active)return;const timer=setInterval(()=>{const r=current.current,max=captureRef.current.snapshot.maxMps;if(r&&max!==null)r.ride.maxMps=Math.max(r.ride.maxMps??max,max);publish();},1000);return()=>clearInterval(timer);},[capture.active,publish]);
 const start=useCallback(async():Promise<string|null>=>{
  if(operation.current||!isAccountCurrent(scope)||queue.isClosed(scope.userId??'guest')||owned?.scope!==scope||!owned.ready||owned.error)return null;
  operation.current=true;liveCapture.invalidate('starting');setBusy(true);setAttemptOwner(scope);
  try{await idle.current;await queue.drain();if(!isAccountCurrent(scope))return null;
   let ride=current.current?.scope===scope?current.current.ride:null;
   if(!ride||ride.status==='complete'){ride=createRide(randomUUID(),scope.userId??'guest',Date.now(),vehicle??null);current.current={scope,ride};setPassenger(false);}
   if(ride.captures.length>=64)throw Error('m2.ride.captureLimit');
   beginCapture(ride,randomUUID(),randomUUID(),mono(),RideLocation!==null?'ios_core_location':'expo_location',true);persist(ride);await queue.drain();
   if(!isAccountCurrent(scope)||queue.isClosed(scope.userId??'guest')){endCapture(ride,mono(),Date.now());persist(ride);return null;}
   const id=await captureRef.current.start();if(queue.isClosed(ride.ownerId)){await captureRef.current.stopAsync();return null;}if(!id){endCapture(ride,mono(),Date.now());persist(ride);}else if(isAccountCurrent(scope)){const binding={scope,rideId:ride.id};boundCapture.current=binding;setCaptureOwner(binding);const c=ride.captures.at(-1)!,platform=Platform.OS==='ios'?'ios':Platform.OS==='android'?'android':'web';liveCapture.bind({scope,rideId:ride.id,captureId:c.id,segmentId:c.segmentId,platform});originalCapture.bind({scope,rideId:ride.id,captureId:c.id,segmentId:c.segmentId,platform,provider:c.provider,startedWallMs:c.startedAtMs,startedMonotonicMs:c.startedMonotonicMs??null});}publish();return id;
  }catch{const r=current.current;if(r?.scope===scope&&r.ride.status==='recording'){endCapture(r.ride,mono(),Date.now());r.ride.status='interrupted';persist(r.ride);publish();}if(isAccountCurrent(scope))setOwned(old=>old?{...old,error:old.error??'m2.ride.startError'}:old);return null;}
  finally{operation.current=false;if(isAccountCurrent(scope))setBusy(false);}
 },[scope,owned,persist,publish,vehicle,liveCapture,originalCapture]);
 const pause=useCallback(async()=>{if(!isAccountCurrent(scope)||current.current?.scope!==scope)return;liveCapture.invalidate('pause');await captureRef.current.stopAsync();await queue.drain();if(isAccountCurrent(scope))publish();},[scope,publish,liveCapture]);
 const finish=useCallback(async()=>{
  if(operation.current||!isAccountCurrent(scope)||queue.isClosed(scope.userId??'guest')||current.current?.scope!==scope)return;operation.current=true;liveCapture.invalidate('stop');setBusy(true);
  try{await captureRef.current.stopAsync();await queue.drain();const r=current.current;if(!r||r.scope!==scope||!isAccountCurrent(scope))return;
   const max=captureRef.current.snapshot.maxMps;if(max!==null)r.ride.maxMps=Math.max(r.ride.maxMps??max,max);
   finishRide(r.ride,Date.now());r.ride.operationId??=randomUUID();
   try{r.ride.summary??=toRideSummary(r.ride,Platform.OS==='ios'?'ios':Platform.OS==='android'?'android':'web');delete r.ride.syncError;}
   catch(error){r.ride.sync='local';r.ride.syncError=errorKey(error,'rideSync');}
   persist(r.ride);await queue.drain();publish();await refreshHistory();setSyncTick(n=>n+1);
  }catch{if(isAccountCurrent(scope))setOwned(old=>old?{...old,error:'m2.ride.saveError'}:old);}
  finally{operation.current=false;if(isAccountCurrent(scope))setBusy(false);}
 },[scope,persist,publish,refreshHistory,liveCapture]);
 const retrySave=useCallback(async()=>{try{await queue.drain();await refreshHistory();}catch{if(isAccountCurrent(scope))setOwned(old=>old?{...old,error:'m2.ride.storageError'}:old);}},[refreshHistory,scope]);
 const fetchCloud=useCallback(async(cursor:RideHistoryCursor|null=null)=>{
  if(!session||!isAccountCurrent(scope)||queue.isClosed(scope.userId??'guest')||cloudRunning.current===scope)return;cloudRunning.current=scope;
  try{const page=await listRideSummaries(scope,session,{limit:20,cursor});if(!isAccountCurrent(scope)||queue.isClosed(scope.userId??'guest'))return;setCloud(old=>({scope,items:cursor&&old?.scope===scope?[...old.items,...page.items.filter(item=>!old.items.some(prior=>prior.ride_id===item.ride_id))]:[...page.items],cursor:page.next_cursor,error:false}));}
  catch{if(isAccountCurrent(scope))setCloud(old=>({scope,items:old?.scope===scope?old.items:[],cursor:old?.scope===scope?old.cursor:null,error:true}));}
  finally{if(cloudRunning.current===scope)cloudRunning.current=null;}
 },[scope,session]);
 useEffect(()=>{if(authReady&&session)void Promise.resolve().then(()=>fetchCloud());},[authReady,session,fetchCloud]);
 useEffect(()=>{const timer=setInterval(()=>setSyncTick(n=>n+1),30000);const appState=AppState.addEventListener('change',state=>{if(state==='active')setSyncTick(n=>n+1);});const online=()=>setSyncTick(n=>n+1);if(Platform.OS==='web'&&typeof window!=='undefined')window.addEventListener('online',online);return()=>{clearInterval(timer);appState.remove();if(Platform.OS==='web'&&typeof window!=='undefined')window.removeEventListener('online',online);};},[]);
 const ownedHistory=owned?.scope===scope?owned.history:null;
 const pending=ownedHistory?.filter(r=>r.status==='complete'&&r.sync==='pending'&&r.summary&&r.operationId)??[];
 const pendingSignature=pending.map(r=>r.id+':'+r.operationId).join('|');
 useEffect(()=>{
  if(!authReady||!session||queue.isClosed(scope.userId??'guest')||!ownedHistory||syncRunning.current===scope||!pendingSignature)return;
  const last=lastSyncAttempt.current;if(last?.scope===scope&&last.signature===pendingSignature&&last.tick===syncTick&&last.session===session)return;
  lastSyncAttempt.current={scope,signature:pendingSignature,tick:syncTick,session};
  let canceled=false;const batch=ownedHistory.filter(r=>r.status==='complete'&&r.sync==='pending'&&r.summary&&r.operationId).slice(0,5);syncRunning.current=scope;
  void Promise.resolve().then(async()=>{if(canceled||!isAccountCurrent(scope))return;setSyncing(true);for(const item of batch){if(canceled||!isAccountCurrent(scope))break;
   let acknowledged=false;
   try{const ack=await syncRideSummary(scope,session,{operationId:item.operationId!,rideId:item.id,expectedRevision:item.revision,payload:item.summary!});if(!isAccountCurrent(scope)||queue.isClosed(item.ownerId))break;
    acknowledged=true;
    const saved={...item,revision:ack.applied_revision,sync:'synced' as const};delete saved.syncError;queue.append(item.ownerId,()=>journalPort.save(saved));await queue.drain();
    if(current.current?.scope===scope&&current.current.ride.id===item.id){current.current.ride.revision=ack.applied_revision;current.current.ride.sync='synced';delete current.current.ride.syncError;publish();}
   }catch(error){if(isAccountCurrent(scope)&&!queue.isClosed(item.ownerId)){if(acknowledged)setOwned(old=>old?.scope===scope?{...old,error:'m2.ride.storageError'}:old);else{const saved={...item,syncError:errorKey(error,'rideSync')};queue.append(item.ownerId,()=>journalPort.save(saved));await queue.drain();if(current.current?.scope===scope&&current.current.ride.id===item.id){current.current.ride.syncError=saved.syncError;publish();}}}break;}
  }if(!canceled&&isAccountCurrent(scope)){await refreshHistory();await fetchCloud();}}).catch(()=>{}).finally(()=>{if(syncRunning.current===scope)syncRunning.current=null;if(isAccountCurrent(scope))setSyncing(false);});
  return()=>{canceled=true;};
 },[authReady,session,scope,ownedHistory,pendingSignature,syncTick,publish,refreshHistory,fetchCloud]);
 const locate=useCallback(async(signal?:AbortSignal)=>{
  if(signal?.aborted||AppState.currentState!=='active'||!isAccountCurrent(scope)||queue.isClosed(scope.userId??'guest')||idle.current||captureRef.current.active)return;const requested=scope;setLocating(true);
  let suspended=false,cancel:(()=>void)|null=null;
  const wanted=()=>!suspended&&!signal?.aborted&&AppState.currentState==='active'&&isAccountCurrent(requested)&&!queue.isClosed(requested.userId??'guest')&&!captureRef.current.active;
  const abort=()=>{cancel?.();},appSubscription=AppState.addEventListener('change',state=>{if(state!=='active'){suspended=true;cancel?.();}});signal?.addEventListener('abort',abort);
  const work=(async()=>{try{const permission=await Location.getForegroundPermissionsAsync();if(!permission.granted||!wanted())return;
   if(Platform.OS==='ios'&&permission.ios?.accuracy==='reduced')return;
   let sub:Location.LocationSubscription|null=null;let timeout:ReturnType<typeof setTimeout>|null=null;let found!:()=>void;
   const firstFix=new Promise<void>(resolve=>{found=resolve;});const owner=Symbol('idle-location');
   cancel=()=>{found();void locationCapture.stop(owner).catch(()=>{});};
   try{const started=await locationCapture.start(owner,wanted,{
    start:async()=>{sub=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,distanceInterval:0,timeInterval:1000},location=>{const s=location.coords,age=Date.now()-location.timestamp;
     if(wanted()&&locationCapture.owns(owner)&&Number.isFinite(s.latitude)&&Math.abs(s.latitude)<=90&&Number.isFinite(s.longitude)&&Math.abs(s.longitude)<=180&&s.accuracy!==null&&s.accuracy>=0&&s.accuracy<=20&&!location.mocked&&age>=-500&&age<3000){setFix({scope:requested,value:{coordinate:{latitude:s.latitude,longitude:s.longitude},accuracyMeters:s.accuracy,timestampMs:location.timestamp,headingDegrees:s.heading!==null&&s.heading>=0?s.heading:null}});found();}
    });},stop:async()=>{sub?.remove();sub=null;},
   });if(started){timeout=setTimeout(found,10000);await firstFix;}}
   finally{cancel=null;if(timeout)clearTimeout(timeout);await locationCapture.stop(owner);}
  }finally{appSubscription.remove();signal?.removeEventListener('abort',abort);}})();idle.current=work;try{await work;}catch{}finally{if(idle.current===work)idle.current=null;if(isAccountCurrent(requested))setLocating(false);}
 },[scope]);
 const own=owned?.scope===scope&&!queue.isClosed(scope.userId??'guest')?owned:null,ride=own?.ride??null;
 const readOriginalCapture=useCallback(async(binding:OriginalCaptureBinding,firstSequence:number,lastSequence:number):Promise<OriginalCaptureRead>=>{
  const owner=binding.scope.userId;const guard=()=>{if(!owner||binding.scope!==scope||!alive.current||!isAccountCurrent(scope)||queue.isClosed(owner))throw Error('ACCOUNT_CHANGED');};guard();
  if(!Number.isInteger(firstSequence)||!Number.isInteger(lastSequence)||firstSequence<0||lastSequence<firstSequence||lastSequence-firstSequence+1>8000)throw Error('RACE_EVIDENCE_UNAVAILABLE');
  await queue.drain();guard();const saved=await journalPort.get(owner!,binding.rideId);guard();const c=saved?.captures.find(value=>value.id===binding.captureId&&value.segmentId===binding.segmentId);
  if(!saved||!c||c.truncated||c.provider!==binding.provider||c.startedAtMs!==binding.startedWallMs||c.startedMonotonicMs!==binding.startedMonotonicMs)throw Error('RACE_EVIDENCE_UNAVAILABLE');
  const raw=await journalPort.receipts(owner!,saved.id,c.id);guard();const selected=raw.filter(value=>value.seq>=firstSequence&&value.seq<=lastSequence);
  if(selected.length!==lastSequence-firstSequence+1||selected.some((value,index)=>value.seq!==firstSequence+index||value.captureId!==c.id||value.segmentId!==c.segmentId||!Number.isFinite(value.receivedMonotonicMs)))throw Error('RACE_EVIDENCE_UNAVAILABLE');
  return {ride:clone(saved),capture:clone(c),receipts:clone(selected)};
 },[scope]);
 const duration=own?.durationMs??0;
 const ownsCapture=captureOwner?.scope===scope&&captureOwner.rideId===ride?.id&&!!own?.ready;
 const state:RideState={...capture,liveCapture,originalCapture,readOriginalCapture,active:ownsCapture?capture.active:false,sessionId:ownsCapture?capture.sessionId:null,nativeSource:ownsCapture?capture.nativeSource:false,message:attemptOwner===scope?capture.message:null,permissionState:attemptOwner===scope?capture.permissionState:'ready',
  snapshot:ownsCapture?{...capture.snapshot,maxMps:ride?.maxMps!==null&&ride?.maxMps!==undefined?Math.max(ride.maxMps,capture.snapshot.maxMps??ride.maxMps):capture.snapshot.maxMps}:{liveMps:null,maxMps:ride?.maxMps??null,quality:'noFix',horizontalAccuracyM:null},
  start,stop:()=>{void pause().catch(()=>{});},stopAsync:pause,resetMax:()=>{if(boundCapture.current?.scope===scope&&boundCapture.current.rideId===current.current?.ride.id&&isAccountCurrent(scope))captureRef.current.resetMax();},
  getEvidence:()=>{if(boundCapture.current?.scope!==scope||boundCapture.current.rideId!==current.current?.ride.id||!isAccountCurrent(scope)||queue.isClosed(scope.userId??'guest'))return {samples:[],nativeSource:false,truncated:false,sessionId:null};const evidence=captureRef.current.getEvidence();const r=current.current;return {...evidence,truncated:evidence.truncated||!!r?.ride.captures.at(-1)?.truncated};},
  ready:own?.ready??false,busy,error:own?.error??null,ride,history:own?.history??[],metrics:{distanceMeters:ride?.distanceMeters??0,durationSeconds:duration/1000,averageMps:ride&&ride.acceptedCount&&duration>0?ride.distanceMeters/(duration/1000):null},userFix:fix?.scope===scope?fix.value:null,locating,pause,resume:start,finish,retrySave,refreshHistory,locate,movingLocked:!!own?.ready&&moving&&!passenger,setPassengerOverride:()=>setPassenger(true),cloudHistory:cloud?.scope===scope?cloud.items:[],cloudMore:cloud?.scope===scope&&!!cloud.cursor,cloudError:cloud?.scope===scope&&cloud.error,syncing:!!own?.ready&&syncing,retrySync:()=>{setSyncTick(n=>n+1);void fetchCloud();},loadMoreCloud:()=>fetchCloud(cloud?.scope===scope?cloud.cursor:null)};
 return <Context.Provider value={state}>{own?.ready&&capture.active&&<Awake />}{children}</Context.Provider>;
}
export function useRide(){const value=useContext(Context);if(!value)throw Error('RideProvider required');return value;}
