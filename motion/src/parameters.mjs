export const FPS = 60;
export const LOOP_SECONDS = 6;
export const LOOP_FRAMES = FPS * LOOP_SECONDS;
export const WIDTH = 1280;
export const HEIGHT = 720;

/** Integer frame modulo makes the virtual endpoint exactly equal to frame zero. */
export function materialAtFrame(frame) {
  const phase = ((frame % LOOP_FRAMES) + LOOP_FRAMES) % LOOP_FRAMES;
  const theta = (phase / LOOP_FRAMES) * Math.PI * 2;
  return {
    rimX: 964 + 24 * Math.sin(theta),
    rimY: 340 + 94 * Math.cos(theta),
    lightX: 1168 + 34 * Math.cos(theta),
    lightY: 492 + 80 * Math.sin(theta),
    glowOpacity: 0.20 + 0.035 * Math.sin(theta),
    edgeOpacity: 0.37 + 0.07 * Math.cos(theta),
    lean: 0.65 * Math.sin(theta),
  };
}
