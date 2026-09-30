import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";
import {
  Button,
  Field,
  Heading,
  IconButton,
  Note,
  Panel,
  Screen,
  Segments,
  T,
} from "../../components/ui";
import { configured, supabase } from "../../lib/supabase";
import { useApp } from "../../state/AppState";

export default function AuthScreen() {
  const { data, update } = useApp();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  async function google() {
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const redirectTo = Linking.createURL("auth/callback");
      const { data: oauth, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: Platform.OS !== "web",
          scopes: "openid email profile",
        },
      });
      if (error) throw error;
      if (Platform.OS !== "web" && oauth.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          oauth.url,
          redirectTo,
        );
        if (result.type === "success") {
          const callback = new URL(result.url);
          router.replace({
            pathname: "/auth/callback",
            params: {
              code: callback.searchParams.get("code") ?? "",
              sb_flow_id: callback.searchParams.get("sb_flow_id") ?? "",
              error_description:
                callback.searchParams.get("error_description") ?? "",
            },
          });
        }
      }
    } catch (e) {
      setFailed(true);
      setMessage(
        e instanceof Error ? e.message : "เข้าสู่ระบบ Google ไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const redirectTo = Linking.createURL("auth/callback");
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo },
        );
        if (error) throw error;
        setMessage("หากอีเมลนี้มีบัญชี เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้");
      } else if (mode === "signup") {
        if (password.length < 10)
          throw new Error("ใช้รหัสผ่านอย่างน้อย 10 ตัวอักษร");
        const { data: result, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setPassword("");
        if (result.session) finish();
        else setMessage("ตรวจสอบอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setPassword("");
        finish();
      }
    } catch (e) {
      setFailed(true);
      setMessage(
        e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ ลองอีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  }
  function finish() {
    update({ welcomeDone: true });
    router.replace(data.vehicles.length ? "/profile" : "/garage");
  }
  return (
    <Screen>
      <Heading
        eyebrow="YOUR NEXT CHAPTER"
        title={
          mode === "signup"
            ? "เริ่มต้นด้วยกัน"
            : mode === "reset"
              ? "กลับเข้าบัญชี"
              : "ยินดีต้อนรับกลับ"
        }
        right={
          <IconButton
            name="close"
            label="ปิด"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/")
            }
          />
        }
      />
      <T muted>
        เก็บเส้นทางของคุณ พบเพื่อนร่วมทาง และแบ่งปันเรื่องราวในบัญชีเดียว
      </T>
      <Button
        secondary
        label="ดำเนินการด้วย Google"
        icon="logo-google"
        onPress={google}
        busy={busy}
        disabled={!configured}
      />
      <T muted size={12} style={{ textAlign: "center" }}>
        หรือใช้อีเมล
      </T>
      <Segments
        items={[
          { value: "login", label: "เข้าสู่ระบบ" },
          { value: "signup", label: "สร้างบัญชี" },
        ]}
        value={mode === "reset" ? "login" : mode}
        onChange={(v) => {
          setMode(v);
          setMessage("");
        }}
      />
      <View style={{ gap: 18 }}>
        <Field
          label="อีเมล"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
        />
        {mode !== "reset" && (
          <Field
            label="รหัสผ่าน"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            placeholder={
              mode === "signup" ? "อย่างน้อย 10 ตัวอักษร" : "รหัสผ่านของคุณ"
            }
          />
        )}
      </View>
      {message ? <Note error={failed}>{message}</Note> : null}
      {!configured && (
        <Panel>
          <T weight="semibold">กำลังเชื่อมต่อระบบออนไลน์</T>
          <Note>
            คุณยังใช้มาตรวัดและจัดโรงรถในเครื่องได้
            บัญชีจะเปิดให้ใช้งานเมื่อเซิร์ฟเวอร์พร้อม
          </Note>
        </Panel>
      )}
      <Button
        label={
          mode === "signup"
            ? "สร้างบัญชี"
            : mode === "reset"
              ? "ส่งลิงก์ทางอีเมล"
              : "เข้าสู่ระบบ"
        }
        onPress={submit}
        busy={busy}
        disabled={
          !configured || !email.trim() || (mode !== "reset" && !password)
        }
        icon="arrow-forward"
      />
      {mode === "login" && (
        <Button
          secondary
          small
          label="ลืมรหัสผ่าน"
          onPress={() => {
            setMode("reset");
            setMessage("");
          }}
        />
      )}
      <Note>
        เราไม่เก็บรหัสผ่านไว้ในแอป
        การแชร์เส้นทางและรูปภาพจะเกิดขึ้นเมื่อคุณเลือกโพสต์เท่านั้น
      </Note>
    </Screen>
  );
}
