import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg, ffprobe, run } from './media-tools.mjs';
import { FPS, LOOP_FRAMES, HEIGHT, WIDTH, materialAtFrame } from '../src/parameters.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mae(first, last) {
  assert.equal(first.length, last.length);
  let sum = 0;
  for (let i = 0; i < first.length; i++) sum += Math.abs(first[i] - last[i]);
  return sum / first.length;
}

export function verifyLoop(video = path.join(root, 'build/garage-scooter.mp4')) {
  assert.deepEqual(materialAtFrame(0), materialAtFrame(LOOP_FRAMES));
  const metadata = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video]));
  const stream = metadata.streams.find(s => s.codec_type === 'video');
  assert.equal(stream.codec_name, 'h264');
  assert.equal(stream.width, WIDTH);
  assert.equal(stream.height, HEIGHT);
  assert.equal(stream.pix_fmt, 'yuv420p');
  assert.equal(Number(stream.nb_frames), LOOP_FRAMES);
  assert.equal(stream.r_frame_rate, `${FPS}/1`);
  assert.equal(Number(metadata.format.duration), LOOP_FRAMES / FPS);
  assert.equal(metadata.streams.some(s => s.codec_type === 'audio'), false);
  const bytes = fs.statSync(video).size;
  assert.ok(bytes <= 1_500_000, `Loop exceeds 1.5 MB: ${bytes}`);

  const sourcePixels = frame => run(ffmpeg, ['-v', 'error', '-i', path.join(root, `build/proofs/frame-${frame}.png`), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const virtualEndpointMAE = mae(sourcePixels(0), sourcePixels(LOOP_FRAMES));
  assert.equal(virtualEndpointMAE, 0, 'Rendered virtual endpoint must match source frame 0 byte-for-byte');

  const width = 320, height = 180, stride = width * height * 3;
  const pixels = run(ffmpeg, ['-v', 'error', '-i', video, '-vf', `scale=${width}:${height}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  assert.equal(pixels.length, stride * LOOP_FRAMES);
  const frame = n => pixels.subarray(stride * n, stride * (n + 1));
  const deltas = Array.from({ length: LOOP_FRAMES - 1 }, (_, i) => mae(frame(i), frame(i + 1)));
  const seamMAE = mae(frame(LOOP_FRAMES - 1), frame(0));
  const maxOrdinaryMAE = Math.max(...deltas);
  // Quantization can differ around the first I-frame. Reject any visible seam jump.
  assert.ok(seamMAE <= maxOrdinaryMAE * 1.25 + 0.12, `Encoded seam ${seamMAE} exceeds ordinary steps ${maxOrdinaryMAE}`);
  const report = {
    schemaVersion: 1,
    video: path.relative(root, video).replaceAll('\\', '/'),
    width: WIDTH, height: HEIGHT, fps: FPS, frames: LOOP_FRAMES,
    durationSeconds: LOOP_FRAMES / FPS, bytes, audioTracks: 0,
    seam: {
      method: 'Source frame 0 versus virtual endpoint; encoded last-to-first versus every ordinary frame step, downsampled to 320x180 RGB',
      sourceEndpointMAE0To255: virtualEndpointMAE,
      encodedSeamMAE0To255: seamMAE,
      encodedOrdinaryMeanMAE0To255: deltas.reduce((a, b) => a + b, 0) / deltas.length,
      encodedOrdinaryMaximumMAE0To255: maxOrdinaryMAE,
      acceptedMaximumMAE0To255: maxOrdinaryMAE * 1.25 + 0.12,
      passed: true,
    },
  };
  fs.writeFileSync(path.join(root, 'validation.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyLoop(), null, 2));
}
