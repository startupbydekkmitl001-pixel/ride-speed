import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {raceModule,stored,uuid} from './helpers/races.mjs';
const require = createRequire(import.meta.url), ts = require('typescript');
const imports = { './preferences': await import('../src/lib/preferences.ts'), '../features/garage/localModel': await import('../src/features/garage/localModel.ts') };
imports['../features/races/model']=raceModule('model');
imports['../features/races/evidenceReferences']=raceModule('evidenceReferences');
imports['../features/races/stopIntents']=raceModule('stopIntents');
function compile(path, dependencies={}) {
 const out={exports:{}};const source=readFileSync(new URL(path,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',js)(name=>{if(name in dependencies)return dependencies[name];throw Error(name);},out,out.exports);return out.exports;
}
const routeSync=compile('../src/features/routes/syncModel.ts');
imports['../features/social/model']=compile('../src/features/social/model.ts',{'../routes/syncModel':routeSync});
imports['../features/live/model']=compile('../src/features/live/model.ts',{'../social/model':imports['../features/social/model'],'../routes/syncModel':routeSync});
imports['../features/routes/localModel']=compile('../src/features/routes/localModel.ts',{'./syncModel':routeSync});
imports['../features/routes/persistenceModel']=await import('../src/features/routes/persistenceModel.ts');
const module = { exports: {} };
try {
  const source = readFileSync(new URL('../src/lib/accountLocalStore.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)(name => imports[name], module, module.exports);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const fixture = () => {
  const values = new Map(), writes = []; let scope = { userId: 'A', generation: 1 }, hold = null, removeHold = null, fail = false, readFails = false, preferencesFail = false;
  const storage = { getItem: async key => { if (readFails) throw new Error('read unavailable'); return values.get(key) ?? null; }, setItem: async (key, value) => {
    writes.push({ key, value }); if (hold) await hold.promise; if (fail || (preferencesFail && key === 'ride.preferences.v5')) throw new Error('disk unavailable'); values.set(key, value);
  }, removeItem: async key => { if (removeHold) await removeHold.promise; values.delete(key); }};
  assert.equal(typeof module.exports.AccountLocalStore, 'function');
  const store = new module.exports.AccountLocalStore(storage, candidate => candidate === scope);
  return { store, values, writes, get scope() { return scope; }, switch(id) { scope = { userId: id, generation: scope.generation + 1 }; return scope; },
    hold() { hold = deferred(); return hold; }, holdRemoval() { removeHold = deferred(); return removeHold; },
    fail(value) { fail = value; }, failReads(value) { readFails = value; }, failPreferences(value) { preferencesFail = value; } };
};
const vehicle = id => ({ id, catalogId: null, category: 'scooter', brand: 'Honda', model: 'PCX160', engineCc: 156.93, year: '' });
const flush = () => new Promise(r => setImmediate(r));
const socialOperation = (handle='rider_one') => ({operationId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',request:{schema_version:1,action:'request_friend',handle},queuedAt:'2026-10-01T00:00:00.000Z',lastError:null});
const liveOperation = () => ({operationId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',request:{schema_version:1,action:'friend_link_create',link_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',token_hash:'a'.repeat(64),ttl_seconds:3600},queuedAt:'2026-10-01T00:00:00Z',lastError:null});
const evidenceRef=()=>({owner_id:uuid(1),attempt_id:uuid(4),race_id:uuid(3),ride_id:uuid(13),capture_id:uuid(5),sha256:'a'.repeat(64),byte_length:3000,first_sequence:4,last_sequence:7,sample_count:4});
const stopIntent=()=>({attempt_id:uuid(4),race_id:uuid(3),capture_id:uuid(5),reason:'background'});

test('a stop intent survives owner restart independently of the old failed CAS operation',async()=>{
 const h=fixture();await h.store.hydrate(h.switch(uuid(1)));const old=h.scope,stop=stopIntent();
 assert.equal(h.store.update(old,{raceStopIntents:[stop]}),true);await h.store.flush();
 await h.store.hydrate(h.switch(uuid(2)));assert.deepEqual(h.store.getSnapshot().owned.raceStopIntents,[]);
 await h.store.hydrate(h.switch(uuid(1)));assert.deepEqual(h.store.getSnapshot().owned.raceStopIntents,[stop]);assert.deepEqual(h.store.getSnapshot().owned.raceOperations,[]);
 assert.equal(h.store.update(old,{raceStopIntents:[]}),false);
 await h.store.forgetAccount(h.scope);assert.equal(h.values.has(`ride.local.v5.${uuid(1)}`),false);
});

test('unknown or duplicate stop intents preserve unread recovery bytes instead of discarding the requested stop',async()=>{
 for(const intents of [[{...stopIntent(),revision:99}],[stopIntent(),stopIntent()]]){
  const h=fixture(),key=`ride.local.v5.${uuid(1)}`,bytes=JSON.stringify({raceStopIntents:intents});h.values.set(key,bytes);
  await h.store.hydrate(h.switch(uuid(1)));assert.equal(h.store.getSnapshot().error,'LOCAL_READ_FAILED');assert.equal(h.store.update(h.scope,{raceStopIntents:[]}),false);await h.store.flush();assert.equal(h.values.get(key),bytes);
 }
});

test('guest import preserves the vehicle but cannot import stop authority for an account attempt',async()=>{
 const h=fixture();await h.store.hydrate(h.switch(null));assert.equal(h.store.update(h.scope,{raceStopIntents:[stopIntent()]}),false);h.store.update(h.scope,{vehicles:[vehicle('guest')]});await h.store.flush();
 const raw=JSON.parse(h.values.get('ride.local.v5.guest'));raw.raceStopIntents=[stopIntent()];h.values.set('ride.local.v5.guest',JSON.stringify(raw));
 await h.store.hydrate(h.switch(uuid(1)));await h.store.importGuest(h.scope);assert.equal(h.store.getSnapshot().owned.vehicles.length,1);assert.deepEqual(h.store.getSnapshot().owned.raceStopIntents,[]);
});

test('race control intent and evidence references survive restart without replaying capture authority or raw positions',async()=>{
 const h=fixture();await h.store.hydrate(h.switch(uuid(1)));const prior=h.scope,op=stored(),ref=evidenceRef();assert.equal(h.store.update(prior,{raceOperations:[op],raceEvidence:[ref]}),true);await h.store.flush();
 await h.store.hydrate(h.switch(uuid(2)));assert.deepEqual(h.store.getSnapshot().owned.raceOperations,[]);assert.deepEqual(h.store.getSnapshot().owned.raceEvidence,[]);
 await h.store.hydrate(h.switch(uuid(1)));assert.deepEqual(h.store.getSnapshot().owned.raceOperations,[op]);assert.deepEqual(h.store.getSnapshot().owned.raceEvidence,[ref]);assert.equal(h.store.update(prior,{raceOperations:[]}),false);
 const bytes=h.values.get(`ride.local.v5.${uuid(1)}`);for(const forbidden of ['latitude','longitude','request_started_monotonic_ms','reviewedAt'])assert.equal(bytes.includes(forbidden),false);
});
test('unknown race or evidence metadata preserves the unread recovery record',async()=>{
 for(const field of ['raceOperations','raceEvidence']){const h=fixture();await h.store.hydrate(h.switch(uuid(1)));h.store.update(h.scope,{vehicles:[vehicle('retained')]});await h.store.flush();const key=`ride.local.v5.${uuid(1)}`,data=JSON.parse(h.values.get(key));data[field]=field==='raceOperations'?[{...stored(),authority:true}]:[{...evidenceRef(),latitude:13}];const bytes=JSON.stringify(data);h.values.set(key,bytes);await h.store.hydrate(h.switch(uuid(1)));assert.equal(h.store.getSnapshot().error,'LOCAL_READ_FAILED');assert.equal(h.store.update(h.scope,{raceOperations:[],raceEvidence:[]}),false);await h.store.flush();assert.equal(h.values.get(key),bytes);}
});
test('guest migration cannot import race intent or another owner evidence references',async()=>{
 const h=fixture();await h.store.hydrate(h.switch(null));h.store.update(h.scope,{vehicles:[vehicle('guest')]});await h.store.flush();const data=JSON.parse(h.values.get('ride.local.v5.guest'));data.raceOperations=[stored()];data.raceEvidence=[evidenceRef()];h.values.set('ride.local.v5.guest',JSON.stringify(data));await h.store.hydrate(h.switch(uuid(1)));await h.store.importGuest(h.scope);assert.deepEqual(h.store.getSnapshot().owned.raceOperations,[]);assert.deepEqual(h.store.getSnapshot().owned.raceEvidence,[]);
});
test('foreign owner evidence cannot enter local state or overwrite an unread record',async()=>{
 const h=fixture();await h.store.hydrate(h.switch(uuid(2)));assert.equal(h.store.update(h.scope,{raceEvidence:[evidenceRef()]}),false);await h.store.flush();const key=`ride.local.v5.${uuid(2)}`,bytes=JSON.stringify({...h.store.getSnapshot().owned,raceEvidence:[evidenceRef()]});h.values.set(key,bytes);await h.store.hydrate(h.switch(uuid(2)));assert.equal(h.store.getSnapshot().error,'LOCAL_READ_FAILED');assert.equal(h.store.update(h.scope,{raceEvidence:[]}),false);await h.store.flush();assert.equal(h.values.get(key),bytes);
});

test('live control outbox retains only hash and immutable intent across owner restart',async()=>{
 const h=fixture();await h.store.hydrate(h.scope);const old=h.scope,op=liveOperation();assert.equal(h.store.update(old,{liveOperations:[op]}),true);await h.store.flush();
 await h.store.hydrate(h.switch('B'));assert.deepEqual(h.store.getSnapshot().owned.liveOperations,[]);await h.store.hydrate(h.switch('A'));assert.deepEqual(h.store.getSnapshot().owned.liveOperations,[op]);assert.equal(h.store.update(old,{liveOperations:[]}),false);
 const raw=h.values.get('ride.local.v5.A');assert.equal(raw.includes('token_hash'),true);assert.equal(raw.includes('reviewedAt'),false);
});
test('unknown live grant bytes fail hydration and cannot overwrite owner recovery copy',async()=>{
 const h=fixture();await h.store.hydrate(h.scope);h.store.update(h.scope,{vehicles:[vehicle('retained')]});await h.store.flush();const raw=JSON.parse(h.values.get('ride.local.v5.A'));raw.liveOperations=[{...liveOperation(),request:{schema_version:1,action:'location_grant',token:'private'}}];const bytes=JSON.stringify(raw);h.values.set('ride.local.v5.A',bytes);
 await h.store.hydrate(h.switch('A'));assert.equal(h.store.getSnapshot().error,'LOCAL_READ_FAILED');assert.equal(h.store.update(h.scope,{liveOperations:[]}),false);await h.store.flush();assert.equal(h.values.get('ride.local.v5.A'),bytes);
});

test('social outbox survives owner restart while stale A callbacks cannot write into a later A generation',async()=>{
 const h=fixture();await h.store.hydrate(h.scope);const old=h.scope,op=socialOperation();
 assert.equal(h.store.update(old,{socialOperations:[op]}),true);await h.store.flush();
 await h.store.hydrate(h.switch('B'));assert.deepEqual(h.store.getSnapshot().owned.socialOperations,[]);
 await h.store.hydrate(h.switch('A'));assert.deepEqual(h.store.getSnapshot().owned.socialOperations,[op]);
 assert.equal(h.store.update(old,{socialOperations:[]}),false);assert.deepEqual(h.store.getSnapshot().owned.socialOperations,[op]);
});

test('malformed social operation fails hydration without erasing unrelated owner vehicles or recovery bytes',async()=>{
 const h=fixture();await h.store.hydrate(h.scope);h.store.update(h.scope,{vehicles:[vehicle('retained')]});await h.store.flush();
 const raw=JSON.parse(h.values.get('ride.local.v5.A'));raw.socialOperations=[{...socialOperation(),request:{schema_version:1,action:'set_presence',enabled:true}}];
 const bytes=JSON.stringify(raw);h.values.set('ride.local.v5.A',bytes);await h.store.hydrate(h.switch('A'));
 assert.equal(h.store.getSnapshot().error,'LOCAL_READ_FAILED');assert.equal(h.store.update(h.scope,{vehicles:[]}),false);
 await h.store.flush();assert.equal(h.values.get('ride.local.v5.A'),bytes);
});

test('guest import never grants social requests or presence consent to the signed-in owner',async()=>{
 const h=fixture();await h.store.hydrate(h.switch(null));h.store.update(h.scope,{vehicles:[vehicle('guest')]});await h.store.flush();
 const guest=JSON.parse(h.values.get('ride.local.v5.guest'));guest.socialOperations=[socialOperation()];h.values.set('ride.local.v5.guest',JSON.stringify(guest));
 await h.store.hydrate(h.switch('A'));await h.store.importGuest(h.scope);
 assert.equal(h.store.getSnapshot().owned.vehicles.length,1);assert.deepEqual(h.store.getSnapshot().owned.socialOperations,[]);
});
test('hydration preserves full server-valid Unicode nickname and year',async()=>{
 const h=fixture();await h.store.hydrate(h.scope);const v={...vehicle('unicode'),nickname:'😀'.repeat(80),year:'😀'.repeat(30)};
 h.store.update(h.scope,{vehicles:[v]});await h.store.flush();await h.store.hydrate(h.switch('A'));
 assert.equal(h.store.getSnapshot().owned.vehicles[0].nickname,v.nickname);assert.equal(h.store.getSnapshot().owned.vehicles[0].year,v.year);
});

test('garage power/photo/edit fields and pending immutable sync survive a restart', async()=>{
 const h=fixture();await h.store.hydrate(h.scope);
 const v={...vehicle('v'),powertrain:null,motorPowerKw:null,nickname:'My scooter',color:'#FF5A1F',photoPath:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'};
 const model=imports['../features/garage/localModel'];const document=model.garageDocument([v],'v');
 const garageSync={revision:0,cleanFingerprint:null,pending:{operationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',expectedRevision:0,document}};
 h.store.update(h.scope,{vehicles:[v],selectedVehicleId:'v',garageSync});await h.store.flush();await h.store.hydrate(h.switch('A'));
 assert.deepEqual(h.store.getSnapshot().owned.vehicles[0],v);assert.deepEqual(h.store.getSnapshot().owned.garageSync,garageSync);assert.equal(h.store.isOwnedDurable(h.scope),true);
});
test('guest import strips private photo and sync binding while keeping plain vehicle details',async()=>{
 const h=fixture();await h.store.hydrate(h.switch(null));h.store.update(h.scope,{vehicles:[{...vehicle('g'),nickname:'Scooter',photoPath:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'}]});await h.store.flush();
 await h.store.hydrate(h.switch('A'));await h.store.importGuest(h.scope);const value=h.store.getSnapshot().owned;
 assert.equal(value.vehicles[0].photoPath,undefined);assert.equal(value.vehicles[0].nickname,'Scooter');assert.deepEqual(value.garageSync,imports['../features/garage/localModel'].blankGarageSync());
});
test('failed or waiting garage disk writes are never advertised durable',async()=>{
 const h=fixture();await h.store.hydrate(h.scope);const hold=h.hold();h.store.update(h.scope,{vehicles:[vehicle('v')]});assert.equal(h.store.isOwnedDurable(h.scope),false);hold.resolve();await h.store.flush();assert.equal(h.store.isOwnedDurable(h.scope),true);
 h.fail(true);h.store.update(h.scope,{vehicles:[vehicle('x')]});await h.store.flush();assert.equal(h.store.isOwnedDurable(h.scope),false);h.fail(false);await h.store.retry(h.scope);assert.equal(h.store.isOwnedDurable(h.scope),true);
});

test('legacy garage/routes migrate only to guest, preserve preferences and never inherit cloud bindings', async () => {
  const h = fixture();
  h.values.set('ridespeed.local.v4', JSON.stringify({ theme: 'dark', language: 'th', welcomeDone: true, vehicles: [vehicle('local')], selectedVehicleId: 'local', routes: [{ id: 'r', name: 'Private test', closedCourse: false, cloudId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', cloudRevision: 4, stops: [{ id: 's', name: 'Start', latitude: 1, longitude: 2 }, { id: 'f', name: 'Finish', latitude: 1.01, longitude: 2.01 }] }] }));
  await h.store.hydrate(h.scope);
  assert.equal(h.store.getSnapshot().preferences.theme, 'dark');
  assert.equal(h.store.getSnapshot().owned.vehicles.length, 0);
  await h.store.hydrate(h.switch(null));
  const guest = h.store.getSnapshot().owned;
  assert.equal(guest.vehicles.length, 1); assert.equal(guest.welcomeDone, true);
  assert.equal(guest.routes[0].cloudId, undefined); assert.equal(guest.routes[0].cloudRevision, undefined);
  assert.ok(h.values.has('ridespeed.local.v4'), 'migration retains the original recovery backup');
});

test('late A writes stay in A; B renders blank during hydration and A→B→A rejects old callbacks', async () => {
  const h = fixture(); await h.store.hydrate(h.scope); const originalA = h.scope;
  const hold = h.hold(); h.store.update(originalA, { vehicles: [vehicle('a')], selectedVehicleId: 'a' }); await flush();
  const loadingB = h.store.hydrate(h.switch('B'));
  assert.equal(h.store.getSnapshot().ready, false); assert.equal(h.store.getSnapshot().owned.vehicles.length, 0);
  hold.resolve(); await loadingB;
  h.store.update(h.scope, { vehicles: [vehicle('b')] }); await h.store.flush();
  await h.store.hydrate(h.switch('A'));
  assert.equal(h.store.getSnapshot().owned.vehicles[0].id, 'a');
  assert.equal(h.store.update(originalA, { vehicles: [vehicle('stale')] }), false);
  assert.equal(h.store.getSnapshot().owned.vehicles[0].id, 'a');
  assert.ok(h.writes.some(w => w.key === 'ride.local.v5.A' && JSON.parse(w.value).vehicles[0]?.id === 'a'));
  assert.equal(JSON.parse(h.values.get('ride.local.v5.B')).vehicles[0].id, 'b');
});

test('guest import is explicit, merges private copies once, and never rebinds cloud IDs', async () => {
  const h = fixture(); await h.store.hydrate(h.switch(null));
  h.store.update(h.scope, { vehicles: [vehicle('g')], selectedVehicleId: 'g' }); await h.store.flush();
  await h.store.hydrate(h.switch('A')); assert.equal(h.store.getSnapshot().owned.vehicles.length, 0);
  await Promise.all([h.store.importGuest(h.scope), h.store.importGuest(h.scope)]);
  const copy = h.store.getSnapshot().owned.vehicles[0]; assert.equal(copy.model, 'PCX160'); assert.notEqual(copy.id, 'g');
  await h.store.importGuest(h.scope); assert.equal(h.store.getSnapshot().owned.vehicles.length, 1);
  await h.store.hydrate(h.switch('B')); assert.equal(h.store.getSnapshot().owned.vehicles.length, 0);
});

test('failed storage writes remain visible and retry without losing the owner draft', async () => {
  const h = fixture(); await h.store.hydrate(h.scope); h.fail(true);
  h.store.update(h.scope, { vehicles: [vehicle('draft')] }); await h.store.flush();
  assert.equal(h.store.getSnapshot().error, 'LOCAL_WRITE_FAILED');
  assert.equal(h.store.getSnapshot().owned.vehicles[0].id, 'draft');
  h.fail(false); await h.store.retry(h.scope);
  assert.equal(h.store.getSnapshot().error, null); assert.equal(JSON.parse(h.values.get('ride.local.v5.A')).vehicles[0].id, 'draft');
});

test('device preferences survive account switches while onboarding and selected vehicles stay owned', async () => {
  const h = fixture(); await h.store.hydrate(h.scope);
  h.store.update(h.scope, { language: 'th', theme: 'dark', welcomeDone: true, vehicles: [vehicle('a')], selectedVehicleId: 'a' }); await h.store.flush();
  await h.store.hydrate(h.switch('B'));
  const state = h.store.getSnapshot(); assert.equal(state.preferences.language, 'th'); assert.equal(state.owned.welcomeDone, false); assert.equal(state.owned.selectedVehicleId, null);
  assert.equal(JSON.parse(h.values.get('ride.preferences.v5')).welcomeDone, undefined);
});

test('malformed owner data is bounded and never leaves a dangling vehicle selection', async () => {
  const h = fixture(); h.values.set('ride.local.v5.A', JSON.stringify({ vehicles: [vehicle('valid'), { ...vehicle('bad'), category: 'aircraft' }], selectedVehicleId: 'missing', routes: [] }));
  await h.store.hydrate(h.scope); const state = h.store.getSnapshot();
  assert.equal(state.owned.vehicles.length, 1); assert.equal(state.owned.selectedVehicleId, null); assert.equal(state.owned.routes.length, 0);
});

test('read failure cannot overwrite stored garage or preferences, and retry reloads the saved data', async () => {
  const h = fixture(); await h.store.hydrate(h.scope);
  h.store.update(h.scope, { vehicles: [vehicle('saved')], language: 'th' }); await h.store.flush();
  h.failReads(true); await h.store.hydrate(h.scope);
  assert.equal(h.store.getSnapshot().error, 'LOCAL_READ_FAILED');
  assert.equal(h.store.update(h.scope, { vehicles: [vehicle('new')], language: 'en' }), false);
  await h.store.retry(h.scope);
  assert.equal(JSON.parse(h.values.get('ride.local.v5.A')).vehicles[0].id, 'saved');
  assert.equal(JSON.parse(h.values.get('ride.preferences.v5')).language, 'th');
  h.failReads(false); await h.store.retry(h.scope);
  assert.equal(h.store.getSnapshot().owned.vehicles[0].id, 'saved');
  assert.equal(h.store.getSnapshot().error, null);
});

test('completed account cleanup removes its pinned local data without clearing a later account or device preferences', async () => {
  const h = fixture(); await h.store.hydrate(h.scope); const accountA = h.scope;
  h.store.update(accountA, { language: 'th', vehicles: [vehicle('a')] }); await h.store.flush();
  await h.store.hydrate(h.switch('B')); h.store.update(h.scope, { vehicles: [vehicle('b')] }); await h.store.flush();
  await h.store.forgetAccount(accountA);
  assert.equal(h.values.has('ride.local.v5.A'), false);
  assert.equal(h.store.getSnapshot().owned.vehicles[0].id, 'b');
  assert.equal(h.values.has('ride.local.v5.B'), true); assert.equal(h.values.has('ride.preferences.v5'), true);
});

test('a confirmed deleted owner cannot enqueue writes while delayed local removal is pending', async () => {
  const h = fixture(); await h.store.hydrate(h.scope); const originalA = h.scope;
  h.store.update(originalA, { vehicles: [vehicle('a')] }); await h.store.flush();
  const hold = h.holdRemoval(); const removing = h.store.forgetAccount(originalA); await flush();
  assert.equal(h.store.update(originalA, { vehicles: [vehicle('resurrected')] }), false);
  hold.resolve(); await removing; await h.store.flush();
  assert.equal(h.values.has('ride.local.v5.A'), false);
  await h.store.hydrate(h.switch('B'));
  assert.equal(h.store.update(h.scope, { vehicles: [vehicle('b')] }), true); await h.store.flush();
  assert.equal(JSON.parse(h.values.get('ride.local.v5.B')).vehicles[0].id, 'b');
});

test('failed device preference persistence stays visible across an account switch and retries', async () => {
  const h = fixture(); await h.store.hydrate(h.scope); h.failPreferences(true);
  h.store.update(h.scope, { language: 'th' }); await h.store.flush();
  await h.store.hydrate(h.switch('B'));
  assert.equal(h.store.getSnapshot().preferences.language, 'th');
  assert.equal(h.store.getSnapshot().error, 'LOCAL_WRITE_FAILED');
  h.failPreferences(false); await h.store.retry(h.scope);
  assert.equal(h.store.getSnapshot().error, null);
  assert.equal(JSON.parse(h.values.get('ride.preferences.v5')).language, 'th');
});

const routeDocument=()=>({schema_version:1,title:'Private route',category:'scooter',visibility:'private',stops:[{lat:13,lng:100,label:'Start'},{lat:13.01,lng:100.01,label:'Finish'}],source:{kind:'draft'}});
test('canonical route records, pending operations, deletion tombstones and planning draft survive restart',async()=>{
 const h=fixture();await h.store.hydrate(h.scope);const document=routeDocument();
 const record={localId:'private',document,geometry:null,sync:{cloudId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:0,cleanFingerprint:null,pending:{action:'save',draft:{operationId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',routeId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expectedRevision:0,document}},deleted:false,serverDeleted:false,blocked:null}};
 const draft={localId:null,value:{title:'',category:'scooter',visibility:'private',stops:[],geometry:null}};
 h.store.update(h.scope,{routeRecords:[record],routeDraft:draft,routeConsent:true});await h.store.flush();await h.store.hydrate(h.switch('A'));
 assert.deepEqual(h.store.getSnapshot().owned.routeRecords,[record]);assert.deepEqual(h.store.getSnapshot().owned.routeDraft,draft);assert.equal(h.store.getSnapshot().owned.routeConsent,true);
 const tombstone={...record,sync:{...record.sync,pending:null,deleted:true,serverDeleted:true,revision:1}};h.store.update(h.scope,{routeRecords:[tombstone]});await h.store.flush();await h.store.hydrate(h.switch('A'));
 assert.equal(h.store.getSnapshot().owned.routes.length,0);assert.equal(h.store.getSnapshot().owned.routeRecords[0].sync.serverDeleted,true);
});
test('authoritative empty route records cannot resurrect legacy compatibility routes',async()=>{
 const h=fixture();h.values.set('ride.local.v5.A',JSON.stringify({routeRecords:[],routes:[{id:'old',name:'Old',stops:[{id:'s',name:'Start',latitude:1,longitude:2},{id:'f',name:'Finish',latitude:2,longitude:3}]}]}));await h.store.hydrate(h.scope);assert.deepEqual(h.store.getSnapshot().owned.routes,[]);assert.deepEqual(h.store.getSnapshot().owned.routeRecords,[]);
});
test('corrupt canonical route retry fails hydration and cannot overwrite its recovery record',async()=>{
 const h=fixture();const raw=JSON.stringify({routeRecords:[{localId:'bad',document:routeDocument(),geometry:null,sync:{pending:{garbage:true}}}]});h.values.set('ride.local.v5.A',raw);await h.store.hydrate(h.scope);assert.equal(h.store.getSnapshot().error,'LOCAL_READ_FAILED');assert.equal(h.store.update(h.scope,{routeRecords:[]}),false);assert.equal(h.values.get('ride.local.v5.A'),raw);
});

test('legacy incomplete route is preserved, while invalid legacy pins fail instead of silently erasing data',async()=>{
 const h=fixture();h.values.set('ride.local.v5.A',JSON.stringify({routes:[{id:'incomplete',name:'Draft',stops:[{id:'s',name:'Start',latitude:1,longitude:2}]}]}));await h.store.hydrate(h.scope);assert.equal(h.store.getSnapshot().owned.routeRecords[0].document.stops.length,1);
 const bad=JSON.stringify({routes:[{id:'broken',name:'Broken',stops:[{id:'s',name:'Start',latitude:900,longitude:2}]}]});h.values.set('ride.local.v5.B',bad);await h.store.hydrate(h.switch('B'));assert.equal(h.store.getSnapshot().error,'LOCAL_READ_FAILED');assert.equal(h.values.get('ride.local.v5.B'),bad);
});
