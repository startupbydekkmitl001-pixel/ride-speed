/** Static requires let Metro bundle the original local loop for offline playback. */
export const ambientAssets = {
  "garage-scooter": {
    video: require("../../../assets/motion/v5/garage-scooter.mp4") as number,
    poster: require("../../../assets/motion/v5/garage-scooter-poster.jpg") as number,
  },
} as const;

export type AmbientAsset = keyof typeof ambientAssets;
