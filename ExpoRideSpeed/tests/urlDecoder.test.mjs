import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const require=createRequire(import.meta.url);
const query=require('query-string');

test('query-string still decodes Thai, spaces, plus signs, arrays and encoded delimiters',()=>{
  const route='กรุงเทพ → นครนายก';
  const parsed=query.parse(`route=${encodeURIComponent(route)}&name=Ride+Speed&literal=%2B&stop=a&stop=b&caption=a%26b%3Dc`);
  assert.equal(parsed.route,route);assert.equal(parsed.name,'Ride Speed');assert.equal(parsed.literal,'+');
  assert.deepEqual(parsed.stop,['a','b']);assert.equal(parsed.caption,'a&b=c');
  assert.equal(query.parse('bad=%&good=%E0%B8%81').bad,'%');
});
test('malformed URL input cannot hold the parser in its old expensive recursive path',()=>{
  // Separate bounded process: a vulnerable decoder cannot hang the test runner.
  const result=execFileSync(process.execPath,['-e',"const p=require('query-string').parse('route='+'%ab'.repeat(2000));if(p.route!== '%ab'.repeat(2000))process.exit(2)"],{
    cwd:new URL('../',import.meta.url),timeout:2000,encoding:'utf8',windowsHide:true,
  });
  assert.equal(result,'');
});
test('the CJS adaptation differs from pinned upstream scanner only in its export statement',()=>{
  const root=new URL('../vendor/decode-uri-component/',import.meta.url);
  const provenance=JSON.parse(readFileSync(new URL('UPSTREAM.json',root),'utf8'));
  const source=readFileSync(new URL('index.cjs',root),'utf8').replaceAll('\r\n','\n')
    .replace('module.exports = function decodeUriComponent','export default function decodeUriComponent');
  assert.equal(createHash('sha256').update(source).digest('hex'),provenance.sourceSha256);
  const dependentRequire=createRequire(require.resolve('query-string'));
  const decoder=dependentRequire('decode-uri-component');
  assert.equal(typeof decoder,'function');assert.equal(decoder('%C3%A5'),'å');
});
