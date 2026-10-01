import type { JournalPort } from './journalPort.types';
import { persistedRide,restoreFragments,type JournalReceipt,type JournalRide } from './journalModel';
let database:Promise<IDBDatabase>|null=null;
const open=()=>database??=new Promise<IDBDatabase>((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(Error('JOURNAL_UNAVAILABLE'));return;}
 const request=indexedDB.open('ride-journal-v5',1);
 request.onupgradeneeded=()=>{const db=request.result;const rides=db.createObjectStore('rides',{keyPath:'id'});rides.createIndex('owner','ownerId');const receipts=db.createObjectStore('receipts',{keyPath:['ride','seq']});receipts.createIndex('ride','ride');};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=null;reject(request.error);};
});
const done=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error??Error('JOURNAL_WRITE_FAILED'));});
const read=<T,>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
export const journalPort:JournalPort={
 async save(ride,receipt){const tx=(await open()).transaction(['rides','receipts'],'readwrite');const completion=done(tx);void completion.catch(()=>{});const request=tx.objectStore('rides').get(ride.id);request.onsuccess=()=>{const old=request.result as JournalRide|undefined;if(old&&old.ownerId!==ride.ownerId){tx.abort();return;}tx.objectStore('rides').put(persistedRide(ride));if(receipt)tx.objectStore('receipts').put({...receipt,ride:ride.id});};await completion;},
 async list(owner){const db=await open();const tx=db.transaction('rides','readonly');const rides=(await read<JournalRide[]>(tx.objectStore('rides').index('owner').getAll(owner))).sort((a,b)=>b.startedAtMs-a.startedAtMs).slice(0,500);for(const ride of rides)if(ride.status==='recording'){const rtx=db.transaction('receipts','readonly');restoreFragments(ride,await read<JournalReceipt[]>(rtx.objectStore('receipts').index('ride').getAll(ride.id)));}return rides;},
 async get(owner,id){const tx=(await open()).transaction('rides','readonly');const ride=await read<JournalRide|undefined>(tx.objectStore('rides').get(id));return ride?.ownerId===owner?ride:null;},
 async receipts(owner,id,capture){const tx=(await open()).transaction(['rides','receipts'],'readonly');const ride=await read<JournalRide|undefined>(tx.objectStore('rides').get(id));if(ride?.ownerId!==owner)return [];return (await read<(JournalReceipt&{ride:string})[]>(tx.objectStore('receipts').index('ride').getAll(id))).filter(r=>r.captureId===capture).sort((a,b)=>a.seq-b.seq).slice(0,8001);},
 async removeOwner(owner){const db=await open();const tx=db.transaction(['rides','receipts'],'readwrite');const completion=done(tx);const cursor=tx.objectStore('rides').index('owner').openCursor(owner);cursor.onsuccess=()=>{const rideCursor=cursor.result;if(!rideCursor)return;const id=rideCursor.primaryKey;rideCursor.delete();const samples=tx.objectStore('receipts').index('ride').openCursor(id);samples.onsuccess=()=>{const c=samples.result;if(c){c.delete();c.continue();}};rideCursor.continue();};await completion;},
};
