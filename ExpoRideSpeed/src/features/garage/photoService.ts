import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { accountClient, isAccountCurrent, type AuthScope } from '../../state/AuthState';
import { publicService } from '../../lib/publicService';
import { GARAGE_PHOTO_MAX_BYTES, PhotoDraftStore, photoOwner, photoUploadId } from './photoDraftStore';
import { ScopedVehiclePhotoCache, validateVehiclePhotoUrl, type VehiclePhotoReservation, type VehiclePhotoTransport } from './photoPipeline';

export const garagePhotoDrafts = new PhotoDraftStore(AsyncStorage);
export const vehiclePhotoCache = new ScopedVehiclePhotoCache();
export function ensurePhotoAccount(scope: AuthScope, session: Session): void {
  if (!scope.userId || session.user.id !== scope.userId || !isAccountCurrent(scope)) throw new Error('ACCOUNT_CHANGED');
  if (garagePhotoDrafts.isClosed(scope.userId)) throw new Error('ACCOUNT_DELETION_PENDING');
}
function pathUploadId(ownerId: string, path: string): string {
  const parts = path.split('/');
  const match = parts[1]?.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/);
  if (parts.length !== 2 || parts[0] !== photoOwner(ownerId) || !match) throw new Error('GARAGE_PHOTO_UNAVAILABLE');
  return photoUploadId(match[1]);
}
const safeError = (message: string) => new Error(['ACCOUNT_DELETION_PENDING', 'GARAGE_PHOTO_EXPIRED', 'GARAGE_PHOTO_INVALID', 'GARAGE_PHOTO_UNAVAILABLE'].find(code => message.includes(code)) ?? 'GARAGE_PHOTO_UNAVAILABLE');

/** All requests retain the initiating owner's SDK client/JWT; Storage upsert is never permitted. */
export function vehiclePhotoTransport(scope: AuthScope, session: Session): VehiclePhotoTransport {
  ensurePhotoAccount(scope, session);
  const client = accountClient(scope, session);
  const ensurePath = (path: string) => { ensurePhotoAccount(scope, session); pathUploadId(scope.userId!, path); };
  return {
    reserve: async draft => {
      ensurePhotoAccount(scope, session);
      if (draft.ownerId !== scope.userId) throw new Error('GARAGE_PHOTO_INVALID');
      const { data, error } = await client.rpc('rs_reserve_vehicle_photo', { p_id: draft.id, p_vehicle_id: draft.vehicleId, p_mime: draft.mime });
      ensurePhotoAccount(scope, session);
      if (error) throw safeError(error.message);
      return data as VehiclePhotoReservation;
    },
    exists: async path => {
      ensurePath(path);
      const { data, error } = await client.storage.from('vehicle-photos').info(path);
      ensurePhotoAccount(scope, session);
      if (error) {
        if ('statusCode' in error && ['404', '400'].includes(String(error.statusCode)) && /not found|does not exist/i.test(error.message)) return false;
        throw safeError(error.message);
      }
      return !!data;
    },
    upload: async (path, bytes, mime) => {
      ensurePath(path);
      if (!bytes.byteLength || bytes.byteLength > GARAGE_PHOTO_MAX_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('GARAGE_PHOTO_INVALID');
      const { error } = await client.storage.from('vehicle-photos').upload(path, bytes, { contentType: mime, upsert: false });
      ensurePhotoAccount(scope, session);
      if (error) throw safeError(error.message);
    },
  };
}

/** The signer receives only vehicleId. Caller expectations validate the saved immutable path and upload ID. */
export async function getPrivateVehiclePhoto(scope: AuthScope, session: Session, vehicleId: string, photoPath: string): Promise<string | null> {
  ensurePhotoAccount(scope, session);
  if (!vehicleId.trim() || vehicleId.length > 100) throw new Error('GARAGE_PHOTO_UNAVAILABLE');
  const uploadId = pathUploadId(scope.userId!, photoPath);
  const cached = vehiclePhotoCache.get(scope, vehicleId, photoPath);
  if (cached) return cached;
  const { data, error } = await accountClient(scope, session).functions.invoke('vehicle-photo-url', { body: { vehicleId } });
  ensurePhotoAccount(scope, session);
  if (error) throw new Error('GARAGE_PHOTO_UNAVAILABLE');
  if (data?.uploadId !== uploadId || data?.url === null) return null;
  if (typeof data?.url !== 'string' || data.expiresIn !== 60) throw new Error('GARAGE_PHOTO_UNAVAILABLE');
  validateVehiclePhotoUrl(data.url, process.env.EXPO_PUBLIC_SUPABASE_URL ?? publicService.url, scope.userId!, uploadId, photoPath);
  vehiclePhotoCache.put(scope, vehicleId, photoPath, data.url, data.expiresIn);
  return data.url;
}
