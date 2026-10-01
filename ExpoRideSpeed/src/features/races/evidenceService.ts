import type {Session} from '@supabase/supabase-js';
import {CryptoDigestAlgorithm,digestStringAsync} from 'expo-crypto';
import {accountClient,isAccountCurrent,type AuthScope} from '../../state/AuthState';
import type {RaceEvidenceReference} from './RaceEvidenceStore';
import type {EvidenceReservation} from './types';
import {parseEvidenceReferences} from './evidenceReferences';
import {isRaceId} from './model';

function guard(scope:AuthScope,session:Session){if(!scope.userId||session.user.id!==scope.userId||!isAccountCurrent(scope))throw Error('ACCOUNT_CHANGED');}
function missing(error:unknown){return !!error&&typeof error==='object'&&'statusCode'in error&&String(error.statusCode)==='404';}
function matches(scope:AuthScope,ref:RaceEvidenceReference,reservation:EvidenceReservation){
 parseEvidenceReferences([ref]);if(ref.owner_id!==scope.userId)throw Error('ACCOUNT_CHANGED');
 if(reservation.bucket!=='ride-race-evidence'||reservation.path!==`${scope.userId}/${ref.attempt_id}/route-time-v1.json`||reservation.attempt_id!==ref.attempt_id||reservation.capture_id!==ref.capture_id||reservation.sha256!==ref.sha256||reservation.byte_length!==ref.byte_length||reservation.first_sequence!==ref.first_sequence||reservation.last_sequence!==ref.last_sequence||reservation.sample_count!==ref.sample_count)throw Error('RACE_EVIDENCE_BOUND');
}
/** Upload only already-frozen owner bytes. Recover lost acknowledgements by
 * comparing the complete existing object; never overwrite an attempt object. */
export async function uploadRaceEvidence(scope:AuthScope,session:Session,reference:RaceEvidenceReference,reservation:EvidenceReservation,text:string,callerGuard:()=>void):Promise<void>{
 const current=()=>{guard(scope,session);callerGuard();};
 current();matches(scope,reference,reservation);const bytes=new TextEncoder().encode(text);if(bytes.byteLength!==reference.byte_length||await digestStringAsync(CryptoDigestAlgorithm.SHA256,text)!==reference.sha256)throw Error('RACE_EVIDENCE_UNAVAILABLE');current();
 const files=accountClient(scope,session).storage.from(reservation.bucket);
 const inspect=async()=>{current();const {data,error}=await files.info(reservation.path);current();if(error){if(missing(error))return false;throw Error('RACE_UNAVAILABLE');}
  if(!data||data.size!==bytes.byteLength||data.contentType!=='application/json')throw Error('RACE_EVIDENCE_BOUND');
  current();const response=await files.download(reservation.path);current();if(response.error||!response.data||response.data.size!==bytes.byteLength)throw Error('RACE_EVIDENCE_BOUND');
  const existing=new Uint8Array(await response.data.arrayBuffer());current();if(existing.length!==bytes.length||existing.some((v,i)=>v!==bytes[i]))throw Error('RACE_EVIDENCE_BOUND');return true;
 };
 if(await inspect())return;current();
 const {error}=await files.upload(reservation.path,bytes.buffer,{contentType:'application/json',upsert:false,cacheControl:'0'});current();
 // Even a successful response is followed by exact-object confirmation. An
 // unknown network result may already have created the immutable object.
 if(await inspect())return;if(error)throw Error('RACE_UNAVAILABLE');throw Error('RACE_EVIDENCE_UNAVAILABLE');
}
/** Edge response is transport acknowledgement only. Parent re-reads its own
 * canonical attempt before displaying verification or terminal state. */
export async function requestRaceVerification(scope:AuthScope,session:Session,attemptId:string,callerGuard:()=>void):Promise<void>{
 guard(scope,session);callerGuard();if(!isRaceId(attemptId))throw Error('RACE_INVALID');const client=accountClient(scope,session);
 const {error}=await client.functions.invoke('verify-race-attempt',{body:{attempt_id:attemptId}});guard(scope,session);callerGuard();if(error)throw Error('RACE_UNAVAILABLE');
}
