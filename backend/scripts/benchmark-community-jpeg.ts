// Local decoder bound only; never reads credentials or contacts an app project.
import jpeg from 'npm:jpeg-js@0.4.4';
import {encode} from 'npm:blurhash@2.0.5';
import {decode} from '../functions/_shared/vendor/jpeg-js-0.4.4-strict.mjs';
import {inspectCommunityJpeg,verifyCommunityJpeg} from '../functions/_shared/community-jpeg.mjs';
let width=1600,height=1600,bytes:Uint8Array;
if(Deno.args.length){bytes=await Deno.readFile(Deno.args[0]);const header=inspectCommunityJpeg(bytes);if(!header)throw Error('Invalid benchmark image');({width,height}=header);}
else{const pixels=new Uint8Array(width*height*4);let random=0x12345678;
 for(let p=0;p<pixels.length;p+=4){for(let c=0;c<3;c++){random^=random<<13;random^=random>>>17;random^=random<<5;pixels[p+c]=random&255;}pixels[p+3]=255;}
 bytes=new Uint8Array(jpeg.encode({width,height,data:pixels},20).data);
}
if(bytes.byteLength>1048576)throw Error('Benchmark image must satisfy actual1MiB limit');
const digest=async(value:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value as BufferSource)),x=>x.toString(16).padStart(2,'0')).join('');
const declared={mime:'image/jpeg',sha256:await digest(bytes),byte_count:bytes.length,width,height,blurhash:null},before=Deno.memoryUsage(),started=performance.now();
const result=await verifyCommunityJpeg(bytes,declared,{decode,encodeBlurhash:encode,digest});const elapsed=performance.now()-started,after=Deno.memoryUsage();
console.log(JSON.stringify({width,height,byte_count:bytes.length,validation_ms:Number(elapsed.toFixed(2)),heap_delta_mib:Number(((after.heapUsed-before.heapUsed)/1048576).toFixed(2)),rss_mib:Number((after.rss/1048576).toFixed(2)),blurhash_length:result.blurhash.length,hosted_proven:false}));
if(elapsed>1000||after.rss>256*1048576)throw Error('Local one-photo CPU/memory gate failed');
