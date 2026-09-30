import assert from 'node:assert/strict';
import {materialAtFrame,LOOP_FRAMES} from './src/motion.mjs';

const start=materialAtFrame(0), end=materialAtFrame(LOOP_FRAMES);
assert.deepEqual(start,end,'The virtual endpoint must equal the first state exactly');
const h=.0001;
const before=materialAtFrame(-h),after=materialAtFrame(h);
const atEndBefore=materialAtFrame(LOOP_FRAMES-h),atEndAfter=materialAtFrame(LOOP_FRAMES+h);
let worstVelocityError=0;
const steps=[];
for(const key of Object.keys(start)) {
  const startVelocity=(after[key]-before[key])/(2*h);
  const endVelocity=(atEndAfter[key]-atEndBefore[key])/(2*h);
  worstVelocityError=Math.max(worstVelocityError,Math.abs(startVelocity-endVelocity));
  assert.ok(Math.abs(startVelocity-endVelocity)<1e-7,`Velocity discontinuity: ${key}`);
  const boundary=Math.abs(start[key]-materialAtFrame(LOOP_FRAMES-1)[key]);
  const adjacent=Math.abs(materialAtFrame(1)[key]-start[key]);
  let largestOrdinaryStep=0;
  for(let frame=1;frame<LOOP_FRAMES;frame++)largestOrdinaryStep=Math.max(largestOrdinaryStep,Math.abs(materialAtFrame(frame)[key]-materialAtFrame(frame-1)[key]));
  assert.ok(boundary<=largestOrdinaryStep+1e-9,`Boundary jump exceeds an ordinary step: ${key}`);
  steps.push({key,boundary,adjacent,largestOrdinaryStep});
}
console.log(JSON.stringify({periodFrames:LOOP_FRAMES,endpointExactlyEqual:true,worstVelocityError,steps},null,2));
