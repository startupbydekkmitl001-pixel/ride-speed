import { authenticate, failure, HttpError, preflight, response } from '../_shared/http.ts';
import { readGaragePhotoRequest, GarageRequestError } from '../_shared/garage-requests.ts';

Deno.serve(async req => {
  try {
    const options = preflight(req); if (options) return options;
    const { userId, userClient, admin } = await authenticate(req);
    const { vehicleId } = await readGaragePhotoRequest(req);
    // Caller-scoped RPC requires this path in the current own saved garage and
    // a committed upload for the same local vehicle. Requests never contain paths.
    const { data: photo, error } = await userClient.rpc('rs_vehicle_photo_for_view', { p_vehicle_id: vehicleId });
    if (error) throw new HttpError(503, 'GARAGE_PHOTO_LOOKUP_FAILED');
    if (!photo || typeof photo.upload_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(photo.upload_id)
      || typeof photo.path !== 'string' || !['jpg', 'png', 'webp'].some(ext => photo.path === `${userId}/${photo.upload_id}.${ext}`)) throw new HttpError(404, 'GARAGE_PHOTO_UNAVAILABLE');
    const { data, error: signedError } = await admin.storage.from('vehicle-photos').createSignedUrl(photo.path, 60);
    if (signedError || !data?.signedUrl) throw new HttpError(503, 'GARAGE_PHOTO_UNAVAILABLE');
    // Obsolete and expired paths can never be recommitted. Cleanup is bounded
    // and optional; deletion always drains all owned binaries before Auth removal.
    try {
      const { data: old, error: cleanupError } = await admin.rpc('rs_vehicle_photo_cleanup_objects', { p_owner: userId });
      if (!cleanupError && Array.isArray(old) && old.length) await admin.storage.from('vehicle-photos').remove(old.map(item => item.path));
    } catch { /* An unavailable cleanup is retried by a later self-photo request. */ }
    return response(req, { url: data.signedUrl, expiresIn: 60, uploadId: photo.upload_id });
  } catch (error) { return failure(req, error instanceof GarageRequestError ? new HttpError(error.status, error.code) : error); }
});
