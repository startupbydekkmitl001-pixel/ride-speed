import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useLayoutEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useMotionPlaybackLease } from "../features/motion";
import { useI18n } from "../lib/i18n";
import { useApp } from "../state/AppState";
import { useRiderProfile } from "../state/RiderProfile";
import { Icon, Row, T } from "./ui";

function PlayingMaterial({ dark, registerStop, playIfAllowed }: {
  dark: boolean;
  registerStop: (stop: () => void) => () => void;
  playIfAllowed: (play: () => void) => void;
}) {
  const [rendered, setRendered] = useState(false);
  const player = useVideoPlayer(
    dark
      ? require("../../assets/motion/card-loop-dark.mp4")
      : require("../../assets/motion/card-loop.mp4"),
    (p) => {
      p.loop = true;
      p.muted = true;
      p.audioMixingMode = "mixWithOthers";
    },
  );
  useLayoutEffect(() => {
    const unregister = registerStop(() => player.pause());
    return () => { player.pause(); unregister(); };
  }, [player, registerStop]);
  useEffect(() => {
    // Expo's web VideoView registers the video element in its passive effect.
    playIfAllowed(() => player.play());
  }, [player, playIfAllowed]);
  return (
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        playsInline
        onFirstFrameRender={() => setRendered(true)}
        style={[
          StyleSheet.absoluteFill,
          { width: "100%", height: "100%", opacity: rendered ? 1 : 0 },
        ]}
        accessible={false}
      />
  );
}

function Material({ dark, visible }: { dark: boolean; visible: boolean }) {
  const { canPlay, registerStop, playIfAllowed } = useMotionPlaybackLease(visible);
  const poster = dark ? require("../../assets/motion/card-loop-dark-poster.png") : require("../../assets/motion/card-loop-poster.png");
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Image source={poster} style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]} />
    {canPlay ? <PlayingMaterial dark={dark} registerStop={registerStop} playIfAllowed={playIfAllowed} /> : null}
  </View>;
}
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
        <Material
          key={dark ? "dark" : "light"}
          dark={dark}
          visible={visible}
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
