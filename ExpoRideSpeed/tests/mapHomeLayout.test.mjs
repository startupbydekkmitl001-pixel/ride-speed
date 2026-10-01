import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// This executes the actual MapHome, compact instrument and shared controls.
// Text measurement is a one-line lower bound from their rendered lineHeight,
// not browser font shaping or a native frame-performance measurement.
function fixture({width=932,height=430,fontScale=1,os='web',moving=false,active=false,motion=false,error=null,incoming=false,language='en',shell=false}={}){
 const root=fileURLToPath(new URL('../src/',import.meta.url)),cache=new Map(),fibres=new Map(),viewport={width,height,fontScale,scale:1};
 let fibre=[],cursor=0,pathname='/',Screen;
 const React={memo:value=>value,useId:()=> 'map-layout',createContext:value=>({value,Provider:'MaterialProvider'}),useContext:value=>value.value,
  useState(initial){const index=cursor++;if(!(index in fibre))fibre[index]=typeof initial==='function'?initial():initial;const owned=fibre;return [owned[index],value=>{owned[index]=typeof value==='function'?value(owned[index]):value;}];},
  useRef(initial){const index=cursor++;return fibre[index]??(fibre[index]={current:initial});},useMemo:fn=>{cursor++;return fn();},useCallback:fn=>{cursor++;return fn;},useEffect:()=>{cursor++;}};
 const jsx=(type,props)=>({type,props}),shared=value=>({value,get(){return this.value;},set(next){this.value=next;}});
 const pushes=[],ride={movingLocked:moving,ready:true,busy:false,error,message:null,locating:false,active,ride:active?{status:'recording',fragments:[]}:null,
  snapshot:{liveMps:moving?20:null,maxMps:moving?20:null,quality:moving?'good':'noFix',horizontalAccuracyM:moving?5:null,hasSpeedFix:moving},metrics:{distanceMeters:0,durationSeconds:0,averageMps:null},
  start:async()=>{},pause:async()=>{},finish:async()=>{},retrySave:async()=>{},locate:async()=>{}};
 const app={ready:true,data:{unit:'kmh'},dark:true,motion,glass:false,colors:{},update:()=>true},insets={top:0,bottom:0,left:0,right:0};
 let copy;const translate=(key,values={})=>(copy[key]??key).replace(/{{(\w+)}}/g,(_,name)=>String(values[name]??''));
 const Stack=()=>jsx('Navigator',{children:pathname==='/'?jsx(Screen,{}):null});Stack.Screen=()=>null;
 const live={peers:[],incomingFriendIntent:incoming,share:{armed:false,pending:false}};
 const overrides={react:React,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  'react-native':{View:'View',Text:'Text',TextInput:'TextInput',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator',ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:os,Version:34},useWindowDimensions:()=>viewport,StyleSheet:{absoluteFill:{position:'absolute',top:0,right:0,bottom:0,left:0},hairlineWidth:1,create:value=>value}},
  'expo-router':{Stack,router:{push:path=>pushes.push(path)},usePathname:()=>pathname,useFocusEffect:()=>{}},'expo-location':{},'expo-screen-orientation':{},
  'react-native-safe-area-context':{SafeAreaProvider:'OwnerProvider',useSafeAreaInsets:()=>insets},'@expo/vector-icons/Ionicons':'Ionicons',
  'react-native-gesture-handler':{GestureHandlerRootView:'GestureRoot'},'expo-font':{useFonts:()=>[true,null]},'expo-status-bar':{StatusBar:'StatusBar'},'expo-splash-screen':{preventAutoHideAsync:async()=>{},hideAsync:async()=>{}},'maplibre-gl/dist/maplibre-gl.css':{},
  'react-native-reanimated':{__esModule:true,default:{View:'AnimatedView',createAnimatedComponent:value=>value},ReduceMotion:{System:'system'},useSharedValue:shared,useAnimatedStyle:fn=>fn(),useAnimatedProps:fn=>fn(),withSpring:value=>value,withTiming:value=>value,cancelAnimation:()=>{}},
  'react-native-svg':{__esModule:true,default:'Svg',Defs:'Defs',Line:'Line',LinearGradient:'LinearGradient',Path:'Path',Stop:'Stop'},
  'expo-blur':{BlurView:'BlurView'},'expo-glass-effect':{GlassContainer:'GlassContainer',GlassView:'GlassView',isGlassEffectAPIAvailable:()=>false,isLiquidGlassAvailable:()=>false},
  '../../state/AppState':{useApp:()=>app},'../state/AppState':{AppProvider:'OwnerProvider',useApp:()=>app},'../../state/RideState':{useRide:()=>ride},'../state/RideState':{RideProvider:'OwnerProvider',useRide:()=>ride},
  '../../state/OnlineState':{useOnline:()=>({presence:[]})},'../state/OnlineState':{OnlineProvider:'OwnerProvider'},'../../state/LiveState':{useLive:()=>live},'../state/LiveState':{LiveProvider:'OwnerProvider',useLive:()=>live},'../../state/AuthState':{useAuth:()=>({scope:{generation:1}})},'../state/AuthState':{AuthProvider:'OwnerProvider'},
  '../../state/GarageState':{useGarage:()=>({vehicles:[],activeId:null})},
  '../state/RiderProfile':{RiderProfileProvider:'OwnerProvider'},'../state/GarageState':{GarageProvider:'OwnerProvider'},'../state/RouteState':{RouteProvider:'OwnerProvider'},'../state/SocialState':{SocialProvider:'OwnerProvider'},'../state/RaceState':{RaceProvider:'OwnerProvider',useRace:()=>({port:{attempt:null}})},'../state/RankedState':{RankedProvider:'OwnerProvider'},'../state/CommunityState':{CommunityProvider:'OwnerProvider'},'../features/motion':{MotionProvider:'OwnerProvider'},
  '../../lib/i18n':{errorKey:()=> 'm2.map.mapError',useI18n:()=>({t:translate,language,locale:language==='th'?'th-TH':'en'})},
  '../lib/i18n':{errorKey:()=> 'm2.map.mapError',useI18n:()=>({t:translate})},
  '../../lib/useScreenActivity':{useScreenActivity:()=>({active:true,current:()=>true,capture:()=>1,accepts:()=>true})},
  '../../features/map/ActiveMapSurface':'MapSurface','../../features/onboarding':{OnboardingEntry:({children})=>children},
  '../motion':{AmbientLoop:'AmbientLoop',resolveAmbientAsset:(role,theme)=>`${role}-${theme}`}};
 function load(file){if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  runInNewContext(code,{exports,require:name=>{if(name in overrides)return overrides[name];if(name.endsWith('.ttf'))return 1;assert.ok(name.startsWith('.'),`unexpected dependency ${name}`);let next=resolve(dirname(file),name);for(const candidate of [next+'.ts',next+'.tsx',resolve(next,'index.ts'),resolve(next,'index.tsx'),next])if(existsSync(candidate)){next=candidate;break;}return load(next);},Intl,AbortController,Date,Math});return exports;}
 app.colors=load(resolve(root,'lib/theme.ts')).theme.dark;copy=load(resolve(root,'lib/i18n/resources.ts')).messages[language];
 Screen=load(resolve(root,'app/(tabs)/index.tsx')).default;
 const Root=shell?load(resolve(root,'app/_layout.tsx')).default:Screen;
 function expand(value,path='screen'){if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map((item,index)=>expand(item,`${path}:${index}`));if(typeof value.type==='function'){const key=path+':'+value.type.name;fibre=fibres.get(key)??[];fibres.set(key,fibre);cursor=0;return expand(value.type(value.props),path+':render');}return {...value,props:{...value.props,children:expand(value.props?.children,path+':children')}};}
 const render=()=>expand(jsx(Root,{}));
 return {render,ride,app,insets,pushes,t:translate,navigate:path=>{pathname=path;},resize:next=>Object.assign(viewport,next),get width(){return viewport.width;},get height(){return viewport.height;},get fontScale(){return viewport.fontScale;}};
}
const style=value=>Array.isArray(value)?Object.assign({},...value.map(style)):typeof value==='function'?style(value({pressed:false})):value??{};
function children(value){const out=[];function add(item){if(!item||typeof item!=='object')return;if(Array.isArray(item)){item.forEach(add);return;}if(['Fragment','MaterialProvider'].includes(item.type)){add(item.props.children);return;}out.push(item);}add(value.props?.children);return out;}
function minimumHeight(value,fontScale=1){const s=style(value.props?.style);if(Number.isFinite(s.height))return s.height;if(value.type==='Text')return Number(s.lineHeight??s.fontSize??0)*(value.props.allowFontScaling===false?1:fontScale);const parts=children(value).filter(item=>style(item.props?.style).position!=='absolute');const heights=parts.map(item=>minimumHeight(item,fontScale));const content=s.flexDirection==='row'?Math.max(0,...heights):heights.reduce((sum,v)=>sum+v,0)+Math.max(0,parts.length-1)*(s.gap??0);return Math.max(s.minHeight??0,content+(s.paddingTop??s.paddingVertical??s.padding??0)+(s.paddingBottom??s.paddingVertical??s.padding??0)+2*(s.borderWidth??0));}
function find(tree,predicate,ancestors=[]){if(!tree||typeof tree!=='object')return null;if(Array.isArray(tree)){for(const value of tree){const found=find(value,predicate,ancestors);if(found)return found;}return null;}if(predicate(tree))return {node:tree,ancestors};return find(tree.props?.children,predicate,[...ancestors,tree]);}
const control=(tree,label)=>find(tree,node=>node.type==='Pressable'&&node.props.accessibilityLabel===label);
function readouts(tree){let count=0;function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.props?.accessibilityRole==='text')count++;walk(node.props?.children);}walk(tree);return count;}
const absoluteAncestor=value=>[...value.ancestors].reverse().find(node=>style(node.props.style).position==='absolute'&&Number.isFinite(style(node.props.style).bottom));
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
function bounds(value,width,height,fontScale){const s=style(value.props.style),boxHeight=Number.isFinite(s.top)&&Number.isFinite(s.bottom)?height-s.top-s.bottom:minimumHeight(value,fontScale),boxWidth=s.width??width-(s.left??0)-(s.right??0);return {x:s.left??width-(s.right??0)-boxWidth,y:s.top??height-(s.bottom??0)-boxHeight,width:boxWidth,height:boxHeight};}
test('short-wide compact instrument cannot cover the actual Friends control',()=>{
 const f=fixture(),tree=f.render(),friend=control(tree,'Friends online'),stack=absoluteAncestor(control(tree,'Start ride'));
 assert.ok(friend);assert.ok(stack);
 const rail=[...friend.ancestors].reverse().find(node=>Number.isFinite(style(node.props.style).top)),railBounds=bounds(rail,f.width,f.height,f.fontScale);
 const friendBox={...railBounds,width:52,height:52},stackBox=bounds(stack,f.width,f.height,f.fontScale);
 assert.equal(overlaps(friendBox,stackBox),false,JSON.stringify({friendBox,stackBox}));
});
test('actual RootLayout supplies the map viewport width without changing other web or native shells',()=>{
 for(const width of [932,720]){
  const f=fixture({shell:true,width}),tree=f.render(),friend=control(tree,'Friends online');
  const shellNode=friend.ancestors.find(node=>Object.hasOwn(style(node.props.style),'maxWidth'));
  assert.ok(shellNode);const shellWidth=Math.min(width,style(shellNode.props.style).maxWidth??Infinity);
  assert.equal(shellWidth,width,'window dimensions must match the actual map shell');
  const panel=bounds(absoluteAncestor(control(tree,'Start ride')),shellWidth,f.height,f.fontScale);
  const search=[...control(tree,'Plan a route').ancestors].reverse().find(node=>Number.isFinite(style(node.props.style).top));
  const searchBox=bounds(search,shellWidth,f.height,f.fontScale);
  assert.ok(searchBox.width>=280);assert.equal(overlaps(searchBox,panel),false);
  f.navigate('/friends');const other=f.render();assert.ok(find(other,node=>style(node.props?.style).maxWidth===560));
 }
 const native=fixture({shell:true,os:'ios',width:428,height:926}),tree=native.render();
 const shellNode=control(tree,'Friends online').ancestors.find(node=>Object.hasOwn(style(node.props.style),'maxWidth'));
 assert.equal(style(shellNode.props.style).maxWidth,undefined);
});
test('camera reserves the actual side pane and leaves useful pan and attribution space',()=>{
 for(const settings of [{},{width:720},{fontScale:2,incoming:true}]){
  const f=fixture(settings),tree=f.render(),map=find(tree,node=>node.type==='MapSurface').node,padding=map.props.contentInsets;
  const panel=bounds(absoluteAncestor(control(tree,'Start ride')),f.width,f.height,f.fontScale);
  const search=[...control(tree,'Plan a route').ancestors].reverse().find(node=>Number.isFinite(style(node.props.style).top));
  const searchBox=bounds(search,f.width,f.height,f.fontScale);
  assert.ok(f.width-padding.left-padding.right>=280,'at least280pt of independent map width');
  assert.ok(f.height-padding.top-padding.bottom>=200,'map retains a useful vertical viewport');
  assert.ok(padding.right>=f.width-panel.x,'no route fit lands beneath the instrument');
  // Actual web CSS uses10px/1.5+8px padding; allow two wrapped credit lines.
  const credits={x:padding.left+8,y:f.height-padding.bottom-8-38,width:f.width-padding.left-padding.right-16,height:38};
  assert.equal(overlaps(credits,panel),false);assert.equal(overlaps(credits,searchBox),false);
  const friends=control(tree,'Friends online'),rail=[...friends.ancestors].reverse().find(node=>Number.isFinite(style(node.props.style).top));
  assert.equal(overlaps(credits,bounds(rail,f.width,f.height,f.fontScale)),false);
  assert.equal(absoluteAncestor(control(tree,'Start ride')).props.pointerEvents,'box-none');
 }
});
test('moving large text keeps the full compact readout and primary controls outside locked details',()=>{
 for(const language of ['en','th'])for(const width of [932,720])for(const fontScale of [2,3]){
 const f=fixture({moving:true,active:true,fontScale,language,width}),tree=f.render(),pause=control(tree,f.t('m2.ride.pause')),finish=control(tree,f.t('m2.ride.finish'));
 const panel=absoluteAncestor(finish),scroll=find(tree,node=>node.type==='ScrollView');
 assert.ok(pause&&finish);assert.equal(scroll.node.props.scrollEnabled,false);
 for(const action of [pause,finish])assert.equal(action.ancestors.some(node=>node.type==='ScrollView'),false,'a disabled scroll cannot hide a terminal action');
 if(width===720||fontScale>2){assert.equal(style(pause.node.props.style).width,52);assert.equal(style(pause.node.props.style).height,52);assert.equal(pause.node.props.accessibilityRole,'button');}
 if(fontScale>2){for(const action of [finish]){assert.equal(style(action.node.props.style).width,52);assert.equal(style(action.node.props.style).height,52);assert.equal(action.node.props.accessibilityRole,'button');}assert.equal(style(finish.node.props.style).backgroundColor,f.app.colors.accent);}
 const actualFooter=[...finish.ancestors].reverse().find(node=>style(node.props.style).flexShrink===0);
 const footerHeight=minimumHeight(actualFooter,f.fontScale),panelBox=bounds(panel,f.width,f.height,f.fontScale);
 const hud=find(panel,node=>node.props?.accessibilityRole==='text');
 assert.equal(hud.node.props.accessibilityLabel,f.t('m2.hud.readout',{speed:'72',unit:f.t('common.kmh'),signal:f.t('m2.hud.gpsGood')}));
 assert.ok(hud);const material=[...hud.ancestors].reverse().find(node=>style(node.props.style).paddingVertical===12);
 assert.ok(material);
 assert.equal(hud.ancestors.some(node=>node.type==='ScrollView'),false,'previous stationary scroll offsets cannot clip the moving readout');
 assert.ok(footerHeight+minimumHeight(material,f.fontScale)<=panelBox.height,JSON.stringify({language,width,footerHeight,hudHeight:minimumHeight(material,f.fontScale),panelBox}));
 assert.equal(control(tree,f.t('m2.map.friendsOnline')).node.props.disabled,true);
 assert.equal(style(actualFooter.props.style).flexShrink,0);
 assert.equal(readouts(tree),1);
 }
});
test('stationary scroll state cannot retain ownership of the readout after movement begins',()=>{
 const f=fixture({active:true});let tree=f.render(),hud=find(tree,node=>node.props?.accessibilityRole==='text');
 assert.ok(hud.ancestors.some(node=>node.type==='ScrollView'));
 // The details may retain any native/web offset; the moving HUD must not be its descendant.
 f.ride.movingLocked=true;tree=f.render();hud=find(tree,node=>node.props?.accessibilityRole==='text');
 assert.equal(hud.ancestors.some(node=>node.type==='ScrollView'),false);
 assert.equal(find(tree,node=>node.type==='ScrollView').node.props.scrollEnabled,false);
 f.ride.movingLocked=false;tree=f.render();hud=find(tree,node=>node.props?.accessibilityRole==='text');
 assert.ok(hud.ancestors.some(node=>node.type==='ScrollView'));
 assert.equal(find(tree,node=>node.type==='ScrollView').node.props.scrollEnabled,true);
});
test('paused or interrupted capture retains reachable Finish and Resume controls under the movement lock',()=>{
 for(const status of ['paused','interrupted'])for(const fontScale of [2,3]){
  const f=fixture({moving:true,fontScale,width:720});f.ride.ride={status,fragments:[]};f.ride.error=status==='interrupted'?'errors.gpsStart':null;
  const tree=f.render(),resume=control(tree,f.t('m2.ride.resume')),finish=control(tree,f.t('m2.ride.finish'));
  assert.ok(resume&&finish);assert.equal(style(finish.node.props.style).height,52);
  assert.equal(finish.node.props.disabled,false);
  assert.equal(resume.node.props.disabled,status==='interrupted');
  const panel=absoluteAncestor(finish),footer=[...finish.ancestors].reverse().find(node=>style(node.props.style).flexShrink===0),hud=find(panel,node=>node.props?.accessibilityRole==='text');
  const material=[...hud.ancestors].reverse().find(node=>style(node.props.style).paddingVertical===12);
  assert.ok(minimumHeight(footer,fontScale)+minimumHeight(material,fontScale)<=bounds(panel,f.width,f.height,fontScale).height);
  assert.equal(readouts(tree),1);for(const action of [resume,finish])assert.equal(action.ancestors.some(node=>node.type==='ScrollView'),false);
 }
});
test('short moving glance prioritizes primary speed and GPS while secondary stats remain stationary',()=>{
 const hasMax=(tree,label)=>find(tree,node=>node.type==='Text'&&Array.isArray(node.props.children)&&node.props.children[0]===label);
 const f=fixture({active:true,moving:true,fontScale:3});let tree=f.render();
 assert.equal(Boolean(hasMax(tree,f.t('m2.hud.max'))),false);
 f.ride.movingLocked=false;tree=f.render();assert.ok(hasMax(tree,f.t('m2.hud.max')));
 const native=fixture({os:'ios',width:428,height:926,moving:true,active:true});assert.ok(hasMax(native.render(),native.t('m2.hud.max')));
});
test('larger text preserves primary controls and stationary detail scrolling without reducing fonts',()=>{
 for(const width of [932,720]){
 const f=fixture({fontScale:3,active:true,width}),tree=f.render(),finish=control(tree,'Finish & save'),panel=absoluteAncestor(finish),footer=[...finish.ancestors].reverse().find(node=>style(node.props.style).flexShrink===0);
 assert.equal(find(tree,node=>node.type==='ScrollView').node.props.scrollEnabled,true);
 assert.ok(minimumHeight(footer,f.fontScale)<bounds(panel,f.width,f.height,f.fontScale).height);
 assert.equal(style(finish.node.props.style).minHeight,56);
 const label=find(finish.node,node=>node.type==='Text');assert.equal(style(label.node.props.style).fontSize,16);assert.notEqual(label.node.props.allowFontScaling,false);
 }
});
test('native portrait and tall web retain the ordinary bottom layout and map inset',()=>{
 for(const settings of [{os:'ios',width:428,height:926},{os:'android',width:428,height:926},{width:932,height:800}]){
  const f=fixture(settings),tree=f.render(),stack=absoluteAncestor(control(tree,'Start ride')),map=find(tree,node=>node.type==='MapSurface').node;
  assert.equal(style(stack.props.style).top,undefined);assert.equal(style(stack.props.style).left,20);assert.equal(style(stack.props.style).right,20);
  assert.equal(map.props.contentInsets.right,20);assert.equal(map.props.contentInsets.bottom,352);assert.equal(find(tree,node=>node.type==='ScrollView'),null);
 }
});
test('resize and instrument expansion retain one HUD and no compact material player',()=>{
 const f=fixture({motion:false});let tree=f.render();
 assert.equal(readouts(tree),1);assert.equal(find(tree,node=>node.type==='AmbientLoop'),null);
 const friends=control(tree,'Friends online');friends.node.props.onPress();assert.deepEqual(f.pushes,['/friends']);
 f.resize({height:800});tree=f.render();assert.equal(find(tree,node=>node.type==='ScrollView'),null);assert.equal(readouts(tree),1);
 f.resize({height:430});tree=f.render();control(tree,'Expand speedometer').node.props.onPress();tree=f.render();
 assert.equal(readouts(tree),1);assert.equal(find(tree,node=>node.type==='MapSurface').node.props.visible,false);
 assert.ok(find(tree,node=>node.type==='AmbientLoop'));assert.equal(control(tree,'Friends online'),null);
});
test('map layers and errors stay in the bounded side details instead of covering legal credits',()=>{
 const f=fixture({error:'m2.map.mapError'});let tree=f.render();control(tree,'Map layers').node.props.onPress();tree=f.render();
 const close=control(tree,'Close map controls');assert.ok(close);assert.ok(close.ancestors.some(node=>node.type==='ScrollView'));
 const retry=control(tree,f.t('common.retry'));assert.ok(retry.ancestors.some(node=>node.type==='ScrollView'));
 assert.equal(absoluteAncestor(close),absoluteAncestor(control(tree,'Start ride')));
});
test('all responsive native view children remain nodes rather than raw JSX whitespace',()=>{
 function assertChildren(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(assertChildren);return;}
  if(['View','AnimatedView','Pressable','ScrollView'].includes(node.type)){const visit=value=>{if(Array.isArray(value))return value.forEach(visit);if(!value)return;if(['Fragment','MaterialProvider'].includes(value.type))return visit(value.props.children);assert.notEqual(typeof value,'string',`raw text in ${node.type}`);assert.notEqual(typeof value,'number',`raw number in ${node.type}`);};visit(node.props.children);}
  assertChildren(node.props?.children);
 }
 for(const moving of [false,true])for(const fontScale of [1,2,3])assertChildren(fixture({active:true,moving,fontScale}).render());
});


test('initial speed renders zero in both languages without claiming a measured fix; loss after measurement stays unavailable',()=>{
 for(const language of ['en','th']){
  const f=fixture({width:428,height:926,language});let tree=f.render();
  assert.ok(find(tree,node=>node.type==='Text'&&node.props.children==='0'));
  const readout=find(tree,node=>node.props?.accessibilityRole==='text');
  assert.equal(readout.node.props.accessibilityLabel,f.t('m2.hud.readout',{speed:'0',unit:f.t('common.kmh'),signal:f.t('m2.hud.gpsNoFix')}));
  f.ride.snapshot.hasSpeedFix=true;tree=f.render();
  assert.equal(find(tree,node=>node.props?.accessibilityRole==='text').node.props.accessibilityLabel,f.t('m2.hud.readout',{speed:f.t('m2.hud.unavailable'),unit:f.t('common.kmh'),signal:f.t('m2.hud.gpsNoFix')}));
 }
});
test('movement lock has no passenger bypass, including the root cover; paused recenter checks GPS',()=>{
 for(const language of ['en','th']){
  const f=fixture({moving:true,active:true,language,shell:true});let tree=f.render();
  for(const label of ['I’m a passenger','ฉันเป็นผู้โดยสาร'])assert.equal(control(tree,label),null);
  f.navigate('/garage');tree=f.render();
  assert.ok(control(tree,f.t('nav.map')));
  for(const label of ['I’m a passenger','ฉันเป็นผู้โดยสาร'])assert.equal(control(tree,label),null);
  f.navigate('/');f.ride.active=false;let checks=0;f.ride.locate=async()=>{checks++;};tree=f.render();
  control(tree,f.t('m2.ride.checkStopped')).node.props.onPress();assert.equal(checks,1);
  assert.equal(f.ride.movingLocked,true,'the button itself never unlocks editing');
 }
});
