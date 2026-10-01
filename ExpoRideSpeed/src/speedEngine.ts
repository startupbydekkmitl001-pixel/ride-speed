export type SpeedSample = {
  speedMps: number | null;
  horizontalAccuracyM: number | null;
  timestampMs: number;
  /** Native velocity uncertainty; absent on Expo/web. Never inferred from position accuracy. */
  speedAccuracyMps?: number | null;
};

export type SignalQuality = 'good' | 'weak' | 'noFix';

export type SpeedSnapshot = {
  liveMps: number | null;
  maxMps: number | null;
  quality: SignalQuality;
  horizontalAccuracyM: number | null;
  /** False permits an initial zero placeholder, never a measured zero after signal loss. */
  hasSpeedFix?: boolean;
};

type GoodFix = {
  speedMps: number;
  timestampMs: number;
};

const MAX_FIX_AGE_MS = 3000;
const MAX_FUTURE_SKEW_MS = 500;
const MAX_GOOD_FIX_GAP_MS = 3000;
const GOOD_HORIZONTAL_ACCURACY_M = 20;
const WEAK_HORIZONTAL_ACCURACY_M = 50;
const MAX_PLAUSIBLE_ACCELERATION_MPS2 = 15;
const ACCELERATION_UNCERTAINTY_MARGIN_MPS = 3;
const MAX_SPEED_ACCURACY_MPS = 1;
const STOP_ENTER_MPS = 0.3;
const STOP_EXIT_MPS = 0.55;

/**
 * Conservative speed readout for a session. These thresholds are v1 heuristics
 * and should be calibrated against real rides, especially in obstructed areas.
 */
export class SpeedEngine {
  private lastObservedTimestampMs: number | null = null;
  private previousGoodFix: GoodFix | null = null;
  private recentGoodSpeeds: number[] = [];
  private currentSnapshot: SpeedSnapshot = {
    liveMps: null,
    maxMps: null,
    quality: 'noFix',
    horizontalAccuracyM: null,
    hasSpeedFix: false,
  };

  get snapshot(): SpeedSnapshot {
    return this.currentSnapshot;
  }

  process(sample: SpeedSample, nowMs: number): SpeedSnapshot {
    // Old readouts must expire even when the only new fix is stale or cached.
    this.tick(nowMs);

    const ageMs = nowMs - sample.timestampMs;
    if (
      !Number.isFinite(nowMs) ||
      !Number.isFinite(sample.timestampMs) ||
      ageMs < -MAX_FUTURE_SKEW_MS ||
      ageMs > MAX_FIX_AGE_MS ||
      (this.lastObservedTimestampMs !== null &&
        sample.timestampMs <= this.lastObservedTimestampMs)
    ) {
      return this.currentSnapshot;
    }
    this.lastObservedTimestampMs = sample.timestampMs;

    const speedMps = sample.speedMps;
    const horizontalAccuracyM = sample.horizontalAccuracyM;
    if (
      horizontalAccuracyM === null ||
      !Number.isFinite(horizontalAccuracyM) ||
      horizontalAccuracyM < 0
    ) {
      return this.markUnavailable();
    }

    const uncertainty = sample.speedAccuracyMps;
    const hasUncertainty = uncertainty !== undefined && uncertainty !== null;
    const invalidUncertainty = hasUncertainty && (!Number.isFinite(uncertainty) || uncertainty < 0 || uncertainty > MAX_SPEED_ACCURACY_MPS);
    if (speedMps === null || !Number.isFinite(speedMps) || speedMps < 0 || invalidUncertainty) {
      // A usable position fix can coexist with an unavailable speed. Keep
      // its accuracy visible, but withhold the speed and any max candidate.
      this.clearConfirmationWindow();
      this.currentSnapshot = {
        ...this.currentSnapshot,
        liveMps: null,
        maxMps: this.currentSnapshot.maxMps,
        quality:
          horizontalAccuracyM <= WEAK_HORIZONTAL_ACCURACY_M ? 'weak' : 'noFix',
        horizontalAccuracyM,
      };
      return this.currentSnapshot;
    }

    const quality: SignalQuality =
      horizontalAccuracyM <= GOOD_HORIZONTAL_ACCURACY_M
        ? 'good'
        : horizontalAccuracyM <= WEAK_HORIZONTAL_ACCURACY_M
          ? 'weak'
          : 'noFix';
    if (quality !== 'good') {
      this.clearConfirmationWindow();
      this.currentSnapshot = {
        ...this.currentSnapshot,
        liveMps: null,
        maxMps: this.currentSnapshot.maxMps,
        quality,
        horizontalAccuracyM,
      };
      return this.currentSnapshot;
    }

    if (this.previousGoodFix !== null) {
      const intervalMs = sample.timestampMs - this.previousGoodFix.timestampMs;
      if (intervalMs <= 0 || intervalMs > MAX_GOOD_FIX_GAP_MS) {
        this.clearConfirmationWindow();
      } else {
        const changeMps = Math.abs(speedMps - this.previousGoodFix.speedMps);
        const allowedChangeMps =
          (MAX_PLAUSIBLE_ACCELERATION_MPS2 * intervalMs) / 1000 +
          ACCELERATION_UNCERTAINTY_MARGIN_MPS;
        if (changeMps > allowedChangeMps) {
          // Report weak even if the reported position accuracy was good:
          // the speed failed the continuity check and must not be displayed.
          this.clearConfirmationWindow();
          this.currentSnapshot = {
            ...this.currentSnapshot,
            liveMps: null,
            maxMps: this.currentSnapshot.maxMps,
            quality: 'weak',
            horizontalAccuracyM,
          };
          return this.currentSnapshot;
        }
      }
    }

    this.recentGoodSpeeds.push(speedMps);
    if (this.recentGoodSpeeds.length > 3) this.recentGoodSpeeds.shift();
    this.previousGoodFix = { speedMps, timestampMs: sample.timestampMs };

    // A precise native velocity needs no three-fix startup delay. The maximum
    // still uses independent confirmation; the UI never becomes evidence.
    let liveMps: number | null = hasUncertainty ? speedMps : null;
    let maxMps = this.currentSnapshot.maxMps;
    if (this.recentGoodSpeeds.length === 3) {
      const sorted = [...this.recentGoodSpeeds].sort((a, b) => a - b);
      if (!hasUncertainty) {
        const [a, b, c] = this.recentGoodSpeeds;
        // Follow a sustained trend without a full sample of median lag. A
        // flat→spike→flat sequence still uses the median, not the latest spike.
        const trending = (a < b && b < c) || (a > b && b > c);
        liveMps = trending ? speedMps : sorted[1];
      }
      // One or two isolated high readings cannot raise this candidate.
      // Short true peaks may also be missed; trust takes precedence in v1.
      const candidate = sorted[0];
      maxMps = Math.max(maxMps ?? candidate, candidate);
    }

    if (liveMps !== null && liveMps <= (this.currentSnapshot.liveMps === 0 ? STOP_EXIT_MPS : STOP_ENTER_MPS)) liveMps = 0;
    this.currentSnapshot = {
      liveMps,
      maxMps,
      quality: 'good',
      horizontalAccuracyM,
      hasSpeedFix: this.currentSnapshot.hasSpeedFix === true || liveMps !== null,
    };
    return this.currentSnapshot;
  }

  tick(nowMs: number): SpeedSnapshot {
    if (
      this.lastObservedTimestampMs !== null &&
      Number.isFinite(nowMs) &&
      nowMs - this.lastObservedTimestampMs > MAX_FIX_AGE_MS
    ) {
      return this.markUnavailable();
    }
    return this.currentSnapshot;
  }

  markUnavailable(): SpeedSnapshot {
    this.clearConfirmationWindow();
    this.currentSnapshot = {
      ...this.currentSnapshot,
      liveMps: null,
      maxMps: this.currentSnapshot.maxMps,
      quality: 'noFix',
      horizontalAccuracyM: null,
    };
    return this.currentSnapshot;
  }

  resetMax(): SpeedSnapshot {
    // The next record must consist entirely of post-reset measurements.
    this.clearConfirmationWindow();
    this.currentSnapshot = {
      ...this.currentSnapshot,
      maxMps: null,
    };
    return this.currentSnapshot;
  }

  resetSession(): SpeedSnapshot {
    this.lastObservedTimestampMs = null;
    this.clearConfirmationWindow();
    this.currentSnapshot = {
      liveMps: null,
      maxMps: null,
      quality: 'noFix',
      horizontalAccuracyM: null,
      hasSpeedFix: false,
    };
    return this.currentSnapshot;
  }

  private clearConfirmationWindow(): void {
    this.previousGoodFix = null;
    this.recentGoodSpeeds = [];
  }
}
