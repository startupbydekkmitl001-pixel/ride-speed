export class GarageRequestError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
/** Only a local vehicle identity is accepted; owners, paths and URLs are server-derived. */
export async function readGaragePhotoRequest(req: Request): Promise<{ vehicleId: string }> {
  if (!req.body) throw new GarageRequestError(400, 'INVALID_REQUEST');
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) { await reader.cancel(); throw new GarageRequestError(413, 'REQUEST_TOO_LARGE'); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); }
  catch { throw new GarageRequestError(400, 'INVALID_REQUEST'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'vehicleId')
    || typeof body.vehicleId !== 'string' || [...body.vehicleId].length < 1 || [...body.vehicleId].length > 100 || !body.vehicleId.trim() || /[\u0000-\u001f\u007f]/.test(body.vehicleId)) throw new GarageRequestError(400, 'INVALID_REQUEST');
  return { vehicleId: body.vehicleId };
}
