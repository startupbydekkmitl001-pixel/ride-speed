import React,{useCallback,useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {Button,Heading,Note,Panel,Row,Screen,T} from '../../components/ui';
import {communityErrorKey} from '../../lib/communityI18n';
import {RouteSheet} from '../routes/RouteSheet';
import {CommunityChoices,CommunityStatus} from './CommunityParts';
import {communityOwnerKey,type CommunityOwnerPost} from './communityOwnerModel';
import type {CommunityOwnerRead} from './CommunityOwnerReader';
import type {CommunityAudience} from './types';
import type {CommunityBasePort,CommunityTranslator} from './uiTypes';
import {useCommunityUI} from './useCommunityUI';
export interface CommunityOwnerScreenPort extends CommunityBasePort{
 rows:readonly CommunityOwnerPost[];read:CommunityOwnerRead;detailRead:CommunityOwnerRead;
 refresh:()=>Promise<void>;loadMore:()=>Promise<void>;reviewPost:(postId:string)=>Promise<CommunityOwnerPost>;
 currentPost:(post:CommunityOwnerPost)=>boolean;apply:(post:CommunityOwnerPost,action:'audience'|'delete_post',visibility?:CommunityAudience,callerGuard?:()=>void)=>Promise<string|null>;onBack:()=>void;
}
export function CommunityOwnerScreen({port,t}:{port:CommunityOwnerScreenPort;t:CommunityTranslator}){
 const ui=useCommunityUI(port,{requireProfile:false}),[review,setReview]=useState<CommunityOwnerPost|null>(null),[audience,setAudience]=useState<CommunityAudience>('private'),[deleting,setDeleting]=useState(false),[reviewVersion,setReviewVersion]=useState(0),[deleteVersion,setDeleteVersion]=useState<number|null>(null),epoch=useRef(0),authority=useRef<{key:string;version:number;deleteVersion:number|null}|null>(null);
 const invalidate=ui.invalidate;
 const close=useCallback(()=>{++epoch.current;authority.current=null;setReview(null);setDeleting(false);setDeleteVersion(null);invalidate();},[invalidate]);
 // Presentation consent is not restored by another lifecycle or canonical read.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{close();},[port.generation,port.gate.focused,port.gate.foreground,port.gate.moving,close]);
 const selected=review&&port.currentPost(review)?review:null,ownerEnabled=ui.canEdit&&port.gate.online;
 // Owner metadata controls require Auth and a current owned CAS, independently of social profile setup.
 const open=(id:string)=>ui.run(async p=>{if(!p.gate.online)throw Error('COMMUNITY_UNAVAILABLE');authority.current=null;const sequence=++epoch.current,row=await p.reviewPost(id);if(!ui.current()||sequence!==epoch.current)return;const current=ui.guard('control');if(!current.gate.online||!current.currentPost(row))throw Error('COMMUNITY_CHANGED');authority.current={key:communityOwnerKey(row),version:sequence,deleteVersion:null};setReviewVersion(sequence);setReview(row);setAudience(row.visibility);setDeleting(false);setDeleteVersion(null);});
 const assertReview=(kind:'edit'|'control'='control',canonical=true)=>{const p=canonical?ui.guard(kind):ui.latest.current,proof=authority.current;if(!canonical&&(!ui.current()||!p.gate.signedIn||!p.gate.focused||!p.gate.foreground||p.gate.moving))throw Error('COMMUNITY_CHANGED');if(!review||!proof||proof.version!==reviewVersion||proof.key!==communityOwnerKey(review)||canonical&&!p.currentPost(review))throw Error('COMMUNITY_CHANGED');return p;};
 const choose=(value:CommunityAudience)=>{try{assertReview('edit');const version=++epoch.current;authority.current={key:communityOwnerKey(review!),version,deleteVersion:null};setReviewVersion(version);setAudience(value);setDeleting(false);setDeleteVersion(null);}catch{/* Retired input cannot modify consent. */}};
 const askDelete=()=>{try{assertReview();if(!review||review.state==='deleted'||review.state==='draft')throw Error('COMMUNITY_CHANGED');const version=++epoch.current;authority.current={...authority.current!,deleteVersion:version};setDeleteVersion(version);setDeleting(true);}catch{/* A fresh owned CAS is required. */}};
 const apply=(action:'audience'|'delete_post')=>ui.run(async p=>{const check=(canonical=true)=>{assertReview('control',canonical);if(!review||!selected||communityOwnerKey(review)!==communityOwnerKey(selected)||action==='delete_post'&&(!deleting||deleteVersion===null||authority.current?.deleteVersion!==deleteVersion))throw Error('COMMUNITY_CHANGED');};check();const id=await p.apply(review!,action,action==='audience'?audience:undefined,()=>check());
  // The parent retires canonical read authority after durable queue acceptance. Local consent still fences presentation.
  check(false);authority.current=null;if(ui.current()){setReview(null);setDeleting(false);setDeleteVersion(null);}return id;});
 const header=<View style={{gap:24,paddingBottom:24}}><Heading eyebrow="" title={t('m7.owner.title')} right={<Button small secondary label={t('m7.back')} disabled={!ui.canNavigate} onPress={()=>ui.run(p=>p.onBack(),'navigation')}/>}/><T muted>{t('m7.owner.body')}</T>{port.gate.moving&&<Note>{t('m7.moving')}</Note>}{!port.gate.online&&<Note>{t('m7.offline')}</Note>}{!port.gate.signedIn?<><Note>{t('m7.signInBody')}</Note><Button label={t('m7.signIn')} disabled={!ui.canNavigate} onPress={()=>ui.run(p=>p.onSignIn(),'navigation')}/></>:<><CommunityStatus port={port} t={t} operation={ui.operation} error={ui.error} retry={()=>void ui.run(p=>p.retry())}/><Button secondary label={t('m7.refresh')} disabled={!ui.canEdit||ui.busy||!port.gate.online} busy={port.read.loading} onPress={()=>ui.run(p=>p.refresh(),'read')}/>{port.read.error&&<Note error>{t(port.read.error==='COMMUNITY_CAPACITY'?'m7.owner.capacity':communityErrorKey(port.read.error))}</Note>}{port.read.loading&&<Note>{t('m7.loading')}</Note>}{!port.read.fresh&&!port.read.loading&&<Note>{t('m7.stale')}</Note>}{port.read.fresh&&!port.read.error&&port.rows.length===0&&<Note>{t('m7.owner.empty')}</Note>}</>}</View>;
 return <Screen scroll={false} style={{flex:1}}><FlashList data={port.gate.signedIn?port.rows:[]} keyExtractor={row=>row.post_id} scrollEnabled={!port.gate.moving} contentContainerStyle={{paddingBottom:24}} ListHeaderComponent={header} renderItem={({item:row})=><View style={{paddingBottom:16}}><Panel><Row style={{justifyContent:'space-between',flexWrap:'wrap'}}><T weight="semibold">{t('m7.owner.row',{id:row.post_id.slice(-8)})}</T><T size={12}>{t(`m7.owner.state.${row.state}`)}</T></Row><T size={13}>{t(`m7.audience.${row.visibility}`)}</T><T muted size={12}>{t('m7.owner.revision',{revision:row.content_revision,time:new Date(row.updated_at).toLocaleString(port.locale)})}</T><Button secondary small label={t('m7.owner.review')} disabled={!ownerEnabled||ui.busy||!port.read.fresh} onPress={()=>open(row.post_id)}/></Panel></View>} ListFooterComponent={port.gate.signedIn&&port.read.hasMore?<Button secondary label={t('m7.owner.more')} disabled={!ui.canEdit||ui.busy||!port.read.fresh||!port.gate.online} onPress={()=>ui.run(p=>p.loadMore(),'read')}/>:null}/>
 <RouteSheet visible={!!selected&&port.gate.focused&&port.gate.foreground&&!port.gate.moving} title={t('m7.owner.reviewTitle')} onClose={close}>{selected&&<View style={{gap:16}}>
  <T>{t('m7.owner.row',{id:selected.post_id.slice(-8)})}</T><T>{t(`m7.owner.state.${selected.state}`)}</T><Note>{t('m7.owner.metadata')}</Note>{selected.state==='hidden'&&<Note>{t('m7.owner.hidden')}</Note>}
  {selected.state==='deleted'||selected.state==='draft'?<Note>{t(selected.state==='deleted'?'m7.owner.deleted':'m7.localDraft')}</Note>:<>
   <Note>{t('m7.owner.confirmBody')}</Note><CommunityChoices values={(['private','friends','public'] as const).map(value=>({value,label:t(`m7.audience.${value}`)}))} selected={audience} disabled={!ownerEnabled||ui.busy} onChange={choose}/>
   <Button label={t('m7.confirmAudience')} disabled={!ownerEnabled||ui.busy} onPress={()=>apply('audience')}/><Button secondary icon="trash-outline" label={t('m7.deletePost')} disabled={!ownerEnabled||ui.busy} onPress={askDelete}/>
   {deleting&&<><Note>{t('m7.deleteBody')}</Note><Button label={t('m7.confirmDelete')} disabled={!ownerEnabled||ui.busy} onPress={()=>apply('delete_post')}/></>}
  </>}
 </View>}</RouteSheet></Screen>;
}
