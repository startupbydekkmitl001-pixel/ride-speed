import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextProps,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
  type ColorValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { theme } from "../lib/theme";
import { useApp } from "../state/AppState";
export { GlassSurface as Glass } from "./glass";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  const { colors } = useApp();
  return <Ionicons name={name} size={size} color={color ?? colors.ink} />;
}
export function T({
  children,
  style,
  muted,
  size = 15,
  weight = "regular",
  numeric = false,
  ...props
}: TextProps & {
  muted?: boolean;
  size?: number;
  weight?: "regular" | "medium" | "semibold";
  numeric?: boolean;
}) {
  const { colors } = useApp();
  const w = weight === "semibold" ? 600 : weight === "medium" ? 500 : 400;
  return (
    <Text
      {...props}
      style={[
        {
          color: muted ? colors.muted : colors.ink,
          fontFamily: `${numeric ? "Manrope" : "Anuphan"}-${w}`,
          fontSize: size,
          lineHeight: size * (numeric ? 1.2 : theme.typography.thaiLeading),
          fontVariant: numeric ? ["tabular-nums"] : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Screen({
  children,
  scroll = true,
  style,
  onScroll,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  onScroll?: (y: number) => void;
}) {
  const { colors } = useApp(),
    inset = useSafeAreaInsets();
  const content = (
    <View
      style={[
        {
          paddingHorizontal: 24,
          paddingTop: inset.top + 18,
          paddingBottom: 124 + inset.bottom,
          gap: 24,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={100}
          onScroll={(e) => onScroll?.(e.nativeEvent.contentOffset.y)}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </KeyboardAvoidingView>
  );
}
export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ flexDirection: "row", alignItems: "center", gap: 12 }, style]}
    >
      {children}
    </View>
  );
}
export function Heading({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
      <View style={{ flex: 1 }}>
        <T size={11} muted weight="medium">
          {eyebrow}
        </T>
        <T size={30} weight="semibold" style={{ marginTop: 4 }}>
          {title}
        </T>
      </View>
      {right}
    </Row>
  );
}
export function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useApp();
  return (
    <View
      style={[
        {
          borderRadius: theme.radius.card,
          padding: 20,
          backgroundColor: colors.surface,
          borderColor: colors.line,
          borderWidth: 1,
          gap: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  label,
  onPress,
  icon,
  secondary = false,
  disabled = false,
  busy = false,
  small = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, motion } = useApp();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const pressIn = () => scale.set(withTiming(0.97, { duration: motion ? theme.motion.pressMs : 0, reduceMotion: ReduceMotion.System }));
  const pressOut = () => scale.set(motion ? withSpring(1, { ...theme.motion.spring, reduceMotion: ReduceMotion.System }) : 1);
  const foreground = secondary ? colors.ink : colors.onAccent;
  return (
    <Animated.View
      style={[animatedStyle, { opacity: disabled ? 0.45 : 1 }, style]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || busy, busy }}
        disabled={disabled || busy}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={{
          backgroundColor: secondary ? colors.raised : colors.accent,
          borderRadius: 20,
          minHeight: small ? 44 : 56,
          paddingHorizontal: 18,
          paddingVertical: small ? 10 : 14,
          flexDirection: "row",
          gap: 9,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {busy ? (
          <ActivityIndicator color={foreground} />
        ) : icon ? (
          <Icon name={icon} color={foreground} size={19} />
        ) : null}
        <T
          size={small ? 13 : 16}
          weight="semibold"
          style={{ color: foreground }}
        >
          {label}
        </T>
      </Pressable>
    </Animated.View>
  );
}
export function IconButton({
  name,
  label,
  onPress,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 24,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={name} />
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useApp();
  return (
    <View style={{ gap: 7 }}>
      <T size={13} weight="medium">
        {label}
      </T>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        style={[
          {
            color: colors.ink,
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderWidth: 1,
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 14,
            minHeight: 52,
            fontFamily: "Anuphan-400",
            fontSize: 16,
            lineHeight: 16 * theme.typography.thaiLeading,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Segments<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useApp();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.raised,
        borderRadius: 17,
        padding: 4,
        gap: 3,
      }}
    >
      {items.map((item) => (
        <Pressable
          key={item.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === item.value }}
          onPress={() => onChange(item.value)}
          style={{
            flex: 1,
            minHeight: theme.material.minTarget,
            paddingHorizontal: 5,
            paddingVertical: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor:
              value === item.value ? colors.surface : "transparent",
            borderRadius: 13,
          }}
        >
          <T
            size={13}
            weight={value === item.value ? "semibold" : "regular"}
            muted={value !== item.value}
          >
            {item.label}
          </T>
        </Pressable>
      ))}
    </View>
  );
}
export function Note({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  const { colors } = useApp();
  return (
    <T
      accessibilityLiveRegion="polite"
      size={13}
      muted
      style={error ? { color: colors.danger } : undefined}
    >
      {children}
    </T>
  );
}
export function Empty({
  icon,
  title,
  body,
  children,
}: {
  icon: IconName;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const { colors } = useApp();
  return (
    <Panel style={{ paddingVertical: 32, alignItems: "center" }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 22,
          backgroundColor: colors.raised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={27} />
      </View>
      <T size={20} weight="semibold" style={{ textAlign: "center" }}>
        {title}
      </T>
      <T muted size={14} style={{ textAlign: "center", maxWidth: 290 }}>
        {body}
      </T>
      {children}
    </Panel>
  );
}
export const hairline = StyleSheet.hairlineWidth;
