import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),module={exports:{}};
try{const source=readFileSync(new URL('../src/state/SocialReader.ts',import.meta.url),'utf8');new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,module,module.exports);}catch(error){if(error.code!=='ENOENT')throw error;}
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const tick=()=>new Promise(done=>setImmediate(done));
const row=(id='friend')=>({user_id:id,handle:'rider_one',display_name:'Rider',state:'accepted',direction:'incoming',generation:1,updated_at:'2026-10-01T00:00:00.000001Z'});
function fixture(){
 assert.equal(typeof module.exports.SocialReader,'function');
 let active=true,fail=false,hold=null,holdCursorOnly=false,now=100,next=null;const calls=[];
 const social=cursor=>{calls.push(['friends',cursor]);if(hold&&(!holdCursorOnly||cursor))return hold.promise;if(fail)return Promise.reject(Error('SOCIAL_UNAVAILABLE'));return Promise.resolve({owner_id:'A',server_now:'2026-10-01T00:00:00Z',self:{profile_ready:true,presence_opt_in:true,account_revision:3},items:[row()],statuses:[{user_id:'friend',topic:'friend-topic',online:true,expires_at:'2026-10-01T00:01:10Z'}],next_cursor:next});};
 const reader=new module.exports.SocialReader({guard(){if(!active)throw Error('ACCOUNT_CHANGED');},now:()=>now,social,blocked:async cursor=>{calls.push(['blocked',cursor]);return {owner_id:'A',items:[],next_cursor:null};},invitations:async cursor=>{calls.push(['invitations',cursor]);return {owner_id:'A',server_now:'2026-10-01T00:00:00Z',items:[],next_cursor:null};}});
 return {reader,calls,stop(){active=false;reader.close();},fail(v){fail=v;},hold(cursorOnly=false){holdCursorOnly=cursorOnly;hold=deferred();return hold;},next(v){next=v;},now(v){now=v;}};
}

test('social reads coalesce and blocked identities are loaded only on explicit request',async()=>{
 const h=fixture(),hold=h.hold();const one=h.reader.refresh(),two=h.reader.refresh();
 await tick();
 assert.equal(h.reader.getSnapshot().loading,true);assert.equal(h.calls.filter(c=>c[0]==='friends').length,1);assert.equal(h.calls.some(c=>c[0]==='blocked'),false);
 hold.resolve({owner_id:'A',server_now:'2026-10-01T00:00:00Z',self:{profile_ready:true,presence_opt_in:false,account_revision:1},items:[],statuses:[],next_cursor:null});await Promise.all([one,two]);
 assert.equal(h.reader.getSnapshot().loaded,true);await h.reader.loadMoreBlocked();assert.equal(h.calls.filter(c=>c[0]==='blocked').length,1);
});

test('closed or replaced social owner cannot adopt a late first-page response',async()=>{
 const h=fixture(),hold=h.hold(),read=h.reader.refresh();h.stop();hold.resolve({self:{profile_ready:true},items:[row('other')],statuses:[],next_cursor:null});await read;
 assert.deepEqual(h.reader.getSnapshot().friends,[]);assert.equal(h.reader.getSnapshot().loaded,false);
});

test('refresh failure retains owner friend rows but clears status freshness and never infers absent profile',async()=>{
 const h=fixture();await h.reader.refresh();assert.equal(h.reader.getSnapshot().fresh,true);h.fail(true);await h.reader.refresh();
 const state=h.reader.getSnapshot();assert.equal(state.friends.length,1);assert.equal(state.self.profile_ready,true);assert.equal(state.fresh,false);assert.deepEqual(state.statuses,[]);assert.equal(state.pages.friends.error,'SOCIAL_UNAVAILABLE');
});

test('main refresh invalidates a held cursor page so an older list cannot append after reset',async()=>{
 const h=fixture();h.next({updated_at:'2026-10-01T00:00:00.000001Z',user_id:'friend'});await h.reader.refresh();const held=h.hold(true),more=h.reader.loadMoreFriends();
 await h.reader.refresh();held.resolve({items:[row('older')],statuses:[],next_cursor:null});await more;await tick();
 assert.deepEqual(h.reader.getSnapshot().friends.map(f=>f.user_id),['friend']);
});

test('social status anchor uses monotonic receipt time instead of the device wall clock',async()=>{
 const h=fixture();h.now(987654);await h.reader.refresh();const state=h.reader.getSnapshot();
 assert.equal(state.receivedAt,987654);assert.equal(state.serverNow,'2026-10-01T00:00:00Z');
});

test('background suspension cannot adopt a response as fresh presence after its foreground boundary changed',async()=>{
 const h=fixture();await h.reader.refresh();const hold=h.hold(),waiting=h.reader.refresh();h.reader.suspend();
 hold.resolve({owner_id:'A',server_now:'2026-10-01T00:00:20Z',self:{profile_ready:true,presence_opt_in:true,account_revision:3},items:[row('late')],statuses:[{user_id:'late',online:true}],next_cursor:null});await waiting;
 assert.equal(h.reader.getSnapshot().fresh,false);assert.deepEqual(h.reader.getSnapshot().statuses,[]);assert.deepEqual(h.reader.getSnapshot().friends.map(row=>row.user_id),['friend']);
});

test('peer removal invalidates held reads and post-ack refresh starts a new request',async()=>{
 const h=fixture();await h.reader.refresh();const hold=h.hold(),old=h.reader.refresh();await tick();h.reader.prunePeer('friend');
 const fresh=h.hold(),next=h.reader.refresh();await tick();assert.equal(h.calls.filter(c=>c[0]==='friends').length,3);
 hold.resolve({items:[row('stale')],statuses:[],next_cursor:null});await old;assert.deepEqual(h.reader.getSnapshot().friends,[]);
 fresh.resolve({owner_id:'A',server_now:'2026-10-01T00:00:20Z',self:{profile_ready:true,presence_opt_in:true,account_revision:3},items:[],statuses:[],next_cursor:null});await next;
 assert.deepEqual(h.reader.getSnapshot().friends,[]);
});

test('synchronous egress fence failures are adopted as errors and never leave a hanging spinner',async()=>{
 const reader=new module.exports.SocialReader({guard(){},now:()=>100,social(){throw Error('LOCAL_READ_FAILED');},blocked:async()=>({items:[],next_cursor:null}),invitations:async()=>({items:[],next_cursor:null})});
 await reader.refresh();const state=reader.getSnapshot();assert.equal(state.loading,false);assert.equal(state.pages.friends.loading,false);assert.equal(state.error,'LOCAL_READ_FAILED');assert.equal(state.fresh,false);
});

test('a slow invitation read cannot renew the clock anchor of an earlier friend response',async()=>{
 const invitations=deferred();let now=100;
 const reader=new module.exports.SocialReader({guard(){},now:()=>now,social:async()=>({owner_id:'A',server_now:'2026-10-01T00:00:00Z',self:{profile_ready:true,presence_opt_in:true,account_revision:3},items:[row()],statuses:[{user_id:'friend',topic:'friend-topic',online:true,expires_at:'2026-10-01T00:01:10Z'}],next_cursor:null}),blocked:async()=>({items:[],next_cursor:null}),invitations:()=>invitations.promise});
 const waiting=reader.refresh();await tick();now=90100;invitations.resolve({items:[],next_cursor:null});await waiting;
 const state=reader.getSnapshot();assert.equal(state.serverAnchorAt,100);assert.equal(state.receivedAt,90100);
 assert.ok(state.receivedAt-state.serverAnchorAt>70000,'the expired lease is already aged when exposed to the provider');
});
