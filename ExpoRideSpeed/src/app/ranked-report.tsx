import {useEffect,useLayoutEffect,useRef} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {Screen,T} from '../components/ui';
import {RankedReportScreen} from '../features/ranked/RankedReportScreen';
import type {RankedReportPort} from '../features/ranked/publicationUITypes';
import {usePublicationHost} from '../features/ranked/usePublicationHost';
import {useI18n,type TranslationKey} from '../lib/i18n';
import {useApp} from '../state/AppState';
import {useAuth} from '../state/AuthState';
export default function RankedReportRoute(){const auth=useAuth(),app=useApp(),{t}=useI18n();if(!auth.ready||!app.ready)return <Screen><T>{t('common.wait')}</T></Screen>;return <AccountReport key={auth.scope.generation}/>;}
function AccountReport(){
 const h=usePublicationHost(),{t}=useI18n(),params=useLocalSearchParams<{token?:string|string[]}>(),routeToken=typeof params.token==='string'?params.token:null,candidate=h.ranked.reportTarget,target=routeToken!==null&&candidate?.token===routeToken?candidate:null,token=target?.token;
 const boundToken=useRef(token);useLayoutEffect(()=>{boundToken.current=token;},[token]);
 const currentTarget=(value:string)=>boundToken.current===value&&value===token&&h.ranked.currentReport(value);
 // The cleanup retains the initiating owner callback. Provider value callbacks
 // may change on a receipt render; that must not erase the current review.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{const clear=h.ranked.clearReport;return()=>{if(token)clear(token);};},[token,h.scope]);
 const port:RankedReportPort={...h.base,target,review:value=>h.read(async()=>{if(!currentTarget(value))throw Error('RANKED_CHANGED');const row=await h.ranked.reviewReport(value);if(!currentTarget(value))throw Error('RANKED_CHANGED');return row;}),currentTarget,report:request=>h.read(async()=>{if(!token||!currentTarget(token))throw Error('RANKED_CHANGED');return h.ranked.mutate(request);})};
 return <RankedReportScreen port={port} t={(key,values)=>t(key as TranslationKey,values)}/>;
}
