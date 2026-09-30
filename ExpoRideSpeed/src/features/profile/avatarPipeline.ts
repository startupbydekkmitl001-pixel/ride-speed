export type AvatarState = { revision: number; avatar_id: string | null };
export type AvatarUpload = {
  id: string;
  owner: string;
  mime: string;
  bytes: ArrayBuffer;
  expectedRevision: number | null;
};
export type AvatarReservation = {
  upload_id: string;
  bucket: string;
  path: string;
  expires_at: string;
};
export type AvatarTransport = {
  current: () => Promise<AvatarState>;
  reserve: (value: AvatarUpload) => Promise<AvatarReservation>;
  exists: (path: string) => Promise<boolean>;
  upload: (path: string, bytes: ArrayBuffer, mime: string) => Promise<void>;
  commit: (id: string, revision: number) => Promise<AvatarState>;
};

/** Immutable, retryable publication. A local photo is never evidence of cloud sync. */
export async function syncAvatarUpload(
  value: AvatarUpload,
  api: AvatarTransport,
  ensureCurrent: () => void,
): Promise<AvatarState> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) ||
    !["image/jpeg", "image/png", "image/webp"].includes(value.mime) ||
    value.bytes.byteLength < 1 || value.bytes.byteLength > 1_048_576
  ) throw new Error("AVATAR_INVALID_OBJECT");
  const step = async <T,>(request: () => Promise<T>): Promise<T> => {
    ensureCurrent();
    const result = await request();
    ensureCurrent();
    return result;
  };
  const current = await step(api.current);
  if (current.avatar_id === value.id) return current;
  const revision = value.expectedRevision ?? current.revision;
  if (revision !== current.revision) throw new Error("AVATAR_REVISION_CONFLICT");
  const reservation = await step(() => api.reserve(value));
  const extension = value.mime === "image/jpeg" ? "jpg" : value.mime === "image/png" ? "png" : "webp";
  if (
    reservation.upload_id !== value.id || reservation.bucket !== "ride-avatars" ||
    reservation.path !== `${value.owner}/${value.id}.${extension}` ||
    !(Date.parse(reservation.expires_at) > Date.now())
  ) throw new Error("AVATAR_INVALID_OBJECT");
  if (!(await step(() => api.exists(reservation.path)))) {
    try {
      await step(() => api.upload(reservation.path, value.bytes, value.mime));
    } catch (error) {
      // An immutable upload may succeed even when its response is lost.
      if (!(await step(() => api.exists(reservation.path)))) throw error;
    }
  }
  try {
    return await step(() => api.commit(value.id, revision));
  } catch (error) {
    // A lost commit response resolves by identity, never by another upload.
    const latest = await step(api.current);
    if (latest.avatar_id === value.id) return latest;
    throw error;
  }
}

export function validateSignedAvatarUrl(value: string, projectUrl: string, owner: string, avatarId: string): string {
  try {
    const url = new URL(value), project = new URL(projectUrl);
    const paths = ["jpg", "png", "webp"].map(extension => `/storage/v1/object/sign/ride-avatars/${owner}/${avatarId}.${extension}`);
    if (url.protocol !== "https:" || url.origin !== project.origin || url.username || url.password || url.hash || !paths.includes(url.pathname) || !url.searchParams.get("token")) throw new Error("AVATAR_UNAVAILABLE");
    return value;
  } catch { throw new Error("AVATAR_UNAVAILABLE"); }
}

/** Signed URL cache is in-memory and keyed by AuthScope object, including ABA generation. */
export class ScopedAvatarCache {
  private readonly entries = new WeakMap<object, { id: string; url: string; expires: number }>();
  private readonly now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  get(scope: object, id: string): string | null {
    const entry = this.entries.get(scope);
    return entry?.id === id && entry.expires > this.now() ? entry.url : null;
  }
  put(scope: object, id: string, url: string, expiresIn: number): void {
    const lifetime = Math.max(0, Math.min(60, expiresIn) * 1000 - 5000);
    this.entries.set(scope, { id, url, expires: this.now() + lifetime });
  }
  clear(scope: object): void { this.entries.delete(scope); }
}
