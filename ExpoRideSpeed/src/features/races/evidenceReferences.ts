import type {RaceEvidenceReference} from './RaceEvidenceStore';
const keys=['owner_id','attempt_id','race_id','ride_id','capture_id','sha256','byte_length','first_sequence','last_sequence','sample_count'];
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(v);
/** Bounded immutable metadata only. Raw positions remain in the private file. */
export function parseEvidenceReferences(value:unknown):RaceEvidenceReference[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>32)throw Error('RACE_EVIDENCE_UNAVAILABLE');
 const attempts=new Set<string>();
 return value.map(row=>{if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==keys.length||keys.some(k=>!Object.hasOwn(row,k)))throw Error('RACE_EVIDENCE_UNAVAILABLE');
  for(const key of ['owner_id','attempt_id','race_id','ride_id','capture_id'])if(!uuid(row[key]))throw Error('RACE_EVIDENCE_UNAVAILABLE');
  if(!/^[a-f\d]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.byte_length)||row.byte_length<1||row.byte_length>2097152||!Number.isSafeInteger(row.first_sequence)||row.first_sequence<0||!Number.isSafeInteger(row.last_sequence)||!Number.isSafeInteger(row.sample_count)||row.sample_count<4||row.sample_count>8000||row.last_sequence-row.first_sequence+1!==row.sample_count||attempts.has(row.attempt_id))throw Error('RACE_EVIDENCE_UNAVAILABLE');
  attempts.add(row.attempt_id);return {...row} as RaceEvidenceReference;
 });
}
