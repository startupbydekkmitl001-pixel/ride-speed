import type {RaceEvidenceDisk} from './RaceEvidenceStore';
let database:Promise<IDBDatabase>|null=null;
const valid=(v:string)=>/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(v);
const guard=(owner:string,attempt?:string)=>{if(!valid(owner)||attempt!==undefined&&!valid(attempt))throw Error('RACE_EVIDENCE_UNAVAILABLE');};
const open=()=>database??=new Promise<IDBDatabase>((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(Error('LOCAL_READ_FAILED'));return;}const request=indexedDB.open('ride-race-evidence-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('evidence',{keyPath:['owner','attempt']}).createIndex('owner','owner');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=null;reject(request.error);};});
const done=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error??Error('LOCAL_WRITE_FAILED'));});
export const raceEvidenceDisk:RaceEvidenceDisk={
 async read(owner,attempt){guard(owner,attempt);const tx=(await open()).transaction('evidence','readonly');return new Promise((resolve,reject)=>{const request=tx.objectStore('evidence').get([owner,attempt]);request.onsuccess=()=>resolve(request.result?.text??null);request.onerror=()=>reject(request.error);});},
 async writeNew(owner,attempt,text){guard(owner,attempt);const tx=(await open()).transaction('evidence','readwrite'),completion=done(tx);tx.objectStore('evidence').add({owner,attempt,text});await completion;},
 async removeOwner(owner){guard(owner);const tx=(await open()).transaction('evidence','readwrite'),completion=done(tx),request=tx.objectStore('evidence').index('owner').openCursor(owner);request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};await completion;},
 async removeAttempt(owner,attempt){guard(owner,attempt);const tx=(await open()).transaction('evidence','readwrite'),completion=done(tx);tx.objectStore('evidence').delete([owner,attempt]);await completion;},
};
