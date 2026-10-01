import {Directory,File,Paths} from 'expo-file-system';
import {randomUUID} from 'expo-crypto';
import {isCommunityId} from './model';
import type {CommunityPhotoDisk,CommunityPhotoKey} from './CommunityPhotoStore';
const root=(owner:string)=>{if(!isCommunityId(owner))throw Error('ACCOUNT_CHANGED');return new Directory(Paths.document,'ride-community-photos-v1',owner);};
const name=(key:CommunityPhotoKey)=>{if(!isCommunityId(key.post_id)||!isCommunityId(key.media_id))throw Error('COMMUNITY_PHOTO_INVALID');return `${key.post_id}.${key.media_id}.jpg`;};
const file=(owner:string,key:CommunityPhotoKey)=>new File(root(owner),name(key));
export const communityPhotoDisk:CommunityPhotoDisk={
 async read(owner,key){const target=file(owner,key);if(!target.exists)return null;if(target.size<1||target.size>1048576)throw Error('COMMUNITY_PHOTO_INVALID');return target.bytes();},
 async list(owner){const dir=root(owner);if(!dir.exists)return [];return dir.list().flatMap(item=>{const match=/^([a-f0-9-]{36})\.([a-f0-9-]{36})\.jpg$/.exec(item.name);return match&&isCommunityId(match[1])&&isCommunityId(match[2])?[{post_id:match[1],media_id:match[2]}]:[];});},
 async writeNew(owner,key,bytes){const dir=root(owner),target=file(owner,key);dir.create({intermediates:true,idempotent:true});if(target.exists)throw Error('COMMUNITY_MEDIA_INVALID');const partial=`${name(key)}.${randomUUID()}.partial`,temp=new File(dir,partial),cleanup=new File(dir,partial);try{temp.create({overwrite:false});temp.write(bytes);await temp.move(target,{overwrite:false});}finally{if(cleanup.exists)cleanup.delete();}},
 async remove(owner,key){const target=file(owner,key);if(target.exists)target.delete();},
 async removeOwner(owner){const dir=root(owner);if(dir.exists)dir.delete();},
};
