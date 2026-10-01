import {randomUUID} from 'expo-crypto';
import {router} from 'expo-router';
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,FlatList,RefreshControl,Switch,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button,Empty,Field,Note,Row,Segments,T} from '../../components/ui';
import {useI18n,errorKey} from '../../lib/i18n';
import {useApp} from '../../state/AppState';
import {useNow} from '../../lib/useNow';
import {RouteSheet} from '../routes/RouteSheet';
import SharedRouteSnapshot from '../routes/SharedRouteSnapshot';
import {SocialHeader,SocialPending,SocialReadState} from './SocialSurface';
import {approvedSessionWindow,invitationRequest,localDateInput,localWindow} from './presentationModel';
import {getInvitationChoices,getInvitationCoursePage,getInvitationRoutePage,getInvitationSessionPage,reviewInvitation,type InvitationChoices,type InvitationReview} from './invitationReviewService';
import type {InvitationRow,InvitationVerb,SocialRequest} from './types';
import {useSocialScreen} from './useSocialScreen';

const emptyChoices:InvitationChoices={routes:[],courses:[],sessions:[],routeCursor:null,courseCursor:null,sessionCursor:null};
const wallNow=()=>Date.now();
type CreateReview={value:InvitationReview;id:string;epoch:number};
export default function InvitationsScreen({embedded=false}:{embedded?:boolean}){
 const screen=useSocialScreen(),{social}=screen,{colors}=useApp(),{t,locale}=useI18n(),insets=useSafeAreaInsets(),now=useNow(1000);
 const [tab,setTab]=useState('received'),[create,setCreate]=useState(false),[choices,setChoices]=useState(emptyChoices),[choicesLoaded,setChoicesLoaded]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[paging,setPaging]=useState<'routes'|'courses'|'sessions'|null>(null);
 const [routeId,setRouteId]=useState<string|null>(null),[friendId,setFriendId]=useState<string|null>(null),[mode,setMode]=useState<'group_ride'|'timed_race'>('group_ride'),[sessionId,setSessionId]=useState<string|null>(null),[consent,setConsent]=useState(false),[start,setStart]=useState(()=>localDateInput(wallNow()+3600000));
 const [review,setReview]=useState<CreateReview|null>(null),[view,setView]=useState<InvitationRow|null>(null),[confirm,setConfirm]=useState<{row:InvitationRow;verb:'withdraw'|'cancel'}|null>(null),[error,setError]=useState<string|null>(null),[operationId,setOperationId]=useState<string|null>(null);
 const request=useRef(0),pageLock=useRef<{epoch:number}|null>(null);
 // Scope/mount guards reject unmounted responses; any glance/background intent
 // also invalidates the outstanding review without changing its saved payload.
 useEffect(()=>{if(screen.moving||!screen.focused||!screen.active){
  request.current++;
  pageLock.current=null;
  // This external focus/safety boundary cancels an async intent. It must also
  // release its transient spinner; no remote response may restore the review.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setBusy(false);setLoading(false);setReview(null);setPaging(null);
 }},[screen.moving,screen.focused,screen.active]);
 const allowed=screen.enabled&&!busy;
 const failure=(value:unknown)=>{if(screen.current())setError(t(errorKey(value,'social')));};
 // A fresh choice read or final review supersedes pagination. Release its UI
 // lease now; the older response remains fenced by the advanced request epoch.
 const startRequest=()=>{pageLock.current=null;setPaging(null);return ++request.current;};
 const closeCreate=()=>{request.current++;pageLock.current=null;setCreate(false);setReview(null);setBusy(false);setLoading(false);setPaging(null);};
 const dates=(start:string,end:string)=>t('m5a.window',{start:new Date(start).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'}),end:new Date(end).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'})});
 const send=async(build:()=>SocialRequest)=>{try{const result=await screen.run(async()=>{const value=build();setBusy(true);setError(null);return await screen.live.current.social.mutate(value);});if(result&&screen.current()){setOperationId(result);closeCreate();setView(null);setConfirm(null);}}catch(value){failure(value);}finally{if(screen.current())setBusy(false);}};
 const act=(row:InvitationRow,verb:InvitationVerb)=>send(()=>invitationRequest(row,verb,screen.live.current.social.invitations,wallNow()));
 const loadChoices=async()=>{const sequence=startRequest();try{screen.guard();const {scope,session}=screen.live.current.auth;if(!session)throw Error('SOCIAL_AUTH_REQUIRED');setLoading(true);setError(null);const value=await getInvitationChoices(scope,session);screen.guard();if(sequence!==request.current)return;setChoices(value);setChoicesLoaded(true);}catch(value){if(sequence===request.current)failure(value);}finally{if(sequence===request.current&&screen.current())setLoading(false);}};
 const moreChoices=async(kind:'routes'|'courses'|'sessions')=>{
  const sequence=request.current,lease={epoch:sequence};try{screen.guard();if(pageLock.current)return;pageLock.current=lease;setPaging(kind);const {scope,session}=screen.live.current.auth;if(!session)throw Error('SOCIAL_AUTH_REQUIRED');
   const merge=<T extends {id:string}>(old:readonly T[],next:readonly T[])=>[...new Map([...old,...next].map(value=>[value.id,value])).values()];
   if(kind==='routes'){if(!choices.routeCursor)return;const page=await getInvitationRoutePage(scope,session,choices.routeCursor);screen.guard();if(sequence===request.current)setChoices(old=>({...old,routes:merge(old.routes,page.routes),routeCursor:page.nextCursor}));}
   else if(kind==='courses'){if(!choices.courseCursor)return;const page=await getInvitationCoursePage(scope,session,choices.courseCursor);screen.guard();if(sequence===request.current)setChoices(old=>({...old,courses:merge(old.courses,page.courses),courseCursor:page.nextCursor}));}
   else{if(!choices.sessionCursor)return;const page=await getInvitationSessionPage(scope,session,choices.sessionCursor);screen.guard();if(sequence===request.current)setChoices(old=>({...old,sessions:merge(old.sessions,page.sessions),sessionCursor:page.nextCursor}));}
  }catch(value){if(sequence===request.current)failure(value);}finally{if(pageLock.current===lease)pageLock.current=null;if(screen.current()&&sequence===request.current)setPaging(null);}
 };
 const openCreate=()=>{try{screen.guard();setBusy(false);setCreate(true);setReview(null);setChoicesLoaded(false);setChoices(emptyChoices);setRouteId(null);setFriendId(null);setSessionId(null);setConsent(false);setMode('group_ride');void loadChoices();}catch(value){failure(value);}};
 const buildReview=async()=>{
  const sequence=startRequest();try{screen.guard();const {auth,social}=screen.live.current,route=choices.routes.find(value=>value.id===routeId),friend=social.friends.find(value=>value.user_id===friendId&&value.state==='accepted');
   if(!route)throw Error('SOCIAL_ROUTE_CHANGED');if(!friend)throw Error('FRIEND_CHANGED');if(!auth.session)throw Error('SOCIAL_AUTH_REQUIRED');
   const session=choices.sessions.find(value=>value.id===sessionId);if(mode==='timed_race'&&(!consent||!session))throw Error('SOCIAL_COURSE_CHANGED');
   const window=mode==='timed_race'?approvedSessionWindow(start,session!,wallNow()):localWindow(start,wallNow());setBusy(true);setError(null);
   const value=await reviewInvitation(auth.scope,auth.session,{route,friend,mode,...window,sessionId:mode==='timed_race'?sessionId:null});screen.guard();if(sequence!==request.current)return;
   const currentFriend=screen.live.current.social.friends.find(item=>item.user_id===friend.user_id);if(!currentFriend||currentFriend.state!=='accepted'||currentFriend.generation!==value.friend.generation)throw Error('FRIEND_CHANGED');
   setReview({value,id:randomUUID(),epoch:sequence});
  }catch(value){if(sequence===request.current)failure(value);}finally{if(sequence===request.current&&screen.current())setBusy(false);}
 };
 const sendReview=()=>send(()=>{const current=review;if(!current||current.epoch!==request.current)throw Error('SOCIAL_ROUTE_CHANGED');const value=current.value,friend=screen.live.current.social.friends.find(item=>item.user_id===value.friend.user_id);if(!friend||friend.state!=='accepted'||friend.generation!==value.friend.generation)throw Error('FRIEND_CHANGED');if(Date.parse(value.startsAt)<=wallNow())throw Error('SOCIAL_WINDOW_INVALID');return {schema_version:1,action:'create_invitation',challenge_id:current.id,route_id:value.route.id,route_revision:value.route.revision,reviewed_geometry_hash:value.shared.geometryHash,mode:value.mode,session_id:value.sessionId,starts_at:value.startsAt,ends_at:value.endsAt,recipient_id:friend.user_id,friendship_generation:friend.generation};});
 const openView=(row:InvitationRow)=>{try{screen.guard();invitationRequest(row,'accept',screen.live.current.social.invitations,wallNow());setError(null);setView(row);}catch(value){failure(value);}};
 const openConfirm=(row:InvitationRow,verb:'withdraw'|'cancel')=>{try{screen.guard();invitationRequest(row,verb,screen.live.current.social.invitations,wallNow());setConfirm({row,verb});setError(null);}catch(value){failure(value);}};
 const rows=social.invitations.filter(value=>tab==='created'?value.creator_id===screen.auth.scope.userId:value.creator_id!==screen.auth.scope.userId);
 const page=social.pages.invitations,route=choices.routes.find(value=>value.id===routeId),friends=social.friends.filter(value=>value.state==='accepted');
 const course=choices.courses.find(value=>value.id===route?.approved_course_id),sessions=choices.sessions.filter(value=>value.course_id===course?.id&&Date.parse(value.ends_at)>now);
 const renderRow=(item:InvitationRow)=>{
  const actionable=allowed&&item.state==='open'&&Date.parse(item.starts_at)>now,status=item.state==='cancelled'?'m5a.cancelled':Date.parse(item.starts_at)<=now?'m5a.started':item.member?`m5a.${item.member.state}` as const:'m5a.created';
  return <View style={{paddingVertical:20,borderBottomWidth:1,borderBottomColor:colors.line,gap:12}}><Row style={{justifyContent:'space-between'}}><T muted size={12}>{t(item.mode==='group_ride'?'m5a.groupRide':'m5a.timedRace')}</T><T size={12} style={{color:colors.accent}}>{t(status)}</T></Row><T weight="semibold" size={20}>{item.route_summary?.title??t('m5a.route')}</T><T muted size={13}>{item.creator_name??t('m5a.creatorUnknown')}</T><T muted size={13}>{dates(item.starts_at,item.ends_at)}</T>{item.mode==='timed_race'&&<Note>{t('m5a.timedBody')}</Note>}
   {!item.route_snapshot&&<Note>{t('m5a.historical')}</Note>}
   {item.can_cancel?<Button small secondary label={t('m5a.cancelInvitation')} disabled={!actionable} onPress={()=>openConfirm(item,'cancel')}/>:item.member?.state==='invited'?<Row style={{flexWrap:'wrap'}}>{item.route_snapshot&&<Button small label={t('m5a.viewRoute')} disabled={!actionable} onPress={()=>openView(item)}/>}<Button small secondary label={t('m5a.decline')} disabled={!actionable} onPress={()=>act(item,'decline')}/></Row>:item.member?.state==='accepted'?<Button small secondary label={t('m5a.withdraw')} disabled={!actionable} onPress={()=>openConfirm(item,'withdraw')}/>:null}
  </View>;
 };
 return <View style={{flex:1,backgroundColor:colors.bg}}><FlatList data={rows} keyExtractor={value=>value.id} renderItem={({item})=>renderRow(item)} scrollEnabled={!screen.moving} contentContainerStyle={{paddingHorizontal:24,paddingTop:embedded?8:insets.top+18,paddingBottom:124+insets.bottom}} refreshControl={<RefreshControl refreshing={social.loading} tintColor={colors.accent} enabled={!screen.moving} onRefresh={()=>{if(!screen.moving)void social.refresh().catch(failure);}}/>}
  ListHeaderComponent={<View style={{gap:18}}><SocialHeader title={t('m5a.invitations')} body={t('m5a.invitationsBody')} embedded={embedded} action={<Button small icon="add-outline" label={t('m5a.create')} disabled={!allowed} onPress={openCreate}/>}/><SocialReadState/>{screen.moving&&<Note>{t('m5a.moving')}</Note>}{screen.online===false&&<Note>{t('m5a.connectionHint')}</Note>}<SocialPending/>{operationId&&(social.latest?.operationId===operationId&&social.latest.status==='rejected'?<Note error>{t(errorKey(social.latest.error,'social'))}</Note>:<Note>{t(social.latest?.operationId===operationId&&social.latest.status==='applied'?'m5a.applied':'m5a.pendingQueued')}</Note>)}{(error||social.error)&&<Note error>{error??t(errorKey(social.error,'social'))}</Note>}<Segments value={tab} items={[{value:'received',label:t('m5a.received')},{value:'created',label:t('m5a.created')}]} onChange={value=>{if(!screen.moving)setTab(value);}}/></View>}
  ListEmptyComponent={social.ready&&social.fresh&&!page.loading&&!page.error?<View style={{paddingTop:24}}><Empty icon="flag-outline" title={t('m5a.noInvitations')} body={t('m5a.noInvitationsBody')}/></View>:null}
  ListFooterComponent={<View style={{gap:12,paddingTop:18}}>{page.loading&&<ActivityIndicator color={colors.accent}/>}{page.error&&<Note error>{t(errorKey(page.error,'social'))}</Note>}{(page.hasMore||page.error)&&<Button small secondary label={t(page.error?'m5a.refresh':'m5a.loadMore')} disabled={screen.moving||page.loading} onPress={()=>void (page.error?social.refresh():social.loadMoreInvitations()).catch(failure)}/>}</View>}/>
  <RouteSheet visible={create&&!screen.moving&&screen.focused&&screen.active} title={t(review?'m5a.reviewTitle':'m5a.create')} onClose={closeCreate}>{create&&(review?<><T size={20} weight="semibold">{t('m5a.inviteTo',{name:review.value.friend.display_name})}</T><T muted>@{review.value.friend.handle}</T><T>{t(review.value.mode==='group_ride'?'m5a.groupBody':'m5a.timedBody')}</T>{review.value.course&&<T>{review.value.course.name}</T>}<T>{dates(review.value.startsAt,review.value.endsAt)}</T><SharedRouteSnapshot value={review.value.shared} invitation/><Note>{t('m5a.sharedRoute')}</Note>{error&&<Note error>{error}</Note>}<Button label={t('m5a.sendInvite')} disabled={!allowed} busy={busy} onPress={sendReview}/><Button secondary label={t('m5a.cancel')} onPress={()=>{request.current++;setReview(null);}}/></>:<>
   {loading?<Row><ActivityIndicator color={colors.accent}/><T>{t('m5a.loading')}</T></Row>:!choicesLoaded?<><Note>{t('m5a.readUnavailable')}</Note>{error&&<Note error>{error}</Note>}<Button secondary label={t('m5a.refresh')} disabled={!allowed} onPress={loadChoices}/></>:<><T weight="semibold">{t('m5a.chooseRoute')}</T>{!choices.routes.length?<><Note>{t('m5a.noSavedRoutes')}</Note><Button secondary label={t('m5a.openPlanner')} onPress={()=>{closeCreate();router.push('/routes');}}/></>:choices.routes.map(value=><Button key={value.id} small secondary={routeId!==value.id} label={value.title} disabled={!allowed} onPress={()=>{setRouteId(value.id);setSessionId(null);setConsent(false);}}/>)}
    {choices.routeCursor&&<Button small secondary label={t('m5a.loadMoreRoutes')} disabled={!allowed||paging!==null} busy={paging==='routes'} onPress={()=>moreChoices('routes')}/>}
    <T weight="semibold">{t('m5a.chooseFriend')}</T><T muted size={12}>{t('m5a.loadedFriendsHint')}</T>{!friends.length&&!social.pages.friends.hasMore?<Note>{t('m5a.noAcceptedFriends')}</Note>:friends.map(value=><Button key={value.user_id} small secondary={friendId!==value.user_id} label={`${value.display_name} · @${value.handle}`} disabled={!allowed} onPress={()=>setFriendId(value.user_id)}/>)}
    {social.pages.friends.hasMore&&<Button small secondary label={t('m5a.loadMore')} disabled={!allowed||social.pages.friends.loading} busy={social.pages.friends.loading} onPress={()=>social.loadMoreFriends().catch(failure)}/>}
    <Segments value={mode} items={[{value:'group_ride',label:t('m5a.groupRide')},{value:'timed_race',label:t('m5a.timedRace')}]} onChange={value=>{if(!screen.enabled)return;setMode(value);setConsent(false);setSessionId(null);}}/>
    <T muted>{t(mode==='group_ride'?'m5a.groupBody':'m5a.timedBody')}</T><Field label={t('m5a.startTime')} value={start} onChangeText={setStart} editable={allowed} maxLength={16}/><T muted size={12}>{t('m5a.localTime')}</T>
    {mode==='timed_race'&&(!route||!course||route.approved_revision!==route.revision||!sessions.length?<Note>{t(choices.courseCursor||choices.sessionCursor?'m5a.approvalMoreHint':'m5a.noCourses')}</Note>:<><T>{course.name}</T><T weight="semibold">{t('m5a.session')}</T>{sessions.map(value=><Button key={value.id} small secondary={sessionId!==value.id} label={dates(value.starts_at,value.ends_at)} disabled={!allowed} onPress={()=>{setSessionId(value.id);setStart(localDateInput(Math.ceil(Math.max(Date.parse(value.starts_at),wallNow()+300000)/60000)*60000));}}/>)}<Row><View style={{flex:1}}><T>{t('m5a.closedCourseConsent')}</T></View><Switch accessibilityLabel={t('m5a.closedCourseConsent')} value={consent} disabled={!allowed} onValueChange={setConsent} trackColor={{false:colors.line,true:colors.accent}}/></Row></>)}
    {mode==='timed_race'&&choices.courseCursor&&<Button small secondary label={t('m5a.loadMoreCourses')} disabled={!allowed||paging!==null} busy={paging==='courses'} onPress={()=>moreChoices('courses')}/>}
    {mode==='timed_race'&&choices.sessionCursor&&<Button small secondary label={t('m5a.loadMoreSessions')} disabled={!allowed||paging!==null} busy={paging==='sessions'} onPress={()=>moreChoices('sessions')}/>}
    {error&&<Note error>{error}</Note>}<Button label={t('m5a.review')} disabled={!allowed||!routeId||!friendId||(mode==='timed_race'&&(!sessionId||!consent))} busy={busy} onPress={buildReview}/><Button small secondary label={t('m5a.refresh')} disabled={!allowed} onPress={loadChoices}/></>}
  </>)}</RouteSheet>
  <RouteSheet visible={!!view&&!screen.moving&&screen.focused&&screen.active} title={t('m5a.viewRoute')} onClose={()=>setView(null)}>{view&&<><SharedRouteSnapshot value={view.route_snapshot} invitation/><T>{t(view.mode==='group_ride'?'m5a.groupBody':'m5a.timedBody')}</T><T>{dates(view.starts_at,view.ends_at)}</T>{error&&<Note error>{error}</Note>}<Button label={t('m5a.accept')} disabled={!allowed||!view.route_snapshot} busy={busy} onPress={()=>act(view,'accept')}/></>}</RouteSheet>
  <RouteSheet visible={!!confirm&&!screen.moving&&screen.focused&&screen.active} title={t(confirm?.verb==='cancel'?'m5a.cancelInvitation':'m5a.withdraw')} onClose={()=>setConfirm(null)}>{confirm&&<><T>{t(confirm.verb==='cancel'?'m5a.cancelInvitationBody':'m5a.withdrawBody')}</T>{error&&<Note error>{error}</Note>}<Button label={t('m5a.confirm')} disabled={!allowed} busy={busy} onPress={()=>act(confirm.row,confirm.verb)}/></>}</RouteSheet>
 </View>;
}
