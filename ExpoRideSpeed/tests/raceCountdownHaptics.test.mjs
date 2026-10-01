import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {snapshot,attempt,owner,uuid} from './helpers/races.mjs';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../src/',import.meta.url));

function fixture(os='ios'){
 let cells=[],index=0,focused=true,now=0,layouts=[],effects=[];const listeners=new Set(),calls=[],cache=new Map();let failure=false;
 const same=(a,b)=>!!a&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const memo=(fn,deps)=>{const i=index++;if(!cells[i]||!same(cells[i].deps,deps))cells[i]={deps,value:fn()};return cells[i].value;};
 const enqueue=(queue,fn,deps)=>{const i=index++,old=cells[i];if(!old||!deps||!same(old.deps,deps)){cells[i]={deps,cleanup:old?.cleanup};queue.push(()=>{old?.cleanup?.();cells[i].cleanup=fn();});}};
 const react={useRef:v=>cells[index++]??={current:v},useState:v=>{const i=index++;cells[i]??={value:typeof v==='function'?v():v};return[cells[i].value,n=>cells[i].value=typeof n==='function'?n(cells[i].value):n];},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useLayoutEffect:(fn,deps)=>enqueue(layouts,fn,deps),useEffect:(fn,deps)=>enqueue(effects,fn,deps)};
 const native={View:'View',ScrollView:'ScrollView',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator',StyleSheet:{absoluteFill:{},hairlineWidth:1,create:v=>v},Platform:{OS:os},AppState:{currentState:'active',addEventListener(_kind,fn){listeners.add(fn);return{remove:()=>listeners.delete(fn)};}}};
 const dispatch=(kind,value)=>{calls.push([kind,value]);return failure?Promise.reject(Error('HAPTICS_UNAVAILABLE')):Promise.resolve();};
 const haptics={ImpactFeedbackStyle:{Light:'Light',Medium:'Medium'},AndroidHaptics:{Clock_Tick:'clock-tick',Confirm:'confirm'},impactAsync:value=>dispatch('impact',value),performAndroidHapticsAsync:value=>dispatch('android',value)};
 const jsx=(type,props)=>({type,props}),ui=Object.fromEntries(['Button','Glass','Note','Panel','Row','T','Empty','Icon'].map(v=>[v,v]));
 const deps={react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':native,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'expo-router':{useIsFocused:()=>focused},'expo-haptics':haptics,'../RaceCourseMap':{__esModule:true,default:'RaceCourseMap'},'../../../components/ui':ui,'../../../state/AppState':{useApp:()=>({dark:true,motion:false,colors:{bg:'#000',ink:'#FFF',line:'#111',muted:'#AAA',accent:'#F50',good:'#0F0',danger:'#F00'}})},'../../motion':{AmbientLoop:'AmbientLoop'},'../../motion/assets':{resolveAmbientAsset:()=>null},'../../routes/RouteSheet':{RouteSheet:'RouteSheet'}};
 function load(path){if(cache.has(path))return cache.get(path).exports;const module={exports:{}};cache.set(path,module);const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;runInNewContext(code,{module,exports:module.exports,Date,console,URL,Promise,performance:{now:()=>now},require:key=>{if(key in deps)return deps[key];if(!key.startsWith('.'))return require(key);let next=resolve(dirname(path),key);if(!existsSync(next))for(const ext of ['.ts','.tsx'])if(existsSync(next+ext)){next+=ext;break;}return load(next);}});return module.exports;}
 const race={...snapshot(),state:'countdown',schedule_epoch:uuid(70),common_start_at:'2026-10-01T02:00:10.123456+00:00'};
 let port={ownerId:owner,generation:'A1',ready:true,fresh:true,detailFresh:true,detailLoading:false,detailError:null,pilotEnabled:true,busy:false,error:null,pending:[],latest:null,reviewRequired:[],retryAfterMs:null,gate:{signedIn:true,profileReady:true,native:true,foreground:true,focused:true,moving:false,online:true},race,attempt:{...attempt(),schedule_epoch:race.schedule_epoch,common_start_at:race.common_start_at},course:{race_id:race.id,approval_id:race.approval.id,config_hash:race.approval.config_hash,route_geometry_hash:race.approval.route_geometry_hash},courseError:null,eligibility:{captureReady:true,stageReady:true,clockReady:true,canSchedule:false},countdown:{phase:'countdown',secondsRemaining:5,uncertaintyMs:60,error:null,observedMonotonicMs:0}};
 port.current=gen=>gen===port.generation;port.guard=gen=>{if(gen!==port.generation||!port.gate.foreground||!port.gate.focused||port.gate.moving||!port.pilotEnabled)throw Error('RACE_REVIEW_REQUIRED');};
 const Screen=load(resolve(root,'features/races/ui/RaceLobby.tsx')).default;
 const flush=()=>{while(effects.length)effects.shift()();};
 return {calls,load,get port(){return port;},set port(value){port=value;},renderOnly(){index=0;layouts=[];effects=[];return Screen({port,t:key=>key});},flushLayout(){while(layouts.length)layouts.shift()();},render(flushEffects=true){const tree=this.renderOnly();this.flushLayout();if(flushEffects)flush();return tree;},flush,advance:millis=>{now+=millis;},step(seconds,millis=1000,phase='countdown'){now+=millis;port={...port,countdown:{...port.countdown,phase,secondsRemaining:seconds,observedMonotonicMs:now}};return this.render();},background(state='background'){native.AppState.currentState=state;for(const fn of listeners)fn(state);},focus(value){focused=value;port={...port,gate:{...port.gate,focused:value}};},fail(){failure=true;},unmount(){for(const cell of cells)cell?.cleanup?.();cells=[];effects=[];layouts=[];}};
}
test('actual Lobby emits only 3/2/1 plus one native start, independent of Reduce Motion',()=>{
 const f=fixture();f.render();f.step(3,2000);f.render();f.step(2);f.step(1);f.step(null,1000,'running');f.render();
 assert.deepEqual(f.calls,[['impact','Light'],['impact','Light'],['impact','Light'],['impact','Medium']]);f.unmount();
});
test('actual Lobby uses Android UI haptics and never invokes web vibration',()=>{
 const f=fixture('android');f.render();f.step(3,2000);f.step(2);f.step(1);f.step(null,1000,'running');assert.deepEqual(f.calls,[['android','clock-tick'],['android','clock-tick'],['android','clock-tick'],['android','confirm']]);f.unmount();
 const web=fixture('web');web.render();web.step(3,2000);assert.deepEqual(web.calls,[]);web.unmount();
});
test('a full background/resume before React permanently retires current schedule cues',()=>{
 const f=fixture();f.render();f.step(3,2000);f.background();f.background('active');f.step(2);f.step(1);f.step(null,1000,'running');assert.equal(f.calls.length,1);f.unmount();
});
test('queued effects repeat actual activity before dispatch and cannot fire in background',()=>{
 const f=fixture();f.render();f.port={...f.port,countdown:{...f.port.countdown,secondsRemaining:3}};f.render(false);f.background();f.flush();assert.deepEqual(f.calls,[]);f.background('active');f.step(2);assert.deepEqual(f.calls,[]);f.unmount();
});
test('movement, changed consent, account ABA and remount cannot reopen an already observed schedule',()=>{
 for(const reason of ['moving','consent','account','remount']){
  const f=fixture();f.render();f.step(3,2000);
  if(reason==='remount')f.unmount();
  else {const p=f.port;f.port={...p,...(reason==='account'?{generation:'B1',ownerId:uuid(90)}:{}),gate:{...p.gate,moving:reason==='moving'},race:reason==='consent'?{...p.race,self_member:{...p.race.self_member,evidence_consent_version:null}}:p.race};f.render();f.port={...p};}
  f.step(2);f.step(1);assert.equal(f.calls.length,1,reason);f.unmount();
 }
});
test('disabled pilot or invalid clock has no haptic side effect and unsupported native haptics are nonblocking',async()=>{
 for(const invalid of ['pilot','clock']){const f=fixture();f.port={...f.port,pilotEnabled:invalid!=='pilot',eligibility:{...f.port.eligibility,clockReady:invalid!=='clock'}};f.render();f.step(3,2000);assert.deepEqual(f.calls,[]);f.unmount();}
 const f=fixture();f.fail();f.render();f.step(3,2000);await new Promise(done=>setImmediate(done));f.render();assert.equal(f.calls.length,1);f.unmount();
});
test('late running presentation and a stalled numeric frame never produce a catch-up burst',()=>{
 const f=fixture();f.render();f.step(3,2000);f.step(2,5000);f.step(1);f.step(null,1000,'running');assert.equal(f.calls.length,1);f.unmount();
 const late=fixture();late.port={...late.port,countdown:{...late.port.countdown,phase:'running',secondsRemaining:null}};late.render();assert.deepEqual(late.calls,[]);late.unmount();
});
test('a delayed post-commit native effect cannot vibrate for an obsolete displayed bin',()=>{
 const f=fixture();f.port={...f.port,countdown:{...f.port.countdown,secondsRemaining:3}};f.render(false);f.advance(5000);f.flush();assert.deepEqual(f.calls,[]);f.step(2);f.step(1);assert.deepEqual(f.calls,[]);f.unmount();
});
test('an old numeric render held before layout cannot reset source freshness at commit',()=>{
 const f=fixture();f.port={...f.port,countdown:{...f.port.countdown,secondsRemaining:3}};f.renderOnly();f.advance(5000);f.flushLayout();f.flush();assert.deepEqual(f.calls,[]);f.step(2);assert.deepEqual(f.calls,[]);f.unmount();
});
test('a duplicate aged bin stays silent without muting later genuinely fresh source bins',()=>{
 const f=fixture();f.render();f.step(3,2000);f.advance(500);f.port={...f.port};f.render();f.step(2,500);assert.equal(f.calls.length,2);f.unmount();
});
