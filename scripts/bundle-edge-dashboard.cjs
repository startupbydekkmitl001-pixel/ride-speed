// Dashboard editor bundles. Canonical multi-file sources stay in backend/functions.
// This supports the reviewed account and garage handlers; it does not read credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const functionsRoot = path.join(root, 'backend', 'functions');
const output = path.join(root, 'build', 'deploy-m1');
const names = process.argv.slice(2);
if (!names.length) names.push('profile-avatar-url', 'delete-account');
if (names.some(name => !['profile-avatar-url', 'delete-account', 'vehicle-photo-url'].includes(name))) throw new Error('Unsupported dashboard handler');
fs.mkdirSync(output, { recursive: true });
const manifest = {};
for (const name of names) {
  const seen = new Set(), visiting = new Set(), sources = [], parts = [];
  function visit(file) {
    file = path.resolve(file);
    if (!file.startsWith(functionsRoot + path.sep)) throw new Error('Dependency outside function sources');
    if (seen.has(file)) return;
    if (visiting.has(file)) throw new Error('Cyclic dashboard dependency');
    visiting.add(file);
    const source = fs.readFileSync(file, 'utf8');
    const dependencies = /^import [^\r\n]+ from ['"](\.{1,2}\/[^'"]+)['"];?\r?\n/gm;
    for (const dependency of source.matchAll(dependencies)) visit(path.resolve(path.dirname(file), dependency[1]));
    let inline = source.replace(dependencies, '');
    // The canonical request helpers are executable .mjs for Node boundary tests.
    // Inlining into the dashboard's .ts editor adds only erased type annotations.
    if (path.basename(file) === 'account-requests.mjs') {
      const constructor = 'constructor(status, code) { super(code); this.status=status; this.code=code; }';
      if (!inline.includes(constructor)) throw new Error('Request helper contract changed; review bundling');
      inline = inline.replace(constructor, 'constructor(public status: number, public code: string) { super(code); }');
      for (const name of ['objectBody', 'readDeletionRequest', 'readAvatarRequest']) {
        if (!inline.includes(`function ${name}(req)`)) throw new Error('Request helper signature changed');
        inline = inline.replace(`function ${name}(req)`, `function ${name}(req: Request)`);
      }
    }
    if (/\b(?:from|import)\s*['"]\.{1,2}\//.test(inline)) throw new Error('Unsupported relative import');
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    sources.push({ path: relative, sha256: crypto.createHash('sha256').update(source).digest('hex') });
    parts.push(`// Canonical source: ${relative}\n${inline}`);
    visiting.delete(file); seen.add(file);
  }
  visit(path.join(functionsRoot, name, 'index.ts'));
  const bundle = parts.join('\n');
  fs.writeFileSync(path.join(output, `${name}.ts`), bundle);
  manifest[name] = { sha256: crypto.createHash('sha256').update(bundle).digest('hex'), sources };
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Bundled ${names.join(', ')} from canonical sources into build/deploy-m1.`);
