import {captureIncomingLink} from '../features/live/incomingIntent';

const routes=new Set(['/','/friends','/friend-links','/convoy','/challenges','/routes','/garage','/community','/ranked','/profile','/auth','/auth/callback']);
/** Native-only interception precedes Router parsing; raw link tokens stay in memory. */
export function redirectSystemPath({path}:{path:string;initial:boolean}):string{
 try{
  if(typeof path!=='string'||path.length>2048)return '/';
  if(captureIncomingLink(path))return '/friend-links';
  if(routes.has(path))return path;
  const url=path.startsWith('/community-post?')?new URL(path,'ridespeed://'):new URL(path);
  if(url.protocol!=='ridespeed:'&&url.protocol!=='ridespeed-dev:')return '/';
  const post=url.hostname==='community-post'&&url.pathname===''||url.hostname===''&&url.pathname==='/community-post';
  if(post){const id=url.searchParams.get('postId');if(url.username||url.password||url.port||url.hash||[...url.searchParams.keys()].length!==1||!id||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))return '/';return `/community-post?postId=${id}`;}
  const callback=url.hostname==='auth'&&url.pathname==='/callback'||url.hostname===''&&url.pathname==='/auth/callback';
  if(!callback)return '/';
  const values=new URLSearchParams();
  // Preserve the existing PKCE/recovery callback only. No fragment or arbitrary
  // query parameter is forwarded into Router state.
  for(const key of ['code','sb_flow_id','error_description']){const value=url.searchParams.get(key);if(value!==null&&value.length<=512)values.set(key,value);}
  const query=values.toString();return `/auth/callback${query?`?${query}`:''}`;
 }catch{return '/';}
}
