import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  T,
} from "../components/ui";
import {
  getBrands,
  getCatalogVehicle,
  getVehicleVariants,
  searchVehicles,
  VEHICLE_CATEGORIES,
  type VehicleCatalogEntry,
  type VehicleCategory,
  type VehiclePowertrain,
} from "../data/vehicleCatalog";
import type { GarageVehicle } from "../lib/domain";
import { errorKey, useI18n, type TranslationKey } from "../lib/i18n";
import { theme } from "../lib/theme";
import { useApp } from "../state/AppState";
import { isAccountCurrent, useAuth } from "../state/AuthState";
import { useGarage } from "../state/GarageState";
import { useRide } from "../state/RideState";
import { CategoryGlyph } from "../features/garage/CategoryGlyph";
import { GarageCard } from "../features/garage/GarageCard";
import { GarageWelcome } from "../features/garage/GarageWelcome";
import {
  blankVehicleDraft,
  buildGarageVehicle,
  draftFromCatalog,
  draftFromVehicle,
  vehicleDisplayName,
  vehicleMeasure,
  type VehicleDraft,
} from "../features/garage/model";

type Step = "garage" | "category" | "catalog" | "details" | "manual";
const powerChoices: (VehiclePowertrain | "unknown")[] = [
  "petrol",
  "diesel",
  "hybrid",
  "electric",
  "unknown",
];
const garageViewability = { itemVisiblePercentThreshold: 30 };
function garageError(error: unknown): TranslationKey {
  const code = error instanceof Error ? error.message : String(error ?? "");
  const keys: Record<string, TranslationKey> = {
    GARAGE_INVALID_VEHICLE: "m3.validation.name",
    GARAGE_INVALID: "m3.validation.name",
    GARAGE_CAP_REACHED: "m3.error.cap",
    GARAGE_TOO_LARGE: "m3.error.tooLarge",
    GARAGE_REVISION_CONFLICT: "m3.error.conflict",
    GARAGE_INVALID_RESPONSE: "m3.error.response",
    GARAGE_SYNC_INVALID_RESPONSE: "m3.error.response",
    GARAGE_NETWORK_FAILED: "m3.error.network",
    GARAGE_SYNC_UNAVAILABLE: "m3.error.network",
    GARAGE_PHOTO_UNAVAILABLE: "m3.error.photo",
    GARAGE_PHOTO_INVALID: "m3.error.photo",
    GARAGE_PHOTO_TARGET_CHANGED: "m3.error.photo",
    GARAGE_PHOTO_AUTH_REQUIRED: "m3.error.auth",
    GARAGE_VEHICLE_CHANGED: "m3.error.vehicleChanged",
    AUTH_REQUIRED: "m3.error.auth",
    PHOTO_PERMISSION: "m3.error.photoPermission",
    PHOTO_TOO_LARGE: "m3.error.photoTooLarge",
    PHOTO_FAILED: "m3.error.photo",
  };
  if (keys[code]) return keys[code];
  return [
    "ACCOUNT_CHANGED",
    "LOCAL_READ_FAILED",
    "LOCAL_WRITE_FAILED",
    "ACCOUNT_DELETION_PENDING",
  ].includes(code)
    ? errorKey(code, "storage")
    : "m3.actionFailed";
}
export default function GarageScreen({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const { scope } = useAuth();
  return <GarageContent key={scope.generation} embedded={embedded} />;
}
function GarageContent({ embedded }: { embedded: boolean }) {
  const { colors } = useApp(),
    { scope } = useAuth(),
    { t } = useI18n(),
    garage = useGarage(),
    ride = useRide(),
    inset = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("garage"),
    [category, setCategory] = useState<VehicleCategory>("scooter");
  const [query, setQuery] = useState(""),
    [brand, setBrand] = useState(""),
    [chosen, setChosen] = useState<VehicleCatalogEntry | null>(null);
  const [draft, setDraft] = useState<VehicleDraft>(
      blankVehicleDraft("scooter"),
    ),
    [editing, setEditing] = useState<GarageVehicle | undefined>();
  const [error, setError] = useState<TranslationKey | null>(null),
    [busy, setBusy] = useState(false),
    [personalize, setPersonalize] = useState(false),
    [photoAfterSave, setPhotoAfterSave] = useState(false),
    [removing, setRemoving] = useState<GarageVehicle | null>(null);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const lock = useRef(false),
    live = useRef(true),
    draftId = useRef<string | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const [viewability] = useState(
    () =>
      ({ viewableItems }: { viewableItems: ViewToken<GarageVehicle>[] }) =>
        setVisible(new Set(viewableItems.map((item) => item.item.id))),
  );
  const patch = (value: Partial<VehicleDraft>) => {
    setDraft((current) => ({ ...current, ...value }));
    setError(null);
  };
  const dismiss = () => {
    if (embedded) {
      setStep("garage");
      setEditing(undefined);
      setChosen(null);
    } else if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const back = () => {
    if (busy) return;
    setError(null);
    if (step === "garage") dismiss();
    else if (step === "category") setStep("garage");
    else if (step === "catalog") setStep("category");
    else if (editing) setStep("garage");
    else setStep("catalog");
  };
  const startAdd = () => {
    if (busy || ride.movingLocked) return;
    draftId.current = null;
    setEditing(undefined);
    setChosen(null);
    setDraft(blankVehicleDraft("scooter"));
    setPersonalize(false);
    setPhotoAfterSave(false);
    setError(null);
    setStep("category");
  };
  const chooseCategory = (value: VehicleCategory) => {
    setCategory(value);
    setBrand("");
    setQuery("");
    setStep("catalog");
  };
  const chooseModel = (entry: VehicleCatalogEntry) => {
    setChosen(entry);
    setCategory(entry.category);
    const selected = draftFromCatalog(entry);
    setDraft(
      editing
        ? {
            ...selected,
            nickname: draft.nickname,
            color: draft.color,
            year: draft.year,
          }
        : selected,
    );
    setError(null);
    setStep("details");
  };
  const manual = () => {
    setChosen(null);
    setDraft({ ...blankVehicleDraft(category), brand, model: query.trim() });
    setPersonalize(false);
    setStep("manual");
  };
  const edit = (vehicle: GarageVehicle) => {
    if (busy || ride.movingLocked) return;
    setEditing(vehicle);
    setDraft(draftFromVehicle(vehicle));
    setCategory(vehicle.category);
    setChosen(null);
    setPersonalize(true);
    setPhotoAfterSave(false);
    setError(null);
    setStep("details");
  };
  async function action(work: () => Promise<unknown>, onSuccess?: () => void) {
    if (lock.current || !garage.ready || ride.movingLocked) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const ok = await work();
      if (live.current && isAccountCurrent(scope)) {
        if (ok === false) setError("m3.actionFailed");
        else onSuccess?.();
      }
    } catch (cause) {
      if (live.current && isAccountCurrent(scope)) setError(garageError(cause));
    } finally {
      lock.current = false;
      if (live.current && isAccountCurrent(scope)) setBusy(false);
    }
  }
  function save() {
    draftId.current ??= randomUUID();
    const result = buildGarageVehicle(
      draft,
      editing?.id ?? draftId.current,
      new Date().getFullYear(),
      editing,
      garage.vehicles,
    );
    if (result.error) {
      setError(result.error);
      return;
    }
    const vehicle = result.vehicle!;
    void action(async () => {
      const saved = await garage.save(vehicle, { existingOnly: !!editing });
      if (!saved) return false;
      if (live.current && isAccountCurrent(scope)) setEditing(vehicle);
      if (photoAfterSave && isAccountCurrent(scope))
        await garage.choosePhoto(vehicle.id);
      return true;
    }, dismiss);
  }
  const measureText = (vehicle: Parameters<typeof vehicleMeasure>[0]) => {
    const measure = vehicleMeasure(vehicle);
    return measure.value === null
      ? t("m3.unknownSpec")
      : t(measure.unit === "kw" ? "m3.specKw" : "m3.specCc", {
          value: measure.value.toLocaleString("en-US", {
            maximumFractionDigits: 3,
          }),
        });
  };
  const authNotice =
    error === "m3.error.auth" ||
    (garage.error && garageError(garage.error) === "m3.error.auth") ? (
      <Button
        secondary
        small
        label={t("common.signInOrCreate")}
        disabled={busy}
        onPress={() => router.push("/auth")}
      />
    ) : null;
  const syncNotice = (
    <View style={{ gap: 10 }}>
      <Row>
        <Icon
          name={
            garage.status === "synced"
              ? "cloud-done-outline"
              : garage.status === "local"
                ? "phone-portrait-outline"
                : "cloud-outline"
          }
          size={16}
          color={colors.muted}
        />
        <T size={12} muted>
          {t(`m3.sync.${garage.status}`)}
        </T>
      </Row>
      {garage.error ? <Note error>{t(garageError(garage.error))}</Note> : null}
      {error ? <Note error>{t(error)}</Note> : null}
      {authNotice}
      {garage.status === "conflict" ? (
        <Panel>
          <T size={14}>{t("m3.conflictBody")}</T>
          <Button
            secondary
            label={t("m3.keepCloud")}
            disabled={busy}
            onPress={() => void action(() => garage.resolveConflict("cloud"))}
          />
          <Button
            secondary
            label={t("m3.keepLocal")}
            disabled={busy}
            onPress={() => void action(() => garage.resolveConflict("local"))}
          />
        </Panel>
      ) : garage.error ? (
        <Button
          secondary
          small
          label={t("m3.retry")}
          busy={busy}
          onPress={() => void action(() => garage.retry())}
        />
      ) : null}
    </View>
  );
  if (ride.movingLocked)
    return (
      <Screen>
        <Heading eyebrow={t("m3.eyebrow")} title={t("m3.movingTitle")} />
        <Note>{t("m3.movingBody")}</Note>
        <Button label={t("m3.openMap")} onPress={() => router.replace("/")} />
      </Screen>
    );
  if (!garage.ready)
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
        <T>{t("m3.loading")}</T>
        {syncNotice}
      </Screen>
    );
  const header = (title: string) => (
    <Row>
      <IconButton
        name="arrow-back-outline"
        label={t("m3.back")}
        onPress={back}
      />
      <View style={{ flex: 1 }}>
        <T size={12} muted>
          {t("m3.title")}
        </T>
        <T size={25} weight="semibold">
          {title}
        </T>
      </View>
    </Row>
  );
  if (step === "garage")
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <FlatList
          key="garage-vehicles"
          data={garage.vehicles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: inset.top + 18,
            paddingBottom: 124 + inset.bottom,
            gap: 20,
          }}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={viewability}
          viewabilityConfig={garageViewability}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: 20 }}>
              <Heading
                eyebrow={t("m3.eyebrow")}
                title={t("m3.title")}
                right={
                  garage.vehicles.length ? (
                    <IconButton
                      name="add-outline"
                      label={t("m3.add")}
                      onPress={startAdd}
                    />
                  ) : undefined
                }
              />
              {syncNotice}
              {garage.vehicles.length ? (
                <T muted size={13}>
                  {t("m3.count", { count: garage.vehicles.length })}
                </T>
              ) : null}
              {removing ? (
                <Panel>
                  <T weight="semibold" size={19}>
                    {t("m3.removeTitle", {
                      name: vehicleDisplayName(removing),
                    })}
                  </T>
                  <Note>{t("m3.removeBody")}</Note>
                  <Button
                    label={t("m3.confirmRemove")}
                    busy={busy}
                    onPress={() =>
                      void action(
                        () => garage.remove(removing.id),
                        () => setRemoving(null),
                      )
                    }
                  />
                  <Button
                    secondary
                    label={t("m3.cancel")}
                    disabled={busy}
                    onPress={() => setRemoving(null)}
                  />
                </Panel>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <GarageWelcome
              title={t("m3.emptyTitle")}
              body={t("m3.emptyBody")}
              label={t("m3.add")}
              onAdd={startAdd}
            />
          }
          renderItem={({ item }) => (
            <GarageCard
              vehicle={item}
              active={item.id === garage.activeId}
              visible={visible.has(item.id)}
              busy={busy}
              onSelect={() => void action(() => garage.select(item.id))}
              onEdit={() => edit(item)}
              onRemove={() => {
                if (!busy) setRemoving(item);
              }}
              onPhoto={() => void action(() => garage.choosePhoto(item.id))}
              getPhotoUrl={garage.getPhotoUrl}
              photoPreview={garage.photoPreview(item.id)}
            />
          )}
        />
      </View>
    );
  if (step === "category")
    return (
      <Screen>
        {header(t("m3.categoryTitle"))}
        <Note>{t("m3.categoryBody")}</Note>
        <View style={{ gap: 12 }}>
          {VEHICLE_CATEGORIES.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={t(item.labelKey)}
              onPress={() => chooseCategory(item.id)}
              style={({ pressed }) => ({
                minHeight: 112,
                borderRadius: theme.radius.card,
                padding: 20,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Row style={{ gap: 20 }}>
                <CategoryGlyph category={item.id} size={64} />
                <View style={{ flex: 1 }}>
                  <T size={22} weight="semibold">
                    {t(item.labelKey)}
                  </T>
                  <T size={12} muted>
                    {t(`m3.examples.${item.id}`)}
                  </T>
                </View>
                <Icon name="arrow-forward-outline" size={20} />
              </Row>
            </Pressable>
          ))}
        </View>
      </Screen>
    );
  if (step === "catalog") {
    const families = new Map<string, VehicleCatalogEntry>();
    for (const entry of searchVehicles(query, { category, brand }))
      if (!families.has(entry.familyId)) families.set(entry.familyId, entry);
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <FlatList
          key="garage-catalog"
          data={[...families.values()]}
          keyExtractor={(item) => item.familyId}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: inset.top + 18,
            paddingBottom: 124 + inset.bottom,
            gap: 10,
          }}
          ListHeaderComponent={
            <View style={{ gap: 18, paddingBottom: 12 }}>
              {header(t("m3.chooseModel"))}
              <Field
                label={t(`m3.category.${category}`)}
                value={query}
                onChangeText={setQuery}
                placeholder={t("m3.search")}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {["", ...getBrands(category)].map((item) => (
                  <Pressable
                    key={item || "all"}
                    accessibilityRole="button"
                    accessibilityState={{ selected: brand === item }}
                    onPress={() => setBrand(item)}
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: theme.radius.pill,
                      backgroundColor:
                        brand === item ? colors.ink : colors.raised,
                    }}
                  >
                    <T
                      size={13}
                      style={{ color: brand === item ? colors.bg : colors.ink }}
                    >
                      {item || t("m3.allBrands")}
                    </T>
                  </Pressable>
                ))}
              </ScrollView>
              <Button
                secondary
                small
                label={t("m3.custom")}
                icon="add-outline"
                onPress={manual}
              />
              <Note>{t("m3.catalogNote")}</Note>
            </View>
          }
          ListEmptyComponent={
            <Panel>
              <T size={20} weight="semibold">
                {t("m3.noMatches")}
              </T>
              <Note>{t("m3.noMatchesBody")}</Note>
            </Panel>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.brand} ${item.model} ${item.variant ?? ""}, ${measureText(item)}`}
              onPress={() => chooseModel(item)}
              style={({ pressed }) => ({
                minHeight: 96,
                padding: 18,
                borderRadius: theme.radius.control,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Row>
                <View style={{ flex: 1, gap: 2 }}>
                  <T muted size={12}>
                    {item.brand}
                  </T>
                  <T size={20} weight="semibold">
                    {item.model}
                  </T>
                  <T size={12} muted>
                    {item.variant ? `${item.variant} · ` : ""}
                    {measureText(item)}
                    {item.historicalEdition ? ` · ${t("m3.historical")}` : ""}
                  </T>
                  {!item.specVerified ? (
                    <T size={12} muted>
                      {t("m3.unverified")}
                    </T>
                  ) : null}
                </View>
                <Icon name="chevron-forward" size={20} />
              </Row>
            </Pressable>
          )}
        />
      </View>
    );
  }
  const custom = step === "manual" || (!!editing && !chosen);
  const source =
    chosen ??
    (draft.catalogId ? getCatalogVehicle(draft.catalogId) : undefined);
  const variants = chosen ? getVehicleVariants(chosen) : [];
  return (
    <Screen>
      {header(
        t(
          editing
            ? "m3.edit"
            : step === "manual"
              ? "m3.customTitle"
              : "m3.details",
        ),
      )}
      {step === "manual" || custom ? (
        <View style={{ gap: 16 }}>
          <Field
            label={t("m3.brand")}
            value={draft.brand}
            onChangeText={(value) => patch({ brand: value, catalogId: null })}
            placeholder={t("m3.brandPlaceholder")}
            maxLength={50}
            autoCorrect={false}
          />
          <Field
            label={t("m3.model")}
            value={draft.model}
            onChangeText={(value) => patch({ model: value, catalogId: null })}
            placeholder={t("m3.modelPlaceholder")}
            maxLength={70}
            autoCorrect={false}
          />
          <Field
            label={t("m3.variant")}
            value={draft.variant}
            onChangeText={(value) => patch({ variant: value, catalogId: null })}
            placeholder={t("m3.variantPlaceholder")}
            maxLength={70}
          />
          <T size={13} weight="medium">
            {t("m3.powertrain")}
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {powerChoices.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: (draft.powertrain ?? "unknown") === value,
                }}
                onPress={() =>
                  patch({
                    powertrain: value === "unknown" ? null : value,
                    catalogId: null,
                  })
                }
                style={{
                  minHeight: 44,
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  borderRadius: theme.radius.control,
                  backgroundColor:
                    (draft.powertrain ?? "unknown") === value
                      ? colors.ink
                      : colors.raised,
                }}
              >
                <T
                  size={13}
                  style={{
                    color:
                      (draft.powertrain ?? "unknown") === value
                        ? colors.bg
                        : colors.ink,
                  }}
                >
                  {t(`m3.power.${value}`)}
                </T>
              </Pressable>
            ))}
          </View>
          <Field
            label={t(draft.powertrain === "electric" ? "m3.kw" : "m3.cc")}
            value={
              draft.powertrain === "electric"
                ? draft.motorPowerKwInput
                : draft.engineCcInput
            }
            onChangeText={(value) =>
              patch(
                draft.powertrain === "electric"
                  ? { motorPowerKwInput: value, catalogId: null }
                  : { engineCcInput: value, catalogId: null },
              )
            }
            placeholder={t("m3.specPlaceholder")}
            keyboardType="decimal-pad"
            maxLength={12}
          />
          {draft.model.toLowerCase().replace(/\s/g, "") === "civicrs" ? (
            <Note>{t("m3.ambiguous")}</Note>
          ) : null}
        </View>
      ) : (
        <Panel>
          <CategoryGlyph category={draft.category} size={72} />
          <T muted size={13}>
            {draft.brand}
          </T>
          <T size={34} weight="semibold">
            {draft.model}
          </T>
          {draft.variant ? <T size={16}>{draft.variant}</T> : null}
          <T size={24} weight="medium">
            {measureText(chosen!)}
          </T>
          <Note>
            {t(chosen!.specVerified ? "m3.verified" : "m3.unverified")}
            {chosen!.modelYear
              ? ` · ${t("m3.referenceYear", { year: chosen!.modelYear })}`
              : ""}
          </Note>
        </Panel>
      )}
      {variants.length > 1 ? (
        <View style={{ gap: 8 }}>
          <T size={13} weight="medium">
            {t("m3.variants")}
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {variants.map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: chosen?.id === entry.id }}
                onPress={() => {
                  setChosen(entry);
                  setDraft((current) => ({
                    ...draftFromCatalog(entry),
                    nickname: current.nickname,
                    color: current.color,
                    year: current.year,
                  }));
                }}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: theme.radius.control,
                  backgroundColor:
                    chosen?.id === entry.id ? colors.ink : colors.raised,
                }}
              >
                <T
                  size={13}
                  style={{
                    color: chosen?.id === entry.id ? colors.bg : colors.ink,
                  }}
                >
                  {entry.variant ?? entry.model}
                </T>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {error ? <Note error>{t(error)}</Note> : null}
      {garage.error ? <Note error>{t(garageError(garage.error))}</Note> : null}
      {authNotice}
      <Button
        label={t(editing ? "m3.saveEdit" : "m3.save")}
        icon="checkmark-outline"
        busy={busy}
        onPress={save}
      />
      <Note>{t("m3.verifyNote")}</Note>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: personalize }}
        onPress={() => setPersonalize((value) => !value)}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <T size={15} weight="medium">
          {t("m3.optionalDetails")}
        </T>
        <Icon name={personalize ? "chevron-up" : "chevron-down"} size={19} />
      </Pressable>
      {personalize ? (
        <View style={{ gap: 18 }}>
          <Field
            label={t("m3.nickname")}
            value={draft.nickname}
            onChangeText={(value) => patch({ nickname: value })}
            placeholder={t("m3.nicknamePlaceholder")}
            maxLength={40}
          />
          <Field
            label={t("m3.year")}
            value={draft.year}
            onChangeText={(value) => patch({ year: value })}
            placeholder={t("m3.yearPlaceholder")}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Field
            label={t("m3.color")}
            value={draft.color}
            onChangeText={(value) => patch({ color: value })}
            placeholder={t("m3.colorPlaceholder")}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
          />
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            {theme.garageColors.map((color) => (
              <Pressable
                key={color.id}
                accessibilityRole="radio"
                accessibilityLabel={t(`m3.color.${color.id}`)}
                accessibilityState={{
                  checked: draft.color.toUpperCase() === color.value,
                }}
                onPress={() => patch({ color: color.value })}
                style={{
                  width: 44,
                  height: 44,
                  padding: 5,
                  borderRadius: 22,
                  borderWidth: 2,
                  borderColor:
                    draft.color.toUpperCase() === color.value
                      ? colors.accent
                      : colors.line,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: 18,
                    backgroundColor: color.value,
                    borderWidth: 1,
                    borderColor: colors.line,
                  }}
                />
              </Pressable>
            ))}
          </View>
          <Button
            secondary
            small
            label={t("m3.clearColor")}
            onPress={() => patch({ color: "" })}
          />
          <Button
            secondary
            label={t(photoAfterSave ? "m3.photoQueued" : "m3.photoAfterSave")}
            icon="camera-outline"
            onPress={() => setPhotoAfterSave((value) => !value)}
          />
          <Note>{t(scope.userId ? "m3.photoNote" : "m3.photoSignIn")}</Note>
        </View>
      ) : null}
      <Button
        secondary
        small
        label={t("m3.changeModel")}
        onPress={() => {
          setBrand("");
          setQuery("");
          setStep("catalog");
        }}
      />
      {source ? (
        <Button
          secondary
          small
          label={t("m3.source")}
          icon="open-outline"
          onPress={() =>
            void Linking.openURL(source.sourceUrl).catch(() =>
              setError("m3.actionFailed"),
            )
          }
        />
      ) : null}
    </Screen>
  );
}
