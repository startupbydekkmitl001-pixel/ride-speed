import {test} from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import {encode,decode as decodeBlurhash} from 'blurhash';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {decode as strictDecode} from '../functions/_shared/vendor/jpeg-js-0.4.4-strict.mjs';
import {verifyCommunityJpeg,CommunityJpegError} from '../functions/_shared/community-jpeg.mjs';
const ports={decode:strictDecode,encodeBlurhash:encode,digest:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const image=(width=48,height=32)=>{const data=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=4*(y*width+x);data[i]=(x*13+y*7)%256;data[i+1]=(x*3+y*17)%256;data[i+2]=(x*19+y*5)%256;data[i+3]=255;}return new Uint8Array(jpeg.encode({data,width,height},75).data);};
const descriptor=(bytes,width=48,height=32)=>({mime:'image/jpeg',sha256:createHash('sha256').update(bytes).digest('hex'),byte_count:bytes.length,width,height,blurhash:null});
const verify=(bytes,d=descriptor(bytes))=>verifyCommunityJpeg(bytes,d,ports);
const bad=promise=>assert.rejects(promise,error=>error instanceof CommunityJpegError&&error.code==='COMMUNITY_MEDIA_INVALID');
const segment=(marker,payload)=>new Uint8Array([255,marker,((payload.length+2)>>8)&255,(payload.length+2)&255,...payload]);
const insert=(bytes,extra)=>new Uint8Array([bytes[0],bytes[1],...extra,...bytes.subarray(2)]);
test('canonical image acceptance decodes real entropy, verifies digest/dimensions and derives actual pixel BlurHash',async()=>{
 const bytes=image(),out=await verify(bytes);assert.equal(out.mime,'image/jpeg');assert.equal(out.sha256,descriptor(bytes).sha256);assert.equal(out.byte_count,bytes.length);assert.equal(out.width,48);assert.equal(out.height,32);assert.equal(typeof out.blurhash,'string');assert.equal(decodeBlurhash(out.blurhash,4,4).length,64);
});
test('exact byte-aligned codec all-one padding is inert, bounded to one stuffed FF00 and never arbitrary tail bytes',async()=>{
 const bytes=new Uint8Array(jpeg.encode({data:new Uint8Array(20*20*4).fill(255),width:20,height:20},75).data);assert.deepEqual([...bytes.slice(-4)],[255,0,255,217]);await verify(bytes,descriptor(bytes,20,20));
 for(const extra of[new Uint8Array([255,0]),new Uint8Array([255,0,255,0]),new Uint8Array([255,1]),new Uint8Array([112,114,105,118,97,116,101])]){const changed=new Uint8Array([...bytes.slice(0,-2),...extra,...bytes.slice(-2)]);await bad(verify(changed,descriptor(changed,20,20)));}
});
test('digest, declared dimensions, MIME and actual byte limits cannot be replaced by header claims',async()=>{
 const bytes=image();for(const patch of[{sha256:'b'.repeat(64)},{width:47},{height:31},{byte_count:bytes.length+1},{mime:'image/png'},{width:1601},{blurhash:'invented'}])await bad(verify(bytes,{...descriptor(bytes),...patch}));
 await bad(verify(new Uint8Array(1048577),{...descriptor(bytes),byte_count:1048577}));
});
test('EXIF, XMP, comment, ICC, APP13, unknown metadata and JFIF thumbnails are rejected before pixel decode',async()=>{
 const bytes=image();for(const marker of[225,226,237,239,254])await bad(verify(insert(bytes,segment(marker,new Uint8Array([1,2,3,4])))));
 const thumb=new Uint8Array([74,70,73,70,0,1,1,0,0,1,0,1,1,1,255,0,0]);await bad(verify(insert(bytes,segment(224,thumb))));
});
test('truncated/corrupt entropy, concatenated images and trailing payload fail rather than header-only commit',async()=>{
 const bytes=image();await bad(verify(bytes.subarray(0,bytes.length-8)));await bad(verify(new Uint8Array([...bytes,0])));await bad(verify(new Uint8Array([...bytes,...image()])));
 // jpeg-js upstream skips arbitrary extra entropy-tail bytes; privacy requires
 // rejecting this payload even when it precedes the final image marker.
 const concealed=new Uint8Array([...bytes.subarray(0,bytes.length-2),...new TextEncoder().encode('private metadata'),255,217]);await bad(verify(concealed));
 let scan=2;while(!(bytes[scan]===255&&bytes[scan+1]===218))scan+=2+((bytes[scan+2]<<8)|bytes[scan+3]);const start=scan+2+((bytes[scan+2]<<8)|bytes[scan+3]);const corrupt=new Uint8Array([...bytes.subarray(0,start),255,217]);await bad(verify(corrupt));
});
test('bounded JPEG marker dimensions and pixel output are independently checked before committing',async()=>{
 const bytes=image();let frame=2;while(!(bytes[frame]===255&&[192,193,194].includes(bytes[frame+1])))frame+=2+((bytes[frame+2]<<8)|bytes[frame+3]);
 const bomb=new Uint8Array(bytes);bomb[frame+7]=255;bomb[frame+8]=255;await bad(verify(bomb));
 await bad(verifyCommunityJpeg(bytes,descriptor(bytes),{...ports,decode:()=>({width:48,height:32,data:new Uint8Array(1)})}));
});
test('vendored decoder provenance is pinned and valid decoded pixels match unchanged upstream',async()=>{
 const upstream=(await readFile(new URL('../node_modules/jpeg-js/lib/decoder.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n'),strict=(await readFile(new URL('../functions/_shared/vendor/jpeg-js-0.4.4-strict.mjs',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
 assert.equal(createHash('sha256').update(upstream).digest('hex'),'a3f175fd6f62d142aad94d3bd90f3a30be4e076baf9b6a6fa31c8e84d9d4aa9f');assert.equal(createHash('sha256').update(strict).digest('hex'),'ef52562bd855357534059b441a93c935270d72c568df5ab4cae1e63ea581c0a0');
 for(const[width,height]of[[1,1],[17,19],[48,32],[128,96]]){const bytes=image(width,height),options={useTArray:true,tolerantDecoding:false,maxResolutionInMP:2.56,maxMemoryUsageInMB:64},a=jpeg.decode(bytes,options),b=strictDecode(bytes,options);assert.deepEqual(b.data,a.data);assert.equal(b.width,a.width);assert.equal(b.height,a.height);await verify(bytes,descriptor(bytes,width,height));}
});

test('independent metadata-free grayscale and progressive codecs decode their actual original pixels',async()=>{
 for(const name of['pillow-gray-96x64.jpg','pillow-progressive-rgb-96x64.jpg']){const bytes=new Uint8Array(await readFile(new URL(`fixtures/community-codec/${name}`,import.meta.url))),options={useTArray:true,tolerantDecoding:false,maxResolutionInMP:2.56,maxMemoryUsageInMB:64};assert.deepEqual(strictDecode(bytes,options).data,jpeg.decode(bytes,options).data);const actual=await verify(bytes,descriptor(bytes,96,64));assert.equal(actual.width,96);assert.equal(actual.height,64);}
});
