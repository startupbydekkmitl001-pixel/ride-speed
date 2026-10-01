import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import React, { createContext, useContext, type RefObject } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../../lib/theme';
import { useApp } from '../../state/AppState';

const MaterialParent = createContext(false);

function nativeGlassEnabled(enabled: boolean) {
  return Platform.OS === 'ios' && enabled && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
}

export function GlassGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { glass } = useApp();
  if (nativeGlassEnabled(glass)) return <GlassContainer pointerEvents="box-none" spacing={10} style={style}>{children}</GlassContainer>;
  return <View pointerEvents="box-none" style={style}>{children}</View>;
}

/** One material per floating control group. A nested request adds structure only. */
export function GlassSurface({ children, style, blurTarget }: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  blurTarget?: RefObject<View | null>;
}) {
  const { colors, dark, glass } = useApp();
  const nested = useContext(MaterialParent);
  const shape: ViewStyle = { borderRadius: theme.radius.sheet, overflow: 'hidden' };
  if (nested) return <View style={style}>{children}</View>;
  const contents = <MaterialParent.Provider value={true}>{children}</MaterialParent.Provider>;
  if (nativeGlassEnabled(glass)) {
    return <GlassView colorScheme={dark ? 'dark' : 'light'} glassEffectStyle="regular" style={[shape, style]}>{contents}</GlassView>;
  }
  // Android blur needs one shared BlurTargetView; unsupported/older devices use solid material.
  const blur = glass && (Platform.OS !== 'android' || (!!blurTarget && Number(Platform.Version) >= 31));
  return (
    <View style={[shape, { borderWidth: 1, borderColor: colors.line, backgroundColor: blur ? 'transparent' : colors.surface }, style]}>
      {blur ? <>
        <BlurView pointerEvents="none" style={StyleSheet.absoluteFill} intensity={theme.material.blur} tint={dark ? 'dark' : 'light'} blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassScrim }]} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassTint }]} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 1, backgroundColor: colors.specular }} />
      </> : null}
      {contents}
    </View>
  );
}
