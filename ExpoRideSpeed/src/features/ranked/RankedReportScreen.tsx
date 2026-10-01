import {useLayoutEffect,useState} from 'react';
import {Button,Field,Heading,Note,Panel,Screen,T} from '../../components/ui';
import {freezeRankedRequest,rankedCanonical} from './publicationModel';
import {PublicationStatus,publicationError} from './PublicationParts';
import type {RankedReportPort,PublicationTranslator} from './publicationUITypes';
import type {RankedReportRequest,RankedRow} from './types';
import {usePublicationAction} from './usePublicationAction';
const reasons=[['suspected_cheating','cheating'],['unsafe_activity','unsafe'],['harassment','harassment'],['other','other']] as const;
export function RankedReportScreen({port,t}:{port:RankedReportPort;t:PublicationTranslator}){
 const ui=usePublicationAction(port),[reason,setReason]=useState<RankedReportRequest['reason']>('suspected_cheating'),[detail,setDetail]=useState(''),[review,setReview]=useState<RankedRow|null>(null),[submitted,setSubmitted]=useState<string|null>(null),token=port.target?.token??null,targetKey=rankedCanonical(port.target?.row??null);
 const invalidate=ui.invalidate;
 // Current board proof or lifecycle changes retire the explicit report review.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useLayoutEffect(()=>{setReview(null);invalidate();},[port.generation,token,targetKey,invalidate]);
 const active=port.ready&&port.gate.signedIn&&port.gate.active&&!port.gate.moving&&port.gate.online,blocked=!!port.target&&port.pending.some(op=>op.request.action==='report_record'&&op.request.metric===port.target!.row.metric&&op.request.record_id===port.target!.row.record_id);
 const read=()=>{if(!token)return;void ui.run(async guard=>{guard();const row=await port.review(token);guard();if(!row||!port.currentTarget(token))throw Error('RANKED_RECORD_UNAVAILABLE');setReview(row);});};
 const send=()=>{if(!token||!review||blocked)return;const captured=review;void ui.run(async guard=>{guard();if(!port.currentTarget(token)||rankedCanonical(captured)!==targetKey)throw Error('RANKED_CHANGED');const request=freezeRankedRequest({schema_version:1,action:'report_record',metric:captured.metric,record_id:captured.record_id,reason,detail}) as RankedReportRequest;const id=await port.report(request);guard();if(id){setSubmitted(id);setReview(null);}});};
 return <Screen scroll={!port.gate.moving}><Heading eyebrow="RIDE SPEED" title={t('rankedPub.reportTitle')} right={<Button small secondary label={t('rankedPub.back')} onPress={port.onBack}/>}/><Note>{t('rankedPub.reportBody')}</Note><PublicationStatus port={port} t={t} error={ui.error} onRetry={()=>{void ui.run(async guard=>{guard();await port.retry();guard();});}}/>
 {submitted&&port.latest?.operation_id===submitted?<Note error={port.latest.status==='rejected'}>{port.latest.status==='applied'?t('rankedPub.received'):publicationError(port.latest.error,t)}</Note>:null}
 {!port.target?<Note>{t('rankedPub.reportUnavailable')}</Note>:<Panel><T weight="medium">{port.target.row.profile.name} · @{port.target.row.profile.handle}</T><T>{t(port.target.row.metric==='sustained_speed'?'rankedPub.speed':'rankedPub.time')}</T><T numeric>{port.target.row.metric==='sustained_speed'?`${port.target.row.sustained_kmh.toFixed(1)} km/h`:`${(port.target.row.elapsed_lower_ms/1000).toFixed(2)}–${(port.target.row.elapsed_upper_ms/1000).toFixed(2)} s`}</T><Button label={t('rankedPub.reviewRecord')} busy={ui.busy} disabled={!active||blocked} onPress={read}/>
 {review?<><T weight="medium">{t('rankedPub.reason')}</T>{reasons.map(([value,key])=><Button key={value} small secondary={reason!==value} label={t(`rankedPub.${key}`)} disabled={!active||ui.busy||blocked} onPress={()=>{if(!ui.canEdit()||blocked)return;setReason(value);}}/>)}<Field label={t('rankedPub.detail')} value={detail} multiline editable={active&&!ui.busy&&!blocked} onChangeText={value=>{if(!ui.canEdit()||blocked)return;setDetail([...value.replace(/[\u0000-\u001f\u007f]/gu,' ')].slice(0,500).join(''));}}/><Button label={t('rankedPub.sendReport')} disabled={!active||ui.busy||blocked} onPress={send}/></>:null}</Panel>}
 </Screen>;
}
