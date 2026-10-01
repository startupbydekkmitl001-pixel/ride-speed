import {createClient,type RealtimeChannel} from '@supabase/supabase-js';
import {CryptoDigestAlgorithm,digestStringAsync,getRandomBytesAsync,randomUUID} from 'expo-crypto';
import Constants from 'expo-constants';
import {usePathname} from 'expo-router';
import React,{createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {AppState as NativeAppState,Linking,Platform} from 'react-native';
import {useOnboardingStatus} from '../features/onboarding';
import {LiveCoordinator} from '../features/live/LiveCoordinator';
import {LivePositionCoordinator} from '../features/live/LivePositionCoordinator';
import {LiveShareAuthority} from '../features/live/LiveShareAuthority';
import {estimatedLiveServerNow,freshConvoyPeers,nextLiveExpiry} from '../features/live/clockModel';
import {incomingLinks,captureIncomingLink} from '../features/live/incomingIntent';
import {canonicalLive,convoyCodeHashInput,encodedFriendLink,friendTokenHashInput,validateConvoyEvent} from '../features/live/model';
import {cancelLiveGrant,getConvoy,getConvoyPositions,getFriendLinks,getLiveOperation,heartbeatConvoy,listConvoys,mutateLive,publishLivePosition,resolveConvoyCode,resolveFriendLink} from '../features/live/service';
import {liveSecrets,liveSecretPersistence} from '../features/live/secretStorage';
import type {AuthorizedPeerFrame,ConvoySnapshot,LiveRequest,LiveSenderBinding,StoredLiveOperation} from '../features/live/types';
import type {ConvoyCreateReview,LiveContextValue,LocationGrantReview} from '../features/live/uiTypes';
import type {MapPeer} from '../features/map/MapSurface.types';
import {publicService} from '../lib/publicService';
import {useApp} from './AppState';
import {isAccountCurrent,useAuth,type AuthScope} from './AuthState';
import {useRide} from './RideState';
import {useSocial} from './SocialState';
import {LiveReader} from './LiveReader';

const closedOwners=new Set<string>(),closures=new Set<{owner:string;close():void}>();
const emptyOperations:StoredLiveOperation[]=[],emptyPeers:MapPeer[]=[];
const mono=()=>performance.now();
const wallNow=()=>Date.now();
const hash=(value:string)=>digestStringAsync(CryptoDigestAlgorithm.SHA256,value);
function base64url(bytes:Uint8Array){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';let value='',bits=0,buffer=0;for(const byte of bytes){buffer=(buffer<<8)|byte;bits+=8;while(bits>=6){bits-=6;value+=alphabet[(buffer>>>bits)&63];}}if(bits)value+=alphabet[(buffer<<(6-bits))&63];return value;}
function roomCode(bytes:Uint8Array){const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ';let value='',bits=0,buffer=0;for(const byte of bytes){buffer=(buffer<<8)|byte;bits+=8;while(bits>=5){bits-=5;value+=alphabet[(buffer>>>bits)&31];}}return value;}
export function clearLiveAccount(scope:AuthScope){if(!scope.userId)return;closedOwners.add(scope.userId);for(const item of closures)if(item.owner===scope.userId)item.close();incomingLinks.clear();}
type LiveState=LiveContextValue&{peers:readonly MapPeer[];peerFrame:AuthorizedPeerFrame|null};
const Context=createContext<LiveState|null>(null);
export function LiveProvider({children}:{children:React.ReactNode}){
 const app=useApp(),auth=useAuth(),ride=useRide(),social=useSocial(),account=useOnboardingStatus(),pathname=usePathname(),{scope,session}=auth;
 const appRef=useRef(app),authRef=useRef(auth),rideRef=useRef(ride),socialRef=useRef(social),accountRef=useRef(account);
 const foreground=useRef(NativeAppState.currentState==='active'),mapFocused=useRef(pathname==='/'),alive=useRef(true),receive=useRef(false);
 const stopSocket=useRef<()=>void>(()=>{}),positionRef=useRef<LivePositionCoordinator|null>(null);
 // An account generation always owns a distinct, nontransferable review authority.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const shareAuthority=useMemo(()=>new LiveShareAuthority(),[scope]);
 const intent=useSyncExternalStore(shareAuthority.subscribe,shareAuthority.get,shareAuthority.get);
 const subscribeCapture=useCallback((listener:()=>void)=>ride.liveCapture.subscribe(listener),[ride.liveCapture]);
 const readCapture=useCallback(()=>ride.liveCapture.getBinding(),[ride.liveCapture]);
 const binding=useSyncExternalStore(subscribeCapture,readCapture,readCapture);
 const [active,setActive]=useState(()=>NativeAppState.currentState==='active');
 const [receiveEnabled,setReceiveState]=useState(false);
 const [frame,setFrame]=useState<AuthorizedPeerFrame|null>(null);
 const [clockTick,setClockTick]=useState(0);
 const [shareError,setShareError]=useState<string|null>(null);
 const [closedScope,setClosedScope]=useState<AuthScope|null>(null);
 useLayoutEffect(()=>{appRef.current=app;authRef.current=auth;rideRef.current=ride;socialRef.current=social;accountRef.current=account;mapFocused.current=pathname==='/';incomingLinks.bindOwner(scope);},[app,auth,ride,social,account,pathname,scope]);
 const current=useCallback(()=>alive.current&&isAccountCurrent(scope)&&!closedOwners.has(scope.userId??''),[scope]);
 const guard=useCallback(()=>{if(!current())throw Error('ACCOUNT_CHANGED');},[current]);
 const eligible=useCallback(()=>current()&&foreground.current&&appRef.current.ready&&appRef.current.storageError!=='LOCAL_READ_FAILED'&&authRef.current.session?.user.id===scope.userId,[current,scope]);
 const signed=useCallback(()=>{guard();if(!foreground.current)throw Error('LIVE_UNAVAILABLE');if(!appRef.current.ready||appRef.current.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');const value=authRef.current.session;if(!value||value.user.id!==scope.userId)throw Error('LIVE_AUTH_REQUIRED');return value;},[scope,guard]);
 // These constructors retain ports; refs are read only when requests execute.
 // eslint-disable-next-line react-hooks/refs
 const reader=useMemo(()=>new LiveReader({guard,now:mono,links:()=>getFriendLinks(scope,signed()),rooms:()=>listConvoys(scope,signed()),room:id=>getConvoy(scope,signed(),id)}),[scope,guard,signed]);
 const read=useSyncExternalStore(reader.subscribe,reader.getSnapshot,reader.getSnapshot);
 const disarm=useCallback(()=>{shareAuthority.suspend();positionRef.current?.bind(null);setFrame(null);},[shareAuthority,setFrame]);
 const shareEligible=useCallback(()=>eligible()&&accountRef.current.ready&&!accountRef.current.error&&!accountRef.current.value.preferences.ghost_mode&&socialRef.current.profileReady&&socialRef.current.optedIn,[eligible]);
 // Fresh reducers preserve social/garage/route mutations made while an ACK waited.
 // eslint-disable-next-line react-hooks/refs
 const coordinator=useMemo(()=>new LiveCoordinator({ownerId:scope.userId??'',current,eligible,
  read:()=>{guard();const owned=appRef.current.getOwned();if(!owned||appRef.current.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');return {operations:owned.liveOperations};},
  update:async reducer=>{guard();const owned=appRef.current.getOwned();if(!owned||appRef.current.storageError==='LOCAL_READ_FAILED')throw Error('LOCAL_READ_FAILED');const next=reducer({operations:owned.liveOperations});if(!appRef.current.update({liveOperations:next.operations}))throw Error('LOCAL_WRITE_FAILED');},
  flush:async()=>{guard();await appRef.current.flushStorage();guard();},operationId:randomUUID,nowISO:()=>new Date().toISOString(),
  send:op=>mutateLive(scope,signed(),op),status:id=>getLiveOperation(scope,signed(),id),
  cancelGrant:op=>cancelLiveGrant(scope,signed(),op),
  refresh:async receipt=>{guard();if(!eligible())return;const q=receipt.request;
   reader.suspend();
   if('convoy_id' in q){if(q.action==='convoy_create')await reader.open(q.convoy_id);else await reader.refresh();}else{await reader.refresh();if(q.action==='friend_link_request')await socialRef.current.refresh();}
   guard();const state=reader.getSnapshot();if(q.action==='location_grant'){
    const binding=rideRef.current.liveCapture.getBinding();const intent=shareAuthority.arm(binding,q,receipt,state.room,state.roomFresh&&shareEligible());
    if(intent&&binding&&state.room&&state.roomClock){positionRef.current?.bind({scope,room:state.room,roomClock:state.roomClock,capture:binding,intent});setShareError(null);}
   }
  },
 }),[scope,current,eligible,guard,signed,reader,shareEligible,shareAuthority,setShareError]);
 const queue=useSyncExternalStore(coordinator.subscribe,coordinator.getSnapshot,coordinator.getSnapshot);
 // The source stays inside RideProvider; receive controls never acquire GPS.
 // eslint-disable-next-line react-hooks/refs
 const positions=useMemo(()=>new LivePositionCoordinator({monotonicNow:mono,wallNow,
  policy:()=>({scope,signedIn:authRef.current.session?.user.id===scope.userId,hydrated:appRef.current.ready&&appRef.current.storageError!=='LOCAL_READ_FAILED',foreground:foreground.current,online:Platform.OS!=='web'||typeof navigator==='undefined'||navigator.onLine,ghost:!accountRef.current.ready||!!accountRef.current.error||accountRef.current.value.preferences.ghost_mode,closed:!current(),receiveEnabled:receive.current,mapFocused:mapFocused.current}),
  current:(binding:LiveSenderBinding)=>{if(!shareEligible()||binding.scope!==scope||rideRef.current.liveCapture.getBinding()!==binding.capture||shareAuthority.get()!==binding.intent)return false;const room=reader.getSnapshot().room;return !!room&&room.id===binding.room.id&&room.topic_generation===binding.room.topic_generation&&room.self_generation===binding.intent.memberGeneration&&room.self_consent.revision===binding.intent.consentRevision&&room.self_consent.lease_id===binding.intent.leaseId;},
  publish:sample=>publishLivePosition(scope,signed(),sample),read:room=>getConvoyPositions(scope,signed(),room),refreshRoom:async id=>{await reader.open(id);return reader.getSnapshot().room;},
  onPeers:next=>{if(current())setFrame(next);},onError:code=>{if(!current())return;setShareError(code);if(['POSITION_SEQUENCE','LOCATION_CONSENT_REQUIRED','LOCATION_CONSENT_CHANGED','LIVE_AUTH_REQUIRED','LIVE_DISABLED','ACCOUNT_DELETION_PENDING','CONVOY_UNAVAILABLE'].includes(code)){shareAuthority.suspend();positionRef.current?.bind(null);}},
 }),[scope,current,shareEligible,signed,reader,shareAuthority]);
 useLayoutEffect(()=>{positionRef.current=positions;},[positions]);
 const incoming=useSyncExternalStore(incomingLinks.subscribe,()=>incomingLinks.get(scope),()=>null);
 const visible=app.ready&&closedScope!==scope&&!closedOwners.has(scope.userId??'')&&app.storageError!=='LOCAL_READ_FAILED';
 const ready=visible&&!!session&&read.loaded,ghost=!account.ready||!!account.error||account.value.preferences.ghost_mode;
 const pending=visible?app.data.liveOperations:emptyOperations;
 useEffect(()=>{const close=()=>{disarm();stopSocket.current();coordinator.close();reader.close();positions.close();};const entry={owner:scope.userId??'',close:()=>{close();setClosedScope(scope);}};closures.add(entry);alive.current=true;return()=>{closures.delete(entry);alive.current=false;close();};},[scope,coordinator,reader,positions,disarm]);
 useEffect(()=>{if(!auth.ready||!visible||!session||!eligible())return;void reader.refresh();void coordinator.retry();},[auth.ready,visible,session,eligible,reader,coordinator]);
 useEffect(()=>{const refresh=()=>{if(!eligible())return;void reader.refresh();void coordinator.retry();};
  const suspend=()=>{positions.suspend();disarm();receive.current=false;setReceiveState(false);stopSocket.current();coordinator.suspend();reader.suspend();};
  const change=(value:string)=>{foreground.current=value==='active'&&(Platform.OS!=='web'||typeof document==='undefined'||!document.hidden);setActive(foreground.current);if(foreground.current)refresh();else suspend();};
  const listener=NativeAppState.addEventListener('change',change),timer=setInterval(refresh,30000);
  const visibility=()=>change(NativeAppState.currentState);if(Platform.OS==='web'){document.addEventListener('visibilitychange',visibility);window.addEventListener('online',refresh);}
  return()=>{listener.remove();clearInterval(timer);if(Platform.OS==='web'){document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',refresh);}};
 },[eligible,reader,coordinator,positions,disarm]);
 useEffect(()=>ride.liveCapture.subscribe(event=>{if(!current())return;positions.accept(event);if(event.kind==='invalidated'){disarm();coordinator.suspend();}}),[ride.liveCapture,current,positions,coordinator,disarm]);
 // Privacy changes must hide the native layer before any later async response.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useLayoutEffect(()=>{if(!visible||!session||!active||ghost||!social.optedIn||!social.profileReady||read.error)disarm();},[visible,session,active,ghost,social.optedIn,social.profileReady,read.error,disarm]);
 // Synchronize receive transport with focus; an empty frame is a privacy boundary.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{positions.setReceive(read.room,receiveEnabled&&visible,pathname==='/'&&active,read.roomClock);if(!receiveEnabled||pathname!=='/'||!active)setFrame(null);},[positions,read.room,read.roomClock,receiveEnabled,visible,pathname,active]);
 useLayoutEffect(()=>{if(!intent||!binding||!read.roomFresh||!read.room||!read.roomClock)return;const fresh=shareAuthority.rebind(binding,read.room,shareEligible());if(fresh)positions.bind({scope,room:read.room,roomClock:read.roomClock,capture:binding,intent:fresh});},[scope,intent,binding,read.roomFresh,read.room,read.roomClock,positions,shareAuthority,shareEligible]);
 useEffect(()=>{if(!visible||!session||!eligible())return;const timer=setInterval(()=>{void positions.tick();const intent=shareAuthority.get(),state=reader.getSnapshot();if(intent&&state.roomClock&&state.room){const now=estimatedLiveServerNow(state.roomClock,mono());if(now===null||now>=Math.min(Date.parse(state.room.expires_at),Date.parse(state.room.host_lease_until),Date.parse(state.room.self_consent.expires_at??''))||state.room.self_consent.lease_id!==intent.leaseId)disarm();}},1000);return()=>clearInterval(timer);},[active,visible,session,eligible,positions,reader,disarm,shareAuthority]);
 useEffect(()=>{const room=read.room,clock=read.roomClock;if(!eligible()||!room||!clock||room.viewer_role!=='host'||room.self_state!=='accepted'||!['lobby','active'].includes(room.state))return;let stopped=false,running=false;
  const pulse=()=>{const now=estimatedLiveServerNow(clock,mono());if(stopped||running||!eligible()||now===null||now>=Math.min(Date.parse(room.expires_at),Date.parse(room.host_lease_until)))return;running=true;void heartbeatConvoy(scope,signed(),room).then(result=>{if(stopped||!eligible())return;if('error' in result){disarm();return;}void reader.refresh();}).catch(()=>{if(!stopped)disarm();}).finally(()=>{running=false;});};
  const timer=setInterval(pulse,15000);return()=>{stopped=true;clearInterval(timer);};
 },[scope,read.room,read.roomClock,eligible,signed,reader,disarm]);
 useEffect(()=>{const room=read.room;if(!eligible()||!room?.topic||room.self_state!=='accepted'||room.state!=='active'||!session)return;
  const captured=session,client=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL??publicService.url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY??publicService.publishableKey,{accessToken:async()=>{guard();return captured.access_token;}});let stopped=false,channel:RealtimeChannel|null=null,timer:ReturnType<typeof setTimeout>|null=null;
  const valid=()=>!stopped&&eligible();const refresh=()=>{if(!valid()||timer)return;timer=setTimeout(()=>{timer=null;if(valid())void reader.refresh();},1000);};
  const close=()=>{stopped=true;if(timer)clearTimeout(timer);if(channel)void client.removeChannel(channel);client.realtime.disconnect();};stopSocket.current=close;
  void client.realtime.setAuth(captured.access_token).then(()=>{if(!valid())return;channel=client.channel(room.topic!,{config:{private:true}}).on('broadcast',{event:'convoy'},event=>{const checked=valid()?validateConvoyEvent(event.payload,room):null;if(!checked)return;if(checked.kind==='room_changed'){positions.suspend();setFrame(null);reader.suspend();void reader.refresh();}else void positions.tick();}).subscribe(status=>{if(!valid())return;if(status==='SUBSCRIBED')refresh();else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){positions.suspend();setFrame(null);reader.suspend();void reader.refresh();}});}).catch(()=>{if(valid()){positions.suspend();setFrame(null);reader.suspend();void reader.refresh();}});
  return()=>{close();if(stopSocket.current===close)stopSocket.current=()=>{};};
  // JWT/topic identity owns this socket; heartbeat reads retain the same channel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scope,session?.access_token,active,read.room?.topic,read.room?.topic_generation,eligible,guard,positions,reader,disarm]);
 // Expiry removes a renderer frame even while a positions read is stalled.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{if(!frame||!active)return;const expiry=nextLiveExpiry(frame,mono());if(expiry===null){setFrame(null);return;}const timer=setTimeout(()=>setClockTick(mono()),Math.max(0,expiry-mono()+1));return()=>clearTimeout(timer);},[frame,active,clockTick]);
 useEffect(()=>{let live=true;void Linking.getInitialURL().then(url=>{if(live&&url)captureIncomingLink(url);}).catch(()=>{});const listener=Linking.addEventListener('url',event=>captureIncomingLink(event.url));return()=>{live=false;listener.remove();};},[]);
 useEffect(()=>{if(!incoming)return;const timer=setTimeout(()=>setClockTick(mono()),300000);return()=>clearTimeout(timer);},[incoming]);
 const requireReview=useCallback(()=>{signed();if(rideRef.current.movingLocked)throw Error('LIVE_UNAVAILABLE');const state=reader.getSnapshot();if(!state.fresh)throw Error(state.error??'LIVE_UNAVAILABLE');if(!socialRef.current.profileReady)throw Error('PROFILE_REQUIRED');return state;},[signed,reader]);
 const mutate=useCallback(async(request:LiveRequest)=>{requireReview();if(request.action==='location_grant'||request.action==='location_revoke')throw Error('LIVE_REVIEW_REQUIRED');if(request.action==='convoy_end'||request.action==='convoy_member'&&['leave','remove'].includes(request.verb)){disarm();setFrame(null);}return coordinator.enqueue(request);},[requireReview,coordinator,disarm,setFrame]);
 const createFriendLink=useCallback(async(ttl:3600|86400)=>{requireReview();const id=randomUUID(),token=base64url(await getRandomBytesAsync(32)),tokenHash=await hash(friendTokenHashInput(token));requireReview();await liveSecrets.put(scope,'friend',id,tokenHash,token);requireReview();return coordinator.enqueue({schema_version:1,action:'friend_link_create',link_id:id,token_hash:tokenHash,ttl_seconds:ttl});},[scope,requireReview,coordinator]);
 const createConvoy=useCallback(async(review:ConvoyCreateReview)=>{requireReview();const id=randomUUID(),code=roomCode(await getRandomBytesAsync(5)),codeHash=await hash(convoyCodeHashInput(code));requireReview();await liveSecrets.put(scope,'code',id,codeHash,code);requireReview();return coordinator.enqueue({schema_version:1,action:'convoy_create',convoy_id:id,title:review.title,route_id:review.routeId,route_revision:review.routeRevision,reviewed_geometry_hash:review.geometryHash,code_hash:codeHash,ttl_seconds:3600});},[scope,requireReview,coordinator]);
 const rotateCode=useCallback(async(room:ConvoySnapshot)=>{const check=()=>{const state=requireReview();if(!state.room||state.room.id!==room.id||state.room.revision!==room.revision||state.room.viewer_role!=='host')throw Error('CONVOY_CHANGED');};check();const code=roomCode(await getRandomBytesAsync(5)),codeHash=await hash(convoyCodeHashInput(code));check();await liveSecrets.put(scope,'code',room.id,codeHash,code);check();return coordinator.enqueue({schema_version:1,action:'convoy_code_rotate',convoy_id:room.id,expected_room_revision:room.revision,code_hash:codeHash});},[scope,requireReview,coordinator]);
 const grantLocation=useCallback(async(duration:900|3600,review:LocationGrantReview)=>{const state=requireReview(),room=state.room,binding=rideRef.current.liveCapture.getBinding();if(!room||!binding||!state.roomFresh||!shareEligible()||room.state!=='active'||room.self_state!=='accepted'||room.id!==review.roomId||room.revision!==review.roomRevision||room.self_generation!==review.memberGeneration||room.self_consent.revision!==review.consentRevision||binding.captureId!==review.captureId)throw Error('LOCATION_CONSENT_CHANGED');
  const request:Extract<LiveRequest,{action:'location_grant'}>={schema_version:1,action:'location_grant',convoy_id:room.id,expected_room_revision:room.revision,expected_member_generation:room.self_generation,expected_consent_revision:room.self_consent.revision,capture_id:binding.captureId,duration_seconds:duration,precision:'precise'};
  shareAuthority.review(binding,request,room.topic_generation);setShareError(null);const old=appRef.current.getOwned()?.liveOperations.find(op=>canonicalLive(op.request)===canonicalLive(request));if(old){await coordinator.retry(old.operationId);return old.operationId;}return coordinator.enqueue(request);
 },[requireReview,shareEligible,coordinator,shareAuthority,setShareError]);
 const stopSharing=useCallback(async()=>{
  guard();disarm();setShareError(null);signed();
  const grants=appRef.current.getOwned()?.liveOperations.filter(op=>op.request.action==='location_grant')??[];
  for(const op of grants){if(!await coordinator.cancelGrant(op.operationId))throw Error(coordinator.getSnapshot().error??'LIVE_UNAVAILABLE');signed();}
  const before=reader.getSnapshot().room,id=before?.id??(grants[0]?.request.action==='location_grant'?grants[0].request.convoy_id:null);if(!id)return;
  reader.suspend();await reader.open(id);signed();const state=reader.getSnapshot(),room=state.room;if(!state.fresh||!state.roomFresh)throw Error(state.error??'LIVE_UNAVAILABLE');if(!room||room.self_state!=='accepted'||room.self_consent.precision==='none')return;
  const request:LiveRequest={schema_version:1,action:'location_revoke',convoy_id:room.id,expected_member_generation:room.self_generation,expected_consent_revision:room.self_consent.revision,expected_lease_id:room.self_consent.lease_id};
  const old=appRef.current.getOwned()?.liveOperations.find(op=>canonicalLive(op.request)===canonicalLive(request));if(old){await coordinator.retry();return;}await coordinator.enqueue(request);
 },[guard,disarm,reader,signed,coordinator,setShareError]);
 const getFriendLinkUrl=useCallback(async(id:string)=>{const check=()=>requireReview().links.some(link=>link.id===id);if(!check())return null;const raw=await liveSecrets.find(scope,'friend',id);if(!raw||await hash(friendTokenHashInput(raw.value))!==raw.hash||!check())return null;const scheme=Constants.expoConfig?.scheme==='ridespeed-dev'?'ridespeed-dev':'ridespeed';return encodedFriendLink(id,raw.value,scheme);},[scope,requireReview]);
 const getRoomCode=useCallback(async(id:string)=>{const state=requireReview(),room=state.room,code=room?.self_code;if(!room||room.id!==id||room.viewer_role!=='host'||!code)return null;const raw=await liveSecrets.get(scope,'code',id,code.hash);if(raw===null||await hash(convoyCodeHashInput(raw))!==code.hash)return null;const next=requireReview().room;if(next?.id!==id||next.self_code?.hash!==code.hash)return null;return raw;},[scope,requireReview]);
 const setReceive=useCallback((enabled:boolean)=>{guard();if(enabled){const room=requireReview().room;if(!room||room.state!=='active'||room.self_state!=='accepted')throw Error('CONVOY_UNAVAILABLE');}receive.current=enabled;setReceiveState(enabled);if(!enabled){positions.setReceive(null,false,false,null);setFrame(null);}},[guard,requireReview,positions]);
 const peerFrame=ready&&active&&receiveEnabled&&pathname==='/'&&frame?.scope===scope?frame:null;
 const peers=peerFrame?freshConvoyPeers(peerFrame,Math.max(clockTick,mono())).map(row=>({id:row.user_id,coordinate:{latitude:row.latitude,longitude:row.longitude},name:row.display_name,presence:'online' as const,updatedAtMs:Date.parse(row.received_at),sample:peerFrame.peers.find(peer=>peer.position===row)})):emptyPeers;
 return <Context.Provider value={{ready,loading:!auth.ready||!app.ready||!!session&&!read.loaded&&!read.error,fresh:ready&&read.fresh&&active,profileReady:social.profileReady,busy:queue.busy,links:ready?read.links:[],summaries:ready?read.summaries:[],room:ready?read.room:null,pending,latest:queue.latest,error:app.storageError??queue.error??read.error,reviewRequired:queue.reviewRequired,secretPersistence:liveSecretPersistence,incomingFriendIntent:incoming,
  consumeIncomingFriendIntent:()=>incomingLinks.consume(scope),refresh:async()=>{signed();await reader.refresh();},openRoom:async id=>{signed();disarm();await reader.open(id);},mutate,retry:async id=>{requireReview();await appRef.current.retryStorage();const old=appRef.current.getOwned()?.liveOperations.find(op=>op.operationId===id);await coordinator.retry(old?.request.action==='convoy_join'||old?.request.action==='friend_link_request'?id:undefined);},
  resolveFriendLink:async value=>{requireReview();return resolveFriendLink(scope,signed(),value.linkId,value.token);},resolveCode:async value=>{requireReview();return resolveConvoyCode(scope,signed(),value);},createFriendLink,createConvoy,rotateCode,getFriendLinkUrl,getRoomCode,receiveEnabled,setReceive,
  share:{armed:!!intent&&visible&&active&&!ghost&&social.optedIn,pending:pending.some(op=>op.request.action==='location_grant'||op.request.action==='location_revoke'),expiresAt:intent?read.room?.self_consent.expires_at??null:null,error:shareError},captureReady:!!binding&&binding.scope===scope&&visible&&active,captureId:binding?.scope===scope?binding.captureId:null,ghost,presenceReady:social.ready&&social.optedIn,grantLocation,stopSharing,peers,peerFrame,
 }}>{children}</Context.Provider>;
}
export function useLive(){const value=useContext(Context);if(!value)throw Error('LiveProvider is required');return value;}
