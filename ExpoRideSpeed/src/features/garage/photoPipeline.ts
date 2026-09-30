import { parsePhotoDraft, photoBytes, photoOwner, photoUploadId, type VehiclePhotoDraft } from './photoDraftStore';
export type VehiclePhotoReservation = { upload_id: string; vehicle_id: string; state: 'reserved' | 'committed'; bucket: string; path: string; expires_at: string };
export type VehiclePhotoTransport = { reserve(draft: VehiclePhotoDraft): Promise<VehiclePhotoReservation>; exists(path: string): Promise<boolean>; upload(path: string, bytes: ArrayBuffer, mime: VehiclePhotoDraft['mime']): Promise<void> };
export type PreparedVehiclePhoto = Readonly<{ uploadId: string; vehicleId: string; path: string }>;
export function expectedVehiclePhotoPath(ownerId: string, id: string, mime: VehiclePhotoDraft['mime']): string {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('GARAGE_PHOTO_INVALID');
  return `${photoOwner(ownerId)}/${photoUploadId(id)}.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'}`;
}

/** Upload readiness is not publication. The whole-garage ACK commits the path and permits draft cleanup. */
export async function prepareVehiclePhoto(value: VehiclePhotoDraft, api: VehiclePhotoTransport, ensureCurrent: () => void): Promise<PreparedVehiclePhoto> {
  const draft = parsePhotoDraft(value, value.ownerId);
  if (draft.ownerId === 'guest') throw new Error('GARAGE_PHOTO_AUTH_REQUIRED');
  const step = async <T,>(request: () => Promise<T>): Promise<T> => { ensureCurrent(); const result = await request(); ensureCurrent(); return result; };
  const reservation = await step(() => api.reserve(draft));
  const path = expectedVehiclePhotoPath(draft.ownerId, draft.id, draft.mime);
  if (!reservation || reservation.upload_id !== draft.id || reservation.vehicle_id !== draft.vehicleId || reservation.bucket !== 'vehicle-photos'
    || reservation.path !== path || !['reserved', 'committed'].includes(reservation.state) || !Number.isFinite(Date.parse(reservation.expires_at))) throw new Error('GARAGE_PHOTO_INVALID');
  if (reservation.state === 'reserved' && Date.parse(reservation.expires_at) <= Date.now()) throw new Error('GARAGE_PHOTO_EXPIRED');
  if (!(await step(() => api.exists(path)))) {
    if (reservation.state === 'committed') throw new Error('GARAGE_PHOTO_UNAVAILABLE');
    try { await step(() => api.upload(path, photoBytes(draft.base64), draft.mime)); }
    catch (error) { if (!(await step(() => api.exists(path)))) throw error; }
  }
  ensureCurrent(); return Object.freeze({ uploadId: draft.id, vehicleId: draft.vehicleId, path });
}

export function validateVehiclePhotoUrl(value: string, projectUrl: string, ownerId: string, uploadId: string, path: string): string {
  try {
    const owner = photoOwner(ownerId), id = photoUploadId(uploadId), url = new URL(value), project = new URL(projectUrl);
    if (owner === 'guest' || !['jpg', 'png', 'webp'].some(extension => path === `${owner}/${id}.${extension}`)
      || url.protocol !== 'https:' || project.protocol !== 'https:' || url.origin !== project.origin || url.username || url.password || url.hash
      || url.pathname !== `/storage/v1/object/sign/vehicle-photos/${path}` || !url.searchParams.get('token')) throw new Error('GARAGE_PHOTO_UNAVAILABLE');
    return value;
  } catch { throw new Error('GARAGE_PHOTO_UNAVAILABLE'); }
}
/** Scope identity includes ABA generation; a changed path never reuses a prior vehicle URL. */
export class ScopedVehiclePhotoCache {
  private readonly entries = new WeakMap<object, Map<string, { path: string; url: string; expires: number }>>();
  constructor(private readonly now: () => number = Date.now) {}
  get(scope: object, vehicleId: string, path: string): string | null {
    const item = this.entries.get(scope)?.get(vehicleId);
    return item?.path === path && item.expires > this.now() ? item.url : null;
  }
  put(scope: object, vehicleId: string, path: string, url: string, expiresIn: number) {
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) return;
    let items = this.entries.get(scope); if (!items) { items = new Map(); this.entries.set(scope, items); }
    items.set(vehicleId, { path, url, expires: this.now() + Math.max(0, Math.min(60, expiresIn) * 1000 - 5000) });
  }
  clear(scope: object) { this.entries.delete(scope); }
}
