import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Button, Icon, IconButton, Row, T } from "../../components/ui";
import type { GarageVehicle } from "../../lib/domain";
import { useI18n } from "../../lib/i18n";
import { theme } from "../../lib/theme";
import { useApp } from "../../state/AppState";
import { useAuth } from "../../state/AuthState";
import { AmbientLoop,resolveAmbientAsset } from "../motion";
import { CategoryGlyph } from "./CategoryGlyph";
import { vehicleDisplayName, vehicleMeasure } from "./model";

function PhotoUnavailable({ onReload }: { onReload: () => void }) {
  const { t } = useI18n();
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: theme.dark.bg,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 20,
        },
      ]}
    >
      <T size={14} style={{ color: theme.dark.muted }}>
        {t("m3.photoUnavailable")}
      </T>
      <Button secondary small label={t("m3.photoRetry")} onPress={onReload} />
    </View>
  );
}
/** An old Image event belongs to this keyed child, never the next photo's state. */
function VehiclePhoto({
  url,
  onReload,
}: {
  url: string;
  onReload: () => void;
}) {
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image
        key={attempt}
        source={{ uri: url, cache: attempt ? "reload" : "default" }}
        resizeMode="cover"
        onError={() => setFailed(true)}
        style={StyleSheet.absoluteFill}
      />
      {failed ? (
        <PhotoUnavailable
          onReload={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
            onReload();
          }}
        />
      ) : null}
    </View>
  );
}

export function GarageCard({
  vehicle,
  active,
  visible,
  busy,
  onSelect,
  onEdit,
  onRemove,
  onPhoto,
  getPhotoUrl,
  photoPreview,
}: {
  vehicle: GarageVehicle;
  active: boolean;
  visible: boolean;
  busy: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onPhoto: () => void;
  getPhotoUrl: (path: string) => Promise<string | null>;
  photoPreview?: string | null;
}) {
  const { colors,dark } = useApp(),
    { scope } = useAuth(),
    { t } = useI18n();
  const [photo, setPhoto] = useState<{
    path: string;
    url: string;
    scope: unknown;
  } | null>(null);
  const [photoFailure, setPhotoFailure] = useState<{
    scope: unknown;
    path: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    if (vehicle.photoPath && visible)
      void getPhotoUrl(vehicle.photoPath)
        .then((url) => {
          if (live) {
            if (url) {
              setPhoto({ path: vehicle.photoPath!, url, scope });
              setPhotoFailure(null);
            } else setPhotoFailure({ path: vehicle.photoPath!, scope });
          }
        })
        .catch(() => {
          if (live) setPhotoFailure({ path: vehicle.photoPath!, scope });
        });
    return () => {
      live = false;
    };
  }, [getPhotoUrl, scope, vehicle.photoPath, visible, retry]);
  const url =
    photoPreview ??
    (photo?.scope === scope && photo?.path === vehicle.photoPath
      ? photo.url
      : null);
  const measure = vehicleMeasure(vehicle),
    amount =
      measure.value === null
        ? t("m3.unknownSpec")
        : t(measure.unit === "kw" ? "m3.specKw" : "m3.specCc", {
            value: measure.value.toLocaleString("en-US", {
              maximumFractionDigits: 3,
            }),
          });
  const failedRead =
    photoFailure?.scope === scope && photoFailure?.path === vehicle.photoPath;
  const reloadPhoto = () => setRetry((value) => value + 1);
  const material=url?theme.dark:colors;
  return (
    <View
      style={{
        borderRadius: theme.radius.card,
        overflow: "hidden",
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.line,
      }}
    >
      <View
        style={{
          height: 180,
          backgroundColor: material.bg,
          overflow: "hidden",
        }}
      >
        {url ? (
          <VehiclePhoto
            key={`${scope.generation}:${url}`}
            url={url}
            onReload={reloadPhoto}
          />
        ) : (
          <AmbientLoop
            asset={resolveAmbientAsset(vehicle.category==='scooter'?'garage-scooter':vehicle.category==='bigbike'?'garage-bigbike':'garage-car',dark?'dark':'light')}
            visible={visible && active && !failedRead}
            style={StyleSheet.absoluteFill}
          />
        )}
        {!url && !failedRead ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <CategoryGlyph
              category={vehicle.category}
              size={144}
              color={material.ink}
            />
          </View>
        ) : null}
        {!url && failedRead ? (
          <PhotoUnavailable onReload={reloadPhoto} />
        ) : null}
        <View
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            right: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View
            style={{
              borderRadius: theme.radius.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: material.glassScrim,
              borderWidth: 1,
              borderColor: material.line,
            }}
          >
            <T size={12} style={{ color: material.ink }}>
              {t(`m3.category.${vehicle.category}`)}
            </T>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("m3.photo")}
            disabled={busy}
            onPress={onPhoto}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: material.glassScrim,
              borderWidth: 1,
              borderColor: material.line,
            }}
          >
            <Icon name="camera-outline" size={21} color={material.ink} />
          </Pressable>
        </View>
      </View>
      <View style={{ padding: 20, gap: 14 }}>
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 3 }}>
            <T size={12} muted>
              {vehicle.brand}
              {vehicle.year ? ` · ${vehicle.year}` : ""}
            </T>
            <T size={24} weight="semibold">
              {vehicleDisplayName(vehicle)}
            </T>
            {vehicle.nickname ? (
              <T size={13} muted>
                {vehicle.model}
              </T>
            ) : null}
            {vehicle.variant ? (
              <T size={13} muted>
                {vehicle.variant}
              </T>
            ) : null}
          </View>
          {vehicle.color ? (
            <View
              accessibilityLabel={vehicle.color}
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: vehicle.color,
                borderWidth: 1,
                borderColor: colors.line,
                marginTop: 7,
              }}
            />
          ) : null}
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <T size={18} weight="medium">
            {amount}
          </T>
          {active ? (
            <Row style={{ gap: 5 }}>
              <Icon name="checkmark-circle" size={16} color={colors.good} />
              <T size={12} style={{ color: colors.good }}>
                {t("m3.active")}
              </T>
            </Row>
          ) : null}
        </Row>
        <Row>
          <Button
            label={t(active ? "m3.active" : "m3.select")}
            onPress={onSelect}
            disabled={busy || active}
            secondary={!active}
            small
            style={{ flex: 1 }}
          />
          <IconButton
            name="create-outline"
            label={t("m3.edit")}
            onPress={onEdit}
          />
          <IconButton
            name="trash-outline"
            label={t("m3.remove")}
            onPress={onRemove}
          />
        </Row>
      </View>
    </View>
  );
}
