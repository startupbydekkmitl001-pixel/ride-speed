import type { NativeModule } from 'expo';

/** Raw CLLocation values: negative speed/accuracy values remain invalid. */
export type NativeLocationSample = {
  timestampMs: number;
  latitude: number;
  longitude: number;
  speedMps: number;
  horizontalAccuracyM: number;
  speedAccuracyMps: number;
  /** Null means Core Location did not provide source information. */
  isSimulatedBySoftware: boolean | null;
  isProducedByAccessory: boolean | null;
};

export type RideLocationError = {
  code: 'E_LOCATION_PERMISSION' | 'E_PRECISE_LOCATION_REQUIRED' | 'E_BACKGROUND' | 'E_LOCATION_UNAVAILABLE';
  message: string;
  /** True means native capture has stopped; an explicit new start is required. */
  fatal: boolean;
};

export type RideLocationEvents = {
  onSample: (sample: NativeLocationSample) => void;
  onError: (error: RideLocationError) => void;
};

export declare class RideLocationNativeModule extends NativeModule<RideLocationEvents> {
  /** Call only after the existing Expo foreground permission request succeeds. */
  start(): Promise<void>;
  /** Idempotent; stops the manager and discards callbacks from that manager. */
  stop(): Promise<void>;
}
