import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../src/',import.meta.url));
function fixture(extra={}){
 const cells=[],effects=[],timers=new Map();let index=0,focused=true,timerId=0,mapHandle;const listeners=new Set();
 const same=(a,b)=>!!a&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
 const memo=(fn,deps)=>{const i=index++;if(!cells[i]||!same(cells[i].deps,deps))cells[i]={deps,value:fn()};return cells[i].value;};
 const enqueue=(fn,deps)=>{const i=index++,old=cells[i];if(!old||!deps||!same(old.deps,deps)){cells[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();cells[i].cleanup=fn();});}};
 const react={forwardRef:fn=>fn,useMemo:memo,useRef:value=>{const i=index++;return cells[i]??={current:value};},useState:value=>{const i=index++;cells[i]??={value:typeof value==='function'?value():value};return[cells[i].value,next=>{cells[i].value=typeof next==='function'?next(cells[i].value):next;}];},useCallback:(fn,deps)=>memo(()=>fn,deps),useLayoutEffect:enqueue,useEffect:enqueue};
 const native={View:'View',ScrollView:'ScrollView',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator',Keyboard:{dismiss(){}},StyleSheet:{absoluteFill:{},hairlineWidth:1,create:value=>value},AppState:{currentState:'active',addEventListener(_name,fn){listeners.add(fn);return{remove(){listeners.delete(fn);}};}}};
 const jsx=(type,props)=>({type,props}),cache=new Map(),overrides={react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':native,'expo-router':{useIsFocused:()=>focused},'./MapSurface':{__esModule:true,default:'MapSurface'},...extra};
 function load(path){if(cache.has(path))return cache.get(path).exports;const module={exports:{}};cache.set(path,module);const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;runInNewContext(code,{module,exports:module.exports,require:name=>{if(name in overrides)return overrides[name];if(!name.startsWith('.'))return require(name);let next=resolve(dirname(path),name);if(!existsSync(next))for(const extension of ['.ts','.tsx'])if(existsSync(next+extension)){next+=extension;break;}return load(next);},console,Date,Promise,AbortController,setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});return module.exports;}
 return{load,render(fn,...args){index=0;const value=fn(...args);if(mapHandle!==undefined)for(const node of flatten(value))if(node.type==='MapSurface'&&node.props.ref)node.props.ref.current=mapHandle;while(effects.length)effects.shift()();return value;},mapHandle(value){mapHandle=value;},flush(){const ready=[...timers.values()];timers.clear();for(const fn of ready)fn();},focus(value){focused=value;},background(value='background'){native.AppState.currentState=value;for(const listener of listeners)listener(value);},close(){for(const cell of cells)cell?.cleanup?.();}};
}
const camera={center:{latitude:13.75,longitude:100.5},zoom:13,bearing:0,pitch:0};
const props={initialCamera:camera,theme:'dark',locale:'th',contentInsets:{top:0,right:0,bottom:0,left:0},mode:'browse',reducedMotion:false,online:true,retryToken:0,track:null,pins:[],peers:[],selectedPinId:null,userFix:null,onStatus:()=>{}};
test('actual activity hook revokes held work immediately on background, including a full background/resume before render',()=>{
 const f=fixture(),{useScreenActivity}=f.load(resolve(root,'lib/useScreenActivity.ts'));let activity=f.render(useScreenActivity);const ticket=activity.capture();assert.ok(activity.accepts(ticket));f.background();assert.equal(activity.current(),false);assert.equal(activity.accepts(ticket),false);f.background('active');assert.equal(activity.accepts(ticket),false);activity=f.render(useScreenActivity);assert.ok(activity.current());assert.ok(activity.accepts(activity.capture()));f.close();assert.equal(activity.current(),false);
});
test('actual map wrapper disposes the renderer on blur/background/expanded HUD and restores its last settled camera',()=>{
 const f=fixture(),Surface=f.load(resolve(root,'features/map/ActiveMapSurface.tsx')).default,ref={current:null};let tree=f.render(Surface,props,ref);assert.equal(tree.type,'MapSurface');const moved={...camera,zoom:16,center:{latitude:13.8,longitude:100.6}};tree.props.onCameraChanged(moved);f.focus(false);assert.equal(f.render(Surface,props,ref),null);f.focus(true);tree=f.render(Surface,props,ref);assert.deepEqual(JSON.parse(JSON.stringify(tree.props.initialCamera)),moved);f.background();assert.equal(f.render(Surface,props,ref),null);f.background('active');assert.equal(f.render(Surface,{...props,visible:false},ref),null);tree=f.render(Surface,props,ref);assert.equal(tree.type,'MapSurface');f.close();
});
test('old map callbacks cannot overwrite a restored viewport or publish late status after lifecycle suspension',()=>{
 const f=fixture(),Surface=f.load(resolve(root,'features/map/ActiveMapSurface.tsx')).default,ref={current:null},statuses=[];const p={...props,onStatus:value=>statuses.push(value)};const old=f.render(Surface,p,ref);old.props.onCameraChanged({...camera,zoom:15});f.background();f.background('active');const next=f.render(Surface,p,ref);old.props.onCameraChanged({...camera,zoom:2});old.props.onStatus({state:'error',reason:'renderer'});assert.equal(statuses.length,0);assert.equal(f.render(Surface,p,ref).props.initialCamera.zoom,15);next.props.onStatus({state:'ready'});assert.equal(statuses.length,1);f.close();
});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};},settle=()=>new Promise(done=>setImmediate(done));
const flatten=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(flatten)];
function routeFixture(){
 const calls=[],writes=[],road=deferred(),search=deferred(),f=fixture({
  'expo-crypto':{randomUUID:()=> 'new-pin'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
  '../../components/ui':Object.fromEntries(['Button','Field','Glass','Icon','Row','Segments','T'].map(name=>[name,name])),
  '../map/ActiveMapSurface':{__esModule:true,default:'MapSurface'},'../../state/AppState':{useApp:()=>({colors:{bg:'#000',accent:'#f50',line:'#111'},dark:true,motion:false})},
  '../../state/RideState':{useRide:()=>({movingLocked:false,userFix:null})},'../../lib/i18n':{useI18n:()=>({language:'th',t:key=>key})},'../../lib/i18n/m4':{routeErrorKey:()=> 'm4.error.provider'},'./RouteSheet':{RouteSheet:'RouteSheet'},'./RoutingAttribution':{RoutingAttribution:'RoutingAttribution'}
 }),Builder=f.load(resolve(root,'features/routes/RouteBuilder.tsx')).default;
 const value={title:'Real draft',category:'scooter',visibility:'private',geometry:null,stops:[{id:'a',label:'A',coordinate:{latitude:13,longitude:100}},{id:'b',label:'B',coordinate:{latitude:13.001,longitude:100.001}}]};
 const input={value,onChange:next=>writes.push(next),onSave:async()=>true,onClose(){},search:(_query,_lang,signal)=>{calls.push({kind:'search',signal});return search.promise;},calculate:(_stops,_profile,signal)=>{calls.push({kind:'road',signal});return road.promise;},locked:false,consent:true,onRequestConsent:async()=>true,ownerGeneration:1,online:true};
 return{...f,calls,writes,road,search,render:()=>f.render(Builder,input)};
}
test('actual route builder makes no hidden debounced request and aborts an already dispatched request on blur',()=>{
 const f=routeFixture();f.render();f.background();f.flush();assert.equal(f.calls.length,0);f.render();f.background('active');f.render();f.flush();assert.equal(f.calls.length,1);f.focus(false);f.render();assert.equal(f.calls[0].signal.aborted,true);f.close();
});
test('actual route builder discards a held road response after a complete OS suspend/resume before rendering',async()=>{
 const f=routeFixture();f.render();f.flush();assert.equal(f.calls.length,1);f.background();f.background('active');f.road.resolve({profile:'scooter',segments:[[{latitude:13,longitude:100},{latitude:13.001,longitude:100.001}]],distanceMeters:160,durationSeconds:30,routeToken:'real-server-proof',requestHash:'hash',attribution:'Geoapify',calculatedAt:'2030-10-01T12:00:00Z'});await settle();assert.equal(f.writes.length,0);f.close();
});
test('actual route builder hides a held search result after blur and does not reuse it on return',async()=>{
 const f=routeFixture();let tree=f.render();await flatten(tree).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='m4.search').props.onPress();tree=f.render();flatten(tree).find(n=>n.type==='Field'&&n.props.label==='m4.search').props.onChangeText('บางนา');f.render();f.flush();assert.equal(f.calls.filter(c=>c.kind==='search').length,1);f.focus(false);f.render();f.search.resolve({items:[{id:'authorized-place',label:'Held old place',latitude:13,longitude:100}],attribution:'Geoapify'});await settle();f.focus(true);tree=f.render();assert.equal(flatten(tree).some(n=>n.type==='T'&&n.props.children==='Held old place'),false);f.close();
});
test('actual route detail defers new geometry fitting while disposed and keeps a restored pan for unchanged geometry',()=>{
 const fits=[],handle={fitCoordinates:points=>fits.push(JSON.parse(JSON.stringify(points)))},f=fixture({
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'../../components/ui':Object.fromEntries(['Button','Glass','Icon','Row','T'].map(name=>[name,name])),
  '../map/ActiveMapSurface':{__esModule:true,default:'MapSurface'},'../../state/AppState':{useApp:()=>({colors:{bg:'#000',accent:'#f50',line:'#111'},dark:true,motion:false})},'../../state/RideState':{useRide:()=>({movingLocked:false,userFix:null})},'../../lib/i18n':{useI18n:()=>({language:'th',t:key=>key})},'../../lib/i18n/m4':{routeErrorKey:()=> 'm4.error.provider'},'./RouteSheet':{RouteSheet:'RouteSheet'},'./RoutingAttribution':{RoutingAttribution:'RoutingAttribution'}
 }),Detail=f.load(resolve(root,'features/routes/RouteDetail.tsx')).default;
 const item=latitude=>({kind:'shared',route:{title:'Shared route',visibility:'friends',provider:'recorded',segments:[[{latitude,longitude:100},{latitude:latitude+.01,longitude:100.01}]],geometryStatus:'visible',attribution:null}});let input={item:item(13),onClose(){}};
 const render=()=>f.render(Detail,input),status=value=>flatten(render()).find(n=>n.type==='MapSurface').props.onStatus(value);f.mapHandle(handle);status({state:'ready'});render();assert.equal(fits.length,1);
 f.mapHandle(null);render();f.mapHandle(handle);status({state:'loading'});status({state:'ready'});render();assert.equal(fits.length,1,'same route retains its settled/panned viewport');
 f.mapHandle(null);input={...input,item:item(14)};render();assert.equal(fits.length,1);f.mapHandle(handle);status({state:'loading'});status({state:'ready'});render();assert.equal(fits.length,2);assert.equal(fits[1][0].latitude,14);f.close();
});
