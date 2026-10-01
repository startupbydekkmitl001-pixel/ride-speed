import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../../lib/theme';
import { useScreenActivity } from '../../lib/useScreenActivity';
import { useApp } from '../../state/AppState';
import { AmbientLoop } from './AmbientLoop';
import { resolveAmbientAsset, type MotionRole } from './assets';

/** Light stays at the edge; the reading area and controls remain native. */
export function MotionHero({ children, role = 'auth-onboarding' }: { children: ReactNode; role?: MotionRole }) {
  const { dark, colors } = useApp();
  const { active } = useScreenActivity();
  return <View style={{ borderRadius: theme.radius.sheet, overflow: 'hidden', backgroundColor: colors.bg }}>
    <AmbientLoop asset={resolveAmbientAsset(role, dark ? 'dark' : 'light')} visible={active} style={StyleSheet.absoluteFill} />
    <View style={{ padding: 24, gap: 18 }}>{children}</View>
  </View>;
}
