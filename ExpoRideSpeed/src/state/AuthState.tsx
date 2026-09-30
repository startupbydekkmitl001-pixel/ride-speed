import { createClient, type Session } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";
import { publicService } from "../lib/publicService";

export type AuthScope = Readonly<{ userId: string | null; generation: number }>;
let currentScope: AuthScope = { userId: null, generation: 0 };
export const isAccountCurrent = (scope: AuthScope) => scope === currentScope;
const accountChanged = () =>
  new Error("บัญชีเปลี่ยนแล้ว กรุณาลองใหม่ในบัญชีปัจจุบัน");
const scopedClients = new WeakMap<
  AuthScope,
  { token: string; client: NonNullable<typeof supabase> }
>();

// Database, Storage and Edge requests share this fixed JWT, never a later login's token.
export function accountClient(scope: AuthScope, session: Session | null) {
  if (!session || session.user.id !== scope.userId || !isAccountCurrent(scope))
    throw accountChanged();
  const cached = scopedClients.get(scope);
  if (cached?.token === session.access_token) return cached.client;
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? publicService.url,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      publicService.publishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    },
  );
  scopedClients.set(scope, { token: session.access_token, client });
  return client;
}

// Pin the JWT so a delayed account-A operation cannot become an account-B write.
export async function accountRpc<T>(
  scope: AuthScope,
  session: Session | null,
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (
    !supabase ||
    !session ||
    session.user.id !== scope.userId ||
    !isAccountCurrent(scope)
  )
    throw accountChanged();
  const { data, error } = await supabase
    .rpc(name, args)
    .setHeader("Authorization", `Bearer ${session.access_token}`);
  if (!isAccountCurrent(scope)) throw accountChanged();
  if (error) throw new Error(error.message);
  return data as T;
}

export async function changeAccountPassword(
  scope: AuthScope,
  session: Session,
  password: string,
) {
  if (!isAccountCurrent(scope) || session.user.id !== scope.userId)
    throw accountChanged();
  // An isolated in-memory Auth client cannot pick up a different account while
  // updateUser waits for its lock. No second persisted session is created.
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? publicService.url,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      publicService.publishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const { error: sessionError } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (!isAccountCurrent(scope)) throw accountChanged();
  if (sessionError) throw sessionError;
  const { error } = await client.auth.updateUser({ password });
  if (!isAccountCurrent(scope)) throw accountChanged();
  if (error) throw error;
}

type CodeResult = {
  userId: string | null;
  recovery: boolean;
  error: string | null;
  scope: AuthScope;
};
const codeExchanges = new Map<
  string,
  { created: number; promise: Promise<CodeResult> }
>();
export function exchangeAuthCodeOnce(
  code: string,
  flowId?: string,
): Promise<CodeResult> {
  const cacheKey = `${flowId ?? ""}:${code}`;
  const existing = codeExchanges.get(cacheKey);
  if (existing && Date.now() - existing.created < 300000)
    return existing.promise;
  if (!supabase)
    return Promise.resolve({
      userId: null,
      recovery: false,
      error: "ระบบบัญชียังไม่พร้อม",
      scope: currentScope,
    });
  const client = supabase;
  // Current auth-js returns redirectType from the consumed PKCE verifier. Reading
  // this result avoids confusing a different concurrent flow's recovery event.
  const promise = client.auth
    .exchangeCodeForSession(code, flowId ? { flowId } : undefined)
    .then(({ data, error }) => ({
      userId: data.session?.user.id ?? null,
      recovery: "redirectType" in data && data.redirectType === "recovery",
      error: error
        ? "ยืนยันไม่สำเร็จ กรุณาเปิดลิงก์บนเครื่องที่ขอ หรือขอลิงก์ใหม่"
        : null,
      scope: currentScope,
    }))
    .catch(() => ({
      userId: null,
      recovery: false,
      error: "เชื่อมต่อไม่สำเร็จ กรุณาขอลิงก์ใหม่",
      scope: currentScope,
    }));
  for (const [key, value] of codeExchanges)
    if (Date.now() - value.created >= 300000) codeExchanges.delete(key);
  if (codeExchanges.size >= 16)
    codeExchanges.delete(codeExchanges.keys().next().value!);
  codeExchanges.set(cacheKey, { created: Date.now(), promise });
  return promise;
}

type Auth = {
  session: Session | null;
  scope: AuthScope;
  ready: boolean;
  error: string | null;
};
const Context = createContext<Auth>({
  session: null,
  scope: currentScope,
  ready: false,
  error: null,
});
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Auth>({
    session: null,
    scope: currentScope,
    ready: !supabase,
    error: null,
  });
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let alive = true,
      authEvents = 0;
    const accept = (next: Session | null, error: string | null = null) => {
      if (!alive) return;
      if (currentScope.userId !== (next?.user.id ?? null))
        currentScope = {
          userId: next?.user.id ?? null,
          generation: currentScope.generation + 1,
        };
      setState({ session: next, scope: currentScope, ready: true, error });
    };
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
      authEvents++;
      accept(next);
    });
    const hydrationVersion = authEvents;
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (authEvents === hydrationVersion)
          accept(data.session, error?.message ?? null);
      })
      .catch(() => {
        if (authEvents === hydrationVersion)
          accept(null, "เปิดบัญชีที่บันทึกไว้ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่");
      });
    const appState = AppState.addEventListener("change", (next) =>
      next === "active"
        ? client.auth.startAutoRefresh()
        : client.auth.stopAutoRefresh(),
    );
    if (AppState.currentState === "active") client.auth.startAutoRefresh();
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
      appState.remove();
      client.auth.stopAutoRefresh();
    };
  }, []);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
