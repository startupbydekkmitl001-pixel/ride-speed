import {CryptoDigestAlgorithm,digestStringAsync} from 'expo-crypto';
import {isAccountCurrent} from '../../state/AuthState';
import {RaceEvidenceStore} from './RaceEvidenceStore';
import {raceEvidenceDisk} from './evidenceDisk';
export const raceEvidenceStorage=new RaceEvidenceStore({current:isAccountCurrent,sha256:text=>digestStringAsync(CryptoDigestAlgorithm.SHA256,text),disk:raceEvidenceDisk});
