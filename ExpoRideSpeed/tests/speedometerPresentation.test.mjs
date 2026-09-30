import test from 'node:test';
import assert from 'node:assert/strict';
import { presentSpeed, speedScale, formatRideDuration, metricDistance, rollingDigitPosition } from '../src/features/speedometer/presentation.ts';
const snapshot={liveMps:10,maxMps:20,quality:'good',horizontalAccuracyM:4};
test('the HUD preserves absent/weak/lost live speed while retaining the independently confirmed maximum',()=>{
  for(const value of [{...snapshot,liveMps:null},{...snapshot,quality:'weak'},{...snapshot,quality:'noFix'},{...snapshot,liveMps:NaN},{...snapshot,liveMps:-1}]) {
    const result=presentSpeed(value,'kmh');assert.equal(result.live,null);assert.equal(result.maximum,72);
  }
  assert.equal(presentSpeed({...snapshot,liveMps:0},'kmh').live,0);
  assert.equal(presentSpeed({...snapshot,liveMps:null},'kmh').signal,'confirming');
});
test('unit conversion does not cap measured values or derive a maximum from current speed',()=>{
  assert.equal(presentSpeed(snapshot,'kmh').live,36);
  assert.ok(Math.abs(presentSpeed(snapshot,'mph').live-22.3693629205)<1e-9);
  assert.equal(presentSpeed({...snapshot,maxMps:null},'kmh').maximum,null);
  assert.equal(presentSpeed({...snapshot,liveMps:100},'kmh').live,360);
  assert.equal(speedScale(360,72,'kmh'),360);
  assert.equal(presentSpeed({...snapshot,liveMps:10000},'kmh').live,null);
});
test('duration and distance labels reject malformed metrics and do not round time through a minute boundary',()=>{
  assert.equal(formatRideDuration(59.9),'0:59');assert.equal(formatRideDuration(3601),'1:00:01');
  assert.equal(formatRideDuration(NaN),null);assert.equal(formatRideDuration(-1),null);
  assert.deepEqual(metricDistance(1000,'kmh'),{value:1,unit:'km'});
  assert.deepEqual(metricDistance(1609.344,'mph'),{value:1,unit:'mi'});
  assert.equal(metricDistance(Infinity,'kmh'),null);
});
test('fixed-width rolling cells carry smoothly at digit boundaries without displaying a negative zero',()=>{
  assert.equal(rollingDigitPosition(0,1),0);
  assert.equal(rollingDigitPosition(-0.1,1),0);
  assert.equal(rollingDigitPosition(59,10),5);
  assert.equal(rollingDigitPosition(59.5,10),5.5);
  assert.equal(rollingDigitPosition(60,10),6);
  assert.equal(rollingDigitPosition(9.5,1),9.5);
  assert.equal(rollingDigitPosition(10,1),0);
  assert.equal(rollingDigitPosition(99.5,100),0.5);
  assert.equal(rollingDigitPosition(100,100),1);
});
