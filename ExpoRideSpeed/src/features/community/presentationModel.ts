import type {CommunityPublicationDocument,CommunityRouteSnapshot} from './types';
export function speedLabel(mps:number|null,units:'kmh'|'mph'){return mps===null?'—':`${(mps*(units==='mph'?2.2369362920544:3.6)).toFixed(1)} ${units==='mph'?'mph':'km/h'}`;}
export function distanceLabel(meters:number|null,units:'kmh'|'mph'){return meters===null?'—':`${(meters/(units==='mph'?1609.344:1000)).toFixed(1)} ${units==='mph'?'mi':'km'}`;}
export function durationLabel(milliseconds:number){const total=Math.floor(milliseconds/1000),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;}
export function publicationReviewKey(document:CommunityPublicationDocument){return JSON.stringify([document.caption,document.description,document.visibility,document.ride,document.route,document.include_ride_route,document.media_ids]);}
/** A bounded schematic of the already-trimmed projection; separate fragments never join. No basemap/distance claim. */
export function routeOutline(route:CommunityRouteSnapshot,width=320,height=144):string[]{
 if(route.geometryStatus!=='trimmed'||!route.segments.length)return [];
 const budget=512,minima=route.segments.map(part=>Math.min(2,part.length)),available=budget-minima.reduce((n,v)=>n+v,0),total=route.segments.reduce((n,p)=>n+p.length,0),reference=route.segments[0][0].longitude;
 const parts=route.segments.map((part,i)=>{const count=Math.min(part.length,minima[i]+Math.floor(available*part.length/total));return Array.from({length:count},(_,index)=>{const p=part[Math.round(index*(part.length-1)/Math.max(1,count-1))],lng=reference+((((p.longitude-reference)+180)%360+360)%360)-180,y=Math.log(Math.tan(Math.PI/4+p.latitude*Math.PI/360));return {x:lng*Math.PI/180,y:-y};});});
 const points=parts.flat(),xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),padding=16,scale=Math.min((width-padding*2)/Math.max(1e-9,maxX-minX),(height-padding*2)/Math.max(1e-9,maxY-minY)),ox=(width-(maxX-minX)*scale)/2,oy=(height-(maxY-minY)*scale)/2;
 return parts.map(part=>part.map((p,i)=>`${i?'L':'M'}${(ox+(p.x-minX)*scale).toFixed(2)},${(oy+(p.y-minY)*scale).toFixed(2)}`).join(' '));
}
