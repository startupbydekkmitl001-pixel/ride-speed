import test from 'node:test';
import assert from 'node:assert/strict';
import {socialModule,uuid,peer,socialPage,stamp} from './helpers/social.mjs';
const model=socialModule('presenceModel');
test('status expiry uses the monotonic server anchor and never a future or backward device clock',()=>{
 assert.equal(typeof model.presenceClock,'function');const rows=socialPage().statuses,clock=model.presenceClock(stamp,1000);
 assert.equal(model.freshSocialStatuses(rows,clock,70999)[0].online,true);assert.deepEqual(model.freshSocialStatuses(rows,clock,71000),[{...rows[0],online:false,expires_at:null}]);
 for(const now of [999,NaN,Infinity])assert.equal(model.freshSocialStatuses(rows,clock,now)[0].online,false);
 assert.equal(model.freshSocialStatuses(rows,null,1000)[0].online,false);assert.equal(rows[0].online,true);
});
test('presence broadcasts are bounded refresh hints for an exact peer, never coordinate or consent authority',()=>{
 assert.equal(typeof model.validatePresenceEvent,'function');const online={user_id:peer,online:true,expires_at:'2026-10-01T02:01:10Z'};assert.deepEqual(model.validatePresenceEvent(online,peer),online);
 assert.deepEqual(model.validatePresenceEvent({user_id:peer,online:false,expires_at:stamp},peer),{user_id:peer,online:false,expires_at:stamp});
 for(const value of [{...online,user_id:uuid(9)},{...online,latitude:13},{...online,online:'true'},{...online,expires_at:'later'}])assert.equal(model.validatePresenceEvent(value,peer),null);
 assert.equal(model.socialPresenceTopic(`rs-presence:${uuid(3)}`),`rs-presence:${uuid(3)}`);for(const value of ['public','rs-presence:*',[],null])assert.equal(model.socialPresenceTopic(value),null);
});
