import type {AuthScope} from '../../state/AuthState';
import {parseFriendLink} from './model';
import type {IncomingFriendIntent} from './uiTypes';

/** A link is an explicit, expiring review intent; it never triggers a resolver. */
export class IncomingLinkStore{
 private value:IncomingFriendIntent|null=null;
 private receivedAt=0;
 private owner:AuthScope|null=null;
 private clock:()=>number;
 private listeners=new Set<()=>void>();
 constructor(clock:()=>number){this.clock=clock;}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 get(scope:AuthScope):IncomingFriendIntent|null{const now=this.clock();return this.owner===scope&&Number.isFinite(now)&&now>=this.receivedAt&&now-this.receivedAt<300000?this.value:null;}
 bindOwner(scope:AuthScope){if(this.owner===scope)return;if(this.owner?.userId)this.value=null;this.owner=scope;this.notify();}
 capture(path:string):boolean{
  const link=parseFriendLink(path);if(!link)return false;const now=this.clock();if(!Number.isFinite(now)||now<0)return false;
  if(this.value?.linkId===link.linkId&&this.value.token===link.token&&now>=this.receivedAt&&now-this.receivedAt<300000)return true;
  this.value=Object.freeze({linkId:link.linkId,token:link.token});this.receivedAt=now;this.notify();return true;
 }
 consume(scope:AuthScope){const value=this.get(scope);if(this.owner===scope){this.value=null;this.notify();}return value;}
 clear(){this.value=null;this.notify();}
 private notify(){for(const listener of [...this.listeners]){try{listener();}catch{/* A navigation consumer cannot change the intent. */}}}
}
export const incomingLinks=new IncomingLinkStore(()=>performance.now());
export function captureIncomingLink(path:string){return incomingLinks.capture(path);}
