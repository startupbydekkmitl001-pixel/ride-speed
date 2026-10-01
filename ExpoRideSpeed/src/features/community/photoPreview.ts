import {Platform} from 'react-native';
import {Directory,File,Paths} from 'expo-file-system';
import type {AuthScope} from '../../state/AuthState';
import type {CommunityPhotoKey,CommunityPhotoStore} from './CommunityPhotoStore';
import type {CommunityPhotoDescriptor} from './content';
/** Bytes are digest-checked by the store first. The URI is only a foreground memory lease. */
export async function communityPhotoPreview(store:CommunityPhotoStore,scope:AuthScope,key:CommunityPhotoKey,descriptor:CommunityPhotoDescriptor,guard:()=>void){
 const bytes=await store.read(scope,key,descriptor,guard);guard();
 if(Platform.OS==='web'){const uri=URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer],{type:'image/jpeg'}));try{guard();}catch(error){URL.revokeObjectURL(uri);throw error;}return {uri,dispose:()=>URL.revokeObjectURL(uri)};}
 const uri=new File(new Directory(Paths.document,'ride-community-photos-v1',scope.userId!),`${key.post_id}.${key.media_id}.jpg`).uri;guard();return {uri,dispose:()=>{}};
}
