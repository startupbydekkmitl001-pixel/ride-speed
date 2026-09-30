import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FPS, HEIGHT, LOOP_FRAMES, WIDTH } from '../src/parameters.mjs';
import { verifyLoop } from './verify.mjs';
import { ffmpeg, run } from './media-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../ExpoRideSpeed/assets/motion/v5');
const build = path.join(root, 'build');
const proofs = path.join(build, 'proofs');
fs.mkdirSync(proofs, { recursive: true });
const browserExecutable = process.env.RIDE_CHROME_PATH || (fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const chromiumOptions = { gl: 'swangle' };
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.jsx'), outDir: path.join(build, 'remotion') });
const config = { serveUrl, id: 'GarageScooter', browserExecutable, chromiumOptions };
const composition = await selectComposition(config);
for (const frame of [0, 90, 180, 270, LOOP_FRAMES - 1, LOOP_FRAMES]) {
  await renderStill({ ...config, composition: { ...composition, durationInFrames: LOOP_FRAMES + 1 }, frame, output: path.join(proofs, `frame-${frame}.png`) });
}
let last = -1;
const video = path.join(build, 'garage-scooter.mp4');
await renderMedia({
  ...config, composition, codec: 'h264', crf: 24, pixelFormat: 'yuv420p', colorSpace: 'bt709',
  muted: true, enforceAudioTrack: false, concurrency: 4,
  outputLocation: video,
  onProgress: ({ progress }) => {
    const percent = Math.floor(progress * 4) * 25;
    if (percent !== last) { last = percent; console.log(`GarageScooter: ${percent}%`); }
  },
});
const validation = verifyLoop(video);
const poster = path.join(build, 'garage-scooter-poster.jpg');
run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-frames:v', '1', '-q:v', '2', poster]);
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(video, path.join(output, 'garage-scooter.mp4'));
fs.copyFileSync(poster, path.join(output, 'garage-scooter-poster.jpg'));
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceFiles = ['src/GarageScooter.jsx', 'src/parameters.mjs', 'src/index.jsx', 'scripts/render.mjs', 'scripts/verify.mjs'];
const manifest = {
  schemaVersion: 1,
  generator: { framework: 'Remotion', version: '4.0.531', entry: 'motion/src/index.jsx', command: 'cd motion && npm ci && npm run render' },
  assets: {
    'garage-scooter': {
      component: 'AmbientLoop', composition: 'GarageScooter',
      video: 'garage-scooter.mp4', poster: 'garage-scooter-poster.jpg',
      videoSha256: sha256(video), posterSha256: sha256(poster),
      videoBytes: fs.statSync(video).size, posterBytes: fs.statSync(poster).size,
      width: WIDTH, height: HEIGHT, frames: LOOP_FRAMES, fps: FPS,
      durationSeconds: LOOP_FRAMES / FPS, codec: 'h264', pixelFormat: 'yuv420p', audio: false,
      accent: '#FF5A1F', background: '#000000',
      provenance: {
        authorship: 'Original procedural vector material created for Ride Speed',
        externalAssets: [],
        referenceUse: 'Principles only: slow travelling edge light, depth from reflection, stable reading zone. No source media copied.',
        sourceSha256: Object.fromEntries(sourceFiles.map(file => [`motion/${file}`, sha256(path.join(root, file))])),
      },
      seamVerification: validation.seam,
    },
  },
};
fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, bytes: validation.bytes, seam: validation.seam }, null, 2));
