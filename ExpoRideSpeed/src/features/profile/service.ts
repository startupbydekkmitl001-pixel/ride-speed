import type { Session } from "@supabase/supabase-js";
import { publicService } from "../../lib/publicService";
import { accountClient, accountRpc, isAccountCurrent, type AuthScope } from "../../state/AuthState";
import { ScopedAvatarCache, validateSignedAvatarUrl, type AvatarReservation, type AvatarState, type AvatarTransport } from "./avatarPipeline";

export const avatarCache = new ScopedAvatarCache();
export function ensureProfileAccount(scope: AuthScope, session: Session | null): asserts session is Session {
  if (!session || session.user.id !== scope.userId || !isAccountCurrent(scope)) throw new Error("ACCOUNT_CHANGED");
}
export function parseAvatarState(value: unknown): AvatarState {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 || (raw.avatar_id !== null && (typeof raw.avatar_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.avatar_id)))) throw new Error("AVATAR_UNAVAILABLE");
  return { revision: raw.revision as number, avatar_id: raw.avatar_id as string | null };
}
export function avatarTransport(scope: AuthScope, session: Session): AvatarTransport {
  ensureProfileAccount(scope, session);
  const client = accountClient(scope, session);
  return {
    current: async () => parseAvatarState(await accountRpc(scope, session, "rs_get_avatar")),
    reserve: async value => {
      const result = await accountRpc(scope, session, "rs_reserve_avatar", { p_id: value.id, p_mime: value.mime });
      return result as AvatarReservation;
    },
    exists: async path => {
      ensureProfileAccount(scope, session);
      const { data, error } = await client.storage.from("ride-avatars").info(path);
      ensureProfileAccount(scope, session);
      if (error) {
        if ("statusCode" in error && ["404", "400"].includes(String(error.statusCode)) && /not found|does not exist/i.test(error.message)) return false;
        throw error;
      }
      return !!data;
    },
    upload: async (path, bytes, mime) => {
      ensureProfileAccount(scope, session);
      const { error } = await client.storage.from("ride-avatars").upload(path, bytes, { contentType: mime, upsert: false });
      ensureProfileAccount(scope, session);
      if (error) throw error;
    },
    commit: async (id, revision) => parseAvatarState(await accountRpc(scope, session, "rs_commit_avatar", { p_id: id, p_expected_revision: revision })),
  };
}
export async function getPrivateAvatar(scope: AuthScope, session: Session, avatarId: string): Promise<string | null> {
  ensureProfileAccount(scope, session);
  const cached = avatarCache.get(scope, avatarId);
  if (cached) return cached;
  const { data, error } = await accountClient(scope, session).functions.invoke("profile-avatar-url", { body: {} });
  ensureProfileAccount(scope, session);
  if (error) throw error;
  if (data?.avatarId !== avatarId || data?.url === null) return null;
  if (typeof data?.url !== "string" || data.expiresIn !== 60) throw new Error("AVATAR_UNAVAILABLE");
  validateSignedAvatarUrl(data.url, process.env.EXPO_PUBLIC_SUPABASE_URL ?? publicService.url, scope.userId!, avatarId);
  avatarCache.put(scope, avatarId, data.url, data.expiresIn);
  return data.url;
}
export async function getCloudProfile(scope: AuthScope, session: Session) {
  ensureProfileAccount(scope, session);
  const { data, error } = await accountClient(scope, session).from("rs_profiles").select("display_name,handle").eq("user_id", scope.userId!).maybeSingle();
  ensureProfileAccount(scope, session);
  if (error) throw error;
  if (data === null) return null;
  if (typeof data?.display_name !== "string" || !data.display_name.trim() || data.display_name.length > 40 || typeof data?.handle !== "string" || !/^[a-z0-9_]{3,24}$/.test(data.handle)) throw new Error("PROFILE_CLOUD_UNAVAILABLE");
  return data as { display_name: string; handle: string };
}
