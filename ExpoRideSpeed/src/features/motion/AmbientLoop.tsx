import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { memo, useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ambientAssets, type AmbientAsset } from "./assets";
import { useMotionPlaybackLease } from "./MotionProvider";
import {theme} from '../../lib/theme';

export type AmbientLoopProps = {
  asset: AmbientAsset;
  /** Set false for off-screen list cards. Tab focus alone does not detect scroll. */
  visible?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Decorative background only; keep all text, photos and controls native above it. */
export const AmbientLoop = memo(function AmbientLoop({
  asset,
  visible = true,
  style,
}: AmbientLoopProps) {
  const [failedAsset, setFailedAsset] = useState<AmbientAsset | null>(null);
  const lease = useMotionPlaybackLease(visible && failedAsset !== asset);
  const fail = useCallback(() => setFailedAsset(asset), [asset]);
  const sources = ambientAssets[asset];
  return (
    <View
      style={[styles.material, {backgroundColor:asset.endsWith('-light')?theme.light.bg:theme.dark.bg}, style]}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={sources.poster}
        resizeMode="cover"
        style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
        accessible={false}
      />
      {lease.canPlay ? (
        <PlayingMaterial
          key={asset}
          source={sources.video}
          poster={sources.poster}
          lease={lease}
          onFailure={fail}
        />
      ) : null}
    </View>
  );
});

type Lease = ReturnType<typeof useMotionPlaybackLease>;
function PlayingMaterial({
  source,
  poster,
  lease,
  onFailure,
}: {
  source: number;
  poster: number;
  lease: Lease;
  onFailure: () => void;
}) {
  const [firstFrame, setFirstFrame] = useState(false);
  const player = useVideoPlayer(source, (video) => {
    video.loop = true;
    video.muted = true;
    video.volume = 0;
    video.audioMixingMode = "mixWithOthers";
    video.staysActiveInBackground = false;
    video.allowsExternalPlayback = false;
  });
  const { registerStop, playIfAllowed } = lease;
  useLayoutEffect(() => {
    const pause = () => player.pause();
    const detach = registerStop(pause);
    return () => {
      // Pause before useVideoPlayer disposes its native shared object.
      pause();
      detach();
    };
  }, [player, registerStop]);
  useEffect(() => {
    // SDK 57's web VideoView attaches its element in a child passive effect.
    // A layout-effect play has no mounted element and loses its play intent.
    playIfAllowed(() => player.play());
  }, [playIfAllowed, player]);
  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "error") onFailure();
  });
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
        contentFit="cover"
        // Required for clipped/overlapping cover videos on Android (SDK 57).
        surfaceType="textureView"
        nativeControls={false}
        fullscreenOptions={{ enable: false }}
        allowsPictureInPicture={false}
        startsPictureInPictureAutomatically={false}
        playsInline
        onFirstFrameRender={() => setFirstFrame(true)}
        accessible={false}
      />
      {!firstFrame ? (
        <Image
          source={poster}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  material: { overflow: "hidden" },
});
