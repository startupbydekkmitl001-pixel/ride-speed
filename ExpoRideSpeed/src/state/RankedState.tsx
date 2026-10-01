import {randomUUID} from 'expo-crypto';
import React,{createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {AppState as NativeAppState} from 'react-native';
import {RankedCoordinator} from '../features/ranked/RankedCoordinator';
import {RankedReportReview} from '../features/ranked/RankedReportReview';
import {getRankedPage} from '../features/ranked/service';
import {getRankedOperation,sendRankedMutation} from '../features/ranked/publicationService';
import type {RankedPage,RankedRequest,RankedRow} from '../features/ranked/types';
import type {StoredRankedOperation} from '../features/ranked/publicationModel';
import {useApp} from './AppState';
import {isAccountCurrent,useAuth,type AuthScope} from './AuthState';
import {useRide} from './RideState';
import {useSocial} from './SocialState';
const closedOwners=new Set<string>(),closures=new Set<{owner:string;close:()=>void}>();
const monotonicNow=()=>performance.now();
/** Only after server-confirmed deletion, before removing owner local data. */
export function clearRankedAccount(scope:AuthScope){if(!scope.userId)return;closedOwners.add(scope.userId);for(const entry of closures)if(entry.owner===scope.userId)entry.close();}
type RankedState={ready:boolean;pending:readonly StoredRankedOperation[];busy:boolean;error:string|null;latest:ReturnType<RankedCoordinator['getSnapshot']>['latest'];retryAfterMs:number|null;appliedVersion:number;mutate:(request:RankedRequest)=>Promise<string|null>;retry:()=>Promise<void>;reportTarget:ReturnType<RankedReportReview['getSnapshot']>;armReport:(page:RankedPage,recordId:string,userId:string)=>string;reviewReport:(token:string)=>Promise<RankedRow|null>;currentReport:(token:string)=>boolean;clearReport:(token:string)=>void};
const Context=createContext<RankedState|null>(null),empty:StoredRankedOperation[]=[];
export function RankedProvider({children}:{children:React.ReactNode}){
 const auth=useAuth(),app=useApp(),ride=useRide(),social=useSocial(),{scope}=auth;
 const refs=useRef({auth,app,social,moving:ride.movingLocked}),foreground=useRef(NativeAppState.currentState==='active');
 const [active,setActive]=useState(()=>NativeAppState.currentState==='active'),[appliedVersion,setAppliedVersion]=useState(0),[closedScope,setClosedScope]=useState<AuthScope|null>(null);
 useLayoutEffect(()=>{refs.current={auth,app,social,moving:ride.movingLocked};},[auth,app,social,ride.movingLocked]);
 const guard=useCallback(()=>{if(!isAccountCurrent(scope)||closedOwners.has(scope.userId??''))throw Error('ACCOUNT_CHANGED');},[scope]);
 const canSend=useCallback(()=>{guard();const state=refs.current;return foreground.current&&NativeAppState.currentState==='active'&&!state.moving&&state.auth.ready&&!!state.auth.session&&state.auth.session.user.id===scope.userId&&state.app.ready&&state.app.storageError!=='LOCAL_READ_FAILED';},[guard,scope]);
 const signed=useCallback(()=>{guard();if(!canSend())throw Error('RANKED_INACTIVE');return refs.current.auth.session!;},[guard,canSend]);
 const reportGuard=useCallback(()=>{signed();const state=refs.current;if(state.app.data.rankedOperations.some(op=>op.request.action==='publication_set'&&op.request.audience==='private')||state.social.pending.some(op=>op.request.action==='friend_action'&&['block','remove'].includes(op.request.verb)))throw Error('RANKED_CHANGED');},[signed]);
 // The constructor stores ports; it never dispatches a read during render.
 // eslint-disable-next-line react-hooks/refs
 const report=useMemo(()=>new RankedReportReview({ownerId:scope.userId??'',guard:reportGuard,token:randomUUID,page:async(filter,cursor)=>getRankedPage(scope,signed(),filter,cursor)}),[scope,signed,reportGuard]);
 const reportTarget=useSyncExternalStore(report.subscribe,report.getSnapshot,report.getSnapshot);
 // Constructor stores ports. Reads happen only at dispatch, after rendering.
 // eslint-disable-next-line react-hooks/refs
 const coordinator=useMemo(()=>new RankedCoordinator({ownerId:scope.userId??'',guard,canSend,
  read:()=>{guard();const owned=refs.current.app.getOwned();if(!owned||refs.current.app.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');return owned.rankedOperations;},
  update:async reduce=>{guard();const owned=refs.current.app.getOwned();if(!owned)throw Error('LOCAL_READ_FAILED');const rankedOperations=reduce(owned.rankedOperations);if(!refs.current.app.update({rankedOperations}))throw Error(refs.current.app.storageError??'LOCAL_WRITE_FAILED');await refs.current.app.flushStorage();guard();},
  flush:async()=>{guard();await refs.current.app.flushStorage();guard();},operationId:randomUUID,nowISO:()=>new Date().toISOString(),monotonicNow,
  send:op=>sendRankedMutation(scope,signed(),op),status:op=>getRankedOperation(scope,signed(),op),
  applied:async()=>{guard();setAppliedVersion(value=>value+1);},
 }),[scope,guard,canSend,signed]);
 const queue=useSyncExternalStore(coordinator.subscribe,coordinator.getSnapshot,coordinator.getSnapshot);
 useEffect(()=>{const close=()=>{coordinator.close();report.close();setClosedScope(scope);};const entry={owner:scope.userId??'',close};closures.add(entry);return()=>{closures.delete(entry);coordinator.close();report.close();};},[scope,coordinator,report]);
 useEffect(()=>{const listener=NativeAppState.addEventListener('change',state=>{foreground.current=state==='active';if(!foreground.current)report.clear();setActive(foreground.current);});return()=>listener.remove();},[report]);
 useLayoutEffect(()=>{if(ride.movingLocked)report.clear();},[ride.movingLocked,report]);
 const privacyPending=app.data.rankedOperations.some(op=>op.request.action==='publication_set'&&op.request.audience==='private')||social.pending.some(op=>op.request.action==='friend_action'&&['block','remove'].includes(op.request.verb));
 const privacyKey=JSON.stringify([privacyPending,appliedVersion,social.accountRevision,social.latest?.operationId??null]);
 useLayoutEffect(()=>{report.clear();},[report,privacyKey]);
 const ready=auth.ready&&app.ready&&closedScope!==scope&&!closedOwners.has(scope.userId??'')&&app.storageError!=='LOCAL_READ_FAILED';
 useEffect(()=>{if(ready&&active&&auth.session&&!ride.movingLocked)void coordinator.retry();},[ready,active,auth.session,ride.movingLocked,coordinator]);
 const retry=async()=>{guard();signed();await refs.current.app.retryStorage();signed();await coordinator.retry();guard();};
 return <Context.Provider value={{ready,pending:ready&&scope.userId?app.data.rankedOperations:empty,busy:ready&&queue.busy,error:app.storageError??queue.error,latest:ready?queue.latest:null,retryAfterMs:queue.retryAfterMs,appliedVersion,
  mutate:async request=>{guard();signed();if(request.action==='report_record')report.assertReviewed(request);return coordinator.enqueue(request);},retry,
  reportTarget:ready&&!privacyPending?reportTarget:null,armReport:(page,recordId,userId)=>{reportGuard();return report.arm(page,recordId,userId);},reviewReport:token=>report.review(token),currentReport:token=>{try{reportGuard();return report.current(token);}catch{return false;}},clearReport:token=>report.clear(token),
 }}>{children}</Context.Provider>;
}
export function useRanked(){const state=useContext(Context);if(!state)throw Error('RankedProvider is required');return state;}
