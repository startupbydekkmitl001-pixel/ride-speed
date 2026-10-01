import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg, ffprobe, run } from './media-tools.mjs';
import { assets, assetById, PALETTES, materialAtFrame, materialVelocityAtFrame } from '../src/catalog.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const shaFileInput = ['src/catalog.mjs', 'src/MaterialLoop.jsx', 'src/index.jsx', 'scripts/render.mjs', 'scripts/verify.mjs', 'scripts/media-tools.mjs', 'scripts/generate-registry.mjs', 'scripts/inspect.py', 'package.json', 'package-lock.json', '../ExpoRideSpeed/src/lib/theme.ts'];
export function mae(first, last) {
  assert.equal(first.length, last.length);
  let sum = 0;
  for (let i = 0; i < first.length; i++) sum += Math.abs(first[i] - last[i]);
  return sum / first.length;
}
const rgb = file => run(ffmpeg, ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
const channels = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
function luminance(values) {
  const linear = values.map(channel => channel / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}
function contrast(first, second) { return (Math.max(first, second) + .05) / (Math.min(first, second) + .05); }

export function verifyLoop(video, asset, proofDirectory) {
  assert.deepEqual(materialAtFrame(asset, 0), materialAtFrame(asset, asset.frames));
  assert.deepEqual(materialVelocityAtFrame(asset, 0), materialVelocityAtFrame(asset, asset.frames));
  const metadata = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video]));
  const stream = metadata.streams.find(s => s.codec_type === 'video');
  assert.equal(stream.codec_name, 'h264');
  assert.equal(stream.width, asset.width); assert.equal(stream.height, asset.height);
  assert.equal(stream.pix_fmt, 'yuv420p'); assert.equal(Number(stream.nb_frames), asset.frames);
  assert.equal(stream.r_frame_rate, `${asset.fps}/1`);
  assert.equal(Number(metadata.format.duration), asset.seconds);
  assert.equal(metadata.streams.length, 1); assert.equal(metadata.streams.some(s => s.codec_type === 'audio'), false);
  assert.equal(stream.color_range, 'tv'); assert.equal(stream.color_space, 'bt709');
  assert.equal(stream.color_transfer, 'bt709'); assert.equal(stream.color_primaries, 'bt709');
  const bytes = fs.statSync(video).size;
  assert.ok(bytes <= asset.maximumVideoBytes, `Loop exceeds 1.5 MB: ${asset.id}/${bytes}`);
  const sourceFirst = rgb(path.join(proofDirectory, 'frame-0.png'));
  const sourceEndpointMAE = mae(sourceFirst, rgb(path.join(proofDirectory, `frame-${asset.frames}.png`)));
  assert.equal(sourceEndpointMAE, 0, 'Source frame 0 and virtual continuation must be pixel-identical');
  const [zoneX, zoneY, zoneWidth, zoneHeight] = asset.safeZone, expected = channels(PALETTES[asset.theme].background);
  let sourceZoneMaximumError = 0;
  for (let y = zoneY; y < zoneY + zoneHeight; y++) for (let x = zoneX; x < zoneX + zoneWidth; x++) {
    const index = (y * asset.width + x) * 3;
    for (let channel = 0; channel < 3; channel++) sourceZoneMaximumError = Math.max(sourceZoneMaximumError, Math.abs(sourceFirst[index + channel] - expected[channel]));
  }
  assert.equal(sourceZoneMaximumError, 0, 'The declared reading zone must be opaque and exactly match its canvas');
  const width = 320, height = 180, stride = width * height * 3;
  const pixels = run(ffmpeg, ['-v', 'error', '-i', video, '-vf', `scale=${width}:${height}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], 120 * 1024 * 1024);
  assert.equal(pixels.length, stride * asset.frames);
  const frame = n => pixels.subarray(stride * n, stride * (n + 1));
  const deltas = Array.from({ length: asset.frames - 1 }, (_, i) => mae(frame(i), frame(i + 1)));
  const seamMAE = mae(frame(asset.frames - 1), frame(0)), maxOrdinaryMAE = Math.max(...deltas);
  const acceptedMaximum = maxOrdinaryMAE * 1.25 + .12;
  assert.ok(seamMAE <= acceptedMaximum, `Encoded seam ${seamMAE} exceeds ordinary steps ${maxOrdinaryMAE}: ${asset.id}`);
  // Four-source-pixel inset excludes chroma/filter pixels exactly on the zone boundary.
  const sx = Math.ceil((zoneX + 4) * width / asset.width), sy = Math.ceil((zoneY + 4) * height / asset.height);
  const ex = Math.floor((zoneX + zoneWidth - 4) * width / asset.width), ey = Math.floor((zoneY + zoneHeight - 4) * height / asset.height);
  let encodedZoneMaximumError = 0, encodedZoneMaximumTemporalChange = 0, changedOutsidePixels = 0;
  let minimumContrast = Infinity;
  const textLuminance = luminance(channels(PALETTES[asset.theme].text));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 3, reading = x >= sx && x < ex && y >= sy && y < ey;
    const minimum = [255, 255, 255], maximum = [0, 0, 0];
    for (let n = 0; n < asset.frames; n++) {
      const start = stride * n + index;
      for (let channel = 0; channel < 3; channel++) {
        const value = pixels[start + channel];
        minimum[channel] = Math.min(minimum[channel], value); maximum[channel] = Math.max(maximum[channel], value);
        if (reading) encodedZoneMaximumError = Math.max(encodedZoneMaximumError, Math.abs(value - expected[channel]));
      }
    }
    const change = Math.max(...maximum.map((value, index) => value - minimum[index]));
    if (reading) {
      encodedZoneMaximumTemporalChange = Math.max(encodedZoneMaximumTemporalChange, change);
      minimumContrast = Math.min(minimumContrast, contrast(textLuminance, luminance(asset.theme === 'dark' ? maximum : minimum)));
    } else if (change > 2) changedOutsidePixels++;
  }
  assert.ok(encodedZoneMaximumError <= 4, `Encoded reading-zone color lift ${encodedZoneMaximumError}: ${asset.id}`);
  assert.ok(encodedZoneMaximumTemporalChange <= 3, `Animation leaked into reading zone: ${asset.id}`);
  assert.ok(minimumContrast >= 4.5, `Nominal text contrast inadequate: ${asset.id}`);
  assert.ok(changedOutsidePixels > 0, `Material is static after encoding: ${asset.id}`);
  return {
    schemaVersion: 2, id: asset.id, video: path.relative(root, video).replaceAll('\\', '/'),
    width: asset.width, height: asset.height, fps: asset.fps, frames: asset.frames, durationSeconds: asset.seconds, bytes,
    codec: stream.codec_name, pixelFormat: stream.pix_fmt,
    color: { range: stream.color_range, space: stream.color_space, transfer: stream.color_transfer, primaries: stream.color_primaries }, audioTracks: 0,
    seam: { method: 'Pixel-identical source 0/N and analytic position/velocity; encoded N-1/0 against every ordinary frame step at 320x180 RGB',
      sourceEndpointMAE0To255: sourceEndpointMAE, sourceVelocityEndpointIdentical: true,
      encodedSeamMAE0To255: seamMAE, encodedOrdinaryMeanMAE0To255: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
      encodedOrdinaryMaximumMAE0To255: maxOrdinaryMAE, acceptedMaximumMAE0To255: acceptedMaximum, passed: true },
    readingZone: { rectSourcePixels: asset.safeZone, sourceMaximumChannelError0To255: sourceZoneMaximumError,
      encodedMaximumChannelError0To255: encodedZoneMaximumError, encodedMaximumTemporalChannelChange0To255: encodedZoneMaximumTemporalChange,
      nominalText: PALETTES[asset.theme].text, minimumEncodedContrast: minimumContrast,
      measurement: 'All decoded frames at 320x180; four-source-pixel boundary inset. Contrast assumes nominal native text above this opaque zone; screen layout is a separate integration check.' },
    motionMask: { resolution: [width, height], outsideReadingZoneChangedPixelCount: changedOutsidePixels, channelRangeThreshold0To255: 2 },
  };
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const id = process.argv[process.argv.indexOf('--asset') + 1];
  const selected = process.argv.includes('--all') ? assets : [assetById(process.argv.includes('--asset') ? id : 'garage-scooter-dark')];
  for (const asset of selected) {
    const report = verifyLoop(path.join(root, 'build', `${asset.id}.mp4`), asset, path.join(root, 'build/proofs', asset.id));
    const file = path.join(root, 'validation', `${asset.id}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${asset.id}: ${report.bytes} bytes, seam ${report.seam.encodedSeamMAE0To255.toFixed(6)}, contrast ${report.readingZone.minimumEncodedContrast.toFixed(2)}`);
  }
}
