/** Entire owner garage snapshot. These specs are self-reported, never ride proof. */
export type GarageSyncVehicle = {
  id: string;
  catalogId: string | null;
  category: 'scooter' | 'bigbike' | 'car';
  brand: string;
  model: string;
  variant: string | null;
  year: string | null;
  engineCc: number | null;
  motorPowerKw: number | null;
  powertrain: 'petrol' | 'diesel' | 'hybrid' | 'electric' | null;
  nickname: string | null;
  color: string | null;
  photoPath: string | null;
};
export type GarageDocumentV1 = {
  schema_version: 1;
  vehicles: readonly GarageSyncVehicle[];
  selectedVehicleId: string | null;
};
export type GarageSyncDraft = {
  operationId: string;
  expectedRevision: number;
  document: GarageDocumentV1;
};
export type GarageSnapshot = {
  revision: number;
  document: GarageDocumentV1;
  updated_at: string | null;
};
export type GarageSyncAck = {
  operation_id: string;
  applied_revision: number;
  current_revision: number;
  document_sha256: string;
  synced_at: string;
};
