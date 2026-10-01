import type {AuthScope} from '../../state/AuthState';
import type {FrozenRaceEvidence} from './evidenceModel';
export type RaceEvidenceReference={owner_id:string;attempt_id:string;race_id:string;ride_id:string;capture_id:string;sha256:string;byte_length:number;first_sequence:number;last_sequence:number;sample_count:number};
export interface RaceEvidenceDisk{read(owner:string,attempt:string):Promise<string|null>;writeNew(owner:string,attempt:string,text:string):Promise<void>;removeAttempt(owner:string,attempt:string):Promise<void>;removeOwner(owner:string):Promise<void>}
export type RaceEvidenceStorePort={current:(scope:AuthScope)=>boolean;sha256:(text:string)=>Promise<string>;disk:RaceEvidenceDisk};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(v);
const fail=():never=>{throw Error('RACE_EVIDENCE_UNAVAILABLE');};
const bytes=(text:string)=>new TextEncoder().encode(text).byteLength;
function header(text:string){if(typeof text!=='string'||text.length>2097152||bytes(text)>2097152)fail();let v;try{v=JSON.parse(text);}catch{fail();}if(!v||typeof v!=='object'||Array.isArray(v)||![v.race_id,v.attempt_id,v.ride_id,v.capture_id].every(id)||!Number.isSafeInteger(v.first_sequence)||v.first_sequence<0||!Number.isSafeInteger(v.last_sequence)||v.last_sequence<v.first_sequence||!Array.isArray(v.samples)||v.samples.length<4||v.samples.length>8000||v.last_sequence-v.first_sequence+1!==v.samples.length||v.samples.some((r:{sequence?:unknown},i:number)=>!r||r.sequence!==v.first_sequence+i))fail();return {attempt_id:v.attempt_id as string,race_id:v.race_id as string,ride_id:v.ride_id as string,capture_id:v.capture_id as string,first_sequence:v.first_sequence as number,last_sequence:v.last_sequence as number,sample_count:v.samples.length as number,byte_length:bytes(text)};}
/** Serialized owner files are immutable across upload response loss and app restart. */
export class RaceEvidenceStore {
 private tail:Promise<unknown>=Promise.resolve();private closed=new Set<string>();private port:RaceEvidenceStorePort;
 constructor(port:RaceEvidenceStorePort){this.port=port;}
 private owner(scope:AuthScope){if(!scope.userId||!id(scope.userId)||!this.port.current(scope)||this.closed.has(scope.userId))throw Error('ACCOUNT_CHANGED');return scope.userId;}
 private enqueue<T>(action:()=>Promise<T>){const task=this.tail.catch(()=>{}).then(action);this.tail=task.catch(()=>{});return task;}
 put(scope:AuthScope,attempt:string,value:FrozenRaceEvidence):Promise<RaceEvidenceReference>{return this.enqueue(async()=>{
  const owner=this.owner(scope),head=header(value.text);if(!id(attempt)||head.attempt_id!==attempt||head.byte_length!==value.byteLength||head.first_sequence!==value.firstSequence||head.last_sequence!==value.lastSequence||head.sample_count!==value.sampleCount)fail();
  const sha256=await this.port.sha256(value.text);this.owner(scope);if(!/^[a-f\d]{64}$/.test(sha256))fail();
  const existing=await this.port.disk.read(owner,attempt);this.owner(scope);if(existing!==null&&existing!==value.text)throw Error('RACE_EVIDENCE_BOUND');
  if(existing===null){await this.port.disk.writeNew(owner,attempt,value.text);this.owner(scope);}
  const saved=await this.port.disk.read(owner,attempt);this.owner(scope);if(saved!==value.text)throw Error('LOCAL_WRITE_FAILED');
  return Object.freeze({owner_id:owner,...head,sha256});
 });}
 read(scope:AuthScope,reference:RaceEvidenceReference):Promise<string>{return this.enqueue(async()=>{
  const owner=this.owner(scope);if(reference.owner_id!==owner)throw Error('ACCOUNT_CHANGED');if(!id(reference.attempt_id)||!/^[a-f\d]{64}$/.test(reference.sha256)||!Number.isSafeInteger(reference.byte_length)||reference.byte_length<1||reference.byte_length>2097152)fail();
  const text=await this.port.disk.read(owner,reference.attempt_id);this.owner(scope);if(text===null)return fail();const head=header(text);
  if(Object.entries(head).some(([key,value])=>reference[key as keyof RaceEvidenceReference]!==value))fail();const digest=await this.port.sha256(text);this.owner(scope);if(digest!==reference.sha256)fail();return text;
 });}
 /** Parent requires canonical terminal proof and no unresolved evidence operation. */
 removeTerminal(scope:AuthScope,reference:RaceEvidenceReference):Promise<void>{return this.enqueue(async()=>{const owner=this.owner(scope);if(reference.owner_id!==owner||!id(reference.attempt_id))throw Error('ACCOUNT_CHANGED');await this.port.disk.removeAttempt(owner,reference.attempt_id);this.owner(scope);});}
 /** Call only after confirmed account deletion. Closure precedes held filesystem writes. */
 closeOwner(scope:AuthScope):Promise<void>{if(!scope.userId||!id(scope.userId))return Promise.reject(Error('ACCOUNT_CHANGED'));const owner=scope.userId;this.closed.add(owner);return this.enqueue(()=>this.port.disk.removeOwner(owner));}
}
