import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {initialize,ports,profiles,A,B,request} from './live-fixture.mjs';
import {nextRaceId} from './race-fixture.mjs';
import {communityModule} from '../../ExpoRideSpeed/tests/communityFixtures.mjs';

const model=communityModule('model');let db,p;
beforeEach(async()=>{await db?.close();db=new PGlite();await initialize(db);p=ports(db);await profiles(p);});
after(async()=>{await db?.close();});
async function legacy(){const id=nextRaceId();await p.admin("insert into public.rs_posts(id,owner_id,caption,visibility,moderation_state) values($1,$2,'Genuine previous-version fixture','community','published')",[id,A]);return id;}

for(const action of ['audience','delete_post'])test(`actual upgrade legacy ${action} has one canonical CAS revision increment and a decodable immutable receipt`,async()=>{
 const postId=await legacy(),operationId=nextRaceId(),body=request(action,{post_id:postId,expected_revision:1,...action==='audience'?{visibility:'private'}:{}});
 const receipt=await p.value(A,'select public.rs_community_mutate($1,$2::jsonb) value',[operationId,JSON.stringify(body)]);
 assert.equal(receipt.error,undefined);assert.equal(receipt.result.content_revision,2);
 model.validateCommunityReceipt(receipt,A,{operationId,request:body});
 const replay=await p.value(A,'select public.rs_community_mutate($1,$2::jsonb) value',[operationId,JSON.stringify(body)]);assert.deepEqual(replay,receipt);
 const peer=await p.value(B,'select public.rs_community_post($1) value',[postId]);assert.equal(peer.error.code,'COMMUNITY_UNAVAILABLE');
});

test('a post owner can decode a canonical comments page containing another rider comment',async()=>{
 const postId=await legacy(),commentId=nextRaceId(),body=request('comment',{post_id:postId,expected_revision:1,comment_id:commentId,body:'ขับขี่ปลอดภัยครับ'});
 const receipt=await p.value(B,'select public.rs_community_mutate($1,$2::jsonb) value',[nextRaceId(),JSON.stringify(body)]);
 assert.equal(receipt.error,undefined);
 const comments=await p.value(A,'select public.rs_community_comments($1,null,30) value',[postId]);
 assert.equal(comments.items.length,1);assert.equal(comments.items[0].owner_id,B);assert.equal(comments.items[0].can_delete,false);
 model.validateCommunityComments(comments,A,postId);
 const ownComments=await p.value(B,'select public.rs_community_comments($1,null,30) value',[postId]);
 model.validateCommunityComments(ownComments,B,postId);assert.equal(ownComments.items[0].can_delete,true);
 const deletion=request('delete_comment',{post_id:postId,expected_revision:1,comment_id:commentId});
 const denied=await p.value(A,'select public.rs_community_mutate($1,$2::jsonb) value',[nextRaceId(),JSON.stringify(deletion)]);
 assert.equal(denied.error.code,'COMMUNITY_UNAVAILABLE');
 const ownId=nextRaceId(),ownReceipt=await p.value(B,'select public.rs_community_mutate($1,$2::jsonb) value',[ownId,JSON.stringify(deletion)]);
 model.validateCommunityReceipt(ownReceipt,B,{operationId:ownId,request:deletion});
 assert.equal((await p.value(A,'select public.rs_community_comments($1,null,30) value',[postId])).items.length,0);
});
