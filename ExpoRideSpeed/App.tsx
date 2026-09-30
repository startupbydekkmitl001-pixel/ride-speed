import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useRideSession } from './src/useRideSession';
import type { SignalQuality } from './src/speedEngine';

type Unit = 'kmh' | 'mph';

const colors = {
  background: '#050505', white: '#FFFFFF', muted: '#B8B8B8',
  card: '#171717', border: '#393939', accent: '#E5FF57',
  good: '#7CFF9C', weak: '#FFD567', noFix: '#A8A8A8',
};

function KeepScreenAwake() {
  useKeepAwake();
  return null;
}

function speedText(metersPerSecond: number | null, unit: Unit, digits: number): string {
  if (metersPerSecond === null) return '—';
  return (metersPerSecond * (unit === 'kmh' ? 3.6 : 2.2369362921)).toFixed(digits);
}

function qualityText(quality: SignalQuality): string {
  return quality === 'good' ? 'Good' : quality === 'weak' ? 'Weak' : 'No fix';
}

function qualityColor(quality: SignalQuality): string {
  return quality === 'good' ? colors.good : quality === 'weak' ? colors.weak : colors.noFix;
}

function SpeedometerScreen() {
  const { width } = useWindowDimensions();
  const [unit, setUnit] = useState<Unit>('kmh');
  const { active, snapshot, permissionState, message, start, stop, resetMax } = useRideSession();
  const unitLabel = unit === 'kmh' ? 'km/h' : 'mph';
  const live = speedText(snapshot.liveMps, unit, 0);
  const maximum = speedText(snapshot.maxMps, unit, 1);
  const positionAccuracy = snapshot.horizontalAccuracyM;
  const accuracyText = positionAccuracy === null
    ? 'Position accuracy unavailable'
    : 'Position ±' + Math.round(positionAccuracy) + ' m';

  let guidance = 'Start a session outdoors with a clear view of the sky.';
  if (active && snapshot.quality === 'good' && snapshot.liveMps === null) {
    guidance = 'Confirming speed from three clean readings…';
  } else if (active && snapshot.quality !== 'good') {
    guidance = 'Waiting for a reliable location and speed reading…';
  } else if (active) {
    guidance = 'Measuring while this screen stays open.';
  }
  if (message) guidance = message;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {active ? <KeepScreenAwake /> : null}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.brand}>RIDE SPEED</Text>
          <View
            style={styles.quality}
            accessible
            accessibilityLabel={'GPS reading ' + qualityText(snapshot.quality) + '. ' + accuracyText}
          >
            <View style={[styles.qualityDot, { backgroundColor: qualityColor(snapshot.quality) }]} />
            <Text style={styles.qualityText}>{qualityText(snapshot.quality)}</Text>
          </View>
        </View>

        <View
          style={styles.speedSection}
          accessible
          accessibilityLabel={'Current speed ' + (snapshot.liveMps === null ? 'unavailable' : live + ' ' + unitLabel)}
        >
          <Text style={styles.eyebrow}>CURRENT SPEED</Text>
          <Text
            style={[styles.liveSpeed, { fontSize: Math.min(width * 0.33, 150) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
          >
            {live}
          </Text>
          <Text style={styles.liveUnit}>{unitLabel}</Text>
          <Text style={styles.accuracyText}>{accuracyText}</Text>
        </View>

        <View style={styles.controls}>
          <View style={styles.maxCard}>
            <View style={styles.maxCopy}>
              <Text style={styles.eyebrow}>SESSION MAX</Text>
              <Text style={styles.maxValue} numberOfLines={1} adjustsFontSizeToFit>
                {maximum} <Text style={styles.maxUnit}>{unitLabel}</Text>
              </Text>
            </View>
            <Pressable
              onPress={resetMax}
              disabled={snapshot.maxMps === null}
              style={({ pressed }) => [
                styles.resetButton,
                snapshot.maxMps === null && styles.disabledButton,
                pressed && styles.pressedButton,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reset session maximum speed"
            >
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          </View>

          <View style={styles.unitToggle} accessibilityRole="radiogroup">
            {(['kmh', 'mph'] as const).map((choice) => (
              <Pressable
                key={choice}
                onPress={() => setUnit(choice)}
                style={[styles.unitChoice, unit === choice && styles.unitChoiceSelected]}
                accessibilityRole="radio"
                accessibilityState={{ checked: unit === choice }}
                accessibilityLabel={choice === 'kmh' ? 'Kilometres per hour' : 'Miles per hour'}
              >
                <Text style={[styles.unitChoiceText, unit === choice && styles.unitChoiceTextSelected]}>
                  {choice === 'kmh' ? 'km/h' : 'mph'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={() => { if (active) stop(); else void start(); }}
            disabled={permissionState === 'requesting'}
            style={({ pressed }) => [
              styles.sessionButton,
              permissionState === 'requesting' && styles.disabledButton,
              pressed && styles.pressedButton,
            ]}
            accessibilityRole="button"
            accessibilityLabel={active ? 'End session' : 'Start session'}
          >
            <Text style={styles.sessionButtonText}>{active ? 'End Session' : 'Start Session'}</Text>
          </Pressable>

          <Text style={styles.guidance}>{guidance}</Text>
          {(permissionState === 'denied' || permissionState === 'preciseRequired') ? (
            <Pressable
              onPress={() => { void Linking.openSettings(); }}
              accessibilityRole="button"
              accessibilityLabel="Open location settings"
            >
              <Text style={styles.settingsLink}>Open Location Settings</Text>
            </Pressable>
          ) : null}
          <Text style={styles.limitNote}>
            Expo Go measures only while open. Locking the phone ends the session. Speed uncertainty is unavailable.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SpeedometerScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: colors.white, fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  quality: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  qualityDot: { width: 12, height: 12, borderRadius: 6 },
  qualityText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  speedSection: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  eyebrow: { color: colors.muted, fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  liveSpeed: { color: colors.white, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 170 },
  liveUnit: { color: colors.white, fontSize: 30, fontWeight: '700', marginTop: -10 },
  accuracyText: { color: colors.muted, fontSize: 13, marginTop: 12 },
  controls: { gap: 16 },
  maxCard: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  maxCopy: { flex: 1 },
  maxValue: { color: colors.white, fontSize: 35, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 4 },
  maxUnit: { color: colors.muted, fontSize: 18, fontWeight: '700' },
  resetButton: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11 },
  resetText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  disabledButton: { opacity: 0.4 },
  pressedButton: { opacity: 0.75 },
  unitToggle: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, padding: 4, gap: 4 },
  unitChoice: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 11 },
  unitChoiceSelected: { backgroundColor: colors.accent },
  unitChoiceText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  unitChoiceTextSelected: { color: colors.background },
  sessionButton: { backgroundColor: colors.white, borderRadius: 17, alignItems: 'center', paddingVertical: 18 },
  sessionButtonText: { color: colors.background, fontSize: 21, fontWeight: '900' },
  guidance: { color: colors.muted, textAlign: 'center', fontSize: 14, lineHeight: 20, minHeight: 20 },
  settingsLink: { color: colors.accent, textAlign: 'center', fontSize: 15, fontWeight: '800' },
  limitNote: { color: colors.muted, textAlign: 'center', fontSize: 12, lineHeight: 17 },
});
