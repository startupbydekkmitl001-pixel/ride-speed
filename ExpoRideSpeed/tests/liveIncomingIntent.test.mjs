import test from 'node:test';
import assert from 'node:assert/strict';
import {liveModule,uuid} from './helpers/live.mjs';
const token='x'.repeat(42)+'A',url=`ridespeed://friend/v1/${uuid(12)}#token=${token}`;
test('installed link intent is bounded, duplicate delivery cannot extend expiry, and resolution is never automatic',()=>{
 const {IncomingLinkStore}=liveModule('incomingIntent');let now=0;const store=new IncomingLinkStore(()=>now),a={userId:uuid(1),generation:1};store.bindOwner(a);
 assert.equal(store.capture('https://unknown.example/#token=secret'),false);assert.equal(store.capture(url),true);
 assert.equal(store.get(a).linkId,uuid(12));now=299999;store.capture(url);now=300001;
 assert.equal(store.get(a),null);assert.equal(store.consume(a),null);
});
test('login preserves explicit guest intent but A→B→A cannot inherit a previous owner token',()=>{
 const {IncomingLinkStore}=liveModule('incomingIntent');const store=new IncomingLinkStore(()=>0),guest={userId:null,generation:1},a={userId:uuid(1),generation:2},b={userId:uuid(2),generation:3};
 store.bindOwner(guest);store.capture(url);assert.equal(store.get(a),null);store.bindOwner(a);assert.ok(store.get(a));
 store.bindOwner(b);assert.equal(store.get(b),null);store.bindOwner({...a,generation:4});assert.equal(store.get(a),null);
});
test('consume clears memory and a malformed link cannot replace a valid incoming intent',()=>{
 const {IncomingLinkStore}=liveModule('incomingIntent');const store=new IncomingLinkStore(()=>0),a={userId:uuid(1),generation:1};store.bindOwner(a);store.capture(url);
 store.capture(url+'extra');const intent=store.consume(a);assert.equal(intent.token,token);assert.equal(store.get(a),null);
});
