import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AccessibilityInfo, Platform, useColorScheme } from "react-native";
import type { GarageVehicle, SavedRoute } from "../lib/domain";
import { theme, type ThemeColors } from "../lib/theme";
import { parsePreferences, resolveDarkTheme } from "../lib/preferences";
import { I18nProvider } from "../lib/i18n";

type LocalData = {
  theme: "dark" | "light" | "system";
  language: "system" | "th" | "en";
  reduceMotion: boolean;
  reduceGlass: boolean;
  welcomeDone: boolean;
  vehicles: GarageVehicle[];
  selectedVehicleId: string | null;
  routes: SavedRoute[];
  displayName: string;
  photoUri: string | null;
  unit: "kmh" | "mph";
};
const initial: LocalData = {
  ...parsePreferences(null),
  reduceMotion: false,
  reduceGlass: false,
  welcomeDone: false,
  vehicles: [],
  selectedVehicleId: null,
  routes: [],
  displayName: "Rider",
  photoUri: null,
  unit: "kmh",
};
type State = {
  data: LocalData;
  update: (patch: Partial<LocalData>) => void;
  ready: boolean;
  dark: boolean;
  colors: ThemeColors;
  motion: boolean;
  glass: boolean;
  vehicle?: GarageVehicle;
  storageError: string | null;
};
const Context = createContext<State | null>(null);
const KEY = "ridespeed.local.v4";
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState(initial),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState<string | null>(null);
  const [systemReduce, setSystemReduce] = useState(true),
    [systemGlass, setSystemGlass] = useState(Platform.OS !== "web");
  const systemTheme = useColorScheme();
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          const value = JSON.parse(raw);
          if (
            value &&
            Array.isArray(value.vehicles) &&
            Array.isArray(value.routes)
          )
            setData({ ...initial, ...value, ...parsePreferences(value) });
        }
      })
      .catch(() => setStorageError("อ่านข้อมูลในเครื่องไม่สำเร็จ"))
      .finally(() => setReady(true));
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
  useEffect(() => {
    if (ready)
      AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() =>
        setStorageError("บันทึกข้อมูลในเครื่องไม่สำเร็จ"),
      );
  }, [data, ready]);
  const dark = resolveDarkTheme(data.theme, systemTheme);
  const update = useCallback(
    (patch: Partial<LocalData>) =>
      setData((current) => ({ ...current, ...patch })),
    [],
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
