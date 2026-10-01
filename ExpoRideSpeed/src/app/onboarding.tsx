import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Field, Heading, Icon, Note, Panel, Row, Screen, Segments, T } from "../components/ui";
import { useOnboardingStatus } from "../features/onboarding";
import { onboardingSteps, validateRiderName, type OnboardingStep } from "../features/onboarding/model";
import { errorKey, useI18n, type TranslationKey } from "../lib/i18n";
import { useApp } from "../state/AppState";
import { accountRpc, isAccountCurrent, useAuth } from "../state/AuthState";
import { useRiderProfile } from "../state/RiderProfile";
import { MotionHero } from '../features/motion';

export default function OnboardingScreen() {
  const { scope } = useAuth();
  return <AccountOnboarding key={scope.generation} />;
}
function AccountOnboarding() {
  const { data, update, colors, ready, storageError } = useApp(), { scope, session } = useAuth();
  const status = useOnboardingStatus(), rider = useRiderProfile(), { t } = useI18n();
  const [nameDraft, setName] = useState<string | null>(null), [handleDraft, setHandle] = useState<string | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState<TranslationKey | null>(null);
  const name = nameDraft ?? (rider.displayName === "Rider" ? "" : rider.displayName), handle = handleDraft ?? rider.handle;
  const step = status.value.onboarding_step;
  const finish = () => {
    if (ready && isAccountCurrent(scope) && update({ welcomeDone: true })) router.replace("/");
  };
  useEffect(() => {
    if (ready && status.ready && status.complete && isAccountCurrent(scope) && update({ welcomeDone: true })) router.replace("/");
  }, [ready, status.ready, status.complete, scope, update]);
  async function advance(next: OnboardingStep) {
    if (busy || status.busy || !ready || storageError) return;
    setBusy(true); setMessage(null);
    try { await status.advance(next); if (next === "complete" && isAccountCurrent(scope)) finish(); }
    catch (error) { if (isAccountCurrent(scope)) setMessage(errorKey(error, "onboarding")); }
    finally { if (isAccountCurrent(scope)) setBusy(false); }
  }
  async function allowLocation() {
    if (busy || status.busy || storageError) return;
    setBusy(true); setMessage(null);
    try {
      // Permission only: no getCurrentPosition/watchPosition, no location transmission.
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!isAccountCurrent(scope)) return;
      await status.advance("profile", permission.granted ? "granted" : "denied");
      if (!permission.granted && isAccountCurrent(scope)) setMessage("onboard.locationDenied");
    } catch (error) { if (isAccountCurrent(scope)) setMessage(errorKey(error, "onboarding")); }
    finally { if (isAccountCurrent(scope)) setBusy(false); }
  }
  async function saveProfile() {
    if (busy || status.busy || !rider.ready || storageError) return;
    const valid = validateRiderName(name, handle);
    if (valid.error) { setMessage(valid.error === "name" ? "profile.nameValidation" : "profile.usernameValidation"); return; }
    setBusy(true); setMessage(null);
    try {
      if (session) await accountRpc(scope, session, "rs_upsert_profile", { p_handle: valid.handle, p_display_name: valid.displayName });
      if (!isAccountCurrent(scope)) return;
      await rider.save({ displayName: valid.displayName, handle: session ? valid.handle : "" });
      await status.advance("vehicle");
    } catch (error) { if (isAccountCurrent(scope)) setMessage(errorKey(error, "profile")); }
    finally { if (isAccountCurrent(scope)) setBusy(false); }
  }
  const locked = busy || status.busy || !status.ready || !ready || !!storageError;
  const index = Math.min(3, onboardingSteps.indexOf(step));
  const title: TranslationKey = step === "location" ? "onboard.locationTitle" : step === "profile" ? "onboard.profileTitle" : step === "vehicle" ? "onboard.vehicleTitle" : "onboard.languageTitle";
  const body: TranslationKey = step === "location" ? "onboard.locationBody" : step === "profile" ? "onboard.profileBody" : step === "vehicle" ? "onboard.vehicleBody" : "onboard.languageBody";
  return <Screen>
    <Row style={{ justifyContent: "space-between" }}>
      <T weight="semibold">Ride Speed</T>
      <T size={12} muted>{t("onboard.progress", { step: index + 1 })}</T>
    </Row>
    <Row>{[0, 1, 2, 3].map(item => <View key={item} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: item <= index ? colors.accent : colors.line }} />)}</Row>
    <MotionHero>
      <Icon name={step === "location" ? "navigate-outline" : step === "profile" ? "person-outline" : step === "vehicle" ? "key-outline" : "language-outline"} size={36} color={colors.accent} />
      <Heading eyebrow="" title={t(title)} />
      <T muted>{t(body)}</T>
    </MotionHero>
    {!status.ready && <Note>{t("onboard.loading")}</Note>}
    {step === "language" && <>
      <Segments items={[{ value: "system", label: t("profile.system") }, { value: "th", label: t("profile.languageThai") }, { value: "en", label: t("profile.languageEnglish") }]} value={data.language} onChange={language => { update({ language }); }} />
      <Button label={t("onboard.next")} onPress={() => { void advance("location"); }} busy={busy} disabled={locked} icon="arrow-forward" />
    </>}
    {step === "location" && <>
      <Button label={t("onboard.allowLocation")} icon="locate-outline" onPress={allowLocation} busy={busy} disabled={locked} />
      <Button secondary label={t("onboard.later")} onPress={() => { void advance("profile"); }} disabled={locked} />
      <Note>{t("onboard.locationSkipped")}</Note>
    </>}
    {step === "profile" && <>
      <Field label={t("profile.cardName")} value={name} onChangeText={setName} maxLength={40} editable={!locked} autoComplete="name" />
      <Field label={t("profile.friendUsername")} value={handle} onChangeText={setHandle} maxLength={24} editable={!locked} autoCapitalize="none" autoCorrect={false} placeholder={t("common.usernamePlaceholder")} />
      <Button label={t("onboard.next")} onPress={saveProfile} busy={busy} disabled={locked || !rider.ready} />
      <Button secondary label={t("onboard.later")} onPress={() => { void advance("vehicle"); }} disabled={locked} />
      <Note>{t("onboard.profileLater")}</Note>
    </>}
    {step === "vehicle" && <>
      <Panel><Icon name="add" size={32} color={colors.accent} /><T>{t("onboard.vehicleBody")}</T>
        {data.vehicles.length > 0 && <Note>{t("onboard.vehicleAdded", { count: data.vehicles.length })}</Note>}
        <Button secondary label={t("onboard.addVehicle")} icon="add" onPress={() => router.push("/vehicle-picker")} disabled={locked} />
      </Panel>
      <Button label={t("onboard.openMap")} icon="map-outline" onPress={() => { void advance("complete"); }} busy={busy} disabled={locked} />
    </>}
    {message && <Note error>{t(message)}</Note>}
    {status.error && <><Note error={status.error === "LOCAL_READ_FAILED"}>{t(status.error === "LOCAL_READ_FAILED" ? "errors.localRead" : "onboard.offline")}</Note><Button secondary small label={t("common.retry")} busy={status.busy} onPress={() => { void status.retry().catch(error => { if (isAccountCurrent(scope)) setMessage(errorKey(error, "onboarding")); }); }} /></>}
    {!session && <><Note>{t("onboard.signInHint")}</Note><Button secondary label={t("common.signInOrCreate")} onPress={() => router.push("/auth")} /></>}
  </Screen>;
}
