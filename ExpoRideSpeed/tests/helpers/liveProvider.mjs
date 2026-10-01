import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {owner,roomId,captureId,leaseId,uuid,stamp,snapshot,positions,copy,tick} from './live.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),root=fileURLToPath(new URL('../../src/',import.meta.url));
export const sha=value=>createHash('sha256').update(value).digest('hex');

/** Real provider, reader, authority, position/control coordinators and passive
 * capture bus. Only React, native lifecycle, transport, durable disk and keys
 * are controlled ports; no coordinator or authorization algorithm is mocked. */
export function liveProviderHarness({hydrated=true,guest=false,stored=[],scheme='ridespeed'}={}){
 const cells=[],effects=[],layouts=[],timers=new Map(),listeners=new Set(),linkListeners=new Set(),cache=new Map(),reads=[],sends=[],statuses=[],publishes=[],positionReads=[],heartbeats=[],cancels=[],clients=[],secretEvents=[],owned=new Map([[owner,stored]]),secrets=new Map(),receipts=new Map(),cancelled=new Set();
 let index=0,dirty=false,timerId=0,opId=100,topicId=30,mono=100,wall=Date.parse(stamp),pathname='/',scope={userId:guest?null:owner,generation:1},session=guest?null:{user:{id:owner},access_token:'test-only-A-1'},bus;
 const behavior={hydrated,storageError:null,writeFailure:false,flushFailure:false,readHold:null,sendHold:null,secretHold:null,secretFailure:false,ghost:false,optedIn:true,profileReady:true,moving:false,gpsRequests:0,initialUrl:null};
 let canonical=snapshot();canonical.self_consent={revision:1,precision:'none',lease_id:null,capture_id:null,expires_at:null,last_sequence:0};
 const React={createContext(value){const context={value};context.Provider={context};return context;},useContext:context=>context.value,createElement(type,props,...children){if(type?.context)type.context.value=props.value;return {type,props,children};},
  useState(value){const at=index++;if(!(at in cells))cells[at]={value:typeof value==='function'?value():value,set:next=>{cells[at].value=typeof next==='function'?next(cells[at].value):next;dirty=true;}};return[cells[at].value,cells[at].set];},
  useRef(value){const at=index++;return cells[at]??={current:value};},
  useMemo(fn,deps){const at=index++;if(!cells[at]||deps.some((v,i)=>v!==cells[at].deps[i]))cells[at]={deps,value:fn()};return cells[at].value;},
  useCallback(fn,deps){return React.useMemo(()=>fn,deps);},
  useEffect(fn,deps=[]){enqueue(effects,fn,deps);},useLayoutEffect(fn,deps=[]){enqueue(layouts,fn,deps);},
  useSyncExternalStore(subscribe,get){const at=index++;if(cells[at]?.subscribe!==subscribe){cells[at]?.remove?.();cells[at]={subscribe,remove:subscribe(()=>dirty=true)};}return get();},
 };
 function enqueue(queue,fn,deps){const at=index++,old=cells[at];if(!old||deps.some((v,i)=>v!==old.deps[i])){old?.cleanup?.();cells[at]={deps};queue.push(()=>cells[at].cleanup=fn());}}
 const native={currentState:'active',addEventListener(_event,fn){listeners.add(fn);return {remove:()=>listeners.delete(fn)};}};
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[wall]));}static now(){return wall;}}
 // SQL008 live_rotate changes transport generation/change revision independently
 // of the room's editable revision and the caller's consent lease.
 function rotateRoom(){canonical.topic=`rs-convoy:${uuid(++topicId)}`;canonical.topic_generation++;canonical.change_revision++;}
 function result(op){const q=op.request;switch(q.action){
  case 'location_grant':canonical.self_consent={revision:q.expected_consent_revision+1,precision:'precise',lease_id:leaseId,capture_id:q.capture_id,expires_at:'2026-10-01T02:15:00Z',last_sequence:0};rotateRoom();return {kind:'consent',convoy_id:roomId,...copy(canonical.self_consent)};
  case 'location_revoke':if(canonical.self_consent.precision==='precise'){canonical.self_consent={revision:q.expected_consent_revision+1,precision:'none',lease_id:null,capture_id:null,expires_at:null,last_sequence:0};rotateRoom();}return {kind:'consent',convoy_id:roomId,...copy(canonical.self_consent)};
  case 'convoy_code_rotate':canonical.revision++;canonical.self_code={generation:canonical.self_code.generation+1,hash:q.code_hash,expires_at:canonical.expires_at};rotateRoom();return {kind:'convoy',convoy_id:roomId,revision:canonical.revision,state:canonical.state};
  case 'friend_link_create':links.push({id:q.link_id,revision:1,state:'active',expires_at:'2026-10-01T03:00:00Z'});return {kind:'friend_link',link_id:q.link_id,revision:1,state:'active',expires_at:'2026-10-01T03:00:00Z'};
  default:throw Error(`Unsupported test request ${q.action}`);
 }}
 const links=[];
 const service={
  async getFriendLinks(requested,captured){reads.push({kind:'links',requested,token:captured.access_token});if(behavior.readHold?.kind==='links'&&(!behavior.readHold.scope||behavior.readHold.scope===requested))return behavior.readHold.promise;return {owner_id:requested.userId,server_now:stamp,items:copy(links)};},
  async listConvoys(requested,captured){reads.push({kind:'rooms',requested,token:captured.access_token});return {owner_id:requested.userId,server_now:stamp,items:requested.userId===owner?[{id:roomId,host_id:owner,title:canonical.title,revision:canonical.revision,state:canonical.state,self_state:'accepted',expires_at:canonical.expires_at}]:[]};},
  async getConvoy(requested,captured,id){reads.push({kind:'room',requested,token:captured.access_token,id});if(behavior.readHold?.kind==='room'&&(!behavior.readHold.scope||behavior.readHold.scope===requested))return behavior.readHold.promise;return requested.userId===owner?copy(canonical):null;},
  async getLiveOperation(requested,_captured,id){statuses.push({requested,id});return receipts.get(id)??null;},
  async mutateLive(requested,_captured,op){sends.push({requested,op});if(behavior.sendHold)await behavior.sendHold.promise;if(cancelled.has(op.operationId))return {error:{code:'LIVE_OPERATION_CANCELLED'}};
   const applied=result(op);delete applied.last_sequence;const receipt={owner_id:requested.userId,operation_id:op.operationId,request:op.request,applied_at:stamp,result:applied};receipts.set(op.operationId,receipt);return receipt;},
  async cancelLiveGrant(requested,_captured,op){cancels.push({requested,op});const receipt=receipts.get(op.operationId);if(receipt)return receipt;cancelled.add(op.operationId);return {owner_id:requested.userId,operation_id:op.operationId,request:op.request,state:'cancelled',cancelled_at:stamp};},
  async publishLivePosition(requested,_captured,sample){publishes.push({requested,sample});return {owner_id:requested.userId,convoy_id:roomId,lease_id:sample.lease_id,sequence:sample.sequence,received_at:sample.captured_at,expires_at:new Date(Date.parse(sample.captured_at)+15000).toISOString()};},
  async getConvoyPositions(requested,_captured,room){positionReads.push({requested,room});return room.topic_generation!==canonical.topic_generation?{error:{code:'CONVOY_CHANGED'}}:{...positions(),topic_generation:canonical.topic_generation,change_revision:canonical.change_revision};},
  async heartbeatConvoy(requested,_captured,room){heartbeats.push({requested,room});return {owner_id:requested.userId,convoy_id:room.id,server_now:stamp,host_lease_until:room.host_lease_until};},
  async resolveFriendLink(){throw Error('Resolver must be explicitly mocked by a test');},async resolveConvoyCode(){throw Error('Resolver must be explicitly mocked by a test');},
 };
 const secretStore={
  async put(requested,kind,id,hash,value){secretEvents.push({action:'put',requested,kind,id,hash});if(behavior.secretHold)await behavior.secretHold.promise;if(behavior.secretFailure)throw Error('LOCAL_WRITE_FAILED');if(requested!==scope)throw Error('ACCOUNT_CHANGED');secrets.set(`${requested.userId}:${kind}:${id}:${hash}`,value);},
  async get(requested,kind,id,hash){return requested===scope?secrets.get(`${requested.userId}:${kind}:${id}:${hash}`)??null:null;},
  async find(requested,kind,id){if(requested!==scope)return null;const prefix=`${requested.userId}:${kind}:${id}:`;for(const [key,value] of secrets)if(key.startsWith(prefix))return {hash:key.slice(prefix.length),value};return null;},
 };
 const createClient=(_url,_key,options)=>{const client={options,closed:false,channels:[],realtime:{setAuth:async()=>{},disconnect:()=>{client.closed=true;}},channel(topic){const channel={topic,handlers:[],on(type,filter,fn){channel.handlers.push({type,filter,fn});return channel;},subscribe(callback){channel.status=callback;return channel;}};client.channels.push(channel);return channel;},removeChannel:async()=>{}};clients.push(client);return client;};
 const app=()=>({ready:behavior.hydrated,storageError:behavior.storageError,data:{liveOperations:owned.get(scope.userId)??[]},getOwned:()=>({liveOperations:owned.get(scope.userId)??[]}),update(patch){if(behavior.writeFailure)return false;owned.set(scope.userId,patch.liveOperations);dirty=true;return true;},flushStorage:async()=>{if(behavior.flushFailure)throw Error('LOCAL_WRITE_FAILED');},retryStorage:async()=>{}});
 const overrides={react:React,'react-native':{AppState:native,Platform:{OS:'ios'},Linking:{getInitialURL:async()=>behavior.initialUrl,addEventListener(_event,fn){linkListeners.add(fn);return {remove:()=>linkListeners.delete(fn)};}}},'expo-constants':{expoConfig:{scheme}},'expo-router':{usePathname:()=>pathname},'expo-crypto':{randomUUID:()=>uuid(++opId),CryptoDigestAlgorithm:{SHA256:'SHA256'},digestStringAsync:async(_algo,value)=>sha(value),getRandomBytesAsync:async count=>Uint8Array.from({length:count},(_,i)=>(i+opId)%256)},'@supabase/supabase-js':{createClient},
  '../features/onboarding':{useOnboardingStatus:()=>({ready:true,error:null,value:{preferences:{ghost_mode:behavior.ghost}}})},'../features/live/service':service,'../features/live/secretStorage':{liveSecrets:secretStore,liveSecretPersistence:'secure'},'../lib/publicService':{publicService:{url:'https://test.invalid',publishableKey:'test-only'}},
  './AppState':{useApp:app},'./AuthState':{useAuth:()=>({ready:true,scope,session}),isAccountCurrent:requested=>requested===scope},'../../state/AuthState':{isAccountCurrent:requested=>requested===scope},'./SocialState':{useSocial:()=>({profileReady:behavior.profileReady,optedIn:behavior.optedIn,refresh:async()=>{}})},'./RideState':{useRide:()=>({liveCapture:bus,movingLocked:behavior.moving,start:()=>{behavior.gpsRequests++;},startRide:()=>{behavior.gpsRequests++;}})},
 };
 const sandbox={Promise,Error,Date:FixedDate,JSON,Set,Map,TextEncoder,TextDecoder,URL,Uint8Array,performance:{now:()=>mono},setInterval:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay,interval:true});return id;},clearInterval:id=>timers.delete(id),setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay,interval:false});return id;},clearTimeout:id=>timers.delete(id),console,process:{env:{}}};
 function load(path){if(cache.has(path))return cache.get(path).exports;const module={exports:{}};cache.set(path,module);const code=ts.transpileModule(readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{...sandbox,module,exports:module.exports,require:name=>{if(name in overrides)return overrides[name];if(!name.startsWith('.'))return require(name);let next=resolve(dirname(path),name);if(!existsSync(next))for(const extension of ['.ts','.tsx'])if(existsSync(next+extension)){next+=extension;break;}return load(next);}});return module.exports;}
 const {LiveCaptureBus}=load(resolve(root,'features/live/LiveCaptureBus.ts'));bus=new LiveCaptureBus(binding=>binding.scope===scope);
 const provider=load(resolve(root,'state/LiveState.tsx')),incoming=load(resolve(root,'features/live/incomingIntent.ts'));
 const h={behavior,reads,sends,statuses,publishes,positionReads,heartbeats,cancels,timers,clients,secretEvents,secrets,owned,receipts,bus,service,incoming,rotateRoom,
  get scope(){return scope;},get canonical(){return canonical;},get state(){return provider.useLive();},
  render(){index=0;dirty=false;provider.LiveProvider({children:null});while(layouts.length)layouts.shift()();while(effects.length)effects.shift()();return provider.useLive();},
  async settle(){for(let pass=0;pass<20;pass++){await tick();if(dirty)h.render();}return h.render();},
  switch(id){scope={userId:id,generation:scope.generation+1};session=id?{user:{id},access_token:`test-only-${id}-${scope.generation}`}:null;return h.render();},
  background(){native.currentState='background';listeners.forEach(fn=>fn('background'));return h.render();},foreground(){native.currentState='active';listeners.forEach(fn=>fn('active'));return h.render();},
  path(value){pathname=value;return h.render();},delete(){provider.clearLiveAccount(scope);return h.render();},
  bind(){bus.bind({scope,rideId:uuid(7),captureId,segmentId:uuid(8),platform:'ios'});return h.render();},
  sample(sequence=1){bus.accept({captureId,segmentId:uuid(8),seq:sequence,accepted:true,sample:{timestampMs:wall,latitude:13.73,longitude:100.5,speedMps:0,horizontalAccuracyM:8,speedAccuracyMps:null,isSimulatedBySoftware:null,isProducedByAccessory:null,mocked:null}},mono,wall);},
  pulse(delay){for(const timer of [...timers.values()])if(timer.interval&&(!delay||timer.delay===delay))timer.fn();},
  clock(next){wall+=next-mono;mono=next;},
  expire(){for(const [id,timer] of [...timers])if(!timer.interval&&timer.delay<300000){timers.delete(id);timer.fn();}},
  async open(){await h.state.openRoom(roomId);return h.settle();},
  review(){return {roomId,roomRevision:canonical.revision,memberGeneration:canonical.self_generation,consentRevision:canonical.self_consent.revision,captureId};},
  seedCode(value){canonical.self_code.hash=sha(`ride-speed:convoy-code:v1:${value}`);secrets.set(`${owner}:code:${roomId}:${canonical.self_code.hash}`,value);},
 };h.render();return h;
}
