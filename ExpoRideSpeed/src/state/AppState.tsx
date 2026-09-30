import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AccessibilityInfo, useColorScheme } from "react-native";
import type { GarageVehicle, SavedRoute } from "../lib/domain";

type LocalData = {
  theme: "dark" | "light" | "system";
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
  theme: "dark",
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
const day = {
  bg: "#F4F5EF",
  surface: "#FFFFFF",
  raised: "#E9EDE5",
  ink: "#182824",
  muted: "#64706A",
  line: "#DCE1D8",
  accent: "#285FE7",
  onAccent: "#FFFFFF",
  good: "#397950",
  danger: "#B23E37",
};
const night = {
  bg: "#000000",
  surface: "#111111",
  raised: "#1D1D1D",
  ink: "#F1F3EC",
  muted: "#A3A8A0",
  line: "#292B28",
  accent: "#9BBAFF",
  onAccent: "#101A31",
  good: "#AFD1A2",
  danger: "#FFADA7",
};
type State = {
  data: LocalData;
  update: (patch: Partial<LocalData>) => void;
  ready: boolean;
  dark: boolean;
  colors: typeof day;
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
    [systemGlass, setSystemGlass] = useState(false);
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
            setData({ ...initial, ...value });
        }
      })
      .catch(() => setStorageError("อ่านข้อมูลในเครื่องไม่สำเร็จ"))
      .finally(() => setReady(true));
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduce);
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(setSystemGlass);
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
    };
  }, []);
  useEffect(() => {
    if (ready)
      AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() =>
        setStorageError("บันทึกข้อมูลในเครื่องไม่สำเร็จ"),
      );
  }, [data, ready]);
  const dark =
    data.theme === "dark" ||
    (data.theme === "system" && systemTheme === "dark");
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
        colors: dark ? night : day,
        motion: !data.reduceMotion && !systemReduce,
        glass: !data.reduceGlass && !systemGlass,
        vehicle: data.vehicles.find((v) => v.id === data.selectedVehicleId),
        storageError,
        update,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider is required");
  return value;
}
