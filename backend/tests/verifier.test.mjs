import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyEvidence } from '../functions/_shared/verify-evidence.mjs';

const base=1790000000000;
const context={challengeId:'race-1',startsAtMs:base,endsAtMs:base+3600000,nowMs:base+3600000,polygon:[{lat:13.6,lng:100.4},{lat:13.9,lng:100.4},{lat:13.9,lng:100.8},{lat:13.6,lng:100.8}]};
const sample=(i,speed=10)=>({timestampMs:base+i*1000,latitude:13.7+i*.00009,longitude:100.5,speedMps:speed,horizontalAccuracyM:4,speedAccuracyMps:.4});
const envelope=samples=>({schemaVersion:1,challengeId:'race-1',source:'corelocation',samples});

test('four observations spanning three real seconds produce a conservative sustained minimum',()=>{
 const result=verifyEvidence(envelope([sample(0,10),sample(1,11),sample(2,10.5),sample(3,10.2)]),context);
 assert.equal(result.sustainedKmh,36);assert.equal(result.windowEndMs-result.windowStartMs,3000);assert.equal(result.sampleCount,4);
});
test('three samples, missing native speed accuracy and duplicate timestamps cannot rank',()=>{
 assert.throws(()=>verifyEvidence(envelope([sample(0),sample(1),sample(2)]),context),/SAMPLE_COUNT/);
 const missing=[0,1,2,3].map(i=>({...sample(i),speedAccuracyMps:null}));
 assert.throws(()=>verifyEvidence(envelope(missing),context),/NO_ELIGIBLE_WINDOW/);
 assert.throws(()=>verifyEvidence(envelope([sample(0),sample(1),sample(1),sample(3)]),context),/TIMESTAMP_ORDER/);
});
test('gaps, poor accuracy, out-of-course coordinates, and future data break eligibility',()=>{
 assert.throws(()=>verifyEvidence(envelope([sample(0),sample(1),sample(3),sample(4)]),context),/NO_ELIGIBLE_WINDOW/);
 assert.throws(()=>verifyEvidence(envelope([0,1,2,3].map(i=>({...sample(i),horizontalAccuracyM:80}))),context),/NO_ELIGIBLE_WINDOW/);
 assert.throws(()=>verifyEvidence(envelope([0,1,2,3].map(i=>({...sample(i),latitude:15}))),context),/NO_ELIGIBLE_WINDOW/);
 assert.throws(()=>verifyEvidence(envelope([0,1,2,3].map(i=>sample(i))),{...context,nowMs:base+2500}),/NO_ELIGIBLE_WINDOW/);
});
test('a spike does not raise the minimum; a later fully supported faster window wins',()=>{
 const result=verifyEvidence(envelope([sample(0,8),sample(1,8),sample(2,10),sample(3,11),sample(4,10),sample(5,10)]),context);
 assert.equal(result.sustainedKmh,36);assert.equal(result.windowStartMs,base+2000);
});
test('unapproved/missing geometry and wrong route challenge identity reject',()=>{
 assert.throws(()=>verifyEvidence(envelope([0,1,2,3].map(i=>sample(i))),{...context,polygon:null}),/COURSE_BOUNDARY_REQUIRED/);
 assert.throws(()=>verifyEvidence(envelope([0,1,2,3].map(i=>sample(i))),{...context,challengeId:'other'}),/CHALLENGE_MISMATCH/);
});

test('known simulation rejects the entire submission, even outside the winning window',()=>{
 for (const flag of ['isSimulatedBySoftware','mocked']) {
  const allSimulated=[0,1,2,3].map(i=>({...sample(i),[flag]:true}));
  assert.throws(()=>verifyEvidence(envelope(allSimulated),context),/SIMULATED_LOCATION/);
  // Four honest-looking samples must not hide an explicitly simulated tail,
  // even when that tail would be discarded by the accuracy filter.
  const mixed=[0,1,2,3].map(i=>sample(i));
  mixed.push({...sample(4),[flag]:true,speedAccuracyMps:-1});
  assert.throws(()=>verifyEvidence(envelope(mixed),context),/SIMULATED_LOCATION/);
 }
});

test('unknown or false flags preserve quality rules; accessories are not simulations',()=>{
 for (const flags of [{},{isSimulatedBySoftware:null,mocked:null,isProducedByAccessory:null},{isSimulatedBySoftware:false,mocked:false,isProducedByAccessory:false},{isSimulatedBySoftware:false,isProducedByAccessory:true}]) {
  const samples=[0,1,2,3].map(i=>({...sample(i),...flags}));
  assert.equal(verifyEvidence(envelope(samples),context).sustainedKmh,36);
  assert.throws(()=>verifyEvidence(envelope(samples.map(s=>({...s,speedAccuracyMps:null}))),context),/NO_ELIGIBLE_WINDOW/);
 }
 assert.throws(()=>verifyEvidence({...envelope([0,1,2,3].map(i=>sample(i))),source:'expo'},context),/SCHEMA_UNSUPPORTED/);
});

test('source flags accept only booleans, null or omission without coercion',()=>{
 for (const flag of ['isSimulatedBySoftware','mocked','isProducedByAccessory']) {
  for (const value of ['true','false',1,0,{},[]]) {
   const samples=[0,1,2,3].map(i=>({...sample(i),[flag]:value}));
   assert.throws(()=>verifyEvidence(envelope(samples),context),/SAMPLE_MALFORMED/);
  }
 }
});
