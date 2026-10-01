import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../src/',import.meta.url));
export function socialModule(name,overrides={}){
 const cache=new Map();function load(path){if(!existsSync(path))return {};if(cache.has(path))return cache.get(path).exports;const module={exports:{}};cache.set(path,module);
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(key=>{if(key in overrides)return overrides[key];if(!key.startsWith('.'))return require(key);return load(resolve(dirname(path),`${key}.ts`));},module,module.exports);return module.exports;}
 return load(resolve(root,'features/social',`${name}.ts`));
}
export const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const owner=uuid(1),peer=uuid(2),stamp='2026-10-01T02:00:00.123456+00:00';
export const operation=(request={schema_version:1,action:'request_friend',handle:'rider'},id=uuid(10))=>({operationId:id,request});
export function receipt(op=operation(),result={kind:'friend',user_id:peer,state:'outgoing',generation:1}){return {owner_id:owner,operation_id:op.operationId,request:op.request,applied_at:stamp,result};}
export const socialPage=()=>({owner_id:owner,server_now:stamp,self:{profile_ready:true,presence_opt_in:false,account_revision:2},items:[{user_id:peer,handle:'rider',display_name:'ผู้ขี่',state:'accepted',direction:'outgoing',generation:1,updated_at:stamp}],statuses:[{user_id:peer,topic:`rs-presence:${uuid(3)}`,online:true,expires_at:'2026-10-01T02:01:10.123456+00:00'}],next_cursor:null});
export const copy=value=>JSON.parse(JSON.stringify(value));
export function hold(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
export const tick=()=>new Promise(done=>setImmediate(done));
