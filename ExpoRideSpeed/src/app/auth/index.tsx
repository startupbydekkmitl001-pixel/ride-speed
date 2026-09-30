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
import { publicService } from "../../lib/publicService";
import { useApp } from "../../state/AppState";

const publicRegistrationAvailable =
  publicService.publicEmailRegistration && publicService.publicEmailDelivery;

function authError(
  error: unknown,
  mode: "google" | "login" | "signup" | "reset",
) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (code === "invalid_credentials")
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
  if (code === "email_not_confirmed")
    return publicService.publicEmailDelivery
      ? "ยืนยันอีเมลของบัญชีนี้ก่อนเข้าสู่ระบบ"
      : "บัญชีนี้ยังไม่ได้ยืนยันอีเมล ขณะนี้อีเมลยืนยันส่งได้เฉพาะทีมพัฒนา";
  if (code.includes("rate_limit"))
    return "ส่งคำขอบ่อยเกินไป กรุณาลองใหม่ภายหลัง";
  if (mode === "reset" && !publicService.publicEmailDelivery)
    return "ส่งลิงก์ไม่สำเร็จ ขณะนี้ส่งอีเมลได้เฉพาะทีมพัฒนา หากใช้บัญชี Google ให้เข้าสู่ระบบด้วย Google";
  return mode === "google"
    ? "เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองอีกครั้ง"
    : "เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง";
}

export default function AuthScreen() {
  const { data, update } = useApp();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [pending, setPending] = useState<"google" | "email" | null>(null),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const busy = pending !== null;
  async function google() {
    if (!supabase || busy) return;
    setPending("google");
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
      setMessage(authError(e, "google"));
    } finally {
      setPending(null);
    }
  }
  async function submit() {
    if (!supabase || busy) return;
    if (mode === "signup" && !publicRegistrationAvailable) {
      setFailed(true);
      setMessage("การสมัครด้วยอีเมลยังไม่เปิดให้บริการ กรุณาสมัครด้วย Google");
      return;
    }
    if (mode === "signup" && password.length < 10) {
      setFailed(true);
      setMessage("ใช้รหัสผ่านอย่างน้อย 10 ตัวอักษร");
      return;
    }
    setPending("email");
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
        setMessage(
          publicService.publicEmailDelivery
            ? "รับคำขอแล้ว หากอีเมลนี้มีบัญชี ให้ตรวจสอบกล่องจดหมายและสแปม"
            : "รับคำขอแล้ว ลิงก์จะส่งได้เฉพาะบัญชีอีเมลของทีมพัฒนาเท่านั้น",
        );
      } else if (mode === "signup") {
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
      setMessage(authError(e, mode));
    } finally {
      setPending(null);
    }
  }
  function finish() {
    update({ welcomeDone: true });
    router.replace(data.vehicles.length ? "/profile" : "/garage");
  }
  return (
    <Screen>
      <Heading
        eyebrow=""
        title={
          mode === "signup"
            ? "สมัครด้วยอีเมล"
            : mode === "reset"
              ? "ตั้งรหัสผ่านใหม่"
              : "บัญชีของคุณ"
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
      <T muted>สมัครหรือเข้าสู่ระบบด้วย Google เพื่อเพิ่มเพื่อนและแชร์ทริป</T>
      <Button
        label="ดำเนินการด้วย Google"
        icon="logo-google"
        onPress={google}
        busy={pending === "google"}
        disabled={!configured || pending === "email"}
      />
      {!publicRegistrationAvailable && (
        <Note>
          ผู้ใช้ใหม่สมัครด้วย Google ได้เลย การสมัครด้วยอีเมลยังไม่เปิดให้บริการ
        </Note>
      )}
      {publicRegistrationAvailable ? (
        <Segments
          items={[
            { value: "login", label: "เข้าสู่ระบบ" },
            { value: "signup", label: "สร้างบัญชี" },
          ]}
          value={mode === "reset" ? "login" : mode}
          onChange={(v) => {
            if (busy) return;
            setMode(v);
            setMessage("");
            setFailed(false);
          }}
        />
      ) : (
        <T size={20} weight="semibold">
          {mode === "reset" ? "กู้รหัสผ่านบัญชีอีเมล" : "มีบัญชีอีเมลอยู่แล้ว"}
        </T>
      )}
      {mode === "reset" && !publicService.publicEmailDelivery && (
        <Note>
          ขณะนี้ส่งลิงก์ได้เฉพาะอีเมลของทีมพัฒนา
          อีเมลทั่วไปยังใช้การกู้รหัสผ่านทางอีเมลไม่ได้ บัญชี Google
          ใช้ปุ่มด้านบนได้เลย
        </Note>
      )}
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
          editable={!busy}
        />
        {mode !== "reset" && (
          <Field
            label="รหัสผ่าน"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
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
        secondary
        label={
          mode === "signup"
            ? "สร้างบัญชี"
            : mode === "reset"
              ? "ขอลิงก์ตั้งรหัสผ่าน"
              : "เข้าสู่ระบบด้วยอีเมล"
        }
        onPress={submit}
        busy={pending === "email"}
        disabled={
          !configured ||
          pending === "google" ||
          !email.trim() ||
          (mode !== "reset" && !password) ||
          (mode === "signup" && !publicRegistrationAvailable)
        }
        icon="arrow-forward"
      />
      {mode === "login" && (
        <Button
          secondary
          small
          label="ลืมรหัสผ่าน"
          disabled={busy}
          onPress={() => {
            setMode("reset");
            setMessage("");
            setFailed(false);
          }}
        />
      )}
      {mode === "reset" && (
        <Button
          secondary
          small
          label="กลับไปเข้าสู่ระบบด้วยอีเมล"
          disabled={busy}
          onPress={() => {
            setMode("login");
            setMessage("");
            setFailed(false);
          }}
        />
      )}
      <Note>
        เราไม่เก็บรหัสผ่านไว้ในแอป
        การแชร์เส้นทางและรูปภาพจะเกิดขึ้นเมื่อคุณตรวจสอบและยืนยันการแชร์
      </Note>
    </Screen>
  );
}
