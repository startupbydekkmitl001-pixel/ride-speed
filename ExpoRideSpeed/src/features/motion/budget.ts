export type MotionEligibility = {
  visible: boolean;
  focused: boolean;
  active: boolean;
  motion: boolean;
  /** Unknown power state uses the poster until the first native read completes. */
  lowPower: boolean | null;
};

export function mayAnimate(policy: MotionEligibility): boolean {
  return (
    policy.visible &&
    policy.focused &&
    policy.active &&
    policy.motion &&
    policy.lowPower === false
  );
}

/** FIFO leases shared across the entire app, never more than two ambient videos. */
export class MotionBudget {
  private readonly limit = 2;
  private enabled = false;
  private readonly waiting = new Set<string>();
  private granted = new Set<string>();
  private readonly stops = new Map<string, () => void>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  get activeCount(): number {
    return this.granted.size;
  }

  isGranted(id: string): boolean {
    return this.granted.has(id);
  }

  getSnapshot = (): number => this.revision;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  request(id: string): void {
    this.waiting.add(id);
    this.reconcile();
  }

  release(id: string): void {
    this.waiting.delete(id);
    this.reconcile();
    this.stops.delete(id);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.reconcile();
  }

  attachStop(id: string, stop: () => void): () => void {
    if (!this.isGranted(id)) {
      this.stopSafely(stop);
      return () => {};
    }
    this.stops.set(id, stop);
    return () => {
      // A stale cleanup must not remove the next mounted player's callback.
      if (this.stops.get(id) === stop) this.stops.delete(id);
    };
  }

  private stopSafely(stop: (() => void) | undefined): void {
    try {
      stop?.();
    } catch {
      // Native player disposal may precede a policy event during unmount.
    }
  }

  private reconcile(): void {
    const next = new Set(
      this.enabled ? Array.from(this.waiting).slice(0, this.limit) : [],
    );
    const changed =
      next.size !== this.granted.size ||
      Array.from(next).some((id) => !this.granted.has(id));
    if (!changed) return;

    // Pause revoked native players synchronously before transferring a lease.
    for (const id of this.granted) {
      if (!next.has(id)) {
        this.stopSafely(this.stops.get(id));
        this.stops.delete(id);
      }
    }
    this.granted = next;
    this.revision++;
    for (const listener of this.listeners) listener();
  }
}
