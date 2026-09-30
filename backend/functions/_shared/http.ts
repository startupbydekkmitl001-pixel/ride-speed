import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function key(kind: 'PUBLISHABLE' | 'SECRET'): string {
  const single = Deno.env.get(`SUPABASE_${kind}_KEY`);
  if (single) return single;
  const named = Deno.env.get(`SUPABASE_${kind}_KEYS`);
  if (named) {
    const values = JSON.parse(named);
    if (typeof values.default === 'string') return values.default;
    const first = Object.values(values).find(v => typeof v === 'string');
    if (first) return first as string;
  }
  const legacy = Deno.env.get(kind === 'SECRET' ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY');
  if (!legacy) throw new HttpError(503, 'SERVER_CONFIGURATION');
  return legacy;
}

export function response(req: Request, body: unknown, status = 200): Response {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'Vary': 'Origin' };
  const origin = req.headers.get('origin');
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  return Response.json(body, { status, headers });
}

export function preflight(req: Request): Response | null {
  const origin = req.headers.get('origin');
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED');
  if (req.method === 'OPTIONS') return response(req, { ok: true });
  if (req.method !== 'POST') throw new HttpError(405, 'POST_REQUIRED');
  return null;
}

export async function authenticate(req: Request) {
  const bearer = req.headers.get('authorization');
  if (!bearer?.match(/^Bearer [^\s]+$/i)) throw new HttpError(401, 'AUTH_REQUIRED');
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new HttpError(503, 'SERVER_CONFIGURATION');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const userClient = createClient(url, key('PUBLISHABLE'), { ...options, global: { headers: { Authorization: bearer } } });
  // getUser validates the token with Auth; never trust a decoded token or getSession alone.
  const { data, error } = await userClient.auth.getUser(bearer.slice(7));
  if (error || !data.user) throw new HttpError(401, 'AUTH_REQUIRED');
  return { userId: data.user.id, userClient, admin: createClient(url, key('SECRET'), options) };
}

export async function readId(req: Request, field: string): Promise<string> {
  // Stream with a hard bound rather than trusting Content-Length.
  if (!req.body) throw new HttpError(400, 'INVALID_REQUEST');
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) { await reader.cancel(); throw new HttpError(413, 'REQUEST_TOO_LARGE'); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); } catch { throw new HttpError(400, 'INVALID_REQUEST'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 ||
    typeof body[field] !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body[field])) throw new HttpError(400, 'INVALID_REQUEST');
  return body[field].toLowerCase();
}

export function failure(req: Request, error: unknown): Response {
  return error instanceof HttpError ? response(req, { error: error.code }, error.status)
    : response(req, { error: 'SERVICE_UNAVAILABLE' }, 503);
}
