import {router} from 'expo-router';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {Platform} from 'react-native';
import {RankedScreen} from '../../features/ranked';
import {rankedFilterKey} from '../../features/ranked/model';
import {classForVehicle} from '../../features/ranked/presentationModel';
import {getRankedCourses,getRankedPage} from '../../features/ranked/service';
import type {RankedCategory,RankedFilter} from '../../features/ranked/types';
import type {RankedScreenPort,RankedTranslator} from '../../features/ranked/uiTypes';
import {useI18n,type TranslationKey} from '../../lib/i18n';
import {useScreenActivity} from '../../lib/useScreenActivity';
import {useApp} from '../../state/AppState';
import {isAccountCurrent,useAuth} from '../../state/AuthState';
import {RankedReader} from '../../state/RankedReader';
import {useRide} from '../../state/RideState';
import {useRanked} from '../../state/RankedState';
import {useSocial} from '../../state/SocialState';
import {Screen,T} from '../../components/ui';
const monotonicNow=()=>performance.now();

export default function Rankings(){const {scope,ready}=useAuth(),app=useApp(),{t}=useI18n();if(!ready||!app.ready)return <Screen><T>{t('common.wait')}</T></Screen>;return <AccountRankings key={scope.generation}/>;}
function AccountRankings(){
 const auth=useAuth(),app=useApp(),ride=useRide(),ranked=useRanked(),social=useSocial(),activity=useScreenActivity(),{t,language}=useI18n(),{scope}=auth;
 const screenCurrent=activity.current;
 const captureActivity=activity.capture,acceptsActivity=activity.accepts;
 const latest=useRef({auth,app,moving:ride.movingLocked}),alive=useRef(true);
 useLayoutEffect(()=>{latest.current={auth,app,moving:ride.movingLocked};},[auth,app,ride.movingLocked]);
 const guardRead=useCallback(()=>{
  if(!alive.current||!isAccountCurrent(scope)||!screenCurrent())throw Error('RANKED_CHANGED');
  const state=latest.current;
  if(!state.auth.ready||!state.auth.session||state.auth.session.user.id!==scope.userId)throw Error('RANKED_AUTH_REQUIRED');
  if(!state.app.ready||state.app.storageError==='LOCAL_READ_FAILED')throw Error('RANKED_UNAVAILABLE');
  if(state.moving)throw Error('RANKED_MOVING');
 },[scope,screenCurrent]);
 // Reads capture one owner and JWT at dispatch. An old response cannot become
 // eligible for a new account or foreground generation.
 const reader=useMemo(()=>{
  const vehicle=app.vehicle,category:RankedCategory=vehicle?.category==='bigbike'?'motorcycle':vehicle?.category==='car'?'car':'scooter';
  const selected=classForVehicle(vehicle?{category,engine_cc:vehicle.engineCc,powertrain:vehicle.powertrain??'unknown'}:null);
  const filter:RankedFilter={schema_version:1,period:'today',metric:'sustained_speed',category,class_key:selected==='unknown'?`${category}:unknown`:selected,scope:'friends',course:null};
  // The constructor never calls ports; these ref reads occur only during I/O.
  // eslint-disable-next-line react-hooks/refs
  return new RankedReader({guard:guardRead,monotonicNow,page:async(value,cursor)=>{guardRead();const ticket=captureActivity();if(ticket===null)throw Error('RANKED_CHANGED');const session=latest.current.auth.session!;const result=await getRankedPage(scope,session,value,cursor);guardRead();if(!acceptsActivity(ticket))throw Error('RANKED_CHANGED');return result;},courses:async cursor=>{guardRead();const ticket=captureActivity();if(ticket===null)throw Error('RANKED_CHANGED');const session=latest.current.auth.session!;const result=await getRankedCourses(scope,session,cursor);guardRead();if(!acceptsActivity(ticket))throw Error('RANKED_CHANGED');return result;}},filter);
 // The vehicle supplies only the initial filter. Historical classes and later
 // explicit choices never change when the Garage changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scope,guardRead,captureActivity,acceptsActivity]);
 const state=useSyncExternalStore(reader.subscribe,reader.getSnapshot,reader.getSnapshot),filterKey=rankedFilterKey(state.filter);
 const privacyPending=ranked.pending.some(op=>op.request.action==='publication_set'&&op.request.audience==='private')||social.pending.some(op=>op.request.action==='friend_action'&&['block','remove'].includes(op.request.verb));
 const privacyKey=JSON.stringify([ranked.appliedVersion,social.accountRevision,social.latest?.operationId??null,privacyPending]);
 const generation=`${scope.generation}:${activity.generation}:${filterKey}:${privacyKey}`,generationRef=useRef(generation);
 useLayoutEffect(()=>{generationRef.current=generation;},[generation]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;reader.close();};},[reader]);
 useEffect(()=>{
  reader.invalidate();
  if(!activity.active||!auth.ready||!auth.session||!app.ready||ride.movingLocked||privacyPending){reader.suspend();return;}
  void Promise.allSettled([reader.refresh(),reader.loadCourses()]);
  return()=>reader.suspend();
 },[activity.active,activity.generation,auth.ready,auth.session,app.ready,ride.movingLocked,reader,privacyKey,privacyPending]);
 const current=(g:string)=>alive.current&&isAccountCurrent(scope)&&activity.current()&&g===generationRef.current;
 const guard=(g:string)=>{if(!current(g))throw Error('RANKED_CHANGED');guardRead();};
 const port:RankedScreenPort={ownerId:scope.userId,generation,current,guard,
  gate:{signedIn:!!auth.session,focused:activity.active,foreground:activity.active,moving:ride.movingLocked,online:Platform.OS!=='web'||typeof navigator==='undefined'||navigator.onLine},
  ready:auth.ready&&app.ready,filter:state.filter,page:privacyPending?null:state.page,rows:privacyPending?[]:state.rows,read:privacyPending?{...state.read,fresh:false}:state.read,courses:state.courses,coursesRead:state.coursesRead,units:app.data.unit,locale:language,rankChanges:privacyPending?{}:state.rankChanges,
  refresh:async()=>{guard(generation);await Promise.allSettled([reader.refresh(),reader.loadCourses()]);guard(generation);},
  loadMore:async()=>{guard(generation);await reader.loadMore();guard(generation);},
  loadMoreCourses:async()=>{guard(generation);await reader.loadCourses(true);guard(generation);},
  setFilter:async filter=>{guard(generation);await reader.setFilter(filter);},
  onSignIn:()=>{if(!activity.current()||ride.movingLocked)return;router.push('/auth');},
  onManagePublication:()=>{guard(generation);router.push('/ranked-publication');},
  onReport:binding=>{guard(generation);if(privacyPending||!state.read.fresh||binding.board_revision!==state.page?.board_revision||binding.metric!==state.filter.metric)throw Error('RANKED_CHANGED');const source=reader.sourcePage(binding.record_id,binding.user_id);if(!source)throw Error('RANKED_CHANGED');const token=ranked.armReport(source,binding.record_id,binding.user_id);guard(generation);router.push({pathname:'/ranked-report',params:{token}});},
 };
 const translate:RankedTranslator=(key,values)=>t(key as TranslationKey,values);
 return <RankedScreen key={generation} port={port} t={translate}/>;
}
