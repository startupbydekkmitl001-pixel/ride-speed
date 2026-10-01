import type { BlockedPerson, FriendRow, FriendVerb, InvitationRow, InvitationVerb, SocialRequest } from './types';

export function exactFriendHandle(value: string): string {
  const handle = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) throw Error('SOCIAL_HANDLE_INVALID');
  return handle;
}

export function friendRequest(row: FriendRow, verb: FriendVerb, current: readonly FriendRow[]): SocialRequest {
  const fresh = current.find(value => value.user_id === row.user_id);
  if (!fresh || fresh.generation !== row.generation || fresh.state !== row.state || fresh.direction !== row.direction) throw Error('FRIEND_CHANGED');
  const allowed = verb === 'block' || (verb === 'remove' && fresh.state === 'accepted') ||
    (fresh.state === 'pending' && (fresh.direction === 'incoming' ? verb === 'accept' || verb === 'decline' : verb === 'cancel'));
  if (!allowed) throw Error('FRIEND_CHANGED');
  return { schema_version: 1, action: 'friend_action', other_id: row.user_id, verb, expected_generation: row.generation };
}

export function unblockRequest(row: BlockedPerson, current: readonly BlockedPerson[]): SocialRequest {
  if (!current.some(value => value.user_id === row.user_id && value.block_token === row.block_token)) throw Error('BLOCK_CHANGED');
  return { schema_version: 1, action: 'unblock', other_id: row.user_id, block_token: row.block_token };
}

export function invitationRequest(row: InvitationRow, verb: InvitationVerb, current: readonly InvitationRow[], now: number): SocialRequest {
  const fresh = current.find(value => value.id === row.id);
  if (!fresh || fresh.state !== row.state || fresh.starts_at !== row.starts_at || fresh.ends_at !== row.ends_at ||
    fresh.member?.state !== row.member?.state || fresh.member?.friendship_generation !== row.member?.friendship_generation ||
    fresh.can_cancel !== row.can_cancel || fresh.route_snapshot?.geometryHash !== row.route_snapshot?.geometryHash ||
    fresh.route_snapshot?.revision !== row.route_snapshot?.revision) throw Error('INVITATION_CHANGED');
  if (fresh.state !== 'open' || !Number.isFinite(now) || Date.parse(fresh.starts_at) <= now) throw Error('INVITATION_UNAVAILABLE');
  if (verb === 'cancel') {
    if (!fresh.can_cancel) throw Error('INVITATION_CHANGED');
    return { schema_version: 1, action: 'invitation_action', challenge_id: row.id, verb, expected_member_state: null, friendship_generation: null };
  }
  const member = fresh.member;
  if (!member || member.friendship_generation === null) throw Error('INVITATION_CHANGED');
  if (verb === 'accept' && !fresh.route_snapshot) throw Error('INVITATION_UNAVAILABLE');
  const allowed = verb === 'accept' ? ['invited', 'accepted'].includes(member.state) :
    verb === 'decline' ? ['invited', 'declined'].includes(member.state) : ['accepted', 'withdrawn'].includes(member.state);
  if (!allowed) throw Error('INVITATION_CHANGED');
  return { schema_version: 1, action: 'invitation_action', challenge_id: row.id, verb,
    expected_member_state: member.state, friendship_generation: member.friendship_generation };
}

export function localDateInput(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function localWindow(text: string, now: number): { startsAt: string; endsAt: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) throw Error('SOCIAL_WINDOW_INVALID');
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute), start = date.getTime();
  if (!Number.isFinite(now) || !Number.isFinite(start) || start <= now || date.getFullYear() !== year || date.getMonth() !== month - 1 ||
    date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) throw Error('SOCIAL_WINDOW_INVALID');
  return { startsAt: date.toISOString(), endsAt: new Date(start + 3 * 3600000).toISOString() };
}
/** A session may already be open; the invitation itself must start in future. */
export function approvedSessionWindow(text:string,session:{starts_at:string;ends_at:string},now:number){
 const window=localWindow(text,now),start=Date.parse(window.startsAt),end=Math.min(Date.parse(window.endsAt),Date.parse(session.ends_at));
 if(!Number.isFinite(end)||!Number.isFinite(Date.parse(session.starts_at))||start<Date.parse(session.starts_at)||end<=start)throw Error('SOCIAL_COURSE_CHANGED');
 return {startsAt:window.startsAt,endsAt:new Date(end).toISOString()};
}
