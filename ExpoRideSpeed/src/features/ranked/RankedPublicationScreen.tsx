import {useLayoutEffect,useState} from 'react';
import {Button,Heading,Note,Panel,Screen,T} from '../../components/ui';
import {freezeRankedRequest,rankedCanonical} from './publicationModel';
import {PublicationStatus,publicationError} from './PublicationParts';
import type {RankedPublicationPort,PublicationTranslator} from './publicationUITypes';
import type {RankedAudience,RankedPublication,RankedPublicationRequest} from './types';
import {usePublicationAction} from './usePublicationAction';
type Review=Readonly<{publication:RankedPublication;request:RankedPublicationRequest;candidateKey:string|null}>;
export function RankedPublicationScreen({port,t}:{port:RankedPublicationPort;t:PublicationTranslator}){
 const ui=usePublicationAction(port),[audience,setAudience]=useState<RankedAudience>('private'),[review,setReview]=useState<Review|null>(null),[submitted,setSubmitted]=useState<string|null>(null);
 const state=port.state,selection=state.selection,publication=state.publication;
 const candidate=state.candidatesRead.fresh?state.candidates.find(row=>row.metric===selection?.metric&&row.record_id===selection.record_id):null,candidateKey=candidate?rankedCanonical(candidate):null,publicationKey=rankedCanonical(publication);
 const invalidate=ui.invalidate;
 // Changing canonical record proof invalidates a local explicit review.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useLayoutEffect(()=>{setReview(null);invalidate();},[port.generation,selection?.metric,selection?.record_id,publicationKey,candidateKey,invalidate]);
 const active=port.ready&&port.gate.signedIn&&port.gate.active&&!port.gate.moving&&port.gate.online,blocked=!!selection&&port.pending.some(op=>op.request.action==='publication_set'&&op.request.metric===selection.metric&&op.request.record_id===selection.record_id);
 const choose=(value:RankedAudience)=>{if(!ui.canEdit()||ui.busy||value!=='private'&&!candidate)return;ui.invalidate();setReview(null);setAudience(value);};
 const select=(metric:RankedPublication['metric'],id:string)=>{if(!ui.canEdit())return;setReview(null);setAudience('private');ui.invalidate();void ui.run(async guard=>{guard();await port.select(metric,id);guard();});};
 const reviewChange=()=>{if(!active||blocked||audience!=='private'&&!candidate)return;void ui.run(async guard=>{guard();const current=await port.reviewPublication();guard();if(current.metric!==selection?.metric||current.record_id!==selection.record_id||!port.currentPublication(current))throw Error('RANKED_CHANGED');const request=freezeRankedRequest({schema_version:1,action:'publication_set',metric:current.metric,record_id:current.record_id,expected_revision:current.revision,audience}) as RankedPublicationRequest;setReview({publication:current,request,candidateKey});});};
 const confirm=()=>{if(!review||blocked)return;const captured=review;void ui.run(async guard=>{guard();if(!port.currentPublication(captured.publication)||captured.candidateKey!==candidateKey||captured.request.audience!=='private'&&!candidate)throw Error('RANKED_CHANGED');const id=await port.publish(captured.request);guard();if(id){setSubmitted(id);setReview(null);}});};
 return <Screen scroll={!port.gate.moving}><Heading eyebrow="RIDE SPEED" title={t('rankedPub.title')} right={<Button small secondary label={t('rankedPub.back')} onPress={port.onBack}/>}/><Note>{t('rankedPub.subtitle')}</Note>
 {!port.gate.signedIn?<Button label={t('rankedPub.signIn')} onPress={port.onSignIn}/>:null}<PublicationStatus port={port} t={t} error={ui.error} onRetry={()=>{void ui.run(async guard=>{guard();await port.retry();guard();});}}/>
 {submitted&&port.latest?.operation_id===submitted?<Note error={port.latest.status==='rejected'}>{port.latest.status==='applied'?t('rankedPub.applied'):publicationError(port.latest.error,t)}</Note>:null}
 <Button secondary label={t('rankedPub.refresh')} disabled={!active||ui.busy} busy={ui.busy} onPress={()=>{void ui.run(async guard=>{guard();await port.refresh();guard();});}}/>
 <T size={21} weight="semibold">{t('rankedPub.candidates')}</T>{!state.candidatesRead.loaded?<Note>{state.candidatesRead.loading?t('rankedPub.wait'):t('rankedPub.unread')}</Note>:!state.candidatesRead.fresh?<Note>{t('rankedPub.stale')}</Note>:!state.candidates.length?<Note>{t('rankedPub.none')}</Note>:null}
 {state.candidatesRead.error?<Note error>{publicationError(state.candidatesRead.error,t)}</Note>:null}
 {state.candidates.map(row=><Panel key={`${row.metric}:${row.record_id}`}><T weight="medium">{t(row.metric==='sustained_speed'?'rankedPub.speed':'rankedPub.time')}</T><T numeric size={25}>{row.metric==='sustained_speed'?`${row.sustained_kmh.toFixed(1)} km/h`:`${(row.elapsed_lower_ms/1000).toFixed(2)}–${(row.elapsed_upper_ms/1000).toFixed(2)} ${t('m6.seconds')}`}</T><T muted>{t(`m6.${row.category}`)} · {t(`m6.class.${row.class_key}`)}</T><Note>{t(row.metric==='sustained_speed'?'m6.speedQuality':'m6.timeQuality')}</Note><Button small secondary label={t('rankedPub.record',{id:row.record_id.slice(-8)})} disabled={!active||ui.busy||!state.candidatesRead.fresh} onPress={()=>select(row.metric,row.record_id)}/></Panel>)}
 {state.candidatesRead.hasMore?<Button secondary label={t('rankedPub.more')} disabled={!active||ui.busy||!state.candidatesRead.fresh} onPress={()=>{void ui.run(async guard=>{guard();await port.loadMoreCandidates();guard();});}}/>:null}
 <T size={21} weight="semibold">{t('rankedPub.settings')}</T><Note>{t('rankedPub.settingsBody')}</Note>
 {!state.settingsRead.loaded?<Note>{state.settingsRead.loading?t('rankedPub.wait'):t('rankedPub.unread')}</Note>:!state.settingsRead.fresh?<Note>{t('rankedPub.stale')}</Note>:!state.settings.length?<Note>{t('rankedPub.noneSettings')}</Note>:null}
 {state.settingsRead.error?<Note error>{publicationError(state.settingsRead.error,t)}</Note>:null}
 {state.settings.map(row=><Panel key={`${row.metric}:${row.record_id}`}><T weight="medium">{t(row.metric==='sustained_speed'?'rankedPub.speed':'rankedPub.time')} · {row.record_id.slice(-8)}</T><T>{t(`rankedPub.${row.audience}`)}</T><Button small secondary label={t('rankedPub.choose')} disabled={!active||ui.busy||!state.settingsRead.fresh} onPress={()=>select(row.metric,row.record_id)}/></Panel>)}
 {state.settingsRead.hasMore?<Button secondary label={t('rankedPub.more')} disabled={!active||ui.busy||!state.settingsRead.fresh} onPress={()=>{void ui.run(async guard=>{guard();await port.loadMoreSettings();guard();});}}/>:null}
 {selection?<Panel><T size={20} weight="semibold">{t('rankedPub.current')}</T><T>{t('rankedPub.record',{id:selection.record_id.slice(-8)})}</T>
 {state.publicationRead.loading?<Note>{t('rankedPub.wait')}</Note>:null}{state.publicationRead.error?<Note error>{publicationError(state.publicationRead.error,t)}</Note>:null}
 {publication?<><T>{t(`rankedPub.${publication.audience}`)} · {t('rankedPub.revision',{revision:publication.revision})}</T>{!state.publicationRead.fresh?<Note>{t('rankedPub.stale')}</Note>:null}
 {!candidate?<Note>{t('rankedPub.noQualification')}</Note>:null}{selection.metric==='route_time'?<Note>{t('rankedPub.routeNotice')}</Note>:null}
 {(['private','friends','global'] as const).map(value=><Button key={value} small secondary={audience!==value} label={t(`rankedPub.${value}`)} disabled={!active||ui.busy||blocked||value!=='private'&&!candidate} onPress={()=>choose(value)}/>)}
 {review?<><Note>{t('rankedPub.reviewBody',{audience:t(`rankedPub.${review.request.audience}`)})}</Note><Button label={t('rankedPub.confirm')} disabled={!active||ui.busy||blocked} onPress={confirm}/><Button secondary label={t('rankedPub.cancelReview')} disabled={!active||ui.busy} onPress={()=>{if(!ui.canEdit())return;ui.invalidate();setReview(null);}}/></>:<Button label={t('rankedPub.review')} disabled={!active||ui.busy||blocked||!state.publicationRead.fresh} onPress={reviewChange}/>}</>:null}</Panel>:null}
 </Screen>;
}
