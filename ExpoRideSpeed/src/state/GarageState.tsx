import React,{createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import { AppState as NativeAppState,Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useApp } from './AppState';
import { useAuth,isAccountCurrent,type AuthScope } from './AuthState';
import type { GarageVehicle } from '../lib/domain';
import { pickGaragePhoto } from '../lib/photos';
import { GarageCoordinator,type GarageStatus } from '../features/garage/GarageCoordinator';
import { garageDocument,fingerprintGarage } from '../features/garage/localModel';
import { getGarage,syncGarage } from '../features/garage/syncService';
import { garagePhotoDrafts,getPrivateVehiclePhoto,vehiclePhotoCache,vehiclePhotoTransport } from '../features/garage/photoService';
import { expectedVehiclePhotoPath,prepareVehiclePhoto } from '../features/garage/photoPipeline';
import type { VehiclePhotoDraft } from '../features/garage/photoDraftStore';

const closedOwners=new Set<string>(),closures=new Set<{owner:string;close:()=>void}>();
/** A confirmed server deletion closes every retained callback before disk cleanup. */
export async function clearGarageAccount(scope:AuthScope){if(!scope.userId)return;closedOwners.add(scope.userId);for(const item of closures)if(item.owner===scope.userId)item.close();vehiclePhotoCache.clear(scope);await garagePhotoDrafts.removeOwner(scope.userId);}
type GarageState={ready:boolean;vehicles:GarageVehicle[];activeId:string|null;status:GarageStatus;error:string|null;save:(vehicle:GarageVehicle,options?:{existingOnly?:boolean})=>Promise<boolean>;remove:(id:string)=>Promise<boolean>;select:(id:string|null)=>Promise<boolean>;retry:()=>Promise<void>;resolveConflict:(choice:'cloud'|'local')=>Promise<void>;choosePhoto:(id:string)=>Promise<void>;getPhotoUrl:(path:string)=>Promise<string|null>;photoPreview:(id:string)=>string|null};
const Context=createContext<GarageState|null>(null);
export function GarageProvider({children}:{children:React.ReactNode}){
 const app=useApp(),auth=useAuth(),{scope,session}=auth;
 const appRef=useRef(app),authRef=useRef(auth);useLayoutEffect(()=>{appRef.current=app;authRef.current=auth;},[app,auth]);
 const [tick,setTick]=useState(0),[closedScope,setClosedScope]=useState<AuthScope|null>(null),[photos,setPhotos]=useState<{scope:AuthScope;drafts:VehiclePhotoDraft[]}|null>(null),[photoError,setPhotoError]=useState<{scope:AuthScope;error:string}|null>(null);
 const closed=closedScope===scope||closedOwners.has(scope.userId??'guest');
 const photoBusy=useRef<AuthScope|null>(null),picking=useRef<AuthScope|null>(null),photoLoadSequence=useRef(0),desired=useRef<{scope:AuthScope;ids:Map<string,string>}|null>(null);
 const coordinator=useMemo(()=>{
  const guard=()=>{if(!isAccountCurrent(scope)||closedOwners.has(scope.userId??'guest'))throw Error('ACCOUNT_CHANGED');};
  const read=()=>{guard();const owned=appRef.current.getOwned();if(!owned)throw Error('LOCAL_READ_FAILED');return owned;};
  // The constructor stores ports; it never invokes their ref-reading callbacks during render.
  // eslint-disable-next-line react-hooks/refs
  return new GarageCoordinator({guard,read,hasSession:()=>!!authRef.current.session,
   flush:async()=>{guard();await appRef.current.flushStorage();guard();},
   write:async patch=>{guard();if(!appRef.current.update(patch))throw Error(appRef.current.storageError??'LOCAL_WRITE_FAILED');await appRef.current.flushStorage();guard();},
   operation:randomUUID,
   fetch:async()=>{guard();const session=authRef.current.session;if(!session)throw Error('AUTH_REQUIRED');return getGarage(scope,session);},
   send:async draft=>{guard();const session=authRef.current.session;if(!session)throw Error('AUTH_REQUIRED');return syncGarage(scope,session,draft);},
  });
 },[scope]);
 const state=useSyncExternalStore(coordinator.subscribe,coordinator.getSnapshot,coordinator.getSnapshot);
 const ensure=useCallback(()=>{if(!isAccountCurrent(scope)||closedOwners.has(scope.userId??'guest'))throw Error('ACCOUNT_CHANGED');},[scope]);
 useEffect(()=>{desired.current={scope,ids:new Map()};const item={owner:scope.userId??'guest',close:()=>{coordinator.close();setClosedScope(scope);setPhotos(null);}};closures.add(item);return()=>{closures.delete(item);coordinator.close();vehiclePhotoCache.clear(scope);};},[scope,coordinator]);
 const loadPhotos=useCallback(async()=>{ensure();const sequence=++photoLoadSequence.current,drafts=await garagePhotoDrafts.list(scope.userId??'guest',ensure);ensure();if(sequence===photoLoadSequence.current){desired.current={scope,ids:new Map(drafts.map(d=>[d.vehicleId,d.id]))};setPhotos({scope,drafts});}return drafts;},[scope,ensure]);
 const processPhotos=useCallback(async()=>{
  if(!session||!appRef.current.ready||photoBusy.current===scope||closedOwners.has(scope.userId??'guest'))return;photoBusy.current=scope;
  try{ensure();const drafts=await loadPhotos();const latest=new Map(drafts.map(d=>[d.vehicleId,d]));
   for(const initial of [...latest.values()].slice(0,2)){
    let draft=initial;
    ensure();const before=appRef.current.getOwned()?.vehicles.find(v=>v.id===draft.vehicleId);
    if(!before){await garagePhotoDrafts.remove(scope.userId!,draft.id,ensure);continue;}
    let path=expectedVehiclePhotoPath(draft.ownerId,draft.id,draft.mime);
    const acknowledged=()=>{
     const current=appRef.current.getOwned(),sync=coordinator.getSnapshot();
     if(sync.status!=='synced'||sync.conflict||current?.garageSync.pending||current?.vehicles.find(v=>v.id===draft.vehicleId)?.photoPath!==path||desired.current?.scope!==scope||desired.current.ids.get(draft.vehicleId)!==draft.id)return false;
     const raw=current?.garageSync.cleanFingerprint;if(!raw)return false;
     try{return JSON.parse(raw).vehicles.some((v:{id:string;photoPath:string|null})=>v.id===draft.vehicleId&&v.photoPath===path);}catch{return false;}
    };
    if(!acknowledged()){
     const targetCurrent=()=>{ensure();const current=appRef.current.getOwned()?.vehicles.find(v=>v.id===draft.vehicleId);if(!current||desired.current?.scope!==scope||desired.current.ids.get(draft.vehicleId)!==draft.id||current.photoPath!==before.photoPath)throw Error('GARAGE_PHOTO_TARGET_CHANGED');};
     if(coordinator.getSnapshot().conflict)continue;
     let uploaded;
     try{uploaded=await prepareVehiclePhoto(draft,vehiclePhotoTransport(scope,session),targetCurrent);}catch(error){
      if(!(error instanceof Error&&error.message==='GARAGE_PHOTO_EXPIRED'))throw error;
      await coordinator.sync();targetCurrent();
      // Never rewrite a frozen operation whose result is still unknown.
      if(appRef.current.getOwned()?.garageSync.pending?.document.vehicles.some(v=>v.photoPath===path))throw Error('GARAGE_PHOTO_PENDING');
      draft=await garagePhotoDrafts.rotate(scope.userId!,draft.id,randomUUID(),targetCurrent);
      await loadPhotos();path=expectedVehiclePhotoPath(draft.ownerId,draft.id,draft.mime);
      uploaded=await prepareVehiclePhoto(draft,vehiclePhotoTransport(scope,session),targetCurrent);
     }targetCurrent();
     if(!await coordinator.attachPhoto(draft.vehicleId,before.photoPath,uploaded.path,targetCurrent))throw Error('GARAGE_PHOTO_UNAVAILABLE');
     await coordinator.sync();ensure();
    }
    if(acknowledged()){await garagePhotoDrafts.remove(scope.userId!,draft.id,ensure);for(const obsolete of drafts.filter(d=>d.vehicleId===draft.vehicleId&&d.id!==draft.id))await garagePhotoDrafts.remove(scope.userId!,obsolete.id,ensure);}
   }
   await loadPhotos();if(isAccountCurrent(scope))setPhotoError(null);
  }catch(error){if(error instanceof Error&&error.message==='GARAGE_PHOTO_TARGET_CHANGED'){
    if(isAccountCurrent(scope)&&!closedOwners.has(scope.userId??'guest'))setTick(n=>n+1);
   }else if(isAccountCurrent(scope)&&!closedOwners.has(scope.userId??'guest'))setPhotoError({scope,error:error instanceof Error?error.message:'GARAGE_PHOTO_UNAVAILABLE'});}
  finally{if(photoBusy.current===scope)photoBusy.current=null;}
 },[session,scope,ensure,loadPhotos,coordinator]);
 const signature=useMemo(()=>fingerprintGarage(garageDocument(app.data.vehicles,app.data.selectedVehicleId))+'|'+(app.data.garageSync.pending?.operationId??''),[app.data.vehicles,app.data.selectedVehicleId,app.data.garageSync]);
 const lastAttempt=useRef<{coordinator:GarageCoordinator;signature:string;tick:number;session:typeof session}|null>(null);
 useEffect(()=>{
  if(!auth.ready||!app.ready||closed||app.storageError==='LOCAL_READ_FAILED')return;
  const last=lastAttempt.current;if(last?.coordinator===coordinator&&last.signature===signature&&last.tick===tick&&last.session===session)return;
  lastAttempt.current={coordinator,signature,tick,session};void coordinator.sync().then(()=>processPhotos());
 },[auth.ready,app.ready,app.storageError,closed,coordinator,signature,tick,session,processPhotos]);
 useEffect(()=>{if(app.ready&&!closed)void Promise.resolve().then(()=>loadPhotos()).catch(error=>{if(isAccountCurrent(scope))setPhotoError({scope,error:error instanceof Error?error.message:'LOCAL_READ_FAILED'});});},[app.ready,scope,closed,loadPhotos]);
 useEffect(()=>{const timer=setInterval(()=>{if(NativeAppState.currentState==='active')setTick(n=>n+1);},30000);const listener=NativeAppState.addEventListener('change',v=>{if(v==='active')setTick(n=>n+1);});const online=()=>setTick(n=>n+1);if(Platform.OS==='web')window.addEventListener('online',online);return()=>{clearInterval(timer);listener.remove();if(Platform.OS==='web')window.removeEventListener('online',online);};},[]);
 const retry=useCallback(async()=>{ensure();await appRef.current.retryStorage();await coordinator.sync();await processPhotos();},[ensure,coordinator,processPhotos]);
 const choosePhoto=useCallback(async(id:string)=>{
  ensure();if(!session)throw Error('AUTH_REQUIRED');if(picking.current===scope)return;picking.current=scope;
  try{const existing=appRef.current.getOwned()?.vehicles.find(v=>v.id===id);if(!existing)throw Error('GARAGE_PHOTO_UNAVAILABLE');
   const photo=await pickGaragePhoto();ensure();if(!photo)return;if(!appRef.current.getOwned()?.vehicles.some(v=>v.id===id))throw Error('GARAGE_PHOTO_TARGET_CHANGED');
   const old=await garagePhotoDrafts.list(scope.userId!,ensure);const draft:VehiclePhotoDraft={id:randomUUID(),ownerId:scope.userId!,vehicleId:id,mime:'image/jpeg',base64:photo.base64,createdAtMs:Math.max(Date.now(),...old.map(d=>d.createdAtMs+1))};
   await garagePhotoDrafts.write(scope.userId!,draft,ensure);await loadPhotos();setPhotoError(null);setTick(n=>n+1);void processPhotos();
  }finally{if(picking.current===scope)picking.current=null;}
 },[ensure,session,scope,loadPhotos,processPhotos]);
 const getPhotoUrl=useCallback(async(path:string)=>{ensure();if(!session)return null;const vehicle=appRef.current.getOwned()?.vehicles.find(v=>v.photoPath===path);if(!vehicle)return null;const url=await getPrivateVehiclePhoto(scope,session,vehicle.id,path);ensure();if(appRef.current.getOwned()?.vehicles.find(v=>v.id===vehicle.id)?.photoPath!==path)return null;return url;},[ensure,session,scope]);
 const visible=app.ready&&!closed;const previews=photos?.scope===scope?photos.drafts:[];
 return <Context.Provider value={{ready:visible,vehicles:visible?app.data.vehicles:[],activeId:visible?app.data.selectedVehicleId:null,status:closed?'local':state.status==='synced'&&previews.length?'pending':state.status,error:app.storageError??(photoError?.scope===scope?photoError.error:null)??state.error,
  save:coordinator.save.bind(coordinator),remove:coordinator.remove.bind(coordinator),select:coordinator.select.bind(coordinator),retry,resolveConflict:coordinator.resolveConflict.bind(coordinator),choosePhoto,getPhotoUrl,
  photoPreview:id=>visible?previews.findLast(d=>d.vehicleId===id)?.base64?`data:image/jpeg;base64,${previews.findLast(d=>d.vehicleId===id)!.base64}`:null:null,
 }}>{children}</Context.Provider>;
}
export function useGarage(){const value=useContext(Context);if(!value)throw Error('GarageProvider is required');return value;}
