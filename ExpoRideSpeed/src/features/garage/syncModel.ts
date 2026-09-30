import type { GarageDocumentV1, GarageSnapshot, GarageSyncAck, GarageSyncDraft, GarageSyncVehicle } from './syncTypes';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const photo = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/;
const vehicleKeys = ['id', 'catalogId', 'category', 'brand', 'model', 'variant', 'year', 'engineCc', 'motorPowerKw', 'powertrain', 'nickname', 'color', 'photoPath'];
function invalid(code = 'GARAGE_INVALID'): never { throw new Error(code); }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: readonly string[]) => Object.keys(v).length === expected.length && expected.every(key => Object.hasOwn(v, key));
const text = (v: unknown, max: number, nullable = false) => v === null ? nullable : typeof v === 'string' && [...v].length >= 1 && [...v].length <= max && v.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(v);
const number = (v: unknown, max: number) => v === null || typeof v === 'number' && Number.isFinite(v) && v >= 0.01 && v <= max;
const revision = (v: unknown, low = 0, high = 2147483647): v is number => Number.isInteger(v) && Number(v) >= low && Number(v) <= high;
const timestamp = (v: unknown): v is string => typeof v === 'string' && v.length <= 50 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
  return value;
}
// PostgreSQL JSONB text includes a space after separators. Size includes those
// bytes; JSON object order cannot change this bound or a replay's identity.
function databaseJSON(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(databaseJSON).join(', ') + ']';
  if (object(value)) return '{' + Object.entries(value).map(([key, item]) => JSON.stringify(key) + ': ' + databaseJSON(item)).join(', ') + '}';
  return JSON.stringify(value);
}

/** Validates and detaches a frozen document before any network request. */
export function validateGarageDocument(value: unknown, ownerId?: string): GarageDocumentV1 {
  if (!object(value) || !keys(value, ['schema_version', 'vehicles', 'selectedVehicleId']) || value.schema_version !== 1 || !Array.isArray(value.vehicles) || !text(value.selectedVehicleId, 100, true)) invalid();
  if (value.vehicles.length > 200) invalid('GARAGE_TOO_LARGE');
  const seen = new Set<string>();
  for (const v of value.vehicles) {
    if (!object(v) || !keys(v, vehicleKeys) || !text(v.id, 100) || !text(v.catalogId, 100, true) || !text(v.brand, 80) || !text(v.model, 100)
      || !text(v.variant, 100, true) || !text(v.year, 30, true) || !text(v.nickname, 80, true)
      || !text(v.color, 7, true) || !text(v.photoPath, 100, true) || typeof v.category !== 'string' || !['scooter', 'bigbike', 'car'].includes(v.category)
      || !(v.powertrain === null || typeof v.powertrain === 'string' && ['petrol', 'diesel', 'hybrid', 'electric'].includes(v.powertrain))
      || !number(v.engineCc, 10000) || !number(v.motorPowerKw, 2000) || v.powertrain === 'electric' && v.engineCc !== null
      || v.color !== null && !/^#[a-fA-F0-9]{6}$/.test(String(v.color)) || v.photoPath !== null && !photo.test(String(v.photoPath)) || seen.has(String(v.id))) invalid();
    if (v.photoPath !== null && ownerId && !String(v.photoPath).startsWith(ownerId.toLowerCase() + '/')) invalid('GARAGE_PHOTO_UNAVAILABLE');
    seen.add(String(v.id));
  }
  if (value.selectedVehicleId !== null && !seen.has(String(value.selectedVehicleId))) invalid();
  if (new TextEncoder().encode(databaseJSON(value)).byteLength > 524288) invalid('GARAGE_TOO_LARGE');
  const vehicles = (value.vehicles as GarageSyncVehicle[]).map(v => ({ ...v }));
  return freeze({ schema_version: 1, vehicles, selectedVehicleId: value.selectedVehicleId as string | null });
}
export function validateGarageSnapshot(value: unknown, ownerId?: string): GarageSnapshot {
  if (!object(value) || !keys(value, ['revision', 'document', 'updated_at']) || !revision(value.revision)) invalid('GARAGE_SYNC_INVALID_RESPONSE');
  let document: GarageDocumentV1;
  try { document = validateGarageDocument(value.document, ownerId); } catch { return invalid('GARAGE_SYNC_INVALID_RESPONSE'); }
  if (value.revision === 0 ? value.updated_at !== null || document.vehicles.length !== 0 || document.selectedVehicleId !== null : !timestamp(value.updated_at)) invalid('GARAGE_SYNC_INVALID_RESPONSE');
  return freeze({ revision: value.revision, document, updated_at: value.updated_at as string | null });
}
export function validateGarageSyncStatus(value: unknown, operationId: string): GarageSyncAck | null {
  if (typeof operationId !== 'string' || !uuid.test(operationId)) invalid();
  if (value === null) return null;
  if (!object(value) || !keys(value, ['operation_id', 'applied_revision', 'current_revision', 'document_sha256', 'synced_at'])
    || value.operation_id !== operationId || !revision(value.applied_revision, 1) || !revision(value.current_revision, value.applied_revision)
    || typeof value.document_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.document_sha256) || !timestamp(value.synced_at)) invalid('GARAGE_SYNC_INVALID_RESPONSE');
  return freeze({ ...value }) as GarageSyncAck;
}
export function validateGarageSyncAck(value: unknown, draft: GarageSyncDraft): GarageSyncAck {
  const ack = validateGarageSyncStatus(value, draft.operationId);
  if (!ack || ack.applied_revision !== draft.expectedRevision + 1) invalid('GARAGE_SYNC_INVALID_RESPONSE');
  return ack;
}
export function freezeGarageDraft(value: GarageSyncDraft, ownerId?: string): GarageSyncDraft {
  if (!object(value) || !keys(value, ['operationId', 'expectedRevision', 'document']) || typeof value.operationId !== 'string' || !uuid.test(value.operationId) || !revision(value.expectedRevision, 0, 2147483646)) invalid();
  return freeze({ operationId: value.operationId, expectedRevision: value.expectedRevision, document: validateGarageDocument(value.document, ownerId) });
}
export async function sendGarageDocument(value: GarageSyncDraft, api: { send: (draft: GarageSyncDraft) => Promise<unknown>; status: (operationId: string) => Promise<unknown> }, current: () => void, ownerId?: string): Promise<GarageSyncAck> {
  current(); const draft = freezeGarageDraft(value, ownerId);
  let response: unknown;
  try { response = await api.send(draft); current(); }
  catch (error) {
    current();
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('GARAGE_') && message !== 'GARAGE_SYNC_UNAVAILABLE' || message === 'ACCOUNT_CHANGED' || message === 'ACCOUNT_DELETION_PENDING') throw error;
    const status = await api.status(draft.operationId); current();
    if (status === null) throw error;
    return validateGarageSyncAck(status, draft);
  }
  return validateGarageSyncAck(response, draft);
}
