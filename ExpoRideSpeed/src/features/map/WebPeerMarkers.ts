import type {Map as GLMap,Marker} from 'maplibre-gl';
import {PeerPresentation,samplePresentation,type PresentedPeer} from './peerPresentation';
import type {MapPeer} from './MapSurface.types';

/** Web-only DOM transforms; native uses Reanimated, never this RAF loop. */
export class WebPeerMarkers {
  private history=new PeerPresentation();
  private frame:PresentedPeer[]=[];
  private markers=new Map<string,{marker:Marker;node:HTMLButtonElement;heading:HTMLElement;initial:HTMLElement;label:HTMLElement}>();
  private animation=0;
  private expiry:ReturnType<typeof setTimeout>|null=null;
  private disposed=false;
  constructor(private map:GLMap,private MarkerClass:typeof Marker,private select:(id:string)=>void){map.on('zoom',this.tick);map.on('rotate',this.tick);}
  update(peers:readonly MapPeer[],reducedMotion:boolean){
    if(this.disposed)return;
    cancelAnimationFrame(this.animation);if(this.expiry)clearTimeout(this.expiry);
    this.frame=this.history.update(peers,performance.now(),reducedMotion);
    const ids=new Set(this.frame.map(row=>row.peer.id));
    for(const [id,value] of this.markers)if(!ids.has(id)){value.marker.remove();this.markers.delete(id);}
    for(const {peer} of this.frame){
      let entry=this.markers.get(peer.id);
      if(!entry){
        const node=document.createElement('button'),initial=document.createElement('span'),label=document.createElement('span'),heading=document.createElement('span');
        node.type='button';node.className='ride-friend-marker';initial.className='ride-friend-avatar';label.className='ride-friend-name';heading.className='ride-friend-heading';
        node.append(heading,initial,label);node.onclick=event=>{event.stopPropagation();if(this.frame.some(row=>row.peer.id===peer.id&&(!row.motion||performance.now()<row.motion.expiresMonotonicMs)))this.select(peer.id);};
        const marker=new this.MarkerClass({element:node,anchor:'center'}).setLngLat([peer.coordinate.longitude,peer.coordinate.latitude]).addTo(this.map);
        entry={marker,node,heading,initial,label};this.markers.set(peer.id,entry);
      }
      entry.initial.textContent=peer.name.trim().slice(0,1).toUpperCase();entry.label.textContent=peer.name;entry.node.setAttribute('aria-label',peer.name);
    }
    this.tick();
  }
  private tick=()=>{
    if(this.disposed)return;
    cancelAnimationFrame(this.animation);if(this.expiry)clearTimeout(this.expiry);
    const now=performance.now(),sample=samplePresentation(this.frame,now),fresh=new Set(sample.features.map(f=>String(f.id)));
    for(const [id,entry] of this.markers){
      entry.node.hidden=!fresh.has(id)||this.map.getZoom()<=14;
    }
    for(const feature of sample.features){
      const entry=this.markers.get(String(feature.id));if(!entry)continue;
      entry.marker.setLngLat(feature.geometry.coordinates as [number,number]);
      const heading=feature.properties?.heading;
      entry.heading.hidden=typeof heading!=='number';
      if(typeof heading==='number')entry.heading.style.transform=`rotate(${heading-this.map.getBearing()}deg)`;
    }
    if(this.frame.some(row=>row.motion&&now<Math.min(row.motion.expiresMonotonicMs,row.motion.startMonotonicMs+row.motion.durationMs)))this.animation=requestAnimationFrame(this.tick);
    const deadline=Math.min(...this.frame.flatMap(row=>row.motion&&row.motion.expiresMonotonicMs>now?[row.motion.expiresMonotonicMs]:[]));
    if(Number.isFinite(deadline))this.expiry=setTimeout(this.tick,Math.max(1,deadline-now));
  };
  dispose(){this.disposed=true;cancelAnimationFrame(this.animation);if(this.expiry)clearTimeout(this.expiry);this.map.off('zoom',this.tick);this.map.off('rotate',this.tick);for(const entry of this.markers.values())entry.marker.remove();this.markers.clear();this.frame=[];this.history=new PeerPresentation();}
}
