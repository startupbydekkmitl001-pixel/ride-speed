import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { Redirect } from "expo-router";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Button, Heading, Note, Screen } from "../../components/ui";
import { errorKey, useI18n } from "../../lib/i18n";
import { useApp } from "../../state/AppState";
import { isAccountCurrent, useAuth, type AuthScope } from "../../state/AuthState";
import { initialAccountState } from "./model";
import { OnboardingStorageQueue, OnboardingStore } from "./OnboardingStore";
import { getAccountState, putAccountState } from "./service";

const stores = new WeakMap<AuthScope, { store: OnboardingStore; session: Session | null }>();
const localQueue = new OnboardingStorageQueue();
const localKey = (scope: AuthScope) => `ride.onboarding.v1.${scope.userId ?? "guest"}`;
function scopedStore(scope: AuthScope, session: Session | null) {
  let holder = stores.get(scope);
  if (holder) { holder.session = session; return holder.store; }
  const key = localKey(scope);
  const ensure = () => {
    if (!isAccountCurrent(scope)) throw new Error("ACCOUNT_CHANGED");
    if (localQueue.isClosed(key)) throw new Error("ACCOUNT_DELETION_PENDING");
  };
  const created = { store: null as unknown as OnboardingStore, session };
  created.store = new OnboardingStore({
    ...localQueue.bind(key, AsyncStorage, ensure), ensure,
    get: () => created.session ? getAccountState(scope, created.session) : Promise.resolve(initialAccountState()),
    put: value => created.session ? putAccountState(scope, created.session, value) : Promise.resolve(value),
  });
  stores.set(scope, created);
  return created.store;
}
export function useOnboardingStatus() {
  const { scope, session, ready } = useAuth();
  const store = scopedStore(scope, session);
  const status = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { if (ready) void store.hydrate().catch(() => {}); }, [ready, store]);
  return { ...status, advance: store.advance, retry: store.retry, refresh: store.retry, setPreferences: store.setPreferences, clear: store.clear, complete: status.value.onboarding_step === "complete" };
}
export async function clearOnboardingAccount(scope: AuthScope) {
  if (!scope.userId) return;
  const key = localKey(scope);
  localQueue.close(key);
  const holder = stores.get(scope);
  if (holder) await holder.store.clear();
  else await localQueue.bind(key, AsyncStorage, () => {}).remove();
  stores.delete(scope);
}
export function OnboardingEntry({ children }: { children: ReactNode }) {
  const { session, ready: authReady, scope } = useAuth(), { data, ready, update } = useApp();
  const { t } = useI18n();
  const status = useOnboardingStatus();
  useEffect(() => {
    if (ready && status.ready && status.complete && !data.welcomeDone && isAccountCurrent(scope)) update({ welcomeDone: true });
  }, [ready, status.ready, status.complete, data.welcomeDone, scope, update]);
  if (!session || data.welcomeDone || status.complete) return children;
  if (!authReady || !ready || !status.ready) return <Screen><Note>{t("onboard.loading")}</Note></Screen>;
  if (status.error && !status.localFound) return <Screen>
    <Heading eyebrow="" title={t("onboard.connectionTitle")} />
    <Note error>{t(errorKey(status.error, "onboarding"))}</Note>
    <Button label={t("common.retry")} onPress={() => { void status.retry().catch(() => {}); }} busy={status.busy} />
    <Button secondary label={t("onboard.continueOffline")} onPress={() => { void status.advance("language").catch(() => {}); }} disabled={status.busy || status.error === "LOCAL_READ_FAILED"} />
  </Screen>;
  return <Redirect href="/onboarding" />;
}
