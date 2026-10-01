import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/features/social/presentationModel.ts', import.meta.url), 'utf8').catch(() => '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const context = { exports: {}, require, Date };
runInNewContext(code, context);
const model = context.exports;
const a = '00000000-0000-4000-8000-000000000001';
const friend = { user_id: a, handle: 'rider_1', display_name: 'Rider', state: 'accepted', direction: 'incoming', generation: 4, updated_at: '2026-10-01T01:00:00.000001Z' };
const plain = value => JSON.parse(JSON.stringify(value));

test('a typed exact handle removes only one leading @ and cannot become a prefix user search', () => {
  assert.equal(typeof model.exactFriendHandle, 'function');
  assert.equal(model.exactFriendHandle(' @Rider_1 '), 'rider_1');
  for (const value of ['@@rider_1', 'ri', 'Rider one', 'นักขี่', 'rider%']) assert.throws(() => model.exactFriendHandle(value), /SOCIAL_HANDLE_INVALID/);
});

test('a reviewed friend action pins generation and refuses stale row identity instead of rebasing the press', () => {
  assert.equal(typeof model.friendRequest, 'function');
  assert.deepEqual(plain(model.friendRequest(friend, 'remove', [friend])), { schema_version: 1, action: 'friend_action', other_id: a, verb: 'remove', expected_generation: 4 });
  assert.throws(() => model.friendRequest(friend, 'remove', [{ ...friend, generation: 5 }]), /FRIEND_CHANGED/);
  assert.throws(() => model.friendRequest(friend, 'remove', []), /FRIEND_CHANGED/);
  assert.throws(() => model.friendRequest(friend, 'accept', [friend]), /FRIEND_CHANGED/);
});

test('unblock pins the reviewed block token and cannot undo a later re-block', () => {
  assert.equal(typeof model.unblockRequest, 'function');
  const blocked = { user_id: a, handle: 'rider_1', display_name: 'Rider', block_token: '00000000-0000-4000-8000-000000000002' };
  assert.deepEqual(plain(model.unblockRequest(blocked, [blocked])), { schema_version: 1, action: 'unblock', other_id: a, block_token: blocked.block_token });
  assert.throws(() => model.unblockRequest(blocked, [{ ...blocked, block_token: '00000000-0000-4000-8000-000000000003' }]), /BLOCK_CHANGED/);
});

test('historical invitation metadata can be declined but never accepted without a safe immutable snapshot', () => {
  assert.equal(typeof model.invitationRequest, 'function');
  const row = { id: a, creator_id: '00000000-0000-4000-8000-000000000004', creator_name: null, route_summary: { title: 'Old route', revision: 1, category: 'scooter' }, route_snapshot: null, mode: 'group_ride', metric: 'none', course_session_id: null, starts_at: '2026-10-02T01:00:00Z', ends_at: '2026-10-02T04:00:00Z', state: 'open', created_at: '2026-10-01T01:00:00Z', member: { state: 'invited', friendship_generation: 4 }, can_cancel: false };
  assert.throws(() => model.invitationRequest(row, 'accept', [row], Date.parse('2026-10-01T12:00:00Z')), /INVITATION_UNAVAILABLE/);
  assert.deepEqual(plain(model.invitationRequest(row, 'decline', [row], Date.parse('2026-10-01T12:00:00Z'))), { schema_version: 1, action: 'invitation_action', challenge_id: a, verb: 'decline', expected_member_state: 'invited', friendship_generation: 4 });
});

test('local date entry rejects normalized impossible dates and converts a genuine future window to UTC', () => {
  assert.equal(typeof model.localWindow, 'function');
  assert.throws(() => model.localWindow('2026-02-30 10:00', 0), /SOCIAL_WINDOW_INVALID/);
  assert.throws(() => model.localWindow('2026-10-01 25:00', 0), /SOCIAL_WINDOW_INVALID/);
  const start = new Date(2026, 9, 2, 10, 30).getTime();
  assert.deepEqual(plain(model.localWindow('2026-10-02 10:30', start - 60000)), { startsAt: new Date(start).toISOString(), endsAt: new Date(start + 10800000).toISOString() });
  assert.throws(() => model.localWindow('2026-10-02 10:30', start), /SOCIAL_WINDOW_INVALID/);
});
test('an already-open approved session permits a future invitation window but never a past or out-of-session start',()=>{
 const start=new Date(2026,9,2,13,0).getTime(),session={starts_at:new Date(2026,9,2,8,0).toISOString(),ends_at:new Date(2026,9,2,14,0).toISOString()};
 assert.deepEqual(plain(model.approvedSessionWindow('2026-10-02 13:00',session,start-3600000)),{startsAt:new Date(start).toISOString(),endsAt:session.ends_at});
 assert.throws(()=>model.approvedSessionWindow('2026-10-02 07:00',session,0),/SOCIAL_COURSE_CHANGED/);
 assert.throws(()=>model.approvedSessionWindow('2026-10-02 15:00',session,start-3600000),/SOCIAL_COURSE_CHANGED/);
 assert.throws(()=>model.approvedSessionWindow('2026-10-02 13:00',session,start),/SOCIAL_WINDOW_INVALID/);
});
