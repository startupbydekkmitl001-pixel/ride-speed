import {Directory,File,Paths} from 'expo-file-system';
import {randomUUID} from 'expo-crypto';
import type {RaceEvidenceDisk} from './RaceEvidenceStore';
const valid=(value:string)=>/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(value);
function directory(owner:string){if(!valid(owner))throw Error('ACCOUNT_CHANGED');return new Directory(Paths.document,'ride-race-evidence-v1',owner);}
function file(owner:string,attempt:string){if(!valid(attempt))throw Error('RACE_EVIDENCE_UNAVAILABLE');return new File(directory(owner),`${attempt}.json`);}
/** App-private Documents; file sharing stays disabled in the native configuration. */
export const raceEvidenceDisk:RaceEvidenceDisk={
 async read(owner,attempt){const target=file(owner,attempt);if(!target.exists)return null;if(target.size<1||target.size>2097152)throw Error('RACE_EVIDENCE_UNAVAILABLE');return target.text();},
 async writeNew(owner,attempt,text){const dir=directory(owner),target=file(owner,attempt);dir.create({idempotent:true,intermediates:true});if(target.exists)throw Error('RACE_EVIDENCE_BOUND');const partialName=`${attempt}.${randomUUID()}.partial`,temp=new File(dir,partialName),cleanup=new File(dir,partialName);try{temp.create({overwrite:false});temp.write(text);await temp.move(target,{overwrite:false});}finally{if(cleanup.exists)cleanup.delete();}},
 async removeOwner(owner){const dir=directory(owner);if(dir.exists)dir.delete();},
 async removeAttempt(owner,attempt){const target=file(owner,attempt);if(target.exists)target.delete();},
};
