import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Field, Heading, Note, Panel, Screen, T } from "../../components/ui";
import { clearOnboardingAccount } from "../../features/onboarding";
import { finishAccountDeletion, parseDeletionReceipt, type DeletionReceipt } from "../../features/profile/deletion";
import { errorKey, useI18n, type TranslationKey } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../state/AppState";
import { accountClient, isAccountCurrent, useAuth } from "../../state/AuthState";
import { useRiderProfile } from "../../state/RiderProfile";
import { clearRideAccount,useRide } from "../../state/RideState";
import { clearGarageAccount } from "../../state/GarageState";
import { clearRouteAccount } from "../../state/RouteState";
import { clearSocialAccount } from "../../state/SocialState";

export default function DeleteAccountScreen() {
  const { scope } = useAuth();
  return <AccountDeletion key={scope.generation} />;
}
function AccountDeletion() {
  const { session, scope } = useAuth(), { forgetLocalAccount } = useApp(), rider = useRiderProfile(), ride = useRide(), { t } = useI18n();
  const [confirmation, setConfirmation] = useState(""), [receipt, setReceipt] = useState<DeletionReceipt | null>(null), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState<TranslationKey | null>(null);
  const [readVersion, setReadVersion] = useState(0);
  const key = `ride.deletion.v1.${scope.userId}`;
  const ensure = () => { if (!session || session.user.id !== scope.userId || !isAccountCurrent(scope)) throw new Error("ACCOUNT_CHANGED"); };
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(key).then(raw => {
      if (!alive || !isAccountCurrent(scope)) return;
      const parsed = parseDeletionReceipt(raw);
      if (raw !== null && !parsed) { setMessage("errors.localRead"); return; }
      setReceipt(parsed); setLoaded(true);
    }).catch(() => { if (alive && isAccountCurrent(scope)) setMessage("errors.localRead"); });
    return () => { alive = false; };
  }, [key, scope, readVersion]);
  async function removeAccount() {
    if (busy || !loaded || !session || (!receipt && confirmation !== "DELETE")) return;
    setBusy(true); setMessage(null);
    let requested = receipt ?? { requestId: randomUUID(), state: "requested" as const };
    try {
      await finishAccountDeletion(requested, async body => {
          const { data, error } = await accountClient(scope, session).functions.invoke("delete-account", { body });
          if (error) {
            let code = "DELETION_UNAVAILABLE";
            if ("context" in error && error.context instanceof Response) {
              try { const payload = await error.context.json(); if (typeof payload.error === "string") code = payload.error; } catch {}
            }
            throw new Error(code);
          }
          return data;
        }, ensure, async value => {
          // Pin both the owner key and job ID; never persist a credential here.
          await AsyncStorage.setItem(key, JSON.stringify(value));
          ensure(); requested = value; setReceipt(value);
        }, async () => {
          clearSocialAccount(scope); ensure();
          await ride.stopAsync(); ensure();
          await rider.clearAccount(); ensure();
          await clearOnboardingAccount(scope); ensure();
          await clearRideAccount(scope); ensure();
          await clearGarageAccount(scope); ensure();
          clearRouteAccount(scope); ensure();
          await forgetLocalAccount(); ensure();
        });
      await AsyncStorage.removeItem(key);
      ensure();
      if (supabase) { const { error } = await supabase.auth.signOut({ scope: "local" }); if (error) throw error; }
      router.replace("/auth");
    } catch (error) {
      if (isAccountCurrent(scope) && requested.state === "requested" && error instanceof Error && error.message === "AUTH_REQUIRED") {
        // An expired/removed session is not proof of deletion. Hide the signed-out
        // owner's data, retaining its local photos/garage/draft and durable receipt.
        try {
          if (supabase) { const { error: signOutError } = await supabase.auth.signOut({ scope: "local" }); if (signOutError) throw signOutError; }
          router.replace({ pathname: "/auth", params: { deletion: "unconfirmed" } });
        } catch { if (isAccountCurrent(scope)) setMessage("errors.deletionAuth"); }
      } else if (isAccountCurrent(scope)) setMessage(requested.state === "deleted" ? "delete.cleanup" : errorKey(error, "deletion"));
    } finally { if (isAccountCurrent(scope)) setBusy(false); }
  }
  if (!session) return <Screen><Heading eyebrow="" title={t("delete.title")} /><Button label={t("common.signInOrCreate")} onPress={() => router.replace("/auth")} /></Screen>;
  return <Screen>
    <Heading eyebrow="" title={t("delete.title")} />
    <T muted>{t("delete.body")}</T>
    <Panel>
      {receipt ? <Note>{t(receipt.state === "deleted" ? "delete.cleanup" : "delete.pending")}</Note> : <Field label={t("delete.confirmLabel")} value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} editable={!busy && loaded} />}
      {message && <Note error>{t(message)}</Note>}
      {!loaded && <Button secondary label={t("delete.readRetry")} onPress={() => setReadVersion(value => value + 1)} />}
      <Button label={t(receipt ? "delete.retry" : "delete.confirmAction")} icon="trash-outline" busy={busy} disabled={!loaded || (!receipt && confirmation !== "DELETE")} onPress={removeAccount} />
    </Panel>
    <Button secondary label={t("delete.cancel")} disabled={busy || !!receipt} onPress={() => router.replace("/profile")} />
  </Screen>;
}
