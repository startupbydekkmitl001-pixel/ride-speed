import { useIsFocused } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { AppState, Image, StyleSheet, View } from "react-native";
import { useApp } from "../state/AppState";
import { useRiderProfile } from "../state/RiderProfile";
import { Icon, Row, T } from "./ui";

function Material({ dark, play }: { dark: boolean; play: boolean }) {
  const [rendered, setRendered] = useState(false);
  const poster = dark
    ? require("../../assets/motion/card-loop-dark-poster.png")
    : require("../../assets/motion/card-loop-poster.png");
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
  useEffect(() => {
    if (play) player.play();
    else player.pause();
  }, [play, player]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={poster}
        style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
      />
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        onFirstFrameRender={() => setRendered(true)}
        style={[
          StyleSheet.absoluteFill,
          { width: "100%", height: "100%", opacity: rendered && play ? 1 : 0 },
        ]}
        accessible={false}
      />
    </View>
  );
}
export function RiderCard({
  handle,
  visible = true,
}: {
  handle?: string;
  visible?: boolean;
}) {
  const { dark, colors, motion, vehicle } = useApp();
  const data = useRiderProfile();
  const focused = useIsFocused(),
    [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const s = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => s.remove();
  }, []);
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
          play={motion && focused && foreground && visible}
        />
        <Row style={{ justifyContent: "space-between" }}>
          <Row style={{ gap: 7 }}>
            <Icon name="navigate" size={16} />
            <T size={11} numeric weight="semibold">
              RIDE SPEED
            </T>
          </Row>
          <T size={10} muted>
            RIDER CARD
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
              {handle ? `@${handle}` : "ออกแบบเส้นทางในแบบคุณ"}
            </T>
          </View>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <T size={9} muted>
              YOUR RIDE
            </T>
            <T size={12} weight="medium" numberOfLines={1}>
              {vehicle
                ? `${vehicle.brand} ${vehicle.model}`
                : "เพิ่มรถคันแรกของคุณ"}
            </T>
          </View>
          <Icon name="finger-print-outline" color={colors.muted} size={30} />
        </Row>
      </View>
    </View>
  );
}
