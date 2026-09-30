import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { SpeedEngine, type SpeedSnapshot } from './speedEngine';

export type PermissionState =
  | 'ready'
  | 'requesting'
  | 'denied'
  | 'preciseRequired'
  | 'error';

const BACKGROUND_MESSAGE =
  'Session stopped. Expo Go cannot measure speed while the app is locked or in the background.';

function appIsBackground(): boolean {
  return AppState.currentState === 'background';
}

export function useRideSession(): {
  active: boolean;
  snapshot: SpeedSnapshot;
  permissionState: PermissionState;
  message: string | null;
  start: () => Promise<void>;
  stop: () => void;
  resetMax: () => void;
} {
  const [engine] = useState(() => new SpeedEngine());
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const activeRef = useRef(false);
  const mountedRef = useRef(true);

  const [active, setActive] = useState(false);
  const [snapshot, setSnapshot] = useState<SpeedSnapshot>(() => engine.snapshot);
  const [permissionState, setPermissionState] = useState<PermissionState>('ready');
  const [message, setMessage] = useState<string | null>(null);

  const stopWithMessage = useCallback((nextMessage: string | null) => {
    // Invalidates a pending permission request or watchPositionAsync result.
    generationRef.current += 1;
    startingRef.current = false;
    activeRef.current = false;

    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const unavailable = engine.markUnavailable();
    if (mountedRef.current) {
      setActive(false);
      setSnapshot(unavailable);
      setPermissionState((current) =>
        current === 'requesting' ? 'ready' : current
      );
      setMessage(nextMessage);
    }
  }, [engine]);

  useEffect(() => {
    mountedRef.current = true;
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      // iOS can be temporarily inactive while showing its permission prompt.
      if (
        state === 'background' &&
        (activeRef.current || startingRef.current || subscriptionRef.current !== null)
      ) {
        stopWithMessage(BACKGROUND_MESSAGE);
      }
    });

    return () => {
      mountedRef.current = false;
      appStateSubscription.remove();
      generationRef.current += 1;
      startingRef.current = false;
      activeRef.current = false;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [stopWithMessage]);

  const start = useCallback(async () => {
    if (activeRef.current || startingRef.current) return;

    const generation = ++generationRef.current;
    startingRef.current = true;
    setPermissionState('requesting');
    setMessage(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mountedRef.current || generationRef.current !== generation) return;

      if (!permission.granted) {
        setPermissionState('denied');
        setMessage('Allow location access in iPhone Settings to measure speed.');
        setSnapshot(engine.markUnavailable());
        return;
      }

      if (Platform.OS === 'ios' && permission.ios?.accuracy === 'reduced') {
        setPermissionState('preciseRequired');
        setMessage('Turn on Precise Location in iPhone Settings to measure speed.');
        setSnapshot(engine.markUnavailable());
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!mountedRef.current || generationRef.current !== generation) return;
      if (!servicesEnabled) {
        setPermissionState('error');
        setMessage('Turn on Location Services in iPhone Settings to measure speed.');
        setSnapshot(engine.markUnavailable());
        return;
      }

      if (appIsBackground()) {
        stopWithMessage(BACKGROUND_MESSAGE);
        return;
      }

      setSnapshot(engine.resetSession());
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 0 },
        (location) => {
          if (
            !mountedRef.current ||
            generationRef.current !== generation ||
            !activeRef.current
          ) {
            return;
          }

          setSnapshot(
            engine.process(
              {
                speedMps: location.coords.speed,
                horizontalAccuracyM: location.coords.accuracy,
                timestampMs: location.timestamp,
              },
              Date.now()
            )
          );
          setMessage(null);
        },
        () => {
          if (
            !mountedRef.current ||
            generationRef.current !== generation ||
            !activeRef.current
          ) {
            return;
          }
          setSnapshot(engine.markUnavailable());
          setMessage('GPS signal unavailable. Move into open sky and try again.');
        }
      );

      if (!mountedRef.current || generationRef.current !== generation) {
        subscription.remove();
        return;
      }
      if (appIsBackground()) {
        subscription.remove();
        stopWithMessage(BACKGROUND_MESSAGE);
        return;
      }

      subscriptionRef.current = subscription;
      activeRef.current = true;
      setActive(true);
      setPermissionState('ready');
      setMessage(null);

      timerRef.current = setInterval(() => {
        if (
          mountedRef.current &&
          activeRef.current &&
          generationRef.current === generation
        ) {
          setSnapshot(engine.tick(Date.now()));
        }
      }, 1000);
    } catch {
      if (mountedRef.current && generationRef.current === generation) {
        stopWithMessage('Could not start GPS updates. Check Location Services and try again.');
        setPermissionState('error');
      }
    } finally {
      if (generationRef.current === generation) {
        startingRef.current = false;
      }
    }
  }, [engine, stopWithMessage]);

  const stop = useCallback(() => {
    stopWithMessage(null);
  }, [stopWithMessage]);

  const resetMax = useCallback(() => {
    if (mountedRef.current) {
      setSnapshot(engine.resetMax());
    }
  }, [engine]);

  return { active, snapshot, permissionState, message, start, stop, resetMax };
}
