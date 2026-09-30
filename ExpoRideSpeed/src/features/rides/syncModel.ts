import { encodePolyline, type Coordinate, type JournalRide } from './journalModel';
import type { RideHistoryPage, RideSummaryV1, RideSyncAck, RideSyncDraft, RideSyncTransport, StartVehicleSnapshot, SummaryFragment } from './syncTypes';

export const RIDE_SUMMARY_LIMITS = Object.freeze({ fragments: 128, points: 4096, encodedBytes: 65536, jsonBytes: 131072, durationMs: 604800000, distanceM: 10000000, speedMps: 500 / 3.6, count: 10000000 });
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const invalid = () => new Error('RIDE_SUMMARY_INVALID');
const number = (value: number, high: number, whole = false) => Number.isFinite(value) && value >= 0 && value <= high && (!whole || Number.isInteger(value));
const text = (value: string, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const optionalText = (value: string | null | undefined) => value?.trim() || null;
const utf8Bytes = (value: string) => {
  let size = 0;
  for (const character of value) { const code = character.codePointAt(0)!; size += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
  return size;
};
const utc = (value: number) => {
  if (!Number.isFinite(value) || value < 0 || value > Date.parse('2100-12-31T23:59:59Z')) throw invalid();
  return new Date(value).toISOString();
};
const keys = (value: unknown, required: readonly string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === required.length && required.every(key => Object.hasOwn(value, key));
const summaryKeys = ['schema_version', 'started_at', 'ended_at', 'active_duration_ms', 'elapsed_duration_ms', 'clock_anomaly', 'distance_m', 'max_speed_mps', 'average_speed_mps', 'reported_provider', 'capture_count', 'accepted_fix_count', 'rejected_fix_count', 'geometry_status', 'vehicle', 'geometry'];

/** Reject unexpected/evidence fields before any network egress. SQL validates their semantics. */
export function assertRideSummaryPayload(value: unknown): asserts value is RideSummaryV1 {
  if (!keys(value, summaryKeys) || value.schema_version !== 1 || typeof value.started_at !== 'string' || typeof value.ended_at !== 'string'
    || typeof value.clock_anomaly !== 'boolean' || !['corelocation', 'expo_ios', 'expo_android', 'web', 'mixed'].includes(value.reported_provider as string)
    || !['complete', 'simplified', 'unavailable'].includes(value.geometry_status as string)) throw invalid();
  for (const key of ['active_duration_ms', 'capture_count', 'accepted_fix_count', 'rejected_fix_count']) if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw invalid();
  for (const key of ['elapsed_duration_ms', 'distance_m', 'max_speed_mps', 'average_speed_mps']) if (value[key] !== null && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) throw invalid();
  const vehicle = value.vehicle;
  if (vehicle !== null) {
    if (!keys(vehicle, ['local_id', 'catalog_id', 'category', 'brand', 'model', 'variant', 'year', 'powertrain', 'engine_cc', 'motor_kw'])) throw invalid();
    for (const key of ['brand', 'model', 'category', 'powertrain']) if (typeof vehicle[key] !== 'string') throw invalid();
    for (const key of ['local_id', 'catalog_id', 'variant', 'year']) if (vehicle[key] !== null && typeof vehicle[key] !== 'string') throw invalid();
    for (const key of ['engine_cc', 'motor_kw']) if (vehicle[key] !== null && (typeof vehicle[key] !== 'number' || !Number.isFinite(vehicle[key]))) throw invalid();
  }
  const geometry = value.geometry;
  if (!keys(geometry, ['encoding', 'fragments']) || geometry.encoding !== 'polyline5' || !Array.isArray(geometry.fragments)) throw invalid();
  if (geometry.fragments.length > RIDE_SUMMARY_LIMITS.fragments) throw new Error('RIDE_SUMMARY_TOO_LARGE');
  let bytes = 0, points = 0;
  for (const part of geometry.fragments) {
    if (!keys(part, ['segment_id', 'capture_id', 'part_index', 'polyline', 'point_count']) || !uuid(part.segment_id) || !uuid(part.capture_id)
      || typeof part.polyline !== 'string' || !/^[?-~]+$/.test(part.polyline) || typeof part.part_index !== 'number' || !number(part.part_index, 127, true)
      || typeof part.point_count !== 'number' || !number(part.point_count, RIDE_SUMMARY_LIMITS.points, true) || part.point_count < 1) throw invalid();
    bytes += part.polyline.length; points += part.point_count;
  }
  if (points > RIDE_SUMMARY_LIMITS.points || bytes > RIDE_SUMMARY_LIMITS.encodedBytes || utf8Bytes(JSON.stringify(value)) > RIDE_SUMMARY_LIMITS.jsonBytes) throw new Error('RIDE_SUMMARY_TOO_LARGE');
}

function snapshot(ride: JournalRide): StartVehicleSnapshot | null {
  const v = ride.vehicle;
  if (!v) return null;
  if (!text(v.brand, 80) || !text(v.model, 100) || !['scooter', 'bigbike', 'car'].includes(v.category)
    || (v.powertrain != null && !['petrol', 'diesel', 'hybrid', 'electric'].includes(v.powertrain))
    || (v.engineCc !== null && (!number(v.engineCc, 10000) || v.engineCc < 0.01))
    || (v.powertrain === 'electric' && v.engineCc !== null)
    || (v.motorPowerKw != null && (!number(v.motorPowerKw,2000) || v.motorPowerKw < 0.01))) throw invalid();
  const optional = [[v.id, 100], [v.catalogId, 100], [v.variant, 100], [v.year, 30]] as const;
  for (const [value, max] of optional) if (value != null && typeof value !== 'string' || typeof value === 'string' && value.trim().length > max) throw invalid();
  return Object.freeze({ local_id: optionalText(v.id), catalog_id: optionalText(v.catalogId), category: v.category === 'bigbike' ? 'motorcycle' : v.category,
    brand: v.brand.trim(), model: v.model.trim(), variant: optionalText(v.variant), year: optionalText(v.year),
    powertrain: v.powertrain ?? 'unknown', engine_cc: v.engineCc, motor_kw: v.motorPowerKw ?? null });
}

/** Assign a bounded point budget proportionally, retaining both endpoints of each part. */
function allocateParts(parts: readonly { points: Coordinate[] }[]): number[] {
  const sizes = parts.map(part => part.points.length), total = sizes.reduce((n, size) => n + size, 0);
  if (total <= RIDE_SUMMARY_LIMITS.points) return sizes;
  const budgets = sizes.map(size => Math.min(2, size));
  const extra = RIDE_SUMMARY_LIMITS.points - budgets.reduce((n, size) => n + size, 0);
  const remaining = sizes.map((size, i) => size - budgets[i]), allRemaining = remaining.reduce((n, size) => n + size, 0);
  const fractions = remaining.map((size, i) => { const exact = extra * size / allRemaining, whole = Math.floor(exact); budgets[i] += whole; return { i, fraction: exact - whole }; });
  const left = RIDE_SUMMARY_LIMITS.points - budgets.reduce((n, size) => n + size, 0);
  fractions.sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let i = 0; i < left; i++) budgets[fractions[i].i]++;
  return budgets;
}

/** Call once after durable finalization, then persist this immutable payload for retries. */
export function toRideSummary(ride: JournalRide, platform: 'ios' | 'android' | 'web'): RideSummaryV1 {
  if (ride.status !== 'complete' || ride.endedAtMs === null || typeof ride.clockAnomaly !== 'boolean' || !['ios', 'android', 'web'].includes(platform)
    || !number(ride.activeDurationMs, RIDE_SUMMARY_LIMITS.durationMs) || !number(ride.distanceMeters, RIDE_SUMMARY_LIMITS.distanceM)
    || (ride.maxMps !== null && !number(ride.maxMps, RIDE_SUMMARY_LIMITS.speedMps))
    || !number(ride.acceptedCount, RIDE_SUMMARY_LIMITS.count, true) || !number(ride.rejectedCount, RIDE_SUMMARY_LIMITS.count, true)
    || !number(ride.captures.length, RIDE_SUMMARY_LIMITS.count, true) || ride.captures.length === 0) throw invalid();
  if (ride.fragments.length > RIDE_SUMMARY_LIMITS.fragments) throw new Error('RIDE_SUMMARY_TOO_LARGE');
  const captures = new Map<string, string>(), segments = new Set<string>(), providers = new Set<RideSummaryV1['reported_provider']>();
  for (const capture of ride.captures) {
    if (!uuid(capture.id) || !uuid(capture.segmentId) || captures.has(capture.id.toLowerCase()) || segments.has(capture.segmentId.toLowerCase()) || !['ios_core_location', 'expo_location'].includes(capture.provider)) throw invalid();
    captures.set(capture.id.toLowerCase(), capture.segmentId.toLowerCase());
    segments.add(capture.segmentId.toLowerCase());
    providers.add(capture.provider === 'ios_core_location' ? 'corelocation' : platform === 'ios' ? 'expo_ios' : platform === 'android' ? 'expo_android' : 'web');
  }
  const identities = new Set<string>(); let pointCount = 0;
  for (const fragment of ride.fragments) {
    if (!uuid(fragment.segmentId) || !uuid(fragment.captureId)) throw invalid();
    const key = `${fragment.segmentId.toLowerCase()}:${fragment.partIndex}`;
    if (captures.get(fragment.captureId.toLowerCase()) !== fragment.segmentId.toLowerCase()
      || !number(fragment.partIndex, 127, true) || identities.has(key) || fragment.points.length === 0) throw invalid();
    identities.add(key); pointCount += fragment.points.length;
    for (const point of fragment.points) if (!Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180) throw invalid();
  }
  if (pointCount > ride.acceptedCount) throw invalid();
  const budget = allocateParts(ride.fragments);
  const fragments: readonly SummaryFragment[] = Object.freeze(ride.fragments.map((part, i) => {
    const size = budget[i], points = size === part.points.length ? part.points : Array.from({ length: size }, (_, j) => part.points[Math.round(j * (part.points.length - 1) / (size - 1))]);
    return Object.freeze({ segment_id: part.segmentId.toLowerCase(), capture_id: part.captureId.toLowerCase(), part_index: part.partIndex, polyline: encodePolyline(points), point_count: size });
  }));
  if (fragments.reduce((n, part) => n + part.polyline.length, 0) > RIDE_SUMMARY_LIMITS.encodedBytes) throw new Error('RIDE_SUMMARY_TOO_LARGE');
  const active = Math.round(ride.activeDurationMs), elapsed = Math.round(ride.endedAtMs - ride.startedAtMs);
  const clockAnomaly = ride.clockAnomaly || elapsed < 0 || active > elapsed + 1000;
  if (!clockAnomaly && elapsed > RIDE_SUMMARY_LIMITS.durationMs) throw invalid();
  const distance = ride.acceptedCount >= 2 && ride.fragments.some(part => part.points.length >= 2) ? ride.distanceMeters : null;
  const average = distance !== null && active > 0 ? distance / (active / 1000) : null;
  if (average !== null && !number(average, RIDE_SUMMARY_LIMITS.speedMps)) throw invalid();
  const payload: RideSummaryV1 = Object.freeze({ schema_version: 1, started_at: utc(ride.startedAtMs), ended_at: utc(ride.endedAtMs),
    active_duration_ms: active, elapsed_duration_ms: clockAnomaly ? null : elapsed, clock_anomaly: clockAnomaly,
    distance_m: distance, max_speed_mps: ride.acceptedCount > 0 ? ride.maxMps : null, average_speed_mps: average,
    reported_provider: providers.size === 1 ? [...providers][0] : 'mixed', capture_count: ride.captures.length,
    accepted_fix_count: ride.acceptedCount, rejected_fix_count: ride.rejectedCount,
    geometry_status: fragments.length === 0 ? 'unavailable' : pointCount > RIDE_SUMMARY_LIMITS.points ? 'simplified' : 'complete',
    vehicle: snapshot(ride), geometry: Object.freeze({ encoding: 'polyline5', fragments }) });
  if (utf8Bytes(JSON.stringify(payload)) > RIDE_SUMMARY_LIMITS.jsonBytes) throw new Error('RIDE_SUMMARY_TOO_LARGE');
  return payload;
}

export function validateRideSyncAck(value: unknown, draft: Pick<RideSyncDraft, 'operationId' | 'rideId' | 'expectedRevision'>): RideSyncAck {
  const a = value as Partial<RideSyncAck> | null;
  if (!a || typeof a !== 'object' || typeof a.operation_id !== 'string' || typeof a.ride_id !== 'string' || a.operation_id.toLowerCase() !== draft.operationId.toLowerCase() || a.ride_id.toLowerCase() !== draft.rideId.toLowerCase()
    || a.applied_revision !== draft.expectedRevision + 1 || typeof a.current_revision !== 'number' || !number(a.current_revision, 2147483647, true) || a.current_revision < a.applied_revision
    || a.speed_status !== 'self_reported' || a.visibility !== 'private' || typeof a.payload_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(a.payload_sha256)
    || typeof a.synced_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(a.synced_at) || !Number.isFinite(Date.parse(a.synced_at))) throw new Error('RIDE_SYNC_INVALID_RESPONSE');
  return value as RideSyncAck;
}

const definitive = new Set(['ACCOUNT_CHANGED', 'ACCOUNT_DELETION_PENDING', 'RIDE_SUMMARY_INVALID', 'RIDE_SUMMARY_TOO_LARGE', 'RIDE_OPERATION_CONFLICT', 'RIDE_REVISION_CONFLICT', 'RIDE_SNAPSHOT_CONFLICT', 'RIDE_UNAVAILABLE', 'RIDE_SYNC_INVALID_RESPONSE', 'RIDE_SYNC_RATE_LIMITED', 'RIDE_SYNC_AUTH_REQUIRED']);

/** Status recovery is read-only and still bound to the original owner/generation. */
export async function sendRideSummary(draft: RideSyncDraft, api: RideSyncTransport, ensureCurrent: () => void): Promise<RideSyncAck> {
  if (!uuid(draft.operationId) || !uuid(draft.rideId) || !number(draft.expectedRevision, 2147483646, true)) throw invalid();
  assertRideSummaryPayload(draft.payload);
  ensureCurrent();
  try {
    const result = await api.send(draft); ensureCurrent();
    return validateRideSyncAck(result, draft);
  } catch (error) {
    ensureCurrent();
    if (error instanceof Error && definitive.has(error.message)) throw error;
    try {
      const result = await api.status(draft.operationId); ensureCurrent();
      if (result !== null) return validateRideSyncAck(result, draft);
    } catch (statusError) {
      ensureCurrent();
      if (statusError instanceof Error && definitive.has(statusError.message)) throw statusError;
    }
    throw error;
  }
}

export function validateRideSyncStatus(value: unknown, operationId: string): RideSyncAck | null {
  if (!uuid(operationId)) throw invalid();
  if (value === null) return null;
  const raw = value as Partial<RideSyncAck> | null;
  if (!raw || !uuid(raw.ride_id) || !Number.isInteger(raw.applied_revision) || !number(raw.applied_revision!, 2147483647, true) || raw.applied_revision! < 1) throw new Error('RIDE_SYNC_INVALID_RESPONSE');
  return validateRideSyncAck(value, { operationId, rideId: raw.ride_id, expectedRevision: raw.applied_revision! - 1 });
}

export function validateRideHistory(value: unknown, limit: number): RideHistoryPage {
  const raw = value as Partial<RideHistoryPage> | null;
  if (!raw || !Array.isArray(raw.items) || raw.items.length > limit || (raw.next_cursor !== null && typeof raw.next_cursor !== 'object')) throw new Error('RIDE_SYNC_INVALID_RESPONSE');
  const ids = new Set<string>();
  for (const row of raw.items) {
    if (!uuid(row.ride_id) || ids.has(row.ride_id) || !number(row.revision, 2147483647, true) || row.revision < 1 || row.visibility !== 'private' || row.speed_status !== 'self_reported'
      || row.metadata_authority !== 'self_reported' || row.class_scheme_version !== 1 || typeof row.class_key !== 'string'
      || (row.category !== null && !['scooter', 'motorcycle', 'car'].includes(row.category)) || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
      || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw new Error('RIDE_SYNC_INVALID_RESPONSE');
    ids.add(row.ride_id); assertRideSummaryPayload(row.payload);
  }
  if (raw.next_cursor !== null) {
    const last = raw.items.at(-1), cursor = raw.next_cursor;
    if (!cursor || !last || raw.items.length !== limit || cursor.ride_id !== last.ride_id || cursor.ended_at !== last.payload.ended_at) throw new Error('RIDE_SYNC_INVALID_RESPONSE');
  }
  return value as RideHistoryPage;
}
