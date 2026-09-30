export type PendingAvatar = { id: string; base64: string; expectedRevision: number | null };
export type StoredProfile = {
  displayName: string;
  handle: string;
  photoUri: string | null;
  avatarId: string | null;
  avatarRevision: number | null;
  pendingAvatar: PendingAvatar | null;
};
export const blankProfile = (): StoredProfile => ({ displayName: "Rider", handle: "", photoUri: null, avatarId: null, avatarRevision: null, pendingAvatar: null });
export function readStoredProfile(raw: string | null): StoredProfile {
  const result = blankProfile();
  if (!raw) return result;
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object") return result;
  if (typeof value.displayName === "string" && value.displayName.trim() && value.displayName.length <= 40) result.displayName = value.displayName;
  if (typeof value.handle === "string" && /^[a-z0-9_]{3,24}$/.test(value.handle)) result.handle = value.handle;
  // Only device photo fallbacks are persisted; signed cloud URLs remain in memory.
  if (typeof value.photoUri === "string" && value.photoUri.length <= 1_450_000 && /^(data:image\/(jpeg|png|webp);base64,|file:|content:|blob:)/.test(value.photoUri)) result.photoUri = value.photoUri;
  if (typeof value.avatarId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.avatarId)) result.avatarId = value.avatarId;
  if (Number.isSafeInteger(value.avatarRevision) && value.avatarRevision >= 0) result.avatarRevision = value.avatarRevision;
  const pending = value.pendingAvatar;
  if (pending && typeof pending.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pending.id) && typeof pending.base64 === "string" && pending.base64.length <= 1_400_000 && (pending.expectedRevision === null || Number.isSafeInteger(pending.expectedRevision) && pending.expectedRevision >= 0)) result.pendingAvatar = { id: pending.id, base64: pending.base64, expectedRevision: pending.expectedRevision };
  return result;
}
