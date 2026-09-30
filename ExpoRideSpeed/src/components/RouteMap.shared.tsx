import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import MapSurface from '../features/map/MapSurface';
import type { MapCamera, MapHandle, MapPin, MapStatus } from '../features/map/MapSurface.types';
import { mapCopy } from '../features/map/mapCopy';
import type { Stop } from '../lib/domain';
import { useI18n } from '../lib/i18n';
import { useApp } from '../state/AppState';
import { useAuth } from '../state/AuthState';
import { useRide } from '../state/RideState';
import { Glass, Icon, Note, T } from './ui';

export type RouteMapProps = {
  stops: Stop[]; selectedId?: string; disabled?: boolean;
  onAddStop: (coordinate: { latitude: number; longitude: number }) => void;
  onSelectStop: (stop: Stop) => void;
  focus?: { latitude: number; longitude: number; token: number };
};
const insets = { top: 48, right: 12, bottom: 48, left: 12 };
const emptyPeers = [] as const;
export default function RouteMap(props: RouteMapProps) {
  const { scope } = useAuth();
  return <AccountRouteMap key={scope.generation} {...props} />;
}
function AccountRouteMap({ stops, selectedId, disabled, onAddStop, onSelectStop, focus }: RouteMapProps) {
  const { colors, dark, motion } = useApp(), { language, t } = useI18n(), ride = useRide();
  const map = useRef<MapHandle>(null), fitted = useRef(false);
  const [status, setStatus] = useState<MapStatus>({ state: 'loading' });
  const [retry, setRetry] = useState(0);
  const [initialCamera] = useState<MapCamera>(() => ({ center: stops[0] ? { latitude: stops[0].latitude, longitude: stops[0].longitude } : { latitude: 15.6, longitude: 101.1 }, zoom: stops.length ? 12 : 4.5, bearing: 0, pitch: 0 }));
  const pins = useMemo<MapPin[]>(() => stops.map((stop, index) => ({ id: stop.id, coordinate: stop, label: stop.name, role: index === 0 ? 'start' : index === stops.length - 1 ? 'finish' : 'via', order: index + 1 })), [stops]);
  const track = useMemo(() => stops.length > 1 ? { kind: 'draft' as const, segments: [stops] } : null, [stops]);
  const fit = () => map.current?.fitCoordinates(stops, { padding: insets, durationMs: motion ? 300 : 0, maxZoom: 15 });
  useEffect(() => {
    if (status.state === 'ready' && !fitted.current && stops.length > 1) { fitted.current = true; map.current?.fitCoordinates(stops, { padding: insets, durationMs: 0, maxZoom: 15 }); }
  }, [status, stops]);
  useEffect(() => { if (focus) map.current?.setCamera({ center: focus, zoom: 15, durationMs: motion ? 300 : 0 }); }, [focus, motion]);
  const locked = !!disabled || ride.movingLocked;
  const problem = status.state === 'unsupported' ? status.reason === 'webgl2' ? mapCopy[language].webgl : mapCopy[language].nativeModule
    : status.state === 'error' || status.state === 'degraded' && status.reason === 'tiles' ? t('m2.map.mapError') : null;
  return <View style={{ gap: 10 }}>
    <View style={[styles.frame, { borderColor: colors.line, backgroundColor: colors.bg }]}>
      <MapSurface ref={map} theme={dark ? 'dark' : 'light'} locale={language} initialCamera={initialCamera} contentInsets={insets}
        mode={locked ? 'glance' : 'edit'} reducedMotion={!motion} online={typeof navigator === 'undefined' || navigator.onLine !== false} retryToken={retry}
        track={track} pins={pins} selectedPinId={selectedId ?? null} peers={emptyPeers} userFix={ride.userFix} onStatus={setStatus}
        onLongPress={locked ? undefined : onAddStop} onSelectPin={id => { const stop = stops.find(value => value.id === id); if (!locked && stop) onSelectStop(stop); }} />
      <Glass style={styles.hint}><T size={12} weight="medium">{mapCopy[language].gesture}</T></Glass>
      <Glass style={styles.tools}><Pressable accessibilityRole="button" accessibilityLabel={t('m2.map.overview')}
        disabled={!stops.length} onPress={fit} style={styles.target}><Icon name="scan-outline" /></Pressable></Glass>
      {status.state === 'loading' && <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={colors.accent} accessibilityLabel={mapCopy[language].loading} /></View>}
    </View>
    <T size={12} muted>{mapCopy[language].draft}</T>
    {problem && <Note error>{problem}</Note>}
    {(status.state === 'error' || status.state === 'degraded' && status.reason === 'tiles') && <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={styles.retry}><T size={13} weight="medium">{t('m2.map.retryMap')}</T></Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  frame: { height: 336, borderRadius: 28, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  hint: { position: 'absolute', left: 12, top: 12, maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8 },
  tools: { position: 'absolute', top: 64, right: 12 },
  target: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  loading: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
});
