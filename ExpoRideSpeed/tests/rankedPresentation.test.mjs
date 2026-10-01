import test from 'node:test';
import assert from 'node:assert/strict';
import {bangkokPeriodBounds,classForVehicle,classesForCategory,elapsedBoundsLabel,stableRankChange} from '../src/features/ranked/presentationModel.ts';

test('Bangkok midnight uses UTC bounds, independently of the host timezone',()=>{
 assert.deepEqual(bangkokPeriodBounds('2026-09-30T16:59:59.999Z','today'),{starts_at:'2026-09-29T17:00:00.000Z',ends_at:'2026-09-30T17:00:00.000Z'});
 assert.deepEqual(bangkokPeriodBounds('2026-09-30T17:00:00.000Z','today'),{starts_at:'2026-09-30T17:00:00.000Z',ends_at:'2026-10-01T17:00:00.000Z'});
});
test('Monday weeks span year boundaries and Sunday does not advance early',()=>{
 assert.deepEqual(bangkokPeriodBounds('2027-01-03T16:59:59.999Z','week'),{starts_at:'2026-12-27T17:00:00.000Z',ends_at:'2027-01-03T17:00:00.000Z'});
 assert.deepEqual(bangkokPeriodBounds('2027-01-03T17:00:00.000Z','week'),{starts_at:'2027-01-03T17:00:00.000Z',ends_at:'2027-01-10T17:00:00.000Z'});
});
test('month windows handle leap February and December rollover',()=>{
 assert.deepEqual(bangkokPeriodBounds('2024-02-29T10:00:00Z','month'),{starts_at:'2024-01-31T17:00:00.000Z',ends_at:'2024-02-29T17:00:00.000Z'});
 assert.deepEqual(bangkokPeriodBounds('2026-12-31T10:00:00Z','month'),{starts_at:'2026-11-30T17:00:00.000Z',ends_at:'2026-12-31T17:00:00.000Z'});
});
test('invalid periods/instants are rejected instead of being assigned a device period',()=>{
 for(const now of ['not a date','2026-02-30T10:00:00Z','2026-10-01'])assert.throws(()=>bangkokPeriodBounds(now,'today'));
 assert.throws(()=>bangkokPeriodBounds('2026-10-01T00:00:00Z','year'));
});
test('class default keeps real decimal displacement on either side of every boundary',()=>{
 const vehicle=(category,engine_cc,powertrain='petrol')=>({category,engine_cc,powertrain});
 for(const [cc,key] of [[125,'le125'],[125.01,'gt125_le160'],[156.9,'gt125_le160'],[160,'gt125_le160'],[160.01,'gt160']])assert.equal(classForVehicle(vehicle('scooter',cc)),`scooter:${key}`);
 for(const [cc,key] of [[500,'le500'],[500.01,'gt500_le900'],[900,'gt500_le900'],[900.01,'gt900']])assert.equal(classForVehicle(vehicle('motorcycle',cc)),`motorcycle:${key}`);
});
test('electric, missing metadata and car class never borrow a guessed combustion class',()=>{
 assert.equal(classForVehicle({category:'scooter',engine_cc:160,powertrain:'electric'}),'scooter:ev');
 assert.equal(classForVehicle({category:'car',engine_cc:1498,powertrain:'hybrid'}),'car:unknown');
 assert.equal(classForVehicle({category:'car',engine_cc:null,powertrain:'electric'}),'car:ev');
 assert.equal(classForVehicle({category:'motorcycle',engine_cc:null,powertrain:'unknown'}),'motorcycle:unknown');
 assert.equal(classForVehicle(null),'unknown');
 assert.equal(classForVehicle({category:'scooter',engine_cc:NaN,powertrain:'petrol'}),'scooter:unknown');
 assert.equal(classesForCategory('car').includes('car:gt900'),false);
});
test('time labels round outward and never advertise a midpoint as the verified result',()=>{
 assert.equal(elapsedBoundsLabel(10399,11101),'10–12');
 assert.equal(elapsedBoundsLabel(10000,10000),'10–10');
 assert.throws(()=>elapsedBoundsLabel(12000,10000));
});
test('rank change only compares the same board and owner, not filter or period transitions',()=>{
 assert.equal(stableRankChange({board:'today:scooter',user:'A',rank:5},{board:'today:scooter',user:'A',rank:2}),3);
 assert.equal(stableRankChange({board:'today:scooter',user:'A',rank:2},{board:'week:scooter',user:'A',rank:1}),null);
 assert.equal(stableRankChange({board:'today:scooter',user:'A',rank:2},{board:'today:scooter',user:'B',rank:1}),null);
 assert.equal(stableRankChange(null,{board:'today:scooter',user:'A',rank:1}),null);
});
