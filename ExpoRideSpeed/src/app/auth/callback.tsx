import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Field, Heading, Note, Screen } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { errorKey, useI18n, type TranslationKey } from "../../lib/i18n";
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
  const { session, scope } = useAuth();
  const { t } = useI18n();
  const [message, setMessage] = useState<TranslationKey>(
    code && supabase
      ? "auth.verifying"
      : errorKey(error, "callback"),
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
        setMessage(errorKey(result.error, "callback"));
        return;
      }
      if (
        !isAccountCurrent(result.scope) ||
        result.userId !== result.scope.userId
      ) {
        setMessage("errors.accountChanged");
        return;
      }
      setRecoveryScope(result.recovery ? result.scope : null);
      setMessage(
        result.recovery
          ? "auth.recoveryVerified"
          : "auth.accountVerified",
      );
      if (!result.recovery) router.replace("/");
    });
    return () => {
      alive = false;
    };
  }, [code, flowId]);
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
      setMessage("auth.passwordSaved");
    } catch (e) {
      if (isAccountCurrent(scope))
        setMessage(errorKey(e, "password"));
    } finally {
      if (isAccountCurrent(scope)) setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading eyebrow={t("auth.eyebrow")} title={t("auth.account")} />
      <Note>{t(message)}</Note>
      {recovery && (
        <>
          <Field
            label={t("auth.newPassword")}
            placeholder={t("auth.passwordMinimum")}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
          />
          <Button
            label={t("auth.savePassword")}
            onPress={reset}
            disabled={password.length < 10}
            busy={busy}
          />
        </>
      )}
      <Button
        secondary
        label={t("auth.backToApp")}
        onPress={() => router.replace("/")}
      />
    </Screen>
  );
}
