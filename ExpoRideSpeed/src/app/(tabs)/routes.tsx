import React,{useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {router,useLocalSearchParams} from 'expo-router';
import {randomUUID} from 'expo-crypto';
import * as Linking from 'expo-linking';
import {ActivityIndicator,FlatList,Platform,Pressable,Share,View} from 'react-native';
import {Button,Heading,Icon,Note,Row,Screen,T} from '../../components/ui';
import {RouteBuilder,RouteDetail,RouteProviderConsent,blankBuilder,builderDocument,type BuilderDraft} from '../../features/routes';
import {RouteSheet} from '../../features/routes/RouteSheet';
import {RequestGate} from '../../features/routes/builderModel';
import {fingerprintRoute,type RouteLocalRecord} from '../../features/routes/localModel';
import {builderFromRecord,builderFromRide} from '../../features/routes/presentationModel';
import type {StoredBuilderDraft} from '../../features/routes/persistenceModel';
import type {RouteProjection} from '../../features/routes/syncTypes';
import {toRideSummary} from '../../features/rides/syncModel';
import {routeErrorKey} from '../../lib/i18n/m4';
import {useI18n} from '../../lib/i18n';
import {useScreenActivity} from '../../lib/useScreenActivity';
import {useApp} from '../../state/AppState';
import {isAccountCurrent,useAuth} from '../../state/AuthState';
import {useRide} from '../../state/RideState';
import {builderGeometry,useRoutes} from '../../state/RouteState';

type Mode='build'|'saved'|'detail'|'shared';
const single=(value:string|string[]|undefined)=>typeof value==='string'?value:undefined;
function RouteEditor(){
 const app=useApp(),routes=useRoutes(),ride=useRide(),{scope,session}=useAuth(),{t,language}=useI18n();
 const {active,generation:activityGeneration,capture,accepts,current:screenCurrent}=useScreenActivity();
 const params=useLocalSearchParams<{routeId?:string;view?:string}>(),sharedId=single(params.routeId);
 const category=app.vehicle?.category==='bigbike'?'motorcycle':app.vehicle?.category??'scooter';
 const {projection:loadProjection,ready:routeReady}=routes;
 const [mode,setModeValue]=useState<Mode>(()=>sharedId?'shared':single(params.view)==='saved'?'saved':'build');
 const [draft,setDraft]=useState<StoredBuilderDraft>(()=>routes.draft??{localId:null,value:blankBuilder(category).value});
 const [selected,setSelected]=useState<string|null>(null),[shared,setShared]=useState<RouteProjection|null>(null),[loading,setLoading]=useState(!!sharedId);
 const previewGate=useRef(new RequestGate()),previewLife=useRef({alive:true,moving:ride.movingLocked,pending:false});
 useLayoutEffect(()=>{previewLife.current.moving=ride.movingLocked;},[ride.movingLocked]);
 const setMode=useCallback((next:Mode)=>{previewGate.current.invalidate();if(previewLife.current.pending){previewLife.current.pending=false;setLoading(false);}setModeValue(next);},[]);
 useEffect(()=>{const life=previewLife.current,gate=previewGate.current;life.alive=true;return()=>{life.alive=false;life.pending=false;gate.invalidate();};},[]);
 const [message,setMessage]=useState<string|null>(null),[showConsent,setShowConsent]=useState(false),[importing,setImporting]=useState(false),[conflictId,setConflictId]=useState<string|null>(null),[discarding,setDiscarding]=useState(false);
 const pendingConsent=useRef<((allowed:boolean)=>void)|null>(null),draftRef=useRef(draft);useEffect(()=>{draftRef.current=draft;},[draft]);
 const [online,setOnline]=useState(()=>Platform.OS!=='web'||typeof navigator==='undefined'||navigator.onLine);
 useEffect(()=>{if(Platform.OS!=='web')return;const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 useEffect(()=>()=>{pendingConsent.current?.(false);pendingConsent.current=null;},[]);
 useEffect(()=>{previewGate.current.invalidate();pendingConsent.current?.(false);pendingConsent.current=null;previewLife.current.pending=false;
  // Navigation/OS suspension revokes transient previews and pending disclosures.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setLoading(false);setShowConsent(false);
 },[active,activityGeneration]);
 useEffect(()=>{
  if(!ride.movingLocked)return;
  previewGate.current.invalidate();
  if(previewLife.current.pending){previewLife.current.pending=false;
   // The sensor transition invalidates the pending interactive preview.
   setLoading(false);
  }
  pendingConsent.current?.(false);pendingConsent.current=null;
  // A location-sensor event must dismiss interactive sheets and revoke their pending decision.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setShowConsent(false);setImporting(false);setDiscarding(false);
 },[ride.movingLocked]);
 useEffect(()=>{
  if(!active||!sharedId||!session||!routeReady)return;
  let alive=true;const activityTicket=capture(),current=()=>alive&&accepts(activityTicket)&&isAccountCurrent(scope);
  // This explicit read starts a new visible loading state after navigation resume.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setLoading(true);
  void loadProjection(sharedId).then(value=>{if(current()){setShared(value);if(!value)setMessage('ROUTE_UNAVAILABLE');}}).catch(error=>{if(current())setMessage(error instanceof Error?error.message:'ROUTE_UNAVAILABLE');}).finally(()=>{if(current())setLoading(false);});
  return()=>{alive=false;};
 },[sharedId,session,scope,routeReady,loadProjection,active,activityGeneration,capture,accepts]);
 const requestConsent=useCallback(()=>{
  if(!screenCurrent()||!isAccountCurrent(scope)||ride.movingLocked)return Promise.resolve(false);
  if(routes.consent)return Promise.resolve(true);
  return new Promise<boolean>(resolve=>{pendingConsent.current?.(false);pendingConsent.current=resolve;setShowConsent(true);});
 },[scope,ride.movingLocked,routes.consent,screenCurrent]);
 const decide=async(allowed:boolean)=>{
  const resolve=pendingConsent.current;pendingConsent.current=null;setShowConsent(false);if(!resolve)return;
  try{if(allowed){if(!isAccountCurrent(scope))throw Error('ACCOUNT_CHANGED');await routes.allowPlanning();}resolve(allowed&&isAccountCurrent(scope));}
  catch(error){if(isAccountCurrent(scope))setMessage(error instanceof Error?error.message:'LOCAL_WRITE_FAILED');resolve(false);}
 };
 const onChange=(value:BuilderDraft)=>{
  if(!isAccountCurrent(scope)||ride.movingLocked)return;
  const next={...draftRef.current,value};setDraft(next);draftRef.current=next;
  try{if(!routes.updateDraft(next))setMessage('LOCAL_WRITE_FAILED');else setMessage(null);}catch(error){setMessage(error instanceof Error?error.message:'LOCAL_WRITE_FAILED');}
 };
 const save=async(value:BuilderDraft)=>{
  if(ride.movingLocked)return false;const localId=draftRef.current.localId??randomUUID();
  const okay=await routes.save({localId,document:builderDocument(value),geometry:builderGeometry(value),...(draftRef.current.localId!==null?{expectedFingerprint:draftRef.current.baseFingerprint??null}:{})},{existingOnly:draftRef.current.localId!==null});
  if(okay&&isAccountCurrent(scope)){routes.updateDraft(null);setDraft({localId:null,value:blankBuilder(category).value});setSelected(localId);setMode('detail');setMessage(null);}
  return okay;
 };
 const edit=(record:RouteLocalRecord)=>{
  if(ride.movingLocked)return;
  // Keep a different unfinished draft; it is not silently replaced by opening a saved route.
  if(routes.draft&&routes.draft.localId!==record.localId&&(routes.draft.value.stops.length||routes.draft.value.title)){setMode('build');setMessage('ROUTE_DRAFT_EXISTS');return;}
  const next={localId:record.localId,value:builderFromRecord(record),baseFingerprint:fingerprintRoute(record.document)};
  if(!routes.updateDraft(next)){setMessage('LOCAL_WRITE_FAILED');return;}setDraft(next);draftRef.current=next;setMode('build');setMessage(null);
 };
 const start=()=>{const next=routes.draft??{localId:null,value:blankBuilder(category).value};setDraft(next);draftRef.current=next;setMode('build');setMessage(null);};
 const detachDraft=()=>{if(!isAccountCurrent(scope)||ride.movingLocked)return;const current=routes.draft;if(!current)return;const next={localId:null,value:current.value};if(!routes.updateDraft(next)){setMessage('LOCAL_WRITE_FAILED');return;}setDraft(next);draftRef.current=next;setMode('build');setMessage(null);};
 const discardDraft=()=>{if(!isAccountCurrent(scope)||ride.movingLocked)return;if(!routes.updateDraft(null)){setMessage('LOCAL_WRITE_FAILED');return;}const next={localId:null,value:blankBuilder(category).value};setDraft(next);draftRef.current=next;setDiscarding(false);setMode('build');setMessage(null);};
 const retry=()=>{void routes.retry().catch(error=>{if(isAccountCurrent(scope))setMessage(error instanceof Error?error.message:'ROUTE_UNAVAILABLE');});};
 const visible=routes.records.filter(record=>!record.sync.deleted||!!routes.conflicts[record.localId]),record=routes.records.find(row=>row.localId===selected&&!row.sync.deleted);
 const clean=(row:RouteLocalRecord)=>!!row.sync.cloudId&&!row.sync.pending&&row.sync.cleanFingerprint===fingerprintRoute(row.document)&&!row.sync.blocked;
 const preview=async()=>{
  const activityTicket=capture();if(!accepts(activityTicket)||!previewLife.current.alive||previewLife.current.moving||!isAccountCurrent(scope))return;
  if(!record?.sync.cloudId||!clean(record)||record.document.visibility==='private'){setMessage('ROUTE_SHARE_PRIVATE');return;}
  const key=`${record.localId}:${record.sync.cloudId}`,ticket=previewGate.current.begin(key,scope.generation);
  const current=()=>accepts(activityTicket)&&previewLife.current.alive&&!previewLife.current.moving&&isAccountCurrent(scope)&&previewGate.current.accepts(ticket,key,scope.generation);
  previewLife.current.pending=true;setLoading(true);setMessage(null);
  try{const value=await routes.projection(record.sync.cloudId);if(!current())return;if(!value)throw Error('ROUTE_UNAVAILABLE');setShared(value);setMode('shared');}
  catch(error){if(current())setMessage(error instanceof Error?error.message:'ROUTE_UNAVAILABLE');}
  finally{if(current()){previewLife.current.pending=false;setLoading(false);}}
 };
 const share=async()=>{
  if(!isAccountCurrent(scope)||ride.movingLocked)return;
  if(!record?.sync.cloudId||!clean(record)||record.document.visibility==='private'){setMessage('ROUTE_SHARE_PRIVATE');return;}
  // Links contain only an opaque route ID. Recipients fetch their authorized trimmed projection.
  const url=Linking.createURL('routes',{queryParams:{routeId:record.sync.cloudId}});
  await Share.share({message:`${t('m4.shareText',{name:record.document.title})}\n${url}`});
 };
 const completed=ride.history.filter(item=>item.status==='complete'&&(item.summary?.geometry.fragments.length||item.fragments.length));
 const importRide=(id:string)=>{
  const item=completed.find(row=>row.id===id);if(!item||ride.movingLocked)return;
  if(routes.draft&&(routes.draft.value.stops.length||routes.draft.value.title)){setImporting(false);start();setMessage('ROUTE_DRAFT_EXISTS');return;}
  try{const summary=item.summary??toRideSummary(item,Platform.OS==='ios'?'ios':Platform.OS==='android'?'android':'web');const value=builderFromRide(summary,t('m4.rideRoute',{date:new Date(item.startedAtMs).toLocaleDateString(language)}),t('m4.start'),t('m4.finish')),next={localId:null,value};if(!routes.updateDraft(next))throw Error('LOCAL_WRITE_FAILED');setDraft(next);draftRef.current=next;setImporting(false);setMode('build');setMessage(null);}catch(error){setMessage(error instanceof Error?error.message:'ROUTE_TOO_LARGE');}
 };
 const close=()=>router.replace('/');
 const error=message??routes.error;
 const errorText=error==='ROUTE_DRAFT_EXISTS'?t('m4.draftExists'):error==='ROUTE_SHARE_PRIVATE'?t('m4.sharePrivate'):t(routeErrorKey(error));
 const conflict=conflictId?routes.conflicts[conflictId]:null;
 const resolve=async(choice:'cloud'|'local')=>{if(!conflictId||ride.movingLocked)return;try{const okay=await routes.resolveConflict(conflictId,choice);if(okay&&isAccountCurrent(scope))setConflictId(null);}catch(error){if(isAccountCurrent(scope))setMessage(error instanceof Error?error.message:'ROUTE_UNAVAILABLE');}};
 return <View style={{flex:1,backgroundColor:app.colors.bg}}>
  {mode==='build'?<RouteBuilder value={draft.value} onChange={onChange} onSave={save} onClose={close} onOpenSaved={()=>setMode('saved')} search={routes.search} calculate={routes.calculate} locked={ride.movingLocked} consent={routes.consent} onRequestConsent={requestConsent} ownerGeneration={scope.generation} ready={routes.ready} error={error} online={online} onLocate={signal=>{void ride.locate(signal);}} onSignIn={()=>router.push('/auth')}/>:
   mode==='detail'&&record?<RouteDetail item={{kind:'owner',document:record.document,geometry:record.geometry,synced:clean(record)}} onClose={()=>setMode('saved')} onEdit={()=>edit(record)} onDelete={async()=>{const okay=await routes.remove(record.localId);if(okay){setSelected(null);setMode('saved');}return okay;}} onPreviewShare={()=>{void preview();}} busy={loading} error={error} online={online}/>:
   mode==='shared'&&shared?<RouteDetail item={{kind:'shared',route:shared}} onClose={()=>setMode(sharedId?'saved':'detail')} online={online}/>:
   <Screen scroll={false} style={{flex:1}}><Heading eyebrow="" title={t('m4.library')}/><Row><Button small label={t(routes.draft?'m4.continueDraft':'m4.newRoute')} icon="add-outline" onPress={start} disabled={ride.movingLocked}/><Button small secondary label={t('m4.refresh')} icon="refresh-outline" busy={routes.status==='loading'||loading} onPress={retry}/></Row>
    {!!routes.draft&&<Row>{routes.draft.localId&&<Button small secondary label={t('m4.copyDraft')} onPress={detachDraft} disabled={ride.movingLocked}/>}<Button small secondary label={t('m4.resetDraft')} onPress={()=>setDiscarding(true)} disabled={ride.movingLocked}/></Row>}
    {!session&&<Button secondary small label={t('m4.signIn')} onPress={()=>router.push('/auth')}/>}
    {session&&loading&&<ActivityIndicator color={app.colors.accent}/>}
    {error&&<Note error>{errorText}</Note>}
    <FlatList scrollEnabled={!ride.movingLocked} data={visible} keyExtractor={row=>row.localId} contentContainerStyle={{gap:12,paddingBottom:24}} ListEmptyComponent={<View style={{gap:14,paddingVertical:30}}><Icon name="trail-sign-outline" size={40} color={app.colors.muted}/><T size={24} weight="semibold">{t('m4.emptyTitle')}</T><T muted>{t('m4.emptyBody')}</T></View>} renderItem={({item})=><View style={{backgroundColor:app.colors.surface,borderColor:app.colors.line,borderWidth:1,borderRadius:24,padding:18,gap:12}}><Pressable accessibilityRole="button" accessibilityLabel={t('m4.openRoute',{name:item.document.title})} disabled={ride.movingLocked} onPress={()=>{if(item.sync.deleted){setConflictId(item.localId);return;}setSelected(item.localId);setMode('detail');setMessage(null);}} style={{minHeight:56,gap:5}}><Row><Icon name="git-branch-outline"/><T size={20} weight="semibold" style={{flex:1}}>{item.document.title}</T><Icon name="chevron-forward-outline" size={18}/></Row><T size={12} muted>{t(item.sync.deleted?'m4.deletePending':clean(item)?'m4.synced':!session?'m4.localOnly':'m4.syncPending')} · {t(`m4.${item.document.visibility}`)}</T></Pressable>{routes.conflicts[item.localId]&&<Button small secondary label={t('m4.conflictTitle')} onPress={()=>setConflictId(item.localId)}/>}</View>}/>
    <Button secondary label={t('m4.importRide')} icon="radio-outline" onPress={()=>setImporting(true)} disabled={ride.movingLocked}/><Button secondary small label={t('m4.close')} onPress={close}/>
   </Screen>}
  {mode==='detail'&&!ride.movingLocked&&record&&clean(record)&&record.document.visibility!=='private'&&<View style={{position:'absolute',right:20,top:110}}><Button small secondary label={t('m4.shareAction')} icon="share-outline" onPress={()=>{void share().catch(error=>setMessage(error instanceof Error?error.message:'ROUTE_UNAVAILABLE'));}}/></View>}
  <RouteProviderConsent visible={showConsent&&!ride.movingLocked} onDecision={allowed=>{void decide(allowed);}}/>
  <RouteSheet visible={discarding&&!ride.movingLocked} title={t('m4.resetDraft')} onClose={()=>setDiscarding(false)}><T>{t('m4.resetDraftBody')}</T><Button label={t('m4.resetDraft')} onPress={discardDraft}/><Button secondary label={t('m4.cancel')} onPress={()=>setDiscarding(false)}/></RouteSheet>
  <RouteSheet visible={importing&&!ride.movingLocked} title={t('m4.chooseRide')} onClose={()=>setImporting(false)}>{completed.length?completed.map(item=><Button key={item.id} secondary label={new Date(item.startedAtMs).toLocaleString(language)} onPress={()=>importRide(item.id)}/>):<T muted>{t('m4.noRides')}</T>}</RouteSheet>
  <RouteSheet visible={!!conflict&&!ride.movingLocked} title={t('m4.conflictTitle')} onClose={()=>setConflictId(null)}><T>{t(conflict?.reason==='deleted'?'m4.conflictDeleted':'m4.conflictReview')}</T><Button label={t('m4.useCloud')} onPress={()=>{void resolve('cloud');}}/><Button secondary label={t('m4.useLocal')} onPress={()=>{void resolve('local');}}/></RouteSheet>
 </View>;
}
export default function RoutesScreen(){const {scope}=useAuth(),params=useLocalSearchParams<{routeId?:string}>(),routes=useRoutes(),{t}=useI18n();if(!routes.ready)return <Screen><T>{t('common.wait')}</T>{routes.error&&<Note error>{t(routeErrorKey(routes.error))}</Note>}<Button secondary label={t('common.retry')} onPress={()=>{void routes.retry().catch(()=>{});}}/></Screen>;return <RouteEditor key={`${scope.generation}:${single(params.routeId)??''}`}/>;}
