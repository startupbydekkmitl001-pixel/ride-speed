import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Switch, View } from "react-native";
import { RiderCard } from "../../components/RiderCard";
import {
  Button,
  Field,
  Heading,
  Icon,
  IconButton,
  Note,
  Panel,
  Row,
  Screen,
  Segments,
  T,
} from "../../components/ui";
import { pickPicture } from "../../lib/photos";
import { useOnboardingStatus } from "../../features/onboarding";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../state/AppState";
import { accountRpc, isAccountCurrent, useAuth } from "../../state/AuthState";
import { useRiderProfile } from "../../state/RiderProfile";
import { useGarage } from "../../state/GarageState";
import { useOnline } from "../../state/OnlineState";
import { errorKey, useI18n, type TranslationKey, type TranslationValues } from "../../lib/i18n";
export default function ProfileScreen() {
  const { scope } = useAuth();
  // Reset only the profile form on account change; never remount navigation.
  return <AccountProfile key={scope.generation} />;
}
function AccountProfile() {
  const garage=useGarage();
  const { data, update, colors, vehicle, storageError, guestAvailable, importGuest } = useApp(),
    { session, scope } = useAuth();
  const rider = useRiderProfile(),
    online = useOnline(), account = useOnboardingStatus();
  const { t } = useI18n();
  const [name, setName] = useState(rider.displayName),
    [handle, setHandle] = useState(rider.handle),
    [message, setMessage] = useState<{ key: TranslationKey; values?: TranslationValues } | null>(null),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false);
  const [cardVisible, setCardVisible] = useState(true);
  const [privacyDraft, setPrivacyDraft] = useState<{ revision: number; ghost: boolean; audience: "friends" | "private" } | null>(null);
  const ghost = privacyDraft?.revision === account.value.revision ? privacyDraft.ghost : account.value.preferences.ghost_mode;
  const audience = privacyDraft?.revision === account.value.revision ? privacyDraft.audience : account.value.preferences.route_audience;
  const setGhost = (value: boolean) => setPrivacyDraft({ revision: account.value.revision, ghost: value, audience });
  const setAudience = (value: "friends" | "private") => setPrivacyDraft({ revision: account.value.revision, ghost, audience: value });
  const formLoaded = rider.ready;
  const reloadProfile = rider.reload;
  const refreshAccount = account.refresh;
  useFocusEffect(
    useCallback(() => {
      if (!editing) { reloadProfile(); if (session) void refreshAccount().catch(() => {}); }
    }, [editing, reloadProfile, refreshAccount, session]),
  );
  function toggleEdit() {
    if (!rider.ready || !formLoaded || busy) return;
    if (!editing) { setName(rider.displayName); setHandle(rider.handle); }
    setEditing(!editing);
  }
  async function saveProfile() {
    if (busy || !rider.ready || !isAccountCurrent(scope)) return;
    if (!name.trim() || name.trim().length > 40) {
      setMessage({ key: "profile.nameValidation" });
      return;
    }
    if (session && !/^[a-z0-9_]{3,24}$/.test(handle.trim().toLowerCase())) {
      setMessage({ key: "profile.usernameValidation" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (session) {
        await accountRpc(scope, session, "rs_upsert_profile", {
          p_handle: handle.trim().toLowerCase(),
          p_display_name: name.trim(),
        });
        await online.refresh();
      }
      if (!isAccountCurrent(scope)) return;
      await rider.save({ displayName: name.trim(), handle: session ? handle.trim().toLowerCase() : "" });
      if (!isAccountCurrent(scope)) return;
      setEditing(false);
      setMessage({ key: "profile.savedAs", values: { name: name.trim() } });
    } catch (e) {
      if (isAccountCurrent(scope))
        setMessage({ key: errorKey(e, "profile") });
    } finally {
      if (isAccountCurrent(scope)) setBusy(false);
    }
  }
  async function photo() {
    if (busy || !rider.ready || !isAccountCurrent(scope)) return;
    setBusy(true); setMessage(null);
    try {
      const selected = await pickPicture(true);
      if (selected && isAccountCurrent(scope)) {
        const result = await rider.uploadPhoto(selected);
        if (isAccountCurrent(scope))
          setMessage({ key: result === "synced" ? "profile.photoSynced" : session ? "profile.photoLocal" : "profile.photoGuest" });
      }
    } catch (e) {
      if (isAccountCurrent(scope))
        setMessage({ key: errorKey(e, "photo") });
    } finally { if (isAccountCurrent(scope)) setBusy(false); }
  }
  async function retryPhoto() {
    if (busy || !session || !isAccountCurrent(scope)) return;
    setBusy(true); setMessage(null);
    try { await rider.retryPhoto(); if (isAccountCurrent(scope)) setMessage({ key: "profile.photoSynced" }); }
    catch (error) { if (isAccountCurrent(scope)) setMessage({ key: errorKey(error, "avatar") }); }
    finally { if (isAccountCurrent(scope)) setBusy(false); }
  }
  async function importData() {
    if (busy || !session || !isAccountCurrent(scope)) return;
    setBusy(true); setMessage(null);
    try { await importGuest(); if (isAccountCurrent(scope)) setMessage({ key: "profile.importDone" }); }
    catch (error) { if (isAccountCurrent(scope)) setMessage({ key: errorKey(error, "storage") }); }
    finally { if (isAccountCurrent(scope)) setBusy(false); }
  }
  async function savePrivacy() {
    if (busy || !session || !account.ready || !isAccountCurrent(scope)) return;
    setBusy(true); setMessage(null);
    try {
      if (ghost !== account.value.preferences.ghost_mode) await online.setPresence(!ghost);
      if (!isAccountCurrent(scope)) return;
      await account.setPreferences({ route_audience: audience });
      if (!isAccountCurrent(scope)) return;
      await online.refresh();
      if (isAccountCurrent(scope)) setMessage({ key: "profile.privacySaved" });
    } catch (error) { if (isAccountCurrent(scope)) setMessage({ key: errorKey(error, "onboarding") }); }
    finally { if (isAccountCurrent(scope)) setBusy(false); }
  }
  async function logout() {
    if (!supabase || busy || !isAccountCurrent(scope)) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error && isAccountCurrent(scope)) setMessage({ key: errorKey(error, "logout") });
    } catch {
      if (isAccountCurrent(scope))
        setMessage({ key: "errors.signOut" });
    } finally {
      if (isAccountCurrent(scope)) setBusy(false);
    }
  }
  return (
    <Screen onScroll={(y) => setCardVisible(y < 400)}>
      <Heading
        eyebrow={t("profile.eyebrow")}
        title={t("profile.title")}
        right={
          <IconButton
            name="create-outline"
            label={t("profile.edit")}
            onPress={toggleEdit}
          />
        }
      />
      <View>
        <RiderCard handle={rider.handle} visible={cardVisible} />
      </View>
      <Row>
        <Button
          secondary
          small
          icon="image-outline"
          label={t("profile.changePhoto")}
          disabled={!rider.ready || busy}
          onPress={photo}
          style={{ flex: 1 }}
        />
        <Button
          secondary
          small
          icon="create-outline"
          label={t("profile.editCard")}
          disabled={!rider.ready || !formLoaded || busy}
          onPress={toggleEdit}
          style={{ flex: 1 }}
        />
      </Row>
      <Note>{t("profile.cardNote")}</Note>
      {session && <Note>{t("profile.photoPrivacy")}</Note>}
      {session && rider.pendingAvatar && <Button secondary small label={t("profile.photoRetry")} onPress={retryPhoto} busy={busy} disabled={!rider.ready} />}
      {editing && (
        <Panel>
          <Field
            label={t("profile.cardName")}
            value={name}
            onChangeText={setName}
            maxLength={40}
          />
          {session && (
            <Field
              label={t("profile.friendUsername")}
              value={handle}
              onChangeText={setHandle}
              placeholder={t("common.usernamePlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
            />
          )}
          <Button
            label={t("profile.save")}
            disabled={!rider.ready}
            onPress={saveProfile}
            busy={busy}
          />
        </Panel>
      )}
      {message ? <Note>{t(message.key, message.values)}</Note> : null}
      {!!rider.error && <><Note error>{t(errorKey(rider.error, "profile"))}</Note><Button secondary small label={t("common.retry")} onPress={reloadProfile} disabled={busy} /></>}
      {!!storageError && <Note error>{t(errorKey(storageError, "storage"))}</Note>}
      {session && guestAvailable && <Panel>
        <T size={18} weight="semibold">{t("profile.importTitle")}</T>
        <T muted>{t("profile.importBody")}</T>
        <Button secondary label={t("profile.importAction")} busy={busy} disabled={!!storageError} onPress={importData} />
      </Panel>}
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <T size={22} weight="semibold">
            {t("nav.garage")}
          </T>
          <T size={12} muted>
            {t("profile.garageCount", { count: data.vehicles.length })}
          </T>
        </View>
        <IconButton
          name="add"
          label={t("profile.addVehicle")}
          onPress={() => router.push("/garage")}
        />
      </Row>
      {data.vehicles.length ? (
        data.vehicles.map((v) => (
          <Button
            key={v.id}
            secondary={vehicle?.id !== v.id}
            label={`${v.brand} ${v.model}${v.engineCc !== null ? ` · ${v.engineCc} ${t("common.cc")}` : v.powertrain === "electric" ? ` · ${t("common.ev")}` : ""}`}
            icon={v.category === "car" ? "car-outline" : "bicycle-outline"}
            onPress={() => { void garage.select(v.id); }}
          />
        ))
      ) : (
        <Panel>
          <T muted>{t("profile.firstVehicleBody")}</T>
          <Button
            label={t("profile.firstVehicle")}
            icon="add"
            onPress={() => router.push("/garage")}
          />
        </Panel>
      )}
      <Panel>
        <T size={18} weight="semibold">
          {t("profile.language")}
        </T>
        <Segments
          items={[
            { value: "system", label: t("profile.system") },
            { value: "th", label: t("profile.languageThai") },
            { value: "en", label: t("profile.languageEnglish") },
          ]}
          value={data.language}
          onChange={(language) => update({ language })}
        />
        <Note>{t("profile.languageHint")}</Note>
      </Panel>
      <Panel>
        <T size={18} weight="semibold">
          {t("profile.units")}
        </T>
        <Segments
          items={[
            { value: "kmh", label: t("common.kmh") },
            { value: "mph", label: t("common.mph") },
          ]}
          value={data.unit}
          onChange={(unit) => update({ unit })}
        />
      </Panel>
      <Panel>
        <T size={18} weight="semibold">
          {t("profile.appearance")}
        </T>
        <Segments
          items={[
            { value: "light", label: t("profile.themeLight") },
            { value: "dark", label: t("profile.themeDark") },
            { value: "system", label: t("profile.system") },
          ]}
          value={data.theme}
          onChange={(theme) => update({ theme })}
        />
        <Row style={{ justifyContent: "space-between" }}>
          <T style={{ flexShrink: 1 }}>{t("profile.reduceMotion")}</T>
          <Switch
            accessibilityLabel={t("profile.reduceMotion")}
            value={data.reduceMotion}
            onValueChange={(reduceMotion) => { update({ reduceMotion }); }}
            trackColor={{ true: colors.accent }}
          />
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <T style={{ flexShrink: 1 }}>{t("profile.reduceTransparency")}</T>
          <Switch
            accessibilityLabel={t("profile.reduceTransparency")}
            value={data.reduceGlass}
            onValueChange={(reduceGlass) => { update({ reduceGlass }); }}
            trackColor={{ true: colors.accent }}
          />
        </Row>
      </Panel>
      {session && <Panel>
        <T size={18} weight="semibold">{t("profile.privacySettings")}</T>
        {!account.ready && <Note>{t("onboard.loading")}</Note>}
        <Row style={{ justifyContent: "space-between" }}>
          <T style={{ flexShrink: 1 }}>{t("profile.ghostMode")}</T>
          <Switch accessibilityLabel={t("profile.ghostMode")} value={ghost} disabled={busy || account.busy || !account.ready} onValueChange={setGhost} trackColor={{ true: colors.accent }} />
        </Row>
        <Note>{t("profile.ghostHint")}</Note>
        <T weight="medium">{t("profile.routeAudience")}</T>
        <Segments items={[{ value: "friends", label: t("profile.friendsOnly") }, { value: "private", label: t("profile.privateOnly") }]} value={audience} onChange={setAudience} />
        {account.error && <Note error>{t("profile.privacyPending")}</Note>}
        <Button secondary label={t("profile.privacySave")} disabled={!account.ready || account.busy} busy={busy} onPress={savePrivacy} />
      </Panel>}
      <Button secondary label={t("profile.legal")} icon="document-text-outline" onPress={() => router.push("/auth/legal")} />
      {session ? (
        <Panel>
          <Row>
            <Icon name="checkmark-circle-outline" color={colors.good} />
            <View style={{ flex: 1 }}>
              <T weight="medium">{t("profile.accountConnected")}</T>
              <T muted size={12}>
                {session.user.email}
              </T>
            </View>
          </Row>
          <Button secondary label={t("profile.signOut")} busy={busy} onPress={logout} />
          <Button secondary label={t("profile.deleteAccount")} icon="trash-outline" disabled={busy} onPress={() => router.push("/auth/delete-account")} />
        </Panel>
      ) : (
        <Button
          label={t("common.signInOrCreate")}
          icon="person-outline"
          onPress={() => router.push("/auth")}
        />
      )}
    </Screen>
  );
}
