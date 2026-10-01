import * as Linking from 'expo-linking';
import {router} from 'expo-router';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Share} from 'react-native';
import {getSocialSnapshot} from '../social/service';
import type {SocialCursor} from '../social/types';
import {CommunityMediaLease} from './CommunityMediaLease';
import {getCommunityMediaURL,getCommunityPost} from './service';
import type {CommunityPost} from './types';
import type {CommunityPostActions,CommunityPostBinding} from './uiTypes';
import type {useCommunityHost} from './useCommunityHost';
const same=(post:CommunityPost,binding:CommunityPostBinding)=>post.post_id===binding.post_id&&post.owner_id===binding.owner_id&&post.content_revision===binding.content_revision;
const monotonicNow=()=>performance.now();
export function useCommunityActions(h:ReturnType<typeof useCommunityHost>,sourcePost:(binding:CommunityPostBinding)=>CommunityPost|null,findPost:(id:string,revision:number)=>CommunityPost|null){
 const {scope,guard,read,ticket,latest}=h,[selection,setRoute]=useState<{binding:CommunityPostBinding;current:()=>void}|null>(null);
 const cache=useMemo(()=>new CommunityMediaLease({ownerId:scope.userId??'',guard,monotonicNow,source:binding=>{const post=sourcePost(binding),media=post?.media.find(value=>value.media_id===binding.media_id&&value.sha256===binding.sha256);return post&&media?{post,media}:null;},load:(post,media)=>read(session=>getCommunityMediaURL(scope,session,post,media))}),[scope,guard,read,sourcePost]);
 useEffect(()=>()=>cache.close(),[cache]);
 useEffect(()=>{cache.invalidate();},[cache,h.activity.generation,h.activity.active,h.community.privacyKey,h.base.gate.moving]);
 const generation=h.base.generation,currentGeneration=h.base.current;
 const checked=useCallback((binding:CommunityPostBinding)=>{if(!currentGeneration(generation))throw Error('COMMUNITY_CHANGED');guard();const post=sourcePost(binding);if(!post||!same(post,binding))throw Error('COMMUNITY_CHANGED');return post;},[generation,currentGeneration,guard,sourcePost]);
 const actions:Pick<CommunityPostActions,'postCurrent'|'getMediaURL'|'onOpenPost'|'onOpenRoute'|'onShare'|'blockAuthor'|'mutate'>={
  postCurrent:binding=>{try{return !!checked(binding);}catch{return false;}},
  getMediaURL:(binding,refresh)=>read(async(_session,current)=>{checked(binding);const value=await cache.get(binding,refresh);current();checked(binding);return value;}),
  onOpenPost:binding=>{checked(binding);router.push({pathname:'/community-post',params:{postId:binding.post_id}});},
  onOpenRoute:binding=>{const post=checked(binding);if(!post.route||post.route.geometryStatus!=='trimmed'||!post.route.segments.length)throw Error('COMMUNITY_SOURCE_CHANGED');setRoute({binding:{...binding},current:ticket()});},
  onShare:binding=>read(async(session,current)=>{checked(binding);const detail=await getCommunityPost(scope,session,binding.post_id);current();checked(binding);if(!same(detail.post,binding))throw Error('COMMUNITY_CHANGED');const url=Linking.createURL('community-post',{queryParams:{postId:binding.post_id}});current();await Share.share({message:url});current();checked(binding);}),
  blockAuthor:binding=>read(async(session,current)=>{
   const post=checked(binding);if(post.owner_id===scope.userId)throw Error('COMMUNITY_CHANGED');
   // A fresh post read and a genuinely exhausted Social page are required before
   // passing null (no pair). A partially loaded Friends list proves nothing.
   const detail=await getCommunityPost(scope,session,binding.post_id);current();checked(binding);if(!same(detail.post,binding))throw Error('COMMUNITY_CHANGED');
   if(!latest.current.social.fresh){await latest.current.social.refresh();current();checked(binding);}
   if(!latest.current.social.ready||!latest.current.social.fresh||!latest.current.social.profileReady)throw Error('COMMUNITY_PROFILE_REQUIRED');
   let cursor:SocialCursor|null=null;const seen=new Set<string>();
   for(let i=0;i<34;i++){
    current();checked(binding);const page=await getSocialSnapshot(scope,session,30,cursor);current();checked(binding);
    if(!page.self.profile_ready)throw Error('COMMUNITY_PROFILE_REQUIRED');const pair=page.items.find(value=>value.user_id===post.owner_id);
    if(pair||!page.next_cursor){current();checked(binding);return latest.current.social.mutate({schema_version:1,action:'friend_action',other_id:post.owner_id,verb:'block',expected_generation:pair?.generation??null});}
    const key=JSON.stringify(page.next_cursor);if(seen.has(key))throw Error('COMMUNITY_UNAVAILABLE');seen.add(key);cursor=page.next_cursor;
   }
   throw Error('COMMUNITY_UNAVAILABLE');
  }),
  mutate:request=>{
   const current=ticket(),source=findPost(request.post_id,request.expected_revision);if(!source)throw Error('COMMUNITY_CHANGED');const binding={post_id:source.post_id,owner_id:source.owner_id,content_revision:source.content_revision};
   const callerGuard=()=>{current();checked(binding);};callerGuard();
   return latest.current.community.mutate(request,callerGuard);
  },
 };
 let route:CommunityPostBinding|null=null;try{if(!h.base.gate.moving&&!h.community.privacyPending&&h.activity.active){selection?.current();if(selection&&actions.postCurrent(selection.binding))route=selection.binding;}}catch{/* Retired route selections never reopen after a later fresh read. */}
 return{actions,route,closeRoute:()=>setRoute(null),routePost:route?sourcePost(route):null};
}
