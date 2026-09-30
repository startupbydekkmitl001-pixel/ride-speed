type Subscription = { remove: () => void };
type PowerAPI = {
  read: () => Promise<boolean>;
  subscribe: (listener: (lowPower: boolean) => void) => Subscription;
};

/**
 * SDK 57's web module has no addListener and does not expose low-power reporting.
 * Its documented unsupported value is false; native errors remain unknown.
 */
export function observePowerMode(
  platform: "web" | "native",
  api: PowerAPI,
  onChange: (lowPower: boolean | null) => void,
): { refresh: () => void; remove: () => void } {
  let alive = true;
  let generation = 0;
  let subscription: Subscription | null = null;

  if (platform === "native") {
    try {
      subscription = api.subscribe((lowPower) => {
        if (!alive) return;
        generation++;
        onChange(typeof lowPower === "boolean" ? lowPower : null);
      });
    } catch {
      // An unobservable native power state must never enable ambient playback.
    }
  }

  const refresh = () => {
    if (!alive) return;
    const current = ++generation;
    if (platform === "web") {
      onChange(false);
      return;
    }
    onChange(null);
    if (!subscription) return;
    const publish = (value: boolean | null) => {
      if (alive && current === generation) onChange(value);
    };
    try {
      api.read().then(
        (value) => publish(typeof value === "boolean" ? value : null),
        () => publish(null),
      );
    } catch {
      publish(null);
    }
  };

  refresh();
  return {
    refresh,
    remove: () => {
      if (!alive) return;
      alive = false;
      generation++;
      try {
        subscription?.remove();
      } catch {
        // A native module may already have been disposed during app teardown.
      }
    },
  };
}
