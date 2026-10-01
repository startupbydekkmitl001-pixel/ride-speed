import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),source=await readFile(new URL('../src/features/live/presentationModel.ts',import.meta.url),'utf8').catch(()=>''),context={exports:{},require,Date};
runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,context);
const model=context.exports,plain=value=>JSON.parse(JSON.stringify(value)),host='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003',capture='00000000-0000-4000-8000-000000000004',now=Date.parse('2026-10-01T12:00:00Z');
const member={user_id:other,handle:'rider',display_name:'Rider',role:'member',state:'requested',generation:5,host_friendship_generation:7};
const room={owner_id:host,id,host_id:host,title:'Actual group',revision:3,state:'lobby',expires_at:'2026-10-01T13:00:00Z',host_lease_until:'2026-10-01T12:00:45Z',viewer_role:'host',self_state:'accepted',self_generation:1,members:[{...member,user_id:host,role:'host',state:'accepted',generation:1,host_friendship_generation:null},member],self_consent:{revision:0,precision:'none',lease_id:null,capture_id:null,expires_at:null,last_sequence:0}};
test('a reviewed membership action pins the room revision/member generation and cannot approve a replaced application',()=>{
 assert.equal(typeof model.convoyMemberRequest,'function');assert.deepEqual(plain(model.convoyMemberRequest(room,member,'approve',room,host,now)),{schema_version:1,action:'convoy_member',convoy_id:id,other_id:other,verb:'approve',expected_room_revision:3,expected_member_generation:5,expected_member_state:'requested'});
 assert.throws(()=>model.convoyMemberRequest(room,member,'approve',{...room,members:[room.members[0],{...member,generation:6}]},host,now),/CONVOY_CHANGED/);
 assert.throws(()=>model.convoyMemberRequest(room,member,'approve',{...room,revision:4},host,now),/CONVOY_CHANGED/);
});
test('a room starts only with two genuinely accepted participants and a member cannot end or approve the room',()=>{
 assert.equal(typeof model.convoyRoomRequest,'function');assert.throws(()=>model.convoyRoomRequest(room,'start',room,host,now),/CONVOY_CHANGED/);
 const accepted={...room,members:[room.members[0],{...member,state:'accepted'}]};assert.equal(model.convoyRoomRequest(accepted,'start',accepted,host,now).action,'convoy_start');
 assert.throws(()=>model.convoyRoomRequest({...accepted,viewer_role:'member'},'end',{...accepted,viewer_role:'member'},other,now),/CONVOY_CHANGED/);
});
test('a disclosure proof cannot silently move to a new capture, grant revision or ghost mode',()=>{
 assert.equal(typeof model.locationReview,'function');const active={...room,state:'active'},proof=model.locationReview(active,capture,false,now);assert.equal(proof.captureId,capture);
 assert.equal(model.assertLocationReview(proof,active,capture,false,now),undefined);
 assert.throws(()=>model.assertLocationReview(proof,active,other,false,now),/LOCATION_CONSENT_CHANGED/);
 assert.throws(()=>model.assertLocationReview(proof,{...active,self_consent:{...active.self_consent,revision:1}},capture,false,now),/LOCATION_CONSENT_CHANGED/);
 assert.throws(()=>model.locationReview(active,capture,true,now),/LOCATION_CONSENT_REQUIRED/);
 assert.throws(()=>model.locationReview(active,null,false,now),/LOCATION_CONSENT_REQUIRED/);
});
test('resolved friend/code proofs expire without rebasing the reviewed issuer or room expectations',()=>{
 assert.equal(typeof model.friendLinkRequest,'function');const preview={proof_id:id,link_id:id,issuer_id:other,display_name:'Rider',handle:'rider',expires_at:'2026-10-01T12:05:00Z'};assert.equal(model.friendLinkRequest(preview,now).issuer_id,other);assert.throws(()=>model.friendLinkRequest(preview,now+300000),/FRIEND_LINK_UNAVAILABLE/);
 const code={proof_id:id,convoy_id:id,host_id:other,host_name:'Rider',title:'Trip',room_revision:3,host_friendship_generation:7,expires_at:preview.expires_at};assert.deepEqual(plain(model.convoyJoinRequest(code,now)),{schema_version:1,action:'convoy_join',convoy_id:id,proof_id:id,expected_room_revision:3,host_friendship_generation:7});assert.throws(()=>model.convoyJoinRequest(code,now+300000),/CONVOY_UNAVAILABLE/);
});
