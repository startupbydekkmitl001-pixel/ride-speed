import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const require=createRequire(import.meta.url),ts=require('typescript'),cache=new Map();
function load(path){if(cache.has(path))return cache.get(path).exports;const mod={exports:{}};cache.set(path,mod);new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.startsWith('.')?load(resolve(dirname(path),`${name}.ts`)):require(name),mod,mod.exports);return mod.exports;}
const at=name=>fileURLToPath(new URL(`../src/features/${name}.ts`,import.meta.url));
const model=load(at('routes/presentationModel')),local=load(at('routes/localModel')),journal=load(at('rides/journalModel'));
test('recorded route import retains disconnected pause fragments and does not invent a road ETA',()=>{
 const parts=[[{latitude:13,longitude:100},{latitude:13.01,longitude:100.01}],[{latitude:14,longitude:101},{latitude:14.01,longitude:101.01}]],encoded=parts.map(points=>journal.encodePolyline(points));
 const result=model.builderFromRide({geometry:{fragments:encoded.map(polyline=>({polyline}))},distance_m:123,vehicle:{category:'car'}},'Completed ride','Start','Finish');
 assert.deepEqual(result.geometry.segments,parts);assert.deepEqual(result.geometry.recordedParts,encoded);assert.equal(result.geometry.durationSeconds,null);assert.equal(result.geometry.distanceMeters,123);assert.equal(result.visibility,'private');assert.equal(result.category,'car');
});
test('reopening owner road route preserves provider calculation time and discards blocked road proof',()=>{
 const doc={schema_version:1,title:'Owner route',category:'scooter',visibility:'private',stops:[{lat:13,lng:100,label:'Start'},{lat:14,lng:101,label:'Finish'}],source:{kind:'road',routeToken:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}};
 const row=local.routeRecord({localId:'local',document:doc,geometry:{segments:[[{latitude:13,longitude:100},{latitude:14,longitude:101}]],distanceMeters:100,durationSeconds:30,geometryHash:null,provider:'geoapify',calculatedAt:'2026-10-01T00:00:00.000Z',attribution:'Geoapify'}});
 assert.equal(model.builderFromRecord(row).geometry.calculatedAt,row.geometry.calculatedAt);row.sync.blocked={fingerprint:local.fingerprintRoute(doc),error:'ROUTE_SOURCE_EXPIRED'};assert.equal(model.builderFromRecord(row).geometry,null);assert.equal(model.builderFromRecord(row).stops.length,2);
});
test('empty or excessive recorded geometry fails without creating a fictional route',()=>{
 assert.throws(()=>model.builderFromRide({geometry:{fragments:[]}},'Ride','Start','Finish'),/ROUTE_TOO_LARGE/);
 assert.throws(()=>model.builderFromRide({geometry:{fragments:Array.from({length:33},()=>({polyline:'??'}))}},'Ride','Start','Finish'),/ROUTE_TOO_LARGE/);
});
