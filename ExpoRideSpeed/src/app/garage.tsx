import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import {
  Button,
  Empty,
  Field,
  Glass,
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
  searchVehicles,
  USER_GARAGE_SUGGESTIONS,
  VEHICLE_CATEGORIES,
  type VehicleCatalogEntry,
  type VehicleCategory,
  type VehiclePowertrain,
} from "../data/vehicleCatalog";
import { uid, type GarageVehicle } from "../lib/domain";
import { useApp } from "../state/AppState";

type Step = "garage" | "category" | "catalog" | "details" | "manual";
type PowerChoice = VehiclePowertrain | "unknown";
const powerChoices: { value: PowerChoice; label: string }[] = [
  { value: "petrol", label: "เบนซิน" },
  { value: "hybrid", label: "ไฮบริด" },
  { value: "electric", label: "ไฟฟ้า" },
  { value: "unknown", label: "ยังไม่ระบุ" },
];

function ccLabel(cc: number | null, powertrain?: VehiclePowertrain | null) {
  if (powertrain === "electric") return "ไฟฟ้า";
  return cc === null
    ? "ยังไม่ระบุซีซี"
    : `${cc.toLocaleString("en-US", { maximumFractionDigits: 3 })} ซีซี`;
}

function CategoryGlyph({
  category,
  small = false,
}: {
  category: VehicleCategory;
  small?: boolean;
}) {
  const { colors } = useApp();
  return (
    <View
      accessible={false}
      style={{
        width: small ? 48 : 64,
        height: small ? 48 : 64,
        borderRadius: small ? 17 : 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.raised,
      }}
    >
      <Svg
        width={small ? 36 : 49}
        height={small ? 28 : 38}
        viewBox="0 0 72 48"
        fill="none"
        stroke={colors.ink}
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Circle cx={15} cy={35} r={7} />
        <Circle cx={57} cy={35} r={7} />
        {category === "car" ? (
          <>
            <Path d="M8 35H4V26L11 22L19 12H43L54 22L66 25V35H64M22 35H50M13 22H53M24 12L22 22M39 12L43 22" />
            <Path d="M7 27H14M61 27H66" stroke={colors.accent} />
          </>
        ) : category === "bigbike" ? (
          <>
            <Path d="M15 35L29 19L41 21L32 35H15M32 35H41L49 26M57 35L44 11H51M29 19H21L16 16H9M29 19L31 13H40L47 23M38 27L45 29" />
            <Path d="M31 13H40L44 19H29" stroke={colors.accent} />
          </>
        ) : (
          <>
            <Path d="M15 35H33C39 35 41 30 42 25L45 13H51M57 35L48 16M15 28L20 20H31L34 29H43M20 20H17M18 18H34M46 12H42" />
            <Path d="M20 23H29L31 29H18" stroke={colors.accent} />
          </>
        )}
      </Svg>
    </View>
  );
}

export default function GarageScreen() {
  const state = useApp(),
    { colors, data } = state,
    insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("garage");
  const [category, setCategory] = useState<VehicleCategory>("scooter");
  const [brandFilter, setBrandFilter] = useState("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<VehicleCatalogEntry | null>(null);
  const [year, setYear] = useState("");
  const [manualBrand, setManualBrand] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualVariant, setManualVariant] = useState("");
  const [manualCc, setManualCc] = useState("");
  const [manualPower, setManualPower] = useState<PowerChoice>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const goBack = () => {
    setError(null);
    if (step === "garage") dismiss();
    else if (step === "category") setStep("garage");
    else if (step === "catalog") setStep("category");
    else setStep("catalog");
  };
  const startAdd = () => {
    setError(null);
    setChosen(null);
    setStep("category");
  };
  const chooseCategory = (value: VehicleCategory) => {
    setCategory(value);
    setBrandFilter("");
    setQuery("");
    setError(null);
    setStep("catalog");
  };
  const chooseModel = (entry: VehicleCatalogEntry) => {
    setCategory(entry.category);
    setChosen(entry);
    setYear(entry.modelYear ?? "");
    setError(null);
    setStep("details");
  };
  const startManual = (preset?: {
    brand: string;
    model: string;
    category: VehicleCategory;
  }) => {
    setManualBrand(preset?.brand ?? brandFilter);
    setManualModel(preset?.model ?? query.trim());
    setManualVariant("");
    setManualCc("");
    setManualPower("unknown");
    setYear("");
    setChosen(null);
    if (preset) {
      setCategory(preset.category);
      setBrandFilter(preset.brand);
      setQuery("");
    }
    setError(null);
    setStep("manual");
  };

  function saveVehicle() {
    if (saveLock.current || !state.ready) return;
    const enteredYear = year.trim();
    if (
      enteredYear &&
      (!/^\d{4}$/.test(enteredYear) ||
        !(
          (Number(enteredYear) >= 1900 &&
            Number(enteredYear) <= new Date().getFullYear() + 1) ||
          (Number(enteredYear) >= 2443 &&
            Number(enteredYear) <= new Date().getFullYear() + 544)
        ))
    ) {
      setError("ระบุปี 4 หลักเป็น ค.ศ. หรือ พ.ศ. หรือเว้นว่างไว้");
      return;
    }
    const manual = step === "manual";
    if (!manual && !chosen) return;
    if (manual && (!manualBrand.trim() || !manualModel.trim())) {
      setError("กรอกยี่ห้อและชื่อรุ่นก่อนเพิ่มรถ");
      return;
    }
    const rawCc = manualCc.trim();
    const enteredCc = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?$/.test(rawCc)
      ? rawCc.replace(/,/g, "")
      : rawCc;
    if (
      manual &&
      manualPower !== "electric" &&
      enteredCc &&
      (!/^\d+(?:\.\d{1,3})?$/.test(enteredCc) ||
        !Number.isFinite(Number(enteredCc)) ||
        Number(enteredCc) <= 0)
    ) {
      setError(
        "ซีซีต้องเป็นตัวเลขมากกว่า 0 เช่น 156.9 หรือเว้นว่างถ้ายังไม่ทราบ",
      );
      return;
    }
    const vehicle: GarageVehicle = {
      id: uid(),
      catalogId: manual ? null : chosen!.id,
      category,
      brand: manual ? manualBrand.trim() : chosen!.brand,
      model: manual ? manualModel.trim() : chosen!.model,
      variant: manual ? manualVariant.trim() || undefined : chosen!.variant,
      engineCc: manual
        ? manualPower === "electric" || !enteredCc
          ? null
          : Number(enteredCc)
        : chosen!.engineCc,
      powertrain: manual
        ? manualPower === "unknown"
          ? null
          : manualPower
        : chosen!.powertrain,
      year: enteredYear,
    };
    saveLock.current = true;
    setSaving(true);
    setError(null);
    state.update({
      vehicles: [...data.vehicles, vehicle],
      selectedVehicleId: vehicle.id,
    });
    dismiss();
  }

  const title =
    step === "garage"
      ? "รถของคุณ"
      : step === "category"
        ? "เพิ่มรถ"
        : step === "catalog"
          ? "เลือกรุ่นรถ"
          : step === "manual"
            ? "เพิ่มรุ่นของคุณ"
            : "รายละเอียดรถ";
  const header = (
    <Row style={{ justifyContent: "space-between" }}>
      <IconButton
        name={step === "garage" ? "close-outline" : "arrow-back-outline"}
        label={step === "garage" ? "ปิดโรงรถ" : "ย้อนกลับ"}
        onPress={goBack}
      />
      <T
        size={23}
        weight="semibold"
        accessibilityRole="header"
        style={{ flex: 1 }}
      >
        {title}
      </T>
      {step === "garage" && data.vehicles.length > 0 ? (
        <IconButton name="add-outline" label="เพิ่มรถ" onPress={startAdd} />
      ) : null}
    </Row>
  );

  if (step === "catalog") {
    const results = searchVehicles(query, { category, brand: brandFilter });
    return (
      <Screen scroll={false} style={{ flex: 1, paddingBottom: 0, gap: 18 }}>
        {header}
        <Field
          label="ค้นหายี่ห้อหรือรุ่น"
          value={query}
          onChangeText={setQuery}
          placeholder={
            category === "car"
              ? "เช่น Civic, Model 3"
              : category === "bigbike"
                ? "เช่น S1000RR, R3"
                : "เช่น PCX160, NMAX"
          }
          autoCorrect={false}
          maxLength={80}
          returnKeyType="search"
        />
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            {["", ...getBrands(category)].map((brand) => (
              <Pressable
                key={brand || "all"}
                accessibilityRole="button"
                accessibilityLabel={brand || "ทุกยี่ห้อ"}
                accessibilityState={{ selected: brandFilter === brand }}
                onPress={() => setBrandFilter(brand)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 17,
                  paddingVertical: 10,
                  borderRadius: 22,
                  backgroundColor:
                    brandFilter === brand ? colors.ink : colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <T
                  size={13}
                  weight="medium"
                  style={{
                    color: brandFilter === brand ? colors.bg : colors.ink,
                  }}
                >
                  {brand || "ทุกยี่ห้อ"}
                </T>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <Row style={{ justifyContent: "space-between" }}>
          <T size={12} muted>
            รุ่นที่คัดสรร · เพิ่มรุ่นอื่นเองได้
          </T>
          <T size={12} muted>
            {results.length} รุ่น
          </T>
        </Row>
        <FlatList
          data={results}
          keyExtractor={(entry) => entry.id}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <Panel>
              <T weight="medium">ไม่พบรุ่นที่ค้นหา</T>
              <T size={14} muted>
                ลองเปลี่ยนยี่ห้อหรือคำค้น หรือเพิ่มรายละเอียดรถด้วยตัวเอง
              </T>
            </Panel>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.brand} ${item.model} ${item.variant ?? ""} ${item.modelYear ?? ""} ${ccLabel(item.engineCc, item.powertrain)}`}
              onPress={() => chooseModel(item)}
              style={({ pressed }) => ({
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderColor: colors.line,
                paddingVertical: 18,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Row>
                <View style={{ flex: 1, gap: 3 }}>
                  <T size={12} muted>
                    {item.brand}
                    {item.modelYear ? ` · ${item.modelYear}` : ""}
                  </T>
                  <T size={18} weight="medium">
                    {item.model}
                  </T>
                  {item.variant ? (
                    <T size={13} muted>
                      {item.variant}
                    </T>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <T size={13} weight="medium">
                    {ccLabel(item.engineCc, item.powertrain)}
                  </T>
                  <Icon
                    name="arrow-forward-outline"
                    size={16}
                    color={colors.muted}
                  />
                </View>
              </Row>
            </Pressable>
          )}
          ListFooterComponent={
            <View style={{ paddingTop: 24 }}>
              <Button
                label="ไม่พบรุ่นของคุณ? เพิ่มเอง"
                icon="add-outline"
                secondary
                onPress={() => startManual()}
              />
            </View>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen style={{ gap: 24 }}>
      {header}
      {state.storageError ? <Note error>{state.storageError}</Note> : null}
      {step === "garage" ? (
        <>
          {data.vehicles.length === 0 ? (
            <Empty
              icon="car-sport-outline"
              title="เริ่มด้วยรถคันแรก"
              body="เลือกรถที่คุณใช้ เพื่อให้หน้าปัดเป็นของคุณ"
            >
              <Button
                label="เพิ่มรถ"
                icon="add-outline"
                onPress={startAdd}
                style={{ alignSelf: "stretch", marginTop: 6 }}
              />
            </Empty>
          ) : (
            <View style={{ gap: 12 }}>
              {data.vehicles.map((vehicle) => {
                const selected = vehicle.id === data.selectedVehicleId;
                const entry = vehicle.catalogId
                  ? getCatalogVehicle(vehicle.catalogId)
                  : undefined;
                return (
                  <Pressable
                    key={vehicle.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`เลือก ${vehicle.brand} ${vehicle.model}`}
                    onPress={() => {
                      state.update({ selectedVehicleId: vehicle.id });
                      dismiss();
                    }}
                    style={({ pressed }) => ({
                      borderRadius: 26,
                      borderWidth: selected ? 1.5 : 1,
                      borderColor: selected ? colors.accent : colors.line,
                      padding: 18,
                      backgroundColor: colors.surface,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Row>
                      <CategoryGlyph category={vehicle.category} small />
                      <View style={{ flex: 1, gap: 2 }}>
                        <T size={12} muted>
                          {vehicle.brand}
                        </T>
                        <T size={18} weight="medium">
                          {vehicle.model}
                        </T>
                        {vehicle.variant ? (
                          <T size={13} muted>
                            {vehicle.variant}
                          </T>
                        ) : null}
                        <T size={12} muted>
                          {ccLabel(
                            vehicle.engineCc,
                            vehicle.powertrain ?? entry?.powertrain,
                          )}
                          {vehicle.year ? ` · ${vehicle.year}` : ""}
                        </T>
                      </View>
                      {selected ? (
                        <Icon
                          name="checkmark-circle"
                          color={colors.accent}
                          size={24}
                        />
                      ) : (
                        <Icon
                          name="chevron-forward-outline"
                          size={19}
                          color={colors.muted}
                        />
                      )}
                    </Row>
                  </Pressable>
                );
              })}
              <T size={13} muted>
                แตะรถเพื่อใช้กับหน้าปัด
              </T>
            </View>
          )}
          <View style={{ gap: 12 }}>
            <T size={15} weight="medium">
              รุ่นที่คุณเคยบอกไว้
            </T>
            <Glass style={{ padding: 18, gap: 0 }}>
              {USER_GARAGE_SUGGESTIONS.map((suggestion, index) => (
                <Pressable
                  key={suggestion.label}
                  accessibilityRole="button"
                  accessibilityLabel={`เพิ่ม ${suggestion.label}`}
                  onPress={() => {
                    const entry = suggestion.catalogId
                      ? getCatalogVehicle(suggestion.catalogId)
                      : undefined;
                    if (entry) chooseModel(entry);
                    else
                      startManual({
                        brand: "Honda",
                        model: "Civic RS",
                        category: "car",
                      });
                  }}
                  style={({ pressed }) => ({
                    minHeight: 65,
                    paddingVertical: 12,
                    borderTopWidth: index ? StyleSheet.hairlineWidth : 0,
                    borderColor: colors.line,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Row>
                    <View style={{ flex: 1 }}>
                      <T size={16} weight="medium">
                        {suggestion.label}
                      </T>
                      <T size={12} muted>
                        {suggestion.needsVariantConfirmation
                          ? "ระบุเครื่องยนต์และปีรถของคุณ"
                          : ccLabel(suggestion.engineCc)}
                      </T>
                    </View>
                    <Icon name="add-outline" size={21} color={colors.accent} />
                  </Row>
                </Pressable>
              ))}
            </Glass>
          </View>
        </>
      ) : null}

      {step === "category" ? (
        <View style={{ gap: 14 }}>
          <T size={15} muted>
            คุณใช้รถแบบไหน?
          </T>
          {VEHICLE_CATEGORIES.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => chooseCategory(item.id)}
              style={({ pressed }) => ({
                borderRadius: 28,
                padding: 22,
                backgroundColor: colors.surface,
                borderColor: colors.line,
                borderWidth: 1,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Row style={{ gap: 18 }}>
                <CategoryGlyph category={item.id} />
                <View style={{ flex: 1 }}>
                  <T size={20} weight="medium">
                    {item.label}
                  </T>
                  <T size={12} muted>
                    {item.id === "scooter"
                      ? "PCX160 · NMAX · Vespa"
                      : item.id === "bigbike"
                        ? "S 1000 RR · R3 · Monster"
                        : "Civic · Camry · Model 3"}
                  </T>
                </View>
                <Icon name="arrow-forward-outline" size={20} />
              </Row>
            </Pressable>
          ))}
        </View>
      ) : null}

      {step === "details" && chosen ? (
        <>
          <Glass style={{ padding: 26, gap: 18 }}>
            <CategoryGlyph category={chosen.category} />
            <View style={{ gap: 4 }}>
              <T size={13} muted>
                {chosen.brand}
              </T>
              <T size={32} weight="semibold">
                {chosen.model}
              </T>
              {chosen.variant ? <T size={17}>{chosen.variant}</T> : null}
            </View>
            <View
              style={{
                paddingTop: 18,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderColor: colors.line,
              }}
            >
              <T size={23} weight="medium">
                {ccLabel(chosen.engineCc, chosen.powertrain)}
              </T>
              <T size={13} muted>
                {
                  powerChoices.find(
                    (power) => power.value === chosen.powertrain,
                  )?.label
                }
                {chosen.modelYear ? ` · ข้อมูลรุ่นปี ${chosen.modelYear}` : ""}
              </T>
            </View>
          </Glass>
          <Field
            label="ปีรถของคุณ (ไม่บังคับ)"
            value={year}
            onChangeText={setYear}
            placeholder="ค.ศ. หรือ พ.ศ. เช่น 2025 หรือ 2568"
            keyboardType="number-pad"
            maxLength={4}
          />
          <Note>ตรวจสอบว่ารุ่นเครื่องยนต์ตรงกับรถของคุณก่อนเพิ่ม</Note>
          {error ? <Note error>{error}</Note> : null}
          <Button
            label="เพิ่มและใช้รถคันนี้"
            icon="checkmark-outline"
            onPress={saveVehicle}
            busy={saving}
          />
        </>
      ) : null}

      {step === "manual" ? (
        <>
          <View style={{ gap: 18 }}>
            <T size={14} muted>
              {VEHICLE_CATEGORIES.find((item) => item.id === category)?.label} ·
              กรอกเท่าที่ทราบ
            </T>
            <Field
              label="ยี่ห้อ"
              value={manualBrand}
              onChangeText={setManualBrand}
              placeholder="เช่น Honda"
              maxLength={50}
              autoCorrect={false}
            />
            <Field
              label="ชื่อรุ่น"
              value={manualModel}
              onChangeText={setManualModel}
              placeholder="เช่น Civic RS"
              maxLength={70}
              autoCorrect={false}
            />
            <Field
              label="รุ่นย่อย / เครื่องยนต์ (ไม่บังคับ)"
              value={manualVariant}
              onChangeText={setManualVariant}
              placeholder="เช่น Turbo หรือ e:HEV"
              maxLength={70}
              autoCorrect={false}
            />
            <View style={{ gap: 9 }}>
              <T size={13} weight="medium">
                ระบบขับเคลื่อน
              </T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {powerChoices.map((power) => (
                  <Pressable
                    key={power.value}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: manualPower === power.value,
                    }}
                    onPress={() => {
                      setManualPower(power.value);
                      setError(null);
                    }}
                    style={({ pressed }) => ({
                      minHeight: 46,
                      paddingHorizontal: 18,
                      paddingVertical: 11,
                      borderRadius: 16,
                      backgroundColor:
                        manualPower === power.value
                          ? colors.ink
                          : colors.surface,
                      borderWidth: 1,
                      borderColor: colors.line,
                      opacity: pressed ? 0.65 : 1,
                    })}
                  >
                    <T
                      size={14}
                      style={{
                        color:
                          manualPower === power.value ? colors.bg : colors.ink,
                      }}
                    >
                      {power.label}
                    </T>
                  </Pressable>
                ))}
              </View>
            </View>
            {manualPower === "electric" ? (
              <Panel>
                <Row>
                  <Icon name="flash-outline" color={colors.accent} />
                  <T size={14}>รถไฟฟ้าไม่ต้องระบุซีซี</T>
                </Row>
              </Panel>
            ) : (
              <Field
                label="ความจุเครื่องยนต์ ซีซี (ไม่บังคับ)"
                value={manualCc}
                onChangeText={setManualCc}
                placeholder="เช่น 156.9 · เว้นว่างถ้ายังไม่ทราบ"
                keyboardType="decimal-pad"
                maxLength={12}
              />
            )}
            <Field
              label="ปีรถของคุณ (ไม่บังคับ)"
              value={year}
              onChangeText={setYear}
              placeholder="ค.ศ. หรือ พ.ศ. เช่น 2025 หรือ 2568"
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          {error ? <Note error>{error}</Note> : null}
          <Button
            label="เพิ่มและใช้รถคันนี้"
            icon="checkmark-outline"
            onPress={saveVehicle}
            busy={saving}
          />
        </>
      ) : null}
    </Screen>
  );
}
