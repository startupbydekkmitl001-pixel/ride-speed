// Shared by the real Edge handlers and Node boundary tests. No service secrets.
export class RequestError extends Error {
  constructor(status, code) { super(code); this.status=status; this.code=code; }
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function objectBody(req) {
  if(!req.body) throw new RequestError(400,'INVALID_REQUEST');
  const reader=req.body.getReader(),chunks=[];let bytes=0;
  while(true){
    const {done,value}=await reader.read();if(done)break;
    bytes+=value.byteLength;
    if(bytes>4096){await reader.cancel();throw new RequestError(413,'REQUEST_TOO_LARGE');}
    chunks.push(value);
  }
  const buffer=new Uint8Array(bytes);let offset=0;
  for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
  let body;
  try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw new RequestError(400,'INVALID_REQUEST');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new RequestError(400,'INVALID_REQUEST');
  return body;
}
export async function readDeletionRequest(req) {
  const body=await objectBody(req);
  if(Object.keys(body).length!==2||body.confirmation!=='DELETE'||typeof body.requestId!=='string'||!uuid.test(body.requestId))throw new RequestError(400,'INVALID_REQUEST');
  return {confirmation:'DELETE',requestId:body.requestId.toLowerCase()};
}
export async function readAvatarRequest(req) {
  const body=await objectBody(req),keys=Object.keys(body);
  if(keys.length===0)return {};
  if(keys.length!==1||keys[0]!=='userId'||typeof body.userId!=='string'||!uuid.test(body.userId))throw new RequestError(400,'INVALID_REQUEST');
  return {userId:body.userId.toLowerCase()};
}
