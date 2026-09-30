import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";
import {
  accountRpc,
  isAccountCurrent,
  type AuthScope,
  useAuth,
} from "./AuthState";
export type Friend = {
  user_id: string;
  handle: string;
  display_name: string;
  state: "pending" | "accepted";
  direction: "incoming" | "outgoing";
};
type Presence = {
  user_id: string;
  topic: string;
  online: boolean;
  expires_at: string | null;
};
type Online = {
  friends: Friend[];
  presence: Presence[];
  optedIn: boolean;
  profileReady: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setPresence: (enabled: boolean) => Promise<void>;
};
const blank = {
  friends: [] as Friend[],
  presence: [] as Presence[],
  optedIn: false,
  profileReady: false,
  error: null as string | null,
};
const Context = createContext<Online>({
  ...blank,
  refresh: async () => {},
  setPresence: async () => {},
});
export function OnlineProvider({ children }: { children: React.ReactNode }) {
  const { session, scope, ready } = useAuth();
  const [state, setState] = useState({
    ...blank,
    scope: null as AuthScope | null,
  });
  const request = useRef(0);
  const { friends, presence, optedIn, profileReady, error } =
    state.scope === scope ? state : blank;
  const refresh = useCallback(async () => {
    if (!session || !supabase || !isAccountCurrent(scope)) return;
    const version = ++request.current;
    try {
      const [
        { data: profile, error: profileError },
        nextFriends,
        nextPresence,
      ] = await Promise.all([
        supabase
          .from("rs_profiles")
          .select("presence_opt_in")
          .eq("user_id", session.user.id)
          .setHeader("Authorization", `Bearer ${session.access_token}`)
          .maybeSingle(),
        accountRpc<Friend[]>(scope, session, "rs_my_friends"),
        accountRpc<Presence[]>(scope, session, "rs_friend_presence"),
      ]);
      if (!isAccountCurrent(scope) || version !== request.current) return;
      if (profileError) throw profileError;
      setState({
        scope,
        friends: nextFriends,
        presence: AppState.currentState === "active" ? nextPresence : [],
        optedIn: profile?.presence_opt_in ?? false,
        profileReady: !!profile,
        error: null,
      });
    } catch {
      if (isAccountCurrent(scope) && version === request.current)
        setState((s) => ({
          ...(s.scope === scope ? s : blank),
          scope,
          presence: [],
          error: "เชื่อมต่อไม่สำเร็จ ลองรีเฟรชอีกครั้ง",
        }));
    }
  }, [scope, session]);
  useEffect(() => {
    if (!ready || !session) return;
    // This starts an asynchronous request, not an unconditional effect update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 30000);
    const listener = AppState.addEventListener("change", (appState) => {
      if (appState === "active") void refresh();
      else if (isAccountCurrent(scope))
        setState((s) => ({ ...s, presence: [] }));
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [refresh, ready, scope, session]);
  useEffect(() => {
    if (!session || !optedIn) return;
    const pulse = () => {
      if (AppState.currentState === "active" && isAccountCurrent(scope))
        void accountRpc(scope, session, "rs_heartbeat").catch(() => {});
    };
    pulse();
    const timer = setInterval(pulse, 30000);
    const listener = AppState.addEventListener("change", pulse);
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [scope, session, optedIn]);
  const topics = presence
    .map((p) => p.topic)
    .filter(Boolean)
    .sort()
    .join(",");
  useEffect(() => {
    if (!supabase || !topics) return;
    const client = supabase;
    let channels: ReturnType<typeof client.channel>[] = [];
    const close = () => {
      channels.forEach((c) => void client.removeChannel(c));
      channels = [];
    };
    const open = () => {
      close();
      if (AppState.currentState === "active" && isAccountCurrent(scope))
        channels = topics.split(",").map((topic) =>
          client
            .channel(topic, { config: { private: true } })
            .on("broadcast", { event: "presence" }, () => void refresh())
            .subscribe(),
        );
    };
    open();
    const listener = AppState.addEventListener("change", (appState) =>
      appState === "active" ? open() : close(),
    );
    return () => {
      listener.remove();
      close();
    };
  }, [topics, refresh, scope]);
  async function setPresence(enabled: boolean) {
    await accountRpc(scope, session, "rs_set_presence", { p_enabled: enabled });
    if (!isAccountCurrent(scope)) return;
    setState((s) => ({
      ...(s.scope === scope ? s : blank),
      scope,
      optedIn: enabled,
      presence: enabled && s.scope === scope ? s.presence : [],
    }));
    await refresh();
  }
  return (
    <Context.Provider
      value={{
        friends,
        presence,
        optedIn,
        profileReady,
        error,
        refresh,
        setPresence,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useOnline = () => useContext(Context);
