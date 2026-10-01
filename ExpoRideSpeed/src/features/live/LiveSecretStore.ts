import type {AuthScope} from '../../state/AuthState';

export type LiveSecretKind='friend'|'code';
export interface SecretStorage{getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<unknown>;removeItem(key:string):Promise<unknown>;}
type Entry={kind:LiveSecretKind;resource:string;hash:string};
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/;
const digest=/^[a-f\d]{64}$/;
const validValue=(kind:LiveSecretKind,value:string)=>kind==='friend'?/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value):/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(value);
const indexKey=(owner:string,bucket:string)=>`ride.live.${owner}.${bucket}.index`;
const itemKey=(owner:string,e:Entry)=>`ride.live.${owner}.${e.kind}.${e.resource}.${e.hash}`;

/** Hash-versioned private bytes. Small bucket manifests fit native Keychain limits. */
export class LiveSecretStore{
 private storage:SecretStorage;
 private isCurrent:(scope:AuthScope)=>boolean;
 private tail:Promise<unknown>=Promise.resolve();
 private closed=new Set<string>();
 constructor(storage:SecretStorage,isCurrent:(scope:AuthScope)=>boolean){this.storage=storage;this.isCurrent=isCurrent;}
 private guard(scope:AuthScope){if(!scope.userId||!uuid.test(scope.userId)||this.closed.has(scope.userId)||!this.isCurrent(scope))throw Error('ACCOUNT_CHANGED');return scope.userId;}
 private async index(owner:string,bucket:string):Promise<Entry[]>{
  const raw=await this.storage.getItem(indexKey(owner,bucket));if(raw===null)return[];
  try{const v:unknown=JSON.parse(raw);if(!Array.isArray(v)||v.length>8)throw Error();const seen=new Set<string>();
   for(const e of v){if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join(',')!=='hash,kind,resource'||!['friend','code'].includes(e.kind)||typeof e.resource!=='string'||!uuid.test(e.resource)||typeof e.hash!=='string'||!digest.test(e.hash)||e.hash[0]!==bucket||seen.has(itemKey(owner,e)))throw Error();seen.add(itemKey(owner,e));}return v;
  }catch{throw Error('LOCAL_READ_FAILED');}
 }
 async put(scope:AuthScope,kind:LiveSecretKind,resource:string,hash:string,value:string):Promise<void>{
  const owner=this.guard(scope);if(!uuid.test(resource)||!digest.test(hash)||!validValue(kind,value))throw Error('LIVE_INVALID');
  const work=this.tail.catch(()=>{}).then(async()=>{this.guard(scope);const entries=await this.index(owner,hash[0]);this.guard(scope);const entry={kind,resource,hash};
   const old=entries.find(e=>e.kind===kind&&e.resource===resource&&e.hash===hash);
   if(!old){const others=(await Promise.all([... '0123456789abcdef'].filter(bucket=>bucket!==hash[0]).map(bucket=>this.index(owner,bucket)))).flat();this.guard(scope);if(entries.length>=8||entries.length+others.length>=64)throw Error('LIVE_CAPACITY');await this.storage.setItem(indexKey(owner,hash[0]),JSON.stringify([...entries,entry]));this.guard(scope);}
   else{const previous=await this.storage.getItem(itemKey(owner,entry));this.guard(scope);if(previous!==null&&previous!==value)throw Error('LIVE_OPERATION_CONFLICT');}
   await this.storage.setItem(itemKey(owner,entry),value);this.guard(scope);
  });this.tail=work;await work;
 }
 async get(scope:AuthScope,kind:LiveSecretKind,resource:string,hash:string):Promise<string|null>{
  const owner=this.guard(scope);if(!uuid.test(resource)||!digest.test(hash))throw Error('LIVE_INVALID');await this.tail.catch(()=>{});this.guard(scope);
  const entries=await this.index(owner,hash[0]);this.guard(scope);const entry=entries.find(e=>e.kind===kind&&e.resource===resource&&e.hash===hash);if(!entry)return null;
  const value=await this.storage.getItem(itemKey(owner,entry));this.guard(scope);if(value!==null&&!validValue(kind,value))throw Error('LOCAL_READ_FAILED');return value;
 }
 async find(scope:AuthScope,kind:LiveSecretKind,resource:string):Promise<{hash:string;value:string}|null>{
  const owner=this.guard(scope);if(!uuid.test(resource))throw Error('LIVE_INVALID');await this.tail.catch(()=>{});this.guard(scope);
  const all=(await Promise.all([... '0123456789abcdef'].map(bucket=>this.index(owner,bucket)))).flat();this.guard(scope);
  const found=all.filter(e=>e.kind===kind&&e.resource===resource);if(found.length!==1)return null;
  const value=await this.get(scope,kind,resource,found[0].hash);return value===null?null:{hash:found[0].hash,value};
 }
 async removeOwner(owner:string):Promise<void>{
  if(!uuid.test(owner))throw Error('LIVE_INVALID');this.closed.add(owner);
  const work=this.tail.catch(()=>{}).then(async()=>{for(const bucket of '0123456789abcdef'){const entries=await this.index(owner,bucket);for(const entry of entries)await this.storage.removeItem(itemKey(owner,entry));await this.storage.removeItem(indexKey(owner,bucket));}});
  this.tail=work;await work;
 }
}
