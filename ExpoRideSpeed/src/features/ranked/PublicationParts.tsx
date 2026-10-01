import {Button,Note,Panel,T} from '../../components/ui';
import type {PublicationBasePort,PublicationTranslator} from './publicationUITypes';
export function publicationError(code:string|null,t:PublicationTranslator){if(!code)return null;const key=code.includes('LOCAL_')?'errorStorage':code==='RANKED_RATE_LIMITED'?'errorRate':code==='RANKED_COURSE_UNAVAILABLE'?'errorCourse':['RANKED_CHANGED','ACCOUNT_CHANGED','RANKED_PUBLICATION_CHANGED','RANKED_RECORD_UNAVAILABLE'].includes(code)?'errorChanged':'errorUnavailable';return t(`rankedPub.${key}`);}
export function PublicationStatus({port,t,error,onRetry}:{port:PublicationBasePort;t:PublicationTranslator;error:string|null;onRetry:()=>void}){return <>
 {port.gate.moving?<Note>{t('rankedPub.moving')}</Note>:null}{!port.gate.online?<Note>{t('rankedPub.offline')}</Note>:null}
 {error||port.error?<Note error>{publicationError(error??port.error,t)}</Note>:null}
 {port.pending.length?<Panel><T weight="medium">{t('rankedPub.pending')}</T><Note>{t('rankedPub.unknown')}</Note><Button secondary label={t('rankedPub.retry')} disabled={!port.gate.active||port.gate.moving||!port.gate.online} onPress={onRetry}/></Panel>:null}
 </>;}
