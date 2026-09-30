import test from 'node:test';
import assert from 'node:assert/strict';
import { garageDocument, fingerprintGarage, blankGarageSync, reconcileGarage, acknowledgeGarage, parseGarageSync } from '../src/features/garage/localModel.ts';

const vehicle=(id='v')=>({id,catalogId:null,category:'scooter',brand:'Honda',model:'PCX160',engineCc:156.9,year:''});
const doc=(id='v')=>garageDocument([vehicle(id)],id);
const op='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('normalization preserves old snapshot precision, unknown year and category',()=>{
 const value=doc(); assert.equal(value.vehicles[0].engineCc,156.9);assert.equal(value.vehicles[0].year,null);assert.equal(value.vehicles[0].category,'scooter');assert.equal(value.vehicles[0].motorPowerKw,null);
});
test('EV motor kW and diesel stay distinct from cc',()=>{
 const value=garageDocument([{...vehicle(),category:'car',engineCc:null,powertrain:'electric',motorPowerKw:150}],null);assert.equal(value.vehicles[0].engineCc,null);assert.equal(value.vehicles[0].motorPowerKw,150);
 assert.equal(garageDocument([{...vehicle(),powertrain:'diesel'}],null).vehicles[0].powertrain,'diesel');
});
test('first device with local vehicles publishes only to pristine remote revision zero',()=>{
 assert.equal(reconcileGarage(doc(),blankGarageSync(),{revision:0,document:garageDocument([],null),updated_at:null}).kind,'publish');
 assert.equal(reconcileGarage(doc(),blankGarageSync(),{revision:4,document:garageDocument([],null),updated_at:null}).kind,'conflict');
});
test('new empty device adopts cloud; matching local legacy document may bind without writing',()=>{
 const remote={revision:3,document:doc(),updated_at:null};
 assert.equal(reconcileGarage(garageDocument([],null),blankGarageSync(),remote).kind,'adopt');
 assert.equal(reconcileGarage(doc(),blankGarageSync(),remote).kind,'adopt');
});
test('dirty local edits never silently overwrite another device revision',()=>{
 const sync={...blankGarageSync(),revision:2,cleanFingerprint:fingerprintGarage(doc('old'))};
 assert.equal(reconcileGarage(doc('edited'),sync,{revision:3,document:doc('remote'),updated_at:null}).kind,'conflict');
 assert.equal(reconcileGarage(doc('edited'),sync,{revision:2,document:doc('old'),updated_at:null}).kind,'publish');
});
test('pending requests resume before reconciliation and retain exact bytes and operation',()=>{
 const pending={operationId:op,expectedRevision:2,document:doc()}; const sync={...blankGarageSync(),revision:2,pending};
 const result=reconcileGarage(doc('newer'),sync,{revision:8,document:doc('remote'),updated_at:null});assert.equal(result.kind,'resume');assert.deepEqual(result.draft,pending);
});
test('ACK marks only sent document clean, leaving newer edits dirty',()=>{
 const pending={operationId:op,expectedRevision:2,document:doc('sent')};
 const next=acknowledgeGarage({...blankGarageSync(),revision:2,pending},{operation_id:op,applied_revision:3,current_revision:3});
 assert.equal(next.revision,3);assert.equal(next.cleanFingerprint,fingerprintGarage(doc('sent')));assert.equal(next.pending,null);
 assert.notEqual(next.cleanFingerprint,fingerprintGarage(doc('newer')));
});
test('ACK from older operation or forged revision cannot clear a pending request',()=>{
 const sync={...blankGarageSync(),revision:2,pending:{operationId:op,expectedRevision:2,document:doc()}};
 assert.throws(()=>acknowledgeGarage(sync,{operation_id:'wrong',applied_revision:3,current_revision:3}),/GARAGE_INVALID_RESPONSE/);
 assert.throws(()=>acknowledgeGarage(sync,{operation_id:op,applied_revision:8,current_revision:8}),/GARAGE_INVALID_RESPONSE/);
});
test('newer server revision in ACK never rebases the local revision',()=>{
 const sync={...blankGarageSync(),revision:2,pending:{operationId:op,expectedRevision:2,document:doc()}};
 assert.equal(acknowledgeGarage(sync,{operation_id:op,applied_revision:3,current_revision:8}).revision,3);
});
test('stored metadata rejects malformed drafts, retains valid stable operation and strips guest bindings',()=>{
 const sync={revision:2,cleanFingerprint:fingerprintGarage(doc()),pending:{operationId:op,expectedRevision:2,document:doc()}};
 assert.deepEqual(parseGarageSync(sync),sync);assert.deepEqual(parseGarageSync(sync,true),blankGarageSync());
 assert.deepEqual(parseGarageSync({...sync,pending:{...sync.pending,operationId:'not-uuid'}}),blankGarageSync());
});
test('valid long Unicode nickname and large acknowledged fingerprint retain retry metadata',()=>{
 const document=garageDocument([{...vehicle(),nickname:'😀'.repeat(80)}],'v');const sync={revision:2,cleanFingerprint:'x'.repeat(300000),pending:{operationId:op,expectedRevision:2,document}};
 assert.deepEqual(parseGarageSync(sync),sync);
});
