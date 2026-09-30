import type { Session } from '@supabase/supabase-js';
import { accountClient, isAccountCurrent, type AuthScope } from '../../state/AuthState';
import { sendRideSummary, validateRideHistory, validateRideSyncStatus } from './syncModel';
import type { RideHistoryCursor, RideHistoryPage, RideSyncAck, RideSyncDraft } from './syncTypes';
export type { RideHistoryCursor, RideHistoryPage, RideSummaryV1, RideSyncAck, RideSyncDraft } from './syncTypes';

const ensureCurrent = (scope: AuthScope, session: Session) => {
  if (!scope.userId || session.user.id !== scope.userId || !isAccountCurrent(scope)) throw new Error('ACCOUNT_CHANGED');
};
const stableError = (error: { message?: string; code?: string }) => {
  const stable = new Set(['ACCOUNT_DELETION_PENDING', 'RIDE_SUMMARY_INVALID', 'RIDE_SUMMARY_TOO_LARGE', 'RIDE_OPERATION_CONFLICT', 'RIDE_REVISION_CONFLICT', 'RIDE_SNAPSHOT_CONFLICT', 'RIDE_UNAVAILABLE']);
  if (stable.has(error.message ?? '')) return new Error(error.message);
  if (error.message === 'Daily action limit reached') return new Error('RIDE_SYNC_RATE_LIMITED');
  if (error.code === 'PGRST301' || error.code === 'PGRST302' || error.message === 'Authentication required') return new Error('RIDE_SYNC_AUTH_REQUIRED');
  return new Error('RIDE_SYNC_UNAVAILABLE');
};

/** This transport calls only owner summary RPCs; no Storage/evidence flow exists here. */
function transport(scope: AuthScope, session: Session) {
  ensureCurrent(scope, session);
  const client = accountClient(scope, session); // Fixed JWT for the initiating owner.
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    ensureCurrent(scope, session);
    const { data, error } = await client.rpc(name, args);
    ensureCurrent(scope, session);
    if (error) throw stableError(error);
    return data;
  };
}
export async function syncRideSummary(scope: AuthScope, session: Session, draft: RideSyncDraft): Promise<RideSyncAck> {
  const rpc = transport(scope, session);
  return sendRideSummary(draft, {
    send: value => rpc('rs_sync_ride_summary', { p_operation: value.operationId, p_ride: value.rideId, p_expected_revision: value.expectedRevision, p_payload: value.payload }),
    status: operationId => rpc('rs_get_ride_sync_status', { p_operation: operationId }),
  }, () => ensureCurrent(scope, session));
}
export async function getRideSyncStatus(scope: AuthScope, session: Session, operationId: string): Promise<RideSyncAck | null> {
  const rpc = transport(scope, session);
  validateRideSyncStatus(null, operationId); // Validate before a request.
  return validateRideSyncStatus(await rpc('rs_get_ride_sync_status', { p_operation: operationId }), operationId);
}
/** Cloud history stays distinct from local journals and cannot qualify as proof. */
export async function listRideSummaries(scope: AuthScope, session: Session, options: { limit?: number; cursor?: RideHistoryCursor | null } = {}): Promise<RideHistoryPage> {
  const limit = options.limit ?? 20, cursor = options.cursor ?? null;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor && (typeof cursor.ended_at !== 'string' || !Number.isFinite(Date.parse(cursor.ended_at)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.ride_id)))) throw new Error('RIDE_SUMMARY_INVALID');
  const rpc = transport(scope, session);
  return validateRideHistory(await rpc('rs_list_ride_summaries', { p_limit: limit, p_before_end: cursor?.ended_at ?? null, p_before_id: cursor?.ride_id ?? null }), limit);
}
