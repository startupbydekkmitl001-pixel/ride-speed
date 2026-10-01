import type {AuthScope} from '../../state/AuthState';
import {validPhotoDescriptor,type CommunityPhotoDescriptor} from './content';
import {isCommunityId} from './model';
export type CommunityPhotoKey=Readonly<{post_id:string;media_id:string}>;
export interface CommunityPhotoDisk{
 read(owner:string,key:CommunityPhotoKey):Promise<Uint8Array|null>;
 list(owner:string):Promise<readonly CommunityPhotoKey[]>;
 writeNew(owner:string,key:CommunityPhotoKey,bytes:Uint8Array):Promise<void>;
 remove(owner:string,key:CommunityPhotoKey):Promise<void>;
 removeOwner(owner:string):Promise<void>;
}
type Port={current:(scope:AuthScope)=>boolean;disk:CommunityPhotoDisk;sha256:(bytes:Uint8Array)=>Promise<string>};
const fail=():never=>{throw Error('COMMUNITY_PHOTO_INVALID');};
const keyOf=(key:CommunityPhotoKey)=>{if(!key||!isCommunityId(key.post_id)||!isCommunityId(key.media_id))fail();return Object.freeze({post_id:key.post_id,media_id:key.media_id});};
/** Immutable app-private bytes. Neither picker URIs nor signed URLs enter account JSON. */
export class CommunityPhotoStore{
 private tail:Promise<unknown>=Promise.resolve();private closed=new Set<string>();
 constructor(private port:Port){}
 private owner(scope:AuthScope,guard:()=>void){guard();if(!scope.userId||!isCommunityId(scope.userId)||!this.port.current(scope)||this.closed.has(scope.userId))throw Error('ACCOUNT_CHANGED');return scope.userId;}
 private run<T>(work:()=>Promise<T>){const task=this.tail.catch(()=>{}).then(work);this.tail=task.catch(()=>{});return task;}
 private async check(scope:AuthScope,bytes:Uint8Array,descriptor:CommunityPhotoDescriptor,guard:()=>void){this.owner(scope,guard);if(!(bytes instanceof Uint8Array)||!validPhotoDescriptor(descriptor)||bytes.byteLength!==descriptor.byte_count)fail();const digest=await this.port.sha256(bytes);this.owner(scope,guard);if(digest!==descriptor.sha256)fail();}
 private async putBytes(scope:AuthScope,capturedKey:CommunityPhotoKey,captured:Uint8Array,expected:CommunityPhotoDescriptor,guard:()=>void){
   const owner=this.owner(scope,guard);await this.check(scope,captured,expected,guard);const existing=await this.port.disk.read(owner,capturedKey);this.owner(scope,guard);
   if(existing!==null){await this.check(scope,existing,expected,guard);return;}
   const keys=await this.port.disk.list(owner);this.owner(scope,guard);if(keys.length>=24)throw Error('COMMUNITY_CAPACITY');
   await this.port.disk.writeNew(owner,capturedKey,captured);this.owner(scope,guard);const saved=await this.port.disk.read(owner,capturedKey);this.owner(scope,guard);if(saved===null)throw Error('LOCAL_WRITE_FAILED');await this.check(scope,saved,expected,guard);
 }
 put(scope:AuthScope,key:CommunityPhotoKey,bytes:Uint8Array,descriptor:CommunityPhotoDescriptor,guard=()=>{}):Promise<void>{
  const capturedKey=keyOf(key),captured=Uint8Array.from(bytes),expected=Object.freeze({...descriptor});
  return this.run(()=>this.putBytes(scope,capturedKey,captured,expected,guard));
 }
 /** Hold the byte lane through the owner's durable metadata adoption. An
  * ambiguous callback failure must preserve bytes; metadata may already refer
  * to them. The parent can prune after a successful metadata flush. */
 putAndAdopt(scope:AuthScope,key:CommunityPhotoKey,bytes:Uint8Array,descriptor:CommunityPhotoDescriptor,adopt:()=>Promise<void>,guard=()=>{}):Promise<void>{
  const capturedKey=keyOf(key),captured=Uint8Array.from(bytes),expected=Object.freeze({...descriptor});
  return this.run(async()=>{await this.putBytes(scope,capturedKey,captured,expected,guard);this.owner(scope,guard);await adopt();this.owner(scope,guard);});
 }
 /** Called only after owner metadata is durably readable. Adoption shares this
  * lane, and fresh references are checked immediately before every unlink. */
 prune(scope:AuthScope,readReferences:()=>readonly CommunityPhotoKey[],guard=()=>{}):Promise<void>{
  return this.run(async()=>{const owner=this.owner(scope,guard),listed=await this.port.disk.list(owner);this.owner(scope,guard);const keys=listed.map(keyOf);
   for(const key of keys){this.owner(scope,guard);const references=readReferences();this.owner(scope,guard);if(!Array.isArray(references)||references.length>24)fail();const fresh=references.map(keyOf);
    if(fresh.some(ref=>ref.post_id===key.post_id&&ref.media_id===key.media_id))continue;
    this.owner(scope,guard);await this.port.disk.remove(owner,key);this.owner(scope,guard);
   }
  });
 }
 read(scope:AuthScope,key:CommunityPhotoKey,descriptor:CommunityPhotoDescriptor,guard=()=>{}):Promise<Uint8Array>{const capturedKey=keyOf(key),expected=Object.freeze({...descriptor});return this.run(async()=>{const owner=this.owner(scope,guard),bytes=await this.port.disk.read(owner,capturedKey);this.owner(scope,guard);if(bytes===null)throw Error('COMMUNITY_PHOTO_UNAVAILABLE');await this.check(scope,bytes,expected,guard);return Uint8Array.from(bytes);});}
 remove(scope:AuthScope,key:CommunityPhotoKey,guard=()=>{}):Promise<void>{const capturedKey=keyOf(key);return this.run(async()=>{const owner=this.owner(scope,guard);await this.port.disk.remove(owner,capturedKey);this.owner(scope,guard);});}
 /** Closure happens synchronously; held writes drain before confirmed account removal. */
 closeOwner(scope:AuthScope):Promise<void>{if(!scope.userId||!isCommunityId(scope.userId))return Promise.reject(Error('ACCOUNT_CHANGED'));const owner=scope.userId;this.closed.add(owner);return this.run(()=>this.port.disk.removeOwner(owner));}
}
