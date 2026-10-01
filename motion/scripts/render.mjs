import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assets, assetById, PALETTES } from '../src/catalog.mjs';
import { verifyLoop, shaFileInput } from './verify.mjs';
import { ffmpeg, ffprobe, run } from './media-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../ExpoRideSpeed/assets/motion/v5'), build = path.join(root, 'build');
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceHash = file => createHash('sha256').update(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex');
const argIndex = process.argv.indexOf('--asset');
if (argIndex >= 0 && !process.argv[argIndex + 1]) throw new Error('--asset needs an asset ID');
const selected = process.argv.includes('--all') ? assets : [assetById(argIndex >= 0 ? process.argv[argIndex + 1] : 'garage-scooter-dark')];
fs.mkdirSync(build, { recursive: true }); fs.mkdirSync(output, { recursive: true });
const browserExecutable = process.env.RIDE_CHROME_PATH || (fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const chromiumOptions = { gl: 'swangle' };
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.jsx'), outDir: path.join(build, 'remotion') });
const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions });
const config = { serveUrl, puppeteerInstance: browser };
const browserInfo = (await browser.connection.send('Browser.getVersion')).value;
const generator = {
  framework: 'Remotion', version: '4.0.531', node: process.version, browser: browserInfo.product,
  ffmpeg: run(ffmpeg, ['-version']).toString().split(/\r?\n/)[0], ffprobe: run(ffprobe, ['-version']).toString().split(/\r?\n/)[0],
  graphics: 'swangle / software host baseline', entry: 'motion/src/index.jsx', command: 'cd motion && npm ci && npm run render -- --all',
  encode: { codec: 'h264', crf: 24, pixelFormat: 'yuv420p', colorSpace: 'bt709', frameCapture: 'png', concurrency: 4 },
};
const sourceSha256 = Object.fromEntries(shaFileInput.map(file => [path.relative(path.resolve(root, '..'), path.join(root, file)).replaceAll('\\', '/'), sourceHash(path.join(root, file))]));
const manifestPath = path.join(output, 'manifest.json');
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
// A changed source snapshot cannot inherit another composition's stale proof.
const sameSource = previous?.schemaVersion === 2 && JSON.stringify(previous.provenance?.sourceSha256) === JSON.stringify(sourceSha256);
const records = sameSource ? previous.assets : {};
try {
  for (const asset of selected) {
    console.log(`Starting ${asset.id} (${asset.frames} frames)`);
    const composition = await selectComposition({ ...config, id: asset.composition });
    const proofs = path.join(build, 'proofs', asset.id); fs.mkdirSync(proofs, { recursive: true });
    const proofFrames = [0, 1, asset.frames / 4, asset.frames / 2, asset.frames * 3 / 4, asset.frames - 1, asset.frames];
    for (const frame of proofFrames) await renderStill({ ...config, composition: { ...composition, durationInFrames: asset.frames + 1 }, frame, imageFormat: 'png', output: path.join(proofs, `frame-${frame}.png`) });
    let last = -1;
    const video = path.join(build, `${asset.id}.mp4`);
    await renderMedia({ ...config, composition, codec: 'h264', crf: 24, imageFormat: 'png', pixelFormat: 'yuv420p', colorSpace: 'bt709',
      muted: true, enforceAudioTrack: false, concurrency: 4, outputLocation: video,
      onProgress: ({ progress }) => { const percent = Math.floor(progress * 4) * 25; if (percent !== last) { last = percent; console.log(`${asset.id}: ${percent}%`); } },
    });
    const validation = verifyLoop(video, asset, proofs);
    const poster = path.join(build, `${asset.id}-poster.jpg`);
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-frames:v', '1', '-q:v', '2', poster]);
    const validationPath = path.join(root, 'validation', `${asset.id}.json`);
    fs.mkdirSync(path.dirname(validationPath), { recursive: true }); fs.writeFileSync(validationPath, `${JSON.stringify(validation, null, 2)}\n`);
    records[asset.id] = {
      role: asset.role, theme: asset.theme, component: asset.component, description: asset.description, composition: asset.composition,
      video: `${asset.id}.mp4`, poster: `${asset.id}-poster.jpg`, videoSha256: sha256(video), posterSha256: sha256(poster),
      videoBytes: fs.statSync(video).size, posterBytes: fs.statSync(poster).size,
      width: asset.width, height: asset.height, frames: asset.frames, fps: asset.fps, durationSeconds: asset.seconds,
      codec: 'h264', pixelFormat: 'yuv420p', color: validation.color, audio: false,
      accent: PALETTES[asset.theme].accent, background: PALETTES[asset.theme].background, safeZone: asset.safeZone,
      proofFrames: Object.fromEntries(proofFrames.map(frame => [String(frame), sha256(path.join(proofs, `frame-${frame}.png`))])),
      validation: `motion/validation/${asset.id}.json`, validationSha256: sha256(validationPath), seamVerification: validation.seam,
      readingZoneVerification: validation.readingZone, motionMask: validation.motionMask,
    };
    const totalBytes = Object.values(records).reduce((sum, record) => sum + record.videoBytes + record.posterBytes, 0);
    if (totalBytes > 20000000) throw new Error(`Offline motion family exceeds 20 MB: ${totalBytes}`);
    fs.copyFileSync(video, path.join(output, `${asset.id}.mp4`)); fs.copyFileSync(poster, path.join(output, `${asset.id}-poster.jpg`));
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      schemaVersion: 2, generator, aliases: records['garage-scooter-dark'] ? { 'garage-scooter': 'garage-scooter-dark' } : {},
      expectedAssetCount: 28, complete: Object.keys(records).length === 28,
      budget: { maximumVideoBytes: 1500000, maximumFamilyBytes: 20000000, familyBytes: totalBytes, maximumConcurrentPlayback: 2 },
      provenance: { authorship: 'Original procedural vectors created for Ride Speed', externalAssets: [],
        sourceHashNormalization: 'UTF-8 text with CRLF normalized to LF; media/proof/validation hashes use exact bytes',
        referenceUse: 'Principles only: travelling edge illumination, independent material planes and stable opaque reading zones. No reference media/layout/assets redistributed.', sourceSha256 },
      assets: records,
    }, null, 2)}\n`);
    console.log(`Verified ${asset.id}: ${validation.bytes} video bytes; source seam exact; encoded seam ${validation.seam.encodedSeamMAE0To255.toFixed(6)}`);
  }
} finally { await browser.close({ silent: true }); }
console.log(`Delivered ${selected.length} verified assets; manifest has ${Object.keys(records).length}/28 outputs`);
