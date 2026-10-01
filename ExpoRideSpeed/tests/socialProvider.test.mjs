import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),root=fileURLToPath(new URL('../src/',import.meta.url));
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',F='ffffffff-ffff-4fff-8fff-ffffffffffff';
const tick=()=>new Promise(done=>setImmediate(done));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function harness({appReady=true}={}){
 const cells=[],effects=[],layouts=[],listeners=new Set(),timers=new Map(),clients=[],reads=[],pulses=[],sends=[],statuses=[],cache=new Map(),owned=new Map();
 let index=0,dirty=false,timerId=0,opId=0,mono=100,scope={userId:A,generation:1},session={user:{id:A},access_token:'test-only-A-1'};
 const behavior={appReady,readHold:null,sendHold:null,readFailure:false,enabled:true,revision:3,ghost:false,moving:false,friendVisible:true};
 const React={createContext(value){const context={value};context.Provider={context};return context;},useContext:context=>context.value,createElement(type,props,...children){if(type?.context)type.context.value=props.value;return {type,props,children};},
  useState(value){const at=index++;if(!(at in cells))cells[at]=typeof value==='function'?value():value;return[cells[at],next=>{cells[at]=typeof next==='function'?next(cells[at]):next;dirty=true;}];},
  useRef(value){const at=index++;return cells[at]??={current:value};},
  useMemo(fn,deps){const at=index++;if(!cells[at]||deps.some((value,i)=>value!==cells[at].deps[i]))cells[at]={deps,value:fn()};return cells[at].value;},
  useCallback(fn,deps){return React.useMemo(()=>fn,deps);},
  useEffect(fn,deps=[]){enqueue(effects,fn,deps);},useLayoutEffect(fn,deps=[]){enqueue(layouts,fn,deps);},
  useSyncExternalStore(subscribe,get){const at=index++;if(cells[at]?.subscribe!==subscribe){cells[at]?.remove?.();cells[at]={subscribe,remove:subscribe(()=>dirty=true)};}return get();},
 };
 function enqueue(queue,fn,deps){const at=index++,old=cells[at];if(!old||deps.some((value,i)=>value!==old.deps[i])){old?.cleanup?.();cells[at]={deps};queue.push(()=>cells[at].cleanup=fn());}}
 const native={currentState:'active',addEventListener(_event,fn){listeners.add(fn);return {remove:()=>listeners.delete(fn)};}};
 const page=owner=>({owner_id:owner,server_now:'2026-10-01T00:00:00Z',self:{profile_ready:true,presence_opt_in:behavior.enabled,account_revision:behavior.revision},items:[{user_id:F,handle:'friend_rider',display_name:'Fixture friend',state:'accepted',direction:'incoming',generation:1,updated_at:'2026-10-01T00:00:00Z'}],statuses:[{user_id:F,topic:'rs-presence:cccccccc-cccc-4ccc-8ccc-cccccccccccc',online:true,expires_at:'2026-10-01T00:01:10Z'}],next_cursor:null});
 const services={
  async getSocialSnapshot(requested,captured){reads.push({requested,token:captured.access_token});if(behavior.readHold&&(!behavior.readHold.generation||behavior.readHold.generation===requested.generation))return behavior.readHold.promise;if(behavior.readFailure)throw Error('SOCIAL_UNAVAILABLE');const value=page(requested.userId);if(!behavior.friendVisible){value.items=[];value.statuses=[];}return value;},
  async getInvitationInbox(requested){return {owner_id:requested.userId,server_now:'2026-10-01T00:00:00Z',items:[],next_cursor:null};},
  async getBlockedPeople(requested){return {owner_id:requested.userId,items:[],next_cursor:null};},
  async heartbeatSocial(requested,captured){pulses.push({requested,token:captured.access_token});return '2026-10-01T00:01:10Z';},
  async getSocialOperation(requested,id){statuses.push({requested,id});return null;},
  async sendSocialMutation(requested,captured,op){sends.push({requested,op});if(behavior.sendHold)await behavior.sendHold.promise;let result;if(op.request.action==='set_presence'){behavior.enabled=op.request.enabled;behavior.revision++;result={kind:'presence',enabled:op.request.enabled,account_revision:behavior.revision};}else if(op.request.action==='friend_action'){behavior.friendVisible=false;result={kind:'friend',user_id:F,state:op.request.verb==='remove'?'removed':'blocked',generation:2};}else throw Error('test-only unsupported request');return {owner_id:requested.userId,operation_id:op.operationId,request:op.request,applied_at:'2026-10-01T00:00:00Z',result};},
 };
 const createClient=(_url,_key,options)=>{const client={options,channels:[],closed:false,realtime:{setAuth:async token=>client.token=token,disconnect:()=>client.closed=true},channel(topic){const channel={topic,on(){return channel;},subscribe(callback){channel.status=callback;return channel;}};client.channels.push(channel);return channel;},removeChannel:async()=>{}};clients.push(client);return client;};
 const app=()=>({ready:behavior.appReady,storageError:null,data:{socialOperations:owned.get(scope.userId)??[]},getOwned:()=>({socialOperations:owned.get(scope.userId)??[]}),update(patch){owned.set(scope.userId,patch.socialOperations??owned.get(scope.userId)??[]);dirty=true;return true;},flushStorage:async()=>{},retryStorage:async()=>{}});
 const overrides={react:React,'react-native':{AppState:native,Platform:{OS:'ios'}},'expo-crypto':{randomUUID:()=>`dddddddd-dddd-4ddd-8ddd-${(++opId).toString().padStart(12,'0')}`},'@supabase/supabase-js':{createClient},
  '../features/onboarding':{useOnboardingStatus:()=>({ready:true,error:null,value:{preferences:{ghost_mode:behavior.ghost}},refresh:async()=>{behavior.ghost=!behavior.enabled;dirty=true;}})},
  '../features/social/service':services,'../lib/publicService':{publicService:{url:'https://test.invalid',publishableKey:'test-only'}},
  './AppState':{useApp:app},'./AuthState':{useAuth:()=>({ready:true,scope,session}),isAccountCurrent:requested=>requested===scope},'./RideState':{useRide:()=>({movingLocked:behavior.moving})},
 };
 const sandbox={Promise,Error,Date,JSON,Set,Map,TextEncoder,TextDecoder,performance:{now:()=>mono},setInterval:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay,interval:true});return id;},clearInterval:id=>timers.delete(id),setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay,interval:false});return id;},clearTimeout:id=>timers.delete(id),console,process:{env:{}}};
 function load(path){if(cache.has(path))return cache.get(path).exports;const module={exports:{}};cache.set(path,module);const code=ts.transpileModule(readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{...sandbox,module,exports:module.exports,require:name=>{if(name in overrides)return overrides[name];if(!name.startsWith('.'))return require(name);let next=resolve(dirname(path),name);if(!existsSync(next))for(const extension of ['.ts','.tsx'])if(existsSync(next+extension)){next+=extension;break;}return load(next);}});return module.exports;}
 const provider=load(resolve(root,'state/SocialState.tsx'));
 const h={behavior,reads,pulses,sends,statuses,timers,clients,owned,page,
  render(){index=0;dirty=false;provider.SocialProvider({children:null});while(layouts.length)layouts.shift()();while(effects.length)effects.shift()();return provider.useSocial();},
  async settle(){for(let pass=0;pass<20;pass++){await tick();if(dirty)h.render();}return h.render();},
  switch(id){scope={userId:id,generation:scope.generation+1};session={user:{id},access_token:`test-only-${id}`};return h.render();},
  refreshToken(){session={...session,access_token:'test-only-A-2'};return h.render();},
  background(){native.currentState='background';listeners.forEach(fn=>fn('background'));return h.render();},
  foreground(){native.currentState='active';listeners.forEach(fn=>fn('active'));return h.render();},
  delete(){provider.clearSocialAccount(scope);return h.render();},
  pulse(){for(const timer of timers.values())if(timer.interval)timer.fn();},
  expire(){for(const [id,timer] of timers)if(!timer.interval&&timer.delay>60000){timers.delete(id);timer.fn();}},
  mono(value){mono=value;},
 };h.render();return h;
}

test('actual social provider waits for owner storage and canonical profile read before heartbeat',async()=>{
 const h=harness({appReady:false});await h.settle();assert.equal(h.pulses.length,0);
 h.behavior.appReady=true;const hold=deferred();h.behavior.readHold=hold;let state=h.render();assert.equal(state.loading,true);assert.equal(state.profileReady,false);
 hold.resolve(h.page(A));state=await h.settle();assert.equal(state.ready,true);assert.equal(state.profileReady,true);assert.ok(h.pulses.length>0);
 assert.equal([...h.timers.values()].some(timer=>timer.interval&&timer.delay===1000),false,'status expiry must not rerender the map once per second');
});

test('actual social provider mutes opt-out before a held server response and background cannot heartbeat',async()=>{
 const h=harness();let state=await h.settle();assert.equal(state.fresh,true);const before=h.pulses.length,hold=deferred();h.behavior.sendHold=hold;
 const pending=state.setPresence(false).catch(error=>error);await tick();state=h.render();assert.equal(state.optedIn,false);h.pulse();await h.settle();assert.equal(h.pulses.length,before);
 h.background();h.pulse();await h.settle();assert.equal(h.pulses.length,before);const readCount=h.reads.length;hold.resolve();const result=await pending;state=await h.settle();assert.equal(result,undefined,JSON.stringify({error:result?.message,latest:state.latest,pending:state.pending,queueError:state.error}));assert.equal(state.optedIn,false);assert.equal(state.pending.length,0);assert.equal(h.reads.length,readCount,'durable validACK cannot begin a background read');
 await assert.rejects(()=>state.refresh(),/SOCIAL_INACTIVE/);await assert.rejects(()=>state.retry(),/SOCIAL_INACTIVE/);await assert.rejects(()=>state.loadMoreFriends(),/SOCIAL_INACTIVE/);h.foreground();await h.settle();assert.ok(h.reads.length>readCount);assert.equal(h.behavior.ghost,true);
});

test('actual social provider fences a late A read across A→B→A',async()=>{
 const h=harness();await h.settle();const hold=deferred();hold.generation=1;h.behavior.readHold=hold;const retained=h.render();const waiting=retained.refresh();
 h.switch(B);h.switch(A);h.behavior.readHold=null;await h.settle();hold.resolve({...h.page(A),self:{profile_ready:false,presence_opt_in:false,account_revision:0}});await waiting;const state=await h.settle();
 assert.equal(state.profileReady,true);await assert.rejects(()=>retained.mutate({schema_version:1,action:'request_friend',handle:'rider_one'}),/ACCOUNT_CHANGED/);
});

test('actual social provider closes only its socket on token rotation and deleted owner stays fenced',async()=>{
 const h=harness();await h.settle();const first=h.clients.at(-1);assert.ok(first);h.refreshToken();await h.settle();assert.equal(first.closed,true);const second=h.clients.at(-1);assert.notEqual(second,first);assert.equal(await second.options.accessToken(),'test-only-A-2');
 const retained=h.render();h.delete();assert.equal(second.closed,true);h.pulse();const state=await h.settle();assert.equal(state.ready,false);assert.deepEqual(Array.from(state.friends),[]);
 await assert.rejects(()=>retained.refresh(),/ACCOUNT_CHANGED/);h.switch(B);assert.equal((await h.settle()).ready,true);h.switch(A);assert.equal((await h.settle()).ready,false);
});

test('actual social provider expires trusted status by monotonic time and locks moving mutations',async()=>{
 const h=harness();await h.settle();h.mono(71000);h.expire();let state=h.render();assert.equal(state.presence[0].online,false);assert.equal(state.presence[0].expires_at,null);
 h.behavior.moving=true;state=h.render();await assert.rejects(()=>state.mutate({schema_version:1,action:'request_friend',handle:'rider_one'}),/SOCIAL_MOVING_LOCKED/);assert.equal(h.owned.get(A)?.length??0,0);
});

test('pending peer removal stays hidden through a fresh pre-ACK server read and canonical ACK refresh',async()=>{
 const h=harness();let state=await h.settle();const hold=deferred();h.behavior.sendHold=hold;
 const request=state.mutate({schema_version:1,action:'friend_action',other_id:F,verb:'remove',expected_generation:1});await tick();state=await h.settle();assert.equal(state.friends.length,0);assert.equal(state.presence.length,0);
 await state.refresh();state=await h.settle();assert.equal(state.friends.length,0,'server has not removed the peer yet, but pending local intent must quarantine it');assert.equal(state.presence.length,0);
 hold.resolve();await request;state=await h.settle();assert.equal(state.pending.length,0);assert.equal(state.friends.length,0);assert.equal(state.presence.length,0);
});

test('confirmed removal cannot restore a cached pre-ACK peer when the post-ACK read fails',async()=>{
 const h=harness();let state=await h.settle();const hold=deferred();h.behavior.sendHold=hold;
 const pending=state.mutate({schema_version:1,action:'friend_action',other_id:F,verb:'remove',expected_generation:1});await tick();state=await h.settle();await state.refresh();await h.settle();
 h.behavior.readFailure=true;hold.resolve();await pending;state=await h.settle();assert.equal(state.latest.status,'applied');assert.equal(state.pending.length,0);assert.equal(state.fresh,false);assert.equal(state.friends.length,0);assert.equal(state.presence.length,0);
});
