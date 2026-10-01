import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {Screen,T} from '../components/ui';
import {RankedOwnerReader} from '../features/ranked/RankedOwnerReader';
import {RankedPublicationScreen} from '../features/ranked/RankedPublicationScreen';
import {getRankedOwnRecords,getRankedPublication,getRankedPublications} from '../features/ranked/publicationService';
import type {RankedPublicationPort} from '../features/ranked/publicationUITypes';
import {usePublicationHost} from '../features/ranked/usePublicationHost';
import {useI18n,type TranslationKey} from '../lib/i18n';
import {useApp} from '../state/AppState';
import {useAuth} from '../state/AuthState';
const monotonicNow=()=>performance.now();
export default function RankedPublicationRoute(){const auth=useAuth(),app=useApp(),{t}=useI18n();if(!auth.ready||!app.ready)return <Screen><T>{t('common.wait')}</T></Screen>;return <AccountPublication key={auth.scope.generation}/>;}
function AccountPublication(){
 const h=usePublicationHost(),{t}=useI18n(),{scope,guard,read}=h;
 const reader=useMemo(()=>new RankedOwnerReader({ownerId:scope.userId??'',guard,monotonicNow,candidates:cursor=>read(session=>getRankedOwnRecords(scope,session,cursor)),publications:cursor=>read(session=>getRankedPublications(scope,session,cursor)),publication:(metric,id)=>read(session=>getRankedPublication(scope,session,metric,id))}),[scope,guard,read]);
 const state=useSyncExternalStore(reader.subscribe,reader.getSnapshot,reader.getSnapshot);
 useEffect(()=>()=>reader.close(),[reader]);
 useEffect(()=>{if(!h.base.ready||!h.base.gate.active||!h.base.gate.signedIn||h.base.gate.moving){reader.suspend();return;}void reader.refresh().catch(()=>{});return()=>reader.suspend();},[reader,h.base.ready,h.base.gate.active,h.base.gate.signedIn,h.base.gate.moving,h.activity.generation,h.auth.session,h.ranked.appliedVersion]);
 const port:RankedPublicationPort={...h.base,state,refresh:async()=>{guard();await reader.refresh();guard();},loadMoreCandidates:async()=>{guard();await reader.loadMoreCandidates();guard();},loadMoreSettings:async()=>{guard();await reader.loadMoreSettings();guard();},select:async(metric,id)=>{guard();await reader.select(metric,id);guard();},
  reviewPublication:async()=>{guard();const selected=reader.getSnapshot().selection;if(!selected)throw Error('RANKED_CHANGED');await reader.select(selected.metric,selected.record_id);guard();const snapshot=reader.getSnapshot();if(!snapshot.publication||!reader.currentPublication(snapshot.publication))throw Error(snapshot.publicationRead.error??'RANKED_CHANGED');return snapshot.publication;},currentPublication:value=>reader.currentPublication(value),publish:request=>read(async()=>{const value=reader.getSnapshot().publication;if(!value||!reader.currentPublication(value)||value.metric!==request.metric||value.record_id!==request.record_id||value.revision!==request.expected_revision)throw Error('RANKED_CHANGED');return h.ranked.mutate(request);})};
 return <RankedPublicationScreen port={port} t={(key,values)=>t(key as TranslationKey,values)}/>;
}
