import { useIsFocused } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Icon, T } from "../../components/ui";
import { theme } from "../../lib/theme";
import { useApp } from "../../state/AppState";
import { AmbientLoop } from "../motion";

export function GarageWelcome({
  title,
  body,
  label,
  onAdd,
}: {
  title: string;
  body: string;
  label: string;
  onAdd: () => void;
}) {
  const { colors, motion } = useApp();
  // This material is always black, including on light pages and its still poster.
  const material = theme.dark;
  const focused = useIsFocused();
  const glow = useSharedValue(1);
  const scale = useSharedValue(1);
  useEffect(() => {
    glow.set(
      motion && focused
        ? withRepeat(
            withTiming(0.4, {
              duration: 2200,
              reduceMotion: ReduceMotion.System,
            }),
            -1,
            true,
            undefined,
            ReduceMotion.System,
          )
        : 1,
    );
    return () => cancelAnimation(glow);
  }, [focused, glow, motion]);
  const halo = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const touch = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));
  return (
    <View
      style={{
        minHeight: 330,
        borderRadius: theme.radius.card,
        overflow: "hidden",
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <AmbientLoop
        asset="garage-scooter"
        visible={focused}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ padding: 28, gap: 16, alignItems: "center" }}>
        <Animated.View style={touch}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onAdd}
            onPressIn={() =>
              scale.set(
                withTiming(0.94, {
                  duration: motion ? theme.motion.pressMs : 0,
                  reduceMotion: ReduceMotion.System,
                }),
              )
            }
            onPressOut={() =>
              scale.set(
                motion
                  ? withSpring(1, {
                      ...theme.motion.spring,
                      reduceMotion: ReduceMotion.System,
                    })
                  : 1,
              )
            }
            style={({ pressed }) => ({
              width: 88,
              height: 88,
              alignItems: "center",
              justifyContent: "center",
              marginVertical: 12,
              borderRadius: 44,
              backgroundColor: material.bg,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: 44,
                  borderWidth: 1,
                  borderColor: colors.accent,
                },
                halo,
              ]}
            />
            <Icon name="add-outline" size={40} color={colors.accent} />
          </Pressable>
        </Animated.View>
        <T
          size={23}
          weight="semibold"
          style={{ textAlign: "center", color: material.ink }}
        >
          {title}
        </T>
        <T
          muted
          size={15}
          style={{ textAlign: "center", maxWidth: 280, color: material.muted }}
        >
          {body}
        </T>
        <T size={14} weight="medium" style={{ color: colors.accent }}>
          {label}
        </T>
      </View>
    </View>
  );
}
