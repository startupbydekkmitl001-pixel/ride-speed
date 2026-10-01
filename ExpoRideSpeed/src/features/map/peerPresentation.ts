import {createPeerMotion, samplePeerMotion} from '../live/peerMotion';
import type {AuthorizedPeer, PeerMotion} from '../live/types';
import type {MapPeer} from './MapSurface.types';

export type PresentedPeer = Readonly<{peer: MapPeer; motion: PeerMotion | null}>;
function sameFix(a: AuthorizedPeer, b: AuthorizedPeer) {
  return a.topicGeneration===b.topicGeneration && a.position.user_id===b.position.user_id &&
    a.position.member_generation===b.position.member_generation && a.position.consent_revision===b.position.consent_revision &&
    a.position.sequence===b.position.sequence;
}
/** One bounded cache per renderer. Removing a peer destroys its interpolation history. */
export class PeerPresentation {
  private previous = new Map<string, PresentedPeer>();
  update(peers: readonly MapPeer[], now: number, reducedMotion: boolean): PresentedPeer[] {
    const next = new Map<string, PresentedPeer>();
    if (!Number.isFinite(now)) { this.previous.clear(); return []; }
    for (const peer of peers) {
      const {latitude,longitude}=peer.coordinate, sample=peer.sample;
      if (!peer.id || next.has(peer.id) || !Number.isFinite(latitude) || Math.abs(latitude)>90 ||
          !Number.isFinite(longitude) || Math.abs(longitude)>180 || !Number.isFinite(peer.updatedAtMs) || peer.updatedAtMs<=0) continue;
      if (sample && (sample.position.user_id!==peer.id || sample.position.latitude!==latitude || sample.position.longitude!==longitude ||
        !Number.isFinite(sample.expiresMonotonicMs) || sample.expiresMonotonicMs<=now)) continue;
      const before=this.previous.get(peer.id);
      let motion: PeerMotion | null=null;
      if (sample) {
        if (!reducedMotion && before?.motion && before.peer.sample && sameFix(before.peer.sample,sample)) {
          motion={...before.motion,expiresMonotonicMs:Math.min(before.motion.expiresMonotonicMs,sample.expiresMonotonicMs)};
        } else {
          motion=createPeerMotion(before?.peer.sample??null,sample,now,reducedMotion);
          // Interrupt from the displayed position, not the preceding GPS endpoint.
          const displayed=before?.motion && samplePeerMotion(before.motion,now);
          if (motion.durationMs>0 && displayed) motion={...motion,from:displayed};
        }
      }
      if(motion&&motion.expiresMonotonicMs<=now)continue;
      // Preserve the stricter deadline in history as well as the rendered frame.
      const bounded=sample&&motion?{...peer,sample:{...sample,expiresMonotonicMs:motion.expiresMonotonicMs}}:peer;
      next.set(peer.id,{peer:bounded,motion});
    }
    this.previous=next;
    return [...next.values()];
  }
}
/** Shared by native Reanimated and web. Never feed these positions into ride evidence. */
export function samplePresentation(frame: readonly PresentedPeer[], now: number): GeoJSON.FeatureCollection<GeoJSON.Point> {
  'worklet';
  const features: GeoJSON.Feature<GeoJSON.Point>[]=[];
  for (const {peer,motion} of frame) {
    const coordinate=motion?samplePeerMotion(motion,now):peer.coordinate;
    if (!coordinate) continue;
    const heading=peer.sample?.position.heading_deg;
    features.push({type:'Feature',id:peer.id,properties:{id:peer.id,name:peer.name,presence:peer.presence,
      initial:peer.name.trim().slice(0,1).toUpperCase(),heading:typeof heading==='number'&&Number.isFinite(heading)?heading:null},
      geometry:{type:'Point',coordinates:[coordinate.longitude,coordinate.latitude]}});
  }
  return {type:'FeatureCollection',features};
}
