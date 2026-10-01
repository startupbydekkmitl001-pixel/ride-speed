const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build', 'deploy-m1');
execFileSync(process.execPath, [path.join(__dirname, 'bundle-edge-dashboard.cjs'), 'verify-race-attempt', 'race-evidence-cleanup'], {cwd: root});
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
function run(name, env = {}) {
  const source = fs.readFileSync(path.join(output, `${name}.js`), 'utf8');
  let handler, created = 0;
  const sandbox = {Request, Response, Headers, URL, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, crypto: crypto.webcrypto,
    Deno: {serve: value => {assert.equal(handler, undefined);handler = value;}, env: {get: key => env[key]}},
    createClient: () => {created++;return {rpc: async name => ({data: name === 'rs_claim_race_evidence_cleanup' ? [] : true, error: null})};},
  };
  const external = /^import\s*\{\s*createClient(?:\s+as\s+(\w+))?\s*\}\s*from\s*["']npm:@supabase\/supabase-js@2\.117\.2["'];?\s*$/gm;
  assert.equal([...source.matchAll(external)].length, name === 'race-evidence-cleanup' ? 2 : 1);
  const executable = source.replace(external, (_match, alias) => alias ? `const ${alias} = createClient;` : '');
  assert.doesNotMatch(executable, /^import\b/m);
  vm.runInNewContext(executable, sandbox, {filename: `${name}.js`, timeout: 2000});
  assert.equal(typeof handler, 'function');
  assert.equal(created, 0);
  return {handler, clients: () => created};
}
test('module bundles preserve exact canonical provenance and need no runtime environment to initialize', () => {
  for (const name of ['verify-race-attempt', 'race-evidence-cleanup']) {
    const entry = manifest[name];
    assert.equal(entry.extension, 'js');assert.equal(entry.generator.framework, 'esbuild');
    assert.equal(entry.sha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(output, `${name}.js`))).digest('hex'));
    for (const file of entry.sources) assert.equal(file.sha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file.path))).digest('hex'));
    run(name);
  }
});
test('actual standalone verification bundle denies anonymous evidence requests before reading configuration', async () => {
  const fixture = run('verify-race-attempt');
  const result = await fixture.handler(new Request('https://fixture.invalid/verify-race-attempt', {method: 'POST', body: '{}'}));
  assert.equal(result.status, 401);assert.deepEqual(await result.json(), {error: 'AUTH_REQUIRED'});assert.equal(fixture.clients(), 0);
});
test('actual standalone cleanup bundle requires service authorization and removes no unclaimed objects', async () => {
  const fixture = run('race-evidence-cleanup', {SUPABASE_SECRET_KEY: 'isolated-fixture-only', SUPABASE_URL: 'https://fixture.invalid'});
  const denied = await fixture.handler(new Request('https://fixture.invalid/cleanup', {method: 'POST', headers: {authorization: 'Bearer unrelated-fixture'}}));
  assert.equal(denied.status, 401);assert.equal(fixture.clients(), 0);
  const allowed = await fixture.handler(new Request('https://fixture.invalid/cleanup', {method: 'POST', headers: {authorization: 'Bearer isolated-fixture-only'}}));
  assert.equal(allowed.status, 200);assert.deepEqual(await allowed.json(), {removed: 0, failed: 0});assert.equal(fixture.clients(), 1);
});
