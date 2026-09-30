import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const session = id => ({ user: { id }, access_token: `token-${id}`, refresh_token: `refresh-${id}` });

function loadAuth() {
  let authListener, effect; const states = []; let stateIndex = 0;
  const initial = deferred(), exchange = deferred(); let exchanges = 0;
  const query = deferred(); let header, calls = 0;
  const client = { auth: {
    onAuthStateChange(fn) { authListener = fn; return { data: { listener: {}, subscription: { unsubscribe() {} } } }; },
    getSession: () => initial.promise,
    exchangeCodeForSession() { exchanges++; return exchange.promise; },
    startAutoRefresh() {}, stopAutoRefresh() {},
  }, rpc() { calls++; return { setHeader(k,v) { header = [k,v]; return query.promise; } }; } };
  const React = { createContext: v => ({ Provider: 'Provider', value:v }), useContext: c => c.value,
    useState(v) { const i=stateIndex++; states[i]=typeof v==='function'?v():v;return[states[i],x=>{states[i]=typeof x==='function'?x(states[i]):x;}]; },
    useEffect(fn) { effect=fn; }, useRef:v=>({current:v}), createElement:(type,props,...children)=>({type,props,children}),
  };
  const imports = { react: React, 'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},
    '../lib/supabase':{supabase:client}, '@supabase/supabase-js':{createClient:()=>client}, '../lib/publicService':{publicService:{url:'https://test.invalid',publishableKey:'test'}} };
  const source=readFileSync(new URL('../src/state/AuthState.tsx',import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(js,{require:name=>{if(name in imports)return imports[name];throw new Error(name);},module,exports:module.exports,Map,Date,Promise,Error,process:{env:{}},setTimeout,clearTimeout});
  module.exports.AuthProvider({children:null}); effect();
  return { exports:module.exports, states, initial, exchange, query, emit:(event,s)=>authListener(event,s), get exchanges(){return exchanges;},get header(){return header;},get calls(){return calls;} };
}

test('older session hydration cannot replace a newer signed-in account',async()=>{
  const h=loadAuth(); h.emit('SIGNED_IN',session('B')); h.initial.resolve({data:{session:session('A')},error:null});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.states[0].session.user.id,'B');
});
test('concurrent duplicate PKCE callbacks exchange one code once',async()=>{
  const h=loadAuth();
  const one=h.exports.exchangeAuthCodeOnce('one-code'), two=h.exports.exchangeAuthCodeOnce('one-code');
  assert.equal(h.exchanges,1);
  h.emit('PASSWORD_RECOVERY',session('A'));
  h.exchange.resolve({data:{session:session('A'),redirectType:'recovery'},error:null});
  assert.equal((await one).recovery,true); assert.equal((await two).userId,'A');
  await h.exports.exchangeAuthCodeOnce('one-code'); assert.equal(h.exchanges,1);
});
test('account RPC pins the original JWT and rejects results after A→B→A switch',async()=>{
  const h=loadAuth(); h.emit('SIGNED_IN',session('A'));
  const scope=h.states[0].scope;
  const pending=h.exports.accountRpc(scope,session('A'),'rs_upsert_profile',{p_handle:'a'});
  assert.deepEqual(h.header,['Authorization','Bearer token-A']);
  h.emit('SIGNED_OUT',null);h.emit('SIGNED_IN',session('B'));h.emit('SIGNED_IN',session('A'));
  h.query.resolve({data:{display_name:'Old'},error:null});
  await assert.rejects(pending,/account|บัญชี/i);
  await assert.rejects(h.exports.accountRpc(scope,session('A'),'rs_upsert_profile',{}),/account|บัญชี/i);
  assert.equal(h.calls,1);
});

function loadRider() {
  const cells=[],effects=[];let index=0,auth={scope:{userId:'A',generation:1},session:session('A'),ready:true};
  const values=new Map([['ride.profile.A',JSON.stringify({displayName:'Alice',photoUri:'file://alice.jpg'})],['ride.profile.B',JSON.stringify({displayName:'Bob',photoUri:'file://bob.jpg'})]]);
  let holdWrite=null;
  const React={createContext:v=>({Provider:'Provider',value:v}),useContext:c=>c.value,
    useState(value){const i=index++;if(!(i in cells))cells[i]=value;return[cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
    useRef(value){const i=index++;if(!(i in cells))cells[i]={current:value};return cells[i];},
    useCallback:fn=>fn,
    useEffect(fn,deps){const i=index++;const previous=cells[i];if(!previous||deps.some((v,j)=>v!==previous.deps[j])){previous?.cleanup?.();cells[i]={deps};effects.push(()=>{cells[i].cleanup=fn();});}},
    createElement:(_type,props)=>props,
  };
  const imports={react:React,'./AuthState':{useAuth:()=>auth,isAccountCurrent:scope=>scope===auth.scope},
    '@react-native-async-storage/async-storage':{getItem:async key=>values.get(key)??null,setItem:async(key,value)=>{if(holdWrite)await holdWrite.promise;values.set(key,value);}},
    '../lib/supabase':{supabase:{from(){return{select(){return this;},eq(){return this;},setHeader(){return this;},maybeSingle:async()=>({data:null,error:null})};}}},
  };
  const source=readFileSync(new URL('../src/state/RiderProfile.tsx',import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};vm.runInNewContext(js,{require:name=>imports[name],module,exports:module.exports,Promise,JSON,Error});
  return { values, hold(){holdWrite=deferred();return holdWrite;}, switch(id){auth={scope:{userId:id,generation:auth.scope.generation+1},session:session(id),ready:true};},render(){index=0;const result=module.exports.RiderProfileProvider({children:null});while(effects.length)effects.shift()();return result.value;} };
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('in-flight local profile save stays with A and cannot replace B after account switch',async()=>{
  const h=loadRider();h.render();await flush();let view=h.render();
  assert.equal(view.displayName,'Alice');assert.equal(view.photoUri,'file://alice.jpg');
  const hold=h.hold(),pending=view.save({displayName:'Alice changed'});await flush();
  h.switch('B');view=h.render();assert.equal(view.photoUri,null);assert.equal(view.ready,false);
  hold.resolve();await assert.rejects(pending,/บัญชี/i);await flush();view=h.render();
  assert.equal(view.displayName,'Bob');assert.equal(view.photoUri,'file://bob.jpg');
  assert.equal(JSON.parse(h.values.get('ride.profile.A')).displayName,'Alice changed');
  assert.equal(JSON.parse(h.values.get('ride.profile.B')).displayName,'Bob');
});
test('overlapping profile name and photo saves preserve both fields',async()=>{
  const h=loadRider();h.render();await flush();const view=h.render();
  await Promise.all([view.save({displayName:'A new name'}),view.save({photoUri:'file://new.jpg'})]);
  const final=h.render();assert.equal(final.displayName,'A new name');assert.equal(final.photoUri,'file://new.jpg');
});
