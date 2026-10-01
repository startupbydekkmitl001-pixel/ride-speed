import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

function actualUI(){
 const jsx=(type,props)=>({type,props});
 function compile(path,require){const exports={};const source=ts.transpileModule(readFileSync(fileURLToPath(new URL(path,import.meta.url)),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;runInNewContext(source,{exports,require});return exports;}
 const {theme}=compile('../src/lib/theme.ts',()=>{throw Error('unexpected theme dependency');});
 const deps={react:{},'react/jsx-runtime':{jsx,jsxs:jsx},'@expo/vector-icons/Ionicons':'Ionicons','react-native':{Text:'Text',View:'View',TextInput:'TextInput',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator',KeyboardAvoidingView:'KeyboardAvoidingView',ScrollView:'ScrollView',StyleSheet:{hairlineWidth:1},Platform:{OS:'ios'}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'react-native-reanimated':{default:{View:'AnimatedView'}},'../lib/theme':{theme},'../state/AppState':{useApp:()=>({colors:theme.dark,motion:false})},'./glass':{GlassSurface:'Glass'}};
 const ui=compile('../src/components/ui.tsx',name=>{assert.ok(name in deps,`unexpected UI dependency ${name}`);return deps[name];});
 function render(value){if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map(render);if(typeof value.type==='function')return render(value.type(value.props));return {...value,props:{...value.props,children:render(value.props?.children)}};}
 function texts(value){const found=[];function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type==='Text')found.push(node);walk(node.props?.children);}walk(value);return found;}
 return {ui,render,texts,theme};
}

test('blank heading eyebrows do not create empty accessible text or reserve title spacing',()=>{
 const f=actualUI();
 for(const eyebrow of ['', ' \t\n ']){
  const tree=f.render(f.ui.Heading({eyebrow,title:'เส้นทางของฉัน'})),texts=f.texts(tree);
  assert.equal(texts.length,1,'only the real title should occupy a text line');
  assert.equal(texts[0].props.children,'เส้นทางของฉัน');
  assert.equal(texts[0].props.style.at(-1)?.marginTop??0,0,'there is no eyebrow gap without an eyebrow');
 }
});

test('a real eyebrow preserves its title hierarchy, Thai leading and right-hand control',()=>{
 const f=actualUI(),right={type:'Accessory',props:{label:'ย้อนกลับ'}};
 const tree=f.render(f.ui.Heading({eyebrow:'โรงรถ',title:'รถของฉัน',right})),texts=f.texts(tree);
 assert.equal(texts.length,2);assert.equal(texts[0].props.children,'โรงรถ');assert.equal(texts[1].props.children,'รถของฉัน');
 assert.equal(texts[1].props.accessibilityRole,'header');
 assert.equal(texts[1].props.style.at(-1).marginTop,4);
 assert.ok(texts.every(text=>text.props.style[0].lineHeight>=text.props.style[0].fontSize*1.45));
 assert.ok(texts.every(text=>text.props.allowFontScaling!==false));
 assert.equal(tree.props.children[1].type,'Accessory');
});
