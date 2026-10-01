import test from 'node:test';
import assert from 'node:assert/strict';
import { startPinDrag, finishPinDrag } from '../src/features/map/pinDrag.ts';
const pin={id:'one',coordinate:{latitude:13.7,longitude:100.5},label:'Start',role:'start',order:1};
const state={alive:true,ready:true,epoch:2,mode:'edit',selectedPinId:'one',pins:[pin]};
test('native/web engine drag commits only selected unchanged pin in same active editable map generation',()=>{
  const ticket=startPinDrag(state);
  assert.deepEqual(finishPinDrag(ticket,state,{latitude:13.8,longitude:100.6}),{id:'one',coordinate:{latitude:13.8,longitude:100.6}});
  for(const patch of [{mode:'glance'},{epoch:3},{alive:false},{ready:false},{pins:[]},{selectedPinId:null},{pins:[{...pin,coordinate:{latitude:14,longitude:101}}]}]){
    assert.equal(finishPinDrag(ticket,{...state,...patch},{latitude:13.8,longitude:100.6}),null);
  }
  assert.equal(finishPinDrag(ticket,state,{latitude:91,longitude:100}),null);
  assert.equal(startPinDrag({...state,mode:'browse'}),null);
  assert.equal(startPinDrag(state,'removed-selected-marker'),null);
});
