import { Image, StyleSheet, View } from "react-native";
import { AmbientLoop,resolveAmbientAsset } from "../features/motion";
import { useI18n } from "../lib/i18n";
import { useApp } from "../state/AppState";
import { useRiderProfile } from "../state/RiderProfile";
import { Icon, Row, T } from "./ui";

export function RiderCard({
  handle,
  visible = true,
}: {
  handle?: string;
  visible?: boolean;
}) {
  const { dark, colors, vehicle } = useApp();
  const { t } = useI18n();
  const data = useRiderProfile();
  return (
    <View
      style={{
        borderRadius: 28,
        padding: 6,
        borderColor: colors.line,
        borderWidth: 1,
        backgroundColor: colors.raised,
      }}
    >
      <View
        style={{
          borderRadius: 23,
          minHeight: 229,
          overflow: "hidden",
          padding: 22,
          gap: 26,
        }}
      >
        <AmbientLoop
          key={dark ? "dark" : "light"}
          asset={resolveAmbientAsset('profile-license',dark?'dark':'light')}
          visible={visible}
          style={StyleSheet.absoluteFill}
        />
        <Row style={{ justifyContent: "space-between" }}>
          <Row style={{ gap: 7 }}>
            <Icon name="navigate" size={16} />
            <T size={11} numeric weight="semibold">
              RIDE SPEED
            </T>
          </Row>
          <T size={10} muted>
            {t("card.label")}
          </T>
        </Row>
        <Row style={{ gap: 16 }}>
          <View
            style={{
              width: 63,
              height: 76,
              borderRadius: 13,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.raised,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {data.photoUri ? (
              <Image
                source={{ uri: data.photoUri }}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <T size={30} numeric>
                {data.displayName.slice(0, 1).toUpperCase()}
              </T>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <T numberOfLines={1} size={24} weight="semibold">
              {data.displayName}
            </T>
            <T numberOfLines={1} muted size={12}>
              {handle ? `@${handle}` : t("card.tagline")}
            </T>
          </View>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <T size={9} muted>
              {t("card.vehicle")}
            </T>
            <T size={12} weight="medium" numberOfLines={1}>
              {vehicle
                ? `${vehicle.brand} ${vehicle.model}`
                : t("card.addVehicle")}
            </T>
          </View>
          <Icon name="finger-print-outline" color={colors.muted} size={30} />
        </Row>
      </View>
    </View>
  );
}
