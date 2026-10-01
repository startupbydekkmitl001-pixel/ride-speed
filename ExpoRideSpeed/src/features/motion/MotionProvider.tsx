import * as Battery from "expo-battery";
import { useFocusEffect } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState as NativeAppState, Platform } from "react-native";
import { useApp } from "../../state/AppState";
import { mayAnimate, MotionBudget } from "./budget";
import { observePowerMode } from "./powerMode";

type MotionContext = {
  budget: MotionBudget;
  active: boolean;
  motion: boolean;
  lowPower: boolean | null;
  generation: number;
  isCurrentPolicy: (generation: number) => boolean;
};

const Context = createContext<MotionContext | null>(null);

/** Mount once inside AppProvider; all ambient materials share this budget. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const { motion } = useApp();
  const [budget] = useState(() => new MotionBudget());
  const [active, setActive] = useState(
    NativeAppState.currentState === "active",
  );
  const [lowPower, setLowPower] = useState<boolean | null>(null);
  const [generation, setGeneration] = useState(0);
  const currentGeneration = useRef(0);
  const isCurrentPolicy = useCallback(
    (candidate: number) =>
      candidate === currentGeneration.current &&
      NativeAppState.currentState === "active",
    [],
  );

  useEffect(() => {
    const invalidatePolicy = () => ++currentGeneration.current;
    const advancePolicy = () => {
      setGeneration(invalidatePolicy());
    };
    const power = observePowerMode(
      Platform.OS === "web" ? "web" : "native",
      {
        read: () => Battery.isLowPowerModeEnabledAsync(),
        subscribe: (listener) =>
          Battery.addLowPowerModeListener(({ lowPowerMode }) =>
            listener(lowPowerMode),
          ),
      },
      (value) => {
        if (value !== false) budget.setEnabled(false);
        advancePolicy();
        setLowPower(value);
      },
    );
    const app = NativeAppState.addEventListener("change", (state) => {
      const foreground = state === "active";
      // Pause before React's next commit, including the iOS inactive state.
      if (!foreground) budget.setEnabled(false);
      // A complete suspend/resume may be batched into equal final values.
      // The synchronous generation also invalidates an older held render.
      advancePolicy();
      setActive(foreground);
      if (foreground) power.refresh();
    });
    return () => {
      invalidatePolicy();
      budget.setEnabled(false);
      power.remove();
      app.remove();
    };
  }, [budget]);

  useLayoutEffect(() => {
    budget.setEnabled(
      isCurrentPolicy(generation) && motion && active && lowPower === false,
    );
  }, [active, budget, lowPower, motion, generation, isCurrentPolicy]);

  const value = useMemo(
    () => ({ budget, active, motion, lowPower, generation, isCurrentPolicy }),
    [active, budget, lowPower, motion, generation, isCurrentPolicy],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Use in a routed screen/card. Only mount the native player child if canPlay.
 * Bind pause in a layout effect; call playIfAllowed in a passive effect after
 * VideoView attaches its web element. Layout-effect play is dropped on SDK 57 web.
 * List consumers must pass real on-screen visibility, not just tab focus.
 */
export function useMotionPlaybackLease(visible = true) {
  const context = useContext(Context);
  if (!context) throw new Error("MotionProvider is required");
  const { budget, active, motion, lowPower, generation, isCurrentPolicy } = context;
  const id = useId();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        budget.release(id);
        setFocused(false);
      };
    }, [budget, id]),
  );
  const eligible = mayAnimate({ visible, focused, active, motion, lowPower });
  useSyncExternalStore(budget.subscribe, budget.getSnapshot, budget.getSnapshot);

  useLayoutEffect(() => {
    if (eligible) budget.request(id);
    else budget.release(id);
    return () => budget.release(id);
  }, [budget, eligible, id]);

  const registerStop = useCallback(
    (pause: () => void) => {
      if (!isCurrentPolicy(generation)) {
        pause();
        return () => {};
      }
      return budget.attachStop(id, pause);
    },
    [budget, id, generation, isCurrentPolicy],
  );
  const playIfAllowed = useCallback(
    (play: () => void) => {
      // A concurrent policy event can revoke the lease before the player mounts.
      if (isCurrentPolicy(generation) && eligible && budget.isGranted(id)) play();
    },
    [budget, eligible, id, generation, isCurrentPolicy],
  );
  return {
    canPlay: eligible && budget.isGranted(id),
    registerStop,
    playIfAllowed,
  };
}
