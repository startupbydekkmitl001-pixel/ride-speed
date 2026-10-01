import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const require=createRequire(import.meta.url),ts=require('typescript'),cache=new Map();
function load(path){if(cache.has(path))return cache.get(path).exports;const mod={exports:{}};cache.set(path,mod);new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.startsWith('.')?load(resolve(dirname(path),`${name}.ts`)):require(name),mod,mod.exports);return mod.exports;}
const feature=fileURLToPath(new URL('../src/features/routes/',import.meta.url)),builder=load(resolve(feature,'builderModel.ts')),local=load(resolve(feature,'localModel.ts'));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const settle=()=>new Promise(done=>setImmediate(done));
function find(node,type){if(!node||typeof node!=='object')return null;if(node.type===type)return node;for(const child of (node.children??[]).flat(Infinity)){const result=find(child,type);if(result)return result;}return null;}

function fixture(){
 const hold=deferred(),cells=[],effects=[];let index=0,dirty=false,mounted=true,lateWrites=0,tree;
 let auth={scope:{userId:'owner',generation:1},session:{user:{id:'owner'}},ready:true},ride={movingLocked:false,history:[]},active=true,activityGeneration=1;
 const current=()=>active,activityCapture=()=>active?activityGeneration:null,accepts=ticket=>active&&ticket===activityGeneration;
 const document={schema_version:1,title:'Public test route',category:'scooter',visibility:'public',stops:[{lat:13,lng:100,label:'Start'},{lat:14,lng:101,label:'Finish'}],source:{kind:'draft'}};
 const record=local.routeRecord({localId:'local',document});
 record.sync={...record.sync,cloudId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:1,cleanFingerprint:local.fingerprintRoute(document)};
 const projection={id:record.sync.cloudId,owner_id:'owner',revision:1,title:document.title,category:'scooter',visibility:'public',segments:[],geometryStatus:'hidden',privacyTrimMeters:200,geometryHash:null,provider:'draft',attribution:null};
 const routes={projection:()=>hold.promise,ready:true,draft:null,records:[record],conflicts:{},status:'synced',error:null,retry:async()=>{},updateDraft:()=>true};
 const React={
  createElement:(type,props,...children)=>({type,props:props??{},children}),
  useState(value){const at=index++;if(!(at in cells))cells[at]=typeof value==='function'?value():value;return[cells[at],next=>{if(!mounted)lateWrites++;cells[at]=typeof next==='function'?next(cells[at]):next;dirty=true;}];},
  useRef(value){const at=index++;if(!(at in cells))cells[at]={current:value};return cells[at];},
  useCallback:fn=>fn,
  useEffect(fn,deps){const at=index++,old=cells[at];if(!old||!deps||deps.some((v,i)=>v!==old.deps[i])){old?.cleanup?.();cells[at]={deps};effects.push(()=>{cells[at].cleanup=fn();});}},
 };React.useLayoutEffect=React.useEffect;
 const imports={
  react:React,'expo-router':{router:{replace(){},push(){}},useLocalSearchParams:()=>({view:'saved'})},'expo-crypto':{randomUUID:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},'expo-linking':{createURL:()=> 'ride-speed://routes'},
  'react-native':{Platform:{OS:'web'},ActivityIndicator:'ActivityIndicator',FlatList:'FlatList',Pressable:'Pressable',View:'View',Share:{share:async()=>{}}},
  '../../components/ui':Object.fromEntries(['Button','Heading','Icon','Note','Row','Screen','T'].map(name=>[name,name])),
  '../../features/routes':{RouteBuilder:'RouteBuilder',RouteDetail:'RouteDetail',RouteProviderConsent:'RouteProviderConsent',blankBuilder:builder.blankBuilder,builderDocument:builder.builderDocument},
  '../../features/routes/RouteSheet':{RouteSheet:'RouteSheet'},'../../features/routes/builderModel':builder,'../../features/routes/localModel':local,
  '../../features/routes/presentationModel':{builderFromRecord:()=>builder.blankBuilder('scooter').value,builderFromRide(){}},'../../features/rides/syncModel':{toRideSummary(){}},
  '../../lib/i18n/m4':{routeErrorKey:()=> 'm4.error.provider'},'../../lib/i18n':{useI18n:()=>({t:key=>key,language:'en'})},
  '../../lib/useScreenActivity':{useScreenActivity:()=>({active,generation:activityGeneration,current,capture:activityCapture,accepts})},
  '../../state/AppState':{useApp:()=>({colors:{bg:'#000',accent:'#FF5A1F',surface:'#111',line:'#222',muted:'#999'},vehicle:null})},
  '../../state/AuthState':{useAuth:()=>auth,isAccountCurrent:scope=>scope===auth.scope},'../../state/RideState':{useRide:()=>ride},'../../state/RouteState':{useRoutes:()=>routes,builderGeometry:()=>null},
 };
 const source=readFileSync(new URL('../src/app/(tabs)/routes.tsx',import.meta.url),'utf8')+'\nexports.testRouteEditor=RouteEditor;';
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};
 vm.runInNewContext(js,{require:name=>{if(name in imports)return imports[name];throw Error(`Unmocked ${name}`);},module,exports:module.exports,Promise,Error,Date,JSON,navigator:{onLine:true},window:{addEventListener(){},removeEventListener(){}}});
 const render=()=>{for(let pass=0;pass<12;pass++){dirty=false;index=0;tree=module.exports.testRouteEditor();while(effects.length)effects.shift()();if(!dirty)return tree;}throw Error('Render loop');};
 const open=()=>{const list=find(render(),'FlatList'),row=list.props.renderItem({item:record});find(row,'Pressable').props.onPress();return find(render(),'RouteDetail');};
 return {render,open,resolve:()=>hold.resolve(projection),move:()=>{ride={...ride,movingLocked:true};render();},suspend:()=>{active=false;++activityGeneration;render();},resume:()=>{active=true;++activityGeneration;render();},switchOwner:()=>{auth={...auth,scope:{userId:'other',generation:2}};},unmount:()=>{mounted=false;for(const cell of cells)cell?.cleanup?.();},get lateWrites(){return lateWrites;}};
}

test('actual route adapter does not reopen share preview after Back changes navigation intent',async()=>{
 const h=fixture();h.open().props.onPreviewShare();const waiting=find(h.render(),'RouteDetail');assert.equal(waiting.props.busy,true);waiting.props.onClose();assert.ok(find(h.render(),'FlatList'));h.resolve();await settle();assert.ok(find(h.render(),'FlatList'),'late preview must keep the library open');assert.equal(find(h.render(),'RouteDetail'),null);
});
test('actual route adapter opens the authoritative shared view when the current preview remains valid',async()=>{
 const h=fixture();h.open().props.onPreviewShare();h.resolve();await settle();const detail=find(h.render(),'RouteDetail');assert.equal(detail.props.item.kind,'shared');assert.equal(detail.props.item.route.geometryStatus,'hidden');assert.deepEqual(detail.props.item.route.segments,[]);
});
test('actual route adapter discards pending preview when movement locks the editor',async()=>{
 const h=fixture();h.open().props.onPreviewShare();h.move();h.resolve();await settle();const detail=find(h.render(),'RouteDetail');assert.equal(detail.props.item.kind,'owner');assert.equal(detail.props.busy,false);
});
test('actual route adapter makes no late preview state writes after unmount or owner change',async()=>{
 const h=fixture();h.open().props.onPreviewShare();h.unmount();h.resolve();await settle();assert.equal(h.lateWrites,0);
 const other=fixture();other.open().props.onPreviewShare();other.switchOwner();other.unmount();other.resolve();await settle();assert.equal(other.lateWrites,0);
});
test('actual route adapter discards held share projection across navigation or OS suspension and clears its pending UI',async()=>{
 const h=fixture();h.open().props.onPreviewShare();assert.equal(find(h.render(),'RouteDetail').props.busy,true);h.suspend();h.resume();h.resolve();await settle();const detail=find(h.render(),'RouteDetail');assert.equal(detail.props.item.kind,'owner');assert.equal(detail.props.busy,false);
});
