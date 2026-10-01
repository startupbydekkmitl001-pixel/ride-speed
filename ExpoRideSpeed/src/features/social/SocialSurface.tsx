import {router} from 'expo-router';
import React,{useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {Button,Empty,Heading,Note,Panel,Row,T} from '../../components/ui';
import {useI18n,errorKey} from '../../lib/i18n';
import {useApp} from '../../state/AppState';
import {useSocial} from '../../state/SocialState';
import {RouteSheet} from '../routes/RouteSheet';
import type {StoredSocialOperation} from './types';
import {useSocialScreen} from './useSocialScreen';

export function SocialHeader({title,body,embedded=false,action}:{title:string;body:string;embedded?:boolean;action?:React.ReactNode}){
 const {t}=useI18n();
 return <View style={{gap:14}}>{!embedded&&<Row style={{justifyContent:'space-between'}}><Button small secondary icon="arrow-back-outline" label={t('m5a.back')} onPress={()=>router.replace('/')}/>{action}</Row>}<Heading eyebrow={t('m5a.communityEyebrow')} title={title}/><T muted>{body}</T>{embedded&&action}</View>;
}
export function SocialReadState(){
 const {auth,social}=useSocialScreen(),{t}=useI18n(),{colors}=useApp();
 if(!auth.session)return <Panel><T>{t('m5a.errors.authRequired')}</T><Button label={t('auth.login')} onPress={()=>router.push('/auth')}/></Panel>;
 if(social.loading)return <Row><ActivityIndicator color={colors.accent}/><T muted>{t('m5a.loading')}</T></Row>;
 if(social.ready&&!social.profileReady&&social.fresh)return <Panel><Note>{t('m5a.errors.profileRequired')}</Note><Button label={t('profile.edit')} onPress={()=>router.push('/profile')}/></Panel>;
 if(!social.ready||!social.fresh)return <Note error>{t('m5a.readUnavailable')}</Note>;
 return null;
}
function actionLabel(operation:StoredSocialOperation,t:ReturnType<typeof useI18n>['t']){
 const value=operation.request;
 if(value.action==='request_friend')return `${t('m5a.requestFriend')} · @${value.handle}`;
 if(value.action==='set_presence')return t(value.enabled?'m5a.presenceEnable':'m5a.presenceOff');
 if(value.action==='friend_action')return t(value.verb==='accept'?'m5a.accept':value.verb==='decline'?'m5a.decline':value.verb==='block'?'m5a.block':value.verb==='remove'?'m5a.removeFriend':'m5a.cancelRequest');
 if(value.action==='unblock')return t('m5a.unblock');
 return t('m5a.pendingInvitation');
}
export function SocialPending(){
 const social=useSocial(),screen=useSocialScreen(),{t}=useI18n();
 const [review,setReview]=useState<StoredSocialOperation|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const retry=async()=>{const captured=review;if(!captured)return;try{screen.guard();if(!screen.live.current.social.pending.some(value=>value.operationId===captured.operationId&&JSON.stringify(value.request)===JSON.stringify(captured.request)))throw Error('SOCIAL_OPERATION_CONFLICT');setBusy(true);await screen.live.current.social.retry(captured.operationId);if(screen.current())setReview(null);}catch(value){if(screen.current())setError(t(errorKey(value,'social')));}finally{if(screen.current())setBusy(false);}};
 if(!social.pending.length)return null;
 return <Panel><T weight="semibold">{t('m5a.pendingTitle')}</T><T muted size={13}>{t('m5a.pendingBody')}</T>{social.pending.map(operation=><View key={operation.operationId} style={{gap:8}}><T size={13}>{actionLabel(operation,t)}</T>{operation.lastError&&<Note error>{t(errorKey(operation.lastError,'social'))}</Note>}<Button small secondary disabled={!screen.enabled} label={t('m5a.retryReview')} onPress={()=>{try{screen.guard();setError(null);setReview(operation);}catch(value){setError(t(errorKey(value,'social')));}}}/></View>)}{error&&<Note error>{error}</Note>}<RouteSheet visible={!!review&&!screen.moving&&screen.focused&&screen.active} title={t('m5a.retryReview')} onClose={()=>setReview(null)}>{review&&<><T>{actionLabel(review,t)}</T><T>{t(review.request.action==='request_friend'?'m5a.retryHandleBody':'m5a.retryBody')}</T><Button label={t('m5a.retrySame')} disabled={!screen.enabled} busy={busy} onPress={()=>void retry()}/></>}</RouteSheet></Panel>;
}
export function SocialEmpty({title,body}:{title:string;body:string}){return <Empty title={title} body={body} icon="people-outline"/>;}
