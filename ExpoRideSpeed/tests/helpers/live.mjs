import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../src/',import.meta.url));
export function liveModule(name,overrides={}){const cache=new Map();function load(path){if(!existsSync(path))return {};if(cache.has(path))return cache.get(path).exports;const module={exports:{}};cache.set(path,module);const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(key=>key in overrides?overrides[key]:key.startsWith('.')?load(resolve(dirname(path),`${key}.ts`)):require(key),module,module.exports);return module.exports;}return load(resolve(root,'features/live',`${name}.ts`));}
export const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const owner=uuid(1),peer=uuid(2),roomId=uuid(3),captureId=uuid(4),leaseId=uuid(5),topicId=uuid(6),stamp='2026-10-01T02:00:00.123456+00:00';
export const copy=v=>JSON.parse(JSON.stringify(v));
export const hold=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
export const tick=()=>new Promise(done=>setImmediate(done));
export const member=(id,role='member')=>({user_id:id,handle:id===owner?'arnalxz':'rider',display_name:id===owner?'Arnalxz':'ผู้ขี่',role,state:'accepted',generation:2,host_friendship_generation:role==='host'?null:4});
export const snapshot=()=>({owner_id:owner,server_now:stamp,id:roomId,host_id:owner,title:'ทริปกับเพื่อน',revision:3,state:'active',expires_at:'2026-10-01T03:00:00Z',host_lease_until:'2026-10-01T02:00:45.123456+00:00',route_snapshot:{route_id:uuid(9),revision:2,title:'เส้นทางจริง',category:'scooter',segments:[],geometryStatus:'hidden',privacyTrimMeters:200,geometryHash:null,provider:'draft',attribution:null},viewer_role:'host',self_state:'accepted',self_generation:2,members:[member(owner,'host'),member(peer)],topic:`rs-convoy:${topicId}`,topic_generation:3,change_revision:4,self_consent:{revision:2,precision:'precise',lease_id:leaseId,capture_id:captureId,expires_at:'2026-10-01T02:15:00Z',last_sequence:0},self_code:{generation:2,hash:'a'.repeat(64),expires_at:'2026-10-01T03:00:00Z'}});
export const grant=()=>({schema_version:1,action:'location_grant',convoy_id:roomId,expected_room_revision:3,expected_member_generation:2,expected_consent_revision:1,capture_id:captureId,duration_seconds:900,precision:'precise'});
export const operation=(request=grant(),n=10)=>({operationId:uuid(n),request,queuedAt:stamp,lastError:null});
export const receipt=(op=operation())=>({owner_id:owner,operation_id:op.operationId,request:op.request,applied_at:stamp,result:{kind:'consent',convoy_id:roomId,revision:2,precision:'precise',lease_id:leaseId,capture_id:captureId,expires_at:'2026-10-01T02:15:00Z'}});
export const sample=()=>({schema_version:1,convoy_id:roomId,topic_generation:3,member_generation:2,consent_revision:2,lease_id:leaseId,capture_id:captureId,sequence:1,latitude:13.73,longitude:100.5,accuracy_m:8,heading_deg:null,captured_at:stamp,source:{platform:'android',mocked:null,simulated:null}});
export const positions=()=>({owner_id:owner,convoy_id:roomId,server_now:stamp,topic_generation:3,change_revision:4,items:[{user_id:peer,display_name:'ผู้ขี่',latitude:13.73,longitude:100.5,accuracy_m:8,heading_deg:null,captured_at:stamp,received_at:stamp,expires_at:'2026-10-01T02:00:15.123456+00:00',member_generation:2,consent_revision:2,sequence:1,authority:'unverified_live'}]});
