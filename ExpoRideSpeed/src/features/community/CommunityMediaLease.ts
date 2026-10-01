import type {CommunityMedia,CommunityMediaURL,CommunityPost} from './types';
import type {CommunityMediaBinding} from './uiTypes';
export type CommunityMediaLeasePort=Readonly<{ownerId:string;guard:()=>void;monotonicNow:()=>number;source:(binding:CommunityMediaBinding)=>{post:CommunityPost;media:CommunityMedia}|null;load:(post:CommunityPost,media:CommunityMedia)=>Promise<CommunityMediaURL>}>;
type Entry={version:number;expiresAt:number;url:string|null;promise:Promise<string>|null};
/** URLs never leave memory. The caller supplies only a current, visible binding. */
export class CommunityMediaLease{
 private entries=new Map<string,Entry>();private generation=0;private closed=false;
 constructor(private port:CommunityMediaLeasePort){}
 invalidate(){++this.generation;this.entries.clear();}
 close(){this.invalidate();this.closed=true;}
 private now(){const n=this.port.monotonicNow();if(!Number.isFinite(n)||n<0)throw Error('COMMUNITY_CHANGED');return n;}
 private source(binding:CommunityMediaBinding){if(this.closed)throw Error('COMMUNITY_CHANGED');this.port.guard();const source=this.port.source(binding);if(!source||source.post.post_id!==binding.post_id||source.post.owner_id!==binding.owner_id||source.post.content_revision!==binding.content_revision||source.media.media_id!==binding.media_id||source.media.sha256!==binding.sha256)throw Error('COMMUNITY_CHANGED');return source;}
 async get(binding:CommunityMediaBinding,refresh=false):Promise<string>{
  const source=this.source(binding),key=JSON.stringify([this.port.ownerId,binding.post_id,binding.owner_id,binding.content_revision,binding.media_id,binding.sha256]),now=this.now(),prior=this.entries.get(key);
  if(!refresh&&prior){if(prior.promise)return prior.promise;if(prior.url&&prior.expiresAt>now)return prior.url;}
  const generation=this.generation,entry:Entry={version:(prior?.version??0)+1,expiresAt:now+60000,url:null,promise:null};
  const check=()=>{this.source(binding);if(generation!==this.generation||this.entries.get(key)!==entry)throw Error('COMMUNITY_CHANGED');};
  const run=async()=>{check();const result=await this.port.load(source.post,source.media);check();if(result.postId!==binding.post_id||result.mediaId!==binding.media_id||result.sha256!==binding.sha256||result.expiresIn!==60||!result.url.startsWith('https://'))throw Error('COMMUNITY_INVALID_RESPONSE');if(this.now()>=entry.expiresAt)throw Error('COMMUNITY_CHANGED');entry.url=result.url;entry.promise=null;return result.url;};
  this.entries.set(key,entry);if(this.entries.size>128){const oldest=this.entries.keys().next().value;if(oldest!==undefined&&oldest!==key)this.entries.delete(oldest);}
  const promise=Promise.resolve().then(run).catch(error=>{if(this.entries.get(key)===entry)this.entries.delete(key);throw error;});entry.promise=promise;return promise;
 }
}
