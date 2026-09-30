export const GARAGE_PHOTO_MAX_BYTES = 1_048_576;
export const GARAGE_PHOTO_DRAFT_LIMIT = 8;
export type PhotoMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type VehiclePhotoDraft = Readonly<{ id: string; ownerId: string; vehicleId: string; mime: PhotoMime; base64: string; createdAtMs: number }>;
export type PhotoDraftStorage = { getAllKeys(): Promise<readonly string[]>; getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown>; removeItem(key: string): Promise<unknown> };
type Queue = { tails: Map<string, Promise<void>>; closed: Set<string> };
type StoredPhoto = { key: string; draft: VehiclePhotoDraft; previousUploadId?: string };
const queues = new WeakMap<PhotoDraftStorage, Queue>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = () => new Error('GARAGE_PHOTO_INVALID');
export function photoOwner(ownerId: string): string {
  if (ownerId !== 'guest' && !uuid.test(ownerId)) throw invalid();
  return ownerId.toLowerCase();
}
export function photoUploadId(id: string): string { if (!uuid.test(id)) throw invalid(); return id.toLowerCase(); }
export function photoBytes(base64: string): ArrayBuffer {
  if (typeof base64 !== 'string' || !base64.length || base64.length > 1_398_104 || base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw invalid();
  let decoded: string;
  try { decoded = atob(base64); } catch { throw invalid(); }
  if (!decoded.length || decoded.length > GARAGE_PHOTO_MAX_BYTES) throw invalid();
  return Uint8Array.from(decoded, character => character.charCodeAt(0)).buffer;
}
export function parsePhotoDraft(value: unknown, ownerId: string): VehiclePhotoDraft {
  const raw = value as Partial<VehiclePhotoDraft> | null;
  const owner = photoOwner(ownerId);
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.ownerId !== owner || typeof raw.vehicleId !== 'string'
    || !raw.vehicleId.trim() || raw.vehicleId.length > 100 || !['image/jpeg', 'image/png', 'image/webp'].includes(raw.mime ?? '')
    || typeof raw.createdAtMs !== 'number' || !Number.isSafeInteger(raw.createdAtMs) || raw.createdAtMs < 0 || raw.createdAtMs > Date.parse('2100-12-31T23:59:59Z')) throw invalid();
  const id = photoUploadId(raw.id); photoBytes(raw.base64!);
  return Object.freeze({ id, ownerId: owner, vehicleId: raw.vehicleId, mime: raw.mime!, base64: raw.base64!, createdAtMs: raw.createdAtMs });
}
const prefix = (owner: string) => `ride.garage-photo.v1.${owner}.`;
const key = (owner: string, id: string) => prefix(owner) + photoUploadId(id);
const noGuard = () => {};

/** Images live outside garage/account JSON. All owner generations share a read/write/delete barrier. */
export class PhotoDraftStore {
  private readonly queue: Queue;
  constructor(private readonly storage: PhotoDraftStorage) {
    let queue = queues.get(storage);
    if (!queue) { queue = { tails: new Map(), closed: new Set() }; queues.set(storage, queue); }
    this.queue = queue;
  }
  isClosed(ownerId: string) { return this.queue.closed.has(photoOwner(ownerId)); }
  private ensure(owner: string, guard: () => void) {
    guard(); if (this.queue.closed.has(owner)) throw new Error('ACCOUNT_DELETION_PENDING');
  }
  private run<T>(ownerId: string, guard: () => void, work: (owner: string) => Promise<T>): Promise<T> {
    const owner = photoOwner(ownerId);
    const result = (this.queue.tails.get(owner) ?? Promise.resolve()).then(async () => {
      this.ensure(owner, guard); const value = await work(owner); this.ensure(owner, guard); return value;
    });
    const tail = result.then(() => {}, () => {});
    this.queue.tails.set(owner, tail);
    void tail.then(() => { if (this.queue.tails.get(owner) === tail) this.queue.tails.delete(owner); });
    return result;
  }
  private async keys(owner: string): Promise<string[]> {
    try { return (await this.storage.getAllKeys()).filter(value => value.startsWith(prefix(owner))); }
    catch { throw new Error('LOCAL_READ_FAILED'); }
  }
  private async readKey(owner: string, draftKey: string): Promise<StoredPhoto | null> {
    try {
      const raw = await this.storage.getItem(draftKey); if (raw === null) return null;
      const value = JSON.parse(raw), slotId = photoUploadId(draftKey.slice(prefix(owner).length));
      if (key(owner, slotId) !== draftKey) throw invalid();
      if (value?.schema_version === 2) {
        if (value.slot_id !== slotId) throw invalid();
        const draft = parsePhotoDraft(value.draft, owner), previousUploadId = photoUploadId(value.previous_upload_id);
        if (draft.id === previousUploadId) throw invalid();
        return { key: draftKey, draft, previousUploadId };
      }
      const draft = parsePhotoDraft(value, owner);
      if (draft.id !== slotId) throw invalid();
      return { key: draftKey, draft };
    } catch { throw new Error('LOCAL_READ_FAILED'); }
  }
  private async entries(owner: string, guard: () => void): Promise<StoredPhoto[]> {
    const keys = await this.keys(owner); this.ensure(owner, guard);
    const result: StoredPhoto[] = [], ids = new Set<string>();
    for (const item of keys) {
      const value = await this.readKey(owner, item); this.ensure(owner, guard);
      if (value) { if (ids.has(value.draft.id)) throw new Error('LOCAL_READ_FAILED'); ids.add(value.draft.id); result.push(value); }
    }
    return result;
  }
  private serialized(entry: StoredPhoto): string {
    return JSON.stringify(entry.previousUploadId ? { schema_version: 2, slot_id: entry.key.slice(entry.key.lastIndexOf('.') + 1), previous_upload_id: entry.previousUploadId, draft: entry.draft } : entry.draft);
  }
  list(ownerId: string, guard = noGuard): Promise<VehiclePhotoDraft[]> {
    return this.run(ownerId, guard, async owner => {
      const result = (await this.entries(owner, guard)).map(value => value.draft);
      return result.sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
    });
  }
  read(ownerId: string, id: string, guard = noGuard): Promise<VehiclePhotoDraft | null> {
    return this.run(ownerId, guard, async owner => (await this.entries(owner, guard)).find(entry => entry.draft.id === photoUploadId(id))?.draft ?? null);
  }
  write(ownerId: string, value: VehiclePhotoDraft, guard = noGuard): Promise<void> {
    return this.run(ownerId, guard, async owner => {
      const draft = parsePhotoDraft(value, owner), draftKey = key(owner, draft.id), entries = await this.entries(owner, guard);
      const existing = entries.find(entry => entry.draft.id === draft.id);
      if (existing && JSON.stringify(existing.draft) !== JSON.stringify(draft) || !existing && entries.some(entry => entry.key === draftKey)) throw new Error('GARAGE_PHOTO_DRAFT_CONFLICT');
      if (!existing && entries.length >= GARAGE_PHOTO_DRAFT_LIMIT) throw new Error('GARAGE_PHOTO_DRAFT_LIMIT');
      const entry = existing ?? { key: draftKey, draft };
      try { await this.storage.setItem(entry.key, this.serialized(entry)); }
      catch { throw new Error('LOCAL_WRITE_FAILED'); }
    });
  }
  /** A fresh upload ID replaces one durable slot; original bytes survive a failed write, even at quota. */
  rotate(ownerId: string, expiredId: string, newId: string, guard = noGuard): Promise<VehiclePhotoDraft> {
    return this.run(ownerId, guard, async owner => {
      const expired = photoUploadId(expiredId), replacement = photoUploadId(newId);
      if (expired === replacement) throw invalid();
      const entries = await this.entries(owner, guard), existing = entries.find(entry => entry.draft.id === replacement);
      if (existing) {
        if (existing.previousUploadId !== expired) throw new Error('GARAGE_PHOTO_DRAFT_CONFLICT');
        return existing.draft;
      }
      const original = entries.find(entry => entry.draft.id === expired);
      if (!original) throw new Error('GARAGE_PHOTO_UNAVAILABLE');
      const draft = parsePhotoDraft({ ...original.draft, id: replacement, createdAtMs: original.draft.createdAtMs + 1 }, owner);
      const entry = { key: original.key, draft, previousUploadId: expired };
      this.ensure(owner, guard);
      try { await this.storage.setItem(entry.key, this.serialized(entry)); }
      catch { throw new Error('LOCAL_WRITE_FAILED'); }
      return draft;
    });
  }
  remove(ownerId: string, id: string, guard = noGuard): Promise<void> {
    return this.run(ownerId, guard, async owner => {
      const entry = (await this.entries(owner, guard)).find(value => value.draft.id === photoUploadId(id));
      if (!entry) return;
      try { await this.storage.removeItem(entry.key); } catch { throw new Error('LOCAL_WRITE_FAILED'); }
    });
  }
  /** Confirmed account deletion only: close synchronously, then remove after all earlier owner writes. */
  removeOwner(ownerId: string): Promise<void> {
    const owner = photoOwner(ownerId); this.queue.closed.add(owner);
    const removal = (this.queue.tails.get(owner) ?? Promise.resolve()).then(async () => {
      const keys = await this.keys(owner);
      try { for (const item of keys) await this.storage.removeItem(item); }
      catch { throw new Error('LOCAL_WRITE_FAILED'); }
    });
    const tail = removal.then(() => {}, () => {}); this.queue.tails.set(owner, tail);
    void tail.then(() => { if (this.queue.tails.get(owner) === tail) this.queue.tails.delete(owner); });
    return removal;
  }
}
