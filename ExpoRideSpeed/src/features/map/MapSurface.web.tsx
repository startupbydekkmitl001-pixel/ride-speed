import Constants from 'expo-constants';
import type { GeoJSONSource, Map as GLMap, MapMouseEvent } from 'maplibre-gl';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import { theme } from '../../lib/theme';
import { cameraCommand, fitIntent, fitInsetsAboveFooter, fixData, fromLngLat, mapWorkerUrl, peersData, pinsData, safeCamera, safeInsets, toLngLat, trackData } from './geometry';
import { MapStatusTracker } from './lifecycle';
import { mapCopy } from './mapCopy';
import { createMapStyle } from './mapStyle';
import { mapIds, overlayLayers, peerClusterOptions } from './overlays';
import { GeoJSONUpdateQueue } from './sourceUpdates';
import { finishPinDrag, startPinDrag, type PinDragTicket } from './pinDrag';
import type { MapCamera, MapCameraCommand, MapCoordinate, MapFitOptions, MapHandle, MapSurfaceProps } from './MapSurface.types';
import './MapSurface.web.css';

type Intent = { kind: 'camera'; value: MapCameraCommand } | { kind: 'fit'; coordinates: readonly MapCoordinate[]; options: MapFitOptions };
const sourceIds = [mapIds.track, mapIds.pins, mapIds.peers, mapIds.fix] as const;
function showPeers(map:GLMap,visible:boolean){for(const id of [mapIds.cluster,mapIds.clusterCount,mapIds.peer,mapIds.peerName])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');}
function cameraOf(map: GLMap): MapCamera | null {
  const value = map.getCenter(), center = fromLngLat([value.lng, value.lat]);
  return center ? safeCamera({ center, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }) : null;
}
function canRenderWebGL2() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2');
  if (!context) return false;
  context.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}
export default forwardRef<MapHandle, MapSurfaceProps>(function MapSurface(props, ref) {
  const latest = useRef(props); latest.current = props;
  const initial = useRef(safeCamera(props.initialCamera));
  const container = useRef<HTMLDivElement>(null), mapRef = useRef<GLMap | null>(null);
  const alive = useRef(false), styleReady = useRef(false), epoch = useRef(0), peerVersion = useRef(0);
  const pending = useRef<Intent | null>(null), writers = useRef(new Map<string, GeoJSONUpdateQueue>());
  const restart = useRef<(() => void) | null>(null);
  const updateDragMarker = useRef<(() => void)|null>(null);
  const tracker = useRef<MapStatusTracker | null>(null);
  if (!tracker.current) tracker.current = new MapStatusTracker(status => { if (alive.current) latest.current.onStatus(status); });
  const style = useMemo(() => createMapStyle(props.theme, props.locale), [props.theme, props.locale]);
  const track = useMemo(() => trackData(props.track), [props.track]);
  const editablePin = props.mode === 'edit' && props.onMovePin ? props.pins.find(pin=>pin.id===props.selectedPinId && toLngLat(pin.coordinate)) : undefined;
  const pins = useMemo(() => pinsData(editablePin ? props.pins.filter(pin=>pin.id!==editablePin.id) : props.pins, props.selectedPinId), [props.pins, props.selectedPinId, editablePin]);
  const peers = useMemo(() => peersData(props.peers), [props.peers]);
  const fix = useMemo(() => fixData(props.userFix), [props.userFix]);
  const data = useMemo(() => ({ [mapIds.track]: track, [mapIds.pins]: pins, [mapIds.peers]: peers, [mapIds.fix]: fix }), [track, pins, peers, fix]);
  const latestData = useRef(data); latestData.current = data;
  const latestStyle = useRef(style); latestStyle.current = style;
  const invalidate = useCallback(() => { alive.current = false; styleReady.current = false; ++epoch.current; pending.current = null; }, []);

  const apply = useCallback((intent: Intent) => {
    const map = mapRef.current;
    if (!alive.current || !map || !styleReady.current) { pending.current = intent; return; }
    if (intent.kind === 'camera') {
      const current = cameraOf(map);
      if (!current) return;
      const target = cameraCommand(intent.value, current, latest.current.reducedMotion);
      if (!target) return;
      map.easeTo({ center: toLngLat(target.center)!, zoom: target.zoom, bearing: target.bearing, pitch: target.pitch, padding: safeInsets(latest.current.contentInsets), duration: target.duration });
    } else {
      const target = fitIntent(intent.coordinates, intent.options);
      if (!target) return;
      const options = { padding: safeInsets(intent.options.padding ?? latest.current.contentInsets), duration: latest.current.reducedMotion ? 0 : Number.isFinite(intent.options.durationMs) ? Math.max(0, intent.options.durationMs!) : 300, bearing: 0, pitch: 0 };
      if (target.kind === 'center') map.easeTo({ ...options, center: target.center, zoom: target.zoom });
      else {
        const creditHeight = map.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-attrib')?.getBoundingClientRect().height ?? 0;
        const padding = fitInsetsAboveFooter(options.padding, {
          height: Math.max(theme.material.minTarget, Number.isFinite(creditHeight) ? creditHeight : 0),
          gap: theme.space.sm, markerSize: theme.material.minTarget,
        });
        // GL JS adds fit padding to the transform's persistent padding. Store
        // this viewport once; adding it again can leave no usable phone height.
        map.setPadding(padding);
        map.fitBounds([[target.bounds[0], target.bounds[1]], [target.bounds[2], target.bounds[3]]], { ...options, padding: 0, maxZoom: target.maxZoom });
      }
    }
  }, []);
  useImperativeHandle(ref, () => ({
    setCamera: value => apply({ kind: 'camera', value }),
    fitCoordinates: (coordinates, options = {}) => apply({ kind: 'fit', coordinates, options }),
    getCamera: async () => { const map = mapRef.current; return alive.current && styleReady.current && map ? cameraOf(map) : null; },
    project: async coordinate => {
      const map = mapRef.current, value = toLngLat(coordinate);
      if (!alive.current || !styleReady.current || !map || !value) return null;
      try { const point = map.project(value); return Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null; } catch { return null; }
    },
    unproject: async point => {
      const map = mapRef.current;
      if (!alive.current || !styleReady.current || !map || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      try { const value = map.unproject([point.x, point.y]); return fromLngLat([value.lng, value.lat]); } catch { return null; }
    },
  }), [apply]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    alive.current = true;
    tracker.current!.beginStyle(latest.current.online);
    let canceled = false, creating = false, cleanup: (() => void) | undefined;
    async function mount() {
      if (!canRenderWebGL2()) { tracker.current!.fail({ state: 'unsupported', reason: 'webgl2' }); return; }
      const module = await import('maplibre-gl');
      if (canceled || !element) return;
      const worker = mapWorkerUrl(window.location.origin, Constants.expoConfig?.experiments?.baseUrl ?? '');
      if (!worker) { tracker.current!.fail({ state: 'error', reason: 'renderer' }); return; }
      module.setWorkerUrl(worker);
      const start = initial.current;
      const map = new module.Map({
        container: element, style: latestStyle.current, attributionControl: false,
        ...(start ? { center: toLngLat(start.center)!, zoom: start.zoom, bearing: start.bearing, pitch: start.pitch } : {}),
        minZoom: 0, maxZoom: 22, renderWorldCopies: false, touchPitch: latest.current.mode !== 'glance',
        locale: latest.current.locale === 'th' ? { 'AttributionControl.ToggleAttribution': mapCopy.th.attribution } : undefined,
      });
      mapRef.current = map;
      const attribution = new module.AttributionControl({ compact: false });
      map.addControl(attribution, 'bottom-left');
      const credits = element.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
      if (!credits) { map.remove(); mapRef.current = null; throw new Error('MAP_ATTRIBUTION_UNAVAILABLE'); }
      credits.setAttribute('aria-label', mapCopy[latest.current.locale].attribution);
      const positionCredits = () => {
        const insets = safeInsets(latest.current.contentInsets), area = credits.parentElement;
        if (area) { area.style.bottom = `${insets.bottom + 8}px`; area.style.left = `${insets.left + 8}px`; area.style.maxWidth = `calc(100% - ${insets.left + insets.right + 16}px)`; }
      };
      positionCredits(); map.setPadding(safeInsets(latest.current.contentInsets));
      let longPress: ReturnType<typeof setTimeout> | null = null, origin: { x: number; y: number } | null = null, suppressClickUntil = 0;
      let marker:import('maplibre-gl').Marker|null=null, dragTicket:PinDragTicket|null=null;
      const syncDragMarker = () => {
        marker?.remove(); marker=null; dragTicket=null;
        const current=latest.current, pin=current.pins.find(value=>value.id===current.selectedPinId), coordinate=pin&&toLngLat(pin.coordinate);
        if(!alive.current || mapRef.current!==map || !styleReady.current || current.mode!=='edit' || !current.onMovePin || !pin || !coordinate)return;
        const target=document.createElement('div'); target.className='ride-map-drag-pin';
        target.setAttribute('role','button'); target.tabIndex=0; target.setAttribute('aria-label',pin.label);
        target.style.setProperty('--pin-fill',theme[current.theme].ink); target.style.setProperty('--pin-ink',theme[current.theme].bg); target.style.setProperty('--pin-accent',theme[current.theme].accent);
        const number=document.createElement('span'); number.textContent=String(pin.order); target.append(number);
        target.addEventListener('click',event=>{event.stopPropagation();if(latest.current.mode==='edit')latest.current.onSelectPin?.(pin.id);});
        const created=new module.Marker({element:target,draggable:true,anchor:'center'}).setLngLat(coordinate).addTo(map); marker=created;
        created.on('dragstart',()=>{cancelLongPress();dragTicket=startPinDrag({...latest.current,alive:alive.current,ready:styleReady.current,epoch:epoch.current},pin.id);});
        created.on('dragend',()=>{
          const ticket=dragTicket;dragTicket=null;suppressClickUntil=Date.now()+500;
          const moved=created.getLngLat(), coordinate=fromLngLat([moved.lng,moved.lat]);
          const result=coordinate&&marker===created?finishPinDrag(ticket,{...latest.current,alive:alive.current,ready:styleReady.current,epoch:epoch.current},coordinate):null;
          if(result)latest.current.onMovePin?.(result.id,result.coordinate);
        });
      };
      updateDragMarker.current=syncDragMarker;
      const cancelLongPress = () => { if (longPress) clearTimeout(longPress); longPress = null; origin = null; };
      const fireLongPress = (point: { x: number; y: number }) => {
        if (latest.current.mode === 'glance' || !latest.current.onLongPress || !styleReady.current) return;
        const coordinate = map.unproject([point.x, point.y]);
        const value = fromLngLat([coordinate.lng, coordinate.lat]);
        if (value) { suppressClickUntil = Date.now() + 500; latest.current.onLongPress(value); }
      };
      const pointerDown = (event: PointerEvent) => {
        cancelLongPress();
        if (!event.isPrimary || event.button !== 0 || event.target !== map.getCanvas() || latest.current.mode === 'glance') return;
        const rectangle = element!.getBoundingClientRect();
        origin = { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
        const point = origin;
        longPress = setTimeout(() => { longPress = null; fireLongPress(point); }, 550);
      };
      const pointerMove = (event: PointerEvent) => {
        if (!origin) return;
        const rectangle = element!.getBoundingClientRect();
        if (Math.hypot(event.clientX - rectangle.left - origin.x, event.clientY - rectangle.top - origin.y) > 8) cancelLongPress();
      };
      const onClick = (event: MapMouseEvent) => {
        if (Date.now() < suppressClickUntil || !styleReady.current) return;
        const targetLayers = [mapIds.pinCircle, mapIds.pinNumber, mapIds.cluster, mapIds.clusterCount, mapIds.peer, mapIds.peerName].filter(id => !!map.getLayer(id));
        const feature = targetLayers.length ? map.queryRenderedFeatures(event.point, { layers: targetLayers })[0] : undefined;
        const properties = feature?.properties ?? {};
        if (feature?.source === mapIds.pins && typeof properties.id === 'string') {
          if (latest.current.pins.some(pin => pin.id === properties.id)) latest.current.onSelectPin?.(properties.id);
          return;
        }
        if (feature?.source === mapIds.peers) {
          if (typeof properties.cluster_id === 'number' && feature.geometry.type === 'Point') {
            const source = map.getSource(mapIds.peers) as GeoJSONSource, generation = epoch.current, version = peerVersion.current;
            const center = fromLngLat(feature.geometry.coordinates);
            void source.getClusterExpansionZoom(properties.cluster_id).then(zoom => {
              if (alive.current && mapRef.current === map && styleReady.current && generation === epoch.current && version === peerVersion.current && source === map.getSource(mapIds.peers) && center) apply({ kind: 'camera', value: { center, zoom } });
            }).catch(() => {});
          } else if (typeof properties.id === 'string' && latest.current.peers.some(peer => peer.id === properties.id)) latest.current.onSelectPeer?.(properties.id);
          return;
        }
        const coordinate = fromLngLat([event.lngLat.lng, event.lngLat.lat]);
        if (coordinate && latest.current.mode !== 'glance') latest.current.onPress?.(coordinate);
      };
      map.on('click', onClick);
      map.on('contextmenu', event => { event.preventDefault(); if (Date.now() >= suppressClickUntil) fireLongPress(event.point); });
      map.on('movestart', event => { cancelLongPress(); if (event.originalEvent) latest.current.onUserGesture?.(); });
      map.on('style.load', () => {
        if (!alive.current || mapRef.current !== map) return;
        ++epoch.current;
        for (const writer of writers.current.values()) writer.dispose(); writers.current.clear();
        styleReady.current = true; tracker.current!.styleLoaded();
        for (const id of sourceIds) {
          if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: latestData.current[id], ...(id === mapIds.peers ? peerClusterOptions : {}), ...(id === mapIds.track ? { lineMetrics: true } : {}) });
          const source = map.getSource(id) as GeoJSONSource;
          writers.current.set(id, new GeoJSONUpdateQueue(async value => {
            await source.setData(value);
            // A slow worker may finish obsolete GPS after an off/expiry boundary.
            // Reveal only the newest authorized object in this renderer epoch.
            if(id===mapIds.peers&&alive.current&&mapRef.current===map&&source===map.getSource(id)&&value===latestData.current[id])showPeers(map,latest.current.peers.length>0);
          }, () => { if (alive.current && source === map.getSource(id)) tracker.current!.tileFailed(); }));
        }
        for (const layer of overlayLayers(latest.current.theme)) if (!map.getLayer(layer.id)) map.addLayer(layer);
        showPeers(map,false);writers.current.get(mapIds.peers)?.update(latestData.current[mapIds.peers]);
        syncDragMarker();
        positionCredits(); credits.setAttribute('aria-label', mapCopy[latest.current.locale].attribution);
        const command = pending.current; pending.current = null;
        if (command) apply(command);
      });
      map.on('idle', () => { if (styleReady.current) tracker.current!.fullyRendered(); });
      map.on('sourcedata', event => { if (event.sourceId === 'openmaptiles' && event.isSourceLoaded) tracker.current!.tilesRecovered(); });
      map.on('error', () => { if (alive.current) tracker.current!.tileFailed(); });
      map.on('webglcontextlost', () => tracker.current!.fail({ state: 'error', reason: 'renderer' }));
      map.on('webglcontextrestored', () => { tracker.current!.beginStyle(latest.current.online); styleReady.current = false; map.setStyle(latestStyle.current, { diff: false }); });
      element!.addEventListener('pointerdown', pointerDown); element!.addEventListener('pointermove', pointerMove);
      element!.addEventListener('pointerup', cancelLongPress); element!.addEventListener('pointercancel', cancelLongPress); element!.addEventListener('pointerleave', cancelLongPress);
      const resize = new ResizeObserver(() => { map.resize(); positionCredits(); }); resize.observe(element!);
      cleanup = () => {
        marker?.remove();marker=null;dragTicket=null;if(updateDragMarker.current===syncDragMarker)updateDragMarker.current=null;
        cancelLongPress(); resize.disconnect();
        element!.removeEventListener('pointerdown', pointerDown); element!.removeEventListener('pointermove', pointerMove);
        element!.removeEventListener('pointerup', cancelLongPress); element!.removeEventListener('pointercancel', cancelLongPress); element!.removeEventListener('pointerleave', cancelLongPress);
        for (const writer of writers.current.values()) writer.dispose(); writers.current.clear();
        mapRef.current = null; map.remove();
      };
    }
    const attempt = () => {
      if (canceled || creating || mapRef.current) return;
      creating = true;
      tracker.current!.beginStyle(latest.current.online);
      void mount().catch(() => { if (!canceled) tracker.current!.fail({ state: 'error', reason: 'renderer' }); }).finally(() => { creating = false; });
    };
    restart.current = attempt;
    attempt();
    return () => { canceled = true; if (restart.current === attempt) restart.current = null; invalidate(); cleanup?.(); };
  }, [apply, invalidate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) { restart.current?.(); return; }
    ++epoch.current; styleReady.current = false;
    for (const writer of writers.current.values()) writer.dispose(); writers.current.clear();
    tracker.current!.beginStyle(latest.current.online);
    map.setStyle(style, { diff: false });
  }, [style, props.retryToken]);
  useEffect(() => { writers.current.get(mapIds.track)?.update(track); }, [track]);
  useEffect(() => { writers.current.get(mapIds.pins)?.update(pins); }, [pins]);
  useEffect(() => { updateDragMarker.current?.(); }, [props.pins,props.selectedPinId,props.mode,props.onMovePin,props.theme,props.locale]);
  useLayoutEffect(()=>{const map=mapRef.current;if(map)showPeers(map,false);},[peers]);
  useEffect(() => { ++peerVersion.current; writers.current.get(mapIds.peers)?.update(peers); }, [peers]);
  useEffect(() => { writers.current.get(mapIds.fix)?.update(fix); }, [fix]);
  useEffect(() => { tracker.current!.setOnline(props.online); }, [props.online]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setPadding(safeInsets(props.contentInsets));
    const area = container.current?.querySelector<HTMLElement>('.maplibregl-ctrl-bottom-left');
    const insets = safeInsets(props.contentInsets);
    if (area) { area.style.bottom = `${insets.bottom + 8}px`; area.style.left = `${insets.left + 8}px`; area.style.maxWidth = `calc(100% - ${insets.left + insets.right + 16}px)`; }
  }, [props.contentInsets]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.mode === 'glance') map.touchPitch.disable(); else map.touchPitch.enable();
  }, [props.mode]);
  return <div ref={container} data-testid="ride-map" data-map-theme={props.theme} aria-label={mapCopy[props.locale].map} role="application"
    className="ride-map-surface" style={{ position: 'absolute', inset: 0, backgroundColor: theme.map[props.theme].background,
      '--map-attribution-bg': theme[props.theme].glassScrim, '--map-attribution-ink': theme.map[props.theme].label,
      '--map-attribution-radius': `${theme.radius.small}px` } as React.CSSProperties} />;
});
