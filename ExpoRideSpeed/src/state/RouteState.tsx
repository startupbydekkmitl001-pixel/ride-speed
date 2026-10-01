import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState as NativeAppState, Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useApp } from './AppState';
import { isAccountCurrent, useAuth, type AuthScope } from './AuthState';
import { useRide } from './RideState';
import { RouteCoordinator } from '../features/routes/RouteCoordinator';
import { fingerprintRoute, type RouteLocalGeometry, type RouteLocalRecord, type RouteRecordInput } from '../features/routes/localModel';
import { parseBuilderDraft, type StoredBuilderDraft } from '../features/routes/persistenceModel';
import { calculateRoad, searchPlaces } from '../features/routes/routeService';
import { deleteRoute, getRouteOwner, getRouteProjection, listRoutesOwner, saveRoute } from '../features/routes/syncService';
import type { RouteCursor, RouteProjection, RouteSnapshot } from '../features/routes/syncTypes';
import type { BuilderDraft, Coordinate, RoadResult, RoutingProfile, SearchResult } from '../features/routes/types';

const closedOwners = new Set<string>(), closures = new Set<{ owner:string; close:()=>void }>();
/** Invoke only after a confirmed server deletion, before local removal finishes. */
export function clearRouteAccount(scope:AuthScope) {
 if (!scope.userId) return;
 closedOwners.add(scope.userId); for (const entry of closures) if (entry.owner === scope.userId) entry.close();
}
type RouteState = {
 ready:boolean; records:RouteLocalRecord[]; draft:StoredBuilderDraft|null; consent:boolean;
 status:ReturnType<RouteCoordinator['getSnapshot']>['status']; error:string|null;
 conflicts:ReturnType<RouteCoordinator['getSnapshot']>['conflicts'];
 updateDraft:(value:StoredBuilderDraft|null)=>boolean; allowPlanning:()=>Promise<void>;
 save:(input:RouteRecordInput,options?:{existingOnly?:boolean})=>Promise<boolean>;
 remove:(localId:string)=>Promise<boolean>; retry:()=>Promise<void>;
 resolveConflict:(localId:string,choice:'cloud'|'local')=>Promise<boolean>;
 search:(query:string,language:'th'|'en',signal?:AbortSignal)=>Promise<SearchResult>;
 calculate:(stops:readonly Coordinate[],profile:RoutingProfile,signal?:AbortSignal)=>Promise<RoadResult>;
 projection:(cloudId:string)=>Promise<RouteProjection|null>;
};
const Context = createContext<RouteState|null>(null);
export function RouteProvider({children}:{children:React.ReactNode}) {
 const app=useApp(),auth=useAuth(),ride=useRide(),{scope,session}=auth;
 const appRef=useRef(app),authRef=useRef(auth),rideRef=useRef(ride);
 useLayoutEffect(()=>{appRef.current=app;authRef.current=auth;rideRef.current=ride;},[app,auth,ride]);
 const [tick,setTick]=useState(0),[closedScope,setClosedScope]=useState<AuthScope|null>(null);
 const closed=closedScope===scope||closedOwners.has(scope.userId??'guest');
 const guard=useCallback(()=>{if(!isAccountCurrent(scope)||closedOwners.has(scope.userId??'guest'))throw Error('ACCOUNT_CHANGED');},[scope]);
 const editing=useCallback(()=>{guard();if(rideRef.current.movingLocked)throw Error('ROUTE_MOVING_LOCKED');},[guard]);
 const coordinator=useMemo(()=>{
  const current=()=>{if(!isAccountCurrent(scope)||closedOwners.has(scope.userId??'guest'))throw Error('ACCOUNT_CHANGED');};
  const signed=()=>{current();const value=authRef.current.session;if(!value)throw Error('AUTH_REQUIRED');return value;};
  // Ports are called after render; their refs pin current owner storage and JWT.
  // eslint-disable-next-line react-hooks/refs
  return new RouteCoordinator({guard:current,hasSession:()=>!!authRef.current.session,
   read:()=>{current();const owned=appRef.current.getOwned();if(!owned)throw Error('LOCAL_READ_FAILED');return owned;},
   flush:async()=>{current();await appRef.current.flushStorage();current();},
   write:async patch=>{current();if(!appRef.current.update(patch))throw Error(appRef.current.storageError??'LOCAL_WRITE_FAILED');await appRef.current.flushStorage();current();},
   operation:randomUUID,
   fetch:async id=>getRouteOwner(scope,signed(),id),
   list:async()=>{
    const jwt=signed(),items:RouteSnapshot[]=[];let cursor:RouteCursor|null=null;
    for(let page=0;page<4;page++) { const result=await listRoutesOwner(scope,jwt,50,cursor);current();items.push(...result.items);if(!result.next_cursor)return items;cursor=result.next_cursor; }
    throw Error('ROUTE_TOO_LARGE');
   },
   save:async draft=>saveRoute(scope,signed(),draft),
   remove:async draft=>deleteRoute(scope,signed(),draft),
  });
 },[scope]);
 const state=useSyncExternalStore(coordinator.subscribe,coordinator.getSnapshot,coordinator.getSnapshot);
 useEffect(()=>{const item={owner:scope.userId??'guest',close:()=>{coordinator.close();setClosedScope(scope);}};closures.add(item);return()=>{closures.delete(item);coordinator.close();};},[scope,coordinator]);
 const signature=useMemo(()=>JSON.stringify(app.data.routeRecords.map(record=>[record.localId,fingerprintRoute(record.document),record.sync])),[app.data.routeRecords]);
 const lastAttempt=useRef<{coordinator:RouteCoordinator;signature:string;tick:number;session:typeof session}|null>(null);
 useEffect(()=>{
  if(!auth.ready||!app.ready||closed||app.storageError==='LOCAL_READ_FAILED')return;
  const last=lastAttempt.current;if(last?.coordinator===coordinator&&last.signature===signature&&last.tick===tick&&last.session===session)return;
  lastAttempt.current={coordinator,signature,tick,session};void coordinator.sync();
 },[auth.ready,app.ready,app.storageError,closed,coordinator,signature,tick,session]);
 useEffect(()=>{const timer=setInterval(()=>{if(NativeAppState.currentState==='active')setTick(n=>n+1);},30000),listener=NativeAppState.addEventListener('change',value=>{if(value==='active')setTick(n=>n+1);}),online=()=>setTick(n=>n+1);if(Platform.OS==='web')window.addEventListener('online',online);return()=>{clearInterval(timer);listener.remove();if(Platform.OS==='web')window.removeEventListener('online',online);};},[]);
 const updateDraft=useCallback((input:StoredBuilderDraft|null)=>{editing();const value=input===null?null:parseBuilderDraft(input);if(input!==null&&!value)throw Error('ROUTE_INVALID');return appRef.current.update({routeDraft:value});},[editing]);
 const allowPlanning=useCallback(async()=>{editing();if(!appRef.current.update({routeConsent:true}))throw Error('LOCAL_WRITE_FAILED');await appRef.current.flushStorage();guard();},[editing,guard]);
 const search=useCallback(async(query:string,language:'th'|'en',signal?:AbortSignal)=>{editing();return searchPlaces(scope,authRef.current.session,query,language,appRef.current.getOwned()?.routeConsent===true,undefined,signal);},[editing,scope]);
 const calculate=useCallback(async(stops:readonly Coordinate[],profile:RoutingProfile,signal?:AbortSignal)=>{editing();return calculateRoad(scope,authRef.current.session,stops,profile,appRef.current.getOwned()?.routeConsent===true,signal);},[editing,scope]);
 const projection=useCallback(async(id:string)=>{guard();const current=authRef.current.session;if(!current)throw Error('AUTH_REQUIRED');const result=await getRouteProjection(scope,current,id);guard();return result;},[guard,scope]);
 const visible=app.ready&&!closed;
 return <Context.Provider value={{ready:visible,records:visible?app.data.routeRecords:[],draft:visible?app.data.routeDraft:null,consent:visible&&app.data.routeConsent,status:closed?'local':state.status,error:app.storageError??state.error,conflicts:state.conflicts,
  updateDraft,allowPlanning,
  save:async(input,options)=>{editing();return coordinator.save(input,options);},remove:async id=>{editing();return coordinator.remove(id);},
  retry:async()=>{guard();await appRef.current.retryStorage();await coordinator.sync();},resolveConflict:async(id,choice)=>{editing();return coordinator.resolveConflict(id,choice);},search,calculate,projection,
 }}>{children}</Context.Provider>;
}
export function useRoutes(){const value=useContext(Context);if(!value)throw Error('RouteProvider is required');return value;}
export function builderGeometry(value:BuilderDraft):RouteLocalGeometry|null {
 const geometry=value.geometry;if(!geometry)return null;
 return {segments:geometry.segments,distanceMeters:geometry.distanceMeters,durationSeconds:geometry.durationSeconds,geometryHash:null,provider:geometry.kind==='road'?'geoapify':'recorded',calculatedAt:geometry.calculatedAt??null,attribution:geometry.attribution??null};
}
