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
import { errorKey, useI18n, type TranslationKey } from "../../lib/i18n";
import { useApp } from "../../state/AppState";

const publicRegistrationAvailable =
  publicService.publicEmailRegistration && publicService.publicEmailDelivery;

export default function AuthScreen() {
  const { data, update } = useApp();
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [pending, setPending] = useState<"google" | "email" | null>(null),
    [message, setMessage] = useState<TranslationKey | null>(null),
    [failed, setFailed] = useState(false);
  const busy = pending !== null;
  async function google() {
    if (!supabase || busy) return;
    setPending("google");
    setMessage(null);
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
      setMessage(errorKey(e, "google", publicService));
    } finally {
      setPending(null);
    }
  }
  async function submit() {
    if (!supabase || busy) return;
    if (mode === "signup" && !publicRegistrationAvailable) {
      setFailed(true);
      setMessage("auth.registrationUnavailable");
      return;
    }
    if (mode === "signup" && password.length < 10) {
      setFailed(true);
      setMessage("auth.passwordTooShort");
      return;
    }
    setPending("email");
    setMessage(null);
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
            ? "auth.resetRequested"
            : "auth.resetRequestedTeam",
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
        else setMessage("auth.verifyEmail");
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
      setMessage(errorKey(e, mode, publicService));
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
            ? t("auth.signUpEmail")
            : mode === "reset"
              ? t("auth.resetPassword")
              : t("auth.account")
        }
        right={
          <IconButton
            name="close"
            label={t("common.close")}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/")
            }
          />
        }
      />
      <T muted>{t("auth.googleIntro")}</T>
      <Button
        label={t("auth.googleContinue")}
        icon="logo-google"
        onPress={google}
        busy={pending === "google"}
        disabled={!configured || pending === "email"}
      />
      {!publicRegistrationAvailable && (
        <Note>{t("auth.googleRegistration")}</Note>
      )}
      {publicRegistrationAvailable ? (
        <Segments
          items={[
            { value: "login", label: t("auth.login") },
            { value: "signup", label: t("auth.createAccount") },
          ]}
          value={mode === "reset" ? "login" : mode}
          onChange={(v) => {
            if (busy) return;
            setMode(v);
            setMessage(null);
            setFailed(false);
          }}
        />
      ) : (
        <T size={20} weight="semibold">
          {t(mode === "reset" ? "auth.recoverEmail" : "auth.existingEmail")}
        </T>
      )}
      {mode === "reset" && !publicService.publicEmailDelivery && (
        <Note>{t("auth.resetTeamNotice")}</Note>
      )}
      <View style={{ gap: 18 }}>
        <Field
          label={t("auth.email")}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          placeholder={t("common.emailPlaceholder")}
          editable={!busy}
        />
        {mode !== "reset" && (
          <Field
            label={t("auth.password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            placeholder={
              t(mode === "signup" ? "auth.passwordMinimum" : "auth.passwordPlaceholder")
            }
          />
        )}
      </View>
      {message ? <Note error={failed}>{t(message)}</Note> : null}
      {!configured && (
        <Panel>
          <T weight="semibold">{t("auth.connecting")}</T>
          <Note>{t("auth.localAvailable")}</Note>
        </Panel>
      )}
      <Button
        secondary
        label={
          mode === "signup"
            ? t("auth.createAccount")
            : mode === "reset"
              ? t("auth.requestReset")
              : t("auth.loginEmail")
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
          label={t("auth.forgotPassword")}
          disabled={busy}
          onPress={() => {
            setMode("reset");
            setMessage(null);
            setFailed(false);
          }}
        />
      )}
      {mode === "reset" && (
        <Button
          secondary
          small
          label={t("auth.backToEmail")}
          disabled={busy}
          onPress={() => {
            setMode("login");
            setMessage(null);
            setFailed(false);
          }}
        />
      )}
      <Note>{t("auth.privacy")}</Note>
    </Screen>
  );
}
