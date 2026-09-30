import type { LayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import { theme } from '../../lib/theme';

export const mapIds = {
  track: 'rs-track', pins: 'rs-pins', peers: 'rs-peers', fix: 'rs-fix',
  routeGlow: 'rs-route-glow', routeCore: 'rs-route-core', draft: 'rs-route-draft',
  pinCircle: 'rs-pin-circle', pinNumber: 'rs-pin-number',
  cluster: 'rs-peer-cluster', clusterCount: 'rs-peer-cluster-count', peer: 'rs-peer', peerName: 'rs-peer-name',
  puckHalo: 'rs-puck-halo', puck: 'rs-puck',
} as const;
export const peerClusterOptions = { cluster: true, clusterRadius: 50, clusterMaxZoom: 14, clusterMinPoints: 2, maxzoom: 18 } as const;
export function overlayLayers(mode: 'dark' | 'light'): LayerSpecification[] {
  const colors = theme[mode], palette = theme.map[mode];
  return [
    { id: mapIds.routeGlow, type: 'line', source: mapIds.track, filter: ['!=', ['get', 'kind'], 'draft'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.accent, 'line-width': 12, 'line-opacity': 0.22, 'line-blur': 3 } },
    { id: mapIds.routeCore, type: 'line', source: mapIds.track, filter: ['!=', ['get', 'kind'], 'draft'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.accent, 'line-width': 4, 'line-opacity': 0.95 } },
    { id: mapIds.draft, type: 'line', source: mapIds.track, filter: ['==', ['get', 'kind'], 'draft'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.accent, 'line-width': 3, 'line-dasharray': [2, 2], 'line-opacity': 0.85 } },
    { id: mapIds.pinCircle, type: 'circle', source: mapIds.pins, paint: { 'circle-radius': ['case', ['get', 'selected'], 16, 14], 'circle-color': ['case', ['get', 'selected'], colors.ink, colors.accent], 'circle-stroke-color': colors.ink, 'circle-stroke-width': 2 } },
    { id: mapIds.pinNumber, type: 'symbol', source: mapIds.pins, layout: { 'text-field': ['to-string', ['get', 'order']], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': colors.bg } },
    { id: mapIds.cluster, type: 'circle', source: mapIds.peers, filter: ['has', 'point_count'], paint: { 'circle-color': colors.raised, 'circle-radius': ['step', ['get', 'point_count'], 20, 10, 23, 30, 26], 'circle-stroke-color': colors.good, 'circle-stroke-width': 2 } },
    { id: mapIds.clusterCount, type: 'symbol', source: mapIds.peers, filter: ['has', 'point_count'], layout: { 'text-field': ['to-string', ['get', 'point_count_abbreviated']], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true }, paint: { 'text-color': colors.ink } },
    { id: mapIds.peer, type: 'circle', source: mapIds.peers, filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 7, 'circle-color': ['match', ['get', 'presence'], 'riding', colors.accent, colors.good], 'circle-stroke-color': colors.ink, 'circle-stroke-width': 2 } },
    { id: mapIds.peerName, type: 'symbol', source: mapIds.peers, filter: ['!', ['has', 'point_count']], layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-letter-spacing': 0, 'text-line-height': theme.typography.thaiLeading, 'text-offset': [0, 1.35], 'text-anchor': 'top', 'text-max-width': 10 }, paint: { 'text-color': palette.label, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 } },
    { id: mapIds.puckHalo, type: 'circle', source: mapIds.fix, paint: { 'circle-radius': 20, 'circle-color': colors.accent, 'circle-opacity': 0.14 } },
    { id: mapIds.puck, type: 'circle', source: mapIds.fix, paint: { 'circle-radius': 7, 'circle-color': colors.accent, 'circle-stroke-color': colors.ink, 'circle-stroke-width': 3 } },
  ];
}
