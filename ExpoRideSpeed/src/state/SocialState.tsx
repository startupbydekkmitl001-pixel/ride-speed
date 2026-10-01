import {createClient,type RealtimeChannel} from '@supabase/supabase-js';
import {randomUUID} from 'expo-crypto';
import React,{createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {AppState as NativeAppState,Platform} from 'react-native';
import {useOnboardingStatus} from '../features/onboarding';
import {SocialCoordinator} from '../features/social/SocialCoordinator';
import {freshSocialStatuses,presenceClock,validatePresenceEvent} from '../features/social/presenceModel';
import {getBlockedPeople,getInvitationInbox,getSocialOperation,getSocialSnapshot,heartbeatSocial,sendSocialMutation} from '../features/social/service';
import type {BlockedPerson,FriendRow,InvitationRow,SocialLatest,SocialRequest,StatusRow,StoredSocialOperation} from '../features/social/types';
import {publicService} from '../lib/publicService';
import {useApp} from './AppState';
import {isAccountCurrent,useAuth,type AuthScope} from './AuthState';
import {useRide} from './RideState';
import {SocialReader,type SocialPageState} from './SocialReader';

const closedOwners=new Set<string>(),closures=new Set<{owner:string;close:()=>void}>();
const monotonicNow=()=>performance.now();
const emptyOperations:StoredSocialOperation[]=[];
/** Only after the server confirms deletion: stop transport before local removal. */
export function clearSocialAccount(scope:AuthScope){if(!scope.userId)return;closedOwners.add(scope.userId);for(const item of closures)if(item.owner===scope.userId)item.close();}
type SocialState={
 ready:boolean;loading:boolean;fresh:boolean;profileReady:boolean;optedIn:boolean;accountRevision:number|null;
 friends:FriendRow[];presence:StatusRow[];blocked:BlockedPerson[];invitations:InvitationRow[];
 pages:Record<'friends'|'blocked'|'invitations',SocialPageState>;
 pending:StoredSocialOperation[];busy:boolean;error:string|null;latest:SocialLatest|null;reviewRequired:string[];
 refresh:()=>Promise<void>;loadMoreFriends:()=>Promise<void>;loadMoreBlocked:()=>Promise<void>;loadMoreInvitations:()=>Promise<void>;
 mutate:(request:SocialRequest)=>Promise<string|null>;retry:(reviewedOperationId?:string)=>Promise<void>;setPresence:(enabled:boolean)=>Promise<void>;
};
const Context=createContext<SocialState|null>(null);
export function SocialProvider({children}:{children:React.ReactNode}){
 const app=useApp(),auth=useAuth(),ride=useRide(),account=useOnboardingStatus(),{scope,session}=auth;
 const appRef=useRef(app),authRef=useRef(auth),rideRef=useRef(ride),accountRef=useRef(account);
 const foreground=useRef(NativeAppState.currentState==='active'),allowHeartbeat=useRef(false),stopTransport=useRef<()=>void>(()=>{});
 const reconnect=useRef<{scope:AuthScope;timer:ReturnType<typeof setTimeout>|null;attempt:number}>({scope,timer:null,attempt:0});
 const [active,setActive]=useState(()=>NativeAppState.currentState==='active'),[clockTick,setClockTick]=useState(0),[closedScope,setClosedScope]=useState<AuthScope|null>(null);
 const [offIntent,setOffIntent]=useState<{scope:AuthScope;off:boolean}|null>(null);
 const [localHiding,setLocalHiding]=useState<{scope:AuthScope;ids:string[]}|null>(null);
 useLayoutEffect(()=>{appRef.current=app;authRef.current=auth;rideRef.current=ride;accountRef.current=account;},[app,auth,ride,account]);
 const guard=useCallback(()=>{if(!isAccountCurrent(scope)||closedOwners.has(scope.userId??''))throw Error('ACCOUNT_CHANGED');},[scope]);
 const signed=useCallback(()=>{guard();if(!foreground.current)throw Error('SOCIAL_INACTIVE');if(!appRef.current.ready||appRef.current.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');const value=authRef.current.session;if(!value||value.user.id!==scope.userId)throw Error('SOCIAL_AUTH_REQUIRED');return value;},[scope,guard]);
 // Constructor stores these ports; JWT refs are read only when a request runs.
 // eslint-disable-next-line react-hooks/refs
 const reader=useMemo(()=>new SocialReader({guard,now:monotonicNow,social:cursor=>getSocialSnapshot(scope,signed(),30,cursor),blocked:cursor=>getBlockedPeople(scope,signed(),30,cursor),invitations:cursor=>getInvitationInbox(scope,signed(),30,cursor)}),[scope,guard,signed]);
 const read=useSyncExternalStore(reader.subscribe,reader.getSnapshot,reader.getSnapshot);
 const scheduleRefresh=useCallback(()=>{
  guard();const value=reconnect.current;
  if(value.scope!==scope){if(value.timer)clearTimeout(value.timer);reconnect.current={scope,timer:null,attempt:0};}
  const owned=reconnect.current;if(owned.timer||!foreground.current)return;
  const delay=Math.min(30000,1000*2**Math.min(owned.attempt++,5))+Math.floor(Math.random()*500);
  owned.timer=setTimeout(()=>{owned.timer=null;if(foreground.current&&isAccountCurrent(scope)&&!closedOwners.has(scope.userId??''))void reader.refresh();},delay);
 },[scope,guard,reader]);
 // Coordinator ports run after render and use current owner storage/session.
 // eslint-disable-next-line react-hooks/refs
 const coordinator=useMemo(()=>new SocialCoordinator({ownerId:scope.userId??'',guard,hasSession:()=>foreground.current&&appRef.current.ready&&!!authRef.current.session,
  read:()=>{guard();const value=appRef.current.getOwned();if(!value||appRef.current.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');return value;},
  write:async patch=>{guard();if(!appRef.current.update(patch))throw Error(appRef.current.storageError??'LOCAL_WRITE_FAILED');await appRef.current.flushStorage();guard();},
  flush:async()=>{guard();await appRef.current.flushStorage();guard();},operationUUID:randomUUID,nowISO:()=>new Date().toISOString(),
  send:operation=>sendSocialMutation(scope,signed(),operation),status:id=>getSocialOperation(scope,signed(),id),
  refresh:async receipt=>{guard();if(receipt.result.kind==='friend'&&['removed','blocked','declined','cancelled'].includes(receipt.result.state))reader.prunePeer(receipt.result.user_id);if(!foreground.current)return;reader.suspend();if(receipt.result.kind==='presence'){await accountRef.current.refresh();guard();}if(!foreground.current)return;await reader.refresh();guard();},
 }),[scope,guard,signed,reader]);
 const queue=useSyncExternalStore(coordinator.subscribe,coordinator.getSnapshot,coordinator.getSnapshot);
 // Definitive rejection may restore a hidden peer only through a new read.
 useLayoutEffect(()=>{if(queue.latest?.status==='rejected'&&foreground.current&&isAccountCurrent(scope)){reader.suspend();void reader.refresh();}},[queue.latest,scope,reader]);
 const visible=app.ready&&closedScope!==scope&&!closedOwners.has(scope.userId??'')&&app.storageError!=='LOCAL_READ_FAILED';
 const ready=visible&&!!session&&read.loaded;
 const pending=visible?app.data.socialOperations:emptyOperations;
 const quarantined=useMemo(()=>new Set([...pending.flatMap(op=>op.request.action==='friend_action'&&(op.request.verb==='block'||op.request.verb==='remove')?[op.request.other_id]:[]),...(localHiding?.scope===scope?localHiding.ids:[])]),[pending,localHiding,scope]);
 const pendingOff=pending.some(op=>op.request.action==='set_presence'&&!op.request.enabled);
 const optedIn=ready&&read.self?.presence_opt_in===true&&!pendingOff&&!(offIntent?.scope===scope&&offIntent.off);
 const canHeartbeat=optedIn&&read.fresh&&read.self?.profile_ready===true&&active&&account.ready&&!account.value.preferences.ghost_mode&&!account.error;
 useLayoutEffect(()=>{allowHeartbeat.current=canHeartbeat;},[canHeartbeat]);
 useEffect(()=>{const close=()=>{allowHeartbeat.current=false;stopTransport.current();if(reconnect.current.scope===scope&&reconnect.current.timer){clearTimeout(reconnect.current.timer);reconnect.current.timer=null;}coordinator.close();reader.close();};const entry={owner:scope.userId??'',close:()=>{close();setClosedScope(scope);}};closures.add(entry);return()=>{closures.delete(entry);close();};},[scope,coordinator,reader]);
 useEffect(()=>{
  if(!auth.ready||!visible||!session||!foreground.current)return;
  void reader.refresh();void coordinator.retry();
 },[auth.ready,visible,session,reader,coordinator]);
 useEffect(()=>{
  const refresh=()=>{if(!foreground.current||!isAccountCurrent(scope)||closedOwners.has(scope.userId??'')||!appRef.current.ready||appRef.current.storageError==='LOCAL_READ_FAILED'||!authRef.current.session)return;void reader.refresh();void coordinator.retry();};
  const listener=NativeAppState.addEventListener('change',value=>{foreground.current=value==='active';setActive(foreground.current);if(foreground.current){refresh();if(isAccountCurrent(scope)&&authRef.current.session)void accountRef.current.refresh().catch(()=>{});}else{allowHeartbeat.current=false;stopTransport.current();if(reconnect.current.scope===scope&&reconnect.current.timer){clearTimeout(reconnect.current.timer);reconnect.current.timer=null;}reader.suspend();}});
  const timer=setInterval(refresh,30000);
  if(Platform.OS==='web')window.addEventListener('online',refresh);
  return()=>{listener.remove();clearInterval(timer);if(Platform.OS==='web')window.removeEventListener('online',refresh);};
 },[scope,reader,coordinator]);
 useEffect(()=>{
  if(!canHeartbeat||!session)return;
  const captured=session;let stopped=false;
  const pulse=()=>{if(stopped||!allowHeartbeat.current||!foreground.current||!isAccountCurrent(scope)||closedOwners.has(scope.userId??''))return;void heartbeatSocial(scope,captured).catch(()=>{if(!stopped&&isAccountCurrent(scope))reader.invalidateStatuses();});};
  pulse();const timer=setInterval(pulse,30000);return()=>{stopped=true;clearInterval(timer);};
 },[canHeartbeat,scope,session,reader]);
 const topicBindings=useMemo(()=>read.fresh&&ready?read.statuses.filter(status=>!quarantined.has(status.user_id)).slice(0,50).map(status=>({topic:status.topic,userId:status.user_id})):[],[read.fresh,read.statuses,ready,quarantined]);
 const topicKey=JSON.stringify(topicBindings);
 useEffect(()=>{
  if(!session||!active||!ready||!read.fresh||!topicBindings.length)return;
  const captured=session,client=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL??publicService.url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY??publicService.publishableKey,{accessToken:async()=>{guard();return captured.access_token;}});
  let stopped=false,channels:RealtimeChannel[]=[],refreshTimer:ReturnType<typeof setTimeout>|null=null;
  const current=()=>!stopped&&foreground.current&&isAccountCurrent(scope)&&!closedOwners.has(scope.userId??'');
  const refresh=()=>{if(!current()||refreshTimer)return;refreshTimer=setTimeout(()=>{refreshTimer=null;if(current())void reader.refresh();},250);};
  const close=()=>{stopped=true;if(refreshTimer)clearTimeout(refreshTimer);channels.forEach(channel=>void client.removeChannel(channel));channels=[];client.realtime.disconnect();};
  stopTransport.current=close;
  const open=async()=>{
   try{await client.realtime.setAuth(captured.access_token);if(!current())return;
    channels=topicBindings.map(binding=>client.channel(binding.topic,{config:{private:true}}).on('broadcast',{event:'presence'},event=>{if(current()&&validatePresenceEvent(event.payload,binding.userId))refresh();}).subscribe(status=>{
     if(!current())return;if(status==='SUBSCRIBED'){if(reconnect.current.scope===scope)reconnect.current.attempt=0;refresh();}
     else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){reader.invalidateStatuses();scheduleRefresh();}
    }));
   }catch{if(current()){reader.invalidateStatuses();scheduleRefresh();}}
  };void open();
  return()=>{close();if(stopTransport.current===close)stopTransport.current=()=>{};};
  // Serialized checked rows stabilize subscriptions across status-expiry updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scope,session?.access_token,active,ready,read.fresh,topicKey,guard,reader,scheduleRefresh]);
 const mutate=useCallback(async(request:SocialRequest)=>{
  guard();if(rideRef.current.movingLocked)throw Error('SOCIAL_MOVING_LOCKED');signed();
  if(!appRef.current.ready||appRef.current.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');
  if(request.action==='set_presence'&&!request.enabled){allowHeartbeat.current=false;stopTransport.current();reader.suspend();setOffIntent({scope,off:true});}
  if(!foreground.current||(!reader.getSnapshot().fresh&&!(request.action==='set_presence'&&!request.enabled)))throw Error('SOCIAL_UNAVAILABLE');
  const hidden=request.action==='friend_action'&&(request.verb==='block'||request.verb==='remove')?request.other_id:null;
  if(hidden){setLocalHiding(previous=>({scope,ids:[...new Set([...(previous?.scope===scope?previous.ids:[]),hidden])]}));reader.prunePeer(hidden);}
  try{const operationId=await coordinator.enqueue(request);guard();const latest=coordinator.getSnapshot().latest;
   if(request.action==='set_presence'&&request.enabled&&operationId&&latest?.operationId===operationId&&latest.status==='applied')setOffIntent({scope,off:false});
   return operationId;
  }finally{if(hidden&&isAccountCurrent(scope))setLocalHiding(previous=>previous?.scope===scope?{scope,ids:previous.ids.filter(id=>id!==hidden)}:previous);}
 },[scope,guard,signed,coordinator,reader]);
 const setPresence=useCallback(async(enabled:boolean)=>{
  guard();if(!enabled){allowHeartbeat.current=false;stopTransport.current();setOffIntent({scope,off:true});}const state=reader.getSnapshot();if(!state.fresh||!state.self?.profile_ready)throw Error(state.self?.profile_ready?'SOCIAL_UNAVAILABLE':'PROFILE_REQUIRED');
  const operationId=await mutate({schema_version:1,action:'set_presence',enabled,expected_account_revision:state.self.account_revision});guard();const latest=coordinator.getSnapshot().latest;
  if(!operationId)throw Error(coordinator.getSnapshot().error??'SOCIAL_UNAVAILABLE');
  if(latest?.operationId===operationId&&latest.status==='rejected')throw Error(latest.error??'SOCIAL_UNAVAILABLE');
  if(latest?.operationId!==operationId||latest.status!=='applied')throw Error('SOCIAL_PENDING');
 },[scope,guard,reader,mutate,coordinator]);
 const clock=read.serverNow?presenceClock(read.serverNow,read.serverAnchorAt):null;
 useEffect(()=>{
  if(!active||!read.fresh||!read.serverNow)return;
  const serverTime=Date.parse(read.serverNow)+Math.max(0,performance.now()-read.serverAnchorAt);
  const next=read.statuses.filter(row=>row.online&&row.expires_at).map(row=>Date.parse(row.expires_at!)-serverTime).filter(delay=>Number.isFinite(delay)&&delay>0);
  if(!next.length)return;const timer=setTimeout(()=>setClockTick(monotonicNow()),Math.min(120000,Math.min(...next)+20));return()=>clearTimeout(timer);
 },[active,read.fresh,read.serverNow,read.serverAnchorAt,read.receivedAt,read.statuses,clockTick]);
 const presence=ready&&active&&read.fresh?freshSocialStatuses(read.statuses.filter(row=>!quarantined.has(row.user_id)),clock,Math.max(read.receivedAt,clockTick)):[];
 return <Context.Provider value={{ready,fresh:ready&&read.fresh&&active,loading:!auth.ready||!app.ready||!!session&&!read.loaded&&!read.error,profileReady:ready&&read.self?.profile_ready===true,optedIn,accountRevision:ready?read.self?.account_revision??null:null,
  friends:ready?read.friends.filter(row=>!quarantined.has(row.user_id)):[],presence,blocked:ready?read.blocked:[],invitations:ready?read.invitations.filter(row=>!quarantined.has(row.creator_id)):[],pages:read.pages,pending,busy:queue.busy,error:app.storageError??queue.error??read.error,latest:queue.latest,reviewRequired:queue.reviewRequired,
  refresh:async()=>{guard();signed();if(!visible||!session)return;await reader.refresh();},loadMoreFriends:async()=>{signed();await reader.loadMoreFriends();},loadMoreBlocked:async()=>{signed();await reader.loadMoreBlocked();},loadMoreInvitations:async()=>{signed();await reader.loadMoreInvitations();},mutate,
  retry:async id=>{guard();signed();if(rideRef.current.movingLocked)throw Error('SOCIAL_MOVING_LOCKED');const reviewed=id?appRef.current.getOwned()?.socialOperations.find(op=>op.operationId===id):null;await appRef.current.retryStorage();signed();await coordinator.retry(reviewed?.request.action==='request_friend'?id:undefined);guard();const latest=coordinator.getSnapshot().latest;if(reviewed?.request.action==='set_presence'&&reviewed.request.enabled&&latest&&latest.operationId===id&&latest.status==='applied')setOffIntent({scope,off:false});},setPresence,
 }}>{children}</Context.Provider>;
}
export function useSocial(){const value=useContext(Context);if(!value)throw Error('SocialProvider is required');return value;}
