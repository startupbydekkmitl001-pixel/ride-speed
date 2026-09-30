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
import { supabase } from "../../lib/supabase";
import { useApp } from "../../state/AppState";
import { accountRpc, isAccountCurrent, useAuth } from "../../state/AuthState";
import { useRiderProfile } from "../../state/RiderProfile";
import { useOnline } from "../../state/OnlineState";
import { errorKey, useI18n, type TranslationKey, type TranslationValues } from "../../lib/i18n";
export default function ProfileScreen() {
  const { scope } = useAuth();
  // Reset only the profile form on account change; never remount navigation.
  return <AccountProfile key={scope.generation} />;
}
function AccountProfile() {
  const { data, update, colors, vehicle, storageError } = useApp(),
    { session, scope } = useAuth();
  const rider = useRiderProfile(),
    online = useOnline();
  const { t } = useI18n();
  const [name, setName] = useState(rider.displayName),
    [handle, setHandle] = useState(""),
    [message, setMessage] = useState<{ key: TranslationKey; values?: TranslationValues } | null>(null),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false);
  const [cardVisible, setCardVisible] = useState(true);
  const [formLoaded, setFormLoaded] = useState(!session);
  useFocusEffect(
    useCallback(() => {
      if (editing) return;
      let alive = true;
      if (session && supabase)
        void supabase
          .from("rs_profiles")
          .select("handle,display_name")
          .eq("user_id", session.user.id)
          .setHeader("Authorization", `Bearer ${session.access_token}`)
          .maybeSingle()
          .then(({ data: profile, error }) => {
            if (alive && isAccountCurrent(scope)) {
              if (profile) {
                setName(profile.display_name);
                setHandle(profile.handle);
              } else setHandle("");
              setFormLoaded(true);
              if (error) setMessage({ key: "errors.profileLoad" });
            }
          });
      return () => {
        alive = false;
      };
    }, [session, scope, editing]),
  );
  function toggleEdit() {
    if (!rider.ready || !formLoaded || busy) return;
    if (!editing) setName(rider.displayName);
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
      await rider.save({ displayName: name.trim() });
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
    try {
      const selected = await pickPicture(true);
      if (selected && isAccountCurrent(scope)) {
        await rider.save({ photoUri: selected.uri });
        if (isAccountCurrent(scope))
          setMessage({ key: "profile.photoSaved" });
      }
    } catch (e) {
      if (isAccountCurrent(scope))
        setMessage({ key: errorKey(e, "photo") });
    }
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
        <RiderCard handle={handle} visible={cardVisible} />
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
      {!!rider.error && <Note error>{t(errorKey(rider.error, "profile"))}</Note>}
      {!!storageError && <Note error>{t(errorKey(storageError, "storage"))}</Note>}
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
            onPress={() => update({ selectedVehicleId: v.id })}
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
            onValueChange={(reduceMotion) => update({ reduceMotion })}
            trackColor={{ true: colors.accent }}
          />
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <T style={{ flexShrink: 1 }}>{t("profile.reduceTransparency")}</T>
          <Switch
            accessibilityLabel={t("profile.reduceTransparency")}
            value={data.reduceGlass}
            onValueChange={(reduceGlass) => update({ reduceGlass })}
            trackColor={{ true: colors.accent }}
          />
        </Row>
      </Panel>
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
