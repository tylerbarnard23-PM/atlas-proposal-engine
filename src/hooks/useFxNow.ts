"use client";

import { useMemo, useSyncExternalStore } from "react";
import { createFxClock } from "@/engines/fxClock";

// The one clock every browser surface evaluates FX freshness and readiness at
// (#26 review), so a rate turning stale at UTC midnight or a confirmation
// expiring updates the notices, readiness and controls together, without any
// workspace change. Returning to the page (focus, or the tab becoming
// visible) catches up at once, since background timers can be delayed.
export const fxClock = createFxClock();

let watchers = 0;
const onReturn = () => {
  if (document.visibilityState !== "hidden") fxClock.refresh();
};

function subscribe(listener: () => void) {
  const unsubscribe = fxClock.subscribe(listener);
  if (++watchers === 1) {
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
  }
  return () => {
    unsubscribe();
    if (--watchers === 0) {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    }
  };
}

export function useFxNow(): Date {
  const ms = useSyncExternalStore(subscribe, fxClock.getSnapshot, fxClock.getSnapshot);
  return useMemo(() => new Date(ms), [ms]);
}
