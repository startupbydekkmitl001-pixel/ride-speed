import {randomUUID} from 'expo-crypto';
import {router,usePathname} from 'expo-router';
import React,{createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {AppState as NativeAppState,Platform} from 'react-native';
import {RaceCoordinator} from '../features/races/RaceCoordinator';
import {RaceAttemptCoordinator,type FrozenRaceCandidate} from '../features/races/RaceAttemptCoordinator';
import {buildRaceEvidence} from '../features/races/evidenceModel';
import {raceEvidenceStorage as raceEvidenceStore} from '../features/races/evidenceStorage';
import {uploadRaceEvidence,requestRaceVerification} from '../features/races/evidenceService';
import {canonicalRace} from '../features/races/model';
import {cancelRaceActivation,getRace,getRaceAttempt,getRaceCourse,getRaceOperation,getRaceResults,heartbeatRace,listRaceApprovals,listRaceAttempts,listRaces,mutateRace,probeRaceClock,publishRaceStage} from '../features/races/service';
import type {AttemptSnapshot,RaceReceipt,RaceRequest} from '../features/races/types';
import type {RaceAttemptBinding,RaceBinding,RaceConsent,RaceCreateSelection,RaceMemberBinding,RaceScreenPort,ReviewedRaceCreation} from '../features/races/uiTypes';
import type {OriginalCaptureBinding} from '../features/races/OriginalCaptureBus';
import {getRouteProjection,listRoutesOwner} from '../features/routes/syncService';
import {assertAttempt,assertMember,assertRace,assertReview,assertSelection} from '../features/races/ui/presentationModel';
import {useApp} from './AppState';
import {isAccountCurrent,useAuth,type AuthScope} from './AuthState';
import {useRide} from './RideState';
import {useSocial} from './SocialState';
import {RaceReader} from './RaceReader';

const mono=()=>performance.now(),wall=()=>Date.now(),closedOwners=new Set<string>(),closures=new Set<{owner:string;close:()=>void}>();
// Enable only after reviewed migration/worker/retention and native paired-device
// acceptance. An env flag alone never creates a course/operator approval.
const pilotEnabled=false;
type RaceView='hub'|'detail'|'results'|'rematch';
type RaceContext={port:RaceScreenPort;view:RaceView;back:()=>void;stopCompetitiveAttempt:()=>Promise<void>};
const Context=createContext<RaceContext|null>(null);
export async function clearRaceAccount(scope:AuthScope){if(!scope.userId)return;closedOwners.add(scope.userId);for(const value of closures)if(value.owner===scope.userId)value.close();await raceEvidenceStore.closeOwner(scope);}
function consent(value:RaceConsent){if(value.acknowledgement_version!==1||value.evidence_consent_version!==1)throw Error('RACE_CONSENT');}

export function RaceProvider({children}:{children:React.ReactNode}){
 const app=useApp(),auth=useAuth(),ride=useRide(),social=useSocial(),pathname=usePathname(),{scope,session}=auth;
 const appRef=useRef(app),authRef=useRef(auth),rideRef=useRef(ride),socialRef=useRef(social),alive=useRef(true),foreground=useRef(NativeAppState.currentState==='active'),focus=useRef(pathname==='/races');
 const life=useRef(0),[revision,setRevision]=useState(0),[active,setActive]=useState(()=>NativeAppState.currentState==='active'),[view,setView]=useState<RaceView>('hub');
 const portRef=useRef<RaceScreenPort|null>(null),attemptRef=useRef<RaceAttemptCoordinator|null>(null),receipts=useRef(new Map<string,RaceReceipt>()),snapshots=useRef(new Map<string,AttemptSnapshot>()),candidates=useRef(new Map<string,FrozenRaceCandidate>()),reviews=useRef(new WeakMap<ReviewedRaceCreation,{generation:string;fingerprint:string}>());
 const terminalIntents=useRef(new Map<string,Promise<string|null>>());
 const terminalCleanup=useRef(new Set<string>());
 const scopeControllers=useRef(new Map<AuthScope,Set<RaceAttemptCoordinator>>());
 useLayoutEffect(()=>{appRef.current=app;authRef.current=auth;rideRef.current=ride;socialRef.current=social;},[app,auth,ride,social]);
 const current=useCallback(()=>alive.current&&isAccountCurrent(scope)&&!closedOwners.has(scope.userId??''),[scope]);
 const rememberTerminal=useCallback((key:string,task:Promise<string|null>)=>{terminalIntents.current.set(key,task);const forget=()=>{if(terminalIntents.current.get(key)===task)terminalIntents.current.delete(key);};void task.then(id=>{if(id===null)forget();},forget);while(terminalIntents.current.size>64)terminalIntents.current.delete(terminalIntents.current.keys().next().value!);return task;},[]);
 const guardOwner=useCallback(()=>{if(!current())throw Error('ACCOUNT_CHANGED');},[current]);
 const eligible=useCallback(()=>current()&&foreground.current&&NativeAppState.currentState==='active'&&appRef.current.ready&&appRef.current.storageError!=='LOCAL_READ_FAILED'&&authRef.current.session?.user.id===scope.userId,[current,scope]);
 const signed=useCallback(()=>{guardOwner();if(!foreground.current)throw Error('RACE_UNAVAILABLE');if(!appRef.current.ready||appRef.current.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');const jwt=authRef.current.session;if(!jwt||jwt.user.id!==scope.userId)throw Error('RACE_AUTH_REQUIRED');return jwt;},[guardOwner,scope]);
 // The reader stores ports; credentials and refs are read only during I/O.
 // eslint-disable-next-line react-hooks/refs
 const reader=useMemo(()=>new RaceReader({guard:()=>{signed();},list:cursor=>listRaces(scope,signed(),cursor),routes:cursor=>listRoutesOwner(scope,signed(),30,cursor),race:id=>getRace(scope,signed(),id),course:id=>getRaceCourse(scope,signed(),id),attempt:id=>getRaceAttempt(scope,signed(),id),attempts:async id=>(await listRaceAttempts(scope,signed(),id)).items,results:id=>getRaceResults(scope,signed(),id),approvals:(id,rev)=>listRaceApprovals(scope,signed(),id,rev)}),[scope,signed]);
 const read=useSyncExternalStore(reader.subscribe,reader.getSnapshot,reader.getSnapshot);
 const adoptReceipt=useCallback(async(value:RaceReceipt)=>{guardOwner();receipts.current.set(value.operation_id,value);while(receipts.current.size>64)receipts.current.delete(receipts.current.keys().next().value!);const result=value.result;if('attempt'in result)snapshots.current.set(result.attempt.id,result.attempt);
  if(!eligible())return;
  if('race'in result){if(reader.getSnapshot().selectedId===result.race.id)await reader.refreshDetail();else if(result.action==='race_create'){await reader.open(result.race.id);setView('detail');}}
  if('attempt'in result&&reader.getSnapshot().selectedId===result.attempt.race_id)await reader.refreshDetail();
  if(['race_ready','race_unready'].includes(result.action))await reader.refreshDetail();
  guardOwner();attemptRef.current?.acceptReceipt(value);attemptRef.current?.reconcile();
 },[guardOwner,eligible,reader]);
 // eslint-disable-next-line react-hooks/refs
 const coordinator=useMemo(()=>new RaceCoordinator({ownerId:scope.userId??'',current,eligible,monotonicNow:mono,
  read:()=>{guardOwner();const owned=appRef.current.getOwned();if(!owned||appRef.current.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');return{operations:owned.raceOperations};},
  update:async reduce=>{guardOwner();const owned=appRef.current.getOwned();if(!owned||appRef.current.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');const next=reduce({operations:owned.raceOperations});if(!appRef.current.update({raceOperations:next.operations}))throw Error('LOCAL_WRITE_FAILED');},
  flush:async()=>{guardOwner();await appRef.current.flushStorage();guardOwner();},operationId:randomUUID,nowISO:()=>new Date().toISOString(),send:op=>mutateRace(scope,signed(),op),status:id=>getRaceOperation(scope,signed(),id),cancelActivation:op=>cancelRaceActivation(scope,signed(),op),refresh:adoptReceipt,
 }),[scope,current,eligible,guardOwner,signed,adoptReceipt]);
 const queue=useSyncExternalStore(coordinator.subscribe,coordinator.getSnapshot,coordinator.getSnapshot);
 const persistCandidate=useCallback(async(candidate:FrozenRaceCandidate)=>{guardOwner();if(candidate.binding.scope!==scope||candidate.attempt.owner_id!==scope.userId)throw Error('ACCOUNT_CHANGED');const previous=candidates.current.get(candidate.attempt.id);if(previous&&previous!==candidate)throw Error('RACE_EVIDENCE_BOUND');candidates.current.set(candidate.attempt.id,candidate);
  const before=appRef.current.getOwned();if(!before)throw Error('LOCAL_READ_FAILED');if(before.raceEvidence.length>=32&&!before.raceEvidence.some(r=>r.attempt_id===candidate.attempt.id))throw Error('RACE_CAPACITY');const original=await rideRef.current.readOriginalCapture(candidate.binding,candidate.firstSequence,candidate.lastSequence);guardOwner();const frozen=buildRaceEvidence({...candidate,read:original}),reference=await raceEvidenceStore.put(scope,candidate.attempt.id,frozen);guardOwner();const owned=appRef.current.getOwned();if(!owned)throw Error('LOCAL_READ_FAILED');const existing=owned.raceEvidence.find(r=>r.attempt_id===reference.attempt_id);if(existing&&canonicalRace(existing)!==canonicalRace(reference))throw Error('RACE_EVIDENCE_BOUND');if(!appRef.current.update({raceEvidence:[...owned.raceEvidence.filter(r=>r.attempt_id!==reference.attempt_id),reference]}))throw Error('LOCAL_WRITE_FAILED');await appRef.current.flushStorage();guardOwner();
 },[scope,guardOwner]);
 const abortInternal=useCallback(async(reason:Extract<RaceRequest,{action:'attempt_abort'}>['reason'],binding?:OriginalCaptureBinding)=>{guardOwner();const canonical=reader.getSnapshot().attempt,selected=binding?[...snapshots.current.values()].find(a=>a.capture_id===binding.captureId&&a.ride_id===binding.rideId&&(a.state==='armed'||a.state==='reserved'))??canonical:canonical;if(!selected||selected.owner_id!==scope.userId||binding&&(selected.capture_id!==binding.captureId||selected.ride_id!==binding.rideId)||!['reserved','armed'].includes(selected.state))return null;const key=`${selected.id}:${selected.revision}:${reason}`,existing=terminalIntents.current.get(key);if(existing)return existing;
  const task=Promise.resolve().then(async()=>{guardOwner();const owned=appRef.current.getOwned();if(!owned)throw Error('LOCAL_READ_FAILED');const intents=owned.raceStopIntents??[],prior=intents.find(s=>s.attempt_id===selected.id);if(prior&&(prior.capture_id!==selected.capture_id||prior.race_id!==selected.race_id))throw Error('RACE_CAPTURE_MISMATCH');if(!prior&&!appRef.current.update({raceStopIntents:[...intents,{attempt_id:selected.id,race_id:selected.race_id,capture_id:selected.capture_id,reason}]}))throw Error('LOCAL_WRITE_FAILED');await appRef.current.flushStorage();guardOwner();return coordinator.enqueue({schema_version:1,action:'attempt_abort',attempt_id:selected.id,expected_revision:selected.revision,reason:prior?.reason??reason});});return rememberTerminal(key,task);},[guardOwner,reader,scope,coordinator,rememberTerminal]);
 // One controller per own canonical attempt. It passively consumes the recorder.
 // eslint-disable-next-line react-hooks/refs
 const attemptController=useMemo(()=>new RaceAttemptCoordinator({ownerId:scope.userId??'',originalCapture:ride.originalCapture,monotonicNow:mono,wallNow:wall,uuid:randomUUID,
  current:(binding)=>current()&&binding.scope===scope&&(rideRef.current.originalCapture.getBinding()===binding||candidates.current.get(read.attemptId??'')?.binding===binding),
  getCurrent:()=>{const value=reader.getSnapshot(),binding=rideRef.current.originalCapture.getBinding(),race=value.race,attempt=value.attempt,course=value.course;if(!race||!attempt||!course||!binding)return null;const scheduleCurrent=race.schedule_epoch===attempt.schedule_epoch&&race.common_start_at===attempt.common_start_at;return{race,attempt,course,binding,foreground:foreground.current&&NativeAppState.currentState==='active',fresh:value.detailFresh&&!value.detailError&&scheduleCurrent};},
  probe:value=>probeRaceClock(scope,signed(),value),stage:value=>publishRaceStage(scope,signed(),value),heartbeat:value=>heartbeatRace(scope,signed(),value),enqueue:value=>coordinator.enqueue(value),receipt:id=>receipts.current.get(id)??null,cancelActivation:id=>coordinator.cancelActivation(id),abort:async(reason,binding)=>{await abortInternal(reason,binding);},onFrozenCandidate:persistCandidate,
 }),[scope,current,reader,coordinator,signed,ride.originalCapture,read.attemptId,abortInternal,persistCandidate]);
 const attemptState=useSyncExternalStore(attemptController.subscribe,attemptController.getSnapshot,attemptController.getSnapshot);
 useLayoutEffect(()=>{const registry=scopeControllers.current,controllers=registry.get(scope)??new Set<RaceAttemptCoordinator>();registry.set(scope,controllers);controllers.add(attemptController);attemptRef.current=attemptController;return()=>{controllers.delete(attemptController);if(!controllers.size)registry.delete(scope);if(attemptRef.current===attemptController)attemptRef.current=null;attemptController.close();};},[attemptController,scope]);
 useLayoutEffect(()=>{if(read.attempt)snapshots.current.set(read.attempt.id,read.attempt);},[read.attempt]);
 useLayoutEffect(()=>{if(focus.current===(pathname==='/races'))return;focus.current=pathname==='/races';life.current++;setRevision(life.current);reviews.current=new WeakMap();coordinator.suspend();},[pathname,coordinator]);
 useEffect(()=>{alive.current=true;const close=()=>{coordinator.close();reader.close();for(const controller of scopeControllers.current.get(scope)??[])controller.close();receipts.current.clear();snapshots.current.clear();candidates.current.clear();terminalIntents.current.clear();reviews.current=new WeakMap();};const closure={owner:scope.userId??'',close};closures.add(closure);return()=>{closures.delete(closure);alive.current=false;close();};},[scope,coordinator,reader]);
 useEffect(()=>{const changed=(value:string)=>{const next=value==='active'&&(Platform.OS!=='web'||typeof document==='undefined'||document.visibilityState!=='hidden');if(next===foreground.current)return;foreground.current=next;life.current++;setRevision(life.current);setActive(next);reviews.current=new WeakMap();if(!next){attemptRef.current?.suspend('background');coordinator.suspend();reader.suspend();}else if(eligible()){void reader.refresh();void coordinator.retry();}};const listener=NativeAppState.addEventListener('change',changed),visible=()=>changed(NativeAppState.currentState);if(Platform.OS==='web'&&typeof document!=='undefined')document.addEventListener('visibilitychange',visible);return()=>{listener.remove();if(Platform.OS==='web'&&typeof document!=='undefined')document.removeEventListener('visibilitychange',visible);};},[coordinator,reader,eligible]);
 useEffect(()=>{if(!auth.ready||!app.ready||!session||!active||!eligible())return;void coordinator.retry();if(pathname==='/races')void reader.refresh();},[auth.ready,app.ready,session,active,pathname,eligible,coordinator,reader]);
 // A stop remains the user's durable intent even if a late arm ACK advances
 // the server revision. Settle the exact unknown operation first; only a new
 // canonical revision may create a new terminal operation, never rewrite one.
 const stopSignature=JSON.stringify(app.data.raceStopIntents??[]),pendingSignature=JSON.stringify(app.data.raceOperations);
 useEffect(()=>{if(!eligible()||!read.detailFresh||!read.attempt)return;const attempt=read.attempt,owned=appRef.current.getOwned(),intent=owned?.raceStopIntents?.find(s=>s.attempt_id===attempt.id);if(!owned||!intent||intent.race_id!==attempt.race_id||intent.capture_id!==attempt.capture_id)return;
  if(['verified','rejected','aborted','dnf'].includes(attempt.state)){if(appRef.current.update({raceStopIntents:owned.raceStopIntents.filter(s=>s.attempt_id!==attempt.id)}))void appRef.current.flushStorage().catch(()=>{});return;}
  if(!['reserved','armed'].includes(attempt.state)||owned.raceOperations.some(op=>'attempt_id'in op.request&&op.request.attempt_id===attempt.id))return;
  const key=`${attempt.id}:${attempt.revision}:${intent.reason}`;if(terminalIntents.current.has(key))return;const task=coordinator.enqueue({schema_version:1,action:'attempt_abort',attempt_id:attempt.id,expected_revision:attempt.revision,reason:intent.reason});rememberTerminal(key,task);
 },[read.attempt,read.detailFresh,active,eligible,coordinator,rememberTerminal,stopSignature,pendingSignature,queue.latest]);
 useEffect(()=>{const attempt=read.attempt;if(!eligible()||!read.detailFresh||!attempt||!['verified','rejected','aborted','dnf'].includes(attempt.state))return;const owned=appRef.current.getOwned(),ref=owned?.raceEvidence.find(r=>r.attempt_id===attempt.id);if(!owned||!ref||ref.race_id!==attempt.race_id||ref.capture_id!==attempt.capture_id||owned.raceOperations.some(op=>'attempt_id'in op.request&&op.request.attempt_id===attempt.id)||terminalCleanup.current.has(attempt.id))return;terminalCleanup.current.add(attempt.id);
  void raceEvidenceStore.removeTerminal(scope,ref).then(async()=>{guardOwner();const fresh=appRef.current.getOwned();if(!fresh||fresh.raceOperations.some(op=>'attempt_id'in op.request&&op.request.attempt_id===attempt.id))return;if(!appRef.current.update({raceEvidence:fresh.raceEvidence.filter(r=>r.attempt_id!==attempt.id)}))throw Error('LOCAL_WRITE_FAILED');await appRef.current.flushStorage();guardOwner();candidates.current.delete(attempt.id);}).catch(()=>{/* Canonical terminal state still renders; local storage recovery remains visible. */}).finally(()=>{terminalCleanup.current.delete(attempt.id);});
 },[scope,read.attempt,read.detailFresh,eligible,guardOwner,pendingSignature]);
 useEffect(()=>{
  if(!active||!session)return;
  let stopped=false,reading=false;
  const tick=setInterval(()=>{if(eligible())attemptController.tick();},50);
  const refresh=setInterval(()=>{
   if(stopped||reading||!eligible())return;
   const phase=attemptController.getSnapshot().phase;
   if(pathname==='/races'||!['idle','invalid','candidate'].includes(phase)){
    reading=true;
    void reader.refreshDetail().then(()=>{if(!stopped&&eligible())attemptController.reconcile();}).finally(()=>{reading=false;});
   }
   if(pathname==='/races')void coordinator.retry();
  },6000);
  return()=>{stopped=true;clearInterval(tick);clearInterval(refresh);};
 },[active,session,eligible,reader,coordinator,attemptController,pathname]);
 // A host may keep an accepted lobby open without arming a recording or
 // granting location access. Ready leases use the controller's stricter lane.
 useEffect(()=>{
  if(!pilotEnabled||!active||!session||Platform.OS==='web'||pathname!=='/races')return;
  let stopped=false,pending=false;
  const heartbeat=async()=>{
   if(stopped||pending||!eligible()||!focus.current)return;
   const state=reader.getSnapshot(),race=state.race;
   if(!state.detailFresh||state.detailError||!race||race.mode!=='live'||race.state!=='lobby'||race.creator_id!==scope.userId||race.self_member.state!=='accepted'||race.self_ready)return;
   pending=true;
   try{
    await heartbeatRace(scope,signed(),{race_id:race.id,member_generation:race.self_member.member_generation,ready_lease_id:null,attempt_id:null,stage_proof_id:null,clock_probe_ids:null});
    if(stopped||!eligible()||!focus.current)return;
    const fresh=reader.getSnapshot();
    if(fresh.race?.id!==race.id||fresh.race.lobby_epoch!==race.lobby_epoch||fresh.race.self_member.member_generation!==race.self_member.member_generation)return;
    // The normal bounded read lane adopts canonical state; do not spend
    // another two read RPCs for each heartbeat acknowledgment.
   }catch{/* Canonical reads show expiry; a heartbeat never creates readiness. */}
   finally{pending=false;}
  };
  const timer=setInterval(()=>{void heartbeat();},5000);
  return()=>{stopped=true;clearInterval(timer);};
 },[active,session,pathname,scope,eligible,signed,reader]);
 const generation=`${scope.generation}:${revision}`;
 const callGuard=(g:string,kind:'read'|'control'|'terminal')=>{guardOwner();if(g!==`${scope.generation}:${life.current}`)throw Error('RACE_CHANGED');if(!foreground.current||NativeAppState.currentState!=='active'||!focus.current)throw Error('RACE_CHANGED');signed();if(kind!=='terminal'&&rideRef.current.movingLocked)throw Error('RACE_MOVING');if(kind==='control'&&(!pilotEnabled||!socialRef.current.profileReady))throw Error(pilotEnabled?'RACE_PROFILE_REQUIRED':'RACE_DISABLED');};
 const exactRace=(binding:RaceBinding)=>assertRace(portRef.current!,binding),exactMember=(binding:RaceMemberBinding)=>assertMember(portRef.current!,binding),exactAttempt=(binding:RaceAttemptBinding)=>assertAttempt(portRef.current!,binding);
 const requireDetail=()=>{const value=reader.getSnapshot();if(!value.detailFresh||value.detailError||!value.race)throw Error('RACE_CHANGED');};
 const reviewed=async(selection:RaceCreateSelection)=>{callGuard(generation,'read');const p=portRef.current!;assertSelection(p,selection);const projection=await getRouteProjection(scope,signed(),selection.route_id);callGuard(generation,'read');assertSelection(portRef.current!,selection);if(!projection||projection.revision!==selection.route_revision||projection.geometryHash===null||projection.category==='bicycle')throw Error('RACE_CHANGED');const approval=portRef.current!.approvals.items.find(a=>a.id===selection.approval_id)!;const value:ReviewedRaceCreation={...selection,friends:selection.friends.map(f=>({...f})),approval:{...approval},projection:{route_id:projection.id,revision:projection.revision,title:projection.title,category:projection.category,segments:projection.segments.map(s=>s.map(c=>({...c}))),geometryStatus:projection.geometryStatus,privacyTrimMeters:200,geometryHash:projection.geometryHash,provider:projection.provider,attribution:projection.attribution},reviewed_projection_hash:projection.geometryHash};reviews.current.set(value,{generation,fingerprint:canonicalRace(value)});return value;};
 const finish=async(binding:RaceAttemptBinding)=>{callGuard(generation,'terminal');const a=exactAttempt(binding);if(!['armed','upload_pending','queued','verifying'].includes(a.state))throw Error('RACE_ATTEMPT_CHANGED');if(a.state==='armed')await attemptController.retryCandidate();callGuard(generation,'terminal');const reference=appRef.current.getOwned()?.raceEvidence.find(r=>r.attempt_id===a.id);if(!reference)throw Error('RACE_STAGE_UNAVAILABLE');const text=await raceEvidenceStore.read(scope,reference);callGuard(generation,'terminal');let own=reader.getSnapshot().attempt;if(!own||own.id!==a.id)throw Error('RACE_ATTEMPT_CHANGED');if(own.state==='armed'){const operation=await coordinator.enqueue({schema_version:1,action:'evidence_bind',attempt_id:own.id,expected_revision:own.revision,capture_id:reference.capture_id,first_sequence:reference.first_sequence,last_sequence:reference.last_sequence,sample_count:reference.sample_count,byte_length:reference.byte_length,sha256:reference.sha256});callGuard(generation,'terminal');if(!operation||!receipts.current.has(operation))return operation;own=reader.getSnapshot().attempt;}
  if(!own?.evidence)throw Error('RACE_EVIDENCE_UNAVAILABLE');const guardUpload=()=>callGuard(generation,'terminal');await uploadRaceEvidence(scope,signed(),reference,own.evidence,text,guardUpload);guardUpload();if(own.state==='upload_pending'){const id=await coordinator.enqueue({schema_version:1,action:'evidence_queue',attempt_id:own.id,expected_revision:own.revision,sha256:reference.sha256});guardUpload();if(!id||!receipts.current.has(id))return id;}await requestRaceVerification(scope,signed(),a.id,guardUpload);guardUpload();await reader.refreshDetail();return null;
 };
 const visible=app.ready&&isAccountCurrent(scope)&&!closedOwners.has(scope.userId??'')&&app.storageError!=='LOCAL_READ_FAILED';
 const subscribeCapture=useCallback((listener:()=>void)=>ride.originalCapture.subscribe(listener),[ride.originalCapture]);
 const readCapture=useCallback(()=>ride.originalCapture.getBinding(),[ride.originalCapture]);
 const nativeBinding=useSyncExternalStore(subscribeCapture,readCapture,readCapture),captureReady=!!nativeBinding&&nativeBinding.scope===scope&&nativeBinding.platform!=='web'&&nativeBinding.startedMonotonicMs!==null;
 const p:RaceScreenPort={ownerId:scope.userId,generation,gate:{signedIn:!!session,profileReady:social.profileReady,native:Platform.OS!=='web',foreground:active,focused:pathname==='/races',moving:ride.movingLocked,online:Platform.OS!=='web'||typeof navigator==='undefined'||navigator.onLine},current:g=>current()&&g===`${scope.generation}:${life.current}`,guard:callGuard,
  ready:visible&&!!session&&read.loaded,fresh:visible&&read.fresh&&active,loading:!auth.ready||!app.ready||read.racesPage.loading,busy:queue.busy,error:app.storageError??queue.error??read.error,pilotEnabled,
  races:visible?read.races:[],racesPage:read.racesPage,routes:visible?read.routes:[],routesPage:read.routesPage,friends:visible?social.friends.filter(f=>f.state==='accepted').map(f=>({user_id:f.user_id,friendship_generation:f.generation,name:f.display_name,handle:f.handle})):[],friendsPage:{...social.pages.friends,fresh:social.fresh&&!social.pages.friends.error},approvals:read.approvals,race:visible?read.race:null,detailLoading:read.detailLoading,detailFresh:visible&&read.detailFresh&&active,detailError:read.detailError,course:visible?read.course:null,courseLoading:read.courseLoading,courseError:read.courseError,attempt:visible?read.attempt:null,results:visible?read.results:null,resultsLoading:read.resultsLoading,resultsFresh:visible&&read.resultsFresh&&active,resultsError:read.resultsError,
  countdown:{phase:attemptState.phase==='invalid'?'invalid':attemptState.phase==='running'?'running':attemptState.phase==='countdown'?'countdown':attemptState.phase==='preparing'||attemptState.phase==='pending'?'preparing':attemptState.phase==='ready'?'waiting':'idle',secondsRemaining:attemptState.secondsRemaining,uncertaintyMs:attemptState.uncertaintyMs,error:attemptState.error,observedMonotonicMs:attemptState.observedMonotonicMs},eligibility:{captureReady,stageReady:attemptState.stageReady,clockReady:attemptState.clockReady,canSchedule:!!read.race&&read.race.creator_id===scope.userId&&read.race.state==='lobby'&&Array.isArray(read.race.schedule_ready)&&read.race.schedule_ready.length>=2&&read.race.members.filter(m=>m.state==='accepted').length===read.race.schedule_ready.length,attemptLimitReached:read.attempt?.ordinal===3&&['verified','rejected','aborted','dnf'].includes(read.attempt.state)},pending:visible?app.data.raceOperations:[],latest:queue.latest,reviewRequired:queue.reviewRequired,retryAfterMs:queue.retryAfterMs,
  refresh:async()=>{callGuard(generation,'read');await Promise.allSettled([reader.refresh(),socialRef.current.refresh()]);callGuard(generation,'read');},loadMore:async()=>{callGuard(generation,'read');await reader.list(true);},loadMoreRoutes:async()=>{callGuard(generation,'read');await reader.routes(true);},loadMoreFriends:async()=>{callGuard(generation,'read');await socialRef.current.loadMoreFriends();},
  openRace:async id=>{callGuard(generation,'read');attemptController.suspend('capture_changed');await reader.open(id);callGuard(generation,'read');setView('detail');},loadApprovals:async route=>{callGuard(generation,'read');await reader.loadApprovals(route);},reviewCreate:reviewed,
  create:async(review,c)=>{callGuard(generation,'control');consent(c);assertReview(portRef.current!,review);const saved=reviews.current.get(review);if(!saved||saved.generation!==generation||saved.fingerprint!==canonicalRace(review))throw Error('RACE_CHANGED');return coordinator.enqueue({schema_version:1,action:'race_create',race_id:randomUUID(),mode:review.mode,approval_id:review.approval_id,route_id:review.route_id,route_revision:review.route_revision,reviewed_projection_hash:review.reviewed_projection_hash,starts_at:review.starts_at,ends_at:review.ends_at,friends:review.friends,...c});},
  memberAction:async(binding,decision,c)=>{callGuard(generation,decision==='accept'?'control':'terminal');if(decision==='accept')requireDetail();const r=exactMember(binding);if(r.self_member.friendship_generation===null)throw Error('RACE_MEMBER_CHANGED');if(decision==='accept'){if(!c)throw Error('RACE_CONSENT');consent(c);return coordinator.enqueue({schema_version:1,action:'member_action',race_id:r.id,expected_revision:r.revision,expected_member_generation:r.self_member.member_generation,expected_friendship_generation:r.self_member.friendship_generation,decision,...c});}return coordinator.enqueue({schema_version:1,action:'member_action',race_id:r.id,expected_revision:r.revision,expected_member_generation:r.self_member.member_generation,expected_friendship_generation:r.self_member.friendship_generation,decision});},
  loadCourse:async binding=>{callGuard(generation,'read');requireDetail();exactMember(binding);await reader.loadCourse();},loadResults:async binding=>{callGuard(generation,'read');requireDetail();exactRace(binding);await reader.loadResults();callGuard(generation,'read');setView('results');},
  reserve:async(binding,c)=>{callGuard(generation,'control');requireDetail();consent(c);const r=exactMember(binding),b=rideRef.current.originalCapture.getBinding();if(!b||b.scope!==scope||b.platform==='web')throw Error('RACE_CAPTURE_MISMATCH');if(!reader.getSnapshot().course){await reader.loadCourse();callGuard(generation,'control');requireDetail();exactMember(binding);}if(rideRef.current.originalCapture.getBinding()!==b||!reader.getSnapshot().course)throw Error('RACE_CAPTURE_MISMATCH');return coordinator.enqueue({schema_version:1,action:'attempt_reserve',race_id:r.id,expected_revision:r.revision,expected_member_generation:r.self_member.member_generation,attempt_id:randomUUID(),ride_id:b.rideId,capture_id:b.captureId,platform:b.platform,provider:b.provider as 'ios_core_location'|'expo_location',vehicle_local_id:appRef.current.vehicle?.id??null});},
  arm:async(binding,c)=>{callGuard(generation,'control');requireDetail();consent(c);exactAttempt(binding);const r=reader.getSnapshot().race;if(!r)throw Error('RACE_CHANGED');return attemptController.prepare(r.mode);},readyAttempt:async(binding,c)=>{callGuard(generation,'control');requireDetail();consent(c);exactAttempt(binding);return attemptController.ready();},
  unready:async binding=>{callGuard(generation,'terminal');const r=exactMember(binding);attemptController.suspend('user_stop');if(!r.self_ready)throw Error('RACE_READY_CHANGED');return coordinator.enqueue({schema_version:1,action:'race_unready',race_id:r.id,expected_member_generation:r.self_member.member_generation,expected_ready_revision:r.self_ready.revision,expected_ready_lease_id:r.self_ready.lease_id});},schedule:async binding=>{callGuard(generation,'control');requireDetail();const r=exactRace(binding);if(!portRef.current?.eligibility.canSchedule||!r.schedule_ready)throw Error('RACE_NOT_READY');return coordinator.enqueue({schema_version:1,action:'race_schedule',race_id:r.id,expected_revision:r.revision,lobby_epoch:r.lobby_epoch,ready:r.schedule_ready});},
  cancel:async binding=>{callGuard(generation,'terminal');const r=exactRace(binding);attemptController.suspend('user_stop');return coordinator.enqueue({schema_version:1,action:'race_cancel',race_id:r.id,expected_revision:r.revision,reason:'user_cancel'});},abort:async binding=>{callGuard(generation,'terminal');exactAttempt(binding);attemptController.suspend('user_stop');await abortInternal('user_stop');return null;},retry:async id=>{callGuard(generation,'control');await coordinator.retry(id);},cancelActivation:async id=>{callGuard(generation,'terminal');attemptController.suspend('user_stop');await coordinator.cancelActivation(id);},finishAttempt:finish,rematch:async binding=>{callGuard(generation,'read');exactRace(binding);await Promise.allSettled([reader.refresh(),socialRef.current.refresh()]);callGuard(generation,'read');setView('rematch');},
  onSignIn:()=>router.push('/auth'),onEditProfile:()=>router.push('/auth/profile'),onBack:()=>setView('hub'),
 };
 useLayoutEffect(()=>{portRef.current=p;});
 return <Context.Provider value={{port:p,view,back:()=>setView('hub'),stopCompetitiveAttempt:async()=>{guardOwner();attemptController.suspend('user_stop');await abortInternal('user_stop');}}}>{children}</Context.Provider>;
}
export function useRace(){const value=useContext(Context);if(!value)throw Error('RaceProvider is required');return value;}
