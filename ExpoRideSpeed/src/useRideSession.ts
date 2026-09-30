import * as Location from 'expo-location';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import RideLocation from '../modules/ride-location';
import {
  ExclusiveLocationCapture, RideEvidenceBuffer,
  type RideEvidence, type RideEvidenceSample,
} from '../modules/ride-location/src/sessionSupport';
import { SpeedEngine, type SpeedSnapshot } from './speedEngine';

export type { RideEvidence, RideEvidenceSample } from '../modules/ride-location/src/sessionSupport';
export type CapturedRideEvidence = RideEvidence & { sessionId: string | null };
export type PermissionState = 'ready' | 'requesting' | 'denied' | 'preciseRequired' | 'error';

const BACKGROUND_MESSAGE = 'หยุดการวัดแล้วเมื่อแอปอยู่เบื้องหลังหรือหน้าจอล็อก เปิดแอปแล้วเริ่มใหม่ได้';
const SIGNAL_MESSAGE = 'ยังรับสัญญาณ GPS ไม่ได้ ลองไปยังจุดที่เปิดโล่ง';
const START_MESSAGE = 'เริ่ม GPS ไม่สำเร็จ ตรวจสอบบริการหาตำแหน่งแล้วลองใหม่';
// Match the evidence verifier's native speed uncertainty ceiling (metres/second).
const MAX_NATIVE_SPEED_ACCURACY_MPS = 1;

// Shared across hook remounts: a pending old stop cannot overtake a new start.
const capture = new ExclusiveLocationCapture();
type CaptureHandle = { owner: symbol; removeListeners: () => void };

function appIsBackground(): boolean { return AppState.currentState === 'background'; }
function permissionError(code: unknown): { state: PermissionState; message: string } {
  if (code === 'E_LOCATION_PERMISSION') return { state: 'denied', message: 'อนุญาตตำแหน่งในระหว่างใช้แอป เพื่อเริ่มวัดความเร็ว' };
  if (code === 'E_PRECISE_LOCATION_REQUIRED') return { state: 'preciseRequired', message: 'เปิดตำแหน่งที่ตั้งจริง (Precise Location) ในการตั้งค่า' };
  if (code === 'E_BACKGROUND') return { state: 'ready', message: BACKGROUND_MESSAGE };
  return { state: 'error', message: START_MESSAGE };
}

export function useRideSession(): {
  active: boolean;
  snapshot: SpeedSnapshot;
  permissionState: PermissionState;
  message: string | null;
  nativeSource: boolean;
  sessionId: string | null;
  getEvidence: () => CapturedRideEvidence;
  /** Only a successfully started new capture returns an ID. Failed starts return null. */
  start: () => Promise<string | null>;
  stop: () => void;
  resetMax: () => void;
} {
  const [engine] = useState(() => new SpeedEngine());
  const [evidence] = useState(() => new RideEvidenceBuffer());
  const handleRef = useRef<CaptureHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const sessionIdRef = useRef<string | null>(null);

  const [active, setActive] = useState(false);
  const [snapshot, setSnapshot] = useState<SpeedSnapshot>(() => engine.snapshot);
  const [permissionState, setPermissionState] = useState<PermissionState>('ready');
  const [message, setMessage] = useState<string | null>(null);
  const [nativeSource, setNativeSource] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const releaseProvider = useCallback(() => {
    const handle = handleRef.current;
    handleRef.current = null;
    if (!handle) return;
    handle.removeListeners();
    const stoppedGeneration = generationRef.current;
    void capture.stop(handle.owner).catch(() => {
      // Failed cleanup retains ownership, preventing another overlapping capture.
      if (mountedRef.current && generationRef.current === stoppedGeneration) {
        setPermissionState('error');
        setMessage('หยุด GPS ไม่สำเร็จ ปิดแล้วเปิดแอปใหม่ก่อนเริ่มอีกครั้ง');
      }
    });
  }, []);

  const stopWithMessage = useCallback((nextMessage: string | null) => {
    generationRef.current += 1;
    startingRef.current = false;
    activeRef.current = false;
    releaseProvider();
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Stop/error/background preserve confirmed max and the captured raw evidence.
    const unavailable = engine.markUnavailable();
    if (mountedRef.current) {
      setActive(false);
      setSnapshot(unavailable);
      setPermissionState(current => current === 'requesting' ? 'ready' : current);
      setMessage(nextMessage);
    }
  }, [engine, releaseProvider]);

  useEffect(() => {
    mountedRef.current = true;
    const appStateSubscription = AppState.addEventListener('change', nextState => {
      // An iOS permission prompt can make the app inactive without backgrounding it.
      if (nextState === 'background' && (activeRef.current || startingRef.current || handleRef.current !== null)) {
        stopWithMessage(BACKGROUND_MESSAGE);
      }
    });
    return () => {
      mountedRef.current = false;
      appStateSubscription.remove();
      generationRef.current += 1;
      startingRef.current = false;
      activeRef.current = false;
      releaseProvider();
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [releaseProvider, stopWithMessage]);

  const start = useCallback(async (): Promise<string | null> => {
    if (!mountedRef.current || activeRef.current || startingRef.current) return null;
    const generation = ++generationRef.current;
    const owner = Symbol('ride-capture');
    const isCurrent = () => mountedRef.current && generationRef.current === generation;
    const stillWanted = () => isCurrent() && !appIsBackground();
    startingRef.current = true;
    setPermissionState('requesting');
    setMessage(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!isCurrent()) return null;
      if (!permission.granted) {
        setPermissionState('denied');
        setMessage('อนุญาตตำแหน่งในระหว่างใช้แอป เพื่อเริ่มวัดความเร็ว');
        setSnapshot(engine.markUnavailable());
        return null;
      }
      if (Platform.OS === 'ios' && permission.ios?.accuracy === 'reduced') {
        setPermissionState('preciseRequired');
        setMessage('เปิดตำแหน่งที่ตั้งจริง (Precise Location) ในการตั้งค่า');
        setSnapshot(engine.markUnavailable());
        return null;
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!isCurrent()) return null;
      if (!servicesEnabled) {
        setPermissionState('error');
        setMessage('เปิดบริการหาตำแหน่งในการตั้งค่า เพื่อเริ่มวัดความเร็ว');
        setSnapshot(engine.markUnavailable());
        return null;
      }
      if (appIsBackground()) { stopWithMessage(BACKGROUND_MESSAGE); return null; }

      const native = RideLocation;
      const accept = (sample: RideEvidenceSample) => {
        if (!isCurrent() || !capture.owns(owner) || (!activeRef.current && !startingRef.current)) return;
        if (appIsBackground()) { stopWithMessage(BACKGROUND_MESSAGE); return; }
        evidence.append(sample);
        const invalidNativeSpeed = native !== null
          && (sample.speedAccuracyMps === null || !Number.isFinite(sample.speedAccuracyMps)
            || sample.speedAccuracyMps < 0 || sample.speedAccuracyMps > MAX_NATIVE_SPEED_ACCURACY_MPS);
        const simulated = sample.isSimulatedBySoftware === true || sample.mocked === true;
        // Reject only the display input: retain raw evidence and break confirmation.
        setSnapshot(engine.process({
          speedMps: invalidNativeSpeed || simulated ? null : sample.speedMps,
          horizontalAccuracyM: sample.horizontalAccuracyM,
          timestampMs: sample.timestampMs,
        }, Date.now()));
        setMessage(null);
      };
      const beginEvidence = () => {
        sessionIdRef.current = null;
        setSessionId(null);
        evidence.reset(native !== null);
        setNativeSource(native !== null);
        setSnapshot(engine.resetSession());
      };

      let started: boolean;
      if (native) {
        const listeners: { remove(): void }[] = [];
        let removed = false;
        const removeListeners = () => {
          if (removed) return;
          removed = true;
          listeners.forEach(listener => listener.remove());
        };
        handleRef.current = { owner, removeListeners };
        listeners.push(native.addListener('onSample', sample => accept({ ...sample, mocked: null })));
        listeners.push(native.addListener('onError', error => {
          if (!isCurrent() || !capture.owns(owner)) return;
          if (error.fatal) {
            const failure = permissionError(error.code);
            stopWithMessage(failure.message);
            if (mountedRef.current) setPermissionState(failure.state);
          } else {
            setSnapshot(engine.markUnavailable());
            setMessage(SIGNAL_MESSAGE);
          }
        }));
        started = await capture.start(owner, stillWanted, {
          start: async () => { beginEvidence(); await native.start(); },
          stop: async () => { removeListeners(); await native.stop(); },
        });
      } else {
        // This branch is selected only when the native module is absent.
        let expoSubscription: Location.LocationSubscription | null = null;
        handleRef.current = { owner, removeListeners: () => undefined };
        started = await capture.start(owner, stillWanted, {
          start: async () => {
            beginEvidence();
            expoSubscription = await Location.watchPositionAsync(
              { accuracy: Location.Accuracy.Highest, distanceInterval: 0 },
              location => accept({
                timestampMs: location.timestamp,
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                speedMps: location.coords.speed,
                horizontalAccuracyM: location.coords.accuracy,
                // Expo does not report CLLocation.speedAccuracy: keep it unknown.
                speedAccuracyMps: null,
                isSimulatedBySoftware: null,
                isProducedByAccessory: null,
                mocked: location.mocked ?? null,
              }),
              () => {
                if (!isCurrent() || !capture.owns(owner)) return;
                setSnapshot(engine.markUnavailable());
                setMessage(SIGNAL_MESSAGE);
              },
            );
          },
          stop: async () => { expoSubscription?.remove(); expoSubscription = null; },
        });
      }

      if (!isCurrent()) return null; // Cancelled starts were stopped inside the serialized queue.
      if (!started || appIsBackground()) { stopWithMessage(BACKGROUND_MESSAGE); return null; }
      const newSessionId = randomUUID();
      sessionIdRef.current = newSessionId;
      setSessionId(newSessionId);
      activeRef.current = true;
      setActive(true);
      setPermissionState('ready');
      setMessage(null);
      timerRef.current = setInterval(() => {
        if (isCurrent() && activeRef.current) setSnapshot(engine.tick(Date.now()));
      }, 1000);
      return newSessionId;
    } catch (error) {
      if (isCurrent()) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        const failure = permissionError(code);
        stopWithMessage(failure.message);
        setPermissionState(failure.state);
      }
      return null;
    } finally {
      if (generationRef.current === generation) startingRef.current = false;
    }
  }, [engine, evidence, stopWithMessage]);

  const stop = useCallback(() => stopWithMessage(null), [stopWithMessage]);
  const resetMax = useCallback(() => {
    if (mountedRef.current) setSnapshot(engine.resetMax());
  }, [engine]);
  const getEvidence = useCallback((): CapturedRideEvidence => ({ ...evidence.snapshot(), sessionId: sessionIdRef.current }), [evidence]);

  return { active, snapshot, permissionState, message, nativeSource, sessionId, getEvidence, start, stop, resetMax };
}
