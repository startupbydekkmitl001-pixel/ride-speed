import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function compile(path,imports={}){const module={exports:{}};vm.compileFunction(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,['require','module','exports'])(name=>{if(name in imports)return imports[name];throw Error(name);},module,module.exports);return module.exports;}
const sync=compile('../src/features/routes/syncModel.ts'),model=compile('../src/features/routes/compatibilityModel.ts',{'./syncModel':sync});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const safe=()=>({route_id:id(1),title:'Shared route',category:'scooter',revision:3,segments:[[{latitude:13.7,longitude:100.5},{latitude:13.71,longitude:100.5}],[{latitude:13.8,longitude:100.5},{latitude:13.81,longitude:100.5}]],geometryStatus:'trimmed',privacyTrimMeters:200,geometryHash:'a'.repeat(64),provider:'recorded',attribution:null});
test('new invitations render only sanitized independent parts, never reconnect or restore private stops',()=>{
 const value=safe(),parsed=model.parseShareSnapshot(value);assert.equal(model.isReviewableShareSnapshot(value),true);assert.deepEqual(parsed.geometry.segments,value.segments);assert.equal(parsed.geometry.segments.length,2);assert.equal(Object.hasOwn(parsed,'stops'),false);
 for(const patch of [{stops:[{lat:13.7,lng:100.5,label:'home'}]},{bounds:[13.7,100.5]},{routeToken:id(2)},{privacyTrimMeters:0},{segments:[[{latitude:999,longitude:100.5}]]},{geometryStatus:'hidden'}]){const broken={...value,...patch};assert.equal(model.isReviewableShareSnapshot(broken),false);assert.equal(model.parseShareSnapshot(broken).geometry,null);}
});
test('historical metadata remains readable but unavailable geometry cannot authorize invitation consent',()=>{
 const old={title:'Old invitation',revision:1,category:'car'};assert.equal(model.parseShareSnapshot(old).title,'Old invitation');assert.equal(model.isReviewableShareSnapshot(old),false);assert.equal(model.isReviewableShareSnapshot(null),false);assert.equal(model.parseShareSnapshot({...old,revision:0}),null);
 const hidden={...safe(),segments:[],geometryStatus:'hidden',geometryHash:null};assert.equal(model.isReviewableShareSnapshot(hidden),true);assert.deepEqual(model.parseShareSnapshot(hidden).geometry.segments,[]);
});
test('a post preview binds exact current owner and projection versions, excluding full owner coordinates',()=>{
 const value=safe(),{route_id,...rest}=value,projection={...rest,id:route_id,owner_id:id(3),visibility:'private'};
 const owner={id:route_id,owner_id:id(3),revision:3,document:{title:'Shared route',category:'scooter',stops:[{lat:99,lng:99,label:'Private'}]}};
 const result=model.sharePreview(owner,projection);assert.equal(result.route_id,route_id);assert.equal('stops' in result,false);assert.equal(JSON.stringify(result).includes('Private'),false);
 for(const patch of [{revision:4},{id:id(8)},{owner_id:id(9)},{title:'Different'}])assert.throws(()=>model.sharePreview(owner,{...projection,...patch}),/ROUTE_REVISION_CONFLICT/);
});
