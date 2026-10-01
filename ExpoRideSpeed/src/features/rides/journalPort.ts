import * as SQLite from 'expo-sqlite';
import type { JournalPort } from './journalPort.types';
import { persistedRide,restoreFragments,type JournalRide,type JournalReceipt } from './journalModel';
let database:Promise<SQLite.SQLiteDatabase>|null=null;
const open=()=>database??=(async()=>{
 const db=await SQLite.openDatabaseAsync('ride-journal-v5.db');
 await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS rides (id TEXT PRIMARY KEY, owner TEXT NOT NULL, started REAL NOT NULL, body TEXT NOT NULL); CREATE INDEX IF NOT EXISTS rides_owner ON rides(owner,started DESC); CREATE TABLE IF NOT EXISTS receipts (ride TEXT NOT NULL REFERENCES rides(id) ON DELETE CASCADE, seq INTEGER NOT NULL, capture TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(ride,seq)); CREATE INDEX IF NOT EXISTS capture_receipts ON receipts(ride,capture,seq);');return db;
})().catch(error=>{database=null;throw error;});
export const journalPort:JournalPort={
 async save(ride,receipt){const db=await open();await db.withExclusiveTransactionAsync(async txn=>{
  const saved=await txn.runAsync('INSERT INTO rides(id,owner,started,body) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET started=excluded.started,body=excluded.body WHERE rides.owner=excluded.owner',ride.id,ride.ownerId,ride.startedAtMs,JSON.stringify(persistedRide(ride)));
  if(saved.changes!==1)throw Error('JOURNAL_OWNER_CONFLICT');
  if(receipt)await txn.runAsync('INSERT INTO receipts(ride,seq,capture,body) VALUES(?,?,?,?) ON CONFLICT(ride,seq) DO NOTHING',ride.id,receipt.seq,receipt.captureId,JSON.stringify(receipt));
 });},
 async list(owner){const db=await open();const rides:JournalRide[]=(await db.getAllAsync<{body:string}>('SELECT body FROM rides WHERE owner=? ORDER BY started DESC LIMIT 500',owner)).map(row=>JSON.parse(row.body));for(const ride of rides)if(ride.status==='recording'){const rows=await db.getAllAsync<{body:string}>('SELECT body FROM receipts WHERE ride=? ORDER BY seq',ride.id);restoreFragments(ride,rows.map(row=>JSON.parse(row.body) as JournalReceipt));}return rides;},
 async get(owner,id){const rows=await (await open()).getAllAsync<{body:string}>('SELECT body FROM rides WHERE owner=? AND id=? LIMIT 1',owner,id);return rows[0]?JSON.parse(rows[0].body):null;},
 async receipts(owner,id,capture){return (await (await open()).getAllAsync<{body:string}>('SELECT receipts.body FROM receipts JOIN rides ON rides.id=receipts.ride WHERE rides.owner=? AND rides.id=? AND receipts.capture=? ORDER BY seq LIMIT 8001',owner,id,capture)).map(row=>JSON.parse(row.body));},
 async removeOwner(owner){await (await open()).withExclusiveTransactionAsync(async txn=>{await txn.runAsync('DELETE FROM rides WHERE owner=?',owner);});},
};
