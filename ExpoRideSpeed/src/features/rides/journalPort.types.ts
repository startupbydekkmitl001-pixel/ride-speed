import type { JournalReceipt,JournalRide } from './journalModel';
export interface JournalPort {
 save(ride:JournalRide,receipt?:JournalReceipt):Promise<void>;
 list(owner:string):Promise<JournalRide[]>;
 get(owner:string,id:string):Promise<JournalRide|null>;
 receipts(owner:string,id:string,captureId:string):Promise<JournalReceipt[]>;
 removeOwner(owner:string):Promise<void>;
}
