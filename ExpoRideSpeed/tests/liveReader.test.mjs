import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {liveModule,snapshot,hold,tick,stamp} from './helpers/live.mjs';
import ts from 'typescript';
const path=new URL('../src/state/LiveReader.ts',import.meta.url),module={exports:{}};
if(existsSync(path))new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.endsWith('clockModel')?liveModule('clockModel'):null,module,module.exports);
function fixture(){let now=100,current=true,fail=false,waiting=null;const calls=[];
 const reader=new module.exports.LiveReader({guard(){if(!current)throw Error('ACCOUNT_CHANGED');},now:()=>now,links:async()=>{calls.push('links');if(fail)throw Error('LIVE_UNAVAILABLE');return {items:[]};},rooms:async()=>{calls.push('rooms');return {items:[]};},room:async id=>{calls.push(id);if(waiting)return waiting.promise;if(fail)throw Error('LIVE_UNAVAILABLE');return snapshot();}});
 return {reader,calls,now(v){now=v;},fail(){fail=true;},hold(){waiting=hold();return waiting;},close(){current=false;reader.close();}};
}
test('live reader coalesces reads and only opens a room explicitly',async()=>{const h=fixture();await Promise.all([h.reader.refresh(),h.reader.refresh()]);assert.deepEqual(h.calls,['links','rooms']);assert.equal(h.reader.getSnapshot().fresh,true);assert.equal(h.reader.getSnapshot().room,null);await h.reader.open(snapshot().id);assert.equal(h.reader.getSnapshot().room.id,snapshot().id);});
test('room server clock keeps request-start anchor despite slow response',async()=>{const h=fixture(),pending=h.hold(),one=h.reader.open(snapshot().id);await tick();h.now(20100);pending.resolve(snapshot());await one;const state=h.reader.getSnapshot();assert.equal(state.roomClock.requestStartMonotonicMs,100);assert.equal(state.roomClock.adoptedMonotonicMs,20100);assert.equal(state.roomClock.serverTimeMs,Date.parse(stamp));});
test('suspension drops room coordinates and stale late reads cannot regain freshness',async()=>{const h=fixture();await h.reader.open(snapshot().id);const pending=h.hold(),one=h.reader.refresh();h.reader.suspend();assert.equal(h.reader.getSnapshot().room,null);pending.resolve(snapshot());await one;assert.equal(h.reader.getSnapshot().room,null);assert.equal(h.reader.getSnapshot().fresh,false);});
test('failed read preserves successful lists but marks them stale and never claims an empty success',async()=>{const h=fixture();await h.reader.refresh();h.fail();await h.reader.refresh();assert.equal(h.reader.getSnapshot().loaded,true);assert.equal(h.reader.getSnapshot().fresh,false);assert.equal(h.reader.getSnapshot().error,'LIVE_UNAVAILABLE');assert.equal(h.reader.getSnapshot().loading,false);});
test('owner closure drops held room and all cached lists',async()=>{const h=fixture(),pending=h.hold(),one=h.reader.open(snapshot().id);h.close();pending.resolve(snapshot());await one;assert.equal(h.reader.getSnapshot().room,null);assert.equal(h.reader.getSnapshot().loaded,false);});
