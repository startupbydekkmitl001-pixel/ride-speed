import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ffmpeg, run } from './media-tools.mjs';
import { mae } from './verify.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const media = path.resolve(root, '../ExpoRideSpeed/assets/motion/v5');
const manifest = JSON.parse(fs.readFileSync(path.join(media, 'manifest.json'), 'utf8'));
assert.equal(manifest.complete, true);
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const reports = {};
for (const [id, record] of Object.entries(manifest.assets)) {
  const first = run(ffmpeg, ['-v', 'error', '-i', path.join(media, record.video), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const poster = run(ffmpeg, ['-v', 'error', '-i', path.join(media, record.poster), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const error = mae(first, poster);
  assert.ok(error <= 1.5, `${id}: poster differs visibly from encoded first frame (${error})`);
  const [x, y, width, height] = record.safeZone;
  let zoneMaximum = 0;
  // Ignore four boundary pixels, consistently with the video safe-zone check.
  for (let row = y + 4; row < y + height - 4; row++) for (let column = x + 4; column < x + width - 4; column++) {
    const index = (row * record.width + column) * 3;
    for (let channel = 0; channel < 3; channel++) zoneMaximum = Math.max(zoneMaximum, Math.abs(first[index + channel] - poster[index + channel]));
  }
  assert.ok(zoneMaximum <= 4, `${id}: poster lifts the stable reading zone (${zoneMaximum})`);
  reports[id] = { videoSha256: hash(path.join(media, record.video)), posterSha256: hash(path.join(media, record.poster)),
    posterFirstEncodedFrameMAE0To255: error, readingZoneMaximumChannelDifference0To255: zoneMaximum, passed: true };
  console.log(`${id}: poster MAE ${error.toFixed(6)}, reading-zone maximum ${zoneMaximum}`);
}
const sourceSha256 = createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').replaceAll('\r\n', '\n')).digest('hex');
fs.writeFileSync(path.join(root, 'poster-validation.json'), `${JSON.stringify({ schemaVersion: 1, generator: 'motion/scripts/check-posters.mjs', sourceSha256,
  measurement: 'Decoded full-resolution 1280x720 RGB poster against encoded first video frame; exact source bytes hashed', assets: reports }, null, 2)}\n`);
