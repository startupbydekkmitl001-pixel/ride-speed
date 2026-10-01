import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const tick=()=>new Promise(done=>setImmediate(done));
/** Actual provider/budget/power modules; only React scheduling and OS APIs are isolated. */
function harness(platform='web'){
 let index=0,dirty=false,leaseDirty=false,value,motion=true,alive=true,powerListener;
 const providerCells=[],leaseCells=[],playerCells=[],layouts=[],effects=[],appListeners=new Set(),reads=[],modules=new Map();let cells=providerCells;
 const player={playing:false,play(){this.playing=true;},pause(){this.playing=false;}};
 const mark=owner=>{if(owner===providerCells)dirty=true;else leaseDirty=true;};
 const same=(a,b)=>a&&a.length===b.length&&a.every((x,i)=>x===b[i]);
 const memo=(fn,deps)=>{const n=index++;if(!cells[n]||!same(cells[n].deps,deps))cells[n]={deps,value:fn()};return cells[n].value;};
 const effect=(queue,fn,deps)=>{const owner=cells,n=index++,prior=owner[n];if(!prior||!same(prior.deps,deps)){owner[n]={deps};queue.push(()=>{prior?.cleanup?.();owner[n].cleanup=fn();});}};
 const react={createContext:initial=>({Provider:'Provider',value:initial}),memo:fn=>fn,useContext:()=>value,useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useId:()=>memo(()=>'retained-player',[]),
  useRef:initial=>{const n=index++;return cells[n]??={current:initial};},
  useSyncExternalStore:(subscribe,get)=>{const owner=cells,n=index++;if(owner[n]?.subscribe!==subscribe){owner[n]?.cleanup?.();owner[n]={subscribe,cleanup:subscribe(()=>mark(owner))};}return get();},
  useState:initial=>{const owner=cells,n=index++;owner[n]??={value:typeof initial==='function'?initial():initial};return[owner[n].value,next=>{const result=typeof next==='function'?next(owner[n].value):next;if(result!==owner[n].value){owner[n].value=result;mark(owner);}}];},
  useEffect:(fn,deps)=>effect(effects,fn,deps),useLayoutEffect:(fn,deps)=>effect(layouts,fn,deps),
 };
 const app={currentState:'active',addEventListener:(name,fn)=>{assert.equal(name,'change');appListeners.add(fn);return{remove:()=>appListeners.delete(fn)};}};
 const battery={isLowPowerModeEnabledAsync:()=>new Promise((resolve,reject)=>reads.push({resolve,reject})),addLowPowerModeListener:fn=>{powerListener=fn;return{remove:()=>{powerListener=null;}};}};
 function load(file){if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);
  let code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  // Expose only this module's existing private consumer inside the VM fixture.
  // Production exports and source remain unchanged.
  if(file.endsWith('AmbientLoop.tsx'))code+='\nexports.actualPlayingMaterial = PlayingMaterial;';
  const require=name=>{if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};if(name==='react-native')return{AppState:app,Platform:{OS:platform},Image:'Image',View:'View',StyleSheet:{create:v=>v,absoluteFill:{position:'absolute'}}};if(name==='expo-battery')return battery;if(name==='expo-router')return{useFocusEffect:fn=>react.useEffect(fn,[fn])};if(name==='expo')return{useEventListener:()=>{}};if(name==='expo-video')return{VideoView:'VideoView',useVideoPlayer:(_source,setup)=>memo(()=>{setup(player);return player;},[])};if(name==='./assets')return{ambientAssets:{}};if(name.endsWith('state/AppState'))return{useApp:()=>({motion})};if(name.startsWith('.')){const base=resolve(dirname(file),name);return load(existsSync(base+'.ts')?base+'.ts':base+'.tsx');}throw Error(name);};
  runInNewContext(code,{exports,require},{filename:file});return exports;
 }
 const {MotionProvider,useMotionPlaybackLease:readPlaybackLease}=load(fileURLToPath(new URL('../src/features/motion/MotionProvider.tsx',import.meta.url)));
 const renderOnly=()=>{cells=providerCells;index=0;dirty=false;value=MotionProvider({children:null}).props.value;};
 const flushOnly=()=>{while(layouts.length)layouts.shift()();while(effects.length)effects.shift()();};
 const commit=()=>{let count=0;do{assert.ok(++count<20,'provider failed to settle');renderOnly();flushOnly();}while(dirty);return value;};
 // The isolated scheduler repeatedly renders the actual hook's fixed cell list.
 const retainedPlayer=()=>{const {actualPlayingMaterial}=load(fileURLToPath(new URL('../src/features/motion/AmbientLoop.tsx',import.meta.url)));let lease,count=0;do{assert.ok(++count<20);cells=leaseCells;index=0;leaseDirty=false;lease=readPlaybackLease(true);flushOnly();}while(leaseDirty);assert.equal(lease.canPlay,true);cells=playerCells;index=0;actualPlayingMaterial({source:1,poster:2,lease,onFailure:()=>{throw Error('fixture video unexpectedly failed');}});flushOnly();cells=providerCells;return player;};
 commit();
 return{
  get value(){return value;},get budget(){return value.budget;},commit,renderOnly,flushOnly,retainedPlayer,
  emit(state){app.currentState=state;for(const listener of appListeners)listener(state);},
  async resolvePower(low){assert.ok(reads.length,'missing native power read');reads.shift().resolve(low);await tick();},
  async rejectPower(){assert.ok(reads.length,'missing native power read');reads.shift().reject(Error('power unavailable'));await tick();},
  power(low){assert.ok(powerListener);powerListener({lowPowerMode:low});},
  setMotion(next){motion=next;commit();},
  close(){if(!alive)return;alive=false;for(const owner of [providerCells,leaseCells,playerCells])for(const cell of owner)cell?.cleanup?.();},
 };
}

for(const platform of ['web','ios'])test(`actual ${platform} provider resumes leases after complete background/active before React commit`,async()=>{
 const h=harness(platform);try{
  if(platform!=='web'){await h.resolvePower(false);h.commit();}
  h.budget.request('material');assert.equal(h.budget.isGranted('material'),true);let stopped=0;h.budget.attachStop('material',()=>stopped++);
  h.emit('background');assert.equal(stopped,1);assert.equal(h.budget.activeCount,0,'pause must precede the next React frame');h.emit('active');
  if(platform!=='web')await h.resolvePower(false);
  h.commit();assert.equal(h.value.active,true);assert.equal(h.value.lowPower,false);assert.equal(h.budget.isGranted('material'),true,'normal foreground policy must reacquire its prior lease');
 }finally{h.close();}
});

test('actual native provider retains posters during resume power refresh, failure and low-power events',async()=>{
 const h=harness('android');try{
  await h.resolvePower(false);h.commit();h.budget.request('material');assert.equal(h.budget.activeCount,1);
  h.emit('inactive');h.emit('active');h.commit();assert.equal(h.budget.activeCount,0);assert.equal(h.value.lowPower,null);
  await h.rejectPower();h.commit();assert.equal(h.budget.activeCount,0);
  h.emit('active');await h.resolvePower(false);h.commit();assert.equal(h.budget.activeCount,1);
  h.emit('background');h.emit('active');h.power(true);await h.resolvePower(false);h.commit();assert.equal(h.value.lowPower,true);assert.equal(h.budget.activeCount,0,'stale normal-power result cannot defeat current low power');
 }finally{h.close();}
});

test('actual resume preserves Reduce Motion, FIFO two-player cap and immediate cleanup',()=>{
 const h=harness();try{
  for(const id of ['a','b','c'])h.budget.request(id);assert.deepEqual(['a','b','c'].map(id=>h.budget.isGranted(id)),[true,true,false]);
  h.setMotion(false);h.emit('background');h.emit('active');h.commit();assert.equal(h.budget.activeCount,0);
  h.setMotion(true);assert.deepEqual(['a','b','c'].map(id=>h.budget.isGranted(id)),[true,true,false]);h.close();assert.equal(h.budget.activeCount,0);
 }finally{h.close();}
});

test('held foreground render cannot restore a lease after newer background or low-power revocation',async()=>{
 const h=harness('ios');try{
  await h.resolvePower(false);h.commit();h.budget.request('material');
  h.emit('active');await h.resolvePower(false);h.renderOnly();h.emit('background');h.flushOnly();assert.equal(h.budget.activeCount,0,'old layout cannot defeat immediate background pause');h.commit();
  h.emit('active');await h.resolvePower(false);h.renderOnly();h.power(true);h.flushOnly();assert.equal(h.budget.activeCount,0,'old normal-power render cannot defeat newer low power');h.commit();
 }finally{h.close();}
});

test('actual retained player resumes and re-registers synchronous stop after a batched regrant',()=>{
 const h=harness();try{
  const player=h.retainedPlayer();assert.equal(player.playing,true);h.emit('background');assert.equal(player.playing,false);h.emit('active');h.commit();h.retainedPlayer();assert.equal(player.playing,true,'existing player effects must resume after a lease regrant');
  h.emit('background');assert.equal(player.playing,false,'retained player must register its next synchronous stop');
 }finally{h.close();}
});
