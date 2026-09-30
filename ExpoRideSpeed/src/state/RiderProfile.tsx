import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { pictureBytes } from "../lib/photos";
import { avatarCache, avatarTransport, ensureProfileAccount, getCloudProfile, getPrivateAvatar } from "../features/profile/service";
import { blankProfile, readStoredProfile, type StoredProfile } from "../features/profile/model";
import { syncAvatarUpload } from "../features/profile/avatarPipeline";
import { isAccountCurrent, type AuthScope, useAuth } from "./AuthState";

type Record = { scope: AuthScope | null; value: StoredProfile; cloudPhoto: string | null; ready: boolean; error: string | null };
const Context = createContext({ ...blankProfile(), ready: false, error: null as string | null, photoSync: "local" as "synced" | "local" | "pending",
  save: async (_patch: Partial<StoredProfile>) => {},
  uploadPhoto: async (_photo: { uri: string; base64: string }): Promise<"synced" | "local"> => "local",
  retryPhoto: async () => {}, reload: () => {}, clearAccount: async () => {},
});
export function RiderProfileProvider({ children }: { children: React.ReactNode }) {
  const { session, scope, ready: authReady } = useAuth(), owner = scope.userId ?? "guest";
  const [record, setRecord] = useState<Record>({ scope: null, value: blankProfile(), cloudPhoto: null, ready: false, error: null });
  const [reloadVersion, setReloadVersion] = useState(0);
  const snapshot = useRef(record), writes = useRef(Promise.resolve()), version = useRef(0);
  const readableScope = useRef<AuthScope | null>(null), closedScopes = useRef(new WeakSet<AuthScope>());
  const publish = useCallback((next: Record) => { snapshot.current = next; setRecord(next); }, []);
  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    const revision = ++version.current;
    const active = () => alive && isAccountCurrent(scope) && !closedScopes.current.has(scope) && revision === version.current;
    void (async () => {
      await writes.current.catch(() => {});
      if (!active()) return;
      let value = blankProfile(), localError: string | null = null;
      try { value = readStoredProfile(await AsyncStorage.getItem(`ride.profile.${owner}`)); if (active()) readableScope.current = scope; }
      catch { localError = "LOCAL_READ_FAILED"; }
      if (!active()) return;
      publish({ scope, value, cloudPhoto: null, ready: true, error: localError });
      if (!session) return;
      try {
        const profile = await getCloudProfile(scope, session);
        if (!active()) return;
        if (profile) value = { ...value, displayName: profile.display_name, handle: profile.handle };
        const avatar = await avatarTransport(scope, session).current();
        if (!active()) return;
        // A queued local upload is retried explicitly, never replaced by hydration.
        if (!value.pendingAvatar && value.avatarId !== avatar.avatar_id) value.photoUri = null;
        value = { ...value, avatarId: avatar.avatar_id, avatarRevision: avatar.revision };
        const cloudPhoto = avatar.avatar_id && !value.pendingAvatar ? await getPrivateAvatar(scope, session, avatar.avatar_id) : null;
        if (!active()) return;
        const persisted = writes.current.catch(() => {}).then(async () => {
          if (!active()) return;
          if (!localError && readableScope.current === scope) await AsyncStorage.setItem(`ride.profile.${owner}`, JSON.stringify(value));
          if (active()) publish({ scope, value, cloudPhoto, ready: true, error: localError });
        });
        writes.current = persisted.catch(() => {});
        await persisted;
      } catch {
        if (active()) publish({ scope, value, cloudPhoto: null, ready: true, error: localError ?? "PROFILE_CLOUD_UNAVAILABLE" });
      }
    })().catch(() => { if (active()) publish({ scope, value: blankProfile(), cloudPhoto: null, ready: true, error: "LOCAL_READ_FAILED" }); });
    return () => { alive = false; avatarCache.clear(scope); };
  }, [authReady, owner, scope, session, reloadVersion, publish]);
  const save = useCallback((patch: Partial<StoredProfile>) => {
    if (closedScopes.current.has(scope)) return Promise.reject(new Error("ACCOUNT_CHANGED"));
    const pending = writes.current.catch(() => {}).then(async () => {
      const current = snapshot.current;
      if (!isAccountCurrent(scope) || closedScopes.current.has(scope) || current.scope !== scope || !current.ready) throw new Error("ACCOUNT_CHANGED");
      if (readableScope.current !== scope) throw new Error("LOCAL_READ_FAILED");
      ++version.current;
      const value = { ...current.value, ...patch };
      try { await AsyncStorage.setItem(`ride.profile.${owner}`, JSON.stringify(value)); }
      catch { throw new Error("LOCAL_WRITE_FAILED"); }
      if (!isAccountCurrent(scope)) throw new Error("ACCOUNT_CHANGED");
      publish({ scope, value, cloudPhoto: "photoUri" in patch ? null : current.cloudPhoto, ready: true, error: null });
    });
    writes.current = pending.catch(() => {});
    return pending;
  }, [owner, scope, publish]);
  const syncPhoto = useCallback(async () => {
    ensureProfileAccount(scope, session);
    const pending = snapshot.current.scope === scope ? snapshot.current.value.pendingAvatar : null;
    if (!pending) return;
    const result = await syncAvatarUpload({ id: pending.id, owner: scope.userId!, mime: "image/jpeg", bytes: pictureBytes(pending.base64), expectedRevision: pending.expectedRevision }, avatarTransport(scope, session), () => ensureProfileAccount(scope, session));
    ensureProfileAccount(scope, session);
    if (snapshot.current.value.pendingAvatar?.id !== pending.id) return;
    avatarCache.clear(scope);
    await save({ avatarId: result.avatar_id, avatarRevision: result.revision, pendingAvatar: null });
    const cloudPhoto = result.avatar_id ? await getPrivateAvatar(scope, session, result.avatar_id) : null;
    ensureProfileAccount(scope, session);
    if (snapshot.current.value.avatarId === result.avatar_id && !snapshot.current.value.pendingAvatar) publish({ ...snapshot.current, cloudPhoto, error: null });
  }, [scope, session, save, publish]);
  const uploadPhoto = useCallback(async (photo: { uri: string; base64: string }): Promise<"synced" | "local"> => {
    if (pictureBytes(photo.base64).byteLength > 1_048_576) throw new Error("AVATAR_INVALID_OBJECT");
    const value = snapshot.current.value;
    await save({ photoUri: photo.uri, pendingAvatar: session ? { id: randomUUID(), base64: photo.base64, expectedRevision: value.avatarRevision } : null });
    if (!session) return "local";
    try { await syncPhoto(); return "synced"; }
    catch (error) {
      if (!isAccountCurrent(scope)) throw new Error("ACCOUNT_CHANGED");
      publish({ ...snapshot.current, error: error instanceof Error ? error.message : "AVATAR_UNAVAILABLE" });
      return "local";
    }
  }, [scope, session, save, syncPhoto, publish]);
  const clearAccount = useCallback(async () => {
    if (!scope.userId || !isAccountCurrent(scope)) throw new Error("ACCOUNT_CHANGED");
    closedScopes.current.add(scope);
    ++version.current;
    const cleared = writes.current.catch(() => {}).then(async () => {
      await AsyncStorage.removeItem(`ride.profile.${owner}`);
      avatarCache.clear(scope);
      if (isAccountCurrent(scope)) publish({ scope, value: blankProfile(), cloudPhoto: null, ready: true, error: null });
    });
    writes.current = cleared.catch(() => {});
    await cleared;
  }, [owner, scope, publish]);
  const reload = useCallback(() => setReloadVersion(value => value + 1), []);
  const visible = record.scope === scope ? record : { value: blankProfile(), cloudPhoto: null, ready: false, error: null };
  return <Context.Provider value={{ ...visible.value, photoUri: visible.cloudPhoto ?? visible.value.photoUri, ready: visible.ready, error: visible.error,
    photoSync: visible.value.pendingAvatar ? "pending" : visible.value.avatarId ? "synced" : "local",
    save, uploadPhoto, retryPhoto: syncPhoto, reload, clearAccount,
  }}>{children}</Context.Provider>;
}
export const useRiderProfile = () => useContext(Context);
