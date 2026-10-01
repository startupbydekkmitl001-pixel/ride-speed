import type { CameraRef, GeoJSONSourceRef, MapRef, MapProps } from '@maplibre/maplibre-react-native';
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../lib/theme';
import { cameraCommand, cappedFitCamera, fitIntent, fitInsetsAboveFooter, fixData, fromLngLat, peersData, pinsData, safeCamera, safeInsets, toLngLat, trackData } from './geometry';
import { MapStatusTracker } from './lifecycle';
import { mapCopy } from './mapCopy';
import { finishPinDrag, startPinDrag, type PinDragTicket } from './pinDrag';
import { createMapStyle } from './mapStyle';
import { mapIds, overlayLayers, peerClusterOptions } from './overlays';
import type { MapCamera, MapCameraCommand, MapCoordinate, MapFitOptions, MapHandle, MapSurfaceProps } from './MapSurface.types';

// An older development binary must report a build requirement without starting GPS.
let runtime: typeof import('@maplibre/maplibre-react-native') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Catch missing native binaries before importing their enforcing TurboModule.
  runtime = require('@maplibre/maplibre-react-native');
} catch { /* Report unsupported below. */ }
type Intent = { kind: 'camera'; value: MapCameraCommand } | { kind: 'fit'; coordinates: readonly MapCoordinate[]; options: MapFitOptions };
// RN11.4 adds Map.contentInset to every camera stop on both platforms. Camera
// commands own padding once, including explicit fit viewports and initial state.
const rendererInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const Overlay = memo(function Overlay({ data, source, layers, sourceRef, onPress, cluster = false }: {
  data: GeoJSON.GeoJSON; source: string; layers: ReturnType<typeof overlayLayers>;
  sourceRef?: React.Ref<GeoJSONSourceRef>; onPress?: React.ComponentProps<NonNullable<typeof runtime>['GeoJSONSource']>['onPress']; cluster?: boolean;
}) {
  if (!runtime) return null;
  const { GeoJSONSource, Layer } = runtime;
  return <GeoJSONSource id={source} ref={sourceRef} data={data} lineMetrics={source === mapIds.track} {...(cluster ? peerClusterOptions : {})} onPress={onPress}>
    {layers.map(layer => <Layer key={layer.id} {...layer} />)}
  </GeoJSONSource>;
});
function DraggablePin({pin,mode,onStart,onEnd,onSelect}:{pin:MapSurfaceProps['pins'][number];mode:MapSurfaceProps['theme'];onStart:(id:string)=>PinDragTicket|null;onEnd:(ticket:PinDragTicket|null,coordinate:MapCoordinate)=>void;onSelect:(id:string)=>void}){
  const ticket=useRef<PinDragTicket|null>(null);
  if(!runtime)return null;
  const {ViewAnnotation}=runtime;
  return <ViewAnnotation id={`rs-drag-${pin.id}`} lngLat={toLngLat(pin.coordinate)!} draggable selected title={pin.label}
    onPress={event=>{event.stopPropagation();onSelect(pin.id);}}
    onDragStart={()=>{ticket.current=onStart(pin.id);}}
    onDragEnd={event=>{const coordinate=fromLngLat(event.nativeEvent.lngLat),current=ticket.current;ticket.current=null;if(coordinate)onEnd(current,coordinate);}}>
    <View collapsable={false} accessible accessibilityLabel={pin.label} style={{width:theme.material.minTarget,height:theme.material.minTarget,alignItems:'center',justifyContent:'center'}}>
      <View style={{width:36,height:36,borderRadius:18,backgroundColor:theme[mode].ink,borderColor:theme[mode].accent,borderWidth:3,alignItems:'center',justifyContent:'center'}}><Text style={{fontFamily:'Manrope-600',fontSize:14,color:theme[mode].bg}}>{pin.order}</Text></View>
    </View>
  </ViewAnnotation>;
}

export default forwardRef<MapHandle, MapSurfaceProps>(function MapSurface(props, ref) {
  const latest = useRef(props); useLayoutEffect(()=>{latest.current=props;});
  const [initial] = useState(()=>safeCamera(props.initialCamera));
  const viewport = useRef<MapCamera | null>(initial);
  const viewportSize = useRef({ width: 0, height: 0 });
  const attributionHeight = useRef<number>(theme.material.minTarget);
  const nativeMap = useRef<MapRef>(null), camera = useRef<CameraRef>(null), peerSource = useRef<GeoJSONSourceRef>(null);
  const alive = useRef(true), epoch = useRef(0), peerVersion = useRef(0), pending = useRef<Intent | null>(null);
  const styleReady = useRef(false);
  const [tracker] = useState(()=>new MapStatusTracker(props.onStatus));
  useLayoutEffect(()=>{tracker.setListener(status=>{if(alive.current)latest.current.onStatus(status);});},[tracker]);
  const style = useMemo(() => {
    const value = createMapStyle(props.theme, props.locale);
    value.metadata = { ...(value.metadata as Record<string, unknown> | undefined), 'ride:retry': props.retryToken };
    return value;
  }, [props.theme, props.locale, props.retryToken]);
  const [loadedStyle,setLoadedStyle]=useState<typeof style|null>(null);
  const overlaysReady=loadedStyle===style;
  const insets = useMemo(() => safeInsets(props.contentInsets), [props.contentInsets]);
  const layers = useMemo(() => overlayLayers(props.theme), [props.theme]);
  const routeLayers = useMemo(() => layers.filter(layer => 'source' in layer && layer.source === mapIds.track), [layers]);
  const pinLayers = useMemo(() => layers.filter(layer => 'source' in layer && layer.source === mapIds.pins), [layers]);
  const peerLayers = useMemo(() => layers.filter(layer => 'source' in layer && layer.source === mapIds.peers), [layers]);
  const fixLayers = useMemo(() => layers.filter(layer => 'source' in layer && layer.source === mapIds.fix), [layers]);
  const route = useMemo(() => trackData(props.track), [props.track]);
  const editablePin = props.mode === 'edit' && props.onMovePin ? props.pins.find(pin => pin.id === props.selectedPinId && toLngLat(pin.coordinate)) : undefined;
  const pins = useMemo(() => pinsData(editablePin ? props.pins.filter(pin=>pin.id!==editablePin.id) : props.pins, props.selectedPinId), [props.pins, props.selectedPinId, editablePin]);
  const peers = useMemo(() => peersData(props.peers), [props.peers]);
  const fix = useMemo(() => fixData(props.userFix), [props.userFix]);

  const invalidate = useCallback(() => { alive.current = false; styleReady.current = false; ++epoch.current; pending.current = null; }, []);
  useEffect(() => { alive.current = true; return invalidate; }, [invalidate]);
  useEffect(() => { ++peerVersion.current; }, [peers]);
  useEffect(() => {
    ++epoch.current; styleReady.current = false;
    tracker.beginStyle(latest.current.online);
    if (!runtime) tracker.fail({ state: 'unsupported', reason: 'native-module' });
  }, [style,tracker]);
  useEffect(() => { tracker.setOnline(props.online); }, [props.online,tracker]);

  const apply = useCallback((intent: Intent) => {
    if (!alive.current) return;
    if (!styleReady.current || !camera.current) { pending.current = intent; return; }
    const current = viewport.current;
    if (intent.kind === 'camera') {
      if (!current) return;
      const target = cameraCommand(intent.value, current, latest.current.reducedMotion);
      if (!target) return;
      const center = toLngLat(target.center)!;
      viewport.current = { center: target.center, zoom: target.zoom, bearing: target.bearing, pitch: target.pitch };
      camera.current.easeTo({ center, zoom: target.zoom, bearing: target.bearing, pitch: target.pitch, padding: safeInsets(latest.current.contentInsets), duration: target.duration, easing: 'ease' });
    } else {
      const target = fitIntent(intent.coordinates, intent.options);
      if (!target) return;
      const requested = safeInsets(intent.options.padding ?? latest.current.contentInsets);
      const padding = target.kind === 'bounds' ? fitInsetsAboveFooter(requested, {
        height: attributionHeight.current, gap: theme.space.sm, markerSize: theme.material.minTarget,
      }) : requested;
      const duration = latest.current.reducedMotion ? 0 : Number.isFinite(intent.options.durationMs) ? Math.max(0, intent.options.durationMs!) : 300;
      if (target.kind === 'center') {
        camera.current.easeTo({ center: target.center, zoom: target.zoom, bearing: 0, pitch: 0, padding, duration, easing: 'ease' });
      } else {
        const capped = cappedFitCamera(target.bounds, viewportSize.current, padding, target.maxZoom);
        if (capped) camera.current.easeTo({ center: toLngLat(capped.center)!, zoom: capped.zoom, padding, duration, bearing: 0, pitch: 0, easing: 'ease' });
        else camera.current.fitBounds(target.bounds, { padding, duration, bearing: 0, pitch: 0, easing: 'ease' });
      }
    }
  }, []);
  useEffect(() => {
    // Camera now owns all overlay padding. Preserve the last measured camera
    // when a HUD/sheet resizes instead of waiting for another recenter intent.
    if (styleReady.current && viewport.current) apply({ kind: 'camera', value: { ...viewport.current, durationMs: 0 } });
  }, [insets, apply]);
  useImperativeHandle(ref, () => ({
    setCamera: value => apply({ kind: 'camera', value }),
    fitCoordinates: (coordinates, options = {}) => apply({ kind: 'fit', coordinates, options }),
    getCamera: async () => {
      const map = nativeMap.current, generation = epoch.current;
      if (!map || !styleReady.current || !alive.current) return null;
      try {
        const value = await map.getViewState(), center = fromLngLat(value.center);
        return alive.current && epoch.current === generation && nativeMap.current === map && center ? safeCamera({ center, zoom: value.zoom, bearing: value.bearing, pitch: value.pitch }) : null;
      } catch { return null; }
    },
    project: async coordinate => {
      const point = toLngLat(coordinate), map = nativeMap.current, generation = epoch.current;
      if (!point || !map || !styleReady.current || !alive.current) return null;
      try {
        const pixel = await map.project(point);
        return alive.current && epoch.current === generation && nativeMap.current === map && pixel.every(Number.isFinite) ? { x: pixel[0], y: pixel[1] } : null;
      } catch { return null; }
    },
    unproject: async point => {
      const map = nativeMap.current, generation = epoch.current;
      if (!map || !styleReady.current || !alive.current || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      try { const coordinate = await map.unproject([point.x, point.y]); return alive.current && epoch.current === generation && nativeMap.current === map ? fromLngLat(coordinate) : null; } catch { return null; }
    },
  }), [apply]);

  const onPinPress = useCallback<NonNullable<React.ComponentProps<NonNullable<typeof runtime>['GeoJSONSource']>['onPress']>>(event => {
    event.stopPropagation();
    if (!alive.current || !styleReady.current) return;
    const id = event.nativeEvent.features.find(feature => typeof feature.properties?.id === 'string')?.properties?.id;
    if (typeof id === 'string' && latest.current.pins.some(pin => pin.id === id)) latest.current.onSelectPin?.(id);
  }, []);
  const onPeerPress = useCallback<NonNullable<React.ComponentProps<NonNullable<typeof runtime>['GeoJSONSource']>['onPress']>>(event => {
    event.stopPropagation();
    if (!alive.current || !styleReady.current) return;
    const feature = event.nativeEvent.features[0];
    if (!feature) return;
    const properties = feature.properties ?? {};
    if (typeof properties.cluster_id === 'number' && feature.geometry.type === 'Point') {
      const source = peerSource.current, generation = epoch.current, version = peerVersion.current, center = fromLngLat(feature.geometry.coordinates);
      if (!source || !center) return;
      void source.getClusterExpansionZoom(properties.cluster_id).then(zoom => {
        if (alive.current && styleReady.current && generation === epoch.current && version === peerVersion.current && source === peerSource.current && Number.isFinite(zoom)) apply({ kind: 'camera', value: { center, zoom } });
      }).catch(() => {});
    } else if (typeof properties.id === 'string' && latest.current.peers.some(peer => peer.id === properties.id)) latest.current.onSelectPeer?.(properties.id);
  }, [apply]);
  const onRegionChange = useCallback<NonNullable<MapProps['onRegionDidChange']>>(event => {
    if (!alive.current) return;
    const value = event.nativeEvent, center = fromLngLat(value.center);
    if (center) viewport.current = safeCamera({ center, zoom: value.zoom, bearing: value.bearing, pitch: value.pitch });
    if (value.userInteraction) latest.current.onUserGesture?.();
  }, []);
  const onStyleLoaded = useCallback(() => {
    if (!alive.current) return;
    styleReady.current = true; setLoadedStyle(style); tracker.styleLoaded();
    const command = pending.current; pending.current = null;
    if (command) apply(command);
    else if (viewport.current) apply({ kind: 'camera', value: { ...viewport.current, durationMs: 0 } });
  }, [apply,style,tracker]);
  if (!runtime) return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.map[props.theme].background }]} />;
  const { Map, Camera } = runtime;
  return <View style={StyleSheet.absoluteFill} onLayout={event => { viewportSize.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height }; }}><Map ref={nativeMap} testID="ride-map" style={StyleSheet.absoluteFill} mapStyle={style} contentInset={rendererInsets}
    dragPan touchZoom doubleTapZoom doubleTapHoldZoom touchRotate touchPitch={props.mode !== 'glance'}
    attribution={false} logo={false} compass={false}
    tintColor={theme[props.theme].ink} androidView="texture" accessibilityLabel={mapCopy[props.locale].map}
    onPress={event => { const coordinate = fromLngLat(event.nativeEvent.lngLat); if (alive.current && coordinate && latest.current.mode !== 'glance') latest.current.onPress?.(coordinate); }}
    onLongPress={event => { const coordinate = fromLngLat(event.nativeEvent.lngLat); if (alive.current && coordinate && latest.current.mode !== 'glance') latest.current.onLongPress?.(coordinate); }}
    onRegionDidChange={onRegionChange} onDidFinishLoadingStyle={onStyleLoaded}
    onDidFinishRenderingMapFully={() => { if (styleReady.current) tracker.fullyRendered(); }}
    onDidFailLoadingMap={() => tracker.tileFailed()}>
    <Camera ref={camera} initialViewState={initial ? { ...initial, center: toLngLat(initial.center)!, padding: insets } : undefined} minZoom={0} maxZoom={22} />
    {overlaysReady && <>
      <Overlay source={mapIds.track} data={route} layers={routeLayers} />
      <Overlay source={mapIds.pins} data={pins} layers={pinLayers} onPress={onPinPress} />
      {editablePin && <DraggablePin key={`${props.theme}:${props.locale}:${props.retryToken}:${editablePin.id}`} pin={editablePin} mode={props.theme}
        onStart={id=>startPinDrag({...latest.current,alive:alive.current,ready:styleReady.current,epoch:epoch.current},id)}
        onEnd={(ticket,coordinate)=>{const result=finishPinDrag(ticket,{...latest.current,alive:alive.current,ready:styleReady.current,epoch:epoch.current},coordinate);if(result)latest.current.onMovePin?.(result.id,result.coordinate);}}
        onSelect={id=>{if(alive.current&&styleReady.current&&latest.current.mode==='edit')latest.current.onSelectPin?.(id);}}/>}
      <Overlay source={mapIds.peers} data={peers} layers={peerLayers} sourceRef={peerSource} onPress={onPeerPress} cluster />
      <Overlay source={mapIds.fix} data={fix} layers={fixLayers} />
    </>}
  </Map><Pressable accessibilityRole="button" accessibilityLabel={mapCopy[props.locale].attribution}
    onLayout={event => { const height = event.nativeEvent.layout.height; if (Number.isFinite(height)) attributionHeight.current = Math.max(theme.material.minTarget, height); }}
    onPress={() => { void nativeMap.current?.showAttribution().catch(() => {}); }}
    style={{ position: 'absolute', bottom: insets.bottom + theme.space.sm, left: insets.left + theme.space.sm, right: insets.right + theme.space.sm, minHeight: theme.material.minTarget, justifyContent: 'center', alignItems: 'flex-start' }}>
    <Text style={{ fontSize: 10, lineHeight: 15, color: theme.map[props.theme].label, backgroundColor: theme[props.theme].glassScrim, borderRadius: theme.radius.small, paddingHorizontal: theme.space.sm, paddingVertical: theme.space.xs }}>OpenFreeMap · OpenMapTiles · © OpenStreetMap</Text>
  </Pressable></View>;
});
