import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Field, Heading, Note, Screen } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../state/AppState";
import {
  changeAccountPassword,
  exchangeAuthCodeOnce,
  isAccountCurrent,
  type AuthScope,
  useAuth,
} from "../../state/AuthState";

type Params = {
  code?: string | string[];
  sb_flow_id?: string | string[];
  error_description?: string | string[];
};
const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;
export default function Callback() {
  const params = useLocalSearchParams<Params>();
  const code = single(params.code),
    flowId = single(params.sb_flow_id),
    error = single(params.error_description);
  return (
    <CallbackFlow
      key={`${flowId ?? ""}:${code ?? ""}:${error ?? ""}`}
      code={code}
      flowId={flowId}
      error={error}
    />
  );
}
function CallbackFlow({
  code,
  flowId,
  error,
}: {
  code?: string;
  flowId?: string;
  error?: string;
}) {
  const { update } = useApp(),
    { session, scope } = useAuth();
  const [message, setMessage] = useState(
    code && supabase
      ? "กำลังยืนยันลิงก์…"
      : error || "ลิงก์ไม่สมบูรณ์หรือหมดอายุ กรุณาขอลิงก์ใหม่",
  );
  const [password, setPassword] = useState(""),
    [recoveryScope, setRecoveryScope] = useState<AuthScope | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!code || !supabase) return;
    let alive = true;
    void exchangeAuthCodeOnce(code, flowId).then((result) => {
      if (!alive) return;
      if (result.error) {
        setMessage(result.error);
        return;
      }
      if (
        !isAccountCurrent(result.scope) ||
        result.userId !== result.scope.userId
      ) {
        setMessage("บัญชีเปลี่ยนแล้ว กรุณากลับไปที่แอป");
        return;
      }
      update({ welcomeDone: true });
      setRecoveryScope(result.recovery ? result.scope : null);
      setMessage(
        result.recovery
          ? "ยืนยันลิงก์แล้ว ตั้งรหัสผ่านใหม่สำหรับบัญชีนี้"
          : "ยืนยันบัญชีสำเร็จ",
      );
    });
    return () => {
      alive = false;
    };
  }, [code, flowId, update]);
  const recovery = recoveryScope === scope && !!session;
  async function reset() {
    if (
      !session ||
      !recovery ||
      busy ||
      password.length < 10 ||
      !isAccountCurrent(scope)
    )
      return;
    setBusy(true);
    try {
      await changeAccountPassword(scope, session, password);
      if (!isAccountCurrent(scope)) return;
      setPassword("");
      setRecoveryScope(null);
      setMessage("ตั้งรหัสผ่านใหม่แล้ว");
    } catch (e) {
      if (isAccountCurrent(scope))
        setMessage(e instanceof Error ? e.message : "ตั้งรหัสผ่านไม่สำเร็จ");
    } finally {
      if (isAccountCurrent(scope)) setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading eyebrow="RIDE SPEED ACCOUNT" title="บัญชีของคุณ" />
      <Note>{message}</Note>
      {recovery && (
        <>
          <Field
            label="รหัสผ่านใหม่"
            placeholder="อย่างน้อย 10 ตัวอักษร"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
          />
          <Button
            label="บันทึกรหัสผ่านใหม่"
            onPress={reset}
            disabled={password.length < 10}
            busy={busy}
          />
        </>
      )}
      <Button
        secondary
        label="กลับไปที่แอป"
        onPress={() => router.replace("/profile")}
      />
    </Screen>
  );
}
