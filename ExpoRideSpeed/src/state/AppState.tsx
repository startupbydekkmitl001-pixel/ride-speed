import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { AccessibilityInfo, Platform, useColorScheme } from "react-native";
import type { GarageVehicle } from "../lib/domain";
import { theme, type ThemeColors } from "../lib/theme";
import { resolveDarkTheme } from "../lib/preferences";
import { I18nProvider } from "../lib/i18n";
import { AccountLocalStore, emptyOwned, type DevicePreferences, type OwnedLocalData } from "../lib/accountLocalStore";
import { isAccountCurrent, useAuth } from "./AuthState";

type LocalData = DevicePreferences & OwnedLocalData;
type State = {
  data: LocalData;
  update: (patch: Partial<LocalData>) => boolean;
  ready: boolean;
  dark: boolean;
  colors: ThemeColors;
  motion: boolean;
  glass: boolean;
  vehicle?: GarageVehicle;
  storageError: string | null;
  guestAvailable: boolean;
  importGuest: () => Promise<void>;
  retryStorage: () => Promise<void>;
  forgetLocalAccount: () => Promise<void>;
};
const Context = createContext<State | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const { scope, ready: authReady } = useAuth();
  const [store] = useState(() => new AccountLocalStore(AsyncStorage, isAccountCurrent));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const ready = authReady && snapshot.scope === scope && snapshot.ready;
  const data = useMemo(() => ({ ...snapshot.preferences, ...(snapshot.scope === scope ? snapshot.owned : emptyOwned()) }), [scope, snapshot]);
  const storageError = snapshot.scope === scope ? snapshot.error : null;
  const [systemReduce, setSystemReduce] = useState(true),
    [systemGlass, setSystemGlass] = useState(Platform.OS !== "web");
  const systemTheme = useColorScheme();
  useEffect(() => {
    if (authReady) void store.hydrate(scope);
  }, [authReady, scope, store]);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduce).catch(() => {});
    if (Platform.OS !== "web") AccessibilityInfo.isReduceTransparencyEnabled?.().then(setSystemGlass).catch(() => {});
    const transparency = Platform.OS === "web" && typeof window !== "undefined"
      ? window.matchMedia?.("(prefers-reduced-transparency: reduce)") : null;
    const browserTransparencyChanged = () => setSystemGlass(transparency?.matches ?? false);
    if (Platform.OS === "web") browserTransparencyChanged();
    transparency?.addEventListener?.("change", browserTransparencyChanged);
    const a = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setSystemReduce,
    );
    const b = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setSystemGlass,
    );
    return () => {
      a.remove();
      b.remove();
      transparency?.removeEventListener?.("change", browserTransparencyChanged);
    };
  }, []);
  const dark = resolveDarkTheme(data.theme, systemTheme);
  const update = useCallback(
    (patch: Partial<LocalData>) => store.update(scope, patch),
    [scope, store],
  );
  return (
    <Context.Provider
      value={{
        data,
        ready,
        dark,
        colors: dark ? theme.dark : theme.light,
        motion: !data.reduceMotion && !systemReduce,
        glass: !data.reduceGlass && !systemGlass,
        vehicle: data.vehicles.find((v) => v.id === data.selectedVehicleId),
        storageError,
        guestAvailable: ready && snapshot.guestAvailable,
        importGuest: () => store.importGuest(scope),
        retryStorage: () => store.retry(scope),
        forgetLocalAccount: () => store.forgetAccount(scope),
        update,
      }}
    >
      <I18nProvider preference={data.language}>{children}</I18nProvider>
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider is required");
  return value;
}
