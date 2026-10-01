import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {vehiclePng} from './vehicle-png.mjs';
const source=await readFile(new URL('../src/features/map/vehicleMesh.ts',import.meta.url),'utf8');
const module={exports:{}};new Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports);
const folder=new URL('../assets/vehicles/',import.meta.url);await mkdir(folder,{recursive:true});
const manifest=[];
for(const category of ['scooter','bigbike','car']){
 const mesh=module.exports.vehicleMesh(category,'#FF5A1F'),positions=[],colors=[],normals=[];
 for(const face of mesh.faces){const [a,b,c]=face.indices.map(i=>mesh.points[i]),u=b.map((v,i)=>v-a[i]),v=c.map((value,i)=>value-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal)||1;for(const i of face.indices){positions.push(...mesh.points[i]);colors.push(...[1,3,5].map(j=>parseInt(face.color.slice(j,j+2),16)/255));normals.push(...normal.map(n=>n/length));}}
 const raw=new Float32Array([...positions,...colors,...normals]),binary=Buffer.from(raw.buffer),size=positions.length*4,count=positions.length/3;
 const min=[0,1,2].map(axis=>Math.min(...mesh.points.map(p=>p[axis]))),max=[0,1,2].map(axis=>Math.max(...mesh.points.map(p=>p[axis])));
 const gltf={asset:{version:'2.0',generator:'Ride Speed original procedural vehicle mesh',copyright:'CC0-1.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,COLOR_0:1,NORMAL:2},material:0,mode:4}]}],materials:[{name:'matte-original',doubleSided:true,pbrMetallicRoughness:{metallicFactor:.15,roughnessFactor:.55}}],buffers:[{uri:`data:application/octet-stream;base64,${binary.toString('base64')}`,byteLength:binary.length}],bufferViews:[0,1,2].map(i=>({buffer:0,byteOffset:i*size,byteLength:size,target:34962})),accessors:[{bufferView:0,componentType:5126,count,type:'VEC3',min,max},{bufferView:1,componentType:5126,count,type:'VEC3'},{bufferView:2,componentType:5126,count,type:'VEC3'}]};
 const json=JSON.stringify(gltf);await writeFile(new URL(`${category}.gltf`,folder),json+'\n');const png=vehiclePng(module.exports.projectVehicle(mesh,0,128,128,1.1));await writeFile(new URL(`${category}.png`,folder),png);manifest.push({category,file:`${category}.gltf`,bytes:Buffer.byteLength(json)+1,sprite:`${category}.png`,spriteBytes:png.length,triangles:mesh.faces.length,license:'CC0-1.0',source:'src/features/map/vehicleMesh.ts',represents:'Generic category, not a manufacturer model'});
}
await writeFile(new URL('manifest.json',folder),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({folder:fileURLToPath(folder),models:manifest},null,2));
