import { memo, useEffect, useId } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, ReduceMotion, useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { GlassSurface } from "../../components/glass";
import { IconButton, Row, Segments, T } from "../../components/ui";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { theme } from "../../lib/theme";
import type { SpeedSnapshot } from "../../speedEngine";
import { useApp } from "../../state/AppState";
import { useScreenActivity } from '../../lib/useScreenActivity';
import { AmbientLoop, resolveAmbientAsset } from '../motion';
import { formatRideDuration, metricDistance, presentSpeed, rollingDigitPosition, speedFactor, speedScale, type RideMetrics, type SpeedUnits } from "./presentation";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const ARC_RADIUS = 124;
const ARC_LENGTH = 2 * Math.PI * ARC_RADIUS * 2 / 3;
const ARC = "M 52.613 217 A 124 124 0 1 1 267.387 217";
const ticks = Array.from({ length: 25 }, (_, index) => {
  const angle = (150 + index * 10) * Math.PI / 180;
  const radius = index % 4 === 0 ? 105 : 111;
  return { x1: 160 + radius * Math.cos(angle), y1: 155 + radius * Math.sin(angle), x2: 160 + 114 * Math.cos(angle), y2: 155 + 114 * Math.sin(angle), major: index % 4 === 0 };
});

export type SpeedometerHUDProps = {
  snapshot: SpeedSnapshot;
  metrics: RideMetrics;
  units: SpeedUnits;
  expanded?: boolean;
  /** Compact primary readout for a moving, height-constrained web map. */
  glanceOnly?: boolean;
  backgroundMotionAllowed?: boolean;
  onToggleExpanded: () => void;
  onUnitsChange?: (value: SpeedUnits) => void;
  style?: StyleProp<ViewStyle>;
};

function Digit({ value, place, fontSize }: { value: SharedValue<number>; place: number; fontSize: number }) {
  const height = fontSize * 1.2;
  const column = useAnimatedStyle(() => ({ transform: [{ translateY: -rollingDigitPosition(value.value, place) * height }] }));
  const visibility = useAnimatedStyle(() => ({ opacity: place === 1 ? 1 : Math.max(0, Math.min(1, value.value - place + 1)) }));
  return <Animated.View style={[{ width: fontSize * 0.68, height, overflow: "hidden" }, visibility]}>
    <Animated.View style={column}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((digit, index) => <T key={index} numeric size={fontSize} allowFontScaling={false} style={{ height, lineHeight: height, textAlign: "center" }} weight="semibold">{digit}</T>)}
    </Animated.View>
  </Animated.View>;
}

function RollingDigits({ value, target, size }: { value: SharedValue<number>; target: number; size: number }) {
  const { motion } = useApp();
  const count = String(Math.round(target)).length;
  const center = useSharedValue(-(4 - count) * size * 0.68 / 2);
  useEffect(() => {
    const next = -(4 - count) * size * 0.68 / 2;
    center.value = motion ? withSpring(next, { ...theme.motion.spring, overshootClamping: true, reduceMotion: ReduceMotion.System }) : next;
    return () => cancelAnimation(center);
  }, [count, size, motion, center]);
  const position = useAnimatedStyle(() => ({ transform: [{ translateX: center.value }] }));
  return <Animated.View style={[{ flexDirection: "row", width: size * 0.68 * 4 }, position]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {[1000, 100, 10, 1].map(place => <Digit key={place} value={value} place={place} fontSize={size} />)}
  </Animated.View>;
}

function Dial({ value, range }: { value?: SharedValue<number>; range: number }) {
  const { colors } = useApp();
  const id = `speed-heat-${useId().replace(/:/g, "")}`;
  const arc = useAnimatedProps(() => {
    const ratio = value ? Math.min(1, Math.max(0, value.value / range)) : 0;
    return { strokeDashoffset: ARC_LENGTH * (1 - ratio), opacity: ratio > 0 ? 1 : 0 };
  });
  const needle = useAnimatedProps(() => {
    const ratio = value ? Math.min(1, Math.max(0, value.value / range)) : 0;
    const angle = (150 + ratio * 240) * Math.PI / 180;
    return { x1: 160 + 117 * Math.cos(angle), y1: 155 + 117 * Math.sin(angle), x2: 160 + 133 * Math.cos(angle), y2: 155 + 133 * Math.sin(angle), opacity: value ? 1 : 0 };
  });
  return <View style={{ width: "100%", height: 245 }} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 320 245">
      <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">{theme.speedHeat.map((color, index) => <Stop key={color} offset={`${index / 3 * 100}%`} stopColor={color} />)}</LinearGradient></Defs>
      <Path d={ARC} fill="none" stroke={colors.line} strokeWidth={1.5} />
      {ticks.map((tick, index) => <Line key={index} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke={colors.ink} strokeOpacity={tick.major ? 0.45 : 0.16} strokeWidth={tick.major ? 1.5 : 1} />)}
      {value && <>
        <AnimatedPath d={ARC} fill="none" stroke={`url(#${id})`} strokeWidth={4} strokeLinecap="round" strokeDasharray={[ARC_LENGTH, ARC_LENGTH]} animatedProps={arc} />
        <AnimatedLine stroke={colors.ink} strokeWidth={2} strokeLinecap="round" animatedProps={needle} />
      </>}
    </Svg>
    <View style={{ position: "absolute", bottom: 5, left: "15%" }}><T numeric muted size={11}>0</T></View>
    <View style={{ position: "absolute", bottom: 5, right: "15%" }}><T numeric muted size={11}>{range}</T></View>
  </View>;
}

function LiveInstrument({ speed, units, expanded, range, size }: { speed: number; units: SpeedUnits; expanded: boolean; range: number; size: number }) {
  const { motion } = useApp(), { t } = useI18n();
  // This component mounts with the actual first valid fix. Null→good never counts up from invented zero.
  const digits = useSharedValue(Math.round(speed)), needle = useSharedValue(speed);
  useEffect(() => {
    // A bounded transition finishes before the next GPS tick, without spring
    // settling lag or overshoot. New fixes interrupt from the current value.
    const options = { duration: theme.motion.stateMs, reduceMotion: ReduceMotion.System };
    digits.value = motion ? withTiming(Math.round(speed), options) : Math.round(speed);
    needle.value = motion ? withTiming(speed, options) : speed;
    return () => { cancelAnimation(digits); cancelAnimation(needle); };
  }, [speed, motion, digits, needle]);
  if (!expanded) return <View style={{ alignItems: "center" }}><RollingDigits value={digits} target={speed} size={size} /></View>;
  return <View style={{ width: "100%", maxWidth: 360, alignSelf: "center" }}>
    <Dial value={needle} range={range} />
    <View style={styles.dialReadout}>
      <RollingDigits value={digits} target={speed} size={size} />
      <T numeric muted size={14}>{t(units === "mph" ? "common.mph" : "common.kmh")}</T>
    </View>
  </View>;
}

function UnavailableInstrument({ expanded, units, range, size, initialZero }: { expanded: boolean; units: SpeedUnits; range: number; size: number; initialZero: boolean }) {
  const { t } = useI18n();
  const content = <><T numeric size={size} allowFontScaling={false} muted>{initialZero ? '0' : '—'}</T>{expanded && <T numeric muted size={14}>{t(units === "mph" ? "common.mph" : "common.kmh")}</T>}</>;
  if (!expanded) return <View style={{ alignItems: "center" }}>{content}</View>;
  return <View style={{ width: "100%", maxWidth: 360, alignSelf: "center" }}><Dial range={range} /><View style={styles.dialReadout}>{content}</View></View>;
}

function Metric({ label, value, unit }: { label: TranslationKey; value: string; unit?: string }) {
  const { t } = useI18n(), { colors } = useApp();
  return <View style={{ width: "50%", paddingVertical: 12, paddingHorizontal: 12, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }}>
    <T muted size={12}>{t(label)}</T>
    <Row style={{ alignItems: "baseline", gap: 5, flexWrap: "wrap" }}><T numeric size={24} weight="semibold">{value}</T>{unit && <T numeric size={11} muted>{unit}</T>}</Row>
  </View>;
}

export const SpeedometerHUD = memo(function SpeedometerHUD({ snapshot, metrics, units, expanded = false, glanceOnly = false, backgroundMotionAllowed = false, onToggleExpanded, onUnitsChange, style }: SpeedometerHUDProps) {
  const { colors, dark } = useApp(), { t, locale } = useI18n();
  const { active } = useScreenActivity();
  const { width, height, fontScale } = useWindowDimensions();
  const landscape = width > height;
  const presentation = presentSpeed(snapshot, units), range = speedScale(presentation.live, presentation.maximum, units);
  const signalKey: TranslationKey = presentation.signal === "good" ? "m2.hud.gpsGood" : presentation.signal === "weak" ? "m2.hud.gpsWeak" : presentation.signal === "confirming" ? "m2.hud.gpsConfirming" : "m2.hud.gpsNoFix";
  const unitLabel = t(units === "mph" ? "common.mph" : "common.kmh");
  const speedText = presentation.live === null ? (presentation.initialZero ? "0" : t("m2.hud.unavailable")) : String(Math.round(presentation.live));
  const size = Math.min(expanded ? 76 : 49, (expanded ? width * (landscape ? 0.48 : 0.85) : width * 0.43) / (0.68 * 4)) * Math.min(fontScale, 1.3);
  const maximum = presentation.maximum === null ? "—" : presentation.maximum.toFixed(1);
  const average = metrics.averageMps !== null && Number.isFinite(metrics.averageMps) && metrics.averageMps >= 0 ? (metrics.averageMps * speedFactor(units)).toFixed(1) : "—";
  const distance = metricDistance(metrics.distanceMeters, units);
  const distanceText = distance ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: distance.value < 1 ? 2 : 1 }).format(distance.value) : "—";
  const instrument = <View accessible accessibilityRole="text" accessibilityLabel={t("m2.hud.readout", { speed: speedText, unit: unitLabel, signal: t(signalKey) })} accessibilityLiveRegion="none">
    {presentation.live === null ? <UnavailableInstrument initialZero={presentation.initialZero} expanded={expanded} units={units} range={range} size={size} /> : <LiveInstrument key={units} speed={presentation.live} units={units} expanded={expanded} range={range} size={size} />}
  </View>;
  const signal = <Row style={{ gap: 6, flexWrap: "wrap" }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: presentation.signal === "good" ? colors.good : colors.muted }} /><T muted size={11}>{t(signalKey)}</T></Row>;
  if (!expanded && glanceOnly) return <GlassSurface style={[{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }, style]}>
    <Row style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>{instrument}<T numeric size={12} muted>{unitLabel}</T></Row>
    <Row style={{ justifyContent: "space-between", gap: 8 }}><View style={{ flex: 1, minWidth: 0 }}>{signal}</View><IconButton name="expand-outline" label={t("m2.hud.expand")} onPress={onToggleExpanded} /></Row>
  </GlassSurface>;
  if (!expanded) return <GlassSurface style={[{ paddingHorizontal: 16, paddingVertical: 12 }, style]}>
    <Row style={{ justifyContent: "space-between", gap: 8 }}>
      <View style={{ alignItems: "center", flexShrink: 1 }}>{instrument}<T numeric size={12} muted>{unitLabel}</T></View>
      <View style={{ flex: 1, gap: 4 }}>{signal}<Row style={{gap:8,flexWrap:'wrap'}}>
        <T numeric size={12} accessibilityLabel={`${t('m2.hud.duration')} ${formatRideDuration(metrics.durationSeconds)??'—'}`}>{formatRideDuration(metrics.durationSeconds)??'—'}</T>
        <T numeric muted size={12} accessibilityLabel={`${t('m2.hud.distance')} ${distanceText} ${distance?t(distance.unit==='mi'?'m2.hud.mi':'m2.hud.km'):''}`}>{distanceText} {distance?t(distance.unit==='mi'?'m2.hud.mi':'m2.hud.km'):''}</T>
      </Row><T muted size={11}>{t('m2.hud.max')} <T numeric muted size={11}>{maximum} {unitLabel}</T></T></View>
      <IconButton name="expand-outline" label={t("m2.hud.expand")} onPress={onToggleExpanded} />
    </Row>
  </GlassSurface>;
  return <View style={[{ backgroundColor: colors.bg, borderRadius: theme.radius.sheet, overflow: "hidden" }, style]}>
    <AmbientLoop asset={resolveAmbientAsset('speedometer-glow', dark ? 'dark' : 'light')} visible={active && backgroundMotionAllowed} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 12 }}>
      <Row style={{ justifyContent: "space-between" }}><View style={{ flexShrink: 1 }}><T weight="semibold" size={18}>{t("m2.hud.live")}</T>{signal}</View><IconButton name="contract-outline" label={t("m2.hud.compact")} onPress={onToggleExpanded} /></Row>
      <View style={{ flexDirection: landscape ? "row" : "column", alignItems: "center", gap: 12 }}>
        <View style={{ width: landscape ? "52%" : "100%" }}>{instrument}</View>
        <View style={{ width: landscape ? "45%" : "100%", flexDirection: "row", flexWrap: "wrap" }}>
          <Metric label="m2.hud.max" value={maximum} unit={unitLabel} />
          <Metric label="m2.hud.average" value={average} unit={unitLabel} />
          <Metric label="m2.hud.distance" value={distanceText} unit={distance ? t(distance.unit === "mi" ? "m2.hud.mi" : "m2.hud.km") : undefined} />
          <Metric label="m2.hud.duration" value={formatRideDuration(metrics.durationSeconds) ?? "—"} />
        </View>
      </View>
      {snapshot.horizontalAccuracyM !== null && Number.isFinite(snapshot.horizontalAccuracyM) && snapshot.horizontalAccuracyM >= 0 && <T muted size={11}>{t("m2.hud.accuracy", { meters: Math.round(snapshot.horizontalAccuracyM) })}</T>}
      {onUnitsChange && <Segments items={[{ value: "kmh", label: t("common.kmh") }, { value: "mph", label: t("common.mph") }]} value={units} onChange={onUnitsChange} />}
    </ScrollView>
  </View>;
});

const styles = StyleSheet.create({
  dialReadout: { position: "absolute", top: 90, left: 0, right: 0, alignItems: "center", gap: 6 },
});
