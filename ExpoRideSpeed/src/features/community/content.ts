export const communityLimits={caption:150,legacyCaption:280,description:4000,comment:1000,report:1000,photos:6,photoBytes:1024*1024,photoEdge:1600,rawPhotoBytes:20*1024*1024,rawPhotoPixels:40_000_000} as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function codepointCount(value:string){return Array.from(value).length;}
function safeText(value:unknown,max:number):value is string{
 if(typeof value!=='string'||codepointCount(value)>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value))return false;
 for(const point of value){const code=point.codePointAt(0)!;if(code>=0xD800&&code<=0xDFFF)return false;}
 return true;
}
export const validateCaption=(value:unknown)=>safeText(value,communityLimits.caption);
export const readableCaption=(value:unknown,version:0|1)=>safeText(value,version===0?communityLimits.legacyCaption:communityLimits.caption);
export const validateDescription=(value:unknown)=>safeText(value,communityLimits.description);
export const validateComment=(value:unknown)=>safeText(value,communityLimits.comment)&&value.trim().length>0;
export const validateReportDetail=(value:unknown)=>safeText(value,communityLimits.report);
export function validMediaIds(value:unknown):value is string[]{return Array.isArray(value)&&value.length<=communityLimits.photos&&value.every(v=>typeof v==='string'&&uuid.test(v))&&new Set(value).size===value.length;}
export type CommunityPhotoDescriptor={mime:'image/jpeg';sha256:string;byte_count:number;width:number;height:number;blurhash:string|null};
export function validPhotoDescriptor(value:unknown):value is CommunityPhotoDescriptor{
 if(!value||typeof value!=='object')return false;const p=value as CommunityPhotoDescriptor;
 return p.mime==='image/jpeg'&&/^[0-9a-f]{64}$/.test(p.sha256)&&Number.isInteger(p.byte_count)&&p.byte_count>0&&p.byte_count<=communityLimits.photoBytes&&Number.isInteger(p.width)&&Number.isInteger(p.height)&&p.width>0&&p.height>0&&p.width<=communityLimits.photoEdge&&p.height<=communityLimits.photoEdge&&(p.blurhash===null||(typeof p.blurhash==='string'&&p.blurhash.length>=6&&p.blurhash.length<=166&&/^[0-9A-Za-z#$%*+,-.:;=?@\[\]^_{|}~]+$/.test(p.blurhash)));
}
/** Input guard is separate from server decoded-pixel validation; no filename/MIME assertion is trusted. */
export function outputSize(width:number,height:number){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('COMMUNITY_PHOTO_INVALID');
 if(width*height>communityLimits.rawPhotoPixels)throw Error('COMMUNITY_PHOTO_TOO_LARGE');
 const scale=Math.min(1,communityLimits.photoEdge/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export function hasPublicationContent(value:{caption:string;description:string;media_ids:readonly string[];ride:unknown;route:unknown}){return !!(value.caption.trim()||value.description.trim()||value.media_ids.length||value.ride||value.route);}
