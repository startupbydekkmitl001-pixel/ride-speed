import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { isAccountCurrent, type AuthScope, useAuth } from "./AuthState";

type Profile = { displayName: string; photoUri: string | null };
const blank: Profile = { displayName: "Rider", photoUri: null };
type Record = {
  scope: AuthScope | null;
  value: Profile;
  ready: boolean;
  error: string | null;
};
const Context = createContext({
  ...blank,
  ready: false,
  error: null as string | null,
  save: async (_patch: Partial<Profile>) => {},
});
export function RiderProfileProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, scope, ready: authReady } = useAuth(),
    owner = scope.userId ?? "guest";
  const [record, setRecord] = useState<Record>({
    scope: null,
    value: blank,
    ready: false,
    error: null,
  });
  const snapshot = useRef(record),
    writes = useRef(Promise.resolve()),
    version = useRef(0);
  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    const revision = ++version.current;
    const commit = (value: Profile, error: string | null) => {
      if (!alive || !isAccountCurrent(scope) || version.current !== revision)
        return;
      const next = { scope, value, ready: true, error };
      snapshot.current = next;
      setRecord(next);
    };
    void (async () => {
      // A relogin waits for any already-started write to this provider to finish.
      await writes.current.catch(() => {});
      if (!alive || !isAccountCurrent(scope)) return;
      let value = { ...blank },
        warning: string | null = null;
      try {
        const raw = await AsyncStorage.getItem(`ride.profile.${owner}`),
          stored = raw ? JSON.parse(raw) : null;
        if (stored && typeof stored === "object") {
          if (
            typeof stored.displayName === "string" &&
            stored.displayName.trim().length > 0 &&
            stored.displayName.length <= 40
          )
            value.displayName = stored.displayName;
          if (
            typeof stored.photoUri === "string" &&
            stored.photoUri.length <= 10000
          )
            value.photoUri = stored.photoUri;
        }
      } catch {
        warning = "อ่านข้อมูลบัตรในเครื่องไม่สำเร็จ";
      }
      if (session && supabase) {
        const { data, error } = await supabase
          .from("rs_profiles")
          .select("display_name")
          .eq("user_id", owner)
          .setHeader("Authorization", `Bearer ${session.access_token}`)
          .maybeSingle();
        if (data?.display_name) value.displayName = data.display_name;
        if (error) warning = "ยังโหลดชื่อจากบัญชีไม่ได้";
      }
      commit(value, warning);
    })().catch(() => commit({ ...blank }, "โหลดโปรไฟล์ไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, [owner, scope, session, authReady]);
  const profile =
    record.scope === scope
      ? record
      : { value: blank, ready: false, error: null };
  const save = useCallback(
    (patch: Partial<Profile>) => {
      const pending = writes.current
        .catch(() => {})
        .then(async () => {
          const current = snapshot.current;
          if (
            !isAccountCurrent(scope) ||
            current.scope !== scope ||
            !current.ready
          )
            throw new Error("บัญชีเปลี่ยนหรือโปรไฟล์ยังโหลดไม่เสร็จ");
          ++version.current; // A slower load may no longer replace this newer save.
          const next = { ...current.value, ...patch };
          await AsyncStorage.setItem(
            `ride.profile.${owner}`,
            JSON.stringify(next),
          );
          if (!isAccountCurrent(scope))
            throw new Error("บัญชีเปลี่ยนแล้ว กรุณาลองใหม่");
          const updated = { scope, value: next, ready: true, error: null };
          snapshot.current = updated;
          setRecord(updated);
        });
      writes.current = pending.catch(() => {});
      return pending;
    },
    [owner, scope],
  );
  return (
    <Context.Provider
      value={{
        ...profile.value,
        ready: profile.ready,
        error: profile.error,
        save,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useRiderProfile = () => useContext(Context);
