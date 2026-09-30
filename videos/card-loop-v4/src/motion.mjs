export const LOOP_FRAMES = 360;
export const FPS = 30;
export const SIZE = {width: 720, height: 450};

// Each term has an integer frequency over the period. Modulo also makes frame
// 360 exactly frame 0, without duplicating that endpoint in the encoded clip.
export function materialAtFrame(frame) {
  const phase = (((frame % LOOP_FRAMES) + LOOP_FRAMES) % LOOP_FRAMES) / LOOP_FRAMES;
  const theta = phase * Math.PI * 2;
  return {
    blueX: 659 + 42 * Math.sin(theta),
    blueY: 157 + 31 * Math.cos(theta),
    sageX: 624 + 35 * Math.cos(theta),
    sageY: 351 + 28 * Math.sin(theta),
    lightX: 596 + 26 * Math.sin(theta + Math.PI / 3),
    lightY: 44 + 20 * Math.cos(theta + Math.PI / 3),
    lensBend: 34 * Math.sin(theta),
    lensTilt: 23 * Math.cos(theta),
    blueOpacity: 0.70 + 0.07 * Math.sin(theta + 0.8),
    sageOpacity: 0.62 + 0.06 * Math.cos(theta),
    highlightOpacity: 0.52 + 0.05 * Math.cos(theta + Math.PI / 3),
  };
}
