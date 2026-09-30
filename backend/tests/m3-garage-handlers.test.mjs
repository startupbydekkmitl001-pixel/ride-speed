import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { readGaragePhotoRequest, GarageRequestError } from '../functions/_shared/garage-requests.ts';

const owner='00000000-0000-4000-8000-000000000031',other='00000000-0000-4000-8000-000000000032',upload='30000000-0000-4000-8000-000000000031';
const path=`${owner}/${upload}.jpg`,url=`https://project.test/storage/v1/object/sign/vehicle-photos/${path}?token=short`;
class HttpError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
const response=(_req,body,status=200)=>Response.json(body,{status});
const failure=(req,e)=>response(req,{error:e instanceof HttpError?e.code:'SERVICE_UNAVAILABLE'},e.status??503);
const request=(body={vehicleId:'legacy-local-id'})=>new Request('https://example.test/vehicle-photo-url',{method:'POST',body:JSON.stringify(body)});
async function handlerFor(context){
 const source=await readFile(new URL('../functions/vehicle-photo-url/index.ts',import.meta.url),'utf8');let handler;
 runInNewContext(stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm,''),{mode:'strip'}),{Deno:{serve:fn=>handler=fn},HttpError,GarageRequestError,readGaragePhotoRequest,preflight:()=>null,response,failure,Error,...context});return handler;
}
function boundary(photo={upload_id:upload,path},cleanupFails=false){
 const calls=[];return {calls,authenticate:async()=>({userId:owner,userClient:{rpc:async(name,args)=>{calls.push(name);assert.equal(name,'rs_vehicle_photo_for_view');assert.equal(args.p_vehicle_id,'legacy-local-id');assert.equal(Object.keys(args).length,1);return {data:photo,error:null};}},admin:{
 storage:{from:bucket=>({createSignedUrl:async(p,ttl)=>{calls.push('sign');assert.equal(bucket,'vehicle-photos');assert.equal(p,path);assert.equal(ttl,60);return {data:{signedUrl:url},error:null};},remove:async paths=>{calls.push('cleanup');assert.deepEqual([...paths],[`${owner}/obsolete.jpg`]);return {error:cleanupFails?{message:'private detail'}:null};}})},
 rpc:async(name,args)=>{calls.push(name);assert.equal(name,'rs_vehicle_photo_cleanup_objects');assert.equal(args.p_owner,owner);return {data:[{bucket:'vehicle-photos',path:`${owner}/obsolete.jpg`}],error:null};}
 }})};
}
test('bounded request reader rejects owners, paths, URLs, malformed Unicode and oversized streams',async()=>{
 assert.deepEqual(await readGaragePhotoRequest(request()),{vehicleId:'legacy-local-id'});
 for(const body of [{},{vehicleId:'a',userId:other},{vehicleId:'a',path},{vehicleId:''},{vehicleId:'\u0000'},{vehicleId:'a'.repeat(101)},{vehicleId:3}])await assert.rejects(readGaragePhotoRequest(request(body)),/INVALID_REQUEST/);
 await assert.rejects(readGaragePhotoRequest(new Request('https://example.test',{method:'POST',body:'x'.repeat(4097)})),/REQUEST_TOO_LARGE/);
 await assert.rejects(readGaragePhotoRequest(new Request('https://example.test',{method:'POST',body:new Uint8Array([0xff])})),/INVALID_REQUEST/);
});
test('maintained signer uses the caller-owned saved vehicle lookup, exact server path and short private URL',async()=>{
 const b=boundary(),handler=await handlerFor(b),res=await handler(request());assert.equal(res.status,200);assert.deepEqual(await res.json(),{url,expiresIn:60,uploadId:upload});
 assert.deepEqual(b.calls,['rs_vehicle_photo_for_view','sign','rs_vehicle_photo_cleanup_objects','cleanup']);
});
test('malformed and foreign lookup results never invoke the privileged signer or cleanup',async()=>{
 for(const photo of [null,{upload_id:upload,path:`${other}/${upload}.jpg`},{upload_id:'not-uuid',path},{upload_id:upload,path:`${owner}/${upload}.svg`}]){
 const b=boundary(photo),handler=await handlerFor(b),res=await handler(request());assert.equal(res.status,404);assert.deepEqual(b.calls,['rs_vehicle_photo_for_view']);}
});
test('bad request does not reach the lookup, and obsolete-photo cleanup outages do not lose the current signed photo',async()=>{
 const b=boundary(),handler=await handlerFor(b),bad=await handler(request({vehicleId:'legacy-local-id',path}));assert.equal(bad.status,400);assert.deepEqual(b.calls,[]);
 const retry=boundary(undefined,true),res=await (await handlerFor(retry))(request());assert.equal(res.status,200);assert.deepEqual(await res.json(),{url,expiresIn:60,uploadId:upload});
});
