/** Bounded actual-pixel validation. Decoder/crypto ports are pinned by the Edge. */
export class CommunityJpegError extends Error{constructor(){super('COMMUNITY_MEDIA_INVALID');this.code='COMMUNITY_MEDIA_INVALID';}}
const fail=()=>{throw new CommunityJpegError();},maxBytes=1048576,maxEdge=1600,alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
function validBlurhash(value){if(value===null)return true;if(typeof value!=='string'||value.length<6||value.length>166||[...value].some(x=>!alphabet.includes(x)))return false;const size=alphabet.indexOf(value[0]);return size<=80&&value.length===4+2*((size%9)+1)*(Math.floor(size/9)+1);}
function descriptor(value){
 const keys=['mime','sha256','byte_count','width','height','blurhash'];if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(x=>!(x in value)))fail();
 if(value.mime!=='image/jpeg'||typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256)||!Number.isInteger(value.byte_count)||value.byte_count<1||value.byte_count>maxBytes||!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<1||value.height<1||value.width>maxEdge||value.height>maxEdge||!validBlurhash(value.blurhash))fail();return value;
}
/** Frames/metadata are constrained before entropy decoding; this is not itself a pixel proof. */
export function inspectCommunityJpeg(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<20||bytes.length>maxBytes||bytes[0]!==255||bytes[1]!==216)fail();
 let offset=2,frame=null,scans=0,markers=0,ended=false;
 const u16=index=>(bytes[index]<<8)|bytes[index+1];
 while(offset<bytes.length){
  if(bytes[offset++]!==255)fail();while(bytes[offset]===255)offset++;if(offset>=bytes.length)fail();const marker=bytes[offset++];if(++markers>256)fail();
  if(marker===217){if(offset!==bytes.length||!frame||scans<1)fail();ended=true;break;}
  if([0,216,1].includes(marker)||(marker>=208&&marker<=215)||offset+2>bytes.length)fail();const length=u16(offset);if(length<2||offset+length>bytes.length)fail();const start=offset+2,end=offset+length;offset=end;
  if(marker===224){
   // Fixed JFIF colour/density header, no embedded thumbnail or arbitrary data.
   if(length!==16||String.fromCharCode(...bytes.subarray(start,start+5))!=='JFIF\0'||bytes[start+5]!==1||bytes[start+6]>2||bytes[start+7]>2||u16(start+8)<1||u16(start+10)<1||bytes[start+12]!==0||bytes[start+13]!==0)fail();
  }else if(marker===238){
   if(length!==14||String.fromCharCode(...bytes.subarray(start,start+5))!=='Adobe'||u16(start+5)!==100||u16(start+7)!==0||u16(start+9)!==0||bytes[start+11]>1)fail();
  }else if([192,193,194].includes(marker)){
   if(frame||length<8||bytes[start]!==8)fail();const height=u16(start+1),width=u16(start+3),components=bytes[start+5];if(![1,3].includes(components)||length!==8+3*components||width<1||height<1||width>maxEdge||height>maxEdge)fail();
   const ids=new Set();for(let n=0;n<components;n++){const p=start+6+3*n,id=bytes[p],sampling=bytes[p+1];if(ids.has(id)||(sampling>>4)<1||(sampling>>4)>2||(sampling&15)<1||(sampling&15)>2||bytes[p+2]>3)fail();ids.add(id);}frame={width,height};
  }else if([219,196,221].includes(marker)){
   if(marker===221&&length!==4)fail();
  }else if(marker===218){
   if(!frame||++scans>16||length<6)fail();const components=bytes[start];if(![1,2,3].includes(components)||length!==6+2*components)fail();let entropy=0;
   while(offset<bytes.length){if(bytes[offset]!==255){offset++;entropy++;continue;}let next=offset+1;while(bytes[next]===255)next++;if(next>=bytes.length)fail();const code=bytes[next];if(code===0||(code>=208&&code<=215)){offset=next+1;entropy++;continue;}break;}
   if(entropy<1)fail();
  }else fail(); // Includes EXIF/XMP/ICC/APP13/COM and unreviewed encodings.
 }
 if(!ended)fail();return frame;
}
export async function verifyCommunityJpeg(bytes,declared,{decode,encodeBlurhash,digest}){
 const expected=descriptor(declared);if(!(bytes instanceof Uint8Array)||bytes.length!==expected.byte_count)fail();const header=inspectCommunityJpeg(bytes);if(header.width!==expected.width||header.height!==expected.height)fail();
 const actualDigest=await digest(bytes);if(actualDigest!==expected.sha256)fail();let pixels;
 try{pixels=decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:2.56,maxMemoryUsageInMB:64});}catch{fail();}
 if(!pixels||pixels.width!==header.width||pixels.height!==header.height||!(pixels.data instanceof Uint8Array)||pixels.data.byteLength!==4*header.width*header.height)fail();
 // Bounded nearest-pixel sampling is derived from actual decoded output; no
 // client placeholder or metadata is reused as validation authority.
 const width=Math.min(32,pixels.width),height=Math.min(32,pixels.height),small=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const source=4*(Math.min(pixels.height-1,Math.floor((y+.5)*pixels.height/height))*pixels.width+Math.min(pixels.width-1,Math.floor((x+.5)*pixels.width/width))),target=4*(y*width+x);small.set(pixels.data.subarray(source,source+4),target);}
 let blurhash;try{blurhash=encodeBlurhash(small,width,height,3,2);}catch{fail();}if(!validBlurhash(blurhash))fail();
 return{mime:'image/jpeg',sha256:actualDigest,byte_count:bytes.length,width:header.width,height:header.height,blurhash};
}
