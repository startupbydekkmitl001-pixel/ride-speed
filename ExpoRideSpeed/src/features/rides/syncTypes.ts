/** V1 cloud summaries are private, self-reported metadata; never native proof. */
export type StartVehicleSnapshot = Readonly<{
  local_id: string | null; catalog_id: string | null;
  category: 'scooter' | 'motorcycle' | 'car'; brand: string; model: string;
  variant: string | null; year: string | null;
  powertrain: 'petrol' | 'diesel' | 'hybrid' | 'electric' | 'unknown';
  engine_cc: number | null; motor_kw: number | null;
}>;
export type SummaryFragment = Readonly<{
  segment_id: string; capture_id: string; part_index: number;
  polyline: string; point_count: number;
}>;
export type RideSummaryV1 = Readonly<{
  schema_version: 1; started_at: string; ended_at: string;
  active_duration_ms: number; elapsed_duration_ms: number | null; clock_anomaly: boolean;
  distance_m: number | null; max_speed_mps: number | null; average_speed_mps: number | null;
  reported_provider: 'corelocation' | 'expo_ios' | 'expo_android' | 'web' | 'mixed';
  capture_count: number; accepted_fix_count: number; rejected_fix_count: number;
  geometry_status: 'complete' | 'simplified' | 'unavailable'; vehicle: StartVehicleSnapshot | null;
  geometry: Readonly<{ encoding: 'polyline5'; fragments: readonly SummaryFragment[] }>;
}>;
export type RideSyncDraft = Readonly<{
  operationId: string; rideId: string; expectedRevision: number; payload: RideSummaryV1;
}>;
export type RideSyncAck = Readonly<{
  operation_id: string; ride_id: string; applied_revision: number; current_revision: number;
  payload_sha256: string; speed_status: 'self_reported'; visibility: 'private'; synced_at: string;
}>;
export type RideSyncTransport = {
  send: (draft: RideSyncDraft) => Promise<unknown>;
  status: (operationId: string) => Promise<unknown>;
};
export type RideHistoryCursor = Readonly<{ ended_at: string; ride_id: string }>;
export type RideHistoryItem = Readonly<{
  ride_id: string; revision: number; payload: RideSummaryV1;
  category: StartVehicleSnapshot['category'] | null; class_key: string; class_scheme_version: 1;
  metadata_authority: 'self_reported'; speed_status: 'self_reported'; visibility: 'private';
  created_at: string; updated_at: string;
}>;
export type RideHistoryPage = Readonly<{ items: readonly RideHistoryItem[]; next_cursor: RideHistoryCursor | null }>;
