import type {CommunityPhotoDescriptor} from './content';
import {communityCanonical,communityLocalErrors,freezeCommunityDraftDocument,freezeCommunityLocal,parseCommunityDrafts,type CommunityDraftRecord,type CommunityLocalPhoto} from './localModel';
import {communityErrors,freezeCommunityRequest,isCommunityId,validateAttachmentReview,validateCommunityReceipt,validateMediaCommit,validateMediaReservation,validatePostReservation} from './model';
import type {CommunityAttachmentReview,CommunityAttachmentSelection,CommunityErrorCode,CommunityMediaCommit,CommunityMediaReservation,CommunityPostReservation,CommunityPublicationDocument,CommunityReceipt,CommunityRequest,CommunityVerifiedMedia} from './types';
import type {CommunityPublishReview} from './uiTypes';

export interface CommunityDraftPort {
 ownerId:string;
 /** owner remains usable for canonical settlement when the composer is closed. */
 guard:(kind:'owner'|'edit'|'control')=>void;
 /** Changes on blur/background and again on return, so activity ABA never revives a review. */
 activityVersion:()=>string|number;
 read:()=>readonly CommunityDraftRecord[];
 update:(reduce:(fresh:CommunityDraftRecord[])=>CommunityDraftRecord[])=>Promise<void>;
 flush:()=>Promise<void>;
 operationId:()=>string;nowISO:()=>string;
 reservePost:(postId:string)=>Promise<CommunityPostReservation>;
 reserveMedia:(postId:string,mediaId:string,descriptor:CommunityPhotoDescriptor)=>Promise<CommunityMediaReservation>;
 /** The owner-scoped private store verifies the descriptor digest before returning immutable bytes. */
 readPhoto:(postId:string,mediaId:string,descriptor:CommunityPhotoDescriptor)=>Promise<Uint8Array>;
 upload:(reservation:CommunityMediaReservation,bytes:Uint8Array,options:{contentType:'image/jpeg';upsert:false})=>Promise<void>;
 commitMedia:(postId:string,mediaId:string,descriptor:CommunityPhotoDescriptor)=>Promise<CommunityMediaCommit>;
 attachmentReview:(selection:CommunityAttachmentSelection)=>Promise<CommunityAttachmentReview>;
 /** Existing coordinator persists an exact operation and performs status-first retry. Null is ambiguous. */
 enqueue:(request:CommunityRequest,operationId:string)=>Promise<string|null>;
}
export type CommunityDraftPhotoInput=Readonly<{media_id:string;descriptor:CommunityPhotoDescriptor}>;
const transient=new Set<string>(['COMMUNITY_UNAVAILABLE','COMMUNITY_RATE_LIMITED','COMMUNITY_AUTH_REQUIRED']);
const errorCode=(value:unknown)=>value&&typeof value==='object'&&'message' in value&&typeof value.message==='string'?value.message:'';
const safeError=(value:unknown)=>communityLocalErrors.includes(errorCode(value) as typeof communityLocalErrors[number])?errorCode(value):'COMMUNITY_UNAVAILABLE';
const boundedError=(value:unknown)=>errorCode(value)==='COMMUNITY_REVIEW_REQUIRED'?'COMMUNITY_REVIEW_REQUIRED':errorCode(value)==='COMMUNITY_LOCAL_INVALID'?'COMMUNITY_INVALID':errorCode(value)==='COMMUNITY_PHOTO_UNAVAILABLE'?'COMMUNITY_MEDIA_UNAVAILABLE':safeError(value);
const documentKey=(draft:CommunityDraftRecord)=>communityCanonical({revision:draft.revision,document:draft.document,photos:draft.photos.map(p=>({media_id:p.media_id,descriptor:p.descriptor}))});
const publication=(draft:CommunityDraftRecord):CommunityRequest=>freezeCommunityRequest({schema_version:1,action:'publish',post_id:draft.post_id,expected_revision:draft.post_revision,document:draft.document});

/** This controller stores no URI, signed URL, GPS geometry or credential. Preparation and consent
 * are memory leases; only the exact reviewed publication crosses the durable pending boundary. */
export class CommunityDraftController {
 private closed=false;private writes:Promise<unknown>=Promise.resolve();
 private epochs=new Map<string,number>();
 private reviews=new Map<string,{value:CommunityPublishReview;activity:string|number;epoch:number}>();
 constructor(private port:CommunityDraftPort){}
 close(){this.closed=true;this.reviews.clear();}
 private owner(){if(this.closed||!isCommunityId(this.port.ownerId))throw Error('ACCOUNT_CHANGED');this.port.guard('owner');}
 private rows(){this.owner();return parseCommunityDrafts(this.port.read(),this.port.ownerId);}
 private row(id:string){const row=this.rows().find(d=>d.draft_id===id);if(!row)throw Error('COMMUNITY_DRAFT_UNAVAILABLE');return row;}
 private retire(id:string){this.reviews.delete(id);const value=(this.epochs.get(id)??0)+1;this.epochs.set(id,value);return value;}
 private lease(kind:'edit'|'control') {this.owner();this.port.guard(kind);const activity=this.port.activityVersion();return ()=>{this.owner();if(this.port.activityVersion()!==activity)throw Error('COMMUNITY_REVIEW_REQUIRED');this.port.guard(kind);};}
 private async external<T>(promise:Promise<T>,check:()=>void):Promise<T>{let value:T;try{value=await promise;}catch(error){check();throw Error(boundedError(error));}check();return value;}
 private commit(reduce:(rows:CommunityDraftRecord[])=>CommunityDraftRecord[],check:()=>void=()=>this.owner()){
  const task=this.writes.catch(()=>{}).then(async()=>{check();await this.external(this.port.update(fresh=>{check();return parseCommunityDrafts(reduce(parseCommunityDrafts(fresh,this.port.ownerId)),this.port.ownerId);}),check);await this.external(this.port.flush(),check);});this.writes=task.catch(()=>{});return task;
 }
 async create():Promise<CommunityDraftRecord>{
  const check=this.lease('edit'),id=this.port.operationId(),postId=this.port.operationId(),now=this.port.nowISO();
  const draft:CommunityDraftRecord={owner_id:this.port.ownerId,draft_id:id,post_id:postId,revision:1,document:{schema_version:1,caption:'',description:'',visibility:'friends',ride:null,route:null,include_ride_route:false,media_ids:[]},photos:[],post_revision:0,status:'local',operationId:null,error:null,created_at:now,updated_at:now};parseCommunityDrafts([draft],this.port.ownerId);
  await this.commit(rows=>{if(rows.length>=4)throw Error('COMMUNITY_CAPACITY');return [...rows,draft];},check);return this.row(id);
 }
 async edit(id:string,document:CommunityPublicationDocument):Promise<void>{
  const check=this.lease('edit'),next=freezeCommunityDraftDocument(document);this.retire(id);
  await this.commit(rows=>rows.map(d=>{if(d.draft_id!==id)return d;if(d.status==='pending'||d.status==='published')throw Error('COMMUNITY_CHANGED');if(communityCanonical(next.media_ids)!==communityCanonical(d.photos.map(p=>p.media_id)))throw Error('COMMUNITY_INVALID');return {...d,revision:d.revision+1,document:next,status:'local',error:null,updated_at:this.port.nowISO()};}),check);this.row(id);
 }
 async setPhotos(id:string,input:readonly CommunityDraftPhotoInput[]):Promise<void>{
  const check=this.lease('edit'),photos=freezeCommunityLocal(input);if(photos.length>6)throw Error('COMMUNITY_CAPACITY');this.retire(id);
  await this.commit(rows=>rows.map(d=>{if(d.draft_id!==id)return d;if(d.status==='pending'||d.status==='published')throw Error('COMMUNITY_CHANGED');
   const next:CommunityLocalPhoto[]=photos.map(p=>{const previous=d.photos.find(v=>v.media_id===p.media_id);if(previous&&communityCanonical(previous.descriptor)!==communityCanonical(p.descriptor))throw Error('COMMUNITY_OPERATION_CONFLICT');return previous??{media_id:p.media_id,descriptor:p.descriptor,reservation:null,commit:null};});
   return {...d,revision:d.revision+1,photos:next,document:{...d.document,media_ids:next.map(p=>p.media_id)},status:'local',error:null,updated_at:this.port.nowISO()};}),check);this.row(id);
 }
 async review(id:string):Promise<CommunityPublishReview>{
  const activity=this.port.activityVersion(),checkActivity=this.lease('control'),draft=this.row(id);if(draft.status==='pending'||draft.status==='published')throw Error('COMMUNITY_CHANGED');publication(draft);
  const epoch=this.retire(id),key=documentKey(draft),check=()=>{checkActivity();if(this.epochs.get(id)!==epoch||documentKey(this.row(id))!==key)throw Error('COMMUNITY_CHANGED');};
  const checkpoint=async(reduce:(current:CommunityDraftRecord)=>CommunityDraftRecord)=>{await this.commit(rows=>{const fresh=rows.find(d=>d.draft_id===id);if(!fresh||documentKey(fresh)!==key||fresh.status==='pending'||fresh.status==='published')throw Error('COMMUNITY_CHANGED');return rows.map(d=>d.draft_id===id?reduce(d):d);},check);check();};
  try{
   await checkpoint(d=>({...d,status:'preparing',error:null,updated_at:this.port.nowISO()}));
   const reserved=validatePostReservation(await this.external(this.port.reservePost(draft.post_id),check),this.port.ownerId,draft.post_id);if(reserved.revision!==draft.post_revision)throw Error('COMMUNITY_REVISION_CONFLICT');
   const media:CommunityVerifiedMedia[]=[];
   for(const photo of draft.photos){
    check();const reservation=validateMediaReservation(await this.external(this.port.reserveMedia(draft.post_id,photo.media_id,photo.descriptor),check),this.port.ownerId,draft.post_id,photo.media_id);
    await checkpoint(d=>({...d,photos:d.photos.map(p=>p.media_id===photo.media_id?{...p,reservation}:p)}));
    let committed:CommunityMediaCommit;
    if(reservation.state==='committed'){committed=validateMediaCommit(await this.external(this.port.commitMedia(draft.post_id,photo.media_id,photo.descriptor),check),draft.post_id,photo.media_id,photo.descriptor);}
    else{
     const bytes=await this.external(this.port.readPhoto(draft.post_id,photo.media_id,photo.descriptor),check);if(!(bytes instanceof Uint8Array)||bytes.byteLength!==photo.descriptor.byte_count)throw Error('COMMUNITY_PHOTO_INVALID');
     // A lost upload ACK or immutable-object conflict is reconciled by the canonical commit, never an upsert.
     try{await this.port.upload(reservation,Uint8Array.from(bytes),{contentType:'image/jpeg',upsert:false});check();}catch{check();}
     committed=validateMediaCommit(await this.external(this.port.commitMedia(draft.post_id,photo.media_id,photo.descriptor),check),draft.post_id,photo.media_id,photo.descriptor);
    }
    await checkpoint(d=>({...d,photos:d.photos.map(p=>p.media_id===photo.media_id?{...p,commit:committed}:p)}));
    media.push({...committed.descriptor,media_id:photo.media_id,validation:'decoded_jpeg_v1'});
   }
   const selection={ride:draft.document.ride,route:draft.document.route,include_ride_route:draft.document.include_ride_route};
   check();const attachments=validateAttachmentReview(await this.external(this.port.attachmentReview(selection),check),this.port.ownerId,selection);
   await checkpoint(d=>({...d,status:'local',error:null,updated_at:this.port.nowISO()}));
   const value=freezeCommunityLocal<CommunityPublishReview>({review_id:this.port.operationId(),draft_id:id,draft_revision:draft.revision,post_id:draft.post_id,expected_revision:draft.post_revision,document:draft.document,ride:attachments.ride,route:attachments.route,media});
   this.reviews.set(id,{value,activity,epoch});return value;
  }catch(error){
   // Activity retirement may stop I/O but can safely unlock this owner's unchanged preparing draft.
   try{this.owner();if(this.epochs.get(id)===epoch)await this.commit(rows=>rows.map(d=>d.draft_id===id&&documentKey(d)===key&&d.status==='preparing'?{...d,status:'local',error:safeError(Error(boundedError(error))),updated_at:this.port.nowISO()}:d));}catch{/* Local data remains recoverable; no replacement-owner write. */}
   throw Error(boundedError(error));
  }
 }
 async publish(review:CommunityPublishReview):Promise<string|null>{
  const check=this.lease('control'),stored=this.reviews.get(review.draft_id),draft=this.row(review.draft_id);
  if(!stored||stored.value!==review||stored.activity!==this.port.activityVersion()||stored.epoch!==this.epochs.get(review.draft_id))throw Error('COMMUNITY_REVIEW_REQUIRED');
  if(draft.status!=='local'||draft.revision!==review.draft_revision||draft.post_id!==review.post_id||draft.post_revision!==review.expected_revision||communityCanonical(draft.document)!==communityCanonical(review.document))throw Error('COMMUNITY_CHANGED');
  const request=publication(draft),operationId=this.port.operationId();
  await this.commit(rows=>rows.map(d=>{if(d.draft_id!==draft.draft_id)return d;if(documentKey(d)!==documentKey(draft)||d.status!=='local'||this.reviews.get(d.draft_id)?.value!==review)throw Error('COMMUNITY_CHANGED');return {...d,status:'pending',operationId,error:null,updated_at:this.port.nowISO()};}),check);
  this.retire(draft.draft_id);check();const queued=await this.external(this.port.enqueue(request,operationId),check);if(queued!==null&&queued!==operationId)throw Error('COMMUNITY_INVALID_RESPONSE');return queued;
 }
 async retryPending(draftId?:string):Promise<void>{
  const check=this.lease('control');await this.writes;check();await this.external(this.port.flush(),check);
  const pending=this.rows().filter(d=>d.status==='pending'&&(!draftId||d.draft_id===draftId));
  for(const draft of pending){check();const current=this.row(draft.draft_id);if(current.status!=='pending'||current.operationId!==draft.operationId||documentKey(current)!==documentKey(draft))continue;const operationId=draft.operationId!;
   const queued=await this.external(this.port.enqueue(publication(draft),operationId),check);if(queued!==null&&queued!==operationId)throw Error('COMMUNITY_INVALID_RESPONSE');
  }
 }
 async applied(value:CommunityReceipt):Promise<void>{
  this.owner();const receipt=validateCommunityReceipt(value,this.port.ownerId),request=receipt.request,result=receipt.result;if(request.action!=='publish'||result.kind!=='post'||result.state!=='published')return;
  await this.commit(rows=>rows.map(d=>{if(d.operationId!==receipt.operation_id)return d;if(d.status==='published'){if(d.post_id!==request.post_id||communityCanonical(d.document)!==communityCanonical(request.document)||d.post_revision!==result.content_revision)throw Error('COMMUNITY_INVALID_RESPONSE');return d;}
   if(d.status!=='pending')return d;validateCommunityReceipt(receipt,this.port.ownerId,{operationId:d.operationId!,request:publication(d)});
   return {...d,status:'published',post_revision:result.content_revision,error:null,updated_at:this.port.nowISO()};}));
 }
 async rejected(operationId:string,code:CommunityErrorCode):Promise<void>{
  this.owner();if(!isCommunityId(operationId)||!communityErrors.includes(code))throw Error('COMMUNITY_INVALID_RESPONSE');
  const matching=this.rows().filter(d=>d.operationId===operationId&&d.status==='pending');matching.forEach(d=>this.retire(d.draft_id));
  await this.commit(rows=>rows.map(d=>d.operationId===operationId&&d.status==='pending'?{...d,status:transient.has(code)?'pending':'local',operationId:transient.has(code)?d.operationId:null,error:code,updated_at:this.port.nowISO()}:d));
 }
}
