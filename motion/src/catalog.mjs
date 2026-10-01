/** One source of truth for original decorative material: no rider data or media. */
import { theme } from '../../ExpoRideSpeed/src/lib/theme.ts';
export const WIDTH = 1280;
export const HEIGHT = 720;
export const FPS = 60;
export const THEMES = Object.freeze(['dark', 'light']);
export const PALETTES = Object.freeze({
  dark: { background: theme.dark.bg, substrate: theme.dark.surface, raised: theme.dark.raised, reflection: theme.dark.ink, hairline: theme.dark.ink, text: theme.dark.ink, accent: theme.dark.accent },
  light: { background: theme.light.bg, substrate: theme.light.raised, raised: theme.light.surface, reflection: theme.light.surface, hairline: theme.light.ink, text: theme.light.ink, accent: theme.light.accent },
});

const specs = [
  ['garage-scooter', 6, 'sleeve', 24, 94, 0.65, 350000, [0, 0, 780, 720], 'GarageCard / scooter', 'Rounded painted-panel sleeve'],
  ['garage-bigbike', 6, 'chamfer', 14, 68, 0.45, 350000, [0, 0, 768, 720], 'GarageCard / motorcycle', 'Shallow chamfered facet'],
  ['garage-car', 8, 'roof', 36, 12, 0, 350000, [0, 0, 1280, 452], 'GarageCard / car', 'Broad lower roof bevel'],
  ['podium-first', 6, 'plate-first', 18, 20, 0, 350000, [0, 0, 1280, 400], 'Ranked / actual first row', 'Etched raised stepped plate'],
  ['podium-second', 6, 'plate-second', 12, 14, 0, 350000, [0, 0, 1280, 432], 'Ranked / actual second row', 'Quiet middle stepped plate'],
  ['podium-third', 6, 'plate-third', 10, 12, 0, 350000, [0, 0, 1280, 456], 'Ranked / actual third row', 'Shallow stepped plate'],
  ['ranked-today', 6, 'horizon', 12, 8, 0, 200000, [0, 0, 1280, 520], 'Ranked / today header', 'Single narrow reflected horizon'],
  ['ranked-week', 8, 'bands', 10, 7, 0, 200000, [0, 0, 1280, 520], 'Ranked / week header', 'Two etched parallel bands'],
  ['ranked-month', 8, 'contour', 8, 6, 0, 200000, [0, 0, 1280, 520], 'Ranked / month header', 'Wide low-amplitude return contour'],
  ['auth-onboarding', 8, 'auth-sleeve', 18, 78, 0.5, 450000, [0, 0, 790, 720], 'Auth / onboarding hero', 'Continuous layered sleeve bend'],
  ['empty-state', 6, 'annulus', 80, 80, 0, 200000, [0, 0, 768, 720], 'Native empty state', 'Fixed open etched annulus'],
  ['challenge-lobby', 6, 'parallel', 16, 54, 0, 350000, [0, 0, 768, 720], 'Challenge lobby / actual members', 'Two fixed quiet contours'],
  ['speedometer-glow', 8, 'gauge', 18, 12, 0, 200000, [0, 0, 1280, 452], 'Expanded stationary HUD', 'Soft lower-rim reflected glow'],
  ['profile-license', 6, 'license', 20, 88, 0.45, 350000, [0, 0, 760, 720], 'RiderCard / native identity', 'Curved optical ridge'],
];

export const roles = Object.freeze(specs.map(([id, seconds, shape, amplitudeX, amplitudeY, lean, targetBytes, safeZone, component, description]) => Object.freeze({
  id, seconds, frames: seconds * FPS, shape, amplitudeX, amplitudeY, lean, targetBytes,
  safeZone: Object.freeze(safeZone), component, description,
})));
export const assets = Object.freeze(roles.flatMap(role => THEMES.map(theme => Object.freeze({
  ...role, role: role.id, theme, id: `${role.id}-${theme}`, composition: `${role.id}-${theme}`,
  width: WIDTH, height: HEIGHT, fps: FPS, maximumVideoBytes: 1500000,
}))));

export function assetById(id) {
  const resolved = id === 'garage-scooter' ? 'garage-scooter-dark' : id;
  const value = assets.find(asset => asset.id === resolved);
  if (!value) throw new Error(`Unknown material asset: ${id}`);
  return value;
}

/** Integer-period phase: virtual frame N is exactly frame 0, not encoded twice. */
export function phaseAtFrame(asset, frame) {
  if (!Number.isFinite(frame)) throw new Error('Frame must be finite');
  const phase = ((frame % asset.frames) + asset.frames) % asset.frames;
  return phase * (Math.PI * 2 / asset.frames);
}

export function materialAtFrame(asset, frame) {
  const theta = phaseAtFrame(asset, frame);
  return {
    offsetX: asset.amplitudeX * Math.sin(theta),
    offsetY: asset.amplitudeY * Math.cos(theta),
    lean: asset.lean * Math.sin(theta),
    // Gauge swing is <=.02; other material highlights stay localized at edges.
    glow: asset.shape === 'gauge' ? 0.055 + 0.008 * Math.sin(theta) : 0.20 + 0.028 * Math.sin(theta),
    edge: 0.32 + 0.045 * Math.cos(theta),
    reflection: 0.11 + 0.012 * Math.sin(theta),
  };
}

export function materialVelocityAtFrame(asset, frame) {
  const theta = phaseAtFrame(asset, frame), omega = Math.PI * 2 / asset.frames;
  return {
    offsetX: asset.amplitudeX * Math.cos(theta) * omega,
    offsetY: -asset.amplitudeY * Math.sin(theta) * omega,
    lean: asset.lean * Math.cos(theta) * omega,
    glow: (asset.shape === 'gauge' ? 0.008 : 0.028) * Math.cos(theta) * omega,
    edge: -0.045 * Math.sin(theta) * omega,
    reflection: 0.012 * Math.cos(theta) * omega,
  };
}
