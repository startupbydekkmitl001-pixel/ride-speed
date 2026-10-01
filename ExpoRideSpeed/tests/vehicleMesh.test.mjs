import {test} from 'node:test';import assert from 'node:assert/strict';
import {liveModule} from './helpers/live.mjs';
const {vehicleMesh,projectVehicle}=liveModule('../map/vehicleMesh');
test('all generic models are bounded, finite and distinct without external assets',()=>{
 const sizes=[];for(const category of ['scooter','bigbike','car']){const mesh=vehicleMesh(category,'#FF5A1F');assert.ok(mesh.faces.length>40&&mesh.faces.length<500);sizes.push(JSON.stringify(mesh));for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*2,-10]){const frame=projectVehicle(mesh,yaw,340,240);assert.equal(frame.vertices.length,frame.colors.length);assert.ok(frame.vertices.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>0&&p.x<340&&p.y>0&&p.y<240));}}assert.equal(new Set(sizes).size,3);
});
test('rotation wraps without position drift; paint input is normalized',()=>{const mesh=vehicleMesh('car','invalid');const a=projectVehicle(mesh,0,340,240),b=projectVehicle(mesh,Math.PI*2,340,240);assert.ok(a.vertices.every((p,i)=>Math.abs(p.x-b.vertices[i].x)<1e-8&&Math.abs(p.y-b.vertices[i].y)<1e-8));assert.ok(a.colors.every(c=>/^#[0-9a-f]{6}$/i.test(c)));});
test('far triangles draw before near triangles so hidden wheels cannot paint over bodywork',()=>{const mesh={points:[[-1,0,-1],[1,0,-1],[0,1,-1],[-1,0,1],[1,0,1],[0,1,1]],faces:[{indices:[0,1,2],color:'#ff0000'},{indices:[3,4,5],color:'#0000ff'}]};const frame=projectVehicle(mesh,0,340,240);assert.ok(parseInt(frame.colors[0].slice(1,3),16)>0);assert.ok(parseInt(frame.colors.at(-1).slice(5,7),16)>0);});
