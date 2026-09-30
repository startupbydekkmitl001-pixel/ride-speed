// Metro cannot infer v6's import.meta.url worker. Keep its shared sibling beside it.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const packageFile = require.resolve('maplibre-gl/package.json', { paths: [root] });
const packageRoot = path.dirname(packageFile), metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
if (metadata.version !== '6.11.2') throw new Error('Review worker distribution before changing MapLibre GL JS version.');
const destination = path.join(root, 'public', 'maplibre');
fs.mkdirSync(destination, { recursive: true });
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
const manifest = { version: metadata.version, files: {} };
for (const file of files) {
  const source = path.join(packageRoot, 'dist', file), content = fs.readFileSync(source);
  fs.copyFileSync(source, path.join(destination, file));
  manifest.files[file] = crypto.createHash('sha256').update(content).digest('hex');
}
fs.copyFileSync(path.join(packageRoot, 'LICENSE.txt'), path.join(destination, 'LICENSE.txt'));
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Copied MapLibre ${metadata.version} worker, shared module and BSD license.`);
