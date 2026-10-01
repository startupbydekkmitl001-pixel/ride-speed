const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build','deploy-m1');
const names=['community-media-commit','community-media-url','community-media-cleanup'];
execFileSync(process.execPath,[path.join(__dirname,'bundle-edge-dashboard.cjs'),...names],{cwd:root});
const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));
function boot(name){let handler,clients=0;const source=fs.readFileSync(path.join(out,name+'.js'),'utf8');
 const sdk=/^import\s*\{\s*createClient(?:\s+as\s+(\w+))?\s*\}\s*from\s*["']npm:@supabase\/supabase-js@2\.117\.2["'];?\s*$/gm;
 const blur=/^import\s*\{\s*encode(?:\s+as\s+(\w+))?\s*\}\s*from\s*["']npm:blurhash@2\.0\.5["'];?\s*$/gm;
 const executable=source.replace(sdk,(_,alias)=>alias?`const ${alias}=createClient;`:'').replace(blur,(_,alias)=>alias?`const ${alias}=encode;`:'');
 assert.doesNotMatch(executable,/^import\b/m);
 vm.runInNewContext(executable,{Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto:crypto.webcrypto,setTimeout,clearTimeout,
  createClient:()=>{clients++;throw Error('Anonymous request reached database');},encode:()=>{throw Error('Anonymous request reached pixel encoder');},fetch:()=>{throw Error('Anonymous request reached network');},
  Deno:{serve:fn=>{assert.equal(handler,undefined);handler=fn;},env:{get:key=>key==='SUPABASE_SECRET_KEY'?'isolated-fixture-only':key==='SUPABASE_URL'?'https://fixture.invalid':undefined}},
 },{filename:name+'.js',timeout:2000});assert.equal(typeof handler,'function');assert.equal(clients,0);return {handler,clients:()=>clients};
}
test('all standalone Community artifacts bind exact canonical bytes and initialize without network',()=>{for(const name of names){const item=manifest[name];assert.equal(item.extension,'js');assert.equal(item.sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(out,name+'.js'))).digest('hex'));for(const source of item.sources)assert.equal(source.sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,source.path))).digest('hex'));boot(name);}});
test('the actual redistributed JPEG bundle contains both full upstream license notices',()=>{const source=fs.readFileSync(path.join(out,'community-media-commit.js'),'utf8');for(const notice of ['jpeg-js-LICENSE.txt','Apache-2.0-LICENSE.txt'])assert.equal(source.includes(fs.readFileSync(path.join(root,'backend','functions','_shared','vendor',notice),'utf8')),true);});
test('standalone Community handlers deny anonymous requests before private media or database work',async()=>{for(const name of names){const instance=boot(name),response=await instance.handler(new Request('https://fixture.invalid/'+name,{method:'POST',body:'{}'}));assert.equal(response.status,401,name);assert.deepEqual(await response.json(),name==='community-media-cleanup'?{error:'SERVICE_AUTH_REQUIRED'}:{error:{code:'COMMUNITY_AUTH_REQUIRED'}});assert.equal(instance.clients(),0);}});
