import type { Session } from '@supabase/supabase-js';
import { accountClient, isAccountCurrent, type AuthScope } from '../../state/AuthState';
import { sendGarageDocument, validateGarageSnapshot, validateGarageSyncStatus } from './syncModel';
import type { GarageSnapshot, GarageSyncAck, GarageSyncDraft } from './syncTypes';
export type { GarageDocumentV1, GarageSnapshot, GarageSyncAck, GarageSyncDraft, GarageSyncVehicle } from './syncTypes';

const ensureCurrent = (scope: AuthScope, session: Session) => {
  if (!scope.userId || session.user.id !== scope.userId || !isAccountCurrent(scope)) throw new Error('ACCOUNT_CHANGED');
};
function stableError(error: { code?: string; message?: string }): Error {
  const codes = ['GARAGE_INVALID', 'GARAGE_TOO_LARGE', 'GARAGE_OPERATION_CONFLICT', 'GARAGE_REVISION_CONFLICT', 'GARAGE_PHOTO_UNAVAILABLE', 'GARAGE_PHOTO_EXPIRED', 'GARAGE_PHOTO_UPLOAD_REQUIRED', 'GARAGE_PHOTO_INVALID_OBJECT', 'ACCOUNT_DELETION_PENDING'];
  if (codes.includes(error.message ?? '')) return new Error(error.message);
  if (error.message === 'Daily action limit reached') return new Error('GARAGE_SYNC_RATE_LIMITED');
  if (error.code === '22P05' || error.code === '22P02') return new Error('GARAGE_INVALID');
  if (error.code === 'PGRST301' || error.code === 'PGRST302' || error.message === 'Authentication required') return new Error('GARAGE_SYNC_AUTH_REQUIRED');
  return new Error('GARAGE_SYNC_UNAVAILABLE');
}
function transport(scope: AuthScope, session: Session) {
  ensureCurrent(scope, session); const client = accountClient(scope, session);
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    ensureCurrent(scope, session); const { data, error } = await client.rpc(name, args); ensureCurrent(scope, session);
    if (error) throw stableError(error); return data;
  };
}
/** Explicit owner-wide CAS; callers persist this entire immutable draft first. */
export async function syncGarage(scope: AuthScope, session: Session, draft: GarageSyncDraft): Promise<GarageSyncAck> {
  const rpc = transport(scope, session);
  return sendGarageDocument(draft, {
    send: value => rpc('rs_sync_garage', { p_operation: value.operationId, p_expected_revision: value.expectedRevision, p_document: value.document }),
    status: operationId => rpc('rs_get_garage_sync_status', { p_operation: operationId }),
  }, () => ensureCurrent(scope, session), scope.userId!);
}
export async function getGarage(scope: AuthScope, session: Session): Promise<GarageSnapshot> {
  const rpc = transport(scope, session);
  return validateGarageSnapshot(await rpc('rs_get_garage', {}), scope.userId!);
}
export async function getGarageSyncStatus(scope: AuthScope, session: Session, operationId: string): Promise<GarageSyncAck | null> {
  validateGarageSyncStatus(null, operationId);
  const rpc = transport(scope, session);
  return validateGarageSyncStatus(await rpc('rs_get_garage_sync_status', { p_operation: operationId }), operationId);
}
