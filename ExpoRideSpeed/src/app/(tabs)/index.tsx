import { useKeepAwake } from "expo-keep-awake";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import {
  Button,
  Glass,
  Heading,
  Icon,
  IconButton,
  Note,
  Panel,
  Row,
  Screen,
  T,
} from "../../components/ui";
import { useApp } from "../../state/AppState";
import { useRideSession } from "../../useRideSession";
import { RideControls } from "../../components/RideControls";
import { errorKey, useI18n } from "../../lib/i18n";
function Awake() {
  useKeepAwake();
  return null;
}
function Dial({ value }: { value: number | null }) {
  const { colors } = useApp();
  const { t } = useI18n();
  const progress = Math.min(Math.max(value ?? 0, 0) / 240, 1);
  return (
    <View
      style={{
        width: "100%",
        height: 236,
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      <Svg
        width="100%"
        height="220"
        viewBox="0 0 340 220"
        style={{ position: "absolute", top: 0 }}
      >
        <Path
          d="M 26 187 A 149 149 0 1 1 314 187"
          fill="none"
          stroke={colors.line}
          strokeWidth="1"
        />
        {Array.from({ length: 49 }, (_, i) => {
          const a = ((166 + (i * 208) / 48) * Math.PI) / 180;
          const r = i % 4 === 0 ? 136 : 143;
          return (
            <Line
              key={i}
              x1={170 + r * Math.cos(a)}
              y1={160 + r * Math.sin(a)}
              x2={170 + 148 * Math.cos(a)}
              y2={160 + 148 * Math.sin(a)}
              stroke={
                i <= progress * 48 && value !== null
                  ? colors.accent
                  : colors.line
              }
              strokeWidth={i % 4 === 0 ? 2 : 1}
            />
          );
        })}
        <Circle cx="26" cy="187" r="4" fill={colors.accent} />
        <Circle cx="314" cy="187" r="3" fill={colors.line} />
      </Svg>
      <T size={104} numeric weight="medium" style={{ lineHeight: 123 }}>
        {value === null ? "—" : Math.round(value)}
      </T>
      <T size={12} muted style={{ marginBottom: 27 }}>
        {t("speed.current")}
      </T>
    </View>
  );
}
export default function SpeedScreen() {
  const app = useApp(),
    { data, colors, update, vehicle } = app;
  const { t } = useI18n();
  const ride = useRideSession();
  const params = useLocalSearchParams<{ challengeId?: string | string[] }>();
  const challengeId =
    typeof params.challengeId === "string" ? params.challengeId : undefined;
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!ride.active) return;
    const start = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [ride.active]);
  if (!data.welcomeDone)
    return (
      <Screen style={{ paddingTop: 80, gap: 30 }}>
        <Row>
          <Icon name="navigate" color={colors.accent} />
          <T numeric size={16} weight="semibold">
            ride speed
          </T>
        </Row>
        <View style={{ marginTop: 34 }}>
          <T size={42} weight="semibold">
            {t("onboarding.title")}
          </T>
          <T muted size={16} style={{ marginTop: 20 }}>
            {t("onboarding.body")}
          </T>
        </View>
        <Panel style={{ marginTop: 24 }}>
          <Row>
            <Icon name="map-outline" color={colors.accent} />
            <View style={{ flex: 1 }}>
              <T weight="semibold">{t("onboarding.routeTitle")}</T>
              <T size={13} muted>
                {t("onboarding.routeBody")}
              </T>
            </View>
          </Row>
          <Row>
            <Icon name="people-outline" color={colors.accent} />
            <View style={{ flex: 1 }}>
              <T weight="semibold">{t("onboarding.friendTitle")}</T>
              <T size={13} muted>
                {t("onboarding.friendBody")}
              </T>
            </View>
          </Row>
        </Panel>
        <Button
          label={t("onboarding.signIn")}
          onPress={() => router.push("/auth")}
          icon="arrow-forward"
        />
        <Button
          secondary
          label={t("onboarding.tryFirst")}
          onPress={() => {
            update({ welcomeDone: true });
            router.push("/garage");
          }}
        />
        <Note>{t("onboarding.locationNote")}</Note>
      </Screen>
    );
  const multiplier = data.unit === "kmh" ? 3.6 : 2.236936;
  const value =
    ride.snapshot.liveMps === null ? null : ride.snapshot.liveMps * multiplier;
  const maximum =
    ride.snapshot.maxMps === null
      ? "—"
      : Math.round(ride.snapshot.maxMps * multiplier).toString();
  const signal = !ride.active
    ? t("speed.ready")
    : ride.snapshot.quality === "good"
      ? value === null
        ? t("speed.confirming")
        : t("speed.gpsReady")
      : ride.snapshot.quality === "weak"
        ? t("speed.weak")
        : t("speed.searching");
  return (
    <Screen style={{ gap: 22 }}>
      {ride.active && <Awake />}
      <Heading
        eyebrow={t("speed.eyebrow")}
        title={t("speed.title")}
        right={
          <IconButton
            name={app.dark ? "sunny-outline" : "moon-outline"}
            label={t("speed.changeTheme")}
            onPress={() => update({ theme: app.dark ? "light" : "dark" })}
          />
        }
      />
      <Row style={{ justifyContent: "space-between" }}>
        <Row>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor:
                ride.active && ride.snapshot.quality === "good"
                  ? colors.good
                  : colors.muted,
            }}
          />
          <T size={12} muted>
            {signal}
          </T>
        </Row>
        <T size={12} muted>
          {vehicle ? `${vehicle.brand} ${vehicle.model}` : t("speed.noVehicle")}
        </T>
      </Row>
      <View>
        <Dial value={value === null ? null : value} />
        <Row style={{ justifyContent: "center", marginTop: -12 }}>
          <Glass style={{ flexDirection: "row", padding: 4 }}>
            <Button
              small
              secondary={data.unit !== "kmh"}
              label={t("common.kmh")}
              onPress={() => update({ unit: "kmh" })}
            />
            <Button
              small
              secondary={data.unit !== "mph"}
              label={t("common.mph")}
              onPress={() => update({ unit: "mph" })}
            />
          </Glass>
        </Row>
      </View>
      <Row
        style={{
          borderTopColor: colors.line,
          borderTopWidth: 1,
          borderBottomColor: colors.line,
          borderBottomWidth: 1,
          paddingVertical: 22,
        }}
      >
        <View style={{ flex: 1 }}>
          <T numeric size={29}>
            {maximum}
          </T>
          <T muted size={12}>
            {t("speed.filteredMax")}
          </T>
        </View>
        <View style={{ width: 1, height: 42, backgroundColor: colors.line }} />
        <View style={{ flex: 1, paddingLeft: 20 }}>
          <T numeric size={29}>
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </T>
          <T muted size={12}>
            {t("speed.sessionTime")}
          </T>
        </View>
      </Row>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <T weight="medium">
            {data.routes.at(-1)?.name || t("speed.nextRoute")}
          </T>
          <T size={12} muted>
            {data.routes.length
              ? t("speed.latestRoute")
              : t("speed.pinRoute")}
          </T>
        </View>
        <IconButton
          name="arrow-forward"
          label={t("speed.openMap")}
          onPress={() => router.push("/routes")}
        />
      </Row>
      {!!ride.message && <Note>{t(errorKey(ride.message, "ride"))}</Note>}
      <RideControls
        ride={ride}
        challengeId={challengeId}
        onSessionStart={() => setSeconds(0)}
      />
      {ride.permissionState === "denied" ||
      ride.permissionState === "preciseRequired" ? (
        <Button
          secondary
          small
          label={t("speed.locationSettings")}
          onPress={() => void Linking.openSettings()}
        />
      ) : ride.snapshot.maxMps !== null ? (
        <Button
          secondary
          small
          label={t("speed.resetMax")}
          onPress={ride.resetMax}
        />
      ) : null}
      <Note>{t("speed.recordingNote")}</Note>
    </Screen>
  );
}
