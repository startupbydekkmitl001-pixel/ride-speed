import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const require=createRequire(import.meta.url),ts=require('typescript'),cache=new Map();
function load(path){if(!existsSync(path))return {};if(cache.has(path))return cache.get(path).exports;const mod={exports:{}};cache.set(path,mod);new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.startsWith('.')?load(resolve(dirname(path),`${name}.ts`)):require(name),mod,mod.exports);return mod.exports;}
const model=load(fileURLToPath(new URL('../src/features/routes/localModel.ts',import.meta.url)));
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',op='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const document=(title='Private route')=>({schema_version:1,title,category:'scooter',visibility:'private',stops:[{lat:13,lng:100,label:'Start'},{lat:14,lng:101,label:'Finish'}],source:{kind:'draft'}});
const geometry=()=>({segments:[[{latitude:13,longitude:100},{latitude:13.1,longitude:100.1}],[{latitude:14,longitude:101},{latitude:14.1,longitude:101.1}]],distanceMeters:20,durationSeconds:10,geometryHash:null,provider:'recorded',calculatedAt:null,attribution:null});
test('canonical empty array is authoritative; only missing field imports legacy stable IDs without road proof',()=>{
 const legacy=[{id:'old-local-id',name:'Home ride',stops:[{id:'s',name:'Home',latitude:13,longitude:100}],closedCourse:true,cloudId:id,cloudRevision:2}];
 assert.deepEqual(model.parseRouteRecords([],legacy),[]);
 const [record]=model.parseRouteRecords(undefined,legacy);assert.equal(record.localId,'old-local-id');assert.equal(record.sync.cloudId,id);assert.equal(record.sync.revision,2);assert.equal(record.sync.cleanFingerprint,null);assert.equal(record.document.source.kind,'draft');assert.equal(record.geometry,null);assert.equal(model.compatibleRoutes([record])[0].closedCourse,false);
});
test('deep detachment preserves disconnected geometry and canonical fingerprints ignore object key order',()=>{
 const d=document(),g=geometry(),record=model.routeRecord({localId:'local',document:d,geometry:g});d.title='mutated';g.segments[0][0].latitude=50;
 assert.equal(record.document.title,'Private route');assert.equal(record.geometry.segments.length,2);assert.equal(record.geometry.segments[0][0].latitude,13);
 assert.equal(model.fingerprintRoute(record.document),model.fingerprintRoute({...record.document,source:{kind:'draft'},stops:[{label:'Start',lng:100,lat:13},{label:'Finish',lng:101,lat:14}]}));
});
test('malformed stored pending is a read failure, never a silently discarded uncertain operation',()=>{
 const record=model.routeRecord({localId:'local',document:document()});record.sync={...record.sync,cloudId:id,revision:0,pending:{action:'save',draft:{operationId:'bad',routeId:id,expectedRevision:0,document:document()}}};
 assert.throws(()=>model.parseRouteRecords([record]),/ROUTE_LOCAL_INVALID/);
});
test('guest import clears all owner bindings and owner-bound road proof but retains private geometry',()=>{
 const record=model.routeRecord({localId:'local',document:{...document(),source:{kind:'road',routeToken:id}},geometry:geometry()});record.sync={...record.sync,cloudId:id,revision:4,cleanFingerprint:model.fingerprintRoute(record.document),pending:{action:'save',draft:{operationId:op,routeId:id,expectedRevision:4,document:record.document}}};
 const [guest]=model.parseRouteRecords([record],undefined,true);assert.equal(guest.document.source.kind,'draft');assert.equal(guest.sync.cloudId,null);assert.equal(guest.sync.pending,null);assert.equal(guest.sync.revision,null);assert.equal(guest.geometry.segments.length,2);
});
test('hidden deleted records never appear in legacy compatibility projections',()=>{
 const record=model.routeRecord({localId:'local',document:document()});record.sync.deleted=true;assert.deepEqual(model.compatibleRoutes([record]),[]);
 const [guest]=model.parseRouteRecords([record],undefined,true);assert.equal(guest.sync.deleted,true);assert.deepEqual(model.compatibleRoutes([guest]),[]);
});
test('owner singleton recorded fragments stay separate and guest visibility becomes private',()=>{
 const d={...document(),visibility:'public'},g={...geometry(),segments:[[{latitude:13,longitude:100}],[{latitude:14,longitude:101}]]};
 const [record]=model.parseRouteRecords([model.routeRecord({localId:'local',document:d,geometry:g})],undefined,true);assert.equal(record.geometry.segments.length,2);assert.equal(record.document.visibility,'private');
});
test('canonical duplicate local/cloud IDs, partial sync metadata and invalid geometry fail closed',()=>{
 const record=model.routeRecord({localId:'local',document:document()});assert.throws(()=>model.parseRouteRecords([record,record]),/ROUTE_LOCAL_INVALID/);
 assert.throws(()=>model.parseRouteRecords([{...record,sync:{...record.sync,cloudId:id,revision:null}}]),/ROUTE_LOCAL_INVALID/);
 assert.throws(()=>model.parseRouteRecords([{...record,geometry:{...geometry(),segments:[[{latitude:91,longitude:100}]]}}]),/ROUTE_LOCAL_INVALID/);
 assert.throws(()=>model.parseRouteRecords([{...record,sync:{...record.sync,cloudId:id,revision:2147483648}}]),/ROUTE_LOCAL_INVALID/);
});
test('hidden tombstones do not consume the200-live allowance but total history stays bounded1000',()=>{
 const tombstones=Array.from({length:800},(_,i)=>{const row=model.routeRecord({localId:`dead-${i}`,document:document()});row.sync.deleted=true;return row;});
 const live=Array.from({length:200},(_,i)=>model.routeRecord({localId:`live-${i}`,document:document()}));
 assert.equal(model.parseRouteRecords([...tombstones,...live]).length,1000);
 assert.throws(()=>model.parseRouteRecords([...tombstones,...live,model.routeRecord({localId:'too-many',document:document()})]),/ROUTE_LOCAL_INVALID/);
 assert.throws(()=>model.parseRouteRecords([...live,model.routeRecord({localId:'live-201',document:document()})]),/ROUTE_LOCAL_INVALID/);
});
