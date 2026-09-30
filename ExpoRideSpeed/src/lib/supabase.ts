import { createClient, processLock } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { publicService } from "./publicService";

// A generation pointer is committed only after all encrypted chunks are written.
// This keeps token refresh atomic while accommodating sessions larger than 2 KB.
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
type Manifest = { generation: string; count: number };
async function manifest(key: string): Promise<Manifest | null> {
  const raw = await SecureStore.getItemAsync(`${key}.index`, options);
  if (!raw) return null;
  const result = JSON.parse(raw);
  if (
    !Number.isInteger(result.count) ||
    result.count < 1 ||
    result.count > 100 ||
    !/^[a-z0-9-]+$/.test(result.generation)
  )
    throw new Error("Invalid session storage");
  return result;
}
async function clearGeneration(key: string, m: Manifest | null) {
  if (m)
    await Promise.all(
      Array.from({ length: m.count }, (_, i) =>
        SecureStore.deleteItemAsync(`${key}.${m.generation}.${i}`, options),
      ),
    );
}
const storage = {
  async getItem(key: string) {
    if (Platform.OS === "web")
      return typeof sessionStorage === "undefined"
        ? null
        : sessionStorage.getItem(key);
    const m = await manifest(key);
    if (!m) return null;
    const chunks = await Promise.all(
      Array.from({ length: m.count }, (_, i) =>
        SecureStore.getItemAsync(`${key}.${m.generation}.${i}`, options),
      ),
    );
    return chunks.some((c) => c === null) ? null : chunks.join("");
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined")
        sessionStorage.setItem(key, value);
      return;
    }
    const old = await manifest(key),
      generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const chunks = value.match(/[\s\S]{1,450}/g) ?? [""];
    if (chunks.length > 100)
      throw new Error("Session is too large to store securely");
    const next = { generation, count: chunks.length };
    try {
      await Promise.all(
        chunks.map((chunk, i) =>
          SecureStore.setItemAsync(`${key}.${generation}.${i}`, chunk, options),
        ),
      );
      await SecureStore.setItemAsync(
        `${key}.index`,
        JSON.stringify(next),
        options,
      );
    } catch (e) {
      await clearGeneration(key, next).catch(() => {});
      throw e;
    }
    await clearGeneration(key, old).catch(() => {});
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
      return;
    }
    const old = await manifest(key);
    await SecureStore.deleteItemAsync(`${key}.index`, options);
    await clearGeneration(key, old);
  },
};
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? publicService.url;
const key =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  publicService.publishableKey;
export const configured = Boolean(url && key);
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          flowType: "pkce",
          lock: processLock,
        },
      })
    : null;
export async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!supabase)
    throw new Error("กำลังเตรียมระบบออนไลน์ — ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
